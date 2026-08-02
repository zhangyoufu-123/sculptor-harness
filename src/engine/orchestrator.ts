/**
 * Sculptor Agent Orchestrator
 *
 * Lightweight coordinator that:
 * 1. Loads prompts from markdown files
 * 2. Routes to skills (intent-understanding, structure-planning, content-generation)
 * 3. Maintains shared Belief State
 * 4. Coordinates the conversation flow
 */

import { LLMClient } from '@/lib/llm-client';
import { WritingAgent } from '@/agent/writing-agent';
import {
  createBeliefState,
  getBeliefContext,
  reviseBelief,
  type BeliefState,
} from '@/runtime/belief-revision';
import { planStructure } from '@/skills/structure-planning';

import {
  generateHypotheses,
  type CreativeHypothesis,
} from '@/runtime/discovery/hypothesis-generator';
import { excavateMemories, type MemoryAsset } from '@/runtime/discovery/memory-excavator';
import { think, displayThinking, type ThinkingTrace } from '@/runtime/discovery/thinking-display';
import {
  buildOutlineIncrement,
  displayIncrementalOutline,
  type OutlineSection as IncOutlineSection,
} from '@/runtime/discovery/incremental-outline';
import { assessReadiness } from '@/runtime/discovery/creative-director';
import { reflectConsensus } from '@/runtime/discovery/consensus-engine';
import {
  generateHierarchicalOutline,
  displayHierarchicalOutline,
  shouldUseHierarchical,
} from '@/runtime/discovery/hierarchical-outline';
import {
  extractCreativeAssets,
  createCreativeMemory,
  buildWritingContext,
  type CreativeMemory,
} from '@/runtime/creative-memory';
import {
  shouldTriggerSocratic,
  detectUserIntent,
  decideClarification,
  generatePerspectiveQuestions,
} from '@/runtime/discovery/socratic-engine';
import { questionTracker } from '@/runtime/discovery/question-tracker';
import {
  detectUnknownGenre,
  discoverGenre,
  generateDynamicQuestions,
  generateDynamicOutline,
} from '@/runtime/rag/dynamic-genre';
import { loadDocument, summarizeDocument } from '@/runtime/import/document-loader';
import {
  extractBlueprint,
  summarizeBlueprint,
  type ExtractedBlueprint,
} from '@/runtime/import/blueprint-extractor';
import {
  analyzeDocument,
  generateRewriteStrategy,
  executeRewrite,
  type DocumentAnalysis,
} from '@/runtime/import/multi-style-rewriter';

let _llm: LLMClient | null = null;
function getLLM(): LLMClient {
  if (!_llm) _llm = new LLMClient();
  return _llm;
}

// =========================================================================
// Belief State (shared across agents)
// =========================================================================

export interface OutlineSection {
  title: string;
  goal: string;
  content?: string;
}

export interface SessionState {
  belief: BeliefState;
  outline: OutlineSection[];
  currentSection: number;
  messages: Array<{ role: string; content: string }>;
  phase: 'discovery' | 'outline' | 'writing' | 'done';
  hypotheses: CreativeHypothesis[];
  memories: MemoryAsset[];
  /** Incremental outline — grows during conversation */
  incOutline: IncOutlineSection[];
  creativeMemory: CreativeMemory;
}

// =========================================================================
// Orchestrator
// =========================================================================

export class SculptorOrchestrator {
  private state: SessionState;
  private writingAgent: WritingAgent | null = null;

  constructor(initialIdea: string) {
    this.state = {
      belief: createBeliefState(initialIdea),
      outline: [],
      currentSection: 0,
      messages: [],
      phase: 'discovery',
      hypotheses: [],
      incOutline: [],
      memories: [],
      creativeMemory: createCreativeMemory(),
    };
  }

  // =========================================================================
  // Main entry: process user input
  // =========================================================================

