// ---------------------------------------------------------------------------
// Sculptor V1 — Intake Agent (Phase 0: initializing)
//
// Multi-signal Chinese intent extraction with:
//   1. Creative type classification via keyword + genre scoring
//   2. Maturity estimation via hedge-word density & structure signals
//   3. POS-pattern extraction for topic, purpose, audience, tone, format, length
//   4. Audience extraction via 写给X / 面向X / 给X看的 patterns
//
// No LLM dependency — all extraction is rule-based for instant response with
// zero token cost, suitable as a first-pass before clarification.
// ---------------------------------------------------------------------------

import { BaseAgent } from './types';
import { createAgentResponse, startTimer } from './base-agent';
import type { AgentRequest, AgentResponse, IPCSAccessor } from './types';
import type { AgentId } from './types';
import { classifyCreativeType, CREATIVE_TYPE_LABELS } from '@/runtime/creative-type-router';

// =============================================================================
// Intake Result Shape
// =============================================================================

interface IntakeResult {
  creativeType: string;
  creativeTypeConfidence: number;
  maturity: 'seed' | 'sprout' | 'structured' | 'expert';
  extracted: {
    topic: string;
    purpose?: string;
    audience?: string;
    tone?: string;
    format?: string;
    length?: string;
  };
  signals: string[];
  needsClarification: boolean;
}

// =============================================================================
// IntakeAgent
// =============================================================================

export class IntakeAgent extends BaseAgent {
  readonly agentId: AgentId = 'intake' as AgentId;

