/**
 * Sculptor Event-Driven Runtime Kernel — Frozen Contract
 * ====================================================================
 *
 * THIS FILE IS THE ARCHITECTURE.
 *
 * Every command, event, aggregate boundary, and interface is defined here.
 * Sprint 1 implements against these types. Changing them later means
 * rewriting the kernel.
 *
 * Conventions:
 *   - All enums use string values for readability in event logs.
 *   - Every export is intentional — this is the public kernel surface.
 *   - Interfaces are prefixed with `I` when they define a contract
 *     to be implemented; plain `interface` for data shapes.
 *   - `DomainEvent` is the universal event envelope persisted to the
 *     event store. State is always derived via projection.
 *
 * @module runtime/domain-events
 * @version 1.0.0
 */

import type { DraftState, Hardness, NodeFunction, PCSPhase, PCSState } from '@/pcs/types';

// ============================================================================
// Section 1: Aggregate Types
// ============================================================================

/**
 * Top-level aggregates in the Sculptor domain.
 *
 * Each aggregate is a transactional consistency boundary. Events within
 * an aggregate are ordered by version; cross-aggregate ordering is
 * established via correlation IDs.
 */
export enum AggregateType {
  /** The project as a whole — lifecycle, phase transitions. */
  PROJECT = 'project',
  /** A single section (node) in the outline — draft lifecycle. */
  NODE = 'node',
  /** The Project Creative State — layered intent/audience/constraint config. */
  PCS = 'pcs',
  /** Knowledge requirements, gaps, and research state. */
  KNOWLEDGE = 'knowledge',
  /** Expression/style parameters — tone, voice, references. */
  EXPRESSION = 'expression',
}

/**
 * Unique identifier for an aggregate instance.
 *
 * Composed of the aggregate type and a stable instance ID
 * (e.g. `{ type: AggregateType.NODE, id: 'node_123' }`).
 */
export interface AggregateId {
  /** Which top-level aggregate this instance belongs to. */
  type: AggregateType;
  /** Stable unique ID within the aggregate type (e.g. `node_123`, `proj_abc`). */
  id: string;
}

/**
 * Universal event envelope — what gets persisted to the event store.
 *
 * Every state change in Sculptor is represented as a DomainEvent.
 * State is never mutated directly; it is always derived by projecting
 * the ordered event stream.
 */
export interface DomainEvent {
  /** ULID or UUID — globally unique per event. */
  id: string;
  /** Which aggregate this event belongs to (consistency boundary). */
  aggregateId: AggregateId;
  /** Monotonically increasing version number per aggregate instance. */
  version: number;
  /** Event type discriminator from the canonical {@link EventType} enum. */
  eventType: EventType;
  /** Event-specific payload (shape varies by eventType). */
  payload: Record<string, unknown>;
  /** ISO 8601 timestamp of when the event occurred. */
  occurredAt: string;
  /** Who or what caused this event. */
  actor: ActorType;
  /**
   * Optional correlation ID for tracing related events across aggregates.
   * Set when a single command produces events on multiple aggregates.
   */
  correlationId?: string;
}

/**
 * Who or what triggered an event.
 */
export enum ActorType {
  /** A human author interacting via the UI. */
  USER = 'user',
  /** Any Sculptor agent (Architect, Scribe, Reviewer, etc.). */
  AI = 'ai',
  /** Automatic system inference, defaults engine, or migration scripts. */
  SYSTEM = 'system',
}

/**
 * Every event type in the Sculptor system — single source of truth.
 *
 * Naming convention: `{aggregate}.{past_tense_verb}`.
 * Never add an event type without updating the corresponding command
 * handler and projection logic.
 */
export enum EventType {
  // === Project events ===

  /** A new project has been created and the PCS is initializing. */
  PROJECT_INITIALIZED = 'project.initialized',
  /** The project has transitioned to a new PCS phase. */
  PROJECT_PHASE_CHANGED = 'project.phase_changed',
  /** The project has reached the completed phase and is archived. */
  PROJECT_COMPLETED = 'project.completed',

  // === Node events ===