  async processInput(userInput: string): Promise<string> {
    this.state.messages.push({ role: 'user', content: userInput });

    // Handle /outline command
    if (userInput.startsWith('/outline')) {
      // Handle /outline regenerate — force regeneration
      if (userInput.startsWith('/outline regenerate')) {
        if (shouldUseHierarchical(this.state.belief.artifact.value)) {
          const hierOutline = await generateHierarchicalOutline({
            artifactType: this.state.belief.artifact.value,
            topic: this.state.belief.topic.value,
            purpose: this.state.belief.intent.value,
            audience: this.state.belief.audience.value,
            tone: this.state.belief.tone.value,
            summary: getBeliefContext(this.state.belief),
          });
          this.state.outline = hierOutline.flatList.map((n) => ({
            title: n.title,
            goal: n.goal,
          }));
          this.state.phase = 'outline';
          return (
            displayHierarchicalOutline(hierOutline.root!) +
            '\n\n这个结构可以吗？输入 "确认" 开始写作。'
          );
        }

        const outlineResult = await planStructure({
          artifactType: this.state.belief.artifact.value,
          topic: this.state.belief.topic.value,
          purpose: this.state.belief.intent.value,
          audience: this.state.belief.audience.value,
          tone: this.state.belief.tone.value,
          summary: getBeliefContext(this.state.belief),
        });
        this.state.outline = outlineResult.sections;
        this.state.phase = 'outline';
        return (
          outlineResult.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
          '\n\n输入 "确认" 开始写作，或告诉我需要调整的地方。'
        );
      }

      // Show current outline if it exists, otherwise generate new
      if (this.state.outline.length > 0) {
        const sections =
          this.state.incOutline.length > 0
            ? this.state.incOutline
            : this.state.outline.map((s) => ({
                title: s.title,
                goal: s.goal,
                status: 'confirmed' as const,
                addedAt: '',
              }));

        const status = sections
          .map((s, i) => {
            const icon = s.status === 'confirmed' ? '✅' : s.status === 'proposed' ? '💡' : '⬜';
            return `  ${icon} ${i + 1}. ${s.title} — ${s.goal}`;
          })
          .join('\n');

        return `📐 当前大纲 (${sections.length} 节):\n${status}\n\n输入 /outline regenerate 重新生成\n输入 /edit-section N <修改建议> 修改指定节`;
      }

      // No outline exists — generate new
      // Hierarchical outline for long-form works (novel, 长篇)
      if (shouldUseHierarchical(this.state.belief.artifact.value)) {
        const hierOutline = await generateHierarchicalOutline({
          artifactType: this.state.belief.artifact.value,
          topic: this.state.belief.topic.value,
          purpose: this.state.belief.intent.value,
          audience: this.state.belief.audience.value,
          tone: this.state.belief.tone.value,
          summary: getBeliefContext(this.state.belief),
        });
        this.state.outline = hierOutline.flatList.map((n) => ({
          title: n.title,
          goal: n.goal,
        }));
        this.state.phase = 'outline';
        return (
          displayHierarchicalOutline(hierOutline.root!) +
          '\n\n这个结构可以吗？输入 "确认" 开始写作。'
        );
      }

      const outlineResult = await planStructure({
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
        purpose: this.state.belief.intent.value,
        audience: this.state.belief.audience.value,
        tone: this.state.belief.tone.value,
        summary: getBeliefContext(this.state.belief),
      });
      this.state.outline = outlineResult.sections;
      this.state.phase = 'outline';
      return (
        outlineResult.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
        '\n\n输入 "确认" 开始写作，或告诉我需要调整的地方。'
      );
    }

    // Handle /import command
    if (userInput.startsWith('/import')) {
      const filePath = userInput.replace('/import', '').trim();
      if (!filePath) return '请指定文件路径: /import <文件路径>';

      const doc = loadDocument(filePath);
      if (!doc) return `❌ 无法加载文件: ${filePath}`;

      const summary = summarizeDocument(doc);
      const blueprint = await extractBlueprint(doc);
      const bpSummary = summarizeBlueprint(blueprint);

      // Deep document analysis (Phase 1)
      const analysis = await analyzeDocument(doc.content, blueprint);

      // Store in creative memory as source material
      this.state.creativeMemory.constraints.mustInclude.push(`源文件: ${doc.fileName}`);
      this.state.creativeMemory.keyMessages.push(doc.content.slice(0, 500));

      // Store everything
      (this.state as unknown as Record<string, unknown>).importedBlueprint = blueprint;
      (this.state as unknown as Record<string, unknown>).importedContent = doc.content;
      (this.state as unknown as Record<string, unknown>).docAnalysis = analysis;

      return [
        `✅ 文档已导入并深度分析`,
        ``,
        summary,
        ``,
        bpSummary,
        ``,
        `🔬 深度分析结果:`,
        `  类型: ${analysis.documentType}`,
        `  复杂度: ${analysis.complexity}`,
        `  主题: ${analysis.themes.join('、')}`,
        `  语气: ${analysis.tone}`,
        `  核心论点: ${analysis.coreArguments.slice(0, 3).join('；')}`,
        `  可改进: ${analysis.weaknesses.join('；')}`,
        ``,
        '请告诉我你想怎么改写（例如："写成PPT演讲稿"、"通俗化"、"改成学术论文"），',
        '或者直接输入 /rewrite 让我根据对话上下文自动判断。',
      ].join('\n');
    }

    // Handle /rewrite command — LLM-driven, no style picking
    if (userInput.startsWith('/rewrite')) {
      const userGoal = userInput.replace('/rewrite', '').trim();
      const bp = (this.state as unknown as Record<string, unknown>)
        .importedBlueprint as ExtractedBlueprint;
      const content = (this.state as unknown as Record<string, unknown>).importedContent as string;
      const analysis = (this.state as unknown as Record<string, unknown>)
        .docAnalysis as DocumentAnalysis;

      if (!bp || !content || !analysis) return '请先导入文档: /import <文件路径>';

      // If user didn't specify a goal, try to infer from conversation
      const goal = userGoal || this.state.belief.intent.value || '优化表达并适配更广泛的读者';

      // Phase 2: Generate rewrite strategy
      const strategy = await generateRewriteStrategy(analysis, goal, bp);

      // Phase 3: Execute rewrite
      const result = await executeRewrite(bp, content, strategy);

      // Store result for later use
      (this.state as unknown as Record<string, unknown>).lastRewriteResult = result;

      return [
        `🎯 改写策略（LLM自动生成）`,
        `  格式: ${strategy.outputFormat}`,
        `  读者: ${strategy.targetAudience}`,
        `  语气: ${strategy.tone}`,
        `  角度: ${strategy.angles.join('、')}`,
        ``,
        `📝 改写结果（${result.sections.length}节）`,
        '',
        result.fullOutput.slice(0, 2000) +
          (result.fullOutput.length > 2000 ? '\n\n... (输入 /full 查看完整结果)' : ''),
      ].join('\n');
    }

    // Handle /style — show document analysis
    if (userInput === '/style') {
      const analysis = (this.state as unknown as Record<string, unknown>)
        .docAnalysis as DocumentAnalysis;
      if (!analysis) return '请先导入文档: /import <文件路径>';
      return [
        `🔬 文档深度分析`,
        ``,
        `类型: ${analysis.documentType}`,
        `原读者: ${analysis.originalAudience}`,
        `复杂度: ${analysis.complexity}`,
        `结构: ${analysis.structurePattern}`,
        `语气: ${analysis.tone}`,
        ``,
        `主题:`,
        ...analysis.themes.map((t, i) => `  ${i + 1}. ${t}`),
        ``,
        `写作特点:`,
        ...analysis.stylisticFeatures.map((f, i) => `  ${i + 1}. ${f}`),
        ``,
        `核心论点:`,
        ...analysis.coreArguments.map((a, i) => `  ${i + 1}. ${a}`),
        ``,
        `改进空间:`,
        ...analysis.weaknesses.map((w, i) => `  ${i + 1}. ${w}`),
      ].join('\n');
    }

    switch (this.state.phase) {
      case 'discovery':
        return await this.handleDiscovery(userInput);
      case 'outline':
        return await this.handleOutline(userInput);
      case 'writing':
        return await this.handleWriting(userInput);
      default:
        return '已完成。';
    }
  }

