/**
 * Style Critic Agent — evaluates generated content against target style.
 * Produces structured JSON critique that feeds back into the style vector.
 *
 * This is the "Critique" phase of the Critique → Retrain → Regenerate loop.
 */

/* eslint-disable no-console */
import { agentBus, type AgentRole, type ClusterEvent } from './agent-bus';
import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();
const AGENT_ID: AgentRole = 'style_recorder'; // Reuse role — style critic is part of style recorder

// ─── Target Style Type ──────────────────────────────────────

export interface TargetStyle {
  name: string;
  characteristics: string[];
  knownTechniques: string[];
  samplePhrases: string[];
}

// ─── Structured Critique Types ────────────────────────────────

export interface Dimension1Correction {
  /** What feature needs adjustment */
  feature: string;
  /** Current problematic tendency */
  currentTendency: string;
  /** Target characteristic */
  targetCharacteristic: string;
  /** Severity: how strongly this needs correction (0-1) */
  severity: number;
}

export interface Dimension3Shift {
  /** Attention pattern to reduce */
  from: string;
  /** Attention pattern to increase */
  to: string;
  /** Weight adjustment (-1 to 1, negative = reduce, positive = increase) */
  adjustment: number;
}

export interface StructuredCritique {
  /** Overall score (0-100) */
  overallScore: number;

  /** D1 corrections: what writing patterns to adjust */
  d1Corrections: Dimension1Correction[];

  /** D2 deviation: how the output deviated from target style */
  d2Deviations: Array<{
    aspect: string;
    currentValue: number; // -1 to 1, current deviation
    targetValue: number; // -1 to 1, target deviation
    reason: string;
  }>;

  /** D3 attention shifts: what focus to move */
  d3Shifts: Dimension3Shift[];

  /** Natural language summary (for human reading) */
  narrativeSummary: string;

  /** Top 3 actionable improvements, ranked by impact */
  topImprovements: string[];

  /** Whether a regenerate is recommended */
  shouldRegenerate: boolean;
}

// ─── Critique Prompt Template ─────────────────────────────────

const CRITIQUE_SYSTEM_PROMPT = `你是风格批评家——你的任务是评价一篇文章是否成功模仿了目标风格。

评价维度：
1. 语言质地：用词、句式、节奏是否贴近目标风格
2. 思想深度：是否有目标作者特有的观察世界的方式
3. 结构逻辑：整体结构是否符合目标作者的叙事习惯
4. 精神气质：是否把握了目标作者的"眼"而不只是"笔"

输出严格的JSON格式，包含以下字段：
{
  "overallScore": 0-100的整数,
  "d1Corrections": [
    {
      "feature": "具体的写作特征（如sentence_length, adjective_density, metaphor_style等）",
      "currentTendency": "当前作品中的不良倾向",
      "targetCharacteristic": "目标风格应有的特征",
      "severity": 0-1的小数，表示修正紧急程度
    }
  ],
  "d2Deviations": [
    {
      "aspect": "偏差维度名称",
      "currentValue": 当前偏离程度(-1到1),
      "targetValue": 目标偏离程度(-1到1),
      "reason": "简短理由"
    }
  ],
  "d3Shifts": [
    {
      "from": "当前过度关注的方面",
      "to": "应该转而关注的方面",
      "adjustment": 调整幅度(-1到1)
    }
  ],
  "narrativeSummary": "一段100字以内的自然语言评价",
  "topImprovements": ["改进1", "改进2", "改进3"],
  "shouldRegenerate": true/false
}`;

// ─── Style Critic Agent ──────────────────────────────────────

class StyleCriticAgent {
  constructor() {
    agentBus.registerAgent(AGENT_ID, this);
    agentBus.on('writing_session_ended', this.onWritingEnded.bind(this));
    agentBus.on('activation_requested', this.onActivationRequested.bind(this));
    console.log('[StyleCriticAgent] Registered on Agent Bus');
  }

  /**
   * Evaluate a generated text against a target style.
   * Returns structured critique for feedback training.
   */
  async critique(
    generatedText: string,
    targetStyle: TargetStyle,
    externalFeedback?: string, // Optional human critique to incorporate
  ): Promise<StructuredCritique> {
    const llm = getLLM();

    const styleDesc = [
      `目标作者：${targetStyle.name}`,
      `风格特征：${targetStyle.characteristics.join('、')}`,
      `常用手法：${targetStyle.knownTechniques.join('、')}`,
    ].join('\n');

    const prompt = `【目标风格】
${styleDesc}

【待评价文章】
${generatedText.slice(0, 5000)}

${externalFeedback ? `【外部评价（需纳入考量）】\n${externalFeedback}\n` : ''}

请按照系统提示中的JSON格式，对这篇文章进行结构化风格评价。输出纯JSON，不要含其他文字。`;

    try {
      const response = await llm.completeWithRetry({
        systemPrompt: CRITIQUE_SYSTEM_PROMPT,
        prompt,
        responseFormat: 'json',
        temperature: 0.3,
        maxTokens: 1500,
      });

      if (response.json) {
        return response.json as StructuredCritique;
      }
    } catch (err) {
      console.error('[StyleCriticAgent] Critique failed:', err);
    }

    // Fallback critique
    return {
      overallScore: 70,
      d1Corrections: [],
      d2Deviations: [],
      d3Shifts: [],
      narrativeSummary: '评价生成失败，使用默认分数。',
      topImprovements: ['请重新生成评价'],
      shouldRegenerate: false,
    };
  }

  // ── Event Handlers ──────────────────────────────────────

  private onWritingEnded(event: ClusterEvent): void {
    // Auto-trigger critique after writing completes
    const generatedText = event.payload.generatedText as string | undefined;
    const targetStyle = event.payload.targetStyle as TargetStyle | undefined;

    if (generatedText && targetStyle) {
      // Request activation for critique
      agentBus.requestActivation({
        targetAgent: AGENT_ID,
        reason: 'writing completed — critique needed',
        priority: 'high',
        context: { generatedText, targetStyle },
        requestedBy: AGENT_ID,
        timestamp: Date.now(),
        ttl: 120000,
      });
    }
  }

  private onActivationRequested(_event: ClusterEvent): void {
    // Auto-grant for critique tasks
    agentBus.activateAgent(AGENT_ID, 120000);
  }
}

export const styleCriticAgent = new StyleCriticAgent();
