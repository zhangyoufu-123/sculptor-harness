export interface ExecutionRecord {
  id: string;
  timestamp: string;
  agentId: string;
  action: string;
  phase: string;
  /** The rendered prompt sent to LLM */
  prompt: string;
  /** The system prompt */
  systemPrompt?: string;
  /** The LLM response text */
  response: string;
  /** Token usage */
  tokens: { prompt: number; completion: number; total: number };
  /** Latency in ms */
  latency: number;
  /** Model used */
  model: string;
  /** Post-analysis if any (revision level, creative signals) */
  postAnalysis?: Record<string, unknown>;
}

export class ExecutionRecorder {
  private records: ExecutionRecord[] = [];

  record(entry: Omit<ExecutionRecord, 'id' | 'timestamp'>): ExecutionRecord {
    const full: ExecutionRecord = {
      ...entry,
      id: `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.records.push(full);
    return full;
  }

  getAll(): ExecutionRecord[] {
    return [...this.records];
  }

  getByAgent(agentId: string): ExecutionRecord[] {
    return this.records.filter((r) => r.agentId === agentId);
  }

  getByPhase(phase: string): ExecutionRecord[] {
    return this.records.filter((r) => r.phase === phase);
  }

  getLast(): ExecutionRecord | undefined {
    return this.records[this.records.length - 1];
  }

  getStats(): { total: number; totalTokens: number; avgLatency: number } {
    const total = this.records.length;
    const totalTokens = this.records.reduce((sum, r) => sum + r.tokens.total, 0);
    const avgLatency = total > 0 ? this.records.reduce((sum, r) => sum + r.latency, 0) / total : 0;
    return { total, totalTokens, avgLatency: Math.round(avgLatency) };
  }

  export(): ExecutionRecord[] {
    return this.getAll();
  }

  reset(): void {
    this.records = [];
  }
}

export const executionRecorder = new ExecutionRecorder();
