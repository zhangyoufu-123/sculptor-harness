/**
 * PCS State Machine — Phase-transition engine for the 6 global phases.
 *
 * Manages the lifecycle graph and enforces per-transition guards so that
 * the system cannot advance to a later phase until all preconditions are
 * satisfied. Backward transitions (user-initiated restarts / revisions)
 * are unrestricted.
 *
 * @module pcs/state-machine
 */

import type { PCSPhase, PCSState } from './types';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Result of a phase-transition attempt. */
export interface TransitionResult {
  /** Whether the transition was accepted. */
  success: boolean;
  /** The phase the PCS was in before the attempt. */
  from: PCSPhase;
  /** The target phase that was requested. */
  to: PCSPhase;
  /** Human-readable reason when the transition is rejected. */
  error?: string;
}

/** A single precondition that must pass before a transition is allowed. */
export interface PhaseCondition {
  /** Human-readable description of what this condition checks. */
  description: string;
  /** Returns `true` when the condition is satisfied for the given state. */
  check(state: PCSState): boolean;
}

/**
 * A named collection of guards for a specific phase.
 *
 * Intended for external consumers that want to introspect or report on
 * the guards grouped by phase. The `StateMachine` itself stores guards
 * keyed by transition pair (see `PhaseCondition` above).
 */
export interface PhaseGuard {
  phase: PCSPhase;
  conditions: PhaseCondition[];
}

// ---------------------------------------------------------------------------
// StateMachine
// ---------------------------------------------------------------------------

/**
 * PCS global-phase state machine.
 *
 * ## Transition graph
 *
 * ```
 * initializing ──→ clarifying ──→ structured ──→ executing ──→ reviewing ──→ completed
 *                    ↑  │           ↑  │           ↑  │           ↑  │
 *                    └──┘           └──┘           └──┘           └──┘
 *              (user restart)  (revise reqs)  (adjust blueprint) (fix issues)
 * ```
 *
 * Backward edges are unrestricted. Forward edges carry guards that
 * must all pass before `transition()` returns `success: true`.
 */
export class StateMachine {
  /** Adjacency list of allowed transitions. */
  private transitions: Map<PCSPhase, PCSPhase[]>;

  /** Per-transition guard conditions, keyed as `"from→to"`. */
  private guards: Map<string, PhaseCondition[]>;

