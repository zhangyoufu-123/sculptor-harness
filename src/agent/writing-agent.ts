import { LLMClient } from '@/lib/llm-client';
import { buildWritingContext, factStore } from '@/runtime/creative-memory';
import { getBeliefContext } from '@/runtime/belief-revision';
import type { BeliefState } from '@/runtime/belief-revision';
import type { CreativeMemory } from '@/runtime/creative-memory';
import type {
  WritingAgentState,
  OutlineSection,
  SectionVersion,
  AssembledContext,
  WritingUncertainty,
  ConfidenceScores,
  ReaderSimulationReport,
  GenerationMetrics,
} from './writing-types';

const getLLM = () => new LLMClient();

export class WritingAgent {
  state: WritingAgentState;
  private llm: LLMClient;

  constructor(config: {
    belief: BeliefState;
    outline: OutlineSection[];
    creativeMemory: CreativeMemory;
  }) {
    this.llm = getLLM();
    const metrics: GenerationMetrics = {
      totalSections: config.outline.length,
      sectionsGenerated: 0,
      totalRevisions: 0,
      clarificationsAsked: 0,
      clarificationsAnswered: 0,
      directEdits: 0,
      conversationalRevisions: 0,
      outlineChanges: 0,
      totalRegenerations: 0,
      startTime: new Date().toISOString(),
      lastActivityTime: new Date().toISOString(),
    };
    this.state = {
      sessionId: `write-${Date.now().toString(36)}`,
      state: 'WRITING_IDLE',
      belief: config.belief,
      outline: config.outline,
      creativeMemory: config.creativeMemory,
      currentSectionIndex: 0,
      totalSections: config.outline.length,
      sectionDrafts: new Map(),
      currentDraft: null,
      feedbackHistory: [],
      revisionHistory: [],
      readerSimulationReport: null,
      generationMetrics: metrics,
    };
  }

  async handle(
    userInput: string,
  ): Promise<{ response: string; phase: 'writing' | 'done'; outlineChanged: boolean }> {
    const input = userInput.trim();
    if (this.detectOutlineChange(input)) {
      this.state.generationMetrics.outlineChanges++;
      return {
        response: await this.handleOutlineChange(input),
        phase: 'writing',
        outlineChanged: true,
      };
    }
    switch (this.state.state) {
      case 'WRITING_IDLE':
        if (input === '/gen')
          return {
            response: await this.startGeneration(),
            phase: 'writing',
            outlineChanged: false,
          };
        return {
          response: `输入 /gen 生成第${this.state.currentSectionIndex + 1}节`,
          phase: 'writing',
          outlineChanged: false,
        };
      case 'GENERATING':
        return { response: '⏳ 生成中...', phase: 'writing', outlineChanged: false };
      case 'AWAITING_CLARIFICATION':
        if (input === '/accept' || input === '/skip') {
          this.state.state = 'PRESENTING';
          return { response: await this.showDraft(), phase: 'writing', outlineChanged: false };
        }
        return {
          response: await this.handleClarificationAnswer(input),
          phase: 'writing',
          outlineChanged: false,
        };
      case 'PRESENTING':
        if (input === '/accept' || input === '/done') return this.completeSection();
        if (input === '/retry')
          return {
            response: await this.startGeneration(),
            phase: 'writing',
            outlineChanged: false,
          };
        if (input.startsWith('/edit'))
          return {
            response: await this.handleDirectEdit(input.replace('/edit', '').trim()),
            phase: 'writing',
            outlineChanged: false,
          };
        return {
          response: await this.handleConversationalRevision(input),
          phase: 'writing',
          outlineChanged: false,
        };
      case 'ALL_COMPLETE':
        if (input === '/polish')
          return {
            response: await this.runReaderSimulation(),
            phase: 'writing',
            outlineChanged: false,
          };
        if (input === '/done')
          return { response: '🎉 创作完成！', phase: 'done', outlineChanged: false };
        return {
          response: '全部完成。输入 /polish 读者模拟 或 /done 结束',
          phase: 'writing',
          outlineChanged: false,
        };
      case 'MID_STREAM_EDIT':
        // After outline change, return to idle so user can continue
        this.state.state = 'WRITING_IDLE';
        return {
          response: '大纲已更新。输入 /gen 继续生成。',
          phase: 'writing',
          outlineChanged: false,
        };
      case 'READER_SIMULATION':
        if (input.startsWith('/fix'))
          return {
            response: await this.applyFixes(input),
            phase: 'writing',
            outlineChanged: false,
          };
        return {
          response: '输入 /fix N 修复建议 /done 完成',
          phase: 'writing',
          outlineChanged: false,
        };
      default:
        return { response: `当前: ${this.state.state}`, phase: 'writing', outlineChanged: false };
    }
  }

