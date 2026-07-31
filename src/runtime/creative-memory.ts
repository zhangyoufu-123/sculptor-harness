/**
 * Creative Memory — preserves the author's creative DNA.
 *
 * Unlike Belief State (which tracks understanding confidence),
 * Creative Memory saves WHAT THE USER INSISTED ON:
 * - Core metaphors (e.g., "校门=时间闭环")
 * - Emotional targets (e.g., "怀念但不伤感")
 * - Forbidden directions (e.g., "不要写成普通作文")
 * - Key decisions the user made and shouldn't be overwritten
 *
 * This memory persists across ALL phases — discovery, outline, writing.
 */

export interface CreativeMetaphor {
  /** The metaphor itself */
  value: string;
  /** Why it matters (user's explanation or AI inference) */
  significance: string;
  /** Must this be preserved in every generated section? */
  mustPreserve: boolean;
  /** When it was discovered */
  discoveredAt: string;
  /** Which user message revealed it */
  sourceMessage: string;
}

export interface EmotionalTarget {
  /** The feeling the work should evoke */
  feeling: string;
  /** What to avoid (e.g., "不要伤感，要温暖") */
  avoid: string;
  confidence: number;
}

export interface AuthorDecision {
  /** What was decided */
  decision: string;
  /** Why the user chose this */
  reason: string;
  /** Must not be overridden by AI */
  locked: boolean;
  timestamp: string;
}

export interface WritingConstraint {
  /** What MUST be included in every section */
  mustInclude: string[];
  /** What must NEVER appear */
  forbidden: string[];
  /** Structural requirements */
  structureHints: string[];
}

export interface CreativeMemory {
  /** The core metaphors the author wants to use */
  metaphors: CreativeMetaphor[];
  /** The emotional journey the work should take */
  emotionalArc: EmotionalTarget[];
  /** Author decisions that should persist */
  decisions: AuthorDecision[];
  /** Writing constraints for the Scribe Agent */
  constraints: WritingConstraint;
  /** Raw user messages that contain key creative input */
  keyMessages: string[];
  sessionId: string;
}

// =========================================================================
// Fact/Lore Database — for long-form cross-section consistency
// =========================================================================

/**
 * A fact established during writing that later sections may reference.
 * E.g., "the protagonist is named Zhang Wei", "the company was founded in 2018".
 */
export interface CreativeFact {
  id: string;
  /** What was established */
  fact: string;
  /** Which section established this fact */
  sectionId: string;
  /** Which section title */
  sectionTitle: string;
  /** Category for retrieval */
  category: 'character' | 'plot' | 'setting' | 'data' | 'rule' | 'quote';
  /** When this was recorded */
  recordedAt: string;
  /** Whether this fact is still canon (hasn't been retconned) */
  active: boolean;
}

/**
 * Store creative facts for cross-section reference.
 */
export class FactStore {
  private facts: CreativeFact[] = [];

  /** Record a new fact */
  record(fact: Omit<CreativeFact, 'id' | 'recordedAt' | 'active'>): CreativeFact {
    const full: CreativeFact = {
      ...fact,
      id: `fact-${Date.now().toString(36)}`,
      recordedAt: new Date().toISOString(),
      active: true,
    };
    this.facts.push(full);
    return full;
  }

  /** Get all facts for a category */
  getByCategory(category: CreativeFact['category']): CreativeFact[] {
    return this.facts.filter((f) => f.active && f.category === category);
  }

  /** Get facts established in or before a section */
  getUpToSection(sectionId: string): CreativeFact[] {
    const idx = this.facts.findIndex((f) => f.sectionId === sectionId);
    if (idx < 0) return this.facts.filter((f) => f.active);
    return this.facts.slice(0, idx + 1).filter((f) => f.active);
  }

  /** Get recent facts (last N) */
  getRecent(count = 10): CreativeFact[] {
    return this.facts.filter((f) => f.active).slice(-count);
  }

  /** Retcon a fact (mark as inactive) */
  retcon(factId: string, reason: string): void {
    const fact = this.facts.find((f) => f.id === factId);
    if (fact) {
      fact.active = false;
      this.record({
        fact: `[已废弃: ${reason}] ${fact.fact}`,
        sectionId: fact.sectionId,
        sectionTitle: fact.sectionTitle,
        category: fact.category,
      });
    }
  }

