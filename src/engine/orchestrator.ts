/**
 * Sculptor Agent Orchestrator
 *
 * Lightweight coordinator that:
 * 1. Loads prompts from markdown files
 * 2. Routes to skills (intent-understanding, structure-planning, content-generation)
 * 3. Maintains shared Belief State
 * 4. Coordinates the conversation flow
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMClient } from '@/lib/llm-client';
import {
  createBeliefState,
  reviseBelief,
  getBeliefContext,
  addUncertainty,
  recordMisunderstanding,
  type BeliefState,
} from '@/runtime/belief-revision';
import { understandIntent } from '@/skills/intent-understanding';
import { planStructure } from '@/skills/structure-planning';
import { generateContent } from '@/skills/content-generation';

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
}

// =========================================================================
// Orchestrator
// =========================================================================

export class SculptorOrchestrator {
  private state: SessionState;
  private promptsDir: string;

  constructor(initialIdea: string) {
    this.state = {
      belief: createBeliefState(initialIdea),
      outline: [],
      currentSection: 0,
      messages: [],
      phase: 'discovery',
    };
    this.promptsDir = path.join(process.cwd(), 'prompts');
  }

  /** Load a prompt from markdown file */
  private loadPrompt(name: string): string {
    try {
      return fs.readFileSync(path.join(this.promptsDir, `${name}.md`), 'utf-8');
    } catch {
      return ''; // Fallback: use inline prompt
    }
  }

  /** Get conversation history as string */
  private getHistory(): string {
    return this.state.messages
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
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
    // Step 1: Understand intent via skill
    const understanding = await understandIntent({
      userInput: input,
      conversationHistory: this.getHistory(),
      currentBeliefs: {
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
      },
    });

    // Step 2: Revise belief based on LLM understanding
    reviseBelief(
      this.state.belief,
      {
        artifact: understanding.artifactType !== '未知' ? understanding.artifactType : undefined,
        intent: understanding.purpose !== '未知' ? understanding.purpose : undefined,
        topic: understanding.topic,
        audience: understanding.audience !== '未知' ? understanding.audience : undefined,
        tone: understanding.tone !== '未知' ? understanding.tone : undefined,
      },
      `LLM理解: ${understanding.summary}`,
    );

    // Add uncertainties from LLM
    for (const u of understanding.uncertainties || []) {
      addUncertainty(this.state.belief, {
        field: 'direction',
        question: u,
        importance: 0.7,
        asked: false,
      });
    }

    // Record low-confidence understandings
    if (understanding.confidence < 0.25) {
      recordMisunderstanding(
        this.state.belief,
        '低置信度理解',
        understanding.summary,
        '需更多澄清',
      );
    }

    // Step 3: Check if ready for outline FIRST (before LLM reply)
    if (this.state.belief.overallConfidence > 0.65) {
      // Auto-generate outline immediately
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
        '\n\n这个结构可以吗？输入 "确认" 开始写作，或告诉我需要调整的地方。'
      );
    }

    // Step 4: Generate natural response (only if not ready for outline)
    const prompt = this.loadPrompt('orchestrator');
    const response = await getLLM().completeWithRetry({
      systemPrompt: prompt || this.getFallbackDiscoveryPrompt(),
      prompt: `当前理解:
${getBeliefContext(this.state.belief)}

用户说: "${input}"

请用自然的中文回复用户。如果不确定，问一个最有价值的问题。`,
      temperature: 0.7,
      maxTokens: 500,
    });

    return response.text || '我理解了，请继续。';
  }

  private getFallbackDiscoveryPrompt(): string {
    return `你是 Sculptor 创作助手。帮助用户明确创作意图。用自然中文对话，问最有价值的问题。当理解足够清晰时，建议生成大纲。`;
  }

  // =========================================================================
  // Outline Phase
  // =========================================================================

  private async handleOutline(input: string): Promise<string> {
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
