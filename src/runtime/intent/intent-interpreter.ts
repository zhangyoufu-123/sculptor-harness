/**
 * Intent Interpreter — the semantic understanding layer.
 *
 * Replaces keyword-based routing ("论文" → research) with multi-signal
 * semantic analysis that considers the FULL context, not isolated keywords.
 *
 * Core insight: "议论文" + "小孩成长" ≠ "学术研究"
 * It means "argumentative essay about child development"
 */

// =========================================================================
// Artifact Types — what the user wants to PRODUCE
// =========================================================================

export type ArtifactType =
  | 'argumentative_essay' // 议论文
  | 'expository_essay' // 说明文
  | 'narrative_essay' // 记叙文
  | 'academic_paper' // 学术论文
  | 'research_report' // 研究报告
  | 'business_proposal' // 商业提案
  | 'novel' // 小说
  | 'short_story' // 短篇故事
  | 'blog_post' // 博客/公众号
  | 'tutorial' // 教程
  | 'speech' // 演讲稿
  | 'poetry' // 诗歌
  | 'unknown';

// =========================================================================
// Intent Purpose — WHY the user is creating this
// =========================================================================

export type IntentPurpose =
  | 'persuade' // 说服
  | 'explain' // 解释
  | 'explore' // 探索
  | 'entertain' // 娱乐
  | 'document' // 记录
  | 'teach' // 教学
  | 'analyze' // 分析
  | 'unknown';

// =========================================================================
// Signal — a weighted piece of evidence
// =========================================================================

export interface SemanticSignal {
  /** The text fragment that produced this signal */
  text: string;
  /** What this signal indicates */
  meaning: string;
  /** Signal strength 0-1 */
  weight: number;
}

// =========================================================================
// Interpretation Result
// =========================================================================

export interface IntentInterpretation {
  /** The raw user input */
  rawInput: string;
  /** Top artifact type candidate */
  primaryArtifact: {
    type: ArtifactType;
    confidence: number;
  };
  /** Alternative artifact types considered */
  artifactCandidates: Array<{
    type: ArtifactType;
    confidence: number;
    reason: string;
  }>;
  /** Why certain types were REJECTED */
  rejectedTypes: Array<{
    type: ArtifactType;
    reason: string;
  }>;
  /** Detected purpose */
  purpose: {
    type: IntentPurpose;
    confidence: number;
  };
  /** Extracted topic/domain */
  topic: string;
  /** All detected signals */
  signals: SemanticSignal[];
  /** What's still unknown */
  unknowns: string[];
  /** Human-readable explanation */
  explanation: string;
}

// =========================================================================
// Signal patterns (V1: multi-signal, V2: LLM)
// =========================================================================

interface ArtifactPattern {
  type: ArtifactType;
  /** Signals that SUPPORT this type */
  positiveSignals: string[];
  /** Signals that CONTRADICT this type (presence reduces confidence) */
  negativeSignals: string[];
  /** Associated intent purposes */
  defaultPurpose: IntentPurpose;
  /** Weight of this pattern */
  baseConfidence: number;
}

