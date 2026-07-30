/**
 * Clarification Schemas — Sprint Fix P0
 *
 * Each creative type has its own set of clarification dimensions.
 * The Creative Type Router selects which schema to use.
 *
 * NO MORE forcing a novelist to pick between "公众号文章" and "学术论文".
 */

import type { CreativeType } from './creative-type-router';
import { CREATIVE_TYPE_LABELS } from './creative-type-router';

// =========================================================================
// Clarification Dimension
// =========================================================================

export interface ClarifyDimension {
  key: string;
  label: string;
  field: string; // PCS field path
  options: string[]; // AI-generated options (or defaults)
  hint?: string; // Extra context shown to the user
  freeform?: boolean; // Allow free-text input beyond options?
}

// =========================================================================
// Clarification Schema
// =========================================================================

export interface ClarificationSchema {
  type: CreativeType;
  /** Introductory message shown before the first question */
  intro: string;
  /** Ordered list of clarification dimensions */
  dimensions: ClarifyDimension[];
}

// =========================================================================
// Article Schema (existing, unchanged logic)
// =========================================================================

const ARTICLE_SCHEMA: ClarificationSchema = {
  type: 'article',
  intro: '我来帮你明确几个关键的创作维度。',
  dimensions: [
    {
      key: 'purpose',
      label: '创作目的',
      field: 'intent.purpose',
      options: ['科普AI教育应用', '分析商业机会', '探讨教师角色变化', '论证AI教育必要性'],
    },
    {
      key: 'core_message',
      label: '核心观点',
      field: 'intent.core_message',
      options: [
        'AI不会替代教师但会重塑教育',
        'AI教育是下一个产业风口',
        '教育者应主动拥抱AI',
        'AI教育的核心是个性化',
      ],
    },
    {
      key: 'tone',
      label: '语气风格',
      field: 'expression.tone',
      options: ['专业分析型', '轻松科普型', '故事叙事型', '尖锐评论型'],
    },
    {
      key: 'audience',
      label: '目标读者',
      field: 'audience.audience_type',
      options: ['教育从业者', '普通读者', '投资人', '技术专家'],
    },
    {
      key: 'knowledge',
      label: '读者水平',
      field: 'audience.knowledge_level',
      options: ['入门', '中级', '专家'],
    },
    {
      key: 'format',
      label: '交付格式',
      field: 'constraint.format',
      options: ['公众号文章', '学术论文', '商业报告', '演讲稿'],
    },
    {
      key: 'length',
      label: '字数范围',
      field: 'constraint.length_min',
      options: ['1000字', '2000-3000字', '5000字以上'],
    },
    {
      key: 'success',
      label: '成功标准',
      field: 'intent.desired_impact',
      options: ['读者转发', '通过审稿', '说服读者', '建立权威'],
    },
  ],
};

// =========================================================================
// Fiction Novel Schema (NEW — the critical missing piece)
// =========================================================================

