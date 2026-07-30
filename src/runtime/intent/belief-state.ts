/**
 * Belief State — the continuous cognitive model of the user.
 *
 * Unlike static intent classification (keyword → type), the Belief State
 * evolves with every user interaction. It tracks:
 * - What we believe the user wants (with confidence)
 * - What we're uncertain about (ranked by information gain)
 * - How the user behaves (preferences, patterns)
 *
 * This is the "brain" that drives Active Learning question selection.
 */

export interface ArtifactBelief {
  type: string;
  confidence: number; // 0-1, how sure we are this is the right type
  signals: string[]; // What evidence supports this belief
}

export interface TopicBelief {
  topic: string;
  confidence: number;
  subtopics: string[];
}

export interface DirectionBelief {
  direction: string;
  confidence: number;
  /** What question would help confirm/reject this direction */
  validationQuestion: string;
}

export interface UserPattern {
  /** What pattern was observed */
  pattern: string;
  /** How many times */
  occurrences: number;
  /** When first observed */
  firstSeen: string;
}

export interface BeliefState {
  /** What type of artifact we think the user wants */
  artifactBeliefs: ArtifactBelief[];
  /** What topic(s) the user is focused on */
  topicBeliefs: TopicBelief[];
  /** Possible creative directions (hypotheses) */
  directionBeliefs: DirectionBelief[];
  /** What we DON'T know yet */
  uncertainties: Uncertainty[];
  /** How the user behaves */
  userPatterns: UserPattern[];
  /** Number of interactions */
  interactionCount: number;
  /** Overall understanding confidence (0-1) */
  overallConfidence: number;
  /** Session ID */
  sessionId: string;
}

export interface Uncertainty {
  /** What we need to know */
  question: string;
  /** Estimated information gain if answered (0-1) */
  informationGain: number;
  /** How much this affects the final output (0-1) */
  impact: number;
  /** Has this been asked? */
  asked: boolean;
  /** Category of uncertainty */
  category: 'artifact_type' | 'topic' | 'purpose' | 'audience' | 'tone' | 'scope' | 'direction';
}

// =========================================================================
// Factory
// =========================================================================

export function createBeliefState(idea: string): BeliefState {
  const sessionId = `belief-${Date.now().toString(36)}`;

  return {
    artifactBeliefs: [],
    topicBeliefs: [],
    directionBeliefs: [],
    uncertainties: seedUncertainties(idea),
    userPatterns: [],
    interactionCount: 0,
    overallConfidence: 0.2,
    sessionId,
  };
}

function seedUncertainties(idea: string): Uncertainty[] {
  const uncertainties: Uncertainty[] = [];

  // Does the user mention a specific artifact type?
  const hasArtifact = /小说|论文|文章|报告|故事|博客|教程|演讲稿|诗/.test(idea);

  if (!hasArtifact) {
    uncertainties.push({
      question: '你想创作什么类型的作品？',
      informationGain: 0.9,
      impact: 0.95,
      asked: false,
      category: 'artifact_type',
    });
  }

  // Always need to understand the core topic/angle
  uncertainties.push({
    question: '关于这个主题，你最想表达什么核心观点？',
    informationGain: 0.85,
    impact: 0.9,
    asked: false,
    category: 'purpose',
  });

  uncertainties.push({
    question: '这个作品主要给谁看？',
    informationGain: 0.7,
    impact: 0.75,
    asked: false,
    category: 'audience',
  });

  // Add topic-specific uncertainties based on the idea content
  if (
    idea.includes('山林') ||
    idea.includes('自然') ||
    idea.includes('独') ||
    idea.includes('旅行')
  ) {
    uncertainties.push({
      question: '这次经历中，最触动你的是什么？是什么让你决定写下这些感悟？',
      informationGain: 0.9,
      impact: 0.9,
      asked: false,
      category: 'direction',
    });
  }

  return uncertainties;
}

// =========================================================================
// State Updates
// =========================================================================

/**
 * Update the belief state with new information from a user answer.
 */
