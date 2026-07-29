/**
 * PCS (Project Creative State) — Sculptor V1 Type System
 * ====================================================================
 * SINGLE SOURCE OF TRUTH for every data type in the Sculptor writing platform.
 *
 * Every other file in the project depends on these types. Edit with care.
 *
 * Conventions:
 *   - All dates/timestamps use ISO 8601 strings.
 *   - Field-path notation uses dot notation: "layer.field" (e.g. "intent.purpose").
 *   - Layer interfaces wrap primitive values in PCSField<T> (except `KnowledgeLayer`,
 *     which carries mixed-type auxiliary structures).
 *   - No `any` — use generics and `unknown` where the shape is truly open.
 *
 * @module pcs/types
 * @version 1.0.0
 */

// ---------------------------------------------------------------------------
// 1. Field-level primitives
// ---------------------------------------------------------------------------

/**
 * The confirmation status of a single PCS field.
 *
 * State machine:
 *   `confirmed`  → user has explicitly approved the current value
 *   `proposed`   → a new value has been suggested (user or AI) and awaits
 *                   acceptance or rejection
 *   `assumed`    → system has guessed a value based on heuristics; user
 *                   has not yet seen or confirmed it
 *   `deprecated` → value was once confirmed but is now considered obsolete
 *   `locked`     → value is frozen and cannot be changed without explicit
 *                   unlock (used during execution / review phases)
 */
export type FieldStatus = 'confirmed' | 'proposed' | 'assumed' | 'deprecated' | 'locked';

/**
 * Who or what agent created or last modified a field.
 *
 *   `user`   → human author via the UI
 *   `ai`     → any Sculptor agent (Architect, Scribe, Reviewer, etc.)
 *   `system` → automatic inference, defaults engine, or migration scripts
 */
export type FieldSource = 'user' | 'ai' | 'system';

/**
 * What triggered a proposal to change a confirmed field.
 *
 *   `conflict` → the new value conflicts with an existing confirmed value
 *                 on a different field
 *   `blocking` → the field must be resolved before the system can proceed
 *                 to the next phase
 *   `manual`   → the user explicitly requested a change to a confirmed field
 */
export type ProposalTrigger = 'conflict' | 'blocking' | 'manual';

/**
 * Lifecycle status of a single proposal.
 *
 *   `pending`  → proposal has been created but not yet acted upon
 *   `accepted` → the proposed new_value has been applied to the field
 *   `rejected` → the proposal was explicitly dismissed
 */
export type ProposalStatus = 'pending' | 'accepted' | 'rejected';

/**
 * A suggested change to a field whose current status is `confirmed` (or to
 * a field that is already in `proposed` status and receives a counter-
 * proposal).
 *
 * Proposals carry the new candidate value, a human-readable reason, the
 * trigger category, a creation timestamp, and their current lifecycle
 * status.
 */
export interface Proposal {
  /** The candidate replacement value. */
  new_value: unknown;
  /** Human-readable justification for the change. */
  reason: string;
  /** What triggered this proposal (conflict / blocking / manual). */
  trigger: ProposalTrigger;
  /** ISO 8601 timestamp of when the proposal was created. */
  created_at: string;
  /** Current resolution status of the proposal. */
  status: ProposalStatus;
}

/**
 * Generic wrapper for every editable field in the PCS.
 *
 * ## Lifecycle
 *
 * 1. A field starts as `assumed` (low confidence) or `proposed` (explicit).
 * 2. The user reviews the value and moves it to `confirmed`.
 * 3. Later, a proposal may challenge a confirmed value (proposal ≠ null).
 * 4. During execution the field may be `locked` to prevent accidental drift.
 *
 * ## Shape rules
 *
 * - `status = 'proposed'`   ⇒ `proposal` is populated.
 * - `status = 'confirmed'`  and a pending challenge exists ⇒ `proposal`
 *   is populated.
 * - Otherwise `proposal` is `null` or absent.
 *
 * @typeParam T - The underlying value type (string, number, string[], etc.).
 */
export interface PCSField<T = unknown> {
  /** The current value of the field. */
  value: T;
  /** Current confirmation status in the 5-state lifecycle. */
  status: FieldStatus;
  /** Who set or last mutated this value. */
  source: FieldSource;
  /** System confidence in the correctness of the value (0.0 – 1.0). */
  confidence: number;
  /** ISO 8601 timestamp of the most recent mutation. */
  last_updated: string;
  /**
   * An optional pending proposal that may replace the current value.
   * Populated when a confirmed value is being challenged, or when the
   * field itself is in `proposed` state.
   */
  proposal?: Proposal | null;
}