  /** A node has been activated for the first time (transition from empty). */
  NODE_STARTED = 'node.started',
  /** The Architect has produced a GenerationPlan for this node. */
  NODE_PLAN_GENERATED = 'node.plan_generated',
  /** The Scribe Agent has begun writing content for this node. */
  NODE_GENERATION_STARTED = 'node.generation_started',
  /** The Scribe Agent encountered an unrecoverable error during generation. */
  NODE_GENERATION_FAILED = 'node.generation_failed',
  /** The Scribe Agent has successfully produced a content draft. */
  NODE_CONTENT_GENERATED = 'node.content_generated',
  /** The user has manually saved an in-progress draft. */
  NODE_DRAFT_SAVED = 'node.draft_saved',
  /** The user has submitted the draft for review. */
  NODE_SUBMITTED = 'node.submitted',
  /** The Reviewer Agent has completed its 5-dimension review of this node. */
  NODE_REVIEW_COMPLETED = 'node.review_completed',
  /** The user has explicitly approved the node's content. */
  NODE_APPROVED = 'node.approved',
  /** A locked node has been unlocked for further editing. */
  NODE_UNLOCKED = 'node.unlocked',
  /** An approved node has been revised with new content. */
  NODE_REVISED = 'node.revised',

  // === Structure events ===

  /** A new structure (outline) has been produced by the Architect. */
  STRUCTURE_CREATED = 'structure.created',
  /** The structure has been modified (reorder, add section, remove section). */
  STRUCTURE_UPDATED = 'structure.updated',

  // === Intent / Audience / Expression field events ===

  /** A PCS field value has been updated (before confirmation). */
  FIELD_UPDATED = 'field.updated',
  /** A PCS field has been explicitly confirmed by the user. */
  FIELD_CONFIRMED = 'field.confirmed',
  /** A proposal has been created against a confirmed field. */
  PROPOSAL_CREATED = 'proposal.created',
  /** A pending proposal has been accepted and applied to the field. */
  PROPOSAL_ACCEPTED = 'proposal.accepted',
  /** A pending proposal has been explicitly rejected. */
  PROPOSAL_REJECTED = 'proposal.rejected',

  // === Knowledge events ===

  /** The system has detected a knowledge gap that may block progress. */
  KNOWLEDGE_GAP_DETECTED = 'knowledge.gap_detected',
  /** A previously detected knowledge gap has been resolved. */
  KNOWLEDGE_GAP_RESOLVED = 'knowledge.gap_resolved',

  // === Style events ===

  /** A style signal has been recorded from user feedback or reference analysis. */
  STYLE_SIGNAL_RECORDED = 'style.signal_recorded',
  /** The system has detected a recurring style pattern from accumulated signals. */
  STYLE_PATTERN_DETECTED = 'style.pattern_detected',

  // === Training events ===

  /** A training sample has been recorded for model improvement. */
  TRAINING_SAMPLE_RECORDED = 'training.sample_recorded',
}

// ============================================================================
// Section 2: Command Types
// ============================================================================

/**
 * A user or system intent — what the actor WANTS to happen.
 *
 * Commands are the ONLY entry point for state mutation. Every write
 * flows through: Command → Bus → Handler → Events → Store → Projection.
 * Commands carry an idempotency key (`id`) to prevent duplicate processing.
 */
export interface Command {
  /** Unique command ID — serves as an idempotency key. */
  id: string;
  /** Which aggregate this command targets. */
  aggregateId: AggregateId;
  /** Command type discriminator from the canonical {@link CommandType} enum. */
  type: CommandType;
  /** Command-specific payload (shape varies by command type). */
  payload: Record<string, unknown>;
  /** Who issued this command. */
  actor: ActorType;
  /** ISO 8601 timestamp of when the command was issued. */
  issuedAt: string;
}

/**
 * Every command type in the Sculptor system.
 *
 * Naming convention: `{VERB}_{NOUN}` in UPPER_SNAKE_CASE.
 * Each command type maps to exactly ONE {@link ICommandHandler}.
 */
export enum CommandType {
  // === Project commands ===

  /** Initialize a new project and create its PCS. */
  INIT_PROJECT = 'init_project',
  /** Transition the project to a new PCS phase. */
  CHANGE_PHASE = 'change_phase',

  // === Node commands (core set for Sprint 1) ===

