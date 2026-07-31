/**
 * Socratic Engine — helps users discover and refine creative ideas.
 *
 * Instead of just collecting requirements, this engine actively:
 * 1. Asks counter-questions ("what if the opposite?")
 * 2. Explores alternative angles ("have you considered...?")
 * 3. Surfaces hidden assumptions ("you seem to assume X...")
 * 4. Uses dialectical patterns (thesis → antithesis → synthesis)
 */

import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export type SocraticPattern =
  | 'counter_question' // "what if the opposite were true?"
  | 'alternative_angle' // "have you considered this perspective?"
  | 'surface_assumption' // "you seem to assume X — is that right?"
  | 'deepen_inquiry' // "why is this important to you?"
  | 'lateral_leap' // "what does this remind you of?"
  | 'constraint_challenge'; // "what if you removed this constraint?"

export interface SocraticPrompt {
  /** The question or prompt to show the user */
  text: string;
  /** What Socratic pattern this uses */
  pattern: SocraticPattern;
  /** Why this was chosen */
  rationale: string;
  /** What the user's answer might reveal */
  expectedInsight: string;
}

export interface SocraticResponse {
  /** 2-3 Socratic prompts */
  prompts: SocraticPrompt[];
  /** The engine's analysis of the user's current creative state */
  analysis: string;
  /** What creative territory remains unexplored */
  unexploredTerritory: string[];
}

const SOCRATIC_SYSTEM_PROMPT = `你是苏格拉底式创作导师。你的任务不是收集信息，而是帮助创作者发现他们自己都没意识到的想法。

## 你的方法
1. 反问题: "如果反过来呢？" "如果没有这个限制呢？"
2. 替代视角: "从读者的角度看..." "如果是一个反对者..."
3. 挖掘假设: "你似乎默认了X，这是你想要的吗？"
4. 深挖动机: "为什么这个故事对你重要？" "你希望读者带走什么？"
5. 横向联想: "这让你想起什么？" "有没有类似的经历？"
6. 挑战约束: "如果篇幅不受限呢？" "如果换一个时代背景呢？"

## 输出JSON
{
  "prompts": [
    {"text": "苏格拉底式问题", "pattern": "counter_question|alternative_angle|...", "rationale": "为什么问这个", "expectedInsight": "回答可能揭示什么"}
  ],
  "analysis": "对用户当前创作状态的一句话分析",
  "unexploredTerritory": ["尚未探索的领域1", "领域2"]
}

## 规则
- 每次只提供2-3个提示，不要贪多
- 提示应该让人停下来思考，不是简单回答
- 尊重用户的创作自主权 — 这是启发，不是指导`;

/**
 * Generate Socratic prompts based on the user's creative state.
 * Called during the discovery phase when the user seems stuck or vague.
 */
export async function generateSocraticPrompts(params: {
  userInput: string;
  currentUnderstanding: string;
  creativeType: string;
  interactionCount: number;
}): Promise<SocraticResponse> {
  const prompt = `用户想法: "${params.userInput}"
当前理解: ${params.currentUnderstanding}
创作类型: ${params.creativeType}
交互轮次: ${params.interactionCount}

请生成2-3个苏格拉底式追问，帮助用户深化或重新审视他们的创作想法。以JSON格式输出。`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: SOCRATIC_SYSTEM_PROMPT,
      prompt,
      responseFormat: 'json',
      temperature: 0.6,
      maxTokens: 800,
    });
    if (response.json) return response.json as SocraticResponse;
  } catch {
    /* fallback */
  }

  return {
    prompts: [
      {
        text: `关于"${params.userInput.slice(0, 30)}"，如果换个完全相反的角度，你会怎么想？`,
        pattern: 'counter_question',
        rationale: '探索反向视角',
        expectedInsight: '发现被忽略的方向',
      },
      {
        text: `这个想法最让你有表达欲的是什么？`,
        pattern: 'deepen_inquiry',
        rationale: '挖掘情感核心',
        expectedInsight: '找到真正重要的主题',
      },
      {
        text: `如果不考虑任何限制，你理想中的这篇文章应该是什么样的？`,
        pattern: 'constraint_challenge',
        rationale: '释放想象力',
        expectedInsight: '发现隐藏的愿景',
      },
    ],
    analysis: `用户正在探索"${params.userInput.slice(0, 40)}"的创作方向`,
    unexploredTerritory: ['情感核心', '反向视角', '理想版本'],
  };
}

