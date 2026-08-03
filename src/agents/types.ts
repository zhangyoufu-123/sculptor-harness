// ---------------------------------------------------------------------------
// Sculptor V1 — Agent Communication Contract
//
// This file defines the complete interface between Agents, the PCS Manager,
// and between Agents themselves. It is the authoritative source of truth for
// how agents request state changes — always through proposals, NEVER through
// direct mutation of PCS state.
//
// Design constraints:
//   - Agents receive a read-only PCS snapshot (PCSState) in each request.
//   - Agents return ProposalMutation[] — changes are routed through the
//     Proposal Layer for conflict detection, validation, and decision
//     tracking.
//   - Every agent interacts with PCS exclusively through IPCSAccessor.
//   - The BaseAgent abstract class provides shared helpers so concrete agents
//     only implement `execute()`.
// ---------------------------------------------------------------------------

import type {
  PCSState,
  PCSPhase,
  DecisionRecord,
  ProposalTrigger,
  ProposalStatus,
} from '@/pcs/types';
import { type FieldPriority, FIELD_PRIORITY_MAP } from '@/pcs/types';

// ===========================================================================
// 1. Agent Identity
// ===========================================================================

/**
 * The five agents in the Sculptor pipeline, listed in the order they
 * participate in a typical writing flow.  Each agent owns a distinct phase:
 *
 *   intake        — Captures raw user intent.
 *   clarification — Resolves ambiguity and fills gaps.
 *   architect     — Determines document structure.
 *   scribe        — Produces final prose.
 *   review        — Quality assurance and gatekeeping.
 *
 * Values are string literals so they can be serialized for logging,
 * tracing, and inter-process communication without runtime lookup tables.
 */
export type AgentId =
  'intake' | 'clarification' | 'architect' | 'scribe' | 'review' | 'discovery' | 'orchestrator';

// ===========================================================================
// 2. Agent Request / Response
// ===========================================================================

/**
 * Inbound request dispatched by the PCS Manager (or orchestrator) to a
 * specific agent when its phase becomes active.  The `pcsSnapshot` is a
 * **read-only** copy of PCS state at the moment the request was created;
 * agents MUST NOT attempt to write back into it.
 *
 * @typeParam TPayload — The expected shape of `payload`; defaults to
 *   `unknown` so callers can narrow with their own guards.
 */
export interface AgentRequest {
  /** Which agent is being invoked. */
  readonly agentId: AgentId;

  /** Current PCS phase — always matches the agent's assigned phase. */
  readonly phase: PCSPhase;

  /** Discriminator the agent uses to select its execution path. */
  readonly action: string;

  /** Free-form data passed into the agent (e.g. raw user input, draft text). */
  readonly payload: unknown;

  /**
   * Read-only snapshot of the full PCS state at request-creation time.
   * Agents read fields from here but MUST route all writes through proposals.
   */
  readonly pcsSnapshot: PCSState;
}

/**
 * Response produced by an agent after processing an {@link AgentRequest}.
 *
 * The critical invariants are:
 *   1. `pcsMutations` contains **proposals**, not direct writes.  The
 *      Proposal Layer will accept, reject, or queue each one.
 *   2. `nextActions` is a hint for the orchestrator — it declares what the
 *      agent believes should happen next but does NOT enforce it.
 */
export interface AgentResponse {
  /** Echoes the agent that produced the response. */
  readonly agentId: AgentId;

  /** Echoes the action that was processed. */
  readonly action: string;

  /** Arbitrary result data (e.g. generated text, analysis output). */
  readonly result: unknown;

  /**
   * Ordered list of PCS mutations the agent proposes.  Each entry will be
   * validated and routed through the Proposal Layer before any PCS field
   * is updated.
   */
  readonly pcsMutations: ProposalMutation[];

  /**
   * Ordered list of suggested follow-up actions.  The orchestrator uses
   * these as defaults but may override them (e.g. for conflict resolution).
   */
  readonly nextActions: string[];

  /** Telemetry captured during this execution. */
  readonly metadata: {
    /** Wall-clock time (ms) the agent spent processing the request. */
    readonly latency: number;
    /** Number of LLM calls made during this execution. */
    readonly llmCalls: number;
    /** Total tokens consumed across all LLM calls. */
    readonly tokensUsed: number;
  };
}

