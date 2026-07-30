/**
 * Session Memory — Sprint 0.6
 *
 * True per-session memory. Each CLI session gets its own isolated memory.
 * Prevents test data from leaking between sessions.
 * Stores: conversation history, extracted decisions, discovery state.
 */

export interface SessionMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
}

export interface SessionDecision {
  field: string;
  value: string;
  reason: string;
  timestamp: string;
}

export interface SessionMemory {
  sessionId: string;
  createdAt: string;
  messages: SessionMessage[];
  decisions: SessionDecision[];
  projectType?: string;
  discoveryComplete: boolean;
}

/**
 * Per-session memory store.
 * Each CLI session gets a NEW SessionMemory.
 * No global state — no leakage between sessions.
 */
export class SessionMemoryStore {
  private static currentSession: SessionMemory | null = null;

  /** Start a new session (called once at CLI startup) */
  static startSession(): SessionMemory {
    this.currentSession = {
      sessionId: `ses-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      messages: [],
      decisions: [],
      discoveryComplete: false,
    };
    return this.currentSession;
  }

  /** Get current session */
  static getSession(): SessionMemory | null {
    return this.currentSession;
  }

  /** Add a message */
  static addMessage(role: 'user' | 'agent' | 'system', content: string): void {
    if (!this.currentSession) return;
    this.currentSession.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  /** Record a decision */
  static recordDecision(field: string, value: string, reason: string): void {
    if (!this.currentSession) return;
    this.currentSession.decisions.push({
      field,
      value,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /** Get recent messages (last N) */
  static getRecentMessages(count = 10): SessionMessage[] {
    if (!this.currentSession) return [];
    return this.currentSession.messages.slice(-count);
  }

  /** Get all decisions */
  static getDecisions(): SessionDecision[] {
    if (!this.currentSession) return [];
    return [...this.currentSession.decisions];
  }

  /** Get conversation summary for context injection */
  static getSummary(): string {
    const s = this.currentSession;
    if (!s) return '(无会话)';
    return [
      `会话: ${s.sessionId}`,
      `消息: ${s.messages.length}`,
      `决策: ${s.decisions.length}`,
      `发现: ${s.discoveryComplete ? '完成' : '进行中'}`,
    ].join(' | ');
  }

  /** End the session */
  static endSession(): void {
    this.currentSession = null;
  }
}
