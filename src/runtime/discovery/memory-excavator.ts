/**
 * Memory Excavator — excavates personal memories and sensory details.
 *
 * Before generating an outline, the system needs CONCRETE MATERIAL:
 * - Key scenes and moments
 * - Sensory details (what did it look/smell/feel like?)
 * - Emotional turning points
 * - Symbolic objects or places
 *
 * Without this, writing becomes generic and hollow.
 */

import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export interface MemoryAsset {
  /** What kind of memory */
  type: 'scene' | 'detail' | 'emotion' | 'symbol' | 'dialogue';
  /** The memory itself */
  content: string;
  /** Why this matters for the work */
  significance: string;
  /** Has the user confirmed this? */
  confirmed: boolean;
}

export interface ExcavationResult {
  /** Excavated memory assets */
  assets: MemoryAsset[];
  /** What we still need to excavate */
  gaps: string[];
  /** The best follow-up question to get more material */
  nextQuestion: string;
  /** Whether we have enough material to start writing */
  hasEnoughMaterial: boolean;
}

const EXCAVATION_PROMPT = `你是创作素材挖掘专家。用户有了一些创作想法，但还缺少具体的、有血有肉的素材。

你的任务:
1. 分析用户已有的素材
2. 找出缺失的关键细节
3. 提出一个能挖掘出最生动素材的问题
4. 判断素材是否足够开始写作

输出JSON:
{
  "assets": [
    {
      "type": "scene|detail|emotion|symbol|dialogue",
      "content": "用户提供的具体素材",
      "significance": "为什么这个素材重要",
      "confirmed": true
    }
  ],
  "gaps": ["缺失的素材类型"],
  "nextQuestion": "能挖掘出最生动素材的问题",
  "hasEnoughMaterial": false
}

规则:
- 文学作品需要感官细节（视觉/听觉/嗅觉/触觉）
- 需要情感转折点
- 需要有象征意义的物品或场景
- 问题应该具体: "第一次走进校门时，你闻到了什么味道？" 比 "还有什么细节？" 好十倍`;

/**
 * Excavate memories and sensory details from user input.
 */
export async function excavateMemories(
  input: string,
  existingAssets: MemoryAsset[] = [],
  context?: string,
): Promise<ExcavationResult> {
  // Guard: don't excavate for academic/intellectual topics
  const intellectualKeywords = [
    '论文',
    '哲学',
    '学术',
    '理论',
    '研究',
    '分析',
    '论证',
    '观点',
    '层面',
    '社会学',
  ];
  if (intellectualKeywords.some((k) => input.includes(k))) {
    return {
      assets: [],
      gaps: [],
      nextQuestion: '',
      hasEnoughMaterial: true, // Don't need personal memories for academic work
    };
  }

  const prompt = `用户素材: "${input}"
已有素材: ${JSON.stringify(existingAssets.slice(0, 5))}
${context ? `创作上下文: ${context}` : ''}
请以JSON格式输出你的素材分析。`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: EXCAVATION_PROMPT,
      prompt,
      responseFormat: 'json',
      temperature: 0.4,
      maxTokens: 1000,
    });
    if (response.json) return response.json as ExcavationResult;
  } catch {
    /* fallback — return safe default below */
  }

  return {
    assets: [],
    gaps: ['需要更多具体细节'],
    nextQuestion: '如果这篇文章只留下一个画面，你希望读者记住哪个瞬间？',
    hasEnoughMaterial: false,
  };
}