// ===========================================================================
// 3. Proposal Mutation (Agent-side)
// ===========================================================================

/**
 * Represents a single agent-initiated request to change one PCS field.
 *
 * Proposals are **intent declarations**, not state transitions.  The
 * Proposal Layer is responsible for conflict detection, validation,
 * and final decision recording.
 *
 * Every proposal carries a `trigger` so the system can distinguish
 * automatic conflict resolution from deliberate human overrides.
 */
export interface ProposalMutation {
  /**
   * Dot-notation path to the PCS field being modified.
   *
   * Examples:
   *   - `"intent.purpose"`
   *   - `"structure.sections.0.heading"`
   */
  readonly fieldPath: string;

  /** The value the agent wants to set. */
  readonly proposedValue: unknown;

  /**
   * Human-readable explanation of WHY this change is being proposed.
   * Used in audit logs and for human-in-the-loop review.
   */
  readonly reason: string;

  /**
   * What triggered this proposal.
   *   - `"conflict"`  — Automatic conflict resolution.
   *   - `"blocking"`  — The agent cannot proceed without this change.
   *   - `"manual"`    — Explicit user instruction.
   */
  readonly trigger: ProposalTrigger;

  /**
   * How confident the agent is in this proposal (0.0 – 1.0).
   * Used by the Proposal Layer to prioritise and auto-resolve low-risk
   * changes without human intervention.
   */
  readonly confidence: number;
}

// ===========================================================================
// 4. IPCSAccessor — THE Critical Interface
// ===========================================================================

/**
 * Every agent receives a reference to an object implementing this interface
 * at construction time.  It is the **sole** mechanism through which agents
 * may interact with PCS state.
 *
 * **Cardinal rule:** agents may READ any field but may only WRITE through
 * {@link propose}.  There is no `write` or `set` method — that is by
 * design.  All mutations flow through the Proposal Layer so the system
 * maintains a complete, auditable decision history.
 */
export interface IPCSAccessor {
  /**
   * Read the current value of a single PCS field by dot-notation path.
   *
   * @returns The field value, or `undefined` if the path does not exist.
   */
  read(path: string): unknown;

  /**
   * Return a complete, read-only snapshot of the current PCS state.
   * Equivalent to the `pcsSnapshot` field on {@link AgentRequest}.
   */
  getSnapshot(): PCSState;

  /**
   * Submit a modification proposal.  The agent does NOT wait for the
   * proposal to be resolved — it fires and forgets.  Use
   * {@link getProposalStatus} to poll for resolution.
   */
  propose(mutation: ProposalMutation): void;

  /**
   * Check the current status of a previously submitted proposal.
   *
   * @returns The status object if a proposal exists for the given path,
   *   otherwise `null`.
   */
  getProposalStatus(fieldPath: string): ProposalStatus | null;

  /**
   * Retrieve the decision history for a single field, or for every field
   * when called with no arguments.
   *
   * Decision records are immutable once written.  They represent the
   * system's auditable trail of every accepted or rejected proposal.
   */
  getDecisionHistory(): DecisionRecord[];
  getDecisionHistory(fieldPath: string): DecisionRecord[];

  /**
   * Return the PCS phase that is currently active.  Agents can use this to
   * guard against executing work that belongs to a different phase.
   */
  getCurrentPhase(): PCSPhase;

  /**
   * Determine whether a PCS field is **locked** (confirmed and the phase
   * has progressed beyond the point where the field could be modified).
   *
   * Locked fields MUST NOT be the target of new proposals — attempting to
   * propose to a locked field will be rejected by the Proposal Layer.
   */
  isLocked(fieldPath: string): boolean;
}

// ===========================================================================
// 5. BaseAgent — Abstract Class
// ===========================================================================

/**
 * Abstract base class that every Sculptor agent extends.
 *
 * ## Responsibilities
 *
 * 1. **Store identity** — the `agentId` is exposed as a public `readonly`
 *    property so the router and logging layer can identify the agent.
 * 2. **Hold the PCS accessor** — the `pcs` reference is `protected` so
 *    concrete implementations can call read/write helpers without exposing
 *    the accessor outside the agent hierarchy.
 * 3. **Provide shared helpers** — {@link createProposal},
 *    {@link readFields}, and {@link validatePrerequisites} reduce
 *    boilerplate in concrete agents.
 *
 * ## Extension contract
 *
 * Subclasses MUST implement {@link execute}.  They SHOULD NOT override the
 * constructor or the helper methods unless there is a compelling reason
 * (e.g. telemetry wrapping).
 */
