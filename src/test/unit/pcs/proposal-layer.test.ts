/**
 * Unit tests for ProposalLayer.
 *
 * Validates the proposal routing system: submit, accept, reject, query,
 * and permission enforcement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProposalLayer } from '@/pcs/proposal-layer';
import { PermissionController } from '@/pcs/permission-controller';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { PCSField } from '@/pcs/types';

describe('ProposalLayer', () => {
  let layer: ProposalLayer;
  let permissionController: PermissionController;

  beforeEach(() => {
    permissionController = new PermissionController();
    layer = new ProposalLayer(permissionController);
  });

  // -----------------------------------------------------------------------
  // submit
  // -----------------------------------------------------------------------

  describe('submit', () => {
    const fieldPath = 'intent.purpose';

    it('creates a pending proposal and returns success', () => {
      const result = layer.submit({
        fieldPath,
        newValue: 'inform',
        reason: 'Better match for audience',
        trigger: 'manual',
        source: 'ai',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(result.fieldPath).toBe(fieldPath);
    });

    it('does not change the actual field value', () => {
      const field: PCSField<string> = PCSFactory.makeField('persuade');
      const originalValue = field.value;

      layer.submit({
        fieldPath,
        newValue: 'inform',
        reason: 'Update purpose',
        trigger: 'manual',
        source: 'ai',
      });

      expect(field.value).toBe(originalValue);
    });

    it('blocks non-AI/system sources from submitting', () => {
      const result = layer.submit({
        fieldPath,
        newValue: 'inform',
        reason: 'Update purpose',
        trigger: 'manual',
        source: 'user',
      });

      expect(result.success).toBe(false);
      expect(result.action).toBe('blocked');
      expect(result.reason).toContain('not authorized');
    });

    it('allows system source to submit', () => {
      const result = layer.submit({
        fieldPath,
        newValue: 'inform',
        reason: 'System inference',
        trigger: 'blocking',
        source: 'system',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
    });

    it('overwrites an existing pending proposal on same field', () => {
      layer.submit({
        fieldPath,
        newValue: 'first-value',
        reason: 'First attempt',
        trigger: 'manual',
        source: 'ai',
      });

      layer.submit({
        fieldPath,
        newValue: 'second-value',
        reason: 'Second attempt',
        trigger: 'manual',
        source: 'ai',
      });

      const pending = layer.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].proposal.new_value).toBe('second-value');
      expect(pending[0].proposal.reason).toBe('Second attempt');
    });
  });

  // -----------------------------------------------------------------------
  // accept
  // -----------------------------------------------------------------------

  describe('accept', () => {
    const fieldPath = 'intent.purpose';

    it('updates field value, sets confirmed, clears proposal', () => {
      const field = PCSFactory.makeField('persuade');

      layer.submit({
        fieldPath,
        newValue: 'inform',
        reason: 'Better fit',
        trigger: 'manual',
        source: 'ai',
      });

      const { field: updatedField, result } = layer.accept(fieldPath, field, 'user');

      expect(result.success).toBe(true);
      expect(result.action).toBe('accepted');
      expect(updatedField.value).toBe('inform');
      expect(updatedField.status).toBe('confirmed');
      expect(updatedField.source).toBe('user');
      expect(updatedField.proposal).toBeNull();
      // last_updated must be refreshed; timestamp may be identical in
      // sub-millisecond runs, so we verify it is a truthy ISO string.
      expect(updatedField.last_updated).toBeTruthy();
      expect(new Date(updatedField.last_updated).toISOString()).toBe(updatedField.last_updated);
    });

    it('blocks non-user from accepting', () => {
      const field = PCSFactory.makeField('persuade');

      layer.submit({
        fieldPath,
        newValue: 'inform',
        reason: 'Better fit',
        trigger: 'manual',
        source: 'ai',
      });

      const { field: unchangedField, result } = layer.accept(fieldPath, field, 'ai');

      expect(result.success).toBe(false);
      expect(result.action).toBe('blocked');
      expect(result.reason).toContain('not authorized');
      expect(unchangedField.value).toBe('persuade');
    });

    it('blocks system from accepting', () => {
      const field = PCSFactory.makeField('persuade');

      layer.submit({
        fieldPath,
        newValue: 'inform',
        reason: 'Better fit',
        trigger: 'manual',
        source: 'ai',
      });

      const { result } = layer.accept(fieldPath, field, 'system');

      expect(result.success).toBe(false);
      expect(result.action).toBe('blocked');
    });

    it('fails when no pending proposal exists', () => {
      const field = PCSFactory.makeField('persuade');

      const { field: unchangedField, result } = layer.accept(fieldPath, field, 'user');

      expect(result.success).toBe(false);
      expect(result.reason).toContain('No pending proposal');
      expect(unchangedField.value).toBe('persuade');
    });

    it('removes proposal from pending after accept', () => {
      const field = PCSFactory.makeField('persuade');

      layer.submit({
        fieldPath,
        newValue: 'inform',
        reason: 'Better fit',
        trigger: 'manual',
        source: 'ai',
      });

      expect(layer.hasPending(fieldPath)).toBe(true);

      layer.accept(fieldPath, field, 'user');

      expect(layer.hasPending(fieldPath)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // reject
  // -----------------------------------------------------------------------

  describe('reject', () => {
    const fieldPath = 'intent.core_message';

    it('does not change field value, clears proposal', () => {
      const field = PCSFactory.makeField('Original message');

      layer.submit({
        fieldPath,
        newValue: 'New proposed message',
        reason: 'Stronger wording',
        trigger: 'manual',
        source: 'ai',
      });

      const { field: rejectedField, result } = layer.reject(fieldPath, field, 'user');

      expect(result.success).toBe(true);
      expect(result.action).toBe('rejected');
      expect(rejectedField.value).toBe('Original message');
      expect(rejectedField.proposal).toBeNull();
    });

    it('blocks non-user from rejecting', () => {
      const field = PCSFactory.makeField('Original message');

      layer.submit({
        fieldPath,
        newValue: 'New value',
        reason: 'Reason',
        trigger: 'manual',
        source: 'ai',
      });

      const { result } = layer.reject(fieldPath, field, 'ai');

      expect(result.success).toBe(false);
      expect(result.action).toBe('blocked');
      expect(result.reason).toContain('not authorized');
    });

    it('blocks system from rejecting', () => {
      const field = PCSFactory.makeField('Original message');

      layer.submit({
        fieldPath,
        newValue: 'New value',
        reason: 'Reason',
        trigger: 'manual',
        source: 'ai',
      });

      const { result } = layer.reject(fieldPath, field, 'system');

      expect(result.success).toBe(false);
      expect(result.action).toBe('blocked');
    });

    it('fails when no pending proposal exists', () => {
      const field = PCSFactory.makeField('value');

      const { result } = layer.reject(fieldPath, field, 'user');

      expect(result.success).toBe(false);
      expect(result.reason).toContain('No pending proposal');
    });

    it('removes proposal from pending after reject', () => {
      const field = PCSFactory.makeField('value');

      layer.submit({
        fieldPath,
        newValue: 'new',
        reason: 'Reason',
        trigger: 'manual',
        source: 'ai',
      });

      expect(layer.hasPending(fieldPath)).toBe(true);

      layer.reject(fieldPath, field, 'user');

      expect(layer.hasPending(fieldPath)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getPending
  // -----------------------------------------------------------------------

  describe('getPending', () => {
    it('returns all pending proposals with field paths', () => {
      layer.submit({
        fieldPath: 'intent.purpose',
        newValue: 'inform',
        reason: 'R1',
        trigger: 'manual',
        source: 'ai',
      });
      layer.submit({
        fieldPath: 'audience.knowledge_level',
        newValue: 'beginner',
        reason: 'R2',
        trigger: 'blocking',
        source: 'system',
      });

      const pending = layer.getPending();

      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.fieldPath).sort()).toEqual([
        'audience.knowledge_level',
        'intent.purpose',
      ]);
      for (const entry of pending) {
        expect(entry.proposal.status).toBe('pending');
      }
    });

    it('returns empty array when no proposals exist', () => {
      const pending = layer.getPending();
      expect(pending).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getByTrigger
  // -----------------------------------------------------------------------

  describe('getByTrigger', () => {
    it('filters proposals by trigger type', () => {
      layer.submit({
        fieldPath: 'intent.purpose',
        newValue: 'v1',
        reason: 'R1',
        trigger: 'manual',
        source: 'ai',
      });
      layer.submit({
        fieldPath: 'intent.core_message',
        newValue: 'v2',
        reason: 'R2',
        trigger: 'conflict',
        source: 'ai',
      });
      layer.submit({
        fieldPath: 'constraint.length_min',
        newValue: 100,
        reason: 'R3',
        trigger: 'blocking',
        source: 'system',
      });

      const manualProposals = layer.getByTrigger('manual');
      expect(manualProposals).toHaveLength(1);
      expect(manualProposals[0].fieldPath).toBe('intent.purpose');

      const conflictProposals = layer.getByTrigger('conflict');
      expect(conflictProposals).toHaveLength(1);
      expect(conflictProposals[0].fieldPath).toBe('intent.core_message');

      const blockingProposals = layer.getByTrigger('blocking');
      expect(blockingProposals).toHaveLength(1);
      expect(blockingProposals[0].fieldPath).toBe('constraint.length_min');
    });

    it('returns empty when no proposals match trigger', () => {
      layer.submit({
        fieldPath: 'intent.purpose',
        newValue: 'v',
        reason: 'R',
        trigger: 'manual',
        source: 'ai',
      });

      const conflictProposals = layer.getByTrigger('conflict');
      expect(conflictProposals).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // clearResolved
  // -----------------------------------------------------------------------

  describe('clearResolved', () => {
    it('removes accepted/rejected proposals, keeps pending', () => {
      const field1 = PCSFactory.makeField('v1');
      const field2 = PCSFactory.makeField('v2');

      layer.submit({
        fieldPath: 'intent.purpose',
        newValue: 'accepted',
        reason: 'To accept',
        trigger: 'manual',
        source: 'ai',
      });
      layer.submit({
        fieldPath: 'intent.core_message',
        newValue: 'rejected',
        reason: 'To reject',
        trigger: 'manual',
        source: 'ai',
      });
      layer.submit({
        fieldPath: 'audience.relationship',
        newValue: 'kept',
        reason: 'Keep pending',
        trigger: 'blocking',
        source: 'system',
      });

      layer.accept('intent.purpose', field1, 'user');
      layer.reject('intent.core_message', field2, 'user');

      layer.clearResolved();

      const pending = layer.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].fieldPath).toBe('audience.relationship');
      expect(pending[0].proposal.status).toBe('pending');
    });

    it('does nothing when all proposals are pending', () => {
      layer.submit({
        fieldPath: 'intent.purpose',
        newValue: 'v1',
        reason: 'R1',
        trigger: 'manual',
        source: 'ai',
      });
      layer.submit({
        fieldPath: 'intent.core_message',
        newValue: 'v2',
        reason: 'R2',
        trigger: 'conflict',
        source: 'ai',
      });

      layer.clearResolved();

      const pending = layer.getPending();
      expect(pending).toHaveLength(2);
    });

    it('does nothing when there are no proposals', () => {
      expect(() => layer.clearResolved()).not.toThrow();
      expect(layer.getPending()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Query helpers
  // -----------------------------------------------------------------------

  describe('query helpers', () => {
    const fieldPath = 'intent.purpose';

    it('getStatus returns pending for pending proposal', () => {
      layer.submit({
        fieldPath,
        newValue: 'v',
        reason: 'R',
        trigger: 'manual',
        source: 'ai',
      });

      expect(layer.getStatus(fieldPath)).toBe('pending');
    });

    it('getStatus returns null for field with no proposal', () => {
      expect(layer.getStatus(fieldPath)).toBeNull();
    });

    it('hasPending returns true only for fields with pending proposals', () => {
      expect(layer.hasPending(fieldPath)).toBe(false);

      layer.submit({
        fieldPath,
        newValue: 'v',
        reason: 'R',
        trigger: 'manual',
        source: 'ai',
      });

      expect(layer.hasPending(fieldPath)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple proposals on different fields
  // -----------------------------------------------------------------------

  describe('multiple fields', () => {
    it('can submit proposals on different fields independently', () => {
      layer.submit({
        fieldPath: 'intent.purpose',
        newValue: 'v1',
        reason: 'R1',
        trigger: 'manual',
        source: 'ai',
      });
      layer.submit({
        fieldPath: 'expression.tone',
        newValue: '叙事型',
        reason: 'R2',
        trigger: 'blocking',
        source: 'system',
      });

      expect(layer.hasPending('intent.purpose')).toBe(true);
      expect(layer.hasPending('expression.tone')).toBe(true);

      const field = PCSFactory.makeField('old');
      layer.accept('intent.purpose', field, 'user');

      expect(layer.hasPending('intent.purpose')).toBe(false);
      expect(layer.hasPending('expression.tone')).toBe(true);
    });
  });
});
