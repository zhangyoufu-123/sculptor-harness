/**
 * Dynamic Genre Understanding — RAG-based type discovery.
 *
 * When a user mentions an unfamiliar creative type (PPT文案, 短视频脚本,
 * 小红书文案, 播客稿, etc.), this module:
 * 1. Searches for the genre definition via LLM
 * 2. Generates ad-hoc clarification dimensions
 * 3. Creates a temporary schema for this genre
 *
 * This makes Sculptor truly extensible — no code changes needed for new types.
 */

import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export interface DynamicGenre {
  /** Genre name (e.g., "PPT生成文案", "短视频脚本") */
  name: string;
  /** Category: presentation, social_media, audio, visual, etc. */
  category: string;
  /** What this genre IS — a clear definition */
  definition: string;
  /** Typical structure for this genre */
  typicalStructure: string[];
  /** Key questions to ask when discovering this genre */
  discoveryQuestions: string[];
  /** What makes this genre different from similar ones */
  distinguishingFeatures: string[];
  /** Target audience patterns */
  audiencePatterns: string[];
  /** Confidence that this is the right genre */
  confidence: number;
}

export interface GenreUnderstanding {
  /** The detected genre */
  genre: DynamicGenre;
  /** Whether this is a known genre or dynamically discovered */
  isDynamic: boolean;
  /** Suggested next questions for the user */
  nextQuestions: string[];
  /** Suggested outline structure */
  suggestedStructure: string[];
}

const GENRE_DISCOVERY_PROMPT = `你是一个文本类型分析专家。用户提到了一个你可能不熟悉的创作类型。请分析这个类型。

输出JSON:
{
  "name": "类型名称",
  "category": "presentation|social_media|audio|video|marketing|education|creative|business|other",
  "definition": "这个类型的清晰定义（1-2句话）",
  "typicalStructure": ["典型结构1", "结构2", "结构3"],
  "discoveryQuestions": ["创作前需要问的问题1", "问题2", "问题3"],
  "distinguishingFeatures": ["与相似类型的区别1", "区别2"],
  "audiencePatterns": ["常见受众1", "受众2"],
  "confidence": 0.0-1.0
}

规则:
- "PPT生成文案"不是"文章"也不是"报告"——它是配合PPT演讲的文案
- "短视频脚本"不是"剧本"——它有自己独特的节奏和结构
- "小红书文案"不是"博客"——它的语言风格和结构完全不同
- 如果完全不确定，confidence设为0.3以下`;

const FALLBACK_GENRE: DynamicGenre = {
  name: '',
  category: 'other',
  definition: '',
  typicalStructure: ['开头', '主体', '结尾'],
  discoveryQuestions: [
    '你想通过这个作品达到什么目的？',
    '目标受众是谁？',
    '有什么具体的格式要求吗？',
  ],
  distinguishingFeatures: ['用户自定义类型'],
  audiencePatterns: ['待确认'],
  confidence: 0.3,
};

/**
 * Dynamically discover a genre definition via LLM.
 * Called when user mentions a type not in the static corpus.
 */
export async function discoverGenre(userInput: string, context?: string): Promise<DynamicGenre> {
  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: GENRE_DISCOVERY_PROMPT,
      prompt: `用户想创作: "${userInput}"\n${context ? `上下文: ${context}` : ''}\n\n请分析这个创作类型。以JSON格式输出。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 600,
    });
    if (response.json) {
      return response.json as DynamicGenre;
    }
  } catch {
    /* fallback to heuristic genre below */
  }

  return {
    ...FALLBACK_GENRE,
    name: userInput.slice(0, 30),
    definition: `用户自定义的创作类型: ${userInput}`,
  };
}

/**
 * Check if a user input mentions a genre that needs dynamic discovery.
 * Returns the suspected genre name, or null if it matches known genres.
 */
export function detectUnknownGenre(input: string): string | null {
  // Known genres that we handle well
  const knownGenres = [
    '散文',
    '小说',
    '论文',
    '文章',
    '故事',
    '诗歌',
    '博客',
    '教程',
    '报告',
    '演讲稿',
    '剧本',
    '诗',
  ];
  const isKnown = knownGenres.some((g) => input.includes(g));
  if (isKnown) return null;

  // Genre-indicating patterns that suggest a specific type
  const genrePatterns: RegExp[] = [
    /PPT.*文案|ppt.*文案|演示.*文案/i,
    /短视频.*脚本|抖音.*脚本|视频.*文案/i,
    /小红书.*文案|种草.*文案|推广.*文案/i,
    /播客.*稿|音频.*文案|电台.*稿/i,
    /广告.*文案|营销.*文案|品牌.*文案/i,
    /朋友圈.*文案|社交.*文案/i,
    /产品.*文案|商品.*描述|电商.*文案/i,
    /邮件.*文案|EDM|newsletter/i,
    /直播.*脚本|带货.*脚本/i,
    /海报.*文案|宣传.*文案/i,
  ];

  for (const pattern of genrePatterns) {
    const match = input.match(pattern);
    if (match) return match[0];
  }

  return null;
}

/**
 * Generate ad-hoc clarification questions for a dynamically discovered genre.
 */
export function generateDynamicQuestions(genre: DynamicGenre): string[] {
  return [
    `关于这个${genre.name}，你的核心目标是什么？`,
    ...genre.discoveryQuestions,
    `这个${genre.name}最终要在什么平台上使用？`,
  ];
}

/**
 * Generate a dynamic outline for a discovered genre.
 */
export function generateDynamicOutline(genre: DynamicGenre, topic: string): string[] {
  if (genre.typicalStructure.length > 0) {
    return genre.typicalStructure.map((s) => `${s}（${topic}）`);
  }
  return [`开篇：引入${topic}的背景`, `主体：展开${topic}的核心内容`, `收尾：总结${topic}的要点`];
}