export abstract class BaseAgent {
  /** Stable agent identity — never changes after construction. */
  readonly agentId: AgentId;

  /**
   * The agent's exclusive handle to PCS.  Marked `protected` so subclasses
   * can use it freely but external code cannot bypass the proposal layer.
   */
  protected readonly pcs: IPCSAccessor;

  /**
   * @param agentId — The identity of this agent (e.g. `"scribe"`).
   * @param pcs     — The PCS accessor injected by the container/factory.
   */
  constructor(agentId: AgentId, pcs: IPCSAccessor) {
    this.agentId = agentId;
    this.pcs = pcs;
  }

  /**
   * Main entry point invoked by the orchestrator when this agent's phase
   * becomes active.
   *
   * @returns A response with proposed mutations, follow-up actions, and
   *   execution metadata.  The orchestrator is responsible for dispatching
   *   mutations to the Proposal Layer.
   */
  abstract execute(request: AgentRequest): Promise<AgentResponse>;

  // -------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------

  /**
   * Convenience factory for a {@link ProposalMutation}.
   *
   * Agents should prefer this over constructing the object literal
   * manually — it ensures every proposal has the same shape and makes
   * future schema changes easy to propagate.
   */
  protected createProposal(
    fieldPath: string,
    value: unknown,
    reason: string,
    trigger: ProposalTrigger,
    confidence: number,
  ): ProposalMutation {
    return {
      fieldPath,
      proposedValue: value,
      reason,
      trigger,
      confidence,
    };
  }