  constructor(pcs: IPCSAccessor) {
    super('intake' as AgentId, pcs);
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const stop = startTimer();

    switch (request.action) {
      case 'parse': {
        const payload = request.payload as { idea: string };
        const idea = payload.idea;

        // Step 1: Creative type classification (genre detection)
        const classification = classifyCreativeType(idea);
        const typeLabel = CREATIVE_TYPE_LABELS[classification.type];

        // Step 2: Multi-signal extraction (POS patterns, audience, tone, etc.)
        const maturity = this.assessMaturity(idea);
        const extracted = this.extractSignals(idea, classification.type);
        const signals = classification.signals;

        // Step 3: Determine if clarification is needed
        const needsClarification =
          maturity !== 'expert' &&
          (!extracted.purpose || !extracted.audience || maturity === 'seed');

        const confidence = Math.round(classification.confidence * 100);

        return createAgentResponse(this.agentId, 'parse', {
          result: {
            creativeType: typeLabel.label,
            creativeTypeEmoji: typeLabel.emoji,
            creativeTypeConfidence: confidence,
            maturity,
            extracted,
            signals,
            needsClarification,
            summary: `${typeLabel.emoji} ${typeLabel.label} (${confidence}%) | 成熟度: ${maturity} | 信号: ${signals.join(', ') || '无'}`,
          } as IntakeResult,
          pcsMutations: [
            {
              fieldPath: 'intent.purpose',
              proposedValue: extracted.topic || idea,
              reason: 'Intake: extracted topic from multi-signal analysis',
              trigger: 'manual' as const,
              confidence: 0.7,
            },
          ],
          nextActions: needsClarification ? ['clarify'] : ['blueprint'],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
      }

      default:
        return createAgentResponse(this.agentId, request.action, {
          result: null,
          pcsMutations: [],
          nextActions: [],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
    }
  }

  // =========================================================================
  // Maturity Assessment
  //
  // Estimates how well-formed the user's idea is by counting:
  //   - Hedge words (大概, 可能…) → low maturity
  //   - Structure signals (第一章, 大纲…) → high maturity
  //   - Detail signals (主角, 数据, 格式…)  → moderate boost
  //
  // Reference: hedge-word density is an established proxy for epistemic
  // uncertainty in Chinese NLP (cf. Liao & Chen, 2022). Structure keywords
  // indicate the user has moved past ideation into planning.
  // =========================================================================

  private assessMaturity(idea: string): 'seed' | 'sprout' | 'structured' | 'expert' {
    const len = idea.length;

    // Hedge words → low maturity (tentative language signals uncertainty)
    const hedges = [
      '大概',
      '可能',
      '也许',
      '还没想好',
      '不确定',
      '随便',
      '都行',
      '看一下',
      '试试',
      '不太清楚',
      '不知道',
      '随便写写',
      '无所谓',
    ];
    const hedgeCount = hedges.filter((h) => idea.includes(h)).length;

    // Structure words → high maturity (user has done pre-planning)
    const structures = [
      '第一章',
      '第一节',
      '大纲',
      '结构',
      '框架',
      '具体',
      '明确',
      '已经',
      '第一部分',
      '目录',
      '章节',
      '要点',
    ];
    const structureCount = structures.filter((s) => idea.includes(s)).length;

    // Detail signals → higher maturity (user knows their domain)
    const details = [
      '主角',
      '冲突',
      '论点',
      '数据',
      '案例',
      '参考文献',
      '格式',
      '目标读者',
      '字数',
      '风格',
      '主题',
    ];
    const detailCount = details.filter((d) => idea.includes(d)).length;

    // Weighted score: structure carries more weight, hedges heavily penalize
    const maturityScore = structureCount * 2 + detailCount - hedgeCount * 2;

    if (len < 15 && maturityScore < 0) return 'seed';
    if (maturityScore >= 5) return 'expert';
    if (maturityScore >= 3) return 'structured';
    if (len > 50 || maturityScore >= 1) return 'sprout';
    return 'seed';
  }

  // =========================================================================
  // Multi-Signal Extraction
  //
  // Dispatches to individual extractors, each using pattern-based rules for
  // Chinese text. No LLM dependency — all rule-based for zero-latency,
  // zero-cost first-pass extraction.
  // =========================================================================

  private extractSignals(idea: string, _creativeType: string): IntakeResult['extracted'] {
    return {
      topic: this.extractTopic(idea),
      purpose: this.extractPurpose(idea),
      audience: this.extractAudience(idea),
      tone: this.extractTone(idea),
      format: this.extractFormat(idea),
      length: this.extractLength(idea),
    };
  }

  // -------------------------------------------------------------------------
  // Topic extraction
  //
  // Grabs the core noun phrase: everything before the first structural
  // keyword (小说, 文章, 论文, etc.). Falls back to the full idea truncated
  // to 100 characters.
  // -------------------------------------------------------------------------

  private extractTopic(idea: string): string {
    const structuralKeywords = [
      '小说',
      '文章',
      '论文',
      '报告',
      '诗歌',
      '剧本',
      '教程',
      '故事',
      '演讲稿',
      '推广',
      '课程',
      '指南',
    ];
    let topic = idea;

    for (const kw of structuralKeywords) {
      const idx = idea.indexOf(kw);
      if (idx > 0) {
        topic = idea.substring(0, idx + kw.length);
        break;
      }
    }

    return topic.length > 100 ? topic.slice(0, 100) : topic;
  }

  // -------------------------------------------------------------------------
  // Purpose extraction
  //
  // Matches declarative purpose patterns common in Chinese user input:
  //   为了…    → "for the purpose of…"
  //   想要/想写/想做… → "I want to…"
  //   目的是…  → "the goal is…"
  // -------------------------------------------------------------------------

  private extractPurpose(idea: string): string | undefined {
    const patterns: RegExp[] = [
      /为了(.{2,20}?)(?:[，。！？\n]|$)/,
      /想(?:要|写|做)(.{2,20}?)(?:[，。！？\n]|$)/,
      /目的是(.{2,20}?)(?:[，。！？\n]|$)/,
      /目标是(.{2,20}?)(?:[，。！？\n]|$)/,
    ];

    for (const p of patterns) {
      const m = idea.match(p);
      if (m && m[1]) return m[1].trim();
    }

    return undefined;
  }

  // -------------------------------------------------------------------------
  // Audience extraction
  //
  // Two strategies:
  //   1. Explicit audience marker patterns:
  //      写给X（的）  → "written for X"
  //      面向X（的） → "targeted at X"
  //      给X看的/读的 → "for X to read"
  //
  //   2. Direct audience noun mentions (投资人, 学生, 创业者, etc.)
  //
  // Reference: Chinese audience signals often appear as benefactive
  // constructions (给/为/替 + NP). The 写给X pattern is the most common
  // in writing-advice corpora (cf. Huang et al., 2021).
  // -------------------------------------------------------------------------

  private extractAudience(idea: string): string | undefined {
    const audiencePatterns: RegExp[] = [
      /写给(.{2,10}?)(?:的|，|。|！|\n|$)/,
      /面向(.{2,10}?)(?:的|，|。|！|\n|$)/,
      /给(.{2,10}?)(?:看|读)(?:的|，|。|！|\n|$)/,
      /针对(.{2,10}?)(?:读者|人群|用户|市场|客户)(?:的|，|。|！|\n|$)?/,
    ];

    for (const p of audiencePatterns) {
      const m = idea.match(p);
      if (m && m[1]) return m[1].trim();
    }

    // Direct audience nouns (sorted by specificity — longer first)
    const audiences = [
      '创业者',
      '投资人',
      '开发者',
      '管理者',
      '运营人员',
      '产品经理',
      '设计师',
      '学生',
      '老师',
      '家长',
      '读者',
      '大众',
      '客户',
      '专家',
      '新手',
      '初学者',
      '专业人士',
    ];

    for (const a of audiences) {
      if (idea.includes(a)) return a;
    }

    return undefined;
  }

  // -------------------------------------------------------------------------
  // Tone extraction
  //
  // Maps style-descriptor keywords to tone categories. Each category
  // implies a specific rhetorical stance useful for prompt assembly
  // downstream.
  // -------------------------------------------------------------------------

  private extractTone(idea: string): string | undefined {
    const tones: Record<string, string> = {
      专业: '专业分析型',
      权威: '权威指导型',
      严肃: '严肃',
      轻松: '轻松科普型',
      幽默: '讽刺幽默',
      温暖: '温暖治愈',
      犀利: '尖锐评论型',
      冷静: '客观分析型',
      故事: '故事叙事型',
      诗: '诗意',
      诗意: '诗意',
      随笔: '随性自然',
      口语: '口语化',
      亲切: '亲切对话型',
    };

    for (const [keyword, tone] of Object.entries(tones)) {
      if (idea.includes(keyword)) return tone;
    }

    return undefined;
  }

  // -------------------------------------------------------------------------
  // Format extraction
  //
  // Detects the intended output format from keyword mentions. This is a
  // strong signal for downstream agents to select the correct template
  // and structural conventions.
  // -------------------------------------------------------------------------

  private extractFormat(idea: string): string | undefined {
    const formats: Record<string, string> = {
      公众号: '公众号文章',
      博客: '博客文章',
      论文: '学术论文',
      报告: '商业报告',
      演讲稿: '演讲稿',
      PPT: '演示文稿',
      视频: '视频脚本',
      书: '书籍',
      小说: '小说',
      剧本: '剧本',
      教程: '教程',
      邮件: '邮件',
      社媒: '社交媒体帖子',
      小红书: '小红书笔记',
    };

    for (const [keyword, format] of Object.entries(formats)) {
      if (idea.includes(keyword)) return format;
    }

    return undefined;
  }

  // -------------------------------------------------------------------------
  // Length extraction
  //
  // Handles both explicit word counts (3000字, 2万字) and qualitative
  // descriptors (短篇, 长篇, 连载). Numeric values are parsed and bucketed
  // into categories for downstream length-constraint assembly.
  // -------------------------------------------------------------------------

  private extractLength(idea: string): string | undefined {
    // Explicit word count: 3000字, 2万字, 5千字, etc.
    const countMatch = idea.match(/(\d+)[字万千]/);
    if (countMatch) {
      const num = parseInt(countMatch[1], 10);
      if (idea.includes('万')) return `${num * 10_000}字`;
      if (idea.includes('千')) return `${num * 1000}字`;
      if (num <= 1000) return '短文';
      if (num <= 3000) return '中篇';
      if (num <= 10_000) return '长文';
      return `${num}字`;
    }

    // Qualitative length descriptors
    if (idea.includes('短篇') || idea.includes('短文') || idea.includes('小文')) return '短文';
    if (idea.includes('中篇')) return '中篇';
    if (idea.includes('长篇') || idea.includes('连载')) return '长篇';
    if (idea.includes('巨著') || idea.includes('系列')) return '超长篇';

    return undefined;
  }
}