// ---------------------------------------------------------------------------
// 2. Global PCS Phase (top-level state machine)
// ---------------------------------------------------------------------------

/**
 * The 6 phases of a Sculptor writing project.
 *
 *   `initializing` → project is being created; intent collection has begun
 *   `clarifying`   → Architect Agent is asking clarifying questions; the
 *                     user is refining intent and constraints
 *   `structured`   → Architect has produced a full outline + knowledge plan;
 *                     the user is confirming the blueprint
 *   `executing`    → Scribe Agent is generating drafts node-by-node; the
 *                     user reviews and approves each section
 *   `reviewing`    → Reviewer Agent is running the 5-dimension review;
 *                     issues are flagged for resolution
 *   `completed`    → the final draft is approved and the project is archived
 */
export type PCSPhase =
  'initializing' | 'clarifying' | 'structured' | 'executing' | 'reviewing' | 'completed';

// ---------------------------------------------------------------------------
// 3. Six PCS Layers
// ---------------------------------------------------------------------------

/**
 * **Intent Layer** — Why are we writing this piece?
 *
 * Captures the author's creative purpose, core message, desired emotional
 * impact on the reader, and the target emotion to evoke. Every field starts
 * as assumed and must be confirmed before the system can proceed to
 * structure generation.
 *
 * @layer 1 of 6
 */
export interface IntentLayer {
  /** The creative / communicative purpose of the piece (e.g. "persuade", "inform"). */
  purpose: PCSField<string>;
  /** The single-sentence core message the piece should convey. */
  core_message: PCSField<string>;
  /** The change in the reader that the author wants to achieve. */
  desired_impact: PCSField<string>;
  /** The primary emotion the piece should evoke in the reader. */
  target_emotion: PCSField<string>;
}

/**
 * **Audience Layer** — Who are we writing for?
 *
 * Models the intended reader profile: demographic type, prior knowledge
 * level, the author-reader relationship, and the audience's pain points.
 * These fields influence tone, structure depth, and content complexity.
 *
 * @layer 2 of 6
 */
export interface AudienceLayer {
  /** Broad category of the target reader (e.g. "行业专家", "普通大众"). */
  audience_type: PCSField<string>;
  /** The reader's baseline knowledge of the subject matter. */
  knowledge_level: PCSField<string>;
  /** The author's relationship to the audience (e.g. "peer", "mentor"). */
  relationship: PCSField<string>;
  /** Pain points or concerns the audience has that this piece should address. */
  pain_points: PCSField<string[]>;
}

/**
 * **Constraint Layer** — What are the hard limits?
 *
 * Encodes the external constraints on the piece: content type, target
 * platform, format requirements, word-count bounds, deadline, and any
 * other user-specified restrictions.
 *
 * @layer 3 of 6
 */
export interface ConstraintLayer {
  /** The content type or genre (e.g. "公众号文章", "学术论文", "商业报告"). */
  type: PCSField<string>;
  /** The publishing platform that constrains format and style (e.g. "微信", "Medium"). */
  platform: PCSField<string>;
  /** Structural format (e.g. "markdown", "html", "plain-text"). */
  format: PCSField<string>;
  /** Minimum word count (inclusive). */
  length_min: PCSField<number>;
  /** Maximum word count (inclusive). */
  length_max: PCSField<number>;
  /** ISO 8601 date string for the submission deadline. */
  deadline: PCSField<string>;
  /** Free-form list of additional user-specified constraints. */
  custom_constraints: PCSField<string[]>;
}

/**
 * **Knowledge Layer** — What do we need to know?
 *
 * Tracks the information requirements for the project: what topics the
 * Architect has declared as required, what is already known, what gaps
 * exist, and what external sources the user has supplied.
 *
 * This is the only layer that mixes PCSField-wrapped scalars with
 * auxiliary plain-object arrays (RequiredTopic, MissingItem).
 *
 * @layer 4 of 6
 */
