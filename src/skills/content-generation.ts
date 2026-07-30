/**
 * Content Generation Skill
 * Generates content for a specific section.
 */

import { LLMClient } from '@/lib/llm-client';

let _llm: LLMClient | null = null;
function getLLM(): LLMClient {
  if (!_llm) _llm = new LLMClient();
  return _llm;
}

export interface GenerationInput {
  sectionTitle: string;
  sectionGoal: string;
  artifactType: string;
  topic: string;
  audience: string;
  tone: string;
  previousContent?: string;
  nextSectionTitle?: string;
}

export interface GenerationOutput {
  content: string;
  notes: string;
}

const GENERATION_PROMPT = `你是专业写作者。根据上下文为指定章节生成内容。

输出JSON:
{
  "content": "生成的正文内容",
  "notes": "简要说明生成思路"
}

规则:
- 紧扣本节目标，不跑题
- 保持指定语气风格
- 考虑读者水平
- 与前后章节自然衔接
- 散文要有画面感和情感
- 议论文要有逻辑和证据
- 小说要有情节推进`;

export async function generateContent(input: GenerationInput): Promise<GenerationOutput> {
  const prompt = `章节: ${input.sectionTitle}
目标: ${input.sectionGoal}
类型: ${input.artifactType}
主题: ${input.topic}
读者: ${input.audience}
语气: ${input.tone}
${input.previousContent ? `前文: ${input.previousContent.slice(-100)}` : ''}
${input.nextSectionTitle ? `下一节: ${input.nextSectionTitle}` : ''}`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: GENERATION_PROMPT,
      prompt,
      temperature: 0.7,
      maxTokens: 2000,
    });
    if (response.json) return response.json as GenerationOutput;
    if (response.text) return { content: response.text, notes: '纯文本生成' };
  } catch {
    /* fall through */
  }

  return { content: `关于「${input.sectionTitle}」的内容生成中...`, notes: 'fallback' };
}
