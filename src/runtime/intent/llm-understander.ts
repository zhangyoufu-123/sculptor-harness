/**
 * LLM Understander — real AI-powered intent understanding.
 *
 * Uses DeepSeek API to truly understand user intent, not keyword matching.
 * Records every understanding in SessionMemory for real-time traceability.
 */

import { LLMClient } from '@/lib/llm-client';
import {
  UNDERSTANDING_SYSTEM_PROMPT,
  UNDERSTANDING_USER_TEMPLATE,
} from '@/prompts/understanding-prompt';
import { SessionMemoryStore } from '@/discovery/session-memory';

// =========================================================================
// LLM Understanding Result
// =========================================================================

export interface LLMUnderstanding {
  artifactType: string;
  artifactConfidence: number;
  topic: string;
  purpose: string;
  summary: string;
}

export interface LLMHypothesis {
  direction: string;
  confidence: number;
  reason: string;
}

export interface LLMNextQuestion {
  text: string;
  reason: string;
  options: string[];
}

export interface LLMUnderstandingResult {
  understanding: LLMUnderstanding;
  hypotheses: LLMHypothesis[];
  unknowns: string[];
  nextQuestion: LLMNextQuestion;
  /** Raw LLM response for debug */
  rawResponse?: string;
  /** Whether the LLM call succeeded */
  llmSuccess: boolean;
}

// =========================================================================
// Fallback (keyword-based, used when LLM is unavailable)
// =========================================================================

function fallbackUnderstanding(input: string): LLMUnderstandingResult {
  const isEssay = input.includes('议论文') || input.includes('文章');
  const isNovel = input.includes('小说') || input.includes('故事');
  const isPaper = input.includes('学术') || (input.includes('论文') && input.includes('研究'));
  const isBiz = input.includes('商业') || input.includes('计划书') || input.includes('BP');
  const isTutorial = input.includes('教程') || input.includes('教学') || input.includes('指南');

  let artifactType = '文章';
  if (isNovel) artifactType = '小说';
  else if (isPaper) artifactType = '学术论文';
  else if (isBiz) artifactType = '商业提案';
  else if (isTutorial) artifactType = '教程';
  else if (isEssay) artifactType = '议论文';

  // Clean topic
  const topic = input
    .replace(/我想写|我想|写一篇|写一个|写一本|帮我|一篇|一个|一本/g, '')
    .replace(/议论文|论文|小说|文章|报告/g, '')
    .trim();

  return {
    understanding: {
      artifactType,
      artifactConfidence: 0.6,
      topic: topic || input,
      purpose: 'unknown',
      summary: `用户想创作一个${artifactType}，主题是: ${topic}`,
    },
    hypotheses: [{ direction: `深入探讨"${topic}"`, confidence: 0.5, reason: '基于主题推断' }],
    unknowns: ['核心观点', '目标读者'],
    nextQuestion: {
      text: `关于"${topic}"，你的核心观点是什么？`,
      reason: '需要确定核心立场',
      options: [],
    },
    llmSuccess: false,
  };
}

// =========================================================================
// Understander
// =========================================================================

const llmClient = new LLMClient();

/**
 * Use LLM to truly understand user intent.
 * Falls back to keyword-based if LLM is unavailable.
 */
export async function understandWithLLM(
  userInput: string,
  conversationHistory?: string,
): Promise<LLMUnderstandingResult> {
  // Build the user prompt
  let userPrompt = UNDERSTANDING_USER_TEMPLATE.replace('{{userInput}}', userInput);
  userPrompt = userPrompt.replace(
    '{{#conversationHistory}}\n之前的对话：\n{{conversationHistory}}\n{{/conversationHistory}}',
    conversationHistory ? `之前的对话：\n${conversationHistory}` : '',
  );

  try {
    const response = await llmClient.completeWithRetry({
      systemPrompt: UNDERSTANDING_SYSTEM_PROMPT,
      prompt: userPrompt,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 1000,
    });

    if (response.json) {
      const result = response.json as LLMUnderstandingResult;
      result.llmSuccess = true;
      result.rawResponse = response.text;

      // Record understanding in session memory
      SessionMemoryStore.addMessage(
        'agent',
        `理解: ${result.understanding.summary} (${Math.round(result.understanding.artifactConfidence * 100)}%)`,
      );
      SessionMemoryStore.addMessage(
        'agent',
        `假设: ${result.hypotheses.map((h) => h.direction).join(' | ')}`,
      );
      SessionMemoryStore.addMessage('agent', `未知: ${result.unknowns.join('、')}`);

      return result;
    }
  } catch {
    // LLM failed — use fallback
  }

  return fallbackUnderstanding(userInput);
}