export interface KnowledgeLayer {
  /**
   * Topics that the Architect Agent has determined MUST be covered in the
   * final draft. Written in Phase 2 (`structured`) and referenced during
   * Phase 4 (`executing`).
   */
  required_topics: RequiredTopic[];
  /**
   * Topics for which sufficient research material has been accumulated.
   * Updated incrementally by the system as the user provides sources.
   */
  known_topics: string[];
  /**
   * Information gaps that still need to be filled before certain sections
   * can be written. Used for gap-tracking across the project lifecycle.
   */
  missing_information: MissingItem[];
  /**
   * External source references (URLs, documents, notes) provided by the
   * user to support research.
   */
  sources: PCSField<string[]>;
}

/**
 * A knowledge gap tracked in the `KnowledgeLayer`.
 *
 * Represents a piece of information that is needed but not yet available.
 * Missing items block progress when `blocking` is true.
 */
export interface MissingItem {
  /** What the missing information is about. */
  topic: string;
  /**
   * Which phase or dimension requires this information:
   *   `intent`    → needed to finalize intent
   *   `structure` → needed before a section can be outlined
   *   `draft`     → needed before a section can be drafted
   */
  reason: 'intent' | 'structure' | 'draft';
  /** Urgency / importance of filling this gap. */
  priority: 'high' | 'medium' | 'low';
  /**
   * If `true`, the system cannot proceed to the next phase until this gap
   * is resolved.
   */
  blocking: boolean;
  /** The ID of the `StructureSection` that requires this information. */
  related_section: string;
}

/**
 * A topic that the Architect Agent has declared MUST be covered in the
 * final draft, associated with a specific section of the outline.
 *
 * These are written during Phase 2 and serve as a checklist during Phase 4
 * generation.
 */
export interface RequiredTopic {
  /** The subject matter that must be addressed. */
  topic: string;
  /** The ID of the `StructureSection` responsible for covering this topic. */
  section_id: string;
  /** Whether the Scribe Agent has successfully covered this topic. */
  covered: boolean;
}

// ---------------------------------------------------------------------------
// Node / Structure sub-types (used in StructureLayer)
// ---------------------------------------------------------------------------

/**
 * The writing-progress lifecycle of a single structure node (section).
 *
 *   `empty`       → node exists in the outline but has no content yet
 *   `planned`     → a `GenerationPlan` has been confirmed for this node
 *   `generating`  → the Scribe Agent is currently writing this node
 *   `failed`      → LLM generation failed, user can retry
 *   `drafted`     → a draft exists and is ready for user review
 *   `reviewing`   → the user or Reviewer Agent is evaluating the draft
 *   `approved`    → the user has signed off on the current content
 *   `locked`      → the content is frozen; no further edits allowed
 */
export type DraftState =
  | 'empty'
  | 'planned'
  | 'generating'
  | 'failed'
  | 'drafted'
  | 'reviewing'
  | 'approved'
  | 'revising'
  | 'locked';

/**
 * The rhetorical or logical role a node plays in the overall argument
 * or narrative structure.
 *
 *   `introduce`   → sets up context or presents a problem
 *   `argument`    → makes a claim or presents a line of reasoning
 *   `evidence`    → provides data, examples, or citations
 *   `counter`     → addresses opposing views or objections
 *   `transition`  → bridges two sections thematically
 *   `conclude`    → summarises or draws a final conclusion
 *   `elaborate`   → expands on a previous point with detail
 */
export type NodeFunction =
  'introduce' | 'argument' | 'evidence' | 'counter' | 'transition' | 'conclude' | 'elaborate';

/**
 * The structural "hardness" of a node — how strongly the system should
 * resist automated modifications.
 *
 *   `hard` → any change to this node's title, goal, function, or order
 *            requires explicit user confirmation
 *   `soft` → the system may automatically reorder or adjust this node
 *            without user intervention
 */
export type Hardness = 'hard' | 'soft';

/**
 * A single section (node) in the project's outline.
 *
 * The `StructureSection` is the atomic unit of the blueprint. It carries
 * its own goal, function, draft lifecycle state, and content. Sections may
 * be nested (`parent_id` / `children`) for V2 hierarchical structures.
 */