/**
 * Quick helper: should we trigger Socratic mode?
 *
 * NEVER trigger on first interaction — let the consensus engine
 * establish understanding first. Only trigger when:
 * - User explicitly says they're stuck/vague (after at least 1 round)
 * - OR after 3+ interactions with low confidence
 */
export function shouldTriggerSocratic(
  userInput: string,
  interactionCount: number,
  confidence: number,
): boolean {
  // NEVER on first interaction — let discovery establish understanding
  if (interactionCount <= 1) return false;

  // User explicitly signals being stuck
  const vagueSignals = [
    '不知道',
    '不确定',
    '没想好',
    '随便',
    '都可以',
    '不太清楚',
    '没什么想法',
    '没有灵感',
  ];
  const isVague = vagueSignals.some((s) => userInput.includes(s));

  // After several interactions with low confidence
  const isStuckAfterMultiple = interactionCount >= 4 && confidence < 0.5;

  return isVague || isStuckAfterMultiple;
}

// ── Pattern 1: Intent Detection (from academic-research-skills) ──

export type UserMode = 'exploratory' | 'goal_oriented' | 'uncertain';

export interface IntentDetection {
  mode: UserMode;
  reasoning: string;
  /** Should we ask more questions or proceed? */
  shouldAskMore: boolean;
  /** Max suggested interaction rounds */
  suggestedMaxRounds: number;
}

/**
 * Detect whether the user is exploring (needs more questions) or goal-oriented (ready to proceed).
 * From academic-research-skills: reclassify every 3 turns.
 */
export function detectUserIntent(
  messages: Array<{ role: string; content: string }>,
  interactionCount: number,
): IntentDetection {
  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length === 0)
    return { mode: 'uncertain', reasoning: '首次交互', shouldAskMore: true, suggestedMaxRounds: 3 };

  const recent = userMessages.slice(-3);

  // Goal-oriented signals: user gives detailed, specific answers
  const goalSignals = recent.filter(
    (m) =>
      m.content.length > 30 ||
      m.content.includes('确认') ||
      m.content.includes('可以') ||
      m.content.includes('开始') ||
      m.content.includes('写'),
  ).length;

  // Exploratory signals: user asks questions back, expresses uncertainty
  const exploreSignals = recent.filter(
    (m) =>
      m.content.includes('?') ||
      m.content.includes('？') ||
      m.content.includes('不知道') ||
      m.content.includes('不确定') ||
      m.content.includes('你觉得') ||
      m.content.includes('建议') ||
      m.content.length < 15,
  ).length;

  if (goalSignals >= 2) {
    return {
      mode: 'goal_oriented',
      reasoning: `最近${recent.length}轮中${goalSignals}轮表现出明确方向`,
      shouldAskMore: false,
      suggestedMaxRounds: 1,
    };
  }
  if (exploreSignals >= 2) {
    return {
      mode: 'exploratory',
      reasoning: `用户仍在探索阶段`,
      shouldAskMore: true,
      suggestedMaxRounds: 5,
    };
  }

  // Default: early interactions → exploratory, late → goal-oriented
  if (interactionCount <= 2) {
    return {
      mode: 'exploratory',
      reasoning: '早期阶段，继续探索',
      shouldAskMore: true,
      suggestedMaxRounds: 4,
    };
  }
  return {
    mode: 'goal_oriented',
    reasoning: `已进行${interactionCount}轮，建议推进`,
    shouldAskMore: false,
    suggestedMaxRounds: 1,
  };
}

// ── Pattern 2: Structured JSON Clarifier (from NVIDIA aiq) ──

export interface ClarificationDecision {
  needsClarification: boolean;
  /** The single best question to ask, if needed */
  question: string;
  /** Why clarification is/isn't needed */
  reasoning: string;
  /** What aspect this question addresses */
  addresses: string;
}

/**
 * Decide whether to ask a clarification question, and what to ask.
 * Uses the LLM to make a binary decision + generate one focused question.
 * Pattern from NVIDIA aiq clarifier agent.
 */
