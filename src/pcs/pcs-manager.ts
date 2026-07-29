/**
 * PCS Manager — Central coordinator for the Project Creative State.
 *
 * Every external interaction with the PCS flows through this class.
 * It owns the authoritative PCSState, delegates to sub‑systems
 * (state machine, permission controller, proposal layer, decision
 * history, consistency engine), and enforces the write/confirm/reject
 * lifecycle.
 *
 * @module pcs/pcs-manager
 */

import type {
  PCSState,
  PCSPhase,
  PCSField,
  DecisionRecord,
  ProposalTrigger,
  ProposalStatus,
  FieldSource,
  DraftState,
  StructureSection,
  ReviewIssue,
  Proposal,
} from './types';

import { StateMachine } from './state-machine';
import type { TransitionResult } from './state-machine';
import { PermissionController } from './permission-controller';
import { ProposalLayer } from './proposal-layer';
import type { ProposalResult } from './proposal-layer';
import { DecisionHistory } from './decision-history';
import { ConsistencyEngine } from './consistency-engine';
import type { ConsistencyResult } from './consistency-engine';

import type { IPCSAccessor, ProposalMutation } from '../agents/types';

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Narrow an unknown value to a {@link PCSField} by duck‑type checking for
 * the required `status` and `value` properties.
 */
function isPCSField(value: unknown): value is PCSField {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  return 'status' in value && 'value' in value;
}

// ---------------------------------------------------------------------------
// PCSManager
// ---------------------------------------------------------------------------

export class PCSManager {
  private state: PCSState;
  private stateMachine: StateMachine;
  private permissionController: PermissionController;
  private proposalLayer: ProposalLayer;
  private decisionHistory: DecisionHistory;
  private consistencyEngine: ConsistencyEngine;

  constructor(initialState: PCSState) {
    this.state = structuredClone(initialState);
    this.stateMachine = new StateMachine();
    this.permissionController = new PermissionController();
    this.proposalLayer = new ProposalLayer(this.permissionController);
    this.decisionHistory = new DecisionHistory();
    this.consistencyEngine = new ConsistencyEngine(this.state);
  }

  // =========================================================================
  // Read Operations
  // =========================================================================

  /** Return a deep‑cloned snapshot of the current PCS state. */
  getSnapshot(): PCSState {
    return structuredClone(this.state);
  }

  /** Return the current PCS lifecycle phase. */
  getPhase(): PCSPhase {
    return this.state.phase;
  }

  /**
   * Read the **value** of a PCS field by dot‑notation path.
   *
   * @example manager.getField<string>("intent.purpose") // → "persuade"
   * @returns The field value, or `undefined` if the path does not resolve.
   */
  getField<T = unknown>(path: string): T | undefined {
    const field = this.resolveField(path);
    return field?.value as T | undefined;
  }

  /**
   * Read the {@link FieldStatus} of a PCS field by path.
   *
   * @returns The status string, or `undefined` if the path does not resolve.
   */
  getFieldStatus(path: string): string | undefined {
    const field = this.resolveField(path);
    return field?.status;
  }

  // =========================================================================
  // Phase Transitions
  // =========================================================================

  /**
   * Attempt to advance the PCS to `target`.
   *
   * Guards from {@link StateMachine} are evaluated against the current
   * state; the phase is only updated on success.
   *
   * Side effects:
   *   - Transitioning to `structured` locks every field in the Intent layer.
   *   - Transitioning to `completed` locks every PCSField across all layers.
   */
  transitionTo(target: PCSPhase): { success: boolean; error?: string } {
    const result: TransitionResult = this.stateMachine.transition(this.state, target);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    this.state.phase = target;

    if (target === 'structured') {
      this.lockLayer('intent');
    }

    if (target === 'completed') {
      this.lockAllLayers();
    }

    this.state.updated_at = new Date().toISOString();
    return { success: true };
  }

  /** List phases reachable in one step from the current phase. */
  getNextPhases(): PCSPhase[] {
    return this.stateMachine.getNextPhases(this.state.phase);
  }

  // =========================================================================
  // Write Operations (permission‑gated)
  // =========================================================================