export interface StructureSection {
  /** Unique identifier for this section (stable across reorders). */
  id: string;
  /** Human-readable section title. */
  title: string;
  /** What this node must accomplish in the final draft. */
  goal: string;
  /** Role in the argument or narrative structure. */
  function: NodeFunction;
  /** How resistant this node is to automated modification. */
  hardness: Hardness;
  /** Current writing-progress status (Scribe Agent lifecycle). */
  draft_state: DraftState;
  /** The actual written content for this section. */
  content_draft: string;
  /** Confirmation status of the structure definition itself. */
  pcs_status: FieldStatus;
  /** Who created or last modified this section definition. */
  source: FieldSource;
  /** System confidence in the correctness of this section definition. */
  confidence: number;
  /** Zero-based position in the flattened outline order. */
  order: number;
  /** Optional parent section ID for hierarchical outlines (V2). */
  parent_id?: string;
  /** Child sections (V2 nested structure support). */
  children?: StructureSection[];
}

/**
 * **Structure Layer** — What is the blueprint of the piece?
 *
 * Contains the ordered, possibly nested, list of sections that form the
 * outline of the final draft. Each section is a `StructureSection` with
 * its own goal, function, and draft lifecycle.
 *
 * @layer 5 of 6
 */
export interface StructureLayer {
  /** Ordered list of top-level sections forming the outline. */
  sections: StructureSection[];
}

// ---------------------------------------------------------------------------
// Expression Layer
// ---------------------------------------------------------------------------

/**
 * **Expression Layer** — How should the piece sound and feel?
 *
 * Encodes the stylistic dimensions of the writing: tone, voice, things to
 * avoid, and references to emulate. These fields guide the Scribe Agent
 * during Phase 4 generation.
 *
 * @layer 6 of 6
 */
export interface ExpressionLayer {
  /** The overall tone of the piece (e.g. "分析型", "叙事型", "幽默"). */
  tone: PCSField<string>;
  /** The authorial persona or voice the piece should adopt. */
  voice: PCSField<string>;
  /** Elements, patterns, or language to consciously avoid. */
  avoid: PCSField<string[]>;
  /** A reference work whose style should be emulated (e.g. "经济学人"). */
  style_reference: PCSField<string>;
  /** A reference work whose format should be followed. */
  format_reference: PCSField<string>;
  /** A reference work whose thinking pattern should be mirrored. */
  thinking_reference: PCSField<string>;
}

// ---------------------------------------------------------------------------
// 4. PCS Root State
// ---------------------------------------------------------------------------

/**
 * The complete PCS (Project Creative State) for a single writing project.
 *
 * This is the root state object that flows through every agent, every UI
 * component, and every persistence layer. It comprises the project identity,
 * the current phase, creation/update timestamps, and all six semantic
 * layers.
 *
 * ## Lifecycle
 *
 * 1. Created in `initializing` phase by the Sculptor orchestration layer.
 * 2. Populated layer-by-layer through `clarifying` and `structured`.
 * 3. Mutated node-by-node during `executing`.
 * 4. Reviewed holistically during `reviewing`.
 * 5. Frozen at `completed` phase.
 *
 * ## Serialization
 *
 * This type is designed for JSON serialisation. All dates are ISO 8601
 * strings, and all values are JSON-serialisable primitives.
 */
export interface PCSState {
  /** Unique identifier for this PCS instance (UUID). */
  id: string;
  /** The project this PCS belongs to (UUID). */
  project_id: string;
  /** Current phase in the 6-phase lifecycle. */
  phase: PCSPhase;
  /** ISO 8601 timestamp of PCS creation. */
  created_at: string;
  /** ISO 8601 timestamp of the most recent mutation. */
  updated_at: string;
  /** Layer 1: creative intent and purpose. */
  intent: IntentLayer;
  /** Layer 2: target audience profile. */
  audience: AudienceLayer;
  /** Layer 3: hard constraints and limits. */
  constraint: ConstraintLayer;
  /** Layer 4: knowledge requirements and gaps. */
  knowledge: KnowledgeLayer;
  /** Layer 5: the structural blueprint (outline). */
  structure: StructureLayer;
  /** Layer 6: stylistic expression parameters. */
  expression: ExpressionLayer;
}

// ---------------------------------------------------------------------------
// 5. Decision History
// ---------------------------------------------------------------------------