const FICTION_NOVEL_SCHEMA: ClarificationSchema = {
  type: 'fiction_novel',
  intro: '这是一个小说创作。让我先理解你的世界设定和故事核心。',
  dimensions: [
    {
      key: 'world_type',
      label: '世界观',
      field: 'intent.purpose',
      options: [
        '近未来科幻（50年内）',
        '赛博朋克都市',
        'AI末日废土',
        '现实世界AI悬疑',
        '太空科幻',
        '架空奇幻世界',
      ],
      hint: '你的故事发生在什么样的世界？',
    },
    {
      key: 'protagonist',
      label: '主角身份',
      field: 'audience.audience_type',
      options: ['AI研究员', '普通学生/青年', '黑客/技术天才', '军人/战士', '普通市民', 'AI本身'],
      hint: '故事的主人公是谁？他/她的核心特质是什么？',
      freeform: true,
    },
    {
      key: 'ai_nature',
      label: 'AI设定',
      field: 'intent.core_message',
      options: [
        '失控的超级智能',
        '被人类控制的武器系统',
        '拥有自我意识的新生命',
        '神秘未知的智能体',
        '与人类共存的AI',
      ],
      hint: '故事中的AI是什么样的存在？它为什么与人类对立？',
    },
    {
      key: 'core_conflict',
      label: '核心冲突',
      field: 'intent.desired_impact',
      options: [
        '人机对抗：谁应该掌控未来',
        '存在主义：AI是否拥有生命权',
        '伦理困境：技术发展vs人类安全',
        '成长故事：主角在AI时代找到自我',
        '悬疑惊悚：揭开AI背后的真相',
      ],
      hint: '这个故事最终想讨论什么主题？',
    },
    {
      key: 'tone',
      label: '叙事基调',
      field: 'expression.tone',
      options: ['严肃硬科幻', '动作冒险', '哲学思辨', '暗黑惊悚', '青春成长', '讽刺幽默'],
      hint: '读者在阅读时应该有什么感受？',
    },
    {
      key: 'narrative_style',
      label: '叙事方式',
      field: 'expression.style_reference',
      options: [
        '第一人称：主角视角',
        '第三人称：全知叙事',
        '多视角：多角色切换',
        '书信/日记体',
        '非线性时间线',
      ],
      hint: '你打算用什么样的叙事手法讲故事？',
    },
    {
      key: 'audience',
      label: '目标读者',
      field: 'audience.knowledge_level',
      options: ['科幻爱好者', '青少年', '文学读者', '大众读者', '类型小说读者'],
      hint: '你希望谁来读这本书？',
    },
    {
      key: 'scope',
      label: '篇幅规划',
      field: 'constraint.length_min',
      options: [
        '短篇（1-3万字）',
        '中篇（5-10万字）',
        '长篇（15万+）',
        '系列作品',
        '先写开头试试看',
      ],
      hint: '你计划写多长？这会决定结构设计。',
      freeform: true,
    },
  ],
};

// =========================================================================
// Short Story Schema
// =========================================================================

const SHORT_STORY_SCHEMA: ClarificationSchema = {
  type: 'short_story',
  intro: '短篇故事需要高度聚焦。让我帮你锁定核心要素。',
  dimensions: [
    {
      key: 'genre',
      label: '故事类型',
      field: 'intent.purpose',
      options: ['科幻', '悬疑', '爱情', '现实主义', '奇幻', '恐怖'],
      freeform: true,
    },
    {
      key: 'protagonist',
      label: '主角',
      field: 'audience.audience_type',
      options: ['自定义', '年轻人', '中年人', '老人', '非人视角'],
      freeform: true,
    },
    {
      key: 'core_emotion',
      label: '核心情感',
      field: 'intent.core_message',
      options: ['希望', '悲伤', '恐惧', '温暖', '讽刺', '震撼'],
    },
    {
      key: 'tone',
      label: '叙事基调',
      field: 'expression.tone',
      options: ['轻快', '深沉', '紧张', '诗意', '犀利'],
    },
    {
      key: 'length',
      label: '字数',
      field: 'constraint.length_min',
      options: ['500字', '1000-3000字', '5000-10000字'],
      freeform: true,
    },
  ],
};

// =========================================================================
// Screenplay Schema
// =========================================================================

const SCREENPLAY_SCHEMA: ClarificationSchema = {
  type: 'screenplay',
  intro: '剧本创作需要兼顾故事性和视觉呈现。我们先确定基础框架。',
  dimensions: [
    {
      key: 'format',
      label: '剧本类型',
      field: 'intent.purpose',
      options: ['电影剧本', '电视剧/网剧', '短视频系列', '动画剧本', '舞台剧'],
    },
    {
      key: 'genre',
      label: '题材',
      field: 'expression.tone',
      options: ['科幻', '悬疑', '喜剧', '爱情', '动作', '文艺', '纪录片'],
      freeform: true,
    },
    {
      key: 'protagonist',
      label: '主角设定',
      field: 'audience.audience_type',
      options: ['普通人', '反英雄', '英雄式主角', '群像（无单一主角）'],
      freeform: true,
    },
    {
      key: 'core_conflict',
      label: '核心冲突',
      field: 'intent.core_message',
      options: ['人与技术', '人与社会', '内心挣扎', '人与命运', '人与人'],
    },
    {
      key: 'audience',
      label: '目标观众',
      field: 'audience.knowledge_level',
      options: ['大众观众', '文艺片受众', '年轻观众', '类型片爱好者'],
    },
    {
      key: 'scope',
      label: '时长/篇幅',
      field: 'constraint.length_min',
      options: ['短片（<30分钟）', '标准电影（90-120分钟）', '剧集第一季大纲', '先写关键场景'],
    },
  ],
};

