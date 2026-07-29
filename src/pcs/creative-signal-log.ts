export type SignalType = 'L1_low_risk' | 'L1_high_risk' | 'L2' | 'L3';

export interface CreativeSignal {
  id: string;
  timestamp: string;
  project_id: string;
  node_id: string;
  signal_type: SignalType;
  pattern: { original: string; modified: string; detected_preference: string; confidence: number };
  auto_applied: boolean;
}

export interface SignalStats {
  total_signals: number;
  by_type: Record<SignalType, number>;
  top_preferences: Array<{ preference: string; count: number }>;
  last_signal_at: string | null;
}

export class CreativeSignalLog {
  private signals: CreativeSignal[] = [];
  record(signal: Omit<CreativeSignal, 'id' | 'timestamp'>): CreativeSignal {
    const full: CreativeSignal = {
      ...signal,
      id: `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.signals.push(full);
    return full;
  }
  getByProject(projectId: string): CreativeSignal[] {
    return this.signals.filter((s) => s.project_id === projectId);
  }
  getByNode(projectId: string, nodeId: string): CreativeSignal[] {
    return this.signals.filter((s) => s.project_id === projectId && s.node_id === nodeId);
  }
  getByType(projectId: string, signalType: SignalType): CreativeSignal[] {
    return this.signals.filter((s) => s.project_id === projectId && s.signal_type === signalType);
  }
  getStats(projectId: string): SignalStats {
    const projectSignals = this.getByProject(projectId);
    const byType: Record<SignalType, number> = { L1_low_risk: 0, L1_high_risk: 0, L2: 0, L3: 0 };
    const prefCounts = new Map<string, number>();
    for (const signal of projectSignals) {
      byType[signal.signal_type]++;
      const pref = signal.pattern.detected_preference;
      prefCounts.set(pref, (prefCounts.get(pref) || 0) + 1);
    }
    return {
      total_signals: projectSignals.length,
      by_type: byType,
      top_preferences: Array.from(prefCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([preference, count]) => ({ preference, count })),
      last_signal_at: projectSignals[projectSignals.length - 1]?.timestamp ?? null,
    };
  }
  reset(): void {
    this.signals = [];
  }
}

export const creativeSignalLog = new CreativeSignalLog();
