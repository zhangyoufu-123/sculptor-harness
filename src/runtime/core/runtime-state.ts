/**
 * Runtime State — the cognitive model of the Agent Runtime.
 * Tracks: user intent, creative mode, agent understanding, current phase, history.
 */

export type CreativeMode = 'fiction' | 'research' | 'essay' | 'business' | 'technical' | 'unknown';

export type RuntimePhase = 'discovery' | 'planning' | 'writing' | 'revision' | 'review' | 'publish';

export interface RuntimeAssumption {
  statement: string;
  confidence: number; // 0-1
}

export interface RuntimeUnknown {
  question: string;
  importance: number; // 0-1
}

export interface RuntimeEvent {
  type: string;
  timestamp: string;
  agent?: string;
  action?: string;
  result?: string;
}

export interface RuntimeState {
  /** User's current creative intent */
  intent: {
    raw: string;
    interpreted: string;
    confidence: number;
  };
  /** Detected creative mode */
  mode: {
    type: CreativeMode;
    confidence: number;
  };
  /** AI's current understanding of the user */
  understanding: {
    confirmed: string[];
    assumptions: RuntimeAssumption[];
    unknowns: RuntimeUnknown[];
  };
  /** Current runtime phase */
  phase: RuntimePhase;
  /** Recent runtime events (last 20) */
  history: RuntimeEvent[];
  /** How many interaction rounds have occurred */
  roundCount: number;
  /** Session ID */
  sessionId: string;
}

/**
 * Create a fresh RuntimeState for a new session.
 */
export function createRuntimeState(idea: string): RuntimeState {
  return {
    intent: { raw: idea, interpreted: idea, confidence: 0.4 },
    mode: { type: 'unknown', confidence: 0.3 },
    understanding: { confirmed: [], assumptions: [], unknowns: [] },
    phase: 'discovery',
    history: [],
    roundCount: 0,
    sessionId: `rt-${Date.now().toString(36)}`,
  };
}

/**
 * Record an event in the runtime history.
 */
export function recordEvent(state: RuntimeState, event: Omit<RuntimeEvent, 'timestamp'>): void {
  state.history.push({ ...event, timestamp: new Date().toISOString() });
  if (state.history.length > 20) state.history.shift();
  state.roundCount++;
}

/**
 * Get a summary of the runtime state for display.
 */
export function getStateSummary(state: RuntimeState): string {
  return [
    `意图: ${state.intent.interpreted.slice(0, 40)} (${Math.round(state.intent.confidence * 100)}%)`,
    `模式: ${state.mode.type} (${Math.round(state.mode.confidence * 100)}%)`,
    `阶段: ${state.phase}`,
    `已确认: ${state.understanding.confirmed.length}`,
    `未知: ${state.understanding.unknowns.length}`,
    `轮次: ${state.roundCount}`,
  ].join(' | ');
}