  /** Build a condensed context string for injection into section generation */
  buildContext(maxChars = 800): string {
    const recentFacts = this.getRecent(15);
    if (recentFacts.length === 0) return '';

    const byCategory: Record<string, string[]> = {};
    for (const f of recentFacts) {
      if (!byCategory[f.category]) byCategory[f.category] = [];
      byCategory[f.category].push(`- ${f.fact} (§${f.sectionTitle})`);
    }

    let context = '## 已建立的事实（写作时请保持一致性）\n';
    for (const [cat, facts] of Object.entries(byCategory)) {
      context += `### ${cat}\n${facts.join('\n')}\n`;
    }
    return context.slice(0, maxChars);
  }

  /** Count active facts */
  get count(): number {
    return this.facts.filter((f) => f.active).length;
  }

  reset(): void {
    this.facts = [];
  }
}

/** Global singleton */
export const factStore = new FactStore();

/**
 * Create fresh creative memory.
 */
export function createCreativeMemory(): CreativeMemory {
  return {
    metaphors: [],
    emotionalArc: [],
    decisions: [],
    constraints: { mustInclude: [], forbidden: [], structureHints: [] },
    keyMessages: [],
    sessionId: `mem-${Date.now().toString(36)}`,
  };
}

/**
 * Extract creative metaphors and decisions from user input.
 * V1: keyword + pattern-based. V2: LLM-based extraction.
 */
export function extractCreativeAssets(input: string, memory: CreativeMemory): void {
  // Detect metaphors (structure patterns like "X代表Y", "X就像Y")
  if (input.includes('门口') && (input.includes('接') || input.includes('送'))) {
    memory.metaphors.push({
      value: '校门=时间闭环（迎接与送别形成对称）',
      significance: '用户的创作核心——不能丢失',
      mustPreserve: true,
      discoveredAt: new Date().toISOString(),
      sourceMessage: input.slice(0, 200),
    });
  }

  // Detect emotional targets
  if (input.includes('怀念') || input.includes('回忆')) {
    memory.emotionalArc.push({
      feeling: '怀念但不伤感',
      avoid: '过度煽情',
      confidence: 0.7,
    });
  }

  // Detect forbidden directions
  if (input.includes('不是学校作业') || input.includes('不要')) {
    const forbidden =
      input.match(/不是(.+?)(?:[，。]|$)/)?.[1] || input.match(/不要(.+?)(?:[，。]|$)/)?.[1];
    if (forbidden) {
      memory.constraints.forbidden.push(forbidden.trim());
      memory.decisions.push({
        decision: `禁止方向: ${forbidden.trim()}`,
        reason: '用户明确排除',
        locked: true,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Detect must-include elements
  if (input.includes('班主任') || input.includes('老师')) {
    memory.constraints.mustInclude.push('班主任/老师的形象');
  }

  // Save key messages
  if (input.length > 30) {
    memory.keyMessages.push(input.slice(0, 200));
    if (memory.keyMessages.length > 10) memory.keyMessages.shift();
  }
}

/**
 * Build the writing context that MUST be injected into every Scribe call.
 */
export function buildWritingContext(memory: CreativeMemory): string {
  const parts: string[] = [];

  if (memory.metaphors.length > 0) {
    parts.push('## 核心隐喻（必须保留）');
    memory.metaphors
      .filter((m) => m.mustPreserve)
      .forEach((m) => {
        parts.push(`- ${m.value}: ${m.significance}`);
      });
  }

  if (memory.emotionalArc.length > 0) {
    parts.push('\n## 情感基调');
    memory.emotionalArc.forEach((e) => {
      parts.push(`- 目标: ${e.feeling}`);
      if (e.avoid) parts.push(`- 避免: ${e.avoid}`);
    });
  }

  if (memory.constraints.forbidden.length > 0) {
    parts.push('\n## 禁止方向');
    memory.constraints.forbidden.forEach((f) => parts.push(`- ❌ ${f}`));
  }

  if (memory.constraints.mustInclude.length > 0) {
    parts.push('\n## 必须包含');
    memory.constraints.mustInclude.forEach((m) => parts.push(`- ✅ ${m}`));
  }

  if (memory.decisions.length > 0) {
    parts.push('\n## 作者决策（不可覆盖）');
    memory.decisions
      .filter((d) => d.locked)
      .forEach((d) => {
        parts.push(`- ${d.decision}`);
      });
  }

  return parts.join('\n') || '(无特殊创作约束)';
}

/**
 * Get the writing context as a compact injection for LLM prompts.
 */
export function getCompactWritingContext(memory: CreativeMemory): string {
  const context = buildWritingContext(memory);
  return context.length > 500 ? context.slice(0, 500) + '...' : context;
}