  // === Generation ===
  private async startGeneration(): Promise<string> {
    this.state.state = 'GENERATING';
    const idx = this.state.currentSectionIndex;
    const section = this.state.outline[idx];
    const ctx = await this.assembleContext(idx);
    const promptStr = [
      `## 作品: ${this.state.belief.artifact.value} | 主题: ${this.state.belief.topic.value}`,
      `## 读者: ${this.state.belief.audience.value} | 语气: ${this.state.belief.tone.value}`,
      `## 创作约束\n${buildWritingContext(this.state.creativeMemory)}`,
      `## 当前 (第${idx + 1}/${this.state.totalSections}节)\n标题: ${section.title}\n目标: ${section.goal}`,
      ctx.transitions.fromPrevious ? `衔接: ...${ctx.transitions.fromPrevious.slice(-100)}` : '',
      ctx.transitions.toNext ? `下节: ${ctx.transitions.toNext}` : '',
      '请以JSON输出: {"content":"正文","notes":"思路","assumptions":[],"uncertainties":[],"confidenceScores":{overall,factualAccuracy,styleAdherence,goalCoherence,transitionQuality,creativeConstraint,audienceFit}}',
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const resp = await this.llm.completeWithRetry({
        systemPrompt: '你是专业写作者。生成指定章节内容。有不确定的细节在uncertainties中列出。',
        prompt: promptStr,
        responseFormat: 'json',
        temperature: 0.7,
        maxTokens: 2000,
      });
      const r = (resp.json || {}) as Record<string, unknown>;
      const content = (r.content as string) || this.fallbackContent(section);
      const uncertainties = (r.uncertainties as WritingUncertainty[]) || [];
      const version: SectionVersion = {
        id: `v${Date.now().toString(36)}`,
        content,
        notes: (r.notes as string) || '',
        assumptions: (r.assumptions as SectionVersion['assumptions']) || [],
        uncertainties,
        confidenceScores: (r.confidenceScores as ConfidenceScores) || this.defaultConfidence(),
        createdAt: new Date().toISOString(),
        parentId: null,
        revisionTrigger: null,
      };
      let draft = this.state.sectionDrafts.get(idx);
      if (!draft) {
        draft = {
          sectionIndex: idx,
          title: section.title,
          goal: section.goal,
          versions: [],
          activeVersionIndex: -1,
          acceptedVersionIndex: null,
          uncertainties: [],
          clarificationState: 'none',
          transitions: { fromPrevious: null, toNext: null },
          generatedAt: null,
          acceptedAt: null,
        };
        this.state.sectionDrafts.set(idx, draft);
      }
      draft.versions.push(version);
      draft.activeVersionIndex = draft.versions.length - 1;
      this.state.currentDraft = draft;
      if (uncertainties.length > 0) {
        draft.uncertainties = uncertainties.slice(0, 2);
        draft.clarificationState = 'asked';
        this.state.state = 'AWAITING_CLARIFICATION';
        this.state.generationMetrics.clarificationsAsked++;
        return `✍️ ${section.title}\n\n${content}\n\n💭 需要确认:\n${uncertainties
          .slice(0, 2)
          .map(
            (u, i) =>
              `${i + 1}. ${u.question}\n   假设: ${u.assumption} [默认: ${u.suggestedAnswer}]`,
          )
          .join('\n')}\n\n回答或 /accept`;
      }
      this.state.state = 'PRESENTING';
      return `✍️ ${section.title}\n\n${content}\n\n/accept 确认 /edit <修改> /retry`;
    } catch {
      this.state.state = 'WRITING_IDLE';
      return '生成失败，/retry 重试';
    }
  }

  private async handleClarificationAnswer(input: string): Promise<string> {
    const draft = this.state.sectionDrafts.get(this.state.currentSectionIndex);
    if (draft) {
      draft.uncertainties.forEach((u) => {
        u.userAnswer = input;
        u.resolved = true;
        u.answeredAt = new Date().toISOString();
      });
      draft.clarificationState = 'answered';
    }
    this.state.generationMetrics.clarificationsAnswered++;
    return await this.startGeneration();
  }

