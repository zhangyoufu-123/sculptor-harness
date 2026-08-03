/**
 * Style Extraction Prompt – Pass 2 of 4-pass pipeline.
 * LLM analyzes text across 14 dimensions, producing structured JSON.
 */

import type { PromptTemplate } from '@/prompts/types';

export const STYLE_EXTRACTION_PROMPT: PromptTemplate = {
  id: 'style-extraction',
  name: 'Style Extraction — 14-dimension analysis',
  version: '1.0.0',
  description:
    'Style Extraction (Pass 2): LLM analyzes a text sample across 14 stylistic dimensions and returns a structured JSON style profile.',
  agentId: 'orchestrator',
  template: `你是文学风格分析师。阅读以下文本样本，从14个维度提取作者的写作风格特征。对每个维度给出0-1的量化评分和简短描述。不确定的维度标注 confidence: low。

【文本样本】
{{sample_text}}

【计算语言学辅助数据】
{{computational_features}}

【14维分析框架】

1. 语气温度 (temperature)
   0=冷峻/抽离/客观, 0.3=克制/含蓄, 0.5=中性/平和, 0.7=温热/有情感流露, 1=热烈/激昂
   → 描述: 文字的温度感如何？是冷眼旁观还是热情投入？

2. 句式偏好 (sentence_preference)
   0=以极短句为主(<15字), 0.3=短句为主, 0.5=长短交错, 0.7=长句为主, 1=以极长句为主(>50字)
   → 描述: 句子的典型长度和节奏感？

3. 修饰密度 (modifier_density)
   0=极少形容词/副词, 0.3=修饰克制, 0.5=适度修饰, 0.7=修饰较多, 1=大量修饰
   → 描述: 文字是"干"的还是"润"的？

4. 语言层次 (language_register)
   0=纯口语/大白话, 0.3=口语为主偶有书面语, 0.5=标准书面语, 0.7=书面语为主偶有文言, 1=文白夹杂/古雅
   → 描述: 语言的文白程度？

5. 情感频谱 (emotional_spectrum)
   列出主要情感类型(讽刺/忧伤/激昂/冷静/幽默/怀旧/愤怒/温情/疏离/...)及强度0-1
   → 描述: 文字传递的主要情感是什么？

6. 叙述视角 (narrative_perspective)
   第一人称/第三人称有限/第三人称全知/第二人称/混合切换
   → 描述: 谁在讲故事？与读者的距离？

7. 意象倾向 (imagery_tendency)
   自然/社会/抽象概念/身体感知/日常物品/历史/光影/声音/...
   各类占比0-1
   → 描述: 作者喜欢用什么类型的意象？

8. 节奏特征 (rhythm)
   0=断裂跳跃, 0.3=紧凑急促, 0.5=自然流动, 0.7=舒缓从容, 1=缓慢凝重
   → 描述: 文字的节奏感？

9. 修辞手法 (rhetorical_devices)
   列出使用的修辞手法及频率(高/中/低):
   比喻/排比/反问/设问/拟人/夸张/对偶/反复/白描/细描/象征/通感/借景抒情/托物言志/反语讽刺/对比/铺垫/伏笔

10. 对话与独白比例 (dialogue_ratio)
    0=完全不写对话, 0.3=偶尔对话, 0.5=对话与叙述均衡, 0.7=以对话为主, 1=几乎全是对话
    → 描述: 作者如何运用对话？

11. 时间处理 (time_handling)
    顺叙/倒叙/插叙/意识流/时间跳跃/静止描写
    → 描述: 作者如何组织时间？

12. 结尾模式 (ending_pattern)
    总结收束/戛然而止(留白)/情感升华/呼应开头(回环)/开放式/警句收尾
    → 描述: 文章通常如何结尾？

13. 批判姿态 (critical_stance)
    0=完全回避批判, 0.3=温和含蓄, 0.5=直面但克制, 0.7=犀利直接, 1=激烈抨击
    → 描述: 作者的批判方式如何？

14. 词汇特色 (vocabulary_character)
    列出20个以内的高频特色词汇(不是常见虚词，而是有个人特色的实词)
    列出独特的用词习惯(如偏爱文言虚词、方言词汇、特定领域术语等)
    → 描述: 哪些词最能代表这个作者的风格？

【输出格式——严格按此格式，每个字段都必须存在】
输出纯JSON（不要markdown代码块）：
{
  "authorName": "",
  "dimensions": {
    "temperature": { "score": 0.5, "description": "", "confidence": "medium" },
    "sentencePreference": { "score": 0.5, "description": "", "confidence": "medium" },
    "modifierDensity": { "score": 0.5, "description": "", "confidence": "medium" },
    "languageRegister": { "score": 0.5, "description": "", "confidence": "medium" },
    "emotionalSpectrum": { "score": 0.5, "description": "", "confidence": "medium", "emotions": [] },
    "narrativePerspective": { "score": 0.5, "description": "", "confidence": "medium" },
    "imageryTendency": { "score": 0.5, "description": "", "confidence": "medium", "types": {} },
    "rhythm": { "score": 0.5, "description": "", "confidence": "medium" },
    "rhetoricalDevices": { "score": 0.5, "description": "", "confidence": "medium", "devices": [] },
    "dialogueRatio": { "score": 0.5, "description": "", "confidence": "medium" },
    "timeHandling": { "score": 0.5, "description": "", "confidence": "medium", "patterns": [] },
    "endingPattern": { "score": 0.5, "description": "", "confidence": "medium" },
    "criticalStance": { "score": 0.5, "description": "", "confidence": "medium" },
    "vocabularyCharacter": { "score": 0.5, "description": "", "confidence": "medium", "words": [], "habits": [] }
  },
  "topTechniques": ["", "", ""],
  "topImagery": ["", "", ""],
  "topWords": ["", "", "", "", ""],
  "closestKnownStyle": "",
  "uniquenessFactor": 0.5,
  "narrativeSummary": ""
}

⚠️ 必须使用以上英文字段名（temperature, sentencePreference等），不能自己起中文名。
⚠️ 不要省略任何字段，没有把握的维度填null。`,
  variables: ['sample_text', 'computational_features'],
  systemPrompt: '你是文学风格分析师。从14个维度提取作者风格特征。输出纯JSON。',
  maxTokens: 2000,
};

/**
 * The 14 dimensions as a structured type for type-safe access.
 */
export interface StyleProfile {
  authorName: string;
  dimensions: {
    temperature: DimensionScore;
    sentencePreference: DimensionScore;
    modifierDensity: DimensionScore;
    languageRegister: DimensionScore;
    emotionalSpectrum: DimensionScore & { emotions: Array<{ name: string; intensity: number }> };
    narrativePerspective: DimensionScore;
    imageryTendency: DimensionScore & { types: Record<string, number> };
    rhythm: DimensionScore;
    rhetoricalDevices: DimensionScore & {
      devices: Array<{ name: string; frequency: 'high' | 'medium' | 'low' }>;
    };
    dialogueRatio: DimensionScore;
    timeHandling: DimensionScore & { patterns: string[] };
    endingPattern: DimensionScore;
    criticalStance: DimensionScore;
    vocabularyCharacter: DimensionScore & { words: string[]; habits: string[] };
  };
  topTechniques: string[];
  topImagery: string[];
  topWords: string[];
  closestKnownStyle: string;
  uniquenessFactor: number;
  narrativeSummary: string;
}

export interface DimensionScore {
  score: number;
  description: string;
  confidence: 'high' | 'medium' | 'low';
}