  /**
   * Perform a direct write to a PCS field.
   *
   * Rules:
   *   - User can write to any status except `locked`.
   *   - AI can only write to `proposed` or `assumed` fields.
   *   - System can write to any status.
   *   - Overwriting a `confirmed` or `locked` field records the change in
   *     {@link DecisionHistory}.
   */
  writeField(
    path: string,
    value: unknown,
    source: FieldSource,
  ): { success: boolean; error?: string } {
    const field = this.resolveField(path);
    if (field === undefined) {
      return { success: false, error: `Field not found: ${path}` };
    }

    const permError = this.checkWritePermission(source, field.status);
    if (permError !== null) {
      return { success: false, error: permError };
    }

    const oldValue = field.value;
    const oldStatus = field.status;

    // Apply the write.
    field.value = value;
    field.source = source;
    field.last_updated = new Date().toISOString();

    // If we are overwriting a confirmed or locked value, log the decision.
    if (oldStatus === 'confirmed' || oldStatus === 'locked') {
      this.decisionHistory.record({
        fieldPath: path,
        oldValue,
        newValue: value,
        reason: `Direct write by ${source}`,
        initiator: source,
        phase: this.state.phase,
      });
    }

    this.state.updated_at = new Date().toISOString();
    return { success: true };
  }

  /**
   * AI‑only: create a proposal to change a field.
   *
   * The proposal sits in the {@link ProposalLayer} and does **not** mutate
   * the actual field value.  The user must explicitly {@link acceptProposal}
   * or {@link rejectProposal}.
   */
  proposeField(
    path: string,
    newValue: unknown,
    reason: string,
    trigger: ProposalTrigger,
  ): { success: boolean; error?: string } {
    const field = this.resolveField(path);
    if (field === undefined) {
      return { success: false, error: `Field not found: ${path}` };
    }

    const result: ProposalResult = this.proposalLayer.submit({
      fieldPath: path,
      newValue,
      reason,
      trigger,
      source: 'ai',
    });

    if (!result.success) {
      return { success: false, error: result.reason };
    }
    return { success: true };
  }

  /**
   * User‑only: accept a pending proposal and apply its value.
   *
   * The old and new values are recorded in {@link DecisionHistory}.
   */
  acceptProposal(path: string): {
    success: boolean;
    oldValue?: unknown;
    newValue?: unknown;
    error?: string;
  } {
    const field = this.resolveField(path);
    if (field === undefined) {
      return { success: false, error: `Field not found: ${path}` };
    }

    const oldValue = field.value;

    const { result } = this.proposalLayer.accept(path, field, 'user');
    if (!result.success) {
      return { success: false, error: result.reason };
    }

    this.decisionHistory.record({
      fieldPath: path,
      oldValue,
      newValue: field.value,
      reason: 'Proposal accepted by user',
      initiator: 'user',
      phase: this.state.phase,
    });

    this.state.updated_at = new Date().toISOString();
    return { success: true, oldValue, newValue: field.value };
  }

  /**
   * User‑only: reject a pending proposal without changing the field.
   */
  rejectProposal(path: string): { success: boolean; error?: string } {
    const field = this.resolveField(path);
    if (field === undefined) {
      return { success: false, error: `Field not found: ${path}` };
    }

    const { result } = this.proposalLayer.reject(path, field, 'user');
    if (!result.success) {
      return { success: false, error: result.reason };
    }
    return { success: true };
  }

  // =========================================================================
  // Structure Operations
  // =========================================================================

  getSections(): StructureSection[] {
    return this.state.structure.sections;
  }

  getSection(id: string): StructureSection | undefined {
    return this.state.structure.sections.find((s) => s.id === id);
  }

  updateSectionDraftState(id: string, draftState: DraftState): void {
    const section = this.getSection(id);
    if (section === undefined) return;
    section.draft_state = draftState;
    this.state.updated_at = new Date().toISOString();
  }

  updateSectionContent(id: string, content: string): void {
    const section = this.getSection(id);
    if (section === undefined) return;
    section.content_draft = content;
    this.state.updated_at = new Date().toISOString();
  }

  // =========================================================================
  // Consistency Checks
  // =========================================================================

  runConsistencyCheck(): ConsistencyResult {
    return this.consistencyEngine.runCheck();
  }

  checkNodeBeforeGeneration(nodeId: string): ReviewIssue[] {
    return this.consistencyEngine.checkNodeBeforeGeneration(nodeId);
  }

  checkNodeConflict(nodeId: string, content: string): ReviewIssue[] {
    return this.consistencyEngine.checkNodeConflict(nodeId, content);
  }

