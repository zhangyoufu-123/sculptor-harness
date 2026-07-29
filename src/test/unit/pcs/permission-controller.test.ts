/**
 * Unit tests for PermissionController.
 *
 * Validates the three-role permission model: which sources can propose,
 * accept, and reject changes to PCS fields.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionController } from '@/pcs/permission-controller';
import type { FieldSource } from '@/pcs/types';

describe('PermissionController', () => {
  let controller: PermissionController;

  beforeEach(() => {
    controller = new PermissionController();
  });

  // -----------------------------------------------------------------------
  // canPropose
  // -----------------------------------------------------------------------

  describe('canPropose', () => {
    const fieldPath = 'intent.purpose';

    it('AI can propose', () => {
      expect(controller.canPropose(fieldPath, 'ai')).toBe(true);
    });

    it('system can propose', () => {
      expect(controller.canPropose(fieldPath, 'system')).toBe(true);
    });

    it('user cannot propose', () => {
      expect(controller.canPropose(fieldPath, 'user')).toBe(false);
    });

    it('works for any field path', () => {
      expect(controller.canPropose('constraint.length_min', 'ai')).toBe(true);
      expect(controller.canPropose('audience.knowledge_level', 'system')).toBe(true);
      expect(controller.canPropose('expression.tone', 'ai')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // canAccept
  // -----------------------------------------------------------------------

  describe('canAccept', () => {
    const fieldPath = 'intent.purpose';

    it('user can accept', () => {
      expect(controller.canAccept(fieldPath, 'user')).toBe(true);
    });

    it('AI cannot accept', () => {
      expect(controller.canAccept(fieldPath, 'ai')).toBe(false);
    });

    it('system cannot accept', () => {
      expect(controller.canAccept(fieldPath, 'system')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // canReject
  // -----------------------------------------------------------------------

  describe('canReject', () => {
    const fieldPath = 'intent.core_message';

    it('user can reject', () => {
      expect(controller.canReject(fieldPath, 'user')).toBe(true);
    });

    it('AI cannot reject', () => {
      expect(controller.canReject(fieldPath, 'ai')).toBe(false);
    });

    it('system cannot reject', () => {
      expect(controller.canReject(fieldPath, 'system')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Full permission matrix
  // -----------------------------------------------------------------------

  describe('permission matrix', () => {
    const sources: FieldSource[] = ['user', 'ai', 'system'];
    const fieldPath = 'intent.desired_impact';

    it('user: propose=false, accept=true, reject=true', () => {
      expect(controller.canPropose(fieldPath, 'user')).toBe(false);
      expect(controller.canAccept(fieldPath, 'user')).toBe(true);
      expect(controller.canReject(fieldPath, 'user')).toBe(true);
    });

    it('ai: propose=true, accept=false, reject=false', () => {
      expect(controller.canPropose(fieldPath, 'ai')).toBe(true);
      expect(controller.canAccept(fieldPath, 'ai')).toBe(false);
      expect(controller.canReject(fieldPath, 'ai')).toBe(false);
    });

    it('system: propose=true, accept=false, reject=false', () => {
      expect(controller.canPropose(fieldPath, 'system')).toBe(true);
      expect(controller.canAccept(fieldPath, 'system')).toBe(false);
      expect(controller.canReject(fieldPath, 'system')).toBe(false);
    });

    it('covers all FieldSource values', () => {
      for (const source of sources) {
        // Every source should have defined boolean results
        expect(typeof controller.canPropose(fieldPath, source)).toBe('boolean');
        expect(typeof controller.canAccept(fieldPath, source)).toBe('boolean');
        expect(typeof controller.canReject(fieldPath, source)).toBe('boolean');
      }
    });
  });
});
