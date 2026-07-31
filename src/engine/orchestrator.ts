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
import { createBeliefState, getBeliefContext, type BeliefState } from '@/runtime/belief-revision';
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
  generateSocraticPrompts,
  shouldTriggerSocratic,
} from '@/runtime/discovery/socratic-engine';

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
    // Step 1: Extract creative assets (metaphors, decisions)
    extractCreativeAssets(input, this.state.creativeMemory);

    // Socratic mode: help user discover ideas when stuck or early in conversation
    if (
      shouldTriggerSocratic(
        input,
        this.state.belief.roundCount,
        this.state.belief.overallConfidence,
      )
    ) {
      const socratic = await generateSocraticPrompts({
        userInput: input,
        currentUnderstanding: getBeliefContext(this.state.belief),
        creativeType: this.state.belief.artifact.value,
        interactionCount: this.state.belief.roundCount,
      });

      if (socratic.prompts.length > 0) {
        const socraticResponse = [
          `💡 ${socratic.analysis}`,
          '',
          ...socratic.prompts.map((p, i) => `${i + 1}. ${p.text}`),
          socratic.unexploredTerritory.length > 0
            ? `\n🔍 尚未探索: ${socratic.unexploredTerritory.join(' | ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');

        this.state.messages.push({ role: 'assistant', content: socraticResponse });
        return socraticResponse;
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

      return consensus.reflection;
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
    if (readiness.canOutline) {
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
      this.writingAgent = null;
      const section = this.state.outline[0];
      return `开始写作！第一节: **${section.title}** — ${section.goal}\n\n输入 /gen 让AI生成内容，或直接输入你的文字。`;
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
  // Writing Phase
  // =========================================================================

  async handleWriting(input: string): Promise<string> {
    if (!this.writingAgent) {
      this.writingAgent = new WritingAgent({
        belief: this.state.belief,
        outline: this.state.outline.map((s) => ({ title: s.title, goal: s.goal })),
        creativeMemory: this.state.creativeMemory,
      });
      return `开始写作！共 ${this.state.outline.length} 节。\n第一节: **${this.state.outline[0].title}**\n\n输入 /gen 生成内容`;
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