// =========================================================================
// Research Schema
// =========================================================================

const RESEARCH_SCHEMA: ClarificationSchema = {
  type: 'research',
  intro: '学术写作需要严谨的结构和方法论。',
  dimensions: [
    {
      key: 'field',
      label: '研究领域',
      field: 'intent.purpose',
      options: [],
      freeform: true,
      hint: '具体的研究方向是什么？',
    },
    {
      key: 'thesis',
      label: '核心论点',
      field: 'intent.core_message',
      options: [],
      freeform: true,
      hint: '一句话概括你的核心发现或主张',
    },
    {
      key: 'method',
      label: '研究方法',
      field: 'expression.tone',
      options: ['实验研究', '文献综述', '案例分析', '理论分析', '混合方法'],
    },
    {
      key: 'audience',
      label: '读者水平',
      field: 'audience.audience_type',
      options: ['同行学者', '研究生', '跨学科读者', '政策制定者'],
    },
    {
      key: 'format',
      label: '论文类型',
      field: 'constraint.format',
      options: ['期刊论文', '学位论文', '会议论文', '研究报告'],
    },
    {
      key: 'length',
      label: '字数',
      field: 'constraint.length_min',
      options: ['3000-5000字', '8000-10000字', '20000字+'],
      freeform: true,
    },
  ],
};

// =========================================================================
// Business Plan Schema
// =========================================================================

const BUSINESS_PLAN_SCHEMA: ClarificationSchema = {
  type: 'business_plan',
  intro: '商业计划需要清晰的市场分析和可执行的策略。',
  dimensions: [
    {
      key: 'industry',
      label: '行业/赛道',
      field: 'intent.purpose',
      options: [],
      freeform: true,
      hint: '你要进入哪个行业？',
    },
    {
      key: 'value_prop',
      label: '核心价值',
      field: 'intent.core_message',
      options: [],
      freeform: true,
      hint: '你的产品或服务解决了什么核心问题？',
    },
    {
      key: 'audience',
      label: '目标客户',
      field: 'audience.audience_type',
      options: ['B2B企业客户', 'B2C消费者', '政府/公共部门'],
      freeform: true,
    },
    {
      key: 'competition',
      label: '竞争定位',
      field: 'audience.knowledge_level',
      options: ['蓝海（无直接竞品）', '差异化竞争', '成本领先'],
      hint: '你与现有玩家的区别是什么？',
    },
    {
      key: 'tone',
      label: '表达风格',
      field: 'expression.tone',
      options: ['激昂/愿景驱动', '数据/理性分析', '务实/可执行'],
    },
    {
      key: 'format',
      label: '输出格式',
      field: 'constraint.format',
      options: ['BP完整版', 'Pitch Deck', '一页纸摘要'],
    },
  ],
};

// =========================================================================
// Course Schema
// =========================================================================

const COURSE_SCHEMA: ClarificationSchema = {
  type: 'course',
  intro: '教育内容需要清晰的学习路径和可衡量的学习目标。',
  dimensions: [
    {
      key: 'topic',
      label: '课程主题',
      field: 'intent.purpose',
      options: [],
      freeform: true,
      hint: '这门课教什么？',
    },
    {
      key: 'students',
      label: '目标学员',
      field: 'audience.audience_type',
      options: ['零基础入门', '有一定基础', '进阶/专家'],
      hint: '学员的起点是什么？',
    },
    {
      key: 'outcome',
      label: '学完能做什么',
      field: 'intent.core_message',
      options: [],
      freeform: true,
      hint: '学员学完这门课应该能完成什么任务？',
    },
    {
      key: 'format',
      label: '内容形式',
      field: 'constraint.format',
      options: ['文字教程', '视频课程大纲', '互动练习', '混合形式'],
    },
    {
      key: 'scope',
      label: '课程规模',
      field: 'constraint.length_min',
      options: ['单篇教程', '系列文章（3-5篇）', '完整课程（10+章节）'],
    },
  ],
};

// =========================================================================
// Personal Essay Schema
// =========================================================================

