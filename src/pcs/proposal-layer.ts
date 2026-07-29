/**
 * ProposalLayer — The ONLY write path for Agent modifications.
 *
 * Every AI or system agent that wants to mutate a PCS field MUST route
 * through this layer.  Proposals are created in a "pending" state and
 * await explicit user acceptance or rejection before the field value
 * is actually changed.
 *
 * ## Design rules
 *
 * - **submit()**  → agent proposes; field.value is NEVER changed.
 * - **accept()**  → user confirms; field.value ← proposal.new_value.
 * - **reject()**  → user dismisses; field.value stays as-is.
 * - **Last proposal wins** — submitting to a field that already has a
 *   pending proposal silently overwrites the old one.
 * - **User only** can accept or reject (enforced via `PermissionController`).
 *
 * @module pcs/proposal-layer
 */

import type { Proposal, ProposalTrigger, ProposalStatus, PCSField, FieldSource } from './types';
import { PermissionController } from './permission-controller';

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

/** Result returned whenever a proposal action is attempted. */
export interface ProposalResult {
  /** Whether the action completed successfully. */
  success: boolean;
  /** Dot-delimited field path the action targeted. */
  fieldPath: string;
  /** Which lifecycle action was attempted. */
  action: 'created' | 'accepted' | 'rejected' | 'blocked';
  /** Human-readable explanation when `success === false`. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// ProposalLayer
// ---------------------------------------------------------------------------

export class ProposalLayer {
  private permissionController: PermissionController;
  private pendingProposals: Map<string, Proposal>;

  constructor(permissionController: PermissionController) {
    this.permissionController = permissionController;
    this.pendingProposals = new Map();
  }

  // -----------------------------------------------------------------------
  // submit — Agent creates a proposal
  // -----------------------------------------------------------------------

  /**
   * Submit a proposal for a field change.
   *
   * The agent MUST pass the `canPropose` permission gate.  The proposal is
   * stored in the internal `pendingProposals` map with `status: 'pending'`.
   * The field's `.value` is **not** modified — the caller should separately
   * attach the returned proposal to `field.proposal` if needed.
   *
   * If a pending proposal already exists for `fieldPath`, it is
   * overwritten (last proposal wins).
   *
   * @returns `ProposalResult` with `action: 'created'` on success, or
   *          `action: 'blocked'` when the source lacks permission.
   */
  submit(params: {
    fieldPath: string;
    newValue: unknown;
    reason: string;
    trigger: ProposalTrigger;
    source: FieldSource;
  }): ProposalResult {
    if (!this.permissionController.canPropose(params.fieldPath, params.source)) {
      return {
        success: false,
        fieldPath: params.fieldPath,
        action: 'blocked',
        reason: `Source "${params.source}" is not authorized to propose changes.`,
      };
    }

    const proposal: Proposal = {
      new_value: params.newValue,
      reason: params.reason,
      trigger: params.trigger,
      created_at: new Date().toISOString(),
      status: 'pending',
    };

    // Last proposal wins — silently overwrite any existing pending proposal.
    this.pendingProposals.set(params.fieldPath, proposal);

    return {
      success: true,
      fieldPath: params.fieldPath,
      action: 'created',
    };
  }

  // -----------------------------------------------------------------------
  // accept — User confirms a proposal
  // -----------------------------------------------------------------------

  /**
   * Accept a pending proposal and apply its value to the field.
   *
   * On success:
   * - `field.value` is set to `proposal.new_value`.
   * - `field.status` is set to `'confirmed'`.
   * - `field.source` is set to `'user'`.
   * - `field.last_updated` is refreshed.
   * - `field.proposal` is cleared.
   * - The proposal's `status` is set to `'accepted'`.
   * - The proposal is removed from `pendingProposals`.
   *
   * @param fieldPath  Dot-delimited field path.
   * @param field      The field to mutate (will be modified in-place).
   * @param source     Who is performing the accept — must be `'user'`.
   * @returns The mutated field and a result descriptor.
   */
  accept(
    fieldPath: string,
    field: PCSField,
    source: FieldSource,
  ): { field: PCSField; result: ProposalResult } {
    if (!this.permissionController.canAccept(fieldPath, source)) {
      return {
        field,
        result: {
          success: false,
          fieldPath,
          action: 'blocked',
          reason: `Source "${source}" is not authorized to accept proposals.`,
        },
      };
    }

    const proposal = this.pendingProposals.get(fieldPath);

    if (!proposal) {
      return {
        field,
        result: {
          success: false,
          fieldPath,
          action: 'blocked',
          reason: `No pending proposal exists for "${fieldPath}".`,
        },
      };
    }

    // Apply the proposal to the field.
    field.value = proposal.new_value;
    field.status = 'confirmed';
    field.source = 'user';
    field.last_updated = new Date().toISOString();
    field.proposal = null;

    // Mark proposal as resolved and remove from pending.
    proposal.status = 'accepted';
    this.pendingProposals.delete(fieldPath);

    return {
      field,
      result: {
        success: true,
        fieldPath,
        action: 'accepted',
      },
    };
  }