/**
 * An immutable record of a single user or system decision that altered
 * the PCS.
 *
 * Every time a field value changes — whether by user confirmation, proposal
 * acceptance, or system inference — a `DecisionRecord` is appended to the
 * project's decision log. This enables full auditability and undo semantics.
 *
 * ## Field path notation
 *
 * The `field_path` uses dot-delimited paths: `"layer.field"`, e.g.:
 *   - `"intent.purpose"`
 *   - `"constraint.length_max"`
 *   - `"structure.sections[3].title"`
 *
 * For array-index access the path includes bracket-index notation.
 */
export interface DecisionRecord {
  /** Unique identifier for this decision record (UUID). */
  id: string;
  /** ISO 8601 timestamp of when the decision was made. */
  timestamp: string;
  /**
   * Dot-delimited path to the field that was changed.
   * e.g. `"intent.purpose"`, `"constraint.length_min"`.
   */
  field_path: string;
  /** The value before the decision was applied. */
  old_value: unknown;
  /** The value after the decision was applied. */
  new_value: unknown;
  /** Human-readable rationale for the change. */
  reason: string;
  /** Whether a user, AI agent, or system made this decision. */
  initiator: FieldSource;
  /** The PCS phase during which the decision was made. */
  phase: PCSPhase;
}

// ---------------------------------------------------------------------------
// 6. Review Report (Phase 4 → 5 gateway)
// ---------------------------------------------------------------------------

/**
 * Severity of a review finding.
 *
 *   `pass`     → the dimension is satisfied; no action needed
 *   `warning`  → a minor issue that should be addressed but does not
 *                 block progression
 *   `blocking` → a critical issue that MUST be resolved before the
 *                 project can exit the `reviewing` phase
 */
export type ReviewSeverity = 'pass' | 'warning' | 'blocking';

/**
 * The five review dimensions.
 *
 * Every `ReviewIssue` maps to exactly one of these dimensions, which
 * together provide holistic quality assurance of the final draft.
 */
export type ReviewDimension =
  | 'intent_satisfaction'
  | 'knowledge_coverage'
  | 'constraint_compliance'
  | 'expression_consistency'
  | 'structure_completeness';

/**
 * A single finding from the Reviewer Agent's holistic review pass.
 *
 * Issues are classified by dimension and severity. Blocking issues must
 * be resolved before the project can move from `reviewing` to `completed`.
 */
export interface ReviewIssue {
  /** Unique identifier for this issue (UUID). */
  id: string;
  /** Which of the five review dimensions this issue belongs to. */
  dimension: ReviewDimension;
  /** How severe this finding is. */
  severity: ReviewSeverity;
  /** Human-readable description of the issue. */
  description: string;
  /** Optional reference to the section or node where the issue occurs. */
  location?: string;
  /** Optional suggested fix or mitigation. */
  suggestion?: string;
}

/**
 * The aggregate result of the Reviewer Agent's evaluation.
 *
 * Produced during the `reviewing` phase, this report summarises all issues
 * across the five dimensions and provides a rolled-up count of findings
 * by severity.
 */
export interface ReviewReport {
  /** Unique identifier for this report (UUID). */
  id: string;
  /** ISO 8601 timestamp of when the report was generated. */
  timestamp: string;
  /** The PCS phase during which this report was produced (always `reviewing`). */
  phase: PCSPhase;
  /** Individual findings across all five review dimensions. */
  issues: ReviewIssue[];
  /** Rolled-up counts by severity. */
  summary: {
    /** Total number of issues found. */
    total: number;
    /** Number of issues with severity `blocking`. */
    blocking: number;
    /** Number of issues with severity `warning`. */
    warning: number;
    /** Number of issues with severity `pass`. */
    pass: number;
  };
}

// ---------------------------------------------------------------------------
// 7. Phase 3 sub-phases
// ---------------------------------------------------------------------------

/**
 * Sub-phases within Phase 3 (`structured`).
 *
 * Phase 3 is the most complex phase: the Architect Agent first injects
 * context from the confirmed intent, audience, constraint, and knowledge
 * layers, then discovers and refines the stylistic expression parameters.
 *
 *   `3a_context_injection` → The Architect synthesises all confirmed
 *     layers into a coherent blueprint. Structure sections are generated
 *     and associated with knowledge requirements.
 *   `3b_style_discovery`   → The Architect analyses the confirmed
 *     expression references (style, format, thinking) and derives
 *     concrete tone/voice/avoid parameters.
 */
export type Phase3SubPhase = '3a_context_injection' | '3b_style_discovery';

