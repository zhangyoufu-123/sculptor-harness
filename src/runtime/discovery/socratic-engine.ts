/**
 * Socratic Engine — helps users discover and refine creative ideas.
 *
 * Instead of just collecting requirements, this engine actively:
 * 1. Asks counter-questions ("what if the opposite?")
 * 2. Explores alternative angles ("have you considered...?")
 * 3. Surfaces hidden assumptions ("you seem to assume X...")
 * 4. Uses dialectical patterns (thesis → antithesis → synthesis)
 */

import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export type SocraticPattern =
  | 'counter_question' // "what if the opposite were true?"
  | 'alternative_angle' // "have you considered this perspective?"
  | 'surface_assumption' // "you seem to assume X — is that right?"
  | 'deepen_inquiry' // "why is this important to you?"
  | 'lateral_leap' // "what does this remind you of?"
  | 'constraint_challenge'; // "what if you removed this constraint?"

export interface SocraticPrompt {
  /** The question or prompt to show the user */
  text: string;
  /** What Socratic pattern this uses */
  pattern: SocraticPattern;
  /** Why this was chosen */
  rationale: string;
  /** What the user's answer might reveal */
  expectedInsight: string;
}

export interface SocraticResponse {
  /** 2-3 Socratic prompts */
  prompts: SocraticPrompt[];
  /** The engine's analysis of the user's current creative state */
  analysis: string;
  /** What creative territory remains unexplored */
  unexploredTerritory: string[];
}

const SOCRATIC_SYSTEM_PROMPT = `你是苏格拉底式创作导师。你的任务不是收集信息，而是帮助创作者发现他们自己都没意识到的想法。

## 你的方法
1. 反问题: "如果反过来呢？" "如果没有这个限制呢？"
2. 替代视角: "从读者的角度看..." "如果是一个反对者..."
3. 挖掘假设: "你似乎默认了X，这是你想要的吗？"
4. 深挖动机: "为什么这个故事对你重要？" "你希望读者带走什么？"
5. 横向联想: "这让你想起什么？" "有没有类似的经历？"
6. 挑战约束: "如果篇幅不受限呢？" "如果换一个时代背景呢？"

## 输出JSON
{
  "prompts": [
    {"text": "苏格拉底式问题", "pattern": "counter_question|alternative_angle|...", "rationale": "为什么问这个", "expectedInsight": "回答可能揭示什么"}
  ],
  "analysis": "对用户当前创作状态的一句话分析",
  "unexploredTerritory": ["尚未探索的领域1", "领域2"]
}

## 规则
- 每次只提供2-3个提示，不要贪多
- 提示应该让人停下来思考，不是简单回答
- 尊重用户的创作自主权 — 这是启发，不是指导`;

/**
 * Generate Socratic prompts based on the user's creative state.
 * Called during the discovery phase when the user seems stuck or vague.
 */
export async function generateSocraticPrompts(params: {
  userInput: string;
  currentUnderstanding: string;
  creativeType: string;
  interactionCount: number;
}): Promise<SocraticResponse> {
  const prompt = `用户想法: "${params.userInput}"
当前理解: ${params.currentUnderstanding}
创作类型: ${params.creativeType}
交互轮次: ${params.interactionCount}

请生成2-3个苏格拉底式追问，帮助用户深化或重新审视他们的创作想法。以JSON格式输出。`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: SOCRATIC_SYSTEM_PROMPT,
      prompt,
      responseFormat: 'json',
      temperature: 0.6,
      maxTokens: 800,
    });
    if (response.json) return response.json as SocraticResponse;
  } catch {
    /* fallback */
  }

  return {
    prompts: [
      {
        text: '如果反过来，你会怎么写？',
        pattern: 'counter_question',
        rationale: '探索反向视角',
        expectedInsight: '发现被忽略的方向',
      },
      {
        text: '这个想法最打动你的是什么？',
        pattern: 'deepen_inquiry',
        rationale: '挖掘情感核心',
        expectedInsight: '找到真正重要的主题',
      },
      {
        text: '如果没有限制，你理想中的版本是什么样的？',
        pattern: 'constraint_challenge',
        rationale: '释放想象力',
        expectedInsight: '发现隐藏的愿景',
      },
    ],
    analysis: '用户正在探索创作方向',
    unexploredTerritory: ['情感核心', '反向视角', '理想版本'],
  };
}

/**
 * Quick helper: should we trigger Socratic mode?
 * Trigger when: user seems vague, stuck, or has had few interactions.
 */
export function shouldTriggerSocratic(
  userInput: string,
  interactionCount: number,
  confidence: number,
): boolean {
  const vagueSignals = ['不知道', '不确定', '没想好', '随便', '都可以', '不太清楚', '没什么想法'];
  const isVague = vagueSignals.some((s) => userInput.includes(s));
  const isEarly = interactionCount <= 2;
  const isLowConfidence = confidence < 0.5;
  return isVague || isEarly || isLowConfidence;
}