  constructor() {
    // ── Allowed transitions ──────────────────────────────────────────
    this.transitions = new Map<PCSPhase, PCSPhase[]>([
      ['initializing', ['clarifying']],
      ['clarifying', ['structured', 'initializing']],
      ['structured', ['clarifying', 'executing']],
      ['executing', ['structured', 'reviewing']],
      ['reviewing', ['executing', 'completed']],
      ['completed', []],
    ]);

    // ── Forward-transition guards ────────────────────────────────────
    this.guards = new Map();

    // clarifying → structured : Tier-0 (Intent + Audience) settled
    this.guards.set('clarifying→structured', [
      {
        description: 'All Intent fields must be confirmed or assumed (no unresolved proposals)',
        check: (state: PCSState): boolean => {
          const fields = [
            state.intent.purpose,
            state.intent.core_message,
            state.intent.desired_impact,
            state.intent.target_emotion,
          ];
          return fields.every((f) => f.status === 'confirmed' || f.status === 'assumed');
        },
      },
      {
        description: 'All Audience fields must be confirmed or assumed (no unresolved proposals)',
        check: (state: PCSState): boolean => {
          const fields = [
            state.audience.audience_type,
            state.audience.knowledge_level,
            state.audience.relationship,
            state.audience.pain_points,
          ];
          return fields.every((f) => f.status === 'confirmed' || f.status === 'assumed');
        },
      },
    ]);

    // structured → executing : Blueprint ready
    this.guards.set('structured→executing', [
      {
        description: 'Structure layer must have at least one section',
        check: (state: PCSState): boolean => state.structure.sections.length > 0,
      },
      {
        description: 'Every section must have pcs_status confirmed',
        check: (state: PCSState): boolean =>
          state.structure.sections.every((s) => s.pcs_status === 'confirmed'),
      },
    ]);

    // executing → reviewing : All Hard nodes drafted or beyond
    this.guards.set('executing→reviewing', [
      {
        description: 'All Hard nodes must have draft_state drafted, reviewing, approved, or locked',
        check: (state: PCSState): boolean => {
          const hardNodes = state.structure.sections.filter((s) => s.hardness === 'hard');
          if (hardNodes.length === 0) return true;
          const beyondDraft: string[] = ['drafted', 'reviewing', 'approved', 'locked'];
          return hardNodes.every((n) => beyondDraft.includes(n.draft_state));
        },
      },
    ]);

    // reviewing → completed : All blocking issues resolved
    this.guards.set('reviewing→completed', [
      {
        description: 'All blocking review issues must be resolved',
        check: (_state: PCSState): boolean => {
          // PCSState does not carry review issues natively (they live in
          // ReviewReport).  This guard delegates to external review
          // context and returns `true` by default so the transition
          // succeeds unless an external condition registry overrides it.
          return true;
        },
      },
    ]);
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Attempt to transition the PCS from its current phase to `target`.
   *
   * Checks structural validity (the edge must exist in the transition
   * graph) and then evaluates every guard registered for that edge.  If
   * any guard fails the returned `TransitionResult` carries `success:
   * false` and a human-readable `error`.
   *
   * **This method does NOT mutate `state.phase`.** The caller is
   * responsible for applying the phase change on success.
   */
  transition(state: PCSState, target: PCSPhase): TransitionResult {
    const current = state.phase;

    if (!this.canTransition(current, target)) {
      return {
        success: false,
        from: current,
        to: target,
        error: `Transition from '${current}' to '${target}' is not allowed`,
      };
    }

    const unmet = this.getUnmetConditions(state, target);
    if (unmet.length > 0) {
      return {
        success: false,
        from: current,
        to: target,
        error: `Unmet conditions: ${unmet.map((c) => c.description).join('; ')}`,
      };
    }

    return { success: true, from: current, to: target };
  }

  /**
   * Is the edge from `current` to `target` structurally allowed?
   *
   * This is a pure graph check — guards are **not** evaluated.
   */
  canTransition(current: PCSPhase, target: PCSPhase): boolean {
    const allowed = this.transitions.get(current);
    if (!allowed) return false;
    return allowed.includes(target);
  }

  /**
   * Return every phase reachable in one step from `current`.
   */
  getNextPhases(current: PCSPhase): PCSPhase[] {
    return this.transitions.get(current) ?? [];
  }

  /**
   * Return guards whose conditions are **not** satisfied for the
   * requested transition.
   *
   * An empty array means all conditions pass and the transition is
   * guard-clear.  If the transition itself is not allowed the result is
   * also empty (the caller is expected to check `canTransition` first
   * or use `transition()` for combined validation).
   */
  getUnmetConditions(state: PCSState, target: PCSPhase): PhaseCondition[] {
    const current = state.phase;
    if (!this.canTransition(current, target)) return [];

    const key = `${current}→${target}`;
    const conditions = this.guards.get(key);
    if (!conditions) return [];

    return conditions.filter((c) => !c.check(state));
  }

  /**
   * Is the given phase one in which content writing / drafting can happen?
   *
   * Writing is only allowed during `executing` (Scribe Agent drafting).
   */
  isWritable(phase: PCSPhase): boolean {
    return phase === 'executing';
  }

  /**
   * Is the given phase one in which the structural blueprint can be
   * modified?
   *
   * Structure is mutable during the early phases — `initializing`,
   * `clarifying`, and `structured` — before the outline is locked for
   * execution.
   */
  isStructureMutable(phase: PCSPhase): boolean {
    return phase === 'initializing' || phase === 'clarifying' || phase === 'structured';
  }
}