  /**
   * Read multiple PCS fields in a single call and return them keyed by
   * their dot-notation paths.
   *
   * @example
   * ```ts
   * const { "intent.purpose": purpose, "intent.audience": audience } =
   *   this.readFields(["intent.purpose", "intent.audience"]);
   * ```
   */
  protected readFields(paths: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const path of paths) {
      result[path] = this.pcs.read(path);
    }
    return result;
  }

  /**
   * Verify that every path in `requiredPaths` has a **confirmed decision**
   * before this agent proceeds with its phase.
   *
   * A field is considered confirmed when it is locked (decision finalised
   * AND the phase has advanced past its modification window).  This is the
   * strictest available check on {@link IPCSAccessor} and prevents agents
   * from building on top of unsettled state.
   *
   * @returns `{ valid: true, missing: [] }` when all prerequisites are
   *   satisfied, otherwise `{ valid: false, missing: [...] }` with the
   *   list of paths that are not yet confirmed.
   */
  protected validatePrerequisites(requiredPaths: string[]): {
    valid: boolean;
    missing: string[];
  } {
    const missing: string[] = [];
    for (const path of requiredPaths) {
      if (!this.pcs.isLocked(path)) {
        missing.push(path);
      }
    }
    return { valid: missing.length === 0, missing };
  }

  // -------------------------------------------------------------------
  // Context assembly
  // -------------------------------------------------------------------

  /**
   * Assemble LLM context from PCS fields filtered by priority tier.
   *
   * @param maxTier - Maximum priority tier to include (1-3).
   *   Tier 1 only: bare essentials (tone, style, core intent)
   *   Up to Tier 2: add audience, constraints
   *   Up to Tier 3: include references, sources
   * @returns Formatted context string ready for LLM prompt injection
   */
  protected assembleContext(maxTier: FieldPriority = 3): string {
    const snapshot = this.pcs.getSnapshot();
    const parts: string[] = [];

    // Walk through all layers and include fields up to maxTier
    const layers: Array<{ name: string; fields: Record<string, unknown> }> = [
      {
        name: '创作意图',
        fields: this.flattenLayer(snapshot.intent as unknown as Record<string, unknown>),
      },
      {
        name: '读者信息',
        fields: this.flattenLayer(snapshot.audience as unknown as Record<string, unknown>),
      },
      {
        name: '作品约束',
        fields: this.flattenLayer(snapshot.constraint as unknown as Record<string, unknown>),
      },
      {
        name: '风格表达',
        fields: this.flattenLayer(snapshot.expression as unknown as Record<string, unknown>),
      },
    ];

    for (const layer of layers) {
      const layerParts: string[] = [];
      for (const [key, value] of Object.entries(layer.fields)) {
        const path = this.getFieldPath(layer.name, key);
        const priority = FIELD_PRIORITY_MAP[path] ?? 3;
        if (priority <= maxTier && value !== undefined && value !== null && value !== '') {
          layerParts.push(`- ${this.getFieldLabel(key)}: ${this.formatValue(value)}`);
        }
      }
      if (layerParts.length > 0) {
        parts.push(`## ${layer.name}\n${layerParts.join('\n')}`);
      }
    }

    // Knowledge layer (special handling)
    if (maxTier >= 2) {
      const knowledge = snapshot.knowledge;
      if (knowledge.required_topics.length > 0) {
        const topics = knowledge.required_topics
          .filter((t) => !t.covered)
          .map((t) => t.topic)
          .join('、');
        if (topics) {
          parts.push(`## 需要覆盖的知识点\n${topics}`);
        }
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Flatten a PCS layer object into a simple key-value record.
   * Extracts the .value from PCSField wrappers.
   */
  private flattenLayer(layer: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(layer)) {
      if (field && typeof field === 'object' && 'value' in field) {
        result[key] = (field as { value: unknown }).value;
      } else {
        result[key] = field;
      }
    }
    return result;
  }

  /**
   * Map PCS layer name + field key to a dot-notation field path.
   */
  private getFieldPath(layerName: string, fieldKey: string): string {
    const layerMap: Record<string, string> = {
      创作意图: 'intent',
      读者信息: 'audience',
      作品约束: 'constraint',
      风格表达: 'expression',
    };
    const layerPrefix = layerMap[layerName] ?? layerName.toLowerCase();
    return `${layerPrefix}.${fieldKey}`;
  }

  /**
   * Human-readable label for field keys.
   */
  private getFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      purpose: '创作目的',
      core_message: '核心观点',
      desired_impact: '期望影响',
      target_emotion: '目标情感',
      audience_type: '读者类型',
      knowledge_level: '知识水平',
      relationship: '作者与读者关系',
      pain_points: '读者痛点',
      type: '作品类型',
      platform: '发布平台',
      format: '交付格式',
      length_min: '最小字数',
      length_max: '最大字数',
      deadline: '截止日期',
      tone: '语气',
      voice: '写作人格',
      avoid: '避免事项',
      style_reference: '风格参考',
      format_reference: '格式参考',
      thinking_reference: '思维参考',
    };
    return labels[key] ?? key;
  }

  /**
   * Format a value for context injection.
   */
  private formatValue(value: unknown): string {
    if (Array.isArray(value)) {
      return value.join('、');
    }
    return String(value);
  }
}

// ===========================================================================
// 6. Agent Registry
// ===========================================================================

/**
 * Constructor signature for any agent class.  Every agent MUST accept an
 * {@link IPCSAccessor} as its sole dependency so the container can wire
 * them up without knowing the concrete type at compile time.
 */
export interface AgentConstructor {
  new (pcs: IPCSAccessor): BaseAgent;
}

/**
 * Runtime registry that maps {@link AgentId} values to their concrete
 * constructors.
 *
 * ## Purpose
 *
 * The orchestrator/route uses the registry to instantiate the correct
 * agent for a given phase without a hard-coded switch statement.  This
 * makes it trivial to add, replace, or mock agents during development
 * and testing.
 *
 * ## Usage
 *
 * ```ts
 * const registry: AgentRegistry = new InMemoryAgentRegistry();
 * registry.register("scribe", ScribeAgent);
 * const AgentCtor = registry.get("scribe");
 * const agent = new AgentCtor(pcsAccessor);
 * ```
 */
export interface AgentRegistry {
  /** Associate an {@link AgentId} with a concrete agent class. */
  register(id: AgentId, constructor: AgentConstructor): void;

  /** Look up a previously registered agent constructor. */
  get(id: AgentId): AgentConstructor | undefined;

  /** Return every registered agent ID in insertion order. */
  list(): AgentId[];
}
