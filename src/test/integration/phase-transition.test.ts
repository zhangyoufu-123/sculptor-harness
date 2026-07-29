// ============================================================
// phase-transition.test.ts — Full 6-phase lifecycle tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { PCSManager } from '@/pcs/pcs-manager';
import type { PCSPhase } from '@/pcs/types';
import { createPCSState, createMockField, createSection } from '@/test/mocks/pcs-factory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that a transition succeeds. */
function expectTransition(manager: PCSManager, target: PCSPhase): void {
  const result = manager.transitionTo(target);
  expect(result.success).toBe(true);
  expect(manager.getPhase()).toBe(target);
}

/** Assert that a transition fails. */
function expectBlocked(manager: PCSManager, target: PCSPhase, expectedError?: string): void {
  const phaseBefore = manager.getPhase();
  const result = manager.transitionTo(target);
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  if (expectedError !== undefined) {
    expect(result.error).toContain(expectedError);
  }
  // Phase must not have changed
  expect(manager.getPhase()).toBe(phaseBefore);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PCS Phase Transition Lifecycle', () => {
  // =======================================================================
  // Forward transitions
  // =======================================================================

  describe('forward transitions (0 → 5)', () => {
    it('transitions through all 6 phases in order', () => {
      const manager = new PCSManager(createPCSState('initializing'));

      // 0 → 1
      expectTransition(manager, 'clarifying');
      // 1 → 2
      expectTransition(manager, 'structured');
      // 2 → 3
      expectTransition(manager, 'executing');
      // 3 → 4
      expectTransition(manager, 'reviewing');
      // 4 → 5
      expectTransition(manager, 'completed');

      // At terminal phase — no further transitions
      expect(manager.getNextPhases()).toEqual([]);
    });

    it('transitions initializing → clarifying without guards', () => {
      const manager = new PCSManager(createPCSState('initializing'));
      const result = manager.transitionTo('clarifying');
      expect(result.success).toBe(true);
      expect(manager.getPhase()).toBe('clarifying');
    });
  });

  // =======================================================================
  // Backward transitions
  // =======================================================================

  describe('backward transitions', () => {
    it('allows clarifying → initializing (user restart)', () => {
      const manager = new PCSManager(createPCSState('clarifying'));
      expectTransition(manager, 'initializing');
    });

    it('allows structured → clarifying (revise requirements)', () => {
      const manager = new PCSManager(createPCSState('structured'));
      expectTransition(manager, 'clarifying');
    });

    it('allows executing → structured (adjust blueprint)', () => {
      const manager = new PCSManager(createPCSState('executing'));
      expectTransition(manager, 'structured');
    });

    it('allows reviewing → executing (fix issues)', () => {
      const manager = new PCSManager(createPCSState('reviewing'));
      expectTransition(manager, 'executing');
    });
  });

  // =======================================================================
  // Invalid transitions (not in the graph)
  // =======================================================================

  describe('invalid transitions (structural)', () => {
    it('blocks initializing → structured (cannot skip clarifying)', () => {
      const manager = new PCSManager(createPCSState('initializing'));
      expectBlocked(manager, 'structured', 'not allowed');
    });

    it('blocks structured → reviewing (cannot skip executing)', () => {
      const manager = new PCSManager(createPCSState('structured'));
      expectBlocked(manager, 'reviewing', 'not allowed');
    });

    it('blocks executing → completed (cannot skip reviewing)', () => {
      const manager = new PCSManager(createPCSState('executing'));
      expectBlocked(manager, 'completed', 'not allowed');
    });

    it('blocks any transition from completed', () => {
      const manager = new PCSManager(createPCSState('completed'));
      expectBlocked(manager, 'reviewing', 'not allowed');
      expectBlocked(manager, 'executing', 'not allowed');
      expectBlocked(manager, 'initializing', 'not allowed');
    });
  });

  // =======================================================================
  // Guard enforcement
  // =======================================================================

  describe('guard enforcement', () => {
    it('blocks clarifying → structured when Intent fields are not confirmed', () => {
      // Create a state where one intent field is "proposed" (not confirmed/assumed)
      const state = createPCSState('clarifying', {
        intent: {
          purpose: createMockField('inform', { status: 'proposed' }),
          core_message: createMockField('msg'),
          desired_impact: createMockField('impact'),
          target_emotion: createMockField('curious'),
        },
        audience: {
          audience_type: createMockField('devs'),
          knowledge_level: createMockField('mid'),
          relationship: createMockField('peer'),
          pain_points: createMockField(['x']),
        },
      });
      const manager = new PCSManager(state);
      expectBlocked(manager, 'structured', 'Unmet conditions');
    });

    it('blocks structured → executing when no sections exist', () => {
      const state = createPCSState('structured', {
        structure: { sections: [] },
      });
      const manager = new PCSManager(state);
      expectBlocked(manager, 'executing', 'Unmet conditions');
    });

    it('blocks structured → executing when sections have unconfirmed pcs_status', () => {
      const state = createPCSState('structured', {
        structure: {
          sections: [createSection({ order: 0, pcs_status: 'proposed' })],
        },
      });
      const manager = new PCSManager(state);
      expectBlocked(manager, 'executing', 'Unmet conditions');
    });

    it('blocks executing → reviewing when hard nodes are not yet drafted', () => {
      const state = createPCSState('executing', {
        structure: {
          sections: [
            createSection({ order: 0, hardness: 'hard', draft_state: 'empty' }),
            createSection({ order: 1, hardness: 'soft', draft_state: 'drafted' }),
          ],
        },
      });
      const manager = new PCSManager(state);
      expectBlocked(manager, 'reviewing', 'Unmet conditions');
    });

    it('allows executing → reviewing when all hard nodes are drafted or beyond', () => {
      const state = createPCSState('executing', {
        structure: {
          sections: [
            createSection({ order: 0, hardness: 'hard', draft_state: 'approved' }),
            createSection({ order: 1, hardness: 'hard', draft_state: 'drafted' }),
          ],
        },
      });
      const manager = new PCSManager(state);
      expectTransition(manager, 'reviewing');
    });
  });

  // =======================================================================
  // Layer locking
  // =======================================================================

  describe('layer locking', () => {
    it('locks every field in the Intent layer after transitioning to structured', () => {
      const manager = new PCSManager(createPCSState('clarifying'));
      expectTransition(manager, 'structured');

      // All Intent-layer PCSFields should be locked
      const lockedStates = [
        manager.getFieldStatus('intent.purpose'),
        manager.getFieldStatus('intent.core_message'),
        manager.getFieldStatus('intent.desired_impact'),
        manager.getFieldStatus('intent.target_emotion'),
      ];
      lockedStates.forEach((status) => {
        expect(status).toBe('locked');
      });

      // Other layers should remain unlocked
      expect(manager.getFieldStatus('expression.tone')).toBe('confirmed');
    });

    it('locks all PCSField-bearing layers after transitioning to completed', () => {
      const manager = new PCSManager(createPCSState('reviewing'));
      expectTransition(manager, 'completed');

      // Spot-check fields across multiple layers
      expect(manager.getFieldStatus('intent.purpose')).toBe('locked');
      expect(manager.getFieldStatus('audience.audience_type')).toBe('locked');
      expect(manager.getFieldStatus('constraint.length_min')).toBe('locked');
      expect(manager.getFieldStatus('expression.tone')).toBe('locked');

      // Knowledge layer: 'sources' is a PCSField, so it is locked;
      // 'required_topics' is a plain array, so getFieldStatus returns undefined
      expect(manager.getFieldStatus('knowledge.sources')).toBe('locked');
    });

    it('cannot write to a locked field after completed phase', () => {
      const manager = new PCSManager(createPCSState('reviewing'));
      expectTransition(manager, 'completed');

      const writeResult = manager.writeField('intent.purpose', 'new-value', 'user');
      expect(writeResult.success).toBe(false);
      expect(writeResult.error).toContain('locked');
    });
  });

  // =======================================================================
  // Data survival across transitions
  // =======================================================================

  describe('data survival', () => {
    it('preserves field values across all forward transitions', () => {
      const state = createPCSState('initializing', {
        intent: {
          purpose: createMockField('persuade'),
          core_message: createMockField('Buy this!'),
          desired_impact: createMockField('Purchase decision'),
          target_emotion: createMockField('excited'),
        },
      });
      const manager = new PCSManager(state);

      // Transition through all phases
      expectTransition(manager, 'clarifying');
      expectTransition(manager, 'structured');
      expectTransition(manager, 'executing');
      expectTransition(manager, 'reviewing');
      expectTransition(manager, 'completed');

      // Values survive even though fields are locked
      const snapshot = manager.getSnapshot();
      expect(snapshot.intent.purpose.value).toBe('persuade');
      expect(snapshot.intent.core_message.value).toBe('Buy this!');
      expect(snapshot.intent.desired_impact.value).toBe('Purchase decision');
      expect(snapshot.intent.target_emotion.value).toBe('excited');
    });

    it('preserves field values across forward then backward transitions', () => {
      const state = createPCSState('initializing', {
        intent: { purpose: createMockField('entertain') },
      });
      const manager = new PCSManager(state);

      // Forward to structured
      expectTransition(manager, 'clarifying');
      expectTransition(manager, 'structured');

      // Backward to clarifying (structure is mutable, intent is still locked)
      expectTransition(manager, 'clarifying');

      // Value still present
      const snapshot = manager.getSnapshot();
      expect(snapshot.intent.purpose.value).toBe('entertain');
    });

    it('getNextPhases reflects current reachable phases', () => {
      const manager = new PCSManager(createPCSState('executing'));
      const next = manager.getNextPhases();
      // executing can go to structured (backward) or reviewing (forward)
      expect(next).toContain('structured');
      expect(next).toContain('reviewing');
      expect(next).toHaveLength(2);
    });
  });
});
