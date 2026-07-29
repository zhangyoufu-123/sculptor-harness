/**
 * Unit tests for PCS StateMachine.
 *
 * Validates the 6-phase transition graph, forward/backward edges,
 * guard conditions, and phase introspection helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine } from '@/pcs/state-machine';
import { PCSFactory } from '@/test/mocks/pcs-factory';

describe('StateMachine', () => {
  let machine: StateMachine;

  beforeEach(() => {
    machine = new StateMachine();
  });

  // -----------------------------------------------------------------------
  // Valid forward transitions
  // -----------------------------------------------------------------------

  describe('valid forward transitions', () => {
    it('allows initializing → clarifying', () => {
      expect(machine.canTransition('initializing', 'clarifying')).toBe(true);
    });

    it('allows clarifying → structured when guards are met', () => {
      const state = PCSFactory.createState({ phase: 'clarifying' });
      const result = machine.transition(state, 'structured');
      expect(result.success).toBe(true);
    });

    it('allows structured → executing when guards are met', () => {
      const state = PCSFactory.createState({ phase: 'structured' });
      const result = machine.transition(state, 'executing');
      expect(result.success).toBe(true);
    });

    it('allows executing → reviewing when hard nodes are drafted', () => {
      const state = PCSFactory.createState({
        phase: 'executing',
        structure: {
          sections: [PCSFactory.makeSection({ hardness: 'hard', draft_state: 'drafted' })],
        },
      });
      const result = machine.transition(state, 'reviewing');
      expect(result.success).toBe(true);
    });

    it('allows reviewing → completed', () => {
      const state = PCSFactory.createState({ phase: 'reviewing' });
      const result = machine.transition(state, 'completed');
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Valid backward transitions
  // -----------------------------------------------------------------------

  describe('valid backward transitions', () => {
    it('allows clarifying → initializing', () => {
      expect(machine.canTransition('clarifying', 'initializing')).toBe(true);
    });

    it('allows structured → clarifying', () => {
      expect(machine.canTransition('structured', 'clarifying')).toBe(true);
    });

    it('allows executing → structured', () => {
      expect(machine.canTransition('executing', 'structured')).toBe(true);
    });

    it('allows reviewing → executing', () => {
      expect(machine.canTransition('reviewing', 'executing')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Invalid transitions
  // -----------------------------------------------------------------------

  describe('invalid transitions', () => {
    it('rejects initializing → executing (skip phases)', () => {
      expect(machine.canTransition('initializing', 'executing')).toBe(false);

      const state = PCSFactory.createState({ phase: 'initializing' });
      const result = machine.transition(state, 'executing');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('rejects any transition from completed', () => {
      expect(machine.canTransition('completed', 'initializing')).toBe(false);
      expect(machine.canTransition('completed', 'clarifying')).toBe(false);
      expect(machine.canTransition('completed', 'structured')).toBe(false);
      expect(machine.canTransition('completed', 'executing')).toBe(false);
      expect(machine.canTransition('completed', 'reviewing')).toBe(false);

      const state = PCSFactory.createState({ phase: 'completed' });
      const result = machine.transition(state, 'executing');
      expect(result.success).toBe(false);
    });

    it('rejects clarifying → executing (skip structured)', () => {
      expect(machine.canTransition('clarifying', 'executing')).toBe(false);
    });

    it('rejects structured → reviewing (skip executing)', () => {
      expect(machine.canTransition('structured', 'reviewing')).toBe(false);
    });

    it('rejects initializing → reviewing', () => {
      expect(machine.canTransition('initializing', 'reviewing')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Guard: clarifying → structured (Intent + Audience must be settled)
  // -----------------------------------------------------------------------

  describe('guard: clarifying → structured', () => {
    it('blocks when intent fields are not settled', () => {
      const state = PCSFactory.createState({
        phase: 'clarifying',
        intent: {
          purpose: PCSFactory.makeField('test', { status: 'proposed' }),
        },
      });
      const result = machine.transition(state, 'structured');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unmet conditions');
    });

    it('blocks when audience fields are not settled', () => {
      const state = PCSFactory.createState({
        phase: 'clarifying',
        audience: {
          audience_type: PCSFactory.makeField('expert', { status: 'proposed' }),
        },
      });
      const result = machine.transition(state, 'structured');
      expect(result.success).toBe(false);
    });

    it('passes when all Intent and Audience fields are confirmed', () => {
      const state = PCSFactory.createState({ phase: 'clarifying' });
      const result = machine.transition(state, 'structured');
      expect(result.success).toBe(true);
    });

    it('passes when Intent and Audience fields are assumed (not just confirmed)', () => {
      const state = PCSFactory.createState({
        phase: 'clarifying',
        intent: {
          purpose: PCSFactory.makeField('test', { status: 'assumed' }),
          core_message: PCSFactory.makeField('test', { status: 'assumed' }),
          desired_impact: PCSFactory.makeField('test', { status: 'assumed' }),
          target_emotion: PCSFactory.makeField('test', { status: 'assumed' }),
        },
        audience: {
          audience_type: PCSFactory.makeField('test', { status: 'assumed' }),
          knowledge_level: PCSFactory.makeField('test', { status: 'assumed' }),
          relationship: PCSFactory.makeField('test', { status: 'assumed' }),
          pain_points: PCSFactory.makeField([], { status: 'assumed' }),
        },
      });
      const result = machine.transition(state, 'structured');
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Guard: structured → executing (must have sections)
  // -----------------------------------------------------------------------

  describe('guard: structured → executing', () => {
    it('blocks when structure has zero sections', () => {
      const state = PCSFactory.createState({
        phase: 'structured',
        structure: { sections: [] },
      });
      const result = machine.transition(state, 'executing');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unmet conditions');
    });

    it('blocks when sections are not confirmed', () => {
      const state = PCSFactory.createState({
        phase: 'structured',
        structure: {
          sections: [PCSFactory.makeSection({ pcs_status: 'proposed' })],
        },
      });
      const result = machine.transition(state, 'executing');
      expect(result.success).toBe(false);
    });

    it('passes when at least one confirmed section exists', () => {
      const state = PCSFactory.createState({ phase: 'structured' });
      const result = machine.transition(state, 'executing');
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Guard: executing → reviewing (hard nodes must be drafted)
  // -----------------------------------------------------------------------

  describe('guard: executing → reviewing', () => {
    it('blocks when a hard node is still empty', () => {
      const state = PCSFactory.createState({
        phase: 'executing',
        structure: {
          sections: [PCSFactory.makeSection({ hardness: 'hard', draft_state: 'empty' })],
        },
      });
      const result = machine.transition(state, 'reviewing');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unmet conditions');
    });

    it('passes when hard node is drafted', () => {
      const state = PCSFactory.createState({
        phase: 'executing',
        structure: {
          sections: [PCSFactory.makeSection({ hardness: 'hard', draft_state: 'drafted' })],
        },
      });
      const result = machine.transition(state, 'reviewing');
      expect(result.success).toBe(true);
    });

    it('passes when hard node is approved', () => {
      const state = PCSFactory.createState({
        phase: 'executing',
        structure: {
          sections: [PCSFactory.makeSection({ hardness: 'hard', draft_state: 'approved' })],
        },
      });
      const result = machine.transition(state, 'reviewing');
      expect(result.success).toBe(true);
    });

    it('passes when there are no hard nodes', () => {
      const state = PCSFactory.createState({
        phase: 'executing',
        structure: {
          sections: [PCSFactory.makeSection({ hardness: 'soft', draft_state: 'empty' })],
        },
      });
      const result = machine.transition(state, 'reviewing');
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // isWritable
  // -----------------------------------------------------------------------

  describe('isWritable', () => {
    it('returns true only for executing', () => {
      expect(machine.isWritable('executing')).toBe(true);
    });

    it('returns false for all non-executing phases', () => {
      expect(machine.isWritable('initializing')).toBe(false);
      expect(machine.isWritable('clarifying')).toBe(false);
      expect(machine.isWritable('structured')).toBe(false);
      expect(machine.isWritable('reviewing')).toBe(false);
      expect(machine.isWritable('completed')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isStructureMutable
  // -----------------------------------------------------------------------

  describe('isStructureMutable', () => {
    it('returns true for initializing, clarifying, structured', () => {
      expect(machine.isStructureMutable('initializing')).toBe(true);
      expect(machine.isStructureMutable('clarifying')).toBe(true);
      expect(machine.isStructureMutable('structured')).toBe(true);
    });

    it('returns false for executing, reviewing, completed', () => {
      expect(machine.isStructureMutable('executing')).toBe(false);
      expect(machine.isStructureMutable('reviewing')).toBe(false);
      expect(machine.isStructureMutable('completed')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getNextPhases
  // -----------------------------------------------------------------------

  describe('getNextPhases', () => {
    it('returns allowed phases from current', () => {
      expect(machine.getNextPhases('initializing')).toEqual(['clarifying']);
      expect(machine.getNextPhases('clarifying')).toEqual(['structured', 'initializing']);
      expect(machine.getNextPhases('structured')).toEqual(['clarifying', 'executing']);
      expect(machine.getNextPhases('executing')).toEqual(['structured', 'reviewing']);
      expect(machine.getNextPhases('reviewing')).toEqual(['executing', 'completed']);
      expect(machine.getNextPhases('completed')).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // TransitionResult shape
  // -----------------------------------------------------------------------

  describe('TransitionResult shape', () => {
    it('includes from, to, and success on success', () => {
      const state = PCSFactory.createState({ phase: 'initializing' });
      const result = machine.transition(state, 'clarifying');
      expect(result.success).toBe(true);
      expect(result.from).toBe('initializing');
      expect(result.to).toBe('clarifying');
      expect(result.error).toBeUndefined();
    });

    it('includes error message on failure', () => {
      const state = PCSFactory.createState({ phase: 'initializing' });
      const result = machine.transition(state, 'executing');
      expect(result.success).toBe(false);
      expect(result.from).toBe('initializing');
      expect(result.to).toBe('executing');
      expect(result.error).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // transition does NOT mutate state.phase
  // -----------------------------------------------------------------------

  describe('transition is pure', () => {
    it('does not mutate the state object', () => {
      const state = PCSFactory.createState({ phase: 'initializing' });
      const phaseBefore = state.phase;
      machine.transition(state, 'clarifying');
      expect(state.phase).toBe(phaseBefore);
    });
  });
});
