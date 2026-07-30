/**
 * Project Memory — persists across sessions for the same project.
 * Stores: decisions, style preferences, structure history.
 */

export interface ProjectDecision {
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  timestamp: string;
  phase: string;
}

export interface StylePreference {
  preference: string;
  // How many times this preference was observed
  occurrences: number;
  // Last time this preference was observed
  lastSeen: string;
}

export interface ProjectMemory {
  projectId: string;
  createdAt: string;
  updatedAt: string;
  decisions: ProjectDecision[];
  stylePreferences: StylePreference[];
  /** Total interaction rounds across all sessions */
  totalRounds: number;
  /** Last known creative mode */
  creativeMode: string;
}

export class ProjectMemoryStore {
  private static stores = new Map<string, ProjectMemory>();

  static getOrCreate(projectId: string): ProjectMemory {
    if (!this.stores.has(projectId)) {
      this.stores.set(projectId, {
        projectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        decisions: [],
        stylePreferences: [],
        totalRounds: 0,
        creativeMode: 'unknown',
      });
    }
    return this.stores.get(projectId)!;
  }

  static recordDecision(projectId: string, decision: Omit<ProjectDecision, 'timestamp'>): void {
    const mem = this.getOrCreate(projectId);
    mem.decisions.push({ ...decision, timestamp: new Date().toISOString() });
    mem.updatedAt = new Date().toISOString();
  }

  static recordStylePattern(projectId: string, preference: string): void {
    const mem = this.getOrCreate(projectId);
    const existing = mem.stylePreferences.find((p) => p.preference === preference);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date().toISOString();
    } else {
      mem.stylePreferences.push({
        preference,
        occurrences: 1,
        lastSeen: new Date().toISOString(),
      });
    }
    mem.updatedAt = new Date().toISOString();
  }

  static incrementRounds(projectId: string): void {
    this.getOrCreate(projectId).totalRounds++;
  }

  static getDecisionCount(projectId: string): number {
    return this.getOrCreate(projectId).decisions.length;
  }

  static reset(): void {
    this.stores.clear();
  }
}