  // -----------------------------------------------------------------------
  // reject — User dismisses a proposal
  // -----------------------------------------------------------------------

  /**
   * Reject a pending proposal without changing the field value.
   *
   * On success:
   * - `field.value` is **not** modified.
   * - `field.proposal` is cleared.
   * - The proposal's `status` is set to `'rejected'`.
   * - The proposal is removed from `pendingProposals`.
   *
   * @param fieldPath  Dot-delimited field path.
   * @param field      The field (modified in-place only to clear `.proposal`).
   * @param source     Who is performing the reject — must be `'user'`.
   * @returns The (unchanged except for `.proposal`) field and a result descriptor.
   */
  reject(
    fieldPath: string,
    field: PCSField,
    source: FieldSource,
  ): { field: PCSField; result: ProposalResult } {
    if (!this.permissionController.canReject(fieldPath, source)) {
      return {
        field,
        result: {
          success: false,
          fieldPath,
          action: 'blocked',
          reason: `Source "${source}" is not authorized to reject proposals.`,
        },
      };
    }

    const proposal = this.pendingProposals.get(fieldPath);

    if (!proposal) {
      return {
        field,
        result: {
          success: false,
          fieldPath,
          action: 'blocked',
          reason: `No pending proposal exists for "${fieldPath}".`,
        },
      };
    }

    // Dismiss without touching field.value.
    field.proposal = null;

    // Mark proposal as resolved and remove from pending.
    proposal.status = 'rejected';
    this.pendingProposals.delete(fieldPath);

    return {
      field,
      result: {
        success: true,
        fieldPath,
        action: 'rejected',
      },
    };
  }

  // -----------------------------------------------------------------------
  // Query helpers
  // -----------------------------------------------------------------------

  /**
   * Return every proposal that is currently pending.
   */
  getPending(): Array<{ fieldPath: string; proposal: Proposal }> {
    const results: Array<{ fieldPath: string; proposal: Proposal }> = [];
    this.pendingProposals.forEach((proposal, fieldPath) => {
      results.push({ fieldPath, proposal });
    });
    return results;
  }

  /**
   * Get the lifecycle `ProposalStatus` for a field, or `null` if there is
   * no proposal on file.
   */
  getStatus(fieldPath: string): ProposalStatus | null {
    const proposal = this.pendingProposals.get(fieldPath);
    return proposal ? proposal.status : null;
  }

  /**
   * Does `fieldPath` have a pending proposal?
   */
  hasPending(fieldPath: string): boolean {
    return this.pendingProposals.has(fieldPath);
  }

  /**
   * Return all pending proposals whose trigger matches `trigger`.
   */
  getByTrigger(trigger: ProposalTrigger): Array<{ fieldPath: string; proposal: Proposal }> {
    const results: Array<{ fieldPath: string; proposal: Proposal }> = [];
    this.pendingProposals.forEach((proposal, fieldPath) => {
      if (proposal.trigger === trigger) {
        results.push({ fieldPath, proposal });
      }
    });
    return results;
  }

  /**
   * Remove every proposal that has been accepted or rejected.
   *
   * Normally, resolved proposals are evicted from `pendingProposals`
   * immediately upon accept/reject, so this is a no-op during normal
   * operation.  It exists as a safety hatch for phase-transition cleanup.
   */
  clearResolved(): void {
    const toDelete: string[] = [];
    this.pendingProposals.forEach((proposal, fieldPath) => {
      if (proposal.status === 'accepted' || proposal.status === 'rejected') {
        toDelete.push(fieldPath);
      }
    });
    toDelete.forEach((fieldPath) => {
      this.pendingProposals.delete(fieldPath);
    });
  }
}
