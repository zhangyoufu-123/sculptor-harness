/**
 * Style Critic — detects "averageness" and style deviation in generated content.
 *
 * After the Writer generates content, the Critic checks:
 * 1. Averageness: "Could anyone have written this?"
 * 2. Style deviation: "Does this match the user's fingerprint?"
 * 3. Specific suggestions for improvement
 */

import type { StyleFingerprint } from './style-fingerprint';
import { buildStyleConstraints } from './style-fingerprint';
import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export interface StyleCritique {
  /** Overall style score (0-1, higher = more personalized) */
  overallScore: number;
  /** Averageness detection */
  averageness: {
    score: number; // 0-1, higher = more average/generic
    genericPhrases: string[];
    suggestion: string;
  };
  /** Style deviation from user fingerprint */
  deviation: {
    score: number; // 0-1, higher = more deviation
    deviatedAspects: string[];
    suggestion: string;
  };
  /** Should the content be regenerated? */
  needsRewrite: boolean;
  /** Specific rewrite instructions */
  rewriteInstructions: string;
}

/**
 * Critique generated content against the user's style fingerprint.
 */
export async function critiqueStyle(
  content: string,
  fingerprint: StyleFingerprint,
): Promise<StyleCritique> {
  // Skip if not enough fingerprint data
  if (fingerprint.confidence < 0.3) {
    return {
      overallScore: 0.7,
      averageness: { score: 0.3, genericPhrases: [], suggestion: '' },
      deviation: { score: 0, deviatedAspects: [], suggestion: '' },
      needsRewrite: false,
      rewriteInstructions: '',
    };
  }

  const constraints = buildStyleConstraints(fingerprint);

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: `你是写作风格审查专家。检查文本是否符合用户的个人风格约束。

输出JSON:
{
  "overallScore": 0.0-1.0,
  "averageness": {
    "score": 0.0-1.0,
    "genericPhrases": ["过于通用的表达"],
    "suggestion": "改进建议"
  },
  "deviation": {
    "score": 0.0-1.0,
    "deviatedAspects": ["偏离的方面"],
    "suggestion": "改进建议"
  },
  "needsRewrite": true/false,
  "rewriteInstructions": "如果需要重写，给出具体指令"
}`,
      prompt: `用户风格约束:
${constraints}

待审查文本:
${content.slice(0, 1000)}

请评估这段文本是否符合用户的个人风格。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 500,
    });

    if (response.json) return response.json as StyleCritique;
  } catch {
    /* fallback */
  }

  return {
    overallScore: 0.7,
    averageness: { score: 0.3, genericPhrases: [], suggestion: '' },
    deviation: { score: 0, deviatedAspects: [], suggestion: '' },
    needsRewrite: false,
    rewriteInstructions: '',
  };
}

/**
 * Quick check: is this text too generic?
 * V1: rule-based. V2: LLM-based.
 */
export function detectAverageness(content: string): { isGeneric: boolean; phrases: string[] } {
  const genericPatterns = [
    '时间如流水',
    '光阴似箭',
    '岁月如梭',
    '总而言之',
    '综上所述',
    '不可否认',
    '随着社会的发展',
    '在当今社会',
    '具有重要意义',
    '发挥着重要作用',
    '值得深思',
    '引人深思',
  ];

  const found = genericPatterns.filter((p) => content.includes(p));
  return {
    isGeneric: found.length >= 2,
    phrases: found,
  };
}
