/**
 * Context Runtime Signals — Sprint 4
 * Detects and classifies context changes during writing to trigger
 * appropriate system responses (pause, fork, propose, ignore).
 */

// =========================================================================
// Context Signal Types — what kind of change was detected?
// =========================================================================

export type ContextSignalType =
  | 'TYPO' // Minor typo or spelling error — low impact, no action
  | 'STYLE' // Word choice or phrasing change — feed Style Evolution
  | 'FACT' // Factual information added/removed — trigger Knowledge check
  | 'MEANING' // Semantic meaning shift — trigger Consistency check
  | 'INTENT' // Core argument/viewpoint change — trigger Proposal
  | 'TOPIC_SHIFT' // User is changing the subject entirely — pause, ask to fork
  | 'TEMP_REQUEST' // User asked a temporary question — don't change PCS
  | 'USER_EVIDENCE' // User added personal experience — record in Knowledge
  | 'EMOTION'; // User expressed frustration or satisfaction — adjust AI behavior

// =========================================================================
// Context Signal — detected change with metadata
// =========================================================================

export interface ContextSignal {
  /** Unique signal ID */
  id: string;
  /** What type of signal */
  type: ContextSignalType;
  /** Which node was active when detected */
  nodeId: string;
  /** The text that triggered the detection */
  triggerText: string;
  /** System confidence that this classification is correct (0-1) */
  confidence: number;
  /** Recommended action for the system */
  recommendedAction: SignalAction;
  /** ISO timestamp */
  detectedAt: string;
  /** Additional context (e.g., which PCS field may need updating) */
  metadata?: Record<string, string>;
}

// =========================================================================
// Signal Action — what the system should do
// =========================================================================

export type SignalAction =
  | 'IGNORE' // No action needed
  | 'LOG_STYLE' // Record for Style Evolution
  | 'CHECK_KNOWLEDGE' // Verify against Knowledge layer
  | 'CHECK_CONSISTENCY' // Run Consistency Engine
  | 'CREATE_PROPOSAL' // Create a PCS Proposal for user confirmation
  | 'PAUSE_AND_ASK' // Pause AI generation, ask user to confirm
  | 'FORK_DISCUSSION' // Create a conversation thread fork
  | 'ADJUST_BEHAVIOR'; // Modify AI interaction mode

// =========================================================================
// Signal Detector — V1 rule-based, V2 LLM-based
// =========================================================================

export interface SignalDetectionResult {
  signals: ContextSignal[];
}

/**
 * Detect context signals from user input text.
 * V1: keyword + pattern-based heuristic.
 */
export function detectSignals(
  userInput: string,
  nodeId: string,
  previousContent: string,
): SignalDetectionResult {
  const signals: ContextSignal[] = [];

  // TYPO detection: very small changes (1-2 characters different)
  if (isTypoCorrection(userInput, previousContent)) {
    signals.push(createSignal('TYPO', nodeId, userInput, 0.9, 'IGNORE'));
  }

  // TOPIC_SHIFT detection: user mentions a completely new subject
  if (detectTopicShift(userInput)) {
    signals.push(createSignal('TOPIC_SHIFT', nodeId, userInput, 0.75, 'PAUSE_AND_ASK'));
    return { signals }; // Topic shift is dominant — skip other checks
  }

  // TEMP_REQUEST detection: user is asking a question, not editing
  if (detectTempRequest(userInput)) {
    signals.push(createSignal('TEMP_REQUEST', nodeId, userInput, 0.85, 'FORK_DISCUSSION'));
    return { signals };
  }

  // INTENT change detection
  if (detectIntentChange(userInput, previousContent)) {
    signals.push(createSignal('INTENT', nodeId, userInput, 0.6, 'CREATE_PROPOSAL'));
  }

  // MEANING change detection
  if (detectMeaningChange(userInput, previousContent)) {
    signals.push(createSignal('MEANING', nodeId, userInput, 0.55, 'CHECK_CONSISTENCY'));
  }

  // USER_EVIDENCE detection
  if (detectUserEvidence(userInput)) {
    signals.push(createSignal('USER_EVIDENCE', nodeId, userInput, 0.7, 'LOG_STYLE'));
  }

  // STYLE change (default for moderate changes)
  if (signals.length === 0 && userInput.length > 10) {
    const diffRatio =
      previousContent.length > 0
        ? Math.abs(userInput.length - previousContent.length) / previousContent.length
        : 1;
    if (diffRatio > 0.1 && diffRatio < 0.5) {
      signals.push(createSignal('STYLE', nodeId, userInput, 0.5, 'LOG_STYLE'));
    }
  }

  return { signals };
}

// =========================================================================
// Heuristic detectors
// =========================================================================

function isTypoCorrection(current: string, previous: string): boolean {
  const lenDiff = Math.abs(current.length - previous.length);
  return lenDiff <= 3 && previous.length > 20;
}

function detectTopicShift(text: string): boolean {
  const shiftPhrases = [
    '换一个',
    '不写',
    '改主题',
    '不是这个',
    '重新来',
    '写错了',
    '不是教育',
    '不是关于',
    '换个话题',
  ];
  return shiftPhrases.some((p) => text.includes(p));
}

function detectTempRequest(text: string): boolean {
  const questionPatterns = [
    /^为什么/,
    /^怎么/,
    /^什么是/,
    /^能否/,
    /^可以/,
    /是吗/,
    /对吗/,
    /好不好/,
    /行不行/,
  ];
  return questionPatterns.some((p) => p.test(text.trim()));
}

function detectIntentChange(current: string, previous: string): boolean {
  if (previous.length === 0) return false;
  const diffRatio = Math.abs(current.length - previous.length) / previous.length;
  // Very large changes (>70% different) might be intent changes
  return diffRatio > 0.7 && current.length > 50;
}

function detectMeaningChange(current: string, previous: string): boolean {
  if (previous.length === 0) return false;
  const diffRatio = Math.abs(current.length - previous.length) / previous.length;
  return diffRatio > 0.4 && diffRatio <= 0.7;
}

function detectUserEvidence(text: string): boolean {
  const evidencePhrases = [
    '我的经验',
    '我经历过',
    '我之前',
    '我真实',
    '实际工作中',
    '我以前',
    '我们公司',
    '我们学校',
  ];
  return evidencePhrases.some((p) => text.includes(p));
}

function createSignal(
  type: ContextSignalType,
  nodeId: string,
  triggerText: string,
  confidence: number,
  action: SignalAction,
): ContextSignal {
  return {
    id: `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    nodeId,
    triggerText: triggerText.slice(0, 200),
    confidence,
    recommendedAction: action,
    detectedAt: new Date().toISOString(),
  };
}
