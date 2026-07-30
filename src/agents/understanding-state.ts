/**
 * Understanding State — the cognitive model of the Discovery Agent.
 *
 * The agent maintains a dynamic model of the user's creative intent:
 * - What we KNOW (confirmed facts)
 * - What we GUESS (hypotheses that need validation)
 * - What we DON'T KNOW (uncertainties ranked by impact)
 *
 * This replaces the fixed questionnaire: instead of "ask question 1, then question 2",
 * the agent analyzes this state and decides the NEXT BEST action.
 */

// =========================================================================
// Core Types
// =========================================================================

export interface ConfirmedFact {
  fact: string;
  source: 'user' | 'inferred' | 'extracted';
  confidence: number; // 0-1, always 1.0 for user-confirmed
  field?: string; // PCS field path if mapped
  timestamp: string;
}

export interface Hypothesis {
  hypothesis: string;
  confidence: number; // 0-1, how likely this is correct
  needsValidation: boolean;
  /** What to ask to validate this hypothesis */
  validationQuestion?: string;
  /** If validated, what field does this affect? */
  affectsField?: string;
}

export interface Uncertainty {
  question: string;
  /** Why this matters for structural planning */
  impact: 'critical' | 'high' | 'medium' | 'low';
  /** What creative dimensions this affects */
  affectsDimensions: string[];
  /** What field(s) this would fill in PCS */
  targetField?: string;
  /** Has this been asked before? */
  askedCount: number;
}

export interface NextAction {
  type: 'ask' | 'suggest' | 'generate' | 'challenge' | 'proceed';
  /** The actual message to show the user */
  message: string;
  /** Options to present (if applicable) */
  options?: string[];
  /** Why this action was chosen (for debug) */
  reason: string;
  /** What uncertainty this addresses (if asking) */
  addressesUncertainty?: string;
}

export interface UnderstandingState {
  /** What the agent believes the user wants to create */
  currentIntent: {
    summary: string;
    creativeType: string;
    confidence: number;
  };
  /** Confirmed facts from the user */
  confirmedFacts: ConfirmedFact[];
  /** Agent hypotheses — educated guesses that need validation */
  hypotheses: Hypothesis[];
  /** Ranked uncertainties (most important first) */
  uncertainties: Uncertainty[];
  /** Conversation round count */
  roundCount: number;
  /** How much has been established (0-1) */
  understandingDepth: number;
}

// =========================================================================
// State Manager
// =========================================================================

/**
 * Manages the Understanding State through the discovery process.
 * Each user answer updates facts, validates/invalidates hypotheses,
 * and recalculates uncertainties.
 */
export class UnderstandingManager {
  private state: UnderstandingState;

  constructor(initialIntent: { summary: string; creativeType: string; confidence: number }) {
    this.state = {
      currentIntent: initialIntent,
      confirmedFacts: [],
      hypotheses: [],
      uncertainties: [],
      roundCount: 0,
      understandingDepth: 0,
    };
  }

  /** Record a confirmed fact from the user */
  addFact(fact: string, field?: string): void {
    // Check for duplicates or updates
    const existing = this.state.confirmedFacts.find((f) => f.field === field);
    if (existing) {
      existing.fact = fact;
      existing.timestamp = new Date().toISOString();
      existing.confidence = 1.0;
    } else {
      this.state.confirmedFacts.push({
        fact,
        source: 'user',
        confidence: 1.0,
        field,
        timestamp: new Date().toISOString(),
      });
    }
    this.recalculate();
  }

  /** Add a hypothesis (educated guess) */
  addHypothesis(h: Omit<Hypothesis, 'needsValidation'> & { needsValidation?: boolean }): void {
    this.state.hypotheses.push({
      ...h,
      needsValidation: h.needsValidation ?? true,
    });
    this.recalculate();
  }

  /** Mark a hypothesis as validated */
  validateHypothesis(index: number, fact: string): void {
    if (this.state.hypotheses[index]) {
      this.state.hypotheses[index].confidence = 0.95;
      this.state.hypotheses[index].needsValidation = false;
      this.addFact(fact);
    }
  }