const PERSONAL_ESSAY_SCHEMA: ClarificationSchema = {
  type: 'personal_essay',
  intro: '个人随笔最重要的是真诚和独特视角。',
  dimensions: [
    {
      key: 'theme',
      label: '写作主题',
      field: 'intent.purpose',
      options: [],
      freeform: true,
      hint: '你想分享什么经历或感悟？',
    },
    {
      key: 'angle',
      label: '独特视角',
      field: 'intent.core_message',
      options: [],
      freeform: true,
      hint: '你对此事最独特的看法是什么？',
    },
    {
      key: 'tone',
      label: '写作风格',
      field: 'expression.tone',
      options: ['温暖治愈', '犀利观察', '幽默自嘲', '哲思沉淀', '白描记录'],
    },
    {
      key: 'audience',
      label: '写给谁',
      field: 'audience.audience_type',
      options: ['自己（不公开）', '朋友圈/熟人', '公开平台', '投稿'],
    },
    {
      key: 'length',
      label: '篇幅',
      field: 'constraint.length_min',
      options: ['500-1000字', '1500-3000字', '不限'],
      freeform: true,
    },
  ],
};

// =========================================================================
// Poetry Schema
// =========================================================================

const POETRY_SCHEMA: ClarificationSchema = {
  type: 'poetry',
  intro: '诗歌是最自由的表达形式。让我理解你的创作方向。',
  dimensions: [
    {
      key: 'form',
      label: '诗歌形式',
      field: 'intent.purpose',
      options: ['现代自由诗', '古体诗', '近体诗/格律', '歌词', '散文诗'],
      freeform: true,
    },
    {
      key: 'theme',
      label: '主题',
      field: 'intent.core_message',
      options: ['爱情', '自然', '社会', '哲学', '个人', '战争与和平'],
      freeform: true,
    },
    {
      key: 'emotion',
      label: '情感基调',
      field: 'expression.tone',
      options: ['沉思', '激昂', '忧伤', '讽刺', '赞美'],
    },
    {
      key: 'scope',
      label: '规模',
      field: 'constraint.length_min',
      options: ['单首诗', '组诗（3-5首）', '诗集框架'],
    },
  ],
};

// =========================================================================
// Unknown Schema (gentle discovery)
// =========================================================================

const UNKNOWN_SCHEMA: ClarificationSchema = {
  type: 'unknown',
  intro: '让我先多了解一下你的想法。',
  dimensions: [
    {
      key: 'what',
      label: '你想创作什么',
      field: 'intent.purpose',
      options: [],
      freeform: true,
      hint: '能多描述一些吗？比如：这是一个故事？一篇文章？一个课程？',
    },
    {
      key: 'why',
      label: '为什么想创作',
      field: 'intent.core_message',
      options: [],
      freeform: true,
      hint: '你创作这个作品的目的是什么？',
    },
    {
      key: 'who',
      label: '谁会读',
      field: 'audience.audience_type',
      options: ['自己', '朋友', '公众', '专业读者'],
      freeform: true,
    },
  ],
};

// =========================================================================
// Schema Registry
// =========================================================================

const SCHEMA_REGISTRY: Record<CreativeType, ClarificationSchema> = {
  fiction_novel: FICTION_NOVEL_SCHEMA,
  short_story: SHORT_STORY_SCHEMA,
  screenplay: SCREENPLAY_SCHEMA,
  article: ARTICLE_SCHEMA,
  research: RESEARCH_SCHEMA,
  business_plan: BUSINESS_PLAN_SCHEMA,
  course: COURSE_SCHEMA,
  personal_essay: PERSONAL_ESSAY_SCHEMA,
  poetry: POETRY_SCHEMA,
  unknown: UNKNOWN_SCHEMA,
};

/**
 * Get the clarification schema for a given creative type.
 */
export function getClarificationSchema(type: CreativeType): ClarificationSchema {
  return SCHEMA_REGISTRY[type] || SCHEMA_REGISTRY.unknown;
}

/**
 * Get all available creative types with their labels.
 */
export function listCreativeTypes(): Array<{ type: CreativeType; emoji: string; label: string }> {
  return Object.entries(CREATIVE_TYPE_LABELS).map(([type, info]) => ({
    type: type as CreativeType,
    emoji: info.emoji,
    label: info.label,
  }));
}
