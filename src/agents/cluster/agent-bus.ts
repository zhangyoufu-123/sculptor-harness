/**
 * Agent Cluster Bus — Kimi-style event-driven inter-agent communication.
 *
 * Architecture:
 * - Publish/subscribe: agents subscribe to event types
 * - Shared memory: all agents read/write to the same context store
 * - Activation signals: agents can request other agents to wake up
 * - Priority queue: high-priority activations interrupt lower-priority work
 */

// ─── Types ────────────────────────────────────────────────────

export type AgentRole = 'style_recorder' | 'data_recorder' | 'question_agent' | 'writing_agent';

export type EventType =
  | 'user_input_received'
  | 'question_generated'
  | 'user_choice_made'
  | 'style_vector_updated'
  | 'writing_session_started'
  | 'writing_session_ended'
  | 'activation_requested'
  | 'activation_granted'
  | 'activation_revoked'
  | 'data_batch_ready';

export interface ClusterEvent {
  id: string;
  type: EventType;
  source: AgentRole;
  timestamp: number;
  payload: Record<string, unknown>;
  priority: 'high' | 'medium' | 'low';
}

export interface ActivationSignal {
  targetAgent: AgentRole;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  context: Record<string, unknown>;
  requestedBy: AgentRole;
  timestamp: number;
  /** Optional timeout — agent auto-deactivates after this ms */
  ttl?: number;
}

export type EventHandler = (event: ClusterEvent) => void | Promise<void>;

// ─── Shared Memory ─────────────────────────────────────────────

export interface ClusterMemory {
  /** Style vector store (shared between style_recorder and question_agent) */
  styleVectors: {
    personalDataset: number[]; // 512-dim embedding
    writingDeviation: number[]; // 128-dim deviation
    attentionFocus: Map<string, number>; // concept → attention weight
  };

  /** Recent interaction log (shared between all agents) */
  recentEvents: ClusterEvent[];

  /** Active agents map */
  activeAgents: Map<AgentRole, { activatedAt: number; ttl?: number }>;

  /** Pending activation requests */
  pendingActivations: ActivationSignal[];

  /** User interaction history for learning */
  choiceHistory: Array<{
    question: string;
    options: string[];
    predictedChoice: number; // Predicted option index
    actualChoice: number; // Actual chosen index
    timestamp: number;
  }>;

  /** Writing patterns observed */
  writingPatterns: Array<{
    pattern: string;
    frequency: number;
    firstObserved: number;
    lastObserved: number;
  }>;
}

// ─── Agent Bus Implementation ──────────────────────────────────

export class AgentBus {
  private subscribers: Map<EventType, Set<EventHandler>> = new Map();
  private eventLog: ClusterEvent[] = [];
  private memory: ClusterMemory;
  private agentInstances: Map<AgentRole, unknown> = new Map();

  constructor() {
    this.memory = this.createInitialMemory();
    // Register default subscriptions
    this.on('activation_requested', this.handleActivationRequest.bind(this));
  }

  // ── Publish/Subscribe ──────────────────────────────────────

