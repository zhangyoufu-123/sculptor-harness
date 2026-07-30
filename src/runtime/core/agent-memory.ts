/**
 * Agent Memory — tracks agent performance and user feedback patterns.
 * Enables the Planner to make better agent selection decisions over time.
 */

export interface AgentExecution {
  agentId: string;
  action: string;
  success: boolean; // Did the user accept the result?
  latency: number; // ms
  userFeedback?: string; // 'accepted' | 'rejected' | 'modified' | 'ignored'
  timestamp: string;
}

export interface AgentPattern {
  /** Pattern description */
  pattern: string;
  /** "If user does X, agent Y works better than agent Z" */
  condition: string;
  /** Which agent to prefer */
  preferredAgent: string;
  /** Confidence based on observation count */
  confidence: number;
}

export class AgentMemoryStore {
  private static executions: AgentExecution[] = [];
  private static patterns: AgentPattern[] = [];

  static recordExecution(exec: Omit<AgentExecution, 'timestamp'>): void {
    this.executions.push({ ...exec, timestamp: new Date().toISOString() });
    if (this.executions.length > 100) this.executions.shift();
  }

  /** Get recent executions for a specific agent */
  static getRecentForAgent(agentId: string, count = 10): AgentExecution[] {
    return this.executions.filter((e) => e.agentId === agentId).slice(-count);
  }

  /** Get success rate for an agent */
  static getSuccessRate(agentId: string): number {
    const relevant = this.executions.filter((e) => e.agentId === agentId);
    if (relevant.length === 0) return 0.5; // Default: neutral
    return relevant.filter((e) => e.success).length / relevant.length;
  }

  /** Learn a pattern from repeated observations */
  static learnPattern(pattern: Omit<AgentPattern, 'confidence'>): void {
    const existing = this.patterns.find((p) => p.pattern === pattern.pattern);
    if (existing) {
      existing.confidence = Math.min(existing.confidence + 0.1, 1.0);
    } else {
      this.patterns.push({ ...pattern, confidence: 0.3 });
    }
  }

  /** Get total execution count */
  static get totalExecutions(): number {
    return this.executions.length;
  }

  static reset(): void {
    this.executions = [];
    this.patterns = [];
  }
}