export function updateBelief(
  state: BeliefState,
  userAnswer: string,
  addressedUncertainty?: string,
): void {
  state.interactionCount++;

  // Remove the addressed uncertainty
  if (addressedUncertainty) {
    state.uncertainties = state.uncertainties.filter((u) => u.question !== addressedUncertainty);
  }

  // Update topic beliefs (extract entities from answer)
  const topicWords = userAnswer
    .replace(/[的了吗呢吧啊]/g, '')
    .split(/[\s，。、；：""''！？\n]+/)
    .filter((w) => w.length > 1 && !['我想', '一篇', '一个', '一本', '关于'].includes(w));

  for (const word of topicWords.slice(0, 3)) {
    const existing = state.topicBeliefs.find((t) => t.topic.includes(word));
    if (existing) {
      existing.confidence = Math.min(existing.confidence + 0.1, 1.0);
    } else if (word.length >= 2) {
      state.topicBeliefs.push({ topic: word, confidence: 0.5, subtopics: [] });
    }
  }

  // Update artifact beliefs based on user answer
  const artifactKeywords: Record<string, string> = {
    散文: '散文',
    随笔: '散文',
    杂文: '散文',
    小说: '小说',
    故事: '小说',
    叙事: '小说',
    论文: '学术论文',
    研究: '学术论文',
    文章: '文章',
    博客: '博客',
    公众号: '博客',
    诗: '诗歌',
    诗歌: '诗歌',
    报告: '报告',
    教程: '教程',
  };

  for (const [keyword, artifactType] of Object.entries(artifactKeywords)) {
    if (userAnswer.includes(keyword)) {
      // Replace existing beliefs — user explicitly stated the type
      const existing = state.artifactBeliefs.find((a) => a.type === artifactType);
      if (existing) {
        existing.confidence = 0.95; // User explicitly stated — high confidence
      } else {
        // Clear old low-confidence beliefs
        state.artifactBeliefs = state.artifactBeliefs.filter((a) => a.confidence > 0.7);
        state.artifactBeliefs.push({
          type: artifactType,
          confidence: 0.95,
          signals: [`用户明确提到"${keyword}"`],
        });
      }
      break; // Only match one artifact type
    }
  }

  // Recalculate overall confidence
  const answeredRatio =
    state.interactionCount > 0
      ? state.interactionCount / Math.max(state.uncertainties.length + state.interactionCount, 1)
      : 0;
  state.overallConfidence = Math.min(0.2 + answeredRatio * 0.6, 0.95);
}

/**
 * Record a user behavior pattern.
 */
export function recordPattern(state: BeliefState, pattern: string): void {
  const existing = state.userPatterns.find((p) => p.pattern === pattern);
  if (existing) {
    existing.occurrences++;
  } else {
    state.userPatterns.push({
      pattern,
      occurrences: 1,
      firstSeen: new Date().toISOString(),
    });
  }
}

/**
 * Get the highest information-gain unasked uncertainty.
 */
export function getNextUncertainty(state: BeliefState): Uncertainty | null {
  const unasked = state.uncertainties.filter((u) => !u.asked);
  if (unasked.length === 0) return null;

  // Sort by: informationGain * impact (Active Learning score)
  unasked.sort((a, b) => b.informationGain * b.impact - a.informationGain * a.impact);

  const next = unasked[0];
  next.asked = true;
  return next;
}

/**
 * Get a summary of the belief state for display.
 */
export function getBeliefSummary(state: BeliefState): string {
  const parts: string[] = [];

  if (state.artifactBeliefs.length > 0) {
    const top = state.artifactBeliefs[0];
    parts.push(`作品: ${top.type} (${Math.round(top.confidence * 100)}%)`);
  }

  if (state.topicBeliefs.length > 0) {
    const topics = state.topicBeliefs
      .slice(0, 3)
      .map((t) => t.topic)
      .join(', ');
    parts.push(`主题: ${topics}`);
  }

  parts.push(`理解: ${Math.round(state.overallConfidence * 100)}%`);
  parts.push(`交互: ${state.interactionCount}轮`);

  return parts.join(' | ');
}