  /** Subscribe to an event type */
  on(eventType: EventType, handler: EventHandler): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler);
  }

  /** Unsubscribe from an event type */
  off(eventType: EventType, handler: EventHandler): void {
    this.subscribers.get(eventType)?.delete(handler);
  }

  /** Publish an event — all subscribers are notified */
  async emit(event: Omit<ClusterEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: ClusterEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    // Log event
    this.eventLog.push(fullEvent);
    this.memory.recentEvents.push(fullEvent);
    if (this.memory.recentEvents.length > 100) {
      this.memory.recentEvents.shift();
    }

    // Notify subscribers
    const handlers = this.subscribers.get(fullEvent.type);
    if (handlers) {
      const promises = Array.from(handlers).map((h) => {
        try {
          const result = h(fullEvent);
          return result instanceof Promise ? result : Promise.resolve();
        } catch (err) {
          console.error(`[AgentBus] Handler error for ${fullEvent.type}:`, err);
          return Promise.resolve();
        }
      });
      await Promise.all(promises);
    }
  }

  // ── Activation System ──────────────────────────────────────

  /** Request activation of another agent */
  requestActivation(signal: ActivationSignal): void {
    this.memory.pendingActivations.push(signal);
    this.emit({
      type: 'activation_requested',
      source: signal.requestedBy,
      payload: signal as unknown as Record<string, unknown>,
      priority: signal.priority,
    });
  }

  /** Grant activation — agent is now active */
  activateAgent(role: AgentRole, ttl?: number): void {
    this.memory.activeAgents.set(role, {
      activatedAt: Date.now(),
      ttl,
    });
    this.emit({
      type: 'activation_granted',
      source: role,
      payload: { ttl },
      priority: 'medium',
    });
  }

  /** Revoke activation — agent should stop */
  deactivateAgent(role: AgentRole): void {
    this.memory.activeAgents.delete(role);
    this.memory.pendingActivations = this.memory.pendingActivations.filter(
      (s) => s.targetAgent !== role,
    );
    this.emit({
      type: 'activation_revoked',
      source: role,
      payload: {},
      priority: 'low',
    });
  }

  /** Check if an agent is currently active */
  isActive(role: AgentRole): boolean {
    const entry = this.memory.activeAgents.get(role);
    if (!entry) return false;
    // Check TTL
    if (entry.ttl && Date.now() - entry.activatedAt > entry.ttl) {
      this.deactivateAgent(role);
      return false;
    }
    return true;
  }

  // ── Shared Memory Access ───────────────────────────────────

  /** Read from shared memory — thread-safe snapshot */
  getMemory(): Readonly<ClusterMemory> {
    return this.memory;
  }

  /** Update shared memory — agents use this to persist state */
  updateMemory(update: Partial<ClusterMemory>): void {
    Object.assign(this.memory, update);
  }

  /** Register an agent instance */
  registerAgent(role: AgentRole, instance: unknown): void {
    this.agentInstances.set(role, instance);
  }

  /** Get an agent instance */
  getAgent<T>(role: AgentRole): T | undefined {
    return this.agentInstances.get(role) as T | undefined;
  }

  // ── Query History ──────────────────────────────────────────

  /** Get events of a specific type within a time window */
  queryEvents(options: {
    type?: EventType;
    source?: AgentRole;
    since?: number;
    limit?: number;
  }): ClusterEvent[] {
    let events = this.eventLog;
    if (options.type) events = events.filter((e) => e.type === options.type);
    if (options.source) events = events.filter((e) => e.source === options.source);
    if (options.since) {
      const since = options.since;
      events = events.filter((e) => e.timestamp >= since);
    }
    if (options.limit) events = events.slice(-options.limit);
    return events;
  }

  /** Get the N most recent events */
  getRecentEvents(n = 10): ClusterEvent[] {
    return this.eventLog.slice(-n);
  }

  // ── Internal ───────────────────────────────────────────────

  private createInitialMemory(): ClusterMemory {
    return {
      styleVectors: {
        personalDataset: new Array(512).fill(0),
        writingDeviation: new Array(128).fill(0),
        attentionFocus: new Map(),
      },
      recentEvents: [],
      activeAgents: new Map(),
      pendingActivations: [],
      choiceHistory: [],
      writingPatterns: [],
    };
  }

  private handleActivationRequest(event: ClusterEvent): void {
    const signal = event.payload as unknown as ActivationSignal;
    // Auto-grant activation for high-priority requests
    if (signal.priority === 'high') {
      this.activateAgent(signal.targetAgent, signal.ttl);
    }
    // Medium/low priority: queue for Question Agent to evaluate
  }
}

// ─── Global Singleton ────────────────────────────────────────

export const agentBus = new AgentBus();
