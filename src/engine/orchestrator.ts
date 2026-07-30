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

export interface Belief {
  artifactType: string;
  topic: string;
  purpose: string;
  audience: string;
  tone: string;
  summary: string;
  confidence: number;
  uncertainties: string[];
}

export interface OutlineSection {
  title: string;
  goal: string;
  content?: string;
}

export interface SessionState {
  belief: Belief;
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
      belief: {
        artifactType: '未知',
        topic: initialIdea,
        purpose: '未知',
        audience: '未知',
        tone: '未知',
        summary: '',
        confidence: 0.3,
        uncertainties: [],
      },
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

  /** Get belief summary */
  private getBeliefSummary(): string {
    const b = this.state.belief;
    return `类型: ${b.artifactType} | 主题: ${b.topic} | 目的: ${b.purpose} | 读者: ${b.audience} | 语气: ${b.tone} | 置信度: ${Math.round(b.confidence * 100)}%`;
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
        artifactType: this.state.belief.artifactType,
        topic: this.state.belief.topic,
      },
    });

    // Step 2: Update belief
    if (understanding.artifactType !== '未知') {
      this.state.belief.artifactType = understanding.artifactType;
    }
    if (understanding.topic && understanding.topic !== input) {
      this.state.belief.topic = understanding.topic;
    }
    this.state.belief.purpose = understanding.purpose;
    this.state.belief.audience = understanding.audience;
    this.state.belief.tone = understanding.tone;
    this.state.belief.summary = understanding.summary;
    this.state.belief.confidence = understanding.confidence;
    this.state.belief.uncertainties = understanding.uncertainties || [];

    // Step 3: Generate natural response
    const prompt = this.loadPrompt('orchestrator');
    const response = await getLLM().completeWithRetry({
      systemPrompt: prompt || this.getFallbackDiscoveryPrompt(),
      prompt: `当前理解:
${this.getBeliefSummary()}

不确定点: ${(this.state.belief.uncertainties || []).join('、') || '无'}

用户说: "${input}"

请用自然的中文回复用户。如果理解足够清晰（置信度>70%），建议生成大纲。如果不确定，问一个最有价值的问题。`,
      temperature: 0.7,
      maxTokens: 500,
    });

    const reply = response.text || '我理解了，请继续。';
    this.state.messages.push({ role: 'assistant', content: reply });

    // Check if ready for outline
    if (this.state.belief.confidence > 0.7 && (this.state.belief.uncertainties || []).length <= 1) {
      if (reply.includes('大纲') || reply.includes('结构') || reply.includes('开始写')) {
        // User likely wants to proceed — generate outline automatically
        const outlineResult = await planStructure({
          artifactType: this.state.belief.artifactType,
          topic: this.state.belief.topic,
          purpose: this.state.belief.purpose,
          audience: this.state.belief.audience,
          tone: this.state.belief.tone,
          summary: this.state.belief.summary,
        });
        this.state.outline = outlineResult.sections;
        this.state.phase = 'outline';
        this.state.messages.push({
          role: 'assistant',
          content: `已生成大纲:\n${outlineResult.sections.map((s, i) => `${i + 1}. ${s.title} — ${s.goal}`).join('\n')}`,
        });
        return (
          reply +
          '\n\n' +
          outlineResult.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
          '\n\n这个结构可以吗？输入 "确认" 开始写作，或告诉我需要调整的地方。'
        );
      }
    }

    return reply;
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
      ...this.state.belief,
      summary: this.state.belief.summary + `\n用户反馈: ${input}`,
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
        artifactType: this.state.belief.artifactType,
        topic: this.state.belief.topic,
        audience: this.state.belief.audience,
        tone: this.state.belief.tone,
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
