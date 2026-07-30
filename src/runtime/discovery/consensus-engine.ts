/**
 * Consensus Engine — validates the shared understanding between user and AI.
 *
 * Instead of asking "what's missing?", this engine REFLECTS back
 * what it detected from the user's language, so the user can
 * confirm or correct the shared understanding.
 *
 * This is the "共识映射系统" (consensus mapping system) core.
 */

import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export interface ConsensusSignal {
  /** What the AI detected */
  detected: string;
  /** Where in the user's input this was found */
  evidence: string;
  /** The AI's inference from this signal */
  inference: string;
  /** A question to verify this inference */
  verificationQuestion: string;
}

export interface ConsensusReflection {
  /** Signals detected from the user's language */
  signals: ConsensusSignal[];
  /** The AI's current understanding summary */
  understanding: string;
  /** Whether the AI is confident enough in its understanding */
  confidence: number;
  /** The natural language reflection to show the user */
  reflection: string;
}

const CONSENSUS_PROMPT = `你是共识分析专家。你的任务是分析用户的创作想法，并反射回你从中检测到的共识信号。

## 什么是共识信号？
用户的语言中隐含的假设、价值观、隐含读者、创作动机——这些不是用户直接说的，但可以从措辞中推断出来。

## 你的任务
1. 从用户的措辞中检测3-5个共识信号
2. 对每个信号：指出检测到什么、证据在哪里、你的推断、需要验证的问题
3. 生成一段自然的"反射回应"——用对话的方式告诉用户你理解了什么

## 输出格式
{
  "signals": [
    {
      "detected": "用户选择了'科普'而非'分析'或'论证'",
      "evidence": "用户使用了'科普'这个词",
      "inference": "用户假设读者是非专业人士，想降低理解门槛",
      "verificationQuestion": "你希望读者是不具备专业背景的普通人，对吗？"
    }
  ],
  "understanding": "一句话总结你目前的理解",
  "confidence": 0.0-1.0,
  "reflection": "自然的对话式回应，先反射你检测到的信号，再提出你最想验证的那个问题"
}

## 反射回应的写法
- 用"我注意到你用了..."来反射检测到的信号
- 用"我推测..."来表达你的推断
- 用"对吗？"或"还是说..."来邀请用户确认或纠正
- 语气要像创作伙伴在聊天，不是问卷
- 每次只验证1-2个最重要的信号，不要贪多
- 不要问"你的读者是谁""你的目的是什么"这种模板问题`;

/**
 * Analyze user input and generate a consensus reflection.
 * This is the FIRST response the AI should give — not a question,
 * but a reflection that validates the shared understanding.
 */
export async function reflectConsensus(
  input: string,
  conversationHistory?: string,
): Promise<ConsensusReflection> {
  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: CONSENSUS_PROMPT,
      prompt: `用户的创作想法: "${input}"
${conversationHistory ? `对话历史（用于理解上下文，不要重复已经讨论过的内容）:\n${conversationHistory}` : ''}

请以JSON格式输出你的分析。`,
      responseFormat: 'json',
      temperature: 0.4,
      maxTokens: 1000,
    });
    if (response.json) return response.json as ConsensusReflection;
  } catch {
    /* fallback — return a minimal reflection when the LLM is unavailable */
  }

  return {
    signals: [],
    understanding: input,
    confidence: 0.3,
    reflection: `我理解你想写关于"${input.slice(0, 30)}"的内容。能多说说你的想法吗？`,
  };
}
