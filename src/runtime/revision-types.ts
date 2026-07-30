// =========================================================================
// Human Revision Runtime — Type Definitions
// =========================================================================
// Sprint 1: Captures user writing behavior as structured events,
// detects WHY users make changes, and feeds Style Evolution correctly.

import type { DraftState } from '@/pcs/types';

// =========================================================================
// Revision Event — atomic record of a single edit action
// =========================================================================

/** The type of a single revision event */
export type RevisionEventType =
  | 'USER_INSERT' // User typed new text
  | 'USER_DELETE' // User removed text
  | 'USER_REPLACE' // User selected and replaced text
  | 'USER_PASTE' // User pasted external content
  | 'USER_UNDO' // User undid previous action
  | 'USER_REDO' // User redid previously undone action
  | 'AI_SUGGESTION_ACCEPT' // User accepted AI suggestion
  | 'AI_SUGGESTION_REJECT' // User rejected AI suggestion
  | 'AI_SUGGESTION_MODIFY' // User modified AI suggestion before accepting
  | 'USER_EXPLANATION'; // User explained why they made a change

/** The source of the content change */
export type RevisionSource = 'keyboard' | 'ai' | 'clipboard' | 'undo_stack';

/** A single revision event — the smallest unit of editing */
export interface RevisionEvent {
  /** Unique event ID */
  id: string;
  /** Which session this belongs to */
  sessionId: string;
  /** Which node was being edited */
  nodeId: string;
  /** What kind of edit happened */
  type: RevisionEventType;
  /** Where the content came from */
  source: RevisionSource;
  /** Text before this event (snapshot) */
  beforeSnapshot: string;
  /** Text after this event (snapshot) */
  afterSnapshot: string;
  /** Character position where the change occurred */
  position: number;
  /** ISO timestamp */
  timestamp: string;
  /** If this was an AI suggestion, the suggestion ID */
  aiSuggestionId?: string;
}

// =========================================================================
// Revision Intent — WHY did the user make this change?
// =========================================================================

/** The user's reason for making a revision */
export type RevisionIntentReason =
  | 'STYLE' // Expressing in my own voice
  | 'FACT' // Correcting or adding factual information
  | 'OPINION' // Changing the core argument/viewpoint
  | 'STRUCTURE' // Reorganizing content flow
  | 'PERSONAL_EXPERIENCE' // Adding personal knowledge/experience
  | 'CLARITY' // Making it easier to understand
  | 'UNKNOWN'; // User didn't specify

/** Captured user intent for a revision — the WHY behind the edit */
export interface RevisionIntent {
  /** Links to the revision event */
  revisionId: string;
  /** The user's stated reason */
  reason: RevisionIntentReason;
  /** How confident the system is in this classification (0-1) */
  confidence: number;
  /** Whether the user explicitly confirmed this reason */
  userConfirmed: boolean;
  /** ISO timestamp */
  capturedAt: string;
  /** Free-text user explanation (if provided) */
  userExplanation?: string;
}

// =========================================================================
// Revision Session — a continuous editing period
// =========================================================================

/** What triggered the start of a revision session */
export type SessionTrigger =
  | 'user_edit' // User started typing
  | 'ai_assist' // User triggered AI assistance
  | 'paste_external' // User pasted content from outside
  | 'rollback' // User rolled back to a previous version
  | 'node_enter' // User opened the node for editing
  | 'unlock'; // User unlocked an approved node

/** Summary statistics for a revision session */
export interface RevisionSessionSummary {
  /** Total words added during session */
  wordsAdded: number;
  /** Total words deleted during session */
  wordsDeleted: number;
  /** Net word change */
  netChange: number;
  /** Did the writing style change significantly? */
  styleChanged: boolean;
  /** Did the core meaning change? */
  meaningChanged: boolean;
  /** Number of distinct edit operations */
  operationCount: number;
  /** Distribution of event types */
  eventTypeDistribution: Record<RevisionEventType, number>;
}

/** A continuous editing session on a single node */
export interface RevisionSession {
  /** Unique session ID */
  id: string;
  /** Which node was being edited */
  nodeId: string;
  /** The project */
  projectId: string;
  /** When the session started */
  startTime: string;
  /** When the session ended (null if still active) */
  endTime: string | null;
  /** What triggered this session */
  trigger: SessionTrigger;
  /** The node's draft state when session started */
  initialState: DraftState;
  /** The node's draft state when session ended */
  finalState: DraftState | null;
  /** All revision events in this session */
  events: RevisionEvent[];
  /** Captured intents for significant changes */
  intents: RevisionIntent[];
  /** Session summary (populated on close) */
  summary: RevisionSessionSummary | null;
}