const ARTIFACT_PATTERNS: ArtifactPattern[] = [
  {
    type: 'argumentative_essay',
    positiveSignals: ['议论文', '观点', '论证', '正方', '反方', '我认为'],
    negativeSignals: ['数据', '实验', '文献', '问卷', '调查', '方法论', '参考文献'],
    defaultPurpose: 'persuade',
    baseConfidence: 0.8,
  },
  {
    type: 'academic_paper',
    positiveSignals: [
      '学术论文',
      '研究',
      '文献综述',
      '方法论',
      '实验',
      '数据',
      '引用',
      '摘要',
      '关键词',
    ],
    negativeSignals: ['小孩', '故事', '娱乐', '随便写写', '练笔'],
    defaultPurpose: 'analyze',
    baseConfidence: 0.7,
  },
  {
    type: 'blog_post',
    positiveSignals: ['公众号', '博客', '分享', '干货', '经验', '攻略'],
    negativeSignals: ['论文', '学术', '文献'],
    defaultPurpose: 'explain',
    baseConfidence: 0.75,
  },
  {
    type: 'novel',
    positiveSignals: ['小说', '故事', '主人公', '章节', '情节', '人物', '虚构'],
    negativeSignals: ['论文', '报告', '真实', '数据'],
    defaultPurpose: 'entertain',
    baseConfidence: 0.9,
  },
  {
    type: 'narrative_essay',
    positiveSignals: ['记叙文', '经历', '故事', '回忆', '日记'],
    negativeSignals: ['论文', '学术'],
    defaultPurpose: 'document',
    baseConfidence: 0.7,
  },
  {
    type: 'research_report',
    positiveSignals: ['研究报告', '调查', '分析', '数据', '结论', '建议'],
    negativeSignals: ['小说', '虚构'],
    defaultPurpose: 'analyze',
    baseConfidence: 0.75,
  },
  {
    type: 'business_proposal',
    positiveSignals: ['商业', '计划', '融资', '市场', '商业模式', '竞品'],
    negativeSignals: ['小说', '故事', '娱乐'],
    defaultPurpose: 'persuade',
    baseConfidence: 0.8,
  },
  {
    type: 'tutorial',
    positiveSignals: ['教程', '教学', '入门', '指南', '步骤', '学会'],
    negativeSignals: ['论文', '学术'],
    defaultPurpose: 'teach',
    baseConfidence: 0.75,
  },
  {
    type: 'speech',
    positiveSignals: ['演讲稿', '演讲', '发言', '致辞', '开场白'],
    negativeSignals: [],
    defaultPurpose: 'persuade',
    baseConfidence: 0.8,
  },
];

// =========================================================================
// Interpreter
// =========================================================================

/**
 * Interpret the user's creative intent from their full input.
 * Uses multi-signal scoring with negative signals to prevent
 * single-keyword misclassifications.
 */
export function interpretIntent(input: string): IntentInterpretation {
  const lower = input.toLowerCase();
  const signals = extractSignals(input);

  // Score each artifact type
  const scores = ARTIFACT_PATTERNS.map((pattern) => {
    let score = pattern.baseConfidence;
    const reasons: string[] = [];

    // Positive signals boost score
    for (const signal of pattern.positiveSignals) {
      if (lower.includes(signal)) {
        score += 0.15;
        reasons.push(`+ ${signal}`);
      }
    }

    // Negative signals REDUCE score (critical fix)
    for (const signal of pattern.negativeSignals) {
      if (lower.includes(signal)) {
        score -= 0.3;
        reasons.push(`- ${signal}`);
      }
    }

    return { pattern, score: Math.max(0, Math.min(1, score)), reasons };
  });

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  // Top candidate
  const top = scores[0];

  // Alternatives (within 0.2 of top)
  const alternatives = scores.slice(1).filter((s) => s.score > top.score - 0.2);

  // Rejected (score < 0.3)
  const rejected = scores.filter((s) => s.score < 0.3);

  // Detect purpose
  const purpose = detectPurpose(input);

  // Extract topic (everything except artifact keywords)
  const topic = extractTopic(input);

  // Unknowns
  const unknowns = detectUnknowns(input, top.pattern.type);

  return {
    rawInput: input,
    primaryArtifact: {
      type: top.pattern.type,
      confidence: top.score,
    },
    artifactCandidates: [
      { type: top.pattern.type, confidence: top.score, reason: top.reasons.join(', ') },
      ...alternatives.map((a) => ({
        type: a.pattern.type,
        confidence: a.score,
        reason: a.reasons.join(', '),
      })),
    ],
    rejectedTypes: rejected.map((r) => ({
      type: r.pattern.type,
      reason: `得分 ${Math.round(r.score * 100)}%: ${r.reasons.join(', ')}`,
    })),
    purpose: { type: purpose, confidence: 0.7 },
    topic,
    signals,
    unknowns,
    explanation: generateExplanation(top.pattern.type, top.score, signals, purpose, topic),
  };
}

