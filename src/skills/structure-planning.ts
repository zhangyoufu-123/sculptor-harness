/**
 * Structure Planning Skill
 * Generates an outline based on creative understanding.
 */

import { LLMClient } from '@/lib/llm-client';

let _llm: LLMClient | null = null;
function getLLM(): LLMClient {
  if (!_llm) _llm = new LLMClient();
  return _llm;
}

export interface StructureInput {
  artifactType: string;
  topic: string;
  purpose: string;
  audience: string;
  tone: string;
  summary: string;
}

export interface Section {
  title: string;
  goal: string;
}

export interface StructureOutput {
  sections: Section[];
  reasoning: string;
}

const STRUCTURE_PROMPT = `你是作品结构设计师。根据创作理解生成大纲。

输出JSON:
{
  "sections": [{"title": "节标题", "goal": "本节目标"}],
  "reasoning": "为什么这样设计结构"
}

规则:
- 散文: 经历→体验→反思→回归 (4节)
- 小说: 开端→发展→转折→高潮→结局 (5节)
- 议论文: 引言→论点1→论点2→反方→结论 (5节)
- 教程: 基础→进阶→实战→总结 (4节)
- 每节标题简洁(2-6字)
- 目标一句话说清本节要完成什么
- 绝不要生成与主题无关的章节`;

export async function planStructure(input: StructureInput): Promise<StructureOutput> {
  const prompt = `创作类型: ${input.artifactType}
主题: ${input.topic}
目的: ${input.purpose}
读者: ${input.audience}
语气: ${input.tone}
理解: ${input.summary}`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: STRUCTURE_PROMPT,
      prompt,
      responseFormat: 'json',
      temperature: 0.3,
    });
    if (response.json) return response.json as StructureOutput;
  } catch {
    /* fall through */
  }

  return {
    sections: [
      { title: '引言', goal: input.topic },
      { title: '主体', goal: '展开论述' },
      { title: '结论', goal: '总结' },
    ],
    reasoning: '默认结构',
  };
}
