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
import { createBeliefState, getBeliefContext, type BeliefState } from '@/runtime/belief-revision';
import { planStructure } from '@/skills/structure-planning';
import { generateContent } from '@/skills/content-generation';
import {
  generateHypotheses,
  type CreativeHypothesis,
} from '@/runtime/discovery/hypothesis-generator';
import { excavateMemories, type MemoryAsset } from '@/runtime/discovery/memory-excavator';
import { assessReadiness } from '@/runtime/discovery/creative-director';
import { reflectConsensus } from '@/runtime/discovery/consensus-engine';
import {
  extractCreativeAssets,
  createCreativeMemory,
  buildWritingContext,
  type CreativeMemory,
} from '@/runtime/creative-memory';

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
  creativeMemory: CreativeMemory;
}

// =========================================================================
// Orchestrator
// =========================================================================

export class SculptorOrchestrator {
  private state: SessionState;

  constructor(initialIdea: string) {
    this.state = {
      belief: createBeliefState(initialIdea),
      outline: [],
      currentSection: 0,
      messages: [],
      phase: 'discovery',
      hypotheses: [],
      memories: [],
      creativeMemory: createCreativeMemory(),
    };
  }

  // =========================================================================
  // Main entry: process user input
  // =========================================================================

  async processInput(userInput: string): Promise<string> {
    this.state.messages.push({ role: 'user', content: userInput });

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
    // Recovery mode: user is confused — backtrack and re-explain
    const confusionSignals = [
      '不理解',
      '不懂',
      '什么意思',
      '怎么变成',
      '不是这样',
      '不对',
      '跑偏',
      '不是讨论',
    ];
    const isConfused = confusionSignals.some((s) => input.includes(s));

    if (isConfused) {
      const recoveryPrompt = `对话出错了。用户说: "${input}"
之前的对话历史:
${this.state.messages
  .slice(-6)
  .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
  .join('\n')}

请:
1. 承认对话跑偏了
2. 回顾用户最初想讨论什么（${this.state.belief.topic.value}）
3. 回到正轨——问一个关于核心议题的问题
不要道歉过度。直接回到正题。`;

      const response = await getLLM().completeWithRetry({
        systemPrompt: '你是创作伙伴。对话跑偏时，承认、回顾、回到正轨。',
        prompt: recoveryPrompt,
        temperature: 0.5,
        maxTokens: 400,
      });
      return (
        response.text ||
        '抱歉跑偏了。让我们回到正题：关于' +
          this.state.belief.topic.value +
          '，你的核心观点是什么？'
      );
    }

    // Step 1: Extract creative assets (metaphors, decisions)
    extractCreativeAssets(input, this.state.creativeMemory);

    // Consensus Reflection: validate shared understanding FIRST
    // Only do this on the first interaction (when no hypotheses exist yet)
    if (this.state.hypotheses.length === 0) {
      const history = this.state.messages
        .slice(-6)
        .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
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

      return consensus.reflection;
    }
    // Existing flow (only for interactions AFTER the first one)
    const history = this.state.messages
      .slice(-8)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    const hypothesisSet = await generateHypotheses(input, history);
    this.state.hypotheses = hypothesisSet.hypotheses;

    // Step 3: Excavate memories — only for narrative/creative works, NOT academic papers
    // Detect conversation mode to prevent excavator from triggering on intellectual topics
    const intellectualSignals = [
      '论文',
      '研究',
      '哲学',
      '理论',
      '分析',
      '讨论',
      '学术',
      '层面',
      '社会学',
      '观点',
      '论证',
    ];
    const creativeSignals = [
      '回忆',
      '小时候',
      '记得',
      '画面',
      '场景',
      '故事',
      '感受',
      '经历',
      '感官',
      '味道',
      '颜色',
    ];

    const isIntellectual = intellectualSignals.some((s) => input.includes(s));
    const isCreative = creativeSignals.some((s) => input.includes(s));
    const isMemoryExcavation = isCreative && !isIntellectual;

    if (isMemoryExcavation && input.length > 30) {
      const excavation = await excavateMemories(
        input,
        this.state.memories,
        `主题: ${this.state.belief.topic.value}`,
      );
      this.state.memories.push(...excavation.assets.filter((a) => a.confirmed));
    }

    // Step 4: Assess creative readiness
    const readiness = assessReadiness(
      this.state.hypotheses,
      this.state.memories,
      this.state.belief.roundCount,
      this.state.creativeMemory.emotionalArc[0]?.feeling,
    );

    // Step 5: If ready for outline, generate it
    if (readiness.canOutline) {
      const outlineResult = await planStructure({
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
        purpose: this.state.belief.intent.value,
        audience: this.state.belief.audience.value,
        tone: this.state.belief.tone.value,
        summary: `${getBeliefContext(this.state.belief)}\n\n${buildWritingContext(this.state.creativeMemory)}`,
      });
      this.state.outline = outlineResult.sections;
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
      prompt: `当前假设:
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

    return response.text || hypothesisSet.bestQuestion || '请继续说说你的想法。';
  }

  // =========================================================================
  // Outline Phase
  // =========================================================================

  private async handleOutline(input: string): Promise<string> {
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

    if (
      input.includes('确认') ||
      input.includes('开始') ||
      input.includes('好') ||
      input === 'ok'
    ) {
      this.state.phase = 'writing';
      this.state.currentSection = 0;
      const section = this.state.outline[0];
      return `开始写作！第一节: **${section.title}** — ${section.goal}\n\n输入 /gen 让AI生成内容，或直接输入你的文字。`;
    }

    // User wants to adjust — regenerate via LLM
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
  // Writing Phase
  // =========================================================================

  async handleWriting(input: string): Promise<string> {
    if (input === '/gen') {
      const section = this.state.outline[this.state.currentSection];
      const prevContent =
        this.state.currentSection > 0
          ? this.state.outline[this.state.currentSection - 1].content?.slice(-100)
          : undefined;
      const nextTitle =
        this.state.currentSection < this.state.outline.length - 1
          ? this.state.outline[this.state.currentSection + 1].title
          : undefined;

      const result = await generateContent({
        sectionTitle: section.title,
        sectionGoal: section.goal,
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
        audience: this.state.belief.audience.value,
        tone: this.state.belief.tone.value,
        previousContent: prevContent,
        nextSectionTitle: nextTitle,
        creativeContext: buildWritingContext(this.state.creativeMemory),
      });

      section.content = result.content;
      return `✍️ **${section.title}**\n\n${result.content}\n\n输入 /done 继续下一节，或直接编辑内容。`;
    }

    if (input === '/done') {
      this.state.currentSection++;
      if (this.state.currentSection >= this.state.outline.length) {
        this.state.phase = 'done';
        return (
          '🎉 全部完成！以下是完整作品：\n\n' +
          this.state.outline.map((s) => `## ${s.title}\n${s.content || ''}`).join('\n\n')
        );
      }
      const next = this.state.outline[this.state.currentSection];
      return `下一节: **${next.title}** — ${next.goal}\n\n输入 /gen 生成内容。`;
    }

    // User is editing — save as content
    const section = this.state.outline[this.state.currentSection];
    section.content = input;
    return `✅ 已保存。继续输入 /done 或 /gen。`;
  }

  /** Get current state for display */
  getState(): SessionState {
    return this.state;
  }
}
