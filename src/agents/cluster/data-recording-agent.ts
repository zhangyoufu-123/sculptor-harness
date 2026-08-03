/**
 * Data Recording Agent — perpetually active, records all interactions.
 *
 * Builds:
 * - User interaction dataset (for style learning)
 * - Session logs (for debugging and analysis)
 * - Writing pattern library (for style vector enrichment)
 *
 * Always active. Shares data with Style Recording Agent via Agent Bus.
 */

import { agentBus, type ClusterEvent, type AgentRole } from './agent-bus';

const AGENT_ID: AgentRole = 'data_recorder';

// ─── Types ────────────────────────────────────────────────────

interface InteractionRecord {
  round: number;
  userInput: string;
  systemResponse: string;
  phase: string;
  questionOptions?: string[];
  userChoice?: number;
  styleContext?: string;
  timestamp: number;
  latency: number; // ms for system response
}

interface SessionDataset {
  sessionId: string;
  startedAt: number;
  interactions: InteractionRecord[];
  styleSnapshots: Array<{ timestamp: number; confidence: number }>;
  totalRounds: number;
  writingSessions: number;
}

// ─── Data Recording Agent ────────────────────────────────────

class DataRecordingAgent {
  private currentSession: SessionDataset;
  private interactionCount: number = 0;
  private lastInputTime: number = 0;

  constructor() {
    this.currentSession = this.newSession();

    // Register with bus
    agentBus.registerAgent(AGENT_ID, this);

    // ALWAYS active — never deactivates
    agentBus.activateAgent(AGENT_ID);

    // Subscribe to ALL events
    agentBus.on('user_input_received', this.onUserInput.bind(this));
    agentBus.on('question_generated', this.onQuestionGenerated.bind(this));
    agentBus.on('user_choice_made', this.onChoiceMade.bind(this));
    agentBus.on('style_vector_updated', this.onStyleUpdated.bind(this));
    agentBus.on('writing_session_started', this.onWritingStarted.bind(this));

    console.log('[DataRecordingAgent] Registered and active');
  }

  private onUserInput(event: ClusterEvent): void {
    this.lastInputTime = Date.now();
    const record = this.getOrCreateRecord();
    record.userInput = (event.payload as { userInput?: string }).userInput || '';
    record.timestamp = Date.now();
  }

  private onQuestionGenerated(event: ClusterEvent): void {
    const record = this.getOrCreateRecord();
    record.systemResponse = (event.payload as { question?: string }).question || '';
    record.questionOptions = (event.payload as { options?: string[] }).options || [];
    record.latency = Date.now() - this.lastInputTime;
    record.phase = (event.payload as { phase?: string }).phase || '';
    this.interactionCount++;
    this.currentSession.totalRounds = this.interactionCount;
  }

  private onChoiceMade(event: ClusterEvent): void {
    const record = this.currentSession.interactions[this.currentSession.interactions.length - 1];
    if (record) {
      record.userChoice = (event.payload as { chosenIndex?: number }).chosenIndex;
    }
  }

  private onStyleUpdated(event: ClusterEvent): void {
    const snapshot = (event.payload as { snapshot?: { confidence: number } }).snapshot;
    if (snapshot) {
      this.currentSession.styleSnapshots.push({
        timestamp: Date.now(),
        confidence: snapshot.confidence,
      });
    }
  }

  private onWritingStarted(_event: ClusterEvent): void {
    this.currentSession.writingSessions++;
  }

  /** Get the full session dataset */
  getSessionData(): SessionDataset {
    return this.currentSession;
  }

  /** Export a summary for the Question Agent to use */
  exportForQuestionAgent(): string {
    const d = this.currentSession;
    const firstConfidence = d.styleSnapshots.length > 0 ? d.styleSnapshots[0].confidence : 0;
    const lastConfidence =
      d.styleSnapshots.length > 0 ? d.styleSnapshots[d.styleSnapshots.length - 1].confidence : 0;
    return [
      `[交互记录] 共${d.totalRounds}轮 | 写作${d.writingSessions}次`,
      d.styleSnapshots.length > 0
        ? `[风格学习] 置信度从${(firstConfidence * 100).toFixed(0)}% → ${(lastConfidence * 100).toFixed(0)}%`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Start a new session (called on reset) */
  resetSession(): void {
    this.currentSession = this.newSession();
    this.interactionCount = 0;
  }

  private newSession(): SessionDataset {
    return {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      interactions: [],
      styleSnapshots: [],
      totalRounds: 0,
      writingSessions: 0,
    };
  }

  private getOrCreateRecord(): InteractionRecord {
    const records = this.currentSession.interactions;
    if (records.length === 0 || records[records.length - 1].systemResponse) {
      // Cap interactions at 100 per session
      if (records.length >= 100) {
        records.shift(); // Remove oldest
      }
      const newRecord: InteractionRecord = {
        round: this.interactionCount + 1,
        userInput: '',
        systemResponse: '',
        phase: '',
        timestamp: 0,
        latency: 0,
      };
      records.push(newRecord);
      return newRecord;
    }
    return records[records.length - 1];
  }
}

// ─── Global Singleton ────────────────────────────────────────

export const dataRecordingAgent = new DataRecordingAgent();