  /** Activate a node and transition it from empty to planned. */
  START_NODE = 'start_node',
  /** Request the Architect to generate a GenerationPlan for a node. */
  GENERATE_PLAN = 'generate_plan',
  /** Request the Scribe Agent to generate content for a node. */
  GENERATE_CONTENT = 'generate_content',
  /** Save an in-progress draft (manual or auto-save). */
  SAVE_DRAFT = 'save_draft',
  /** Submit a drafted node for review. */
  SUBMIT_NODE = 'submit_node',
  /** Approve a node's content after review. */
  APPROVE_NODE = 'approve_node',
  /** Unlock a locked node for further editing. */
  UNLOCK_NODE = 'unlock_node',
  /** Retry content generation after a failure. */
  RETRY_GENERATION = 'retry_generation',

  // === PCS field commands ===

  /** Update a PCS field to a new value. */
  UPDATE_FIELD = 'update_field',
  /** Create a proposal against a confirmed field. */
  CREATE_PROPOSAL = 'create_proposal',
  /** Accept a pending proposal and apply it to the field. */
  ACCEPT_PROPOSAL = 'accept_proposal',
  /** Reject a pending proposal without applying it. */
  REJECT_PROPOSAL = 'reject_proposal',

  // === Structure commands ===

  /** Modify the structure (reorder, add, remove sections). */
  UPDATE_STRUCTURE = 'update_structure',
}

/**
 * Result of command processing.
 *
 * Returned by every {@link ICommandHandler.handle} call and propagated
 * through the {@link ICommandBus}. If `success` is `false`, zero events
 * are produced and `rejectionReason` explains why.
 */
export interface CommandResult {
  /** Whether the command was accepted and processed. */
  success: boolean;
  /** Events produced by the command (empty array if rejected). */
  events: DomainEvent[];
  /** Human-readable explanation for rejection (populated when `!success`). */
  rejectionReason?: string;
  /** The new aggregate state after applying the produced events. */
  newState?: Record<string, unknown>;
}

// ============================================================================
// Section 3: Node Runtime Context
// ============================================================================

/**
 * Standardized context assembled for Agent consumption.
 *
 * The Runtime Context Builder produces this from PCS state + event history.
 * Scribe Agent receives this — never assembles context ad-hoc.
 *
 * This interface replaces scattered prompt variable assembly with a single
 * canonical shape that every agent can depend on.
 */
export interface NodeRuntimeContext {
  /** Node-specific data derived from the {@link StructureSection}. */
  node: {
    /** Stable node identifier (matches {@link StructureSection.id}). */
    id: string;
    /** What this node must accomplish in the final draft. */
    goal: string;
    /** Rhetorical/logical role of the node in the argument structure. */
    function: NodeFunction;
    /** Human-readable section title. */
    title: string;
    /** Resistance to automated modification (hard vs soft). */
    hardness: Hardness;
    /** Estimated word count for this section (from {@link GenerationPlan}). */
    estimatedLength: number;
    /** Current writing-progress lifecycle state. */
    draftState: DraftState;
  };

  /** Snapshot of the Intent layer (Layer 1), relevant to this node. */
  intent: {
    /** The creative or communicative purpose of the piece. */
    purpose: string;
    /** The single-sentence core message the piece should convey. */
    coreMessage: string;
    /** The desired change in the reader that the author wants to achieve. */
    desiredImpact: string;
  };

  /** Snapshot of the Audience layer (Layer 2), relevant to this node. */
  audience: {
    /** Broad category of the target reader. */
    audienceType: string;
    /** The reader's baseline knowledge of the subject matter. */
    knowledgeLevel: string;
    /** Pain points or concerns the audience has. */
    painPoints: string[];
  };

  /** Snapshot of the Expression layer (Layer 6), relevant to this node. */
  style: {
    /** The overall tone of the piece. */
    tone: string;
    /** Elements, patterns, or language to consciously avoid. */
    avoid: string[];
    /** A reference work whose style should be emulated. */
    styleReference: string;
    /** A reference work whose format should be followed. */
    formatReference: string;
  };

  /** Snapshot of the Constraint layer (Layer 3), relevant to this node. */
  constraints: {
    /** Structural format (e.g. "markdown", "html"). */
    format: string;
    /** Minimum word count for this section (inclusive). */
    lengthMin: number;
    /** Maximum word count for this section (inclusive). */
    lengthMax: number;
  };

