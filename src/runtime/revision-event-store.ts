import type { RevisionEvent, RevisionIntent, RevisionSession } from './revision-types';

/**
 * Persistent store for revision events and sessions.
 * V1: in-memory. V2: PostgreSQL with event sourcing.
 */
export class RevisionEventStore {
  private events: RevisionEvent[] = [];
  private intents: RevisionIntent[] = [];
  private sessions: RevisionSession[] = [];

  /** Archive a completed session */
  archive(session: RevisionSession): void {
    this.sessions.push(session);
    this.events.push(...session.events);
    this.intents.push(...session.intents);
  }

  /** Get all events for a node */
  getEvents(nodeId: string): RevisionEvent[] {
    return this.events.filter((e) => e.nodeId === nodeId);
  }

  /** Get all captured intents for a project */
  getIntents(projectId: string): RevisionIntent[] {
    // Intents are attached to sessions, which have projectId
    // V1: return all (simplified)
    void projectId;
    return [...this.intents];
  }

  /** Get all sessions for a node */
  getSessions(nodeId: string): RevisionSession[] {
    return this.sessions.filter((s) => s.nodeId === nodeId);
  }

  /** Get session count */
  get totalSessions(): number {
    return this.sessions.length;
  }

  /** Get total events recorded */
  get totalEvents(): number {
    return this.events.length;
  }

  /** Reset for testing */
  reset(): void {
    this.events = [];
    this.intents = [];
    this.sessions = [];
  }
}

/** Global singleton */
export const revisionEventStore = new RevisionEventStore();
