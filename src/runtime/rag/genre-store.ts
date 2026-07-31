/**
 * Genre Store — semantic genre classification using embeddings.
 * V1: in-memory keyword+pattern corpus. V2: ChromaDB vector store.
 *
 * Replaces all hardcoded genre keyword lists with a searchable corpus.
 * Instead of: if (input.includes('小说')) type = 'fiction'
 * We now: embed(input) → cosineSimilarity(genreCorpus) → topK genres
 */

export interface GenreEntry {
  /** Genre name in Chinese */
  name: string;
  /** English key for internal use */
  key: string;
  /** Category: fiction / nonfiction / poetry / hybrid */
  category: 'fiction' | 'nonfiction' | 'poetry' | 'hybrid';
  /** What this genre is about (for search matching) */
  description: string;
  /** Keywords strongly associated (for V1 fallback) */
  keywords: string[];
  /** Typical structure patterns */
  typicalStructure: string[];
  /** What distinguishes this from similar genres */
  distinguishingFeatures: string[];
}

export interface GenreMatch {
  genre: GenreEntry;
  score: number; // 0-1 relevance
  matchReason: string;
}

/**
 * Comprehensive genre corpus — covers all common Chinese writing types.
 * This replaces ALL 17 hardcoded keyword lists across the codebase.
 */
const GENRE_CORPUS: GenreEntry[] = [
  // === Fiction ===
  {
    name: '长篇小说',
    key: 'novel',
    category: 'fiction',
    description: '长篇虚构叙事作品，通常超过5万字，有完整的人物弧线和情节发展',
    keywords: ['小说', '长篇', '故事', '人物', '情节', '主角', '反派', '章节', '世界观'],
    typicalStructure: ['开端', '发展', '转折', '高潮', '结局'],
    distinguishingFeatures: ['完整人物弧线', '多线叙事', '世界观构建'],
  },
  {
    name: '短篇故事',
    key: 'short_story',
    category: 'fiction',
    description: '短篇虚构叙事，通常1万字以内，聚焦单一事件或人物',
    keywords: ['短篇', '小故事', '微型小说', '一千字', '闪小说'],
    typicalStructure: ['引入', '冲突', '转折', '收束'],
    distinguishingFeatures: ['单一焦点', '留白技巧', '瞬间冲击'],
  },
  {
    name: '科幻小说',
    key: 'scifi',
    category: 'fiction',
    description: '以科学和技术想象为基础的虚构作品',
    keywords: ['科幻', '未来', 'AI', '外星', '太空', '机器人', '赛博', '末日'],
    typicalStructure: ['设定呈现', '技术冲突', '人性考验', '解决方案'],
    distinguishingFeatures: ['科学逻辑', '未来设定', '技术伦理'],
  },
  {
    name: '剧本/影视',
    key: 'screenplay',
    category: 'fiction',
    description: '用于影视或舞台表演的剧本',
    keywords: ['剧本', '电影', '电视剧', '舞台', '对白', '场景', '分镜', '镜头'],
    typicalStructure: ['开场', '激励事件', '中点转折', '高潮', '结局'],
    distinguishingFeatures: ['对白驱动', '场景化', '视觉导向'],
  },

  // === Nonfiction ===
  {
    name: '议论文',
    key: 'argumentative_essay',
    category: 'nonfiction',
    description: '通过论证表达观点的文章，强调逻辑和说服力',
    keywords: ['议论文', '观点', '论证', '正方', '反方', '我认为', '驳论', '立论'],
    typicalStructure: ['引言', '论点1', '论点2', '反方观点', '结论'],
    distinguishingFeatures: ['逻辑推理', '证据支撑', '立场鲜明'],
  },
  {
    name: '说明文',
    key: 'expository',
    category: 'nonfiction',
    description: '客观解释事物、概念或过程的文章',
    keywords: ['说明文', '解释', '介绍', '什么是', '原理', '步骤', '分类', '特点', '功能'],
    typicalStructure: ['定义', '分类', '特征', '示例', '总结'],
    distinguishingFeatures: ['客观中立', '条理清晰', '例证丰富'],
  },
  {
    name: '学术论文',
    key: 'academic_paper',
    category: 'nonfiction',
    description: '系统研究某个学术问题的正式论文',
    keywords: ['学术论文', '研究', '文献', '方法', '实验', '数据', '引用', '摘要', '绪论', '结论'],
    typicalStructure: ['摘要', '引言', '文献综述', '方法', '结果', '讨论', '结论'],
    distinguishingFeatures: ['文献引用', '方法论', '学术规范'],
  },
  {
    name: '散文/随笔',
    key: 'prose',
    category: 'nonfiction',
    description: '抒发个人情感和思考的自由文体',
    keywords: ['散文', '随笔', '散文诗', '杂文', '小品', '随笔', '游记', '回忆', '感悟', '闲笔'],
    typicalStructure: ['引入', '展开', '深化', '收束'],
    distinguishingFeatures: ['个人视角', '情感真挚', '语言优美'],
  },
  {
    name: '博客/公众号',
    key: 'blog',
    category: 'nonfiction',
    description: '面向大众的通俗网络文章',
    keywords: ['公众号', '博客', '文章', '推送', '写一篇', '分享', '干货', '经验'],
    typicalStructure: ['标题', '引入', '主体', '总结', 'CTA'],
    distinguishingFeatures: ['通俗易懂', '标题吸引', '互动性强'],
  },
  {
    name: '商业计划',
    key: 'business_plan',
    category: 'nonfiction',
    description: '系统阐述商业构想和实施方案的文档',
    keywords: ['商业计划', 'BP', '融资', '创业', '商业模式', '市场分析', '竞品', '财务', '团队'],
    typicalStructure: ['执行摘要', '市场分析', '产品', '商业模式', '财务预测'],
    distinguishingFeatures: ['数据驱动', '可执行性', '风险评估'],
  },
  {
    name: '教程/指南',
    key: 'tutorial',
    category: 'nonfiction',
    description: '教授特定技能或知识的教学内容',
    keywords: ['教程', '教学', '入门', '指南', '步骤', '学会', '掌握', '课程'],
    typicalStructure: ['概述', '基础', '进阶', '实战', '总结'],
    distinguishingFeatures: ['循序渐进', '实操指导', '示例丰富'],
  },
  {
    name: '研究报告',
    key: 'research_report',
    category: 'nonfiction',
    description: '基于调查或实验的正式报告',
    keywords: ['研究报告', '调查', '分析', '数据显示', '样本', '问卷', '统计'],
    typicalStructure: ['背景', '方法', '发现', '分析', '建议'],
    distinguishingFeatures: ['数据支撑', '方法论', '可验证'],
  },
  {
    name: '演讲稿',
    key: 'speech',
    category: 'nonfiction',
    description: '用于公开演讲的文稿',
    keywords: ['演讲稿', '演讲', '发言', '致辞', '开幕', '闭幕', '主题演讲'],
    typicalStructure: ['开场', '主体', '高潮', '总结', '呼吁'],
    distinguishingFeatures: ['口语化', '感染力', '节奏感'],
  },

  // === Poetry ===
  {
    name: '诗歌',
    key: 'poetry',
    category: 'poetry',
    description: '用韵律和意象表达情感的文学形式',
    keywords: ['诗', '诗歌', '现代诗', '古诗', '词', '韵文', '歌词', '自由诗', '格律'],
    typicalStructure: ['意象建立', '情感推进', '升华'],
    distinguishingFeatures: ['韵律', '意象', '凝练'],
  },

  // === Hybrid/Other ===
  {
    name: '回忆录',
    key: 'memoir',
    category: 'hybrid',
    description: '基于个人记忆的叙事作品，介于散文和小说之间',
    keywords: ['回忆', '记忆', '往事', '岁月', '那些年', '我的', '曾经', '年少'],
    typicalStructure: ['时间起点', '关键事件', '情感转折', '现在回望'],
    distinguishingFeatures: ['真实+文学', '时间跨度', '个人视角'],
  },
];