// ---------------------------------------------------------------------------
// 8. Generation Plan (Phase 4 per-node instruction sheet)
// ---------------------------------------------------------------------------

/**
 * A detailed, per-node instruction sheet for the Scribe Agent.
 *
 * Before writing a single section, the Architect Agent produces a
 * `GenerationPlan` that encodes exactly what the Scribe needs to know:
 * the node's goal, suggested internal structure, word-count estimate,
 * required knowledge topics, tone and avoidance instructions, and
 * transition hooks to maintain narrative cohesion.
 *
 * The plan MUST be confirmed by the user before generation begins.
 */
export interface GenerationPlan {
  /** The ID of the `StructureSection` this plan is for. */
  node_id: string;
  /** A one-line summary of what this section must achieve. */
  goal_summary: string;
  /**
   * Suggested internal sub-divisions for large sections.
   * Each entry is a label for an internal sub-section (e.g. "背景",
   * "主要论点", "例证", "小结").
   */
  suggested_substructure: string[];
  /** Estimated word count for this section (used for pacing). */
  estimated_length: number;
  /** Knowledge topics from `KnowledgeLayer.required_topics` that must be covered. */
  required_topics: string[];
  /** Concrete, node-specific tone application instruction. */
  tone_instruction: string;
  /** Formatted list of things to avoid, specific to this node. */
  avoid_instruction: string;
  /** Narrative or logical connection FROM the previous section. */
  transition_from: string;
  /** Narrative or logical connection TO the next section. */
  transition_to: string;
  /** ISO 8601 timestamp of when this plan was created. */
  created_at: string;
  /** Whether the user has explicitly confirmed this plan. */
  confirmed: boolean;
}

// ---------------------------------------------------------------------------
// 9. Data Priority for Agent Context Assembly
// ---------------------------------------------------------------------------

/**
 * Data priority tier for PCS fields.
 * Agents use this to decide which fields to include in LLM context
 * when token budget is limited.
 *
 * Tier 1 (常驻): Always injected — never trimmed.
 * Tier 2 (按阶段): Injected based on current phase — may be trimmed per-node.
 * Tier 3 (按需): Injected only on conflict detection or explicit user reference.
 */
export type FieldPriority = 1 | 2 | 3;

/**
 * Maps PCS field paths to their data priority tier.
 * Used by BaseAgent.assembleContext() to construct LLM context.
 */
export const FIELD_PRIORITY_MAP: Record<string, FieldPriority> = {
  // === Tier 1: 常驻（永不遗忘）===
  'expression.tone': 1,
  'expression.voice': 1,
  'expression.avoid': 1,
  'expression.style_reference': 1,
  'intent.purpose': 1,
  'intent.core_message': 1,

  // === Tier 2: 按阶段（作品约束）===
  'intent.desired_impact': 2,
  'intent.target_emotion': 2,
  'audience.audience_type': 2,
  'audience.knowledge_level': 2,
  'audience.relationship': 2,
  'audience.pain_points': 2,
  'constraint.type': 2,
  'constraint.platform': 2,
  'constraint.format': 2,
  'constraint.length_min': 2,
  'constraint.length_max': 2,
  'constraint.deadline': 2,
  'knowledge.required_topics': 2,

  // === Tier 3: 按需（辅助参考）===
  'expression.format_reference': 3,
  'expression.thinking_reference': 3,
  'constraint.custom_constraints': 3,
  'knowledge.known_topics': 3,
  'knowledge.sources': 3,
};

// ---------------------------------------------------------------------------
// Type guards & utility type
// ---------------------------------------------------------------------------

/**
 * Discriminates whether a given phase represents a state where the PCS
 * is still being actively shaped (before the final review gate).
 *
 * @param phase - The PCS phase to test.
 * @returns `true` if the phase allows field mutation.
 */
export function isMutablePhase(phase: PCSPhase): boolean {
  return phase !== 'completed' && phase !== 'reviewing';
}

/**
 * Discriminates whether a `FieldStatus` represents a "settled" value
 * (either confirmed or locked — not in flux).
 *
 * @param status - The field status to test.
 * @returns `true` if the status is `confirmed` or `locked`.
 */
export function isSettledStatus(status: FieldStatus): boolean {
  return status === 'confirmed' || status === 'locked';
}
