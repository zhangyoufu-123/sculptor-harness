/**
 * Hypothesis Generator — forms multiple competing interpretations.
 *
 * Instead of asking "what type?", the AI forms hypotheses:
 * "I think you might mean A (40%), or B (30%), or C (30%).
 *  Let me ask to find out which one."
 */

import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export interface CreativeHypothesis {
  /** What the AI thinks the user might want */
  interpretation: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Evidence from user input supporting this */
  evidence: string[];
  /** What question would validate or reject this hypothesis */
  validationQuestion: string;
  /** What creative direction this would lead to */
  direction: string;
}

export interface HypothesisSet {
  /** 2-4 competing hypotheses */
  hypotheses: CreativeHypothesis[];
  /** What's common across ALL hypotheses (things we're fairly sure about) */
  commonGround: string;
  /** The single best question to ask next */
  bestQuestion: string;
  /** Why this question was chosen (information gain reasoning) */
  questionReason: string;
  /** Overall understanding confidence */
  overallConfidence: number;
}

const HYPOTHESIS_PROMPT = `你是创作意图分析专家。用户给了一个模糊的创作想法。

你的任务不是直接问"你想写什么类型"，而是：
1. 生成2-4个对用户意图的不同理解（相互竞争的假设）
2. 找出所有假设的共同点
3. 提出一个能最大程度区分这些假设的问题

输出JSON:
{
  "hypotheses": [
    {
      "interpretation": "用户可能想表达...",
      "confidence": 0.0-1.0,
      "evidence": ["支撑证据1", "证据2"],
      "validationQuestion": "能验证这个假设的问题",
      "direction": "这个方向会导致什么样的作品"
    }
  ],
  "commonGround": "所有假设的共同点",
  "bestQuestion": "最能区分假设的问题",
  "questionReason": "为什么这个问题信息增益最大",
  "overallConfidence": 0.0-1.0
}

规则:
- 假设之间应该互斥，覆盖不同可能性
- 优先探索"意义"层面，而不是"类型"层面
- 问题应该像创作伙伴在聊天，不是问卷
- 不要问"你的读者是谁"这种初级问题`;

/**
 * Generate competing hypotheses from user input.
 */
export async function generateHypotheses(
  input: string,
  conversationContext?: string,
): Promise<HypothesisSet> {
  const prompt = `用户说: "${input}"
${conversationContext ? `对话上下文: ${conversationContext}` : ''}
请以JSON格式输出你的假设分析。`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: HYPOTHESIS_PROMPT,
      prompt,
      responseFormat: 'json',
      temperature: 0.4,
      maxTokens: 1000,
    });
    if (response.json) return response.json as HypothesisSet;
  } catch {
    /* fallback */
  }

  return {
    hypotheses: [
      {
        interpretation: '需要更多信息来理解',
        confidence: 0.3,
        evidence: [],
        validationQuestion: '能详细说说你的想法吗？',
        direction: '未知',
      },
    ],
    commonGround: '用户有一个创作想法',
    bestQuestion: '能详细说说你的想法吗？',
    questionReason: '信息不足',
    overallConfidence: 0.2,
  };
}