  // === Dual Editing ===
  private async handleDirectEdit(instruction: string): Promise<string> {
    const draft = this.state.sectionDrafts.get(this.state.currentSectionIndex);
    if (!draft) return '无内容';
    const cur = draft.versions[draft.activeVersionIndex]?.content || '';
    const resp = await this.llm.completeWithRetry({
      systemPrompt: '根据指令修改内容，只输出修改后的版本。',
      prompt: `原文: ${cur}\n指令: ${instruction}`,
      temperature: 0.3,
      maxTokens: 2000,
    });
    const text = resp.text || cur;
    draft.versions.push({
      id: `v${Date.now().toString(36)}`,
      content: text,
      notes: `编辑: ${instruction}`,
      assumptions: [],
      uncertainties: [],
      confidenceScores: this.defaultConfidence(),
      createdAt: new Date().toISOString(),
      parentId: null,
      revisionTrigger: instruction,
    });
    draft.activeVersionIndex = draft.versions.length - 1;
    this.state.generationMetrics.directEdits++;
    this.state.state = 'PRESENTING';
    return `✅ 已修改:\n\n${text}\n\n/accept /edit /retry`;
  }

  private async handleConversationalRevision(feedback: string): Promise<string> {
    const draft = this.state.sectionDrafts.get(this.state.currentSectionIndex);
    if (!draft) return '无内容';
    const cur = draft.versions[draft.activeVersionIndex]?.content || '';
    const resp = await this.llm.completeWithRetry({
      systemPrompt: '根据反馈修改内容，只输出修改后的版本。',
      prompt: `原文: ${cur}\n反馈: ${feedback}`,
      temperature: 0.5,
      maxTokens: 2000,
    });
    const text = resp.text || cur;
    draft.versions.push({
      id: `v${Date.now().toString(36)}`,
      content: text,
      notes: `反馈: ${feedback}`,
      assumptions: [],
      uncertainties: [],
      confidenceScores: this.defaultConfidence(),
      createdAt: new Date().toISOString(),
      parentId: null,
      revisionTrigger: feedback,
    });
    draft.activeVersionIndex = draft.versions.length - 1;
    this.state.generationMetrics.conversationalRevisions++;
    this.state.state = 'PRESENTING';
    return `✅ 已修改:\n\n${text}\n\n/accept /edit /retry`;
  }

  // === Section Completion ===
  private completeSection(): {
    response: string;
    phase: 'writing' | 'done';
    outlineChanged: boolean;
  } {
    const draft = this.state.sectionDrafts.get(this.state.currentSectionIndex);
    if (draft) {
      draft.acceptedVersionIndex = draft.activeVersionIndex;
      this.state.outline[this.state.currentSectionIndex].content =
        draft.versions[draft.activeVersionIndex]?.content;
      this.state.outline[this.state.currentSectionIndex].status = 'done';
    }
    // After saving content, auto-extract facts for cross-section reference
    if (draft && draft.versions[draft.activeVersionIndex]) {
      const content = draft.versions[draft.activeVersionIndex].content;
      // Simple extraction: names, numbers, dates mentioned
      const names = content.match(
        /(?:张三|李四|王五|[A-Z][a-z]+|[^\s]{2,4}(?:老师|教授|先生|女士))/g,
      );
      if (names) {
        for (const name of Array.from(new Set(names)).slice(0, 3)) {
          factStore.record({
            fact: `人物: ${name} 在本节出现`,
            sectionId: String(this.state.currentSectionIndex),
            sectionTitle: this.state.outline[this.state.currentSectionIndex].title,
            category: 'character',
          });
        }
      }
      // Date/number facts
      const dates = content.match(/\d{4}年|\d+万|\d+%/g);
      if (dates) {
        for (const d of Array.from(new Set(dates)).slice(0, 2)) {
          factStore.record({
            fact: `数据: ${d} 在本节中提及`,
            sectionId: String(this.state.currentSectionIndex),
            sectionTitle: this.state.outline[this.state.currentSectionIndex].title,
            category: 'data',
          });
        }
      }
    }
    this.state.generationMetrics.sectionsGenerated++;
    this.state.currentSectionIndex++;
    if (this.state.currentSectionIndex >= this.state.totalSections) {
      this.state.state = 'ALL_COMPLETE';
      return {
        response: `🎉 全部完成！共${this.state.totalSections}节\n输入 /polish 读者模拟 或 /done`,
        phase: 'writing',
        outlineChanged: false,
      };
    }
    this.state.state = 'WRITING_IDLE';
    return {
      response: `✅ 完成。第${this.state.currentSectionIndex + 1}节: ${this.state.outline[this.state.currentSectionIndex].title}\n输入 /gen`,
      phase: 'writing',
      outlineChanged: false,
    };
  }