// =========================================================================
// Signal extraction (semantic, not just keyword)
// =========================================================================

function extractSignals(input: string): SemanticSignal[] {
  const signals: SemanticSignal[] = [];

  // Artifact type signals
  if (input.includes('议论文'))
    signals.push({ text: '议论文', meaning: 'argumentative structure', weight: 0.7 });
  if (input.includes('论文'))
    signals.push({ text: '论文', meaning: 'formal paper (weak signal)', weight: 0.3 });
  if (input.includes('小说'))
    signals.push({ text: '小说', meaning: 'fiction narrative', weight: 0.9 });
  if (input.includes('故事')) signals.push({ text: '故事', meaning: 'narrative', weight: 0.5 });
  if (input.includes('报告')) signals.push({ text: '报告', meaning: 'formal report', weight: 0.6 });

  // Topic signals
  if (input.includes('小孩') || input.includes('儿童') || input.includes('孩子')) {
    signals.push({
      text: input.match(/小孩|儿童|孩子/)?.[0] || '',
      meaning: 'child development topic',
      weight: 0.85,
    });
  }
  if (input.includes('成长'))
    signals.push({ text: '成长', meaning: 'development/growth', weight: 0.8 });
  if (input.includes('教育'))
    signals.push({ text: '教育', meaning: 'education domain', weight: 0.8 });
  if (input.includes('AI') || input.includes('人工智能'))
    signals.push({ text: 'AI', meaning: 'artificial intelligence', weight: 0.9 });

  return signals;
}

function detectPurpose(input: string): IntentPurpose {
  if (input.includes('说服') || input.includes('论证') || input.includes('证明')) return 'persuade';
  if (input.includes('解释') || input.includes('说明') || input.includes('介绍')) return 'explain';
  if (input.includes('故事') || input.includes('娱乐') || input.includes('小说'))
    return 'entertain';
  if (input.includes('教程') || input.includes('教') || input.includes('学')) return 'teach';
  if (input.includes('分析') || input.includes('研究')) return 'analyze';
  return 'unknown';
}

function extractTopic(input: string): string {
  // Remove artifact keywords to extract the pure topic
  const artifactKeywords = [
    '议论文',
    '论文',
    '小说',
    '故事',
    '报告',
    '文章',
    '写',
    '一篇',
    '一本',
    '一个',
  ];
  let topic = input;
  for (const kw of artifactKeywords) {
    topic = topic.replace(kw, '');
  }
  return topic.replace(/\s+/g, ' ').trim() || input;
}

function detectUnknowns(input: string, _artifactType: ArtifactType): string[] {
  const unknowns: string[] = [];
  if (!input.includes('观点') && !input.includes('认为')) unknowns.push('核心观点/立场');
  if (!input.includes('读者') && !input.includes('给') && !input.includes('面向'))
    unknowns.push('目标读者');
  if (!input.includes('为什么') && !input.includes('目的')) unknowns.push('创作动机');
  if (unknowns.length === 0) unknowns.push('具体论据/案例');
  return unknowns;
}

function generateExplanation(
  type: ArtifactType,
  confidence: number,
  signals: SemanticSignal[],
  purpose: IntentPurpose,
  topic: string,
): string {
  const signalSummary = signals.map((s) => `${s.text}(${s.meaning})`).join(', ');
  return `判断为: ${type} (${Math.round(confidence * 100)}%) | 主题: ${topic} | 目的: ${purpose} | 信号: ${signalSummary}`;
}

// =========================================================================
// Artifact type labels for display
// =========================================================================

export const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  argumentative_essay: '议论文',
  expository_essay: '说明文',
  narrative_essay: '记叙文',
  academic_paper: '学术论文',
  research_report: '研究报告',
  business_proposal: '商业提案',
  novel: '小说',
  short_story: '短篇故事',
  blog_post: '博客文章',
  tutorial: '教程',
  speech: '演讲稿',
  poetry: '诗歌',
  unknown: '未分类',
};
