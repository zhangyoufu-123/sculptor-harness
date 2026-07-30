/**
 * Creative Type Router — Sprint Fix P0
 *
 * BEFORE asking any clarification questions, first understand WHAT the user
 * is trying to create. A novel requires different questions than an article.
 *
 * This is the critical missing piece: Sculptor must first understand
 * creative intent (fiction, non-fiction, research, etc.) before routing
 * to the correct clarification flow.
 */

// =========================================================================
// Creative Types
// =========================================================================

export type CreativeType =
  | 'fiction_novel' // 长篇小说
  | 'short_story' // 短篇故事
  | 'screenplay' // 剧本/影视
  | 'article' // 非虚构文章
  | 'research' // 学术研究
  | 'business_plan' // 商业计划
  | 'course' // 课程/教程
  | 'poetry' // 诗歌
  | 'personal_essay' // 个人随笔
  | 'unknown'; // 未分类

// =========================================================================
// Classification Result
// =========================================================================

export interface CreativeTypeResult {
  /** Detected creative type */
  type: CreativeType;
  /** Confidence 0-1 */
  confidence: number;
  /** Key signals that led to this classification */
  signals: string[];
  /** Human-readable explanation */
  explanation: string;
  /** Alternative types considered (with lower confidence) */
  alternatives: Array<{ type: CreativeType; confidence: number }>;
}

// =========================================================================
// Type-specific labels for UI
// =========================================================================

export const CREATIVE_TYPE_LABELS: Record<
  CreativeType,
  { emoji: string; label: string; category: string }
> = {
  fiction_novel: { emoji: '📖', label: '长篇小说', category: '虚构' },
  short_story: { emoji: '📝', label: '短篇故事', category: '虚构' },
  screenplay: { emoji: '🎬', label: '剧本/影视', category: '虚构' },
  poetry: { emoji: '🎵', label: '诗歌', category: '文学' },
  article: { emoji: '📄', label: '文章', category: '非虚构' },
  research: { emoji: '🔬', label: '学术研究', category: '非虚构' },
  business_plan: { emoji: '💼', label: '商业计划', category: '非虚构' },
  course: { emoji: '📚', label: '课程/教程', category: '非虚构' },
  personal_essay: { emoji: '✍️', label: '个人随笔', category: '非虚构' },
  unknown: { emoji: '❓', label: '未分类', category: '未知' },
};

// =========================================================================
// Signal patterns for classification (V1: keyword-based)
// =========================================================================

interface TypeSignal {
  type: CreativeType;
  keywords: string[];
  weight: number; // How strongly this keyword indicates this type
}

const TYPE_SIGNALS: TypeSignal[] = [
  // Fiction signals
  {
    type: 'fiction_novel',
    keywords: [
      '小说',
      '长篇',
      '故事',
      '人物',
      '情节',
      '角色',
      '世界观',
      '架空',
      '奇幻',
      '科幻小说',
    ],
    weight: 3,
  },
  { type: 'short_story', keywords: ['短篇', '小故事', '微型小说', '一千字'], weight: 3 },
  {
    type: 'screenplay',
    keywords: ['剧本', '电影', '电视剧', '分镜', '场景', '对白', '镜头', '影视'],
    weight: 3,
  },
  { type: 'poetry', keywords: ['诗', '诗歌', '现代诗', '古诗', '词', '韵文', '歌词'], weight: 3 },

  // Non-fiction signals
  {
    type: 'article',
    keywords: ['文章', '写一篇', '写个', '公众号', '博客', '分析', '评论', '解读', '干货'],
    weight: 2,
  },
  {
    type: 'research',
    keywords: ['论文', '学术', '研究', '文献', '引用', '数据', '实验', '调查', '报告'],
    weight: 3,
  },
  {
    type: 'business_plan',
    keywords: ['商业计划', 'BP', '融资', '创业', '商业模式', '市场分析', '竞品'],
    weight: 3,
  },
  {
    type: 'course',
    keywords: ['课程', '教程', '教学', '培训', '入门', '指南', '学习', '掌握', '学会'],
    weight: 2,
  },
  {
    type: 'personal_essay',
    keywords: ['随笔', '日记', '心得', '感悟', '我的', '我', '生活', '经历', '回忆'],
    weight: 2,
  },

  // Character/plot signals → fiction
  {
    type: 'fiction_novel',
    keywords: ['主角', '反派', '男主', '女主', '配角', '结局', '高潮', '冲突'],
    weight: 2,
  },
  {
    type: 'fiction_novel',
    keywords: ['穿越', '魔法', '修仙', '末世', '末日', '星际', '赛博', 'AI战争', '未来世界'],
    weight: 2,
  },
];

// =========================================================================
// Default type (when no signals match)
// =========================================================================

const DEFAULT_TYPE: CreativeType = 'article';

// =========================================================================
// Router
// =========================================================================

/**
 * Classify the user's creative intent from their initial idea.
 * Called BEFORE any clarification questions.
 */
export function classifyCreativeType(input: string): CreativeTypeResult {
  const scores = new Map<CreativeType, { score: number; matchedKeywords: string[] }>();

  // Initialize scores
  for (const signal of TYPE_SIGNALS) {
    if (!scores.has(signal.type)) {
      scores.set(signal.type, { score: 0, matchedKeywords: [] });
    }
  }

  // Scan for keyword matches
  const lowerInput = input.toLowerCase();
  for (const signal of TYPE_SIGNALS) {
    for (const keyword of signal.keywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        const entry = scores.get(signal.type)!;
        entry.score += signal.weight;
        if (!entry.matchedKeywords.includes(keyword)) {
          entry.matchedKeywords.push(keyword);
        }
      }
    }
  }

  // Find the highest-scoring type
  let bestType: CreativeType = DEFAULT_TYPE;
  let bestScore = 0;
  let bestKeywords: string[] = [];

  for (const [type, entry] of Array.from(scores.entries())) {
    if (entry.score > bestScore) {
      bestType = type;
      bestScore = entry.score;
      bestKeywords = entry.matchedKeywords;
    }
  }

  // Calculate confidence (0-1)
  const confidence = bestScore > 0 ? Math.min(bestScore / 10, 0.98) : 0.4;

  // Generate alternatives (types that scored > 0 but less than best)
  const alternatives = Array.from(scores.entries())
    .filter(([t]) => t !== bestType)
    .filter(([, entry]) => entry.score > 0)
    .map(([type, entry]) => ({
      type,
      confidence: Math.min(entry.score / 10, 0.5),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  // Generate explanation
  const label = CREATIVE_TYPE_LABELS[bestType];
  const explanation =
    bestScore > 0
      ? `检测到关键词: ${bestKeywords.join('、')} → 判断为 ${label.emoji} ${label.label}`
      : '未检测到明确的创作类型信号，默认为文章';

  return {
    type: bestType,
    confidence,
    signals: bestKeywords,
    explanation,
    alternatives,
  };
}

/**
 * Quick helper: is this a fiction type?
 */
export function isFiction(type: CreativeType): boolean {
  return ['fiction_novel', 'short_story', 'screenplay'].includes(type);
}

/**
 * Quick helper: is this a non-fiction type?
 */
export function isNonFiction(type: CreativeType): boolean {
  return ['article', 'research', 'business_plan', 'course', 'personal_essay'].includes(type);
}