// =========================================================================
// Impact Detection — how significant is this change?
// =========================================================================

/** Impact level of a revision on the PCS */
export type RevisionImpactLevel =
  | 'L0_FORMAT' // Typo, spacing, punctuation
  | 'L1_STYLE' // Word choice, sentence structure
  | 'L2_CONTENT' // Factual changes, added/removed information
  | 'L3_STRUCTURE' // Paragraph reorganization, flow changes
  | 'L4_INTENT'; // Core argument/viewpoint shift

/** Detected impact of a revision operation */
export interface RevisionImpact {
  /** The impact level */
  level: RevisionImpactLevel;
  /** Whether this triggers a consistency check */
  requiresConsistencyCheck: boolean;
  /** Whether this should be recorded as a training sample */
  isTrainingWorthy: boolean;
  /** Whether the user should be asked for intent */
  shouldAskIntent: boolean;
  /** Description of what changed */
  description: string;
  /** Affected PCS fields */
  affectedFields: string[];
}

// =========================================================================
// Intent Classifier — heuristic detection
// =========================================================================

/**
 * Heuristically classify the user's intent based on text diff.
 * V1: rule-based keyword + structural analysis.
 * V2: LLM-based semantic analysis.
 */
export function classifyRevisionIntent(
  before: string,
  after: string,
  eventType: RevisionEventType,
): { reason: RevisionIntentReason; confidence: number } {
  // Paste from clipboard → PERSONAL_EXPERIENCE or FACT
  if (eventType === 'USER_PASTE') {
    return { reason: 'PERSONAL_EXPERIENCE', confidence: 0.6 };
  }

  // User rejected AI → STYLE (they want their own voice)
  if (eventType === 'AI_SUGGESTION_REJECT') {
    return { reason: 'STYLE', confidence: 0.7 };
  }

  // Analyze the text difference
  const diffRatio =
    before.length > 0
      ? Math.abs(before.length - after.length) / before.length
      : after.length > 0
        ? 1
        : 0;

  // Major structural change (>60% different)
  if (diffRatio > 0.6) {
    return { reason: 'OPINION', confidence: 0.55 };
  }

  // Moderate change (20-60%)
  if (diffRatio > 0.2) {
    return { reason: 'FACT', confidence: 0.5 };
  }

  // Small changes
  return { reason: 'STYLE', confidence: 0.4 };
}

/**
 * Determine the impact level of a revision.
 */
export function determineImpact(before: string, after: string): RevisionImpact {
  const diffRatio =
    before.length > 0
      ? Math.abs(before.length - after.length) / before.length
      : after.length > 0
        ? 1
        : 0;

  if (diffRatio === 0) {
    return {
      level: 'L0_FORMAT',
      requiresConsistencyCheck: false,
      isTrainingWorthy: false,
      shouldAskIntent: false,
      description: '无实质性变化',
      affectedFields: [],
    };
  }

  if (diffRatio < 0.1) {
    return {
      level: 'L1_STYLE',
      requiresConsistencyCheck: false,
      isTrainingWorthy: false,
      shouldAskIntent: false,
      description: '小幅表达修改',
      affectedFields: [],
    };
  }

  if (diffRatio < 0.4) {
    return {
      level: 'L2_CONTENT',
      requiresConsistencyCheck: true,
      isTrainingWorthy: true,
      shouldAskIntent: false,
      description: '内容补充或删减',
      affectedFields: [],
    };
  }

  if (diffRatio < 0.7) {
    return {
      level: 'L3_STRUCTURE',
      requiresConsistencyCheck: true,
      isTrainingWorthy: true,
      shouldAskIntent: true,
      description: '结构性调整',
      affectedFields: ['structure'],
    };
  }

  return {
    level: 'L4_INTENT',
    requiresConsistencyCheck: true,
    isTrainingWorthy: true,
    shouldAskIntent: true,
    description: '核心观点变化 — 建议确认创作意图',
    affectedFields: ['intent.core_message', 'intent.purpose'],
  };
}
