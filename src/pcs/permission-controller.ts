/**
 * PermissionController — Gatekeeper for PCS field mutations.
 *
 * Determines whether a given source is authorized to propose, accept, or
 * reject changes to a specific field.  This is the single authority that
 * `ProposalLayer` consults before allowing any write.
 *
 * @module pcs/permission-controller
 */

import type { FieldSource } from './types';

export class PermissionController {
  /**
   * Can `source` create a proposal for `fieldPath`?
   *
   * Only AI and system agents may propose changes.  Users edit fields
   * directly and therefore never need to route through the proposal
   * machinery.
   */
  canPropose(_fieldPath: string, source: FieldSource): boolean {
    return source === 'ai' || source === 'system';
  }

  /**
   * Can `source` accept a pending proposal?
   *
   * Only the human user may confirm a proposed change.
   */
  canAccept(_fieldPath: string, source: FieldSource): boolean {
    return source === 'user';
  }

  /**
   * Can `source` reject a pending proposal?
   *
   * Only the human user may dismiss a proposed change.
   */
  canReject(_fieldPath: string, source: FieldSource): boolean {
    return source === 'user';
  }
}