  /**
   * Adjacent nodes for narrative continuity awareness.
   * The Scribe uses these to write smooth transitions.
   */
  adjacentNodes: {
    /** The node immediately preceding this one in the outline. */
    previous?: { id: string; goal: string; lastSentence?: string };
    /** The node immediately following this one in the outline. */
    next?: { id: string; goal: string };
  };

  /**
   * Knowledge topics that MUST be covered in this node.
   * Derived from {@link KnowledgeLayer.required_topics} filtered by section_id.
   */
  requiredTopics: string[];

  /**
   * Recent revision history for this node (last 5 changes).
   * Derived from the event stream filtered to this node's aggregate.
   */
  revisionHistory: Array<{
    /** ISO 8601 timestamp of the change. */
    timestamp: string;
    /** Category of the change (e.g. "draft_saved", "content_generated"). */
    changeType: string;
    /** Human-readable summary of what changed. */
    summary: string;
  }>;

  /**
   * The current global PCS phase.
   * Agents use this to determine which operations are valid.
   */
  globalPhase: PCSPhase;
}

// ============================================================================
// Section 4: Context Builder Interface
// ============================================================================

/**
 * Assembles a standardized {@link NodeRuntimeContext} from the current PCS state.
 *
 * Replaces ad-hoc context assembly in individual agents. Every agent that
 * needs node context calls through this interface rather than constructing
 * prompt variables directly.
 */
export interface IRuntimeContextBuilder {
  /**
   * Build full runtime context for a node.
   *
   * Reads PCS state (all six layers) + event history to produce a complete
   * context object suitable for the Scribe Agent's generation prompt.
   *
   * @param pcs    - The current full PCS state.
   * @param nodeId - The ID of the target {@link StructureSection}.
   * @returns A complete {@link NodeRuntimeContext} ready for agent consumption.
   */
  buildNodeContext(pcs: PCSState, nodeId: string): NodeRuntimeContext;

  /**
   * Build lightweight context for creative assist (Monitor Engine).
   *
   * Includes only tier 1+2 fields — enough to detect goal drift and
   * missing data without exceeding token budgets.
   *
   * @param pcs     - The current full PCS state.
   * @param nodeId  - The ID of the target {@link StructureSection}.
   * @param content - The current draft content being monitored.
   * @returns A partial context with only the fields needed for monitoring.
   */
  buildAssistContext(pcs: PCSState, nodeId: string, content: string): Partial<NodeRuntimeContext>;
}

// ============================================================================
// Section 5: Command Handler Interface
// ============================================================================

/**
 * A command handler processes one command type and produces events.
 *
 * Each command type has exactly ONE handler. Handlers encapsulate the
 * business logic for state transitions: they validate permissions, check
 * the state machine, and produce zero or more {@link DomainEvent}s.
 */
export interface ICommandHandler {
  /** Which command type this handler processes. */
  readonly commandType: CommandType;

  /**
   * Process a command and produce zero or more events.
   *
   * May reject the command (return `success: false`) if:
   * - Permission denied (wrong actor for the current phase)
   * - Invalid state transition (e.g. approving a non-reviewed node)
   * - Business rule violation (e.g. missing required fields)
   *
   * @param command      - The command to process.
   * @param currentState - The current state of the target aggregate.
   * @returns A {@link CommandResult} with events and optional new state.
   */
  handle(command: Command, currentState: Record<string, unknown>): CommandResult;
}

// ============================================================================
// Section 6: Command Bus Interface
// ============================================================================

/**
 * Central command bus — the ONLY entry point for state mutations.
 *
 * All writes go through:
 * ```
 * Command → Bus.dispatch() → Handler.handle() → Events → Store.append() → Projection
 * ```
 *
 * The bus is responsible for:
 * 1. Validating the command structure
 * 2. Routing to the correct {@link ICommandHandler}
 * 3. Ensuring handlers have the latest aggregate state
 * 4. Persisting produced events via the {@link IEventStore}
 * 5. Returning a {@link CommandResult} to the caller
 */
export interface ICommandBus {
  /**
   * Dispatch a command for processing.
   *
   * This is the single write path in the entire kernel. Every state
   * mutation must flow through this method.
   *
   * @param command - The command to dispatch.
   * @returns A promise that resolves with the command result.
   */
  dispatch(command: Command): Promise<CommandResult>;