/**
 * Search the genre corpus for matches to the user's input.
 * V1: keyword overlap scoring. V2: embedding cosine similarity.
 */
export function searchGenres(input: string, topK = 3): GenreMatch[] {
  const lower = input.toLowerCase();
  const results: GenreMatch[] = [];

  for (const genre of GENRE_CORPUS) {
    let score = 0;
    const matchedKeywords: string[] = [];

    // Keyword matching
    for (const kw of genre.keywords) {
      if (lower.includes(kw)) {
        score += 1.5;
        matchedKeywords.push(kw);
      }
    }

    // Description matching
    for (const word of genre.description.split(/[\s，。、]+/).filter((w) => w.length > 1)) {
      if (lower.includes(word)) score += 0.3;
    }

    // Penalize if the genre's distinguishing features are absent
    let penalty = 0;
    for (const feature of genre.distinguishingFeatures.slice(0, 2)) {
      if (!lower.includes(feature.slice(0, 2))) penalty += 0.2;
    }
    score -= penalty;

    if (score > 0) {
      results.push({
        genre,
        score: Math.min(score / 5, 1.0), // Normalize
        matchReason:
          matchedKeywords.length > 0 ? `匹配关键词: ${matchedKeywords.join(', ')}` : '语义相似',
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Get the best genre match. Returns '文章' as fallback.
 */
export function classifyGenre(input: string): GenreMatch {
  const matches = searchGenres(input, 1);
  if (matches.length > 0) return matches[0];
  return {
    genre: GENRE_CORPUS[4], // 议论文 as default
    score: 0.1,
    matchReason: '无明确信号，默认议论文',
  };
}

/**
 * Get all genre entries for the thinking-display prompt.
 */
export function getGenreCorpus(): GenreEntry[] {
  return GENRE_CORPUS;
}