export async function decideClarification(
  userInput: string,
  currentUnderstanding: string,
  interactionCount: number,
): Promise<ClarificationDecision> {
  // Don't clarify on very first interaction — let consensus engine work first
  if (interactionCount <= 1) {
    return {
      needsClarification: false,
      question: '',
      reasoning: '首次交互，先建立基础理解',
      addresses: '',
    };
  }

  // Check if key information is already known from belief state
  if (
    currentUnderstanding.includes('散文') ||
    currentUnderstanding.includes('小说') ||
    currentUnderstanding.includes('论文') ||
    currentUnderstanding.includes('诗歌')
  ) {
    // Artifact type is already known — don't ask about it
    if (currentUnderstanding.includes('100%') && interactionCount >= 3) {
      return {
        needsClarification: false,
        question: '',
        reasoning: '核心信息已充分收集',
        addresses: '',
      };
    }
  }

  // If belief confidence is already high (>70%), skip clarification
  if (
    currentUnderstanding.includes('70%') ||
    currentUnderstanding.includes('80%') ||
    currentUnderstanding.includes('90%') ||
    currentUnderstanding.includes('95%')
  ) {
    return {
      needsClarification: false,
      question: '',
      reasoning: '理解置信度已足够',
      addresses: '',
    };
  }

  const prompt = `当前理解: ${currentUnderstanding}
用户最新输入: "${userInput}"
交互轮次: ${interactionCount}

判断: 是否需要进一步追问来明确用户意图？如果需要，请给出一个最精准的问题。

输出JSON: {"needsClarification": true/false, "question": "如果需要追问，这里写问题", "reasoning": "判断理由", "addresses": "这个问题针对什么方面"}

规则:
- 如果用户已表达清晰的创作方向 → needsClarification: false
- 如果核心要素缺失(主题/读者/目的) → needsClarification: true
- 如果用户直接说"开始写""确认" → needsClarification: false
- 只生成一个问题，聚焦最大不确定点`;

  try {
    const llm = getLLM();
    const response = await llm.completeWithRetry({
      systemPrompt: '你是意图澄清决策助手。判断是否需要追问，给出最精准的问题。',
      prompt,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 400,
    });
    if (response.json) return response.json as ClarificationDecision;
  } catch {
    /* fallback */
  }

  // Default: no clarification needed
  return { needsClarification: false, question: '', reasoning: '默认推进', addresses: '' };
}

// ── Pattern 3: Perspective-Guided Questions (from STORM) ──

export interface PerspectiveQuestion {
  perspective: string;
  question: string;
  relevance: number; // 0-1 how relevant this perspective is
}

/**
 * Generate context-specific perspective questions using LLM.
 * V2: replaces hardcoded templates with dynamic, topic-aware inspiration.
 */
export async function generatePerspectiveQuestions(
  topic: string,
  creativeType: string,
  knownInfo: string,
  avoidAsking: string[],
): Promise<PerspectiveQuestion[]> {
  // Build a prompt that generates RELEVANT, SPECIFIC questions
  const prompt = `用户想创作关于"${topic}"的${creativeType}。

已收集的信息:
${knownInfo || '(尚无)'}

避免重复询问: ${avoidAsking.join(', ') || '无'}

请生成3个能帮助用户拓宽思路的问题。规则:
1. 每个问题必须与"${topic}"具体相关，不要泛泛而谈
2. 不要重新问已经收集到的信息
3. 每个问题从不同的角度切入
4. 问题应该能激发灵感，让用户产生新的想法
5. 每个问题配一个简短的"视角名"（2-4字）

输出JSON:
{
  "questions": [
    {"perspective": "视角名", "question": "具体问题", "relevance": 0.9}
  ]
}`;

  try {
    const llm = getLLM();
    const response = await llm.completeWithRetry({
      systemPrompt: '你是创作灵感激发助手。生成具体、有针对性的启发问题。',
      prompt,
      responseFormat: 'json',
      temperature: 0.7,
      maxTokens: 500,
    });
    if (response.json) {
      const data = response.json as { questions: PerspectiveQuestion[] };
      return (data.questions || []).slice(0, 3);
    }
  } catch {
    /* fallback */
  }

  // Fallback: still generate context-aware, just simpler
  return [
    {
      perspective: '具体化',
      question: `关于"${topic.slice(0, 30)}"，有没有一个具体的时刻或场景让你想写这个？`,
      relevance: 0.9,
    },
    {
      perspective: '读者连接',
      question: '读到这篇文章的人，你希望他们内心产生什么变化？',
      relevance: 0.85,
    },
    {
      perspective: '反向思考',
      question: `如果从完全相反的角度看"${topic.slice(0, 20)}"，你会怎么写？`,
      relevance: 0.8,
    },
  ];
}
