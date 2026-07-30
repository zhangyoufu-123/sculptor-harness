/**
 * Intent Understanding Skill
 * Analyzes user input to extract creative intent.
 * Called by the Discovery Agent via the orchestrator.
 */

import { LLMClient } from '@/lib/llm-client';

let _llm: LLMClient | null = null;
function getLLM(): LLMClient {
  if (!_llm) _llm = new LLMClient();
  return _llm;
}

export interface UnderstandingInput {
  userInput: string;
  conversationHistory?: string;
  currentBeliefs?: Record<string, string>;
}

export interface UnderstandingOutput {
  artifactType: string;
  topic: string;
  purpose: string;
  audience: string;
  tone: string;
  summary: string;
  uncertainties: string[];
  confidence: number;
}

const DISCOVERY_PROMPT = `你是一个创作意图理解助手。分析用户输入，提取创作意图。

输出JSON:
{
  "artifactType": "散文/小说/议论文/教程/报告/诗歌/未知",
  "topic": "核心主题",
  "purpose": "创作目的",
  "audience": "目标读者",
  "tone": "语气风格",
  "summary": "一句话总结理解",
  "uncertainties": ["不确定点1", "不确定点2"],
  "confidence": 0.0-1.0
}

规则:
- "议论文"不是"学术论文"，不要因为出现"论文"就判定为学术
- 结合上下文判断，不要被单个关键词误导
- 不知道就写"未知"，不要猜`;

export async function understandIntent(input: UnderstandingInput): Promise<UnderstandingOutput> {
  const prompt = `用户输入: ${input.userInput}
${input.currentBeliefs ? `当前信念: ${JSON.stringify(input.currentBeliefs)}` : ''}
${input.conversationHistory ? `对话历史: ${input.conversationHistory}` : ''}`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: DISCOVERY_PROMPT,
      prompt,
      responseFormat: 'json',
      temperature: 0.3,
    });
    if (response.json) return response.json as UnderstandingOutput;
  } catch {
    /* fall through */
  }

  return {
    artifactType: '未知',
    topic: input.userInput,
    purpose: '未知',
    audience: '未知',
    tone: '未知',
    summary: '',
    uncertainties: [],
    confidence: 0.3,
  };
}
