import type {
  RevisionSession,
  RevisionEvent,
  RevisionIntent,
  RevisionSessionSummary,
  SessionTrigger,
  RevisionEventType,
  RevisionSource,
} from './revision-types';
import { classifyRevisionIntent, determineImpact } from './revision-types';
import type { DraftState } from '@/pcs/types';

/**
 * Manages revision sessions — continuous editing periods on a node.
 * Records every edit event, captures user intent for major changes,
 * and generates session summaries.
 */
export class RevisionSessionManager {
  private activeSessions: Map<string, RevisionSession> = new Map();
  private completedSessions: RevisionSession[] = [];

  /**
   * Start a new revision session for a node.
   */
  startSession(params: {
    nodeId: string;
    projectId: string;
    trigger: SessionTrigger;
    initialState: DraftState;
  }): RevisionSession {
    const session: RevisionSession = {
      id: `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      nodeId: params.nodeId,
      projectId: params.projectId,
      startTime: new Date().toISOString(),
      endTime: null,
      trigger: params.trigger,
      initialState: params.initialState,
      finalState: null,
      events: [],
      intents: [],
      summary: null,
    };
    this.activeSessions.set(params.nodeId, session);
    return session;
  }

  /**
   * Record a single revision event within an active session.
   */
  recordEvent(params: {
    sessionId: string;
    nodeId: string;
    type: RevisionEventType;
    source: RevisionSource;
    beforeText: string;
    afterText: string;
    position: number;
    aiSuggestionId?: string;
  }): RevisionEvent | null {
    const session = this.activeSessions.get(params.nodeId);
    if (!session) return null;

    const event: RevisionEvent = {
      id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: params.sessionId,
      nodeId: params.nodeId,
      type: params.type,
      source: params.source,
      beforeSnapshot: params.beforeText.slice(0, 1000), // Truncate for storage
      afterSnapshot: params.afterText.slice(0, 1000),
      position: params.position,
      timestamp: new Date().toISOString(),
      aiSuggestionId: params.aiSuggestionId,
    };

    session.events.push(event);

    // Auto-classify intent for significant changes
    const impact = determineImpact(params.beforeText, params.afterText);
    if (impact.shouldAskIntent) {
      const intent = classifyRevisionIntent(params.beforeText, params.afterText, params.type);
      this.captureIntent({
        sessionId: params.sessionId,
        nodeId: params.nodeId,
        eventId: event.id,
        reason: intent.reason,
        confidence: intent.confidence,
        userConfirmed: false,
      });
    }

    return event;
  }

  /**
   * Capture user intent for a revision.
   */
  captureIntent(params: {
    sessionId: string;
    nodeId: string;
    eventId: string;
    reason: string;
    confidence: number;
    userConfirmed: boolean;
    userExplanation?: string;
  }): RevisionIntent | null {
    const session = this.activeSessions.get(params.nodeId);
    if (!session) return null;

    const intent: RevisionIntent = {
      revisionId: params.eventId,
      reason: params.reason as RevisionIntent['reason'],
      confidence: params.confidence,
      userConfirmed: params.userConfirmed,
      capturedAt: new Date().toISOString(),
      userExplanation: params.userExplanation,
    };

    session.intents.push(intent);
    return intent;
  }

  /**
   * User confirms or corrects the classified intent.
   */
  confirmIntent(nodeId: string, eventId: string, reason: string): RevisionIntent | null {
    const session = this.activeSessions.get(nodeId);
    if (!session) return null;

    const intent = session.intents.find((i) => i.revisionId === eventId);
    if (!intent) return null;

    intent.reason = reason as RevisionIntent['reason'];
    intent.userConfirmed = true;
    intent.confidence = 1.0;
    return intent;
  }

  /**
   * Close a revision session and compute summary.
   */
  closeSession(nodeId: string, finalState: DraftState): RevisionSession | null {
    const session = this.activeSessions.get(nodeId);
    if (!session) return null;

    session.endTime = new Date().toISOString();
    session.finalState = finalState;
    session.summary = this.computeSummary(session);

    this.activeSessions.delete(nodeId);
    this.completedSessions.push(session);
    return session;
  }

  /**
   * Compute session summary statistics.
   */
  private computeSummary(session: RevisionSession): RevisionSessionSummary {
    let wordsAdded = 0;
    let wordsDeleted = 0;
    let styleChanged = false;

    const distribution: Record<string, number> = {};
    for (const event of session.events) {
      distribution[event.type] = (distribution[event.type] || 0) + 1;

      const beforeLen = event.beforeSnapshot.length;
      const afterLen = event.afterSnapshot.length;
      if (afterLen > beforeLen) {
        wordsAdded += afterLen - beforeLen;
      } else {
        wordsDeleted += beforeLen - afterLen;
      }
    }

    // Style change detected if there are STYLE or OPINION intents
    styleChanged = session.intents.some((i) => i.reason === 'STYLE' || i.reason === 'OPINION');

    return {
      wordsAdded: Math.round(wordsAdded / 5), // Rough word count from chars
      wordsDeleted: Math.round(wordsDeleted / 5),
      netChange: Math.round((wordsAdded - wordsDeleted) / 5),
      styleChanged,
      meaningChanged: session.intents.some((i) => i.reason === 'OPINION'),
      operationCount: session.events.length,
      eventTypeDistribution: distribution as Record<string, number>,
    };
  }

  /** Get active session for a node */
  getActiveSession(nodeId: string): RevisionSession | undefined {
    return this.activeSessions.get(nodeId);
  }

  /** Get all completed sessions */
  getCompletedSessions(): RevisionSession[] {
    return [...this.completedSessions];
  }

  /** Get all sessions for a node */
  getNodeHistory(nodeId: string): RevisionSession[] {
    return this.completedSessions.filter((s) => s.nodeId === nodeId);
  }

  /** How many sessions are currently active? */
  get activeCount(): number {
    return this.activeSessions.size;
  }

  /** Reset for testing */
  reset(): void {
    this.activeSessions.clear();
    this.completedSessions = [];
  }
}

/** Global singleton */
export const revisionSessionManager = new RevisionSessionManager();