  /**
   * Register a command handler for a specific command type.
   *
   * Each {@link CommandType} maps to exactly one handler. Registering
   * a second handler for the same type replaces the previous one.
   *
   * @param handler - The handler to register.
   */
  registerHandler(handler: ICommandHandler): void;
}

// ============================================================================
// Section 7: Event Store Interface
// ============================================================================

/**
 * Persistent event store — append-only log of all domain events.
 *
 * The event store is the single source of truth. Aggregate state is never
 * stored directly; it is always derived via projection from the ordered
 * event stream.
 *
 * V1: in-memory implementation ({@link InMemoryEventStore}).
 * V2: PostgreSQL with true append-only semantics.
 */
export interface IEventStore {
  /**
   * Append events to the store atomically.
   *
   * All events in a single `append` call share the same transactional
   * boundary. In V2 (PostgreSQL), this maps to a single INSERT transaction.
   *
   * @param events - One or more events to persist.
   */
  append(events: DomainEvent[]): Promise<void>;

  /**
   * Get all events for an aggregate, ordered by version.
   *
   * Used by projections to rebuild aggregate state.
   *
   * @param aggregateId - The target aggregate.
   * @param fromVersion - Optional starting version (exclusive). Defaults to 0
   *                      (return all events).
   * @returns Events ordered by version ascending.
   */
  getEvents(aggregateId: AggregateId, fromVersion?: number): Promise<DomainEvent[]>;

  /**
   * Get the latest version number for an aggregate.
   *
   * Used for optimistic concurrency control: the command handler reads
   * the current version, and the store rejects events with conflicting
   * versions.
   *
   * @param aggregateId - The target aggregate.
   * @returns The highest version number, or 0 if no events exist.
   */
  getLatestVersion(aggregateId: AggregateId): Promise<number>;

  /**
   * Get events by correlation ID for cross-aggregate tracing.
   *
   * When a single command produces events on multiple aggregates, all
   * those events share the same correlation ID. This method enables
   * tracing the full causal chain.
   *
   * @param correlationId - The correlation ID to trace.
   * @returns All events with the given correlation ID.
   */
  getByCorrelationId(correlationId: string): Promise<DomainEvent[]>;
}

// ============================================================================
// Section 8: In-memory Event Store (V1)
// ============================================================================

/**
 * V1 in-memory event store.
 *
 * Suitable for single-user development and testing scenarios. All events
 * are held in a plain array. Replaced by a PostgreSQL-backed store in V2.
 *
 * Thread-safety: adequate for single-user V1 scenarios. Not safe for
 * concurrent access from multiple processes.
 */
export class InMemoryEventStore implements IEventStore {
  private events: DomainEvent[] = [];

  /**
   * Append events to the in-memory array.
   *
   * In V1 this is a simple push. In V2, this will be replaced with a
   * transactional INSERT.
   */
  async append(events: DomainEvent[]): Promise<void> {
    this.events.push(...events);
  }

  /**
   * Get all events for an aggregate, ordered by version.
   *
   * Filters by aggregate type + ID, then by version threshold, and
   * returns events sorted ascending by version.
   */
  async getEvents(aggregateId: AggregateId, fromVersion = 0): Promise<DomainEvent[]> {
    return this.events
      .filter((e) => e.aggregateId.type === aggregateId.type && e.aggregateId.id === aggregateId.id)
      .filter((e) => e.version > fromVersion)
      .sort((a, b) => a.version - b.version);
  }

  /**
   * Get the latest version number for an aggregate.
   *
   * Returns 0 if no events have been recorded for this aggregate.
   */
  async getLatestVersion(aggregateId: AggregateId): Promise<number> {
    const events = await this.getEvents(aggregateId);
    return events.length > 0 ? events[events.length - 1].version : 0;
  }

  /**
   * Get all events sharing a correlation ID.
   *
   * Used for cross-aggregate tracing when a single command produces
   * events on multiple aggregates.
   */
  async getByCorrelationId(correlationId: string): Promise<DomainEvent[]> {
    return this.events.filter((e) => e.correlationId === correlationId);
  }
}

/**
 * Global singleton event store for V1.
 *
 * In V2, this will be replaced by a dependency-injected PostgreSQL store.
 * All kernel code goes through the {@link IEventStore} interface, so the
 * swap requires zero changes to handlers or the command bus.
 */
export const eventStore = new InMemoryEventStore();
