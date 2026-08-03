/**
 * Forbidden Generator — generates a list of words and patterns the user would
 * NEVER use, based on style analysis and the user's actual writing samples.
 *
 * "不做什么"往往比"做什么"更重要。
 */

import { LLMClient } from '@/lib/llm-client';
import type { StyleProfile } from '@/prompts/discovery/style-extraction.prompt';

const getLLM = () => new LLMClient();

export interface ForbiddenList {
  /** Words/phrases the user would never use */
  forbiddenWords: string[];
  /** Structural patterns to avoid (e.g., "首先其次最后") */
  forbiddenStructures: string[];
  /** Tone/emotion patterns to avoid */
  forbiddenTones: string[];
  /** Overall writing principles from negative space */
  negativePrinciples: string[];
}

/**
 * Generate a forbidden list based on:
 * - The user's actual writing style (what they DO use → infer what they DON'T)
 * - Common AI clichés that don't match the user's style
 */
export async function generateForbiddenList(
  userSample: string,
  styleProfile?: StyleProfile | null,
): Promise<ForbiddenList> {
  const llm = getLLM();

  const profileSummary = styleProfile
    ? `语气温度: ${styleProfile.dimensions.temperature.score.toFixed(2)}\n语言层次: ${styleProfile.dimensions.languageRegister.score.toFixed(2)}\n修饰密度: ${styleProfile.dimensions.modifierDensity.score.toFixed(2)}\n批判姿态: ${styleProfile.dimensions.criticalStance.score.toFixed(2)}`
    : '（未进行深度风格分析）';

  const systemPrompt = `你是一个"反向风格分析师"。你的任务不是发现用户用什么，而是推断用户绝对不用什么。

基于用户的真实写作样本，推断用户的禁忌清单。这是"负向约束"——比正面指导更重要。

规则：
1. 如果用户的文字偏口语化、短句 → 禁忌: "赋能、底层逻辑、抓手、闭环"等术语
2. 如果用户从不使用排比句 → 禁忌: 排比结构
3. 如果用户语气克制 → 禁忌: 感叹号、过度抒情
4. 如果用户喜欢留白 → 禁忌: 总结升华式结尾
5. 如果用户不引用名人名言 → 禁忌: "正如XX所说"

输出JSON格式：
{
  "forbiddenWords": ["词1", "词2", "词3", "词4", "词5"],
  "forbiddenStructures": ["结构1", "结构2", "结构3"],
  "forbiddenTones": ["语气禁忌1", "语气禁忌2"],
  "negativePrinciples": ["原则1", "原则2", "原则3"]
}`;

  const prompt = `【用户写作样本】
${userSample.slice(0, 2000)}

【风格分析】
${profileSummary}

请基于以上信息，推断用户的禁忌清单。不要猜测——只推断那些能从文本中合理推断出的禁忌。
输出纯JSON。`;

  try {
    const response = await llm.completeWithRetry({
      systemPrompt,
      prompt,
      responseFormat: 'json',
      temperature: 0.4,
      maxTokens: 600,
    });

    if (response.json) {
      return response.json as ForbiddenList;
    }
  } catch {
    console.error('[ForbiddenGenerator] LLM call failed');
  }

  // Fallback: generic forbidden list
  return {
    forbiddenWords: ['赋能', '底层逻辑', '抓手', '闭环', '颗粒度'],
    forbiddenStructures: ['首先…其次…最后…', '总而言之…', '综上所述…'],
    forbiddenTones: ['过度抒情', '鸡汤式结尾'],
    negativePrinciples: ['不要用你不常用的词', '保持你自己的语气'],
  };
}

/**
 * Merge forbidden list into Creative Memory constraints.
 */
export function applyForbiddenList(
  forbidden: ForbiddenList,
  creativeMemory: { constraints: { forbidden: string[] } },
): void {
  // Add forbidden words
  for (const word of forbidden.forbiddenWords) {
    if (!creativeMemory.constraints.forbidden.includes(word)) {
      creativeMemory.constraints.forbidden.push(word);
    }
  }

  // Add structural constraints as hints
  for (const structure of forbidden.forbiddenStructures) {
    const hint = `避免使用: ${structure}`;
    if (!creativeMemory.constraints.forbidden.includes(hint)) {
      creativeMemory.constraints.forbidden.push(hint);
    }
  }
}

/**
 * Format forbidden list for user display.
 */
export function formatForbiddenList(forbidden: ForbiddenList): string {
  return [
    '🚫 根据你的写作风格，这些你应该不会用:',
    '',
    `禁用词汇: ${forbidden.forbiddenWords.join('、')}`,
    `禁用结构: ${forbidden.forbiddenStructures.join(' | ')}`,
    `语气禁忌: ${forbidden.forbiddenTones.join('、')}`,
    '',
    `原则: ${forbidden.negativePrinciples.join('。')}`,
  ].join('\n');
}
