/**
 * Belief Revision Loop — the cognitive correction mechanism.
 *
 * Replaces static intent classification with hypothesis-driven understanding:
 * 1. Form initial hypotheses about user intent
 * 2. Validate through targeted questions
 * 3. Record misunderstandings and corrections
 * 4. Continuously improve the belief model
 *
 * This is the key difference between "form-filler" and "creative partner".
 */

// =========================================================================
// Belief State
// =========================================================================

export interface ArtifactHypothesis {
  value: string;
  confidence: number; // 0-1
  evidence: string[];
}

export interface IntentHypothesis {
  value: string;
  confidence: number;
  alternatives: string[];
}

export interface Uncertainty {
  field: string;
  question: string;
  importance: number; // 0-1
  asked: boolean;
}

export interface Misunderstanding {
  round: number;
  aiAssumption: string;
  userCorrection: string;
  lesson: string;
  timestamp: string;
}

export interface BeliefState {
  /** Primary artifact type hypothesis */
  artifact: ArtifactHypothesis;
  /** What the user is trying to achieve */
  intent: IntentHypothesis;
  /** Topic understanding */
  topic: { value: string; confidence: number };
  /** Audience hypothesis */
  audience: { value: string; confidence: number };
  /** Tone/style hypothesis */
  tone: { value: string; confidence: number };
  /** Current unknowns ranked by importance */
  uncertainties: Uncertainty[];
  /** Historical misunderstandings for learning */
  misunderstandings: Misunderstanding[];
  /** Overall confidence in the belief model (0-1) */
  overallConfidence: number;
  /** Interaction count */
  roundCount: number;
  /** Session ID */
  sessionId: string;
}

// =========================================================================
// Factory
// =========================================================================

export function createBeliefState(idea: string): BeliefState {
  return {
    artifact: { value: '未知', confidence: 0.3, evidence: [] },
    intent: { value: '未知', confidence: 0.3, alternatives: [] },
    topic: { value: idea, confidence: 0.5 },
    audience: { value: '未知', confidence: 0.2 },
    tone: { value: '未知', confidence: 0.2 },
    uncertainties: [],
    misunderstandings: [],
    overallConfidence: 0.2,
    roundCount: 0,
    sessionId: `belief-${Date.now().toString(36)}`,
  };
}

// =========================================================================
// Revision Operations
// =========================================================================

/**
 * Update the belief with new information from the user.
 * This is the CORE of the revision loop.
 */
export function reviseBelief(
  state: BeliefState,
  update: Partial<{
    artifact: string;
    intent: string;
    topic: string;
    audience: string;
    tone: string;
  }>,
  evidence: string,
): void {
  state.roundCount++;

  if (update.artifact) {
    const oldValue = state.artifact.value;
    state.artifact.value = update.artifact;
    state.artifact.confidence = Math.min(state.artifact.confidence + 0.2, 0.95);
    state.artifact.evidence.push(evidence);
    // Record correction if changed
    if (oldValue !== update.artifact && oldValue !== '未知') {
      recordMisunderstanding(
        state,
        oldValue,
        update.artifact,
        `"${evidence}" — 修正了作品类型判断`,
      );
    }
  }

  if (update.intent) {
    const oldValue = state.intent.value;
    state.intent.value = update.intent;
    state.intent.confidence = Math.min(state.intent.confidence + 0.25, 0.95);
    if (oldValue !== update.intent && oldValue !== '未知') {
      recordMisunderstanding(state, oldValue, update.intent, `"${evidence}" — 修正了创作意图理解`);
    }
  }

  if (update.topic) {
    state.topic.value = update.topic;
    state.topic.confidence = Math.min(state.topic.confidence + 0.2, 0.95);
  }

  if (update.audience) {
    state.audience.value = update.audience;
    state.audience.confidence = Math.min(state.audience.confidence + 0.3, 0.95);
  }

  if (update.tone) {
    state.tone.value = update.tone;
    state.tone.confidence = Math.min(state.tone.confidence + 0.3, 0.95);
  }

  // Remove addressed uncertainties
  if (update.artifact) removeUncertainty(state, 'artifact_type');
  if (update.intent) removeUncertainty(state, 'purpose');
  if (update.audience) removeUncertainty(state, 'audience');
  if (update.tone) removeUncertainty(state, 'tone');

  // Recalculate overall confidence
  state.overallConfidence = calculateConfidence(state);
}

/**
 * Record a misunderstanding for future learning.
 */
export function recordMisunderstanding(
  state: BeliefState,
  aiAssumption: string,
  userCorrection: string,
  lesson: string,
): void {
  state.misunderstandings.push({
    round: state.roundCount,
    aiAssumption,
    userCorrection,
    lesson,
    timestamp: new Date().toISOString(),
  });
  // Keep only last 20
  if (state.misunderstandings.length > 20) state.misunderstandings.shift();
}

/**
 * Add an uncertainty that needs resolution.
 */
export function addUncertainty(state: BeliefState, u: Uncertainty): void {
  if (!state.uncertainties.some((existing) => existing.field === u.field)) {
    state.uncertainties.push(u);
    state.uncertainties.sort((a, b) => b.importance - a.importance);
  }
}

/**
 * Get the highest-importance unasked uncertainty.
 */
export function getNextUncertainty(state: BeliefState): Uncertainty | null {
  const unasked = state.uncertainties.filter((u) => !u.asked);
  return unasked[0] || null;
}

/**
 * Get a summary of the belief state for LLM context.
 */
export function getBeliefContext(state: BeliefState): string {
  return [
    `作品类型: ${state.artifact.value} (${Math.round(state.artifact.confidence * 100)}%)`,
    `创作意图: ${state.intent.value} (${Math.round(state.intent.confidence * 100)}%)`,
    `主题: ${state.topic.value}`,
    `读者: ${state.audience.value} (${Math.round(state.audience.confidence * 100)}%)`,
    `语气: ${state.tone.value} (${Math.round(state.tone.confidence * 100)}%)`,
    `整体置信度: ${Math.round(state.overallConfidence * 100)}%`,
    state.misunderstandings.length > 0
      ? `历史修正: ${state.misunderstandings
          .slice(-3)
          .map((m) => m.lesson)
          .join('; ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// =========================================================================
// Helpers
// =========================================================================

function removeUncertainty(state: BeliefState, field: string): void {
  state.uncertainties = state.uncertainties.filter((u) => u.field !== field);
}

function calculateConfidence(state: BeliefState): number {
  const weights = {
    artifact: 0.3,
    intent: 0.3,
    topic: 0.2,
    audience: 0.1,
    tone: 0.1,
  };
  return (
    state.artifact.confidence * weights.artifact +
    state.intent.confidence * weights.intent +
    state.topic.confidence * weights.topic +
    state.audience.confidence * weights.audience +
    state.tone.confidence * weights.tone
  );
}