  /** Add an uncertainty */
  addUncertainty(u: Uncertainty): void {
    // Don't add duplicates
    if (!this.state.uncertainties.some((e) => e.question === u.question)) {
      this.state.uncertainties.push(u);
      this.state.uncertainties.sort(this.rankByImpact);
    }
  }

  /** Mark an uncertainty as asked */
  markAsked(question: string): void {
    const u = this.state.uncertainties.find((e) => e.question === question);
    if (u) u.askedCount++;
  }

  /** Remove an uncertainty (it's been resolved) */
  resolveUncertainty(question: string): void {
    this.state.uncertainties = this.state.uncertainties.filter((u) => u.question !== question);
    this.recalculate();
  }

  /** Get the highest-impact unasked uncertainty */
  getNextUncertainty(): Uncertainty | null {
    return (
      this.state.uncertainties.filter((u) => u.askedCount < 2).sort(this.rankByImpact)[0] || null
    );
  }

  /** Decide the next action based on current state */
  decideNextAction(): NextAction {
    this.state.roundCount++;

    const nextUncertainty = this.getNextUncertainty();

    // If we have enough understanding, suggest proceeding
    if (this.state.understandingDepth > 0.7 && this.state.confirmedFacts.length >= 4) {
      return {
        type: 'proceed',
        message: '我已经对你的创作方向有了足够的理解。是否确认进入大纲设计？',
        reason: `理解深度 ${Math.round(this.state.understandingDepth * 100)}%，已确认 ${this.state.confirmedFacts.length} 项`,
      };
    }

    // If there's a critical uncertainty, ask about it
    if (nextUncertainty) {
      this.markAsked(nextUncertainty.question);
      return {
        type: 'ask',
        message: nextUncertainty.question,
        options: this.generateOptions(nextUncertainty),
        reason: `最高影响未知 (${nextUncertainty.impact}): ${nextUncertainty.affectsDimensions.join(', ')}`,
        addressesUncertainty: nextUncertainty.question,
      };
    }

    // If there are unvalidated hypotheses, validate one
    const unvalidated = this.state.hypotheses.find((h) => h.needsValidation);
    if (unvalidated && unvalidated.validationQuestion) {
      return {
        type: 'ask',
        message: unvalidated.validationQuestion,
        reason: `验证假设: ${unvalidated.hypothesis}`,
      };
    }

    // Default: proceed
    return {
      type: 'proceed',
      message: '我已了解你的创作方向。是否开始？',
      reason: '无关键未知',
    };
  }

  /** Get the full understanding state */
  getState(): UnderstandingState {
    return { ...this.state };
  }

  /** Get a summary for debug/display */
  getSummary(): string {
    const s = this.state;
    return [
      `意图: ${s.currentIntent.summary} (${Math.round(s.currentIntent.confidence * 100)}%)`,
      `已确认: ${s.confirmedFacts.length} 项`,
      `假设: ${s.hypotheses.length} (${s.hypotheses.filter((h) => h.needsValidation).length} 待验证)`,
      `未知: ${s.uncertainties.length} (${s.uncertainties.filter((u) => u.askedCount === 0).length} 未问)`,
      `理解深度: ${Math.round(s.understandingDepth * 100)}%`,
    ].join(' | ');
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private recalculate(): void {
    const totalDimensions = 8; // rough estimate
    const covered =
      this.state.confirmedFacts.length +
      this.state.hypotheses.filter((h) => h.confidence > 0.7).length;
    this.state.understandingDepth = Math.min(covered / totalDimensions, 1.0);
  }

  private rankByImpact(a: Uncertainty, b: Uncertainty): number {
    const order: Record<Uncertainty['impact'], number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    return order[a.impact] - order[b.impact];
  }

  private generateOptions(u: Uncertainty): string[] {
    // V1: generic options based on impact level
    const genericOptions: Record<string, string[]> = {
      critical: ['自定义输入', '暂时不确定，先跳过'],
      high: ['A', 'B', 'C', 'D', '自定义输入'],
      medium: ['是', '否', '不确定'],
      low: ['确认', '跳过'],
    };
    return genericOptions[u.impact] || ['自定义输入'];
  }
}