  // =========================================================================
  // Discovery Phase
  // =========================================================================

  private async handleDiscovery(input: string): Promise<string> {
    // Increment interaction count so Socratic trigger and readiness
    // checks have an accurate round number
    this.state.belief.roundCount++;

    // Record user's answer to the last asked question
    const lastQuestion = questionTracker.getContext().history.slice(-1)[0];
    if (lastQuestion && !lastQuestion.answer) {
      questionTracker.recordAnswer(lastQuestion.question, input);
    }

    // Step 1: Extract creative assets (metaphors, decisions)
    extractCreativeAssets(input, this.state.creativeMemory);

    // Dynamic Genre Detection: check for unknown creative types FIRST
    // This must run BEFORE consensus reflection to prevent misclassification
    const unknownGenre = detectUnknownGenre(input);
    if (unknownGenre) {
      const genre = await discoverGenre(input);
      // Update belief with discovered genre info
      reviseBelief(this.state.belief, { artifact: genre.name }, `动态发现类型: ${genre.name}`);
      reviseBelief(this.state.belief, { topic: input }, `主题: ${input}`);

      // Generate targeted questions for this genre
      const questions = generateDynamicQuestions(genre);
      const structure = generateDynamicOutline(genre, input);

      return [
        `🔍 检测到你提到了 **${genre.name}**（${genre.category}）`,
        ``,
        `📖 ${genre.definition}`,
        ``,
        `与以下类型不同: ${genre.distinguishingFeatures.join('、')}`,
        ``,
        `📐 建议结构:`,
        ...structure.map((s, i) => `  ${i + 1}. ${s}`),
        ``,
        `❓ 帮你理清思路:`,
        ...questions.map((q, i) => `  ${i + 1}. ${q}`),
        ``,
        `先聊聊你的具体需求？`,
      ].join('\n');
    }

    // Consensus Reflection: validate shared understanding FIRST
    // Only do this on the first interaction (when no hypotheses exist yet)
    if (this.state.hypotheses.length === 0) {
      const history = this.state.messages
        .slice(-4)
        .map((m) => `${m.role}: ${m.content.slice(0, 80)}`)
        .join('\n');
      const consensus = await reflectConsensus(input, history);
      this.state.hypotheses = [
        {
          interpretation: consensus.understanding,
          confidence: consensus.confidence,
          evidence: consensus.signals.map((s) => s.evidence),
          validationQuestion: consensus.signals[0]?.verificationQuestion || '',
          direction: consensus.understanding,
        },
      ];

      // Record detected signals as hypotheses
      for (const signal of consensus.signals) {
        this.state.belief.artifact.evidence.push(signal.detected);
      }

      // Update belief state with what we learned from consensus reflection
      reviseBelief(
        this.state.belief,
        {
          topic: this.state.belief.topic.value || input,
        },
        `共识反映: ${input.slice(0, 80)}`,
      );

      // Track the question that was asked
      const consensusQuestion = consensus.signals[0]?.verificationQuestion;
      if (consensusQuestion) {
        questionTracker.record({
          question: consensusQuestion,
          category: 'artifact_type',
          askedBy: 'consensus',
        });
      }

      return consensus.reflection;
    }

    // Intent detection: is user exploratory or goal-oriented?
    const intent = detectUserIntent(this.state.messages, this.state.belief.roundCount);

    // If user is goal-oriented and we have enough understanding, suggest outline
    if (intent.mode === 'goal_oriented' && this.state.belief.overallConfidence > 0.5) {
      reviseBelief(
        this.state.belief,
        {
          topic: this.state.belief.topic.value || input,
        },
        `用户说: ${input.slice(0, 80)}`,
      );

      const readyMsg = `方向已经很清晰了！${intent.reasoning}。\n输入 /outline 生成大纲，或继续讨论。`;
      this.state.messages.push({ role: 'assistant', content: readyMsg });
      return readyMsg;
    }

    // UPDATE BELIEF STATE with user input — critical fix
    // Without this, the system never learns from user answers
    reviseBelief(
      this.state.belief,
      {
        topic: this.state.belief.topic.value || input,
      },
      `用户说: ${input.slice(0, 80)}`,
    );

    // Extract artifact type from user input if explicitly stated
    const explicitTypes: Record<string, string> = {
      散文: '散文',
      小说: '小说',
      论文: '学术论文',
      诗: '诗歌',
      教程: '教程',
      博客: '博客',
      公众号: '博客',
      报告: '研究报告',
      演讲稿: '演讲稿',
      剧本: '剧本',
    };
    for (const [keyword, type] of Object.entries(explicitTypes)) {
      if (input.includes(keyword)) {
        reviseBelief(this.state.belief, { artifact: type }, `用户明确提到"${keyword}"`);
        break;
      }
    }

    // Extract audience if explicitly stated
    if (input.includes('莘莘学子') || input.includes('学生')) {
      reviseBelief(this.state.belief, { audience: '学生' }, `用户提到受众`);
    }

    // Skip clarification if we already know enough
    if (
      this.state.belief.overallConfidence > 0.6 &&
      this.state.belief.artifact.confidence > 0.7 &&
      this.state.belief.roundCount >= 3
    ) {
      // Generate outline directly — we have enough information
      const outlineResult = await planStructure({
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
        purpose: this.state.belief.intent.value,
        audience: this.state.belief.audience.value,
        tone: this.state.belief.tone.value,
        summary: getBeliefContext(this.state.belief),
      });
      this.state.outline = outlineResult.sections;
      this.state.phase = 'outline';
      return (
        outlineResult.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
        '\n\n输入 "确认" 开始写作。'
      );
    }

    // Build context from question tracker for smarter follow-ups
    const trackerContext = questionTracker.buildKnownSummary();
    const avoidAsking = questionTracker.buildAvoidList();

    // Smart clarification: use the JSON clarifier pattern from NVIDIA aiq
    if (
      shouldTriggerSocratic(
        input,
        this.state.belief.roundCount,
        this.state.belief.overallConfidence,
      )
    ) {
      const clarification = await decideClarification(
        input,
        getBeliefContext(this.state.belief),
        this.state.belief.roundCount,
      );

      if (clarification.needsClarification && clarification.question) {
        // Don't ask if we've already covered this topic
        if (!questionTracker.hasBeenAsked(clarification.addresses)) {
          questionTracker.record({
            question: clarification.question,
            category: clarification.addresses,
            askedBy: 'clarification',
          });

          // Use perspective-guided questions as options
          const perspectives = await generatePerspectiveQuestions(
            this.state.belief.topic.value,
            this.state.belief.artifact.value,
            questionTracker.buildKnownSummary(),
            questionTracker.buildAvoidList(),
          );
          const filteredPerspectives = perspectives
            .filter((p) => !questionTracker.hasBeenAsked(p.perspective))
            .slice(0, 3);

          const response = [
            `💡 ${clarification.reasoning}`,
            '',
            `❓ ${clarification.question}`,
            '',
            filteredPerspectives.length > 0 ? '📐 换个角度思考:' : '',
            ...filteredPerspectives.map((p) => `  • ${p.perspective}: ${p.question}`),
          ]
            .filter(Boolean)
            .join('\n');

          this.state.messages.push({ role: 'assistant', content: response });
          return response;
        }
      }
    }

    // Let the LLM THINK about what to do next
    // (replaces hardcoded keyword-based mode detection)
    const stateSummary = [
      `主题: ${this.state.belief.topic.value}`,
      `类型: ${this.state.belief.artifact.value}`,
      `交互轮次: ${this.state.belief.roundCount}`,
      `已确认: ${this.state.creativeMemory.decisions.length} 个决策`,
      `对话历史: ${this.state.messages
        .slice(-4)
        .map((m) => `${m.role}: ${m.content.slice(0, 60)}`)
        .join(' | ')}`,
    ].join('\n');

    const thinkingTrace: ThinkingTrace = await think(stateSummary, getLLM());

    // Display thinking in terminal
    displayThinking(thinkingTrace);

    // Route based on LLM's decision
    if (thinkingTrace.action === 'recover') {
      return await this.handleRecovery(input);
    }

    if (thinkingTrace.action === 'excavate_memory') {
      const excavation = await excavateMemories(
        input,
        this.state.memories,
        `主题: ${this.state.belief.topic.value}`,
      );
      this.state.memories.push(...excavation.assets.filter((a) => a.confirmed));
    }
    // Existing flow (only for interactions AFTER the first one)
    const history = this.state.messages
      .slice(-8)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    const hypothesisSet = await generateHypotheses(input, history);
    this.state.hypotheses = hypothesisSet.hypotheses;

    // Step 4: Assess creative readiness
    const readiness = assessReadiness(
      this.state.hypotheses,
      this.state.memories,
      this.state.belief.roundCount,
      this.state.creativeMemory.emotionalArc[0]?.feeling,
    );

    // Build incremental outline (grows with each interaction)
    const conversationSummary = this.state.messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.content.slice(0, 80)}`)
      .join(' | ');

    const incResult = await buildOutlineIncrement(
      conversationSummary,
      this.state.incOutline,
      getBeliefContext(this.state.belief),
    );

    // Update outline sections
    this.state.incOutline = incResult.sections;

    // Step 5: If ready for outline, generate it
    // Only use the readiness fallback when belief-confidence skip did NOT trigger.
    // If belief is already mature (>0.6 overall, >0.7 artifact, >=3 rounds),
    // the skip above would have already generated the outline and returned.
    const beliefAlreadyHandled =
      this.state.belief.overallConfidence > 0.6 &&
      this.state.belief.artifact.confidence > 0.7 &&
      this.state.belief.roundCount >= 3;
    if (readiness.canOutline && !beliefAlreadyHandled) {
      // Hierarchical outline for long-form works (novel, 长篇)
      if (shouldUseHierarchical(this.state.belief.artifact.value)) {
        const hierOutline = await generateHierarchicalOutline({
          artifactType: this.state.belief.artifact.value,
          topic: this.state.belief.topic.value,
          purpose: this.state.belief.intent.value,
          audience: this.state.belief.audience.value,
          tone: this.state.belief.tone.value,
          summary: `${getBeliefContext(this.state.belief)}\n\n${buildWritingContext(this.state.creativeMemory)}`,
        });
        this.state.outline = hierOutline.flatList.map((n) => ({
          title: n.title,
          goal: n.goal,
        }));
        // Update incremental outline too
        this.state.incOutline = hierOutline.flatList.map((n) => ({
          title: n.title,
          goal: n.goal,
          status: 'confirmed' as const,
          addedAt: new Date().toISOString(),
        }));
        this.state.phase = 'outline';
        return (
          displayHierarchicalOutline(hierOutline.root!) +
          '\n\n这个结构可以吗？输入 "确认" 开始写作，或告诉我需要调整的地方。'
        );
      }

      const outlineResult = await planStructure({
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
        purpose: this.state.belief.intent.value,
        audience: this.state.belief.audience.value,
        tone: this.state.belief.tone.value,
        summary: `${getBeliefContext(this.state.belief)}\n\n${buildWritingContext(this.state.creativeMemory)}`,
      });
      this.state.outline = outlineResult.sections;
      // Update incremental outline too
      this.state.incOutline = outlineResult.sections.map((s) => ({
        title: s.title,
        goal: s.goal,
        status: 'confirmed' as const,
        addedAt: new Date().toISOString(),
      }));
      this.state.phase = 'outline';
      return (
        outlineResult.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
        '\n\n这个结构可以吗？输入 "确认" 开始写作，或告诉我需要调整的地方。'
      );
    }

    // Step 6: Not ready — ask the best question based on readiness gaps
    const focusGap =
      readiness.recommendation === 'excavate_material'
        ? '需要更多具体素材和感官细节'
        : readiness.recommendation === 'explore_meaning'
          ? '需要明确核心意义和创作方向'
          : '需要进一步讨论';

    const response = await getLLM().completeWithRetry({
      systemPrompt: '你是创作伙伴。你的任务是与作者共同探索创作意图。',
      prompt: `## 已收集的信息（不要重复询问）
${trackerContext}

## 避免再次询问: ${avoidAsking.join(', ')}

当前假设:
${this.state.hypotheses.map((h, i) => `${i + 1}. ${h.interpretation} (${Math.round(h.confidence * 100)}%)`).join('\n')}

创作素材: ${this.state.memories.length} 条
${this.state.memories
  .slice(0, 3)
  .map((m) => `- ${m.content}`)
  .join('\n')}

完成度: ${Math.round(readiness.overallScore * 100)}%
最大缺口: ${focusGap}

用户说: "${input}"

请用自然中文回复。不要问"你想写什么类型"或"你的读者是谁"。
优先: 挖掘具体素材和感官细节。问最能让用户回忆出画面感的问题。`,
      temperature: 0.7,
      maxTokens: 500,
    });

    let reply = response.text || hypothesisSet.bestQuestion || '请继续说说你的想法。';

    // Show incremental outline if it has content
    if (this.state.incOutline.length > 0) {
      console.log(displayIncrementalOutline(incResult));
    }

    // If outline is complete enough, suggest generating full outline
    if (incResult.completion > 0.7) {
      reply += '\n\n💡 大纲已经比较完整了。输入 /outline 生成完整大纲，或继续讨论。';
    }

    return reply;
  }

  private async handleRecovery(input: string): Promise<string> {
    const recoveryPrompt = `对话出错了。用户说: "${input}"
对话历史: ${this.state.messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
      .join('\n')}
请: 1.承认跑偏 2.回顾核心议题 3.回到正轨。不要道歉过度。`;

    const response = await getLLM().completeWithRetry({
      systemPrompt: '你是创作伙伴。对话跑偏时，承认、回顾、回到正轨。',
      prompt: recoveryPrompt,
      temperature: 0.5,
      maxTokens: 400,
    });
    return response.text || '抱歉，让我们回到正题。';
  }

  // =========================================================================
  // Outline Phase
  // =========================================================================

  private async handleOutline(input: string): Promise<string> {
    // CHECK CONFIRMATION FIRST — before anything else
    if (
      input.includes('确认') ||
      input.includes('开始') ||
      input.includes('好') ||
      input === 'ok' ||
      input === 'OK'
    ) {
      this.state.phase = 'writing';
      this.state.currentSection = 0;
      this.writingAgent = null;
      return [
        `✅ 进入写作阶段`,
        ``,
        `📋 创作概要:`,
        `  类型: ${this.state.belief.artifact.value || '文章'}`,
        `  主题: ${this.state.belief.topic.value}`,
        `  读者: ${this.state.belief.audience.value || '未指定'}`,
        `  语气: ${this.state.belief.tone.value || '未指定'}`,
        ``,
        `📐 大纲 (${this.state.outline.length} 节):`,
        ...this.state.outline.map((s, i) => `  ${i + 1}. ${s.title} — ${s.goal}`),
        ``,
        `输入 /gen 生成内容`,
      ].join('\n');
    }

    // THEN check for dissatisfaction
    if (
      input.includes('不行') ||
      input.includes('不对') ||
      input.includes('重新') ||
      input.includes('再讨论')
    ) {
      const response = await getLLM().completeWithRetry({
        systemPrompt: '你是创作顾问。当用户对大纲不满意时，你先分析原因，再提出方向。',
        prompt: `用户对大纲不满意: "${input}"
当前大纲: ${this.state.outline.map((s, i) => `${i + 1}. ${s.title} — ${s.goal}`).join('\n')}
创作记忆: ${buildWritingContext(this.state.creativeMemory)}
请分析用户可能不满意的原因，提出2-3个更接近用户意图的方向。`,
        temperature: 0.5,
        maxTokens: 500,
      });
      return response.text || '我理解了你的不满意。能告诉我具体哪里不符合你的想法吗？';
    }

    // THEN check section-specific edits
    // Section-specific edit: "/edit-section 2 目标不够具体"
    if (input.startsWith('/edit-section')) {
      const parts = input.replace('/edit-section', '').trim().split(/\s+/);
      const sectionNum = parseInt(parts[0]);
      const suggestion = parts.slice(1).join(' ');

      if (isNaN(sectionNum) || sectionNum < 1 || sectionNum > this.state.outline.length) {
        return `无效的节号。当前共 ${this.state.outline.length} 节，请选择 1-${this.state.outline.length}`;
      }

      const idx = sectionNum - 1;
      const section = this.state.outline[idx];

      // Use LLM to understand and apply the edit
      const response = await getLLM().completeWithRetry({
        systemPrompt:
          '你是大纲编辑助手。根据用户建议修改指定章节的标题或目标。输出JSON: {"title": "新标题", "goal": "新目标"}',
        prompt: `当前章节: 标题="${section.title}", 目标="${section.goal}"\n修改建议: ${suggestion}\n请根据建议修改。如果只改目标，保持原标题。如果只改标题，保持原目标。`,
        responseFormat: 'json',
        temperature: 0.3,
        maxTokens: 300,
      });

      if (response.json) {
        const edit = response.json as { title?: string; goal?: string };
        if (edit.title) section.title = edit.title;
        if (edit.goal) section.goal = edit.goal;
        return `✅ 第${sectionNum}节已更新:\n  标题: ${section.title}\n  目标: ${section.goal}`;
      }

      // Fallback: apply suggestion directly to goal
      section.goal = suggestion;
      return `✅ 第${sectionNum}节目标已更新为: ${suggestion}`;
    }

    // Natural language section edit: "把第2节改成XXX"
    const naturalEditMatch = input.match(
      /第?\s*(\d+)\s*[节章]\s*(?:改成|改为|修改|调整|换成)\s*(.+)/,
    );
    if (naturalEditMatch) {
      const sectionNum = parseInt(naturalEditMatch[1]);
      const suggestion = naturalEditMatch[2].trim();
      return await this.handleSectionEdit(sectionNum, suggestion, true);
    }

    // User wants to adjust — regenerate via LLM
    // Hierarchical outline for long-form works (novel, 长篇)
    if (shouldUseHierarchical(this.state.belief.artifact.value)) {
      const hierOutline = await generateHierarchicalOutline({
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
        purpose: this.state.belief.intent.value,
        audience: this.state.belief.audience.value,
        tone: this.state.belief.tone.value,
        summary: getBeliefContext(this.state.belief) + `\n用户反馈: ${input}`,
      });
      this.state.outline = hierOutline.flatList.map((n) => ({
        title: n.title,
        goal: n.goal,
      }));
      return displayHierarchicalOutline(hierOutline.root!) + '\n\n调整后的层级结构。确认开始写作？';
    }

    const result = await planStructure({
      artifactType: this.state.belief.artifact.value,
      topic: this.state.belief.topic.value,
      purpose: this.state.belief.intent.value,
      audience: this.state.belief.audience.value,
      tone: this.state.belief.tone.value,
      summary: getBeliefContext(this.state.belief) + `\n用户反馈: ${input}`,
    });
    this.state.outline = result.sections;
    return (
      result.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
      '\n\n调整后的结构。确认开始写作？'
    );
  }

  // =========================================================================
  // Section Edit Helper
  // =========================================================================

  private async handleSectionEdit(
    sectionNum: number,
    suggestion: string,
    allowTitleChange: boolean,
  ): Promise<string> {
    if (sectionNum < 1 || sectionNum > this.state.outline.length) {
      return `无效。共 ${this.state.outline.length} 节，选 1-${this.state.outline.length}`;
    }
    const idx = sectionNum - 1;
    const section = this.state.outline[idx];

    const response = await getLLM().completeWithRetry({
      systemPrompt:
        '你是大纲编辑助手。根据用户建议修改指定章节。输出JSON: {"title":"新标题","goal":"新目标"}',
      prompt: `当前: 标题="${section.title}", 目标="${section.goal}"\n建议: ${suggestion}\n修改并输出JSON。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 300,
    });

    if (response.json) {
      const edit = response.json as { title?: string; goal?: string };
      if (edit.title && allowTitleChange) section.title = edit.title;
      if (edit.goal) section.goal = edit.goal;
    } else {
      section.goal = suggestion;
    }

    return `✅ 第${sectionNum}节: ${section.title} — ${section.goal}`;
  }

  // =========================================================================
  // Writing Phase
  // =========================================================================

  async handleWriting(input: string): Promise<string> {
    if (!this.writingAgent) {
      // Build full handoff context from discovery phase
      const handoffContext = [
        `创作类型: ${this.state.belief.artifact.value} (${Math.round(this.state.belief.artifact.confidence * 100)}%)`,
        `核心主题: ${this.state.belief.topic.value}`,
        `目标读者: ${this.state.belief.audience.value}`,
        `创作意图: ${this.state.belief.intent.value}`,
        `语气风格: ${this.state.belief.tone.value}`,
        `整体置信度: ${Math.round(this.state.belief.overallConfidence * 100)}%`,
      ].join('\n');

      const handoffSummary = buildWritingContext(this.state.creativeMemory);

      this.writingAgent = new WritingAgent({
        belief: this.state.belief,
        outline: this.state.outline.map((s) => ({ title: s.title, goal: s.goal })),
        creativeMemory: this.state.creativeMemory,
        conversationContext: handoffContext,
        discoverySummary: handoffSummary,
      });
      // Don't return early — pass the input through to the WritingAgent
      // so material collection can begin immediately.
      const result = await this.writingAgent.handle(input);
      this.state.outline = this.state.outline.map((s, i) => ({
        ...s,
        content: this.writingAgent!.getOutline()[i]?.content || s.content,
      }));
      if (result.phase === 'done') this.state.phase = 'done';
      return (
        `开始写作！共 ${this.state.outline.length} 节。\n` +
        `第一节: **${this.state.outline[0].title}**\n\n` +
        result.response
      );
    }
    const result = await this.writingAgent.handle(input);
    this.state.outline = this.state.outline.map((s, i) => ({
      ...s,
      content: this.writingAgent!.getOutline()[i]?.content || s.content,
    }));
    if (result.phase === 'done') this.state.phase = 'done';
    return result.response;
  }

  /** Get current state for display */
  getState(): SessionState {
    return this.state;
  }
}