  // === Reader Simulation ===
  private async runReaderSimulation(): Promise<string> {
    this.state.state = 'READER_SIMULATION';
    const full = this.state.outline.map((s) => `## ${s.title}\n${s.content || ''}`).join('\n\n');
    try {
      const resp = await this.llm.completeWithRetry({
        systemPrompt: `你是${this.state.belief.audience.value}读者代表。评价作品。JSON: {overallImpression, frictionPoints:[{location,sectionIndex,issue,severity,suggestion}]}`,
        prompt: full,
        responseFormat: 'json',
        temperature: 0.3,
        maxTokens: 800,
      });
      const r = (resp.json || {
        overallImpression: '内容完整',
        frictionPoints: [],
      }) as ReaderSimulationReport;
      this.state.readerSimulationReport = r;
      let m = `📖 读者模拟\n\n${r.overallImpression}\n`;
      if (r.frictionPoints?.length) {
        m += `\n卡点:\n${r.frictionPoints
          .slice(0, 3)
          .map((f) => `  - 第${f.sectionIndex + 1}节: ${f.issue}`)
          .join('\n')}\n`;
      }
      return m + '\n输入 /fix 1 修复 /done';
    } catch {
      return '模拟完成。输入 /done 结束';
    }
  }

  private async applyFixes(input: string): Promise<string> {
    const ids = input.replace('/fix', '').trim().split(/\s+/);
    for (const id of ids) {
      const idx = parseInt(id) - 1;
      if (idx >= 0 && idx < this.state.totalSections) {
        const content = this.state.outline[idx].content || '';
        const resp = await this.llm.completeWithRetry({
          systemPrompt: '改进这段内容。',
          prompt: `改进: ${content}`,
          temperature: 0.5,
          maxTokens: 2000,
        });
        if (resp.text && this.state.outline[idx]) this.state.outline[idx].content = resp.text;
      }
    }
    return '✅ 修复完成。/polish 重新模拟 /done';
  }

  // === Outline Changes ===
  private detectOutlineChange(input: string): boolean {
    return /在第?\d.*[节章].*(?:和|与|之间|插入|加)|删除\d|第\d.*改|大纲/.test(input);
  }
  private async handleOutlineChange(input: string): Promise<string> {
    if (input.includes('插入') || input.includes('加')) {
      this.state.outline.splice(this.state.currentSectionIndex + 1, 0, {
        title: '新章节',
        goal: input.slice(0, 50),
      });
      this.state.totalSections++;
      return `✅ 已插入。大纲: ${this.state.outline.map((s, i) => `${i + 1}. ${s.title}`).join(' | ')}\n输入 /gen 继续`;
    }
    return '大纲已更新。/gen 继续';
  }

  // === Helpers ===
  private async assembleContext(idx: number): Promise<AssembledContext> {
    const s = this.state.outline[idx];
    const ctx: AssembledContext = {
      sectionAnchor: { title: s.title, goal: s.goal },
      transitions: {
        fromPrevious: idx > 0 ? this.state.outline[idx - 1].content?.slice(-200) || null : null,
        toNext: idx < this.state.outline.length - 1 ? this.state.outline[idx + 1].goal : null,
      },
      creativeDNA: buildWritingContext(this.state.creativeMemory),
      beliefSnapshot: getBeliefContext(this.state.belief),
      feedback: '',
      previousSections: '',
      difficultyHint: null,
    };
    // Retrieve cross-section facts for consistency
    const factContext = factStore.buildContext(600);
    if (factContext) {
      ctx.creativeDNA += '\n\n' + factContext;
    }
    return ctx;
  }
  private async showDraft(): Promise<string> {
    const d = this.state.sectionDrafts.get(this.state.currentSectionIndex);
    return d?.versions[d.activeVersionIndex]?.content || '无内容';
  }
  private defaultConfidence(): ConfidenceScores {
    return {
      overall: 0.7,
      factualAccuracy: 0.7,
      styleAdherence: 0.7,
      goalCoherence: 0.7,
      transitionQuality: 0.7,
      creativeConstraint: 0.7,
      audienceFit: 0.7,
    };
  }
  private fallbackContent(s: OutlineSection): string {
    return `关于「${s.title}」——${s.goal}`;
  }
  getOutline(): OutlineSection[] {
    return this.state.outline;
  }
  getMetrics(): GenerationMetrics {
    return this.state.generationMetrics;
  }
}
