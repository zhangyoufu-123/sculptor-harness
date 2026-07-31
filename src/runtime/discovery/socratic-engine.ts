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
 * Generate questions from different perspectives.
 * From STORM: discover perspectives, use each as a lens for questions.
 * V1: hardcoded writing perspectives. V2: LLM-generated from similar-content.
 */
export function generatePerspectiveQuestions(
  topic: string,
  creativeType: string,
): PerspectiveQuestion[] {
  const perspectives: PerspectiveQuestion[] = [];

  if (
    creativeType.includes('论文') ||
    creativeType.includes('学术') ||
    creativeType.includes('research')
  ) {
    perspectives.push(
      {
        perspective: '定义边界',
        question: `关于"${topic}"，你研究的核心问题是什么？范围有多大？`,
        relevance: 0.9,
      },
      {
        perspective: '文献对话',
        question: `在这个话题上，已有的研究/观点中，你最不同意的是什么？`,
        relevance: 0.85,
      },
      {
        perspective: '方法论',
        question: `你打算用什么方法来论证？案例分析？数据分析？文献综述？`,
        relevance: 0.8,
      },
      {
        perspective: '读者预期',
        question: `这篇论文的目标读者是谁？他们为什么需要读这篇论文？`,
        relevance: 0.75,
      },
    );
  } else if (
    creativeType.includes('小说') ||
    creativeType.includes('故事') ||
    creativeType.includes('novel')
  ) {
    perspectives.push(
      {
        perspective: '世界观',
        question: `这个世界有什么独特规则？读者进入时最先感受到什么？`,
        relevance: 0.9,
      },
      {
        perspective: '人物驱动',
        question: `主角内心最大的矛盾是什么？他/她最害怕失去什么？`,
        relevance: 0.9,
      },
      {
        perspective: '情感弧线',
        question: `你希望读者在故事的哪个节点开始流泪（或大笑）？`,
        relevance: 0.85,
      },
      {
        perspective: '叙事结构',
        question: `故事是按时间顺序展开，还是有倒叙/插叙？`,
        relevance: 0.75,
      },
    );
  } else {
    perspectives.push(
      {
        perspective: '核心观点',
        question: `如果只让读者记住一句话，你希望是哪句？`,
        relevance: 0.9,
      },
      {
        perspective: '读者共鸣',
        question: `什么样的人读到这篇文章会感觉"这就是在写我"？`,
        relevance: 0.85,
      },
      {
        perspective: '独特角度',
        question: `和同类话题的文章比，你的文章最不一样的地方是什么？`,
        relevance: 0.8,
      },
      { perspective: '行动呼吁', question: `你希望读者读完文章后做什么？`, relevance: 0.75 },
    );
  }

  return perspectives.sort((a, b) => b.relevance - a.relevance);
}