  // =========================================================================
  // Decision History
  // =========================================================================

  /** Retrieve decision records, optionally filtered by field path. */
  getDecisionHistory(fieldPath?: string): DecisionRecord[] {
    if (fieldPath !== undefined) {
      return this.decisionHistory.getForField(fieldPath);
    }
    return this.decisionHistory.getAll();
  }

  // =========================================================================
  // Pending Proposals
  // =========================================================================

  getPendingProposals(): Array<{ fieldPath: string; proposal: Proposal }> {
    return this.proposalLayer.getPending();
  }

  // =========================================================================
  // Accessor Factory (for Agents)
  // =========================================================================

  /**
   * Create an {@link IPCSAccessor} that wraps this manager with read‑only
   * semantics suitable for Sculptor Agents.
   *
   * Agents receive this accessor and may READ any field but may only WRITE
   * through {@link IPCSAccessor.propose} — never by direct mutation.
   */
  createAccessor(): IPCSAccessor {
    return {
      read: (path: string): unknown => this.getField(path),

      getSnapshot: (): PCSState => this.getSnapshot(),

      propose: (mutation: ProposalMutation): void => {
        this.proposeField(
          mutation.fieldPath,
          mutation.proposedValue,
          mutation.reason,
          mutation.trigger,
        );
      },

      getProposalStatus: (fieldPath: string): ProposalStatus | null =>
        this.proposalLayer.getStatus(fieldPath),

      getDecisionHistory: (fieldPath?: string): DecisionRecord[] =>
        this.getDecisionHistory(fieldPath),

      getCurrentPhase: (): PCSPhase => this.getPhase(),

      isLocked: (fieldPath: string): boolean => {
        const status = this.getFieldStatus(fieldPath);
        return status === 'locked';
      },
    };
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Resolve a dot‑notation path to a {@link PCSField} in the state tree.
   *
   * @example resolveField("intent.purpose") → state.intent.purpose
   * @returns The resolved {@link PCSField}, or `undefined`.
   */
  private resolveField(path: string): PCSField | undefined {
    const parts = path.split('.');
    if (parts.length === 0) return undefined;

    // Walk the state tree, stopping one level before the field name.
    let current: unknown = this.state;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[parts[i]];
    }

    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;

    const fieldName = parts[parts.length - 1];
    const candidate = (current as Record<string, unknown>)[fieldName];

    return isPCSField(candidate) ? candidate : undefined;
  }

  /**
   * Check whether `source` can directly write to a field with the given
   * `status`.  Returns `null` if permitted, otherwise an error string.
   *
   * Rules mirror the original `PermissionController.canWrite`:
   *   - User: any status except `locked`.
   *   - AI: only `proposed` and `assumed`.
   *   - System: any status.
   */
  private checkWritePermission(source: FieldSource, status: string): string | null {
    switch (source) {
      case 'user':
        if (status === 'locked') return 'Users cannot modify locked fields';
        return null;

      case 'ai':
        if (status === 'proposed' || status === 'assumed') return null;
        if (status === 'confirmed') {
          return 'AI cannot directly overwrite confirmed fields; propose a change instead';
        }
        if (status === 'locked') return 'AI cannot modify locked fields';
        return `AI cannot write to fields with status '${status}'`;

      case 'system':
        return null;
    }
  }

  /**
   * Lock every {@link PCSField} property on a named layer object.
   *
   * Non‑PCSField properties (arrays, plain scalars) are skipped so that
   * e.g. `KnowledgeLayer.required_topics` is not accidentally locked.
   */
  private lockLayer(layerName: string): void {
    const stateRecord = this.state as unknown as Record<string, unknown>;
    const layer = stateRecord[layerName];
    if (layer === null || layer === undefined) return;
    if (typeof layer !== 'object') return;

    const layerObj = layer as Record<string, unknown>;
    for (const key of Object.keys(layerObj)) {
      const field = layerObj[key];
      if (isPCSField(field)) {
        field.status = 'locked';
      }
    }
  }

  /**
   * Lock every {@link PCSField} across all six PCS layers (archival freeze).
   */
  private lockAllLayers(): void {
    const layers = [
      'intent',
      'audience',
      'constraint',
      'knowledge',
      'structure',
      'expression',
    ] as const;
    for (const layerName of layers) {
      this.lockLayer(layerName);
    }
  }
}
