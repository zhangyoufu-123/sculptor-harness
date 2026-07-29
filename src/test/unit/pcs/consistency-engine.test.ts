/**
 * Unit tests for ConsistencyEngine.
 *
 * Validates cross-layer coherence checks, node pre-generation validation,
 * and structure completeness assessment.
 */

import { describe, it, expect } from 'vitest';
import { ConsistencyEngine } from '@/pcs/consistency-engine';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { ReviewIssue } from '@/pcs/types';

describe('ConsistencyEngine', () => {
  // -----------------------------------------------------------------------
  // Constructor & state
  // -----------------------------------------------------------------------

  describe('construction', () => {
    it('accepts a PCSState and does not throw', () => {
      const state = PCSFactory.createState();
      expect(() => new ConsistencyEngine(state)).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // runCheck
  // -----------------------------------------------------------------------

  describe('runCheck', () => {
    it('returns valid result structure', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);
      const result = engine.runCheck();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('summary');
    });

    it('returns valid=true by default for a complete state', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);
      const result = engine.runCheck();

      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(typeof result.summary).toBe('string');
    });

    it('returns valid=true even with empty sections (current stub behavior)', () => {
      const state = PCSFactory.createState({
        structure: { sections: [] },
      });
      const engine = new ConsistencyEngine(state);
      const result = engine.runCheck();

      // Current implementation is a placeholder — always passes.
      expect(result.valid).toBe(true);
    });

    it('returns no issues initially', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);
      const result = engine.runCheck();

      expect(result.issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // checkNodeBeforeGeneration
  // -----------------------------------------------------------------------

  describe('checkNodeBeforeGeneration', () => {
    it('returns empty array for a valid node (current stub)', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);
      const issues = engine.checkNodeBeforeGeneration('section-1');

      expect(Array.isArray(issues)).toBe(true);
      expect(issues).toHaveLength(0);
    });

    it('returns empty regardless of node ID', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);

      expect(engine.checkNodeBeforeGeneration('non-existent')).toEqual([]);
      expect(engine.checkNodeBeforeGeneration('')).toEqual([]);
      expect(engine.checkNodeBeforeGeneration('any-string')).toEqual([]);
    });

    it('returns empty for node in any state config', () => {
      const emptyState = PCSFactory.createState({
        structure: { sections: [] },
      });
      const engine = new ConsistencyEngine(emptyState);

      const issues = engine.checkNodeBeforeGeneration('section-1');
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // checkNodeConflict
  // -----------------------------------------------------------------------

  describe('checkNodeConflict', () => {
    it('returns empty array for fresh content (current stub)', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);
      const issues = engine.checkNodeConflict('section-1', 'Some draft content.');

      expect(Array.isArray(issues)).toBe(true);
      expect(issues).toHaveLength(0);
    });

    it('returns empty for empty content string', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);
      const issues = engine.checkNodeConflict('section-1', '');

      expect(issues).toHaveLength(0);
    });

    it('returns empty for non-existent nodes', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);
      const issues = engine.checkNodeConflict('non-existent', 'content');

      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty structure (zero sections)', () => {
      const state = PCSFactory.createState({ structure: { sections: [] } });
      const engine = new ConsistencyEngine(state);

      const result = engine.runCheck();
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);

      const preGenIssues = engine.checkNodeBeforeGeneration('section-1');
      expect(preGenIssues).toEqual([]);

      const conflictIssues = engine.checkNodeConflict('section-1', '');
      expect(conflictIssues).toEqual([]);
    });

    it('handles single hard node', () => {
      const state = PCSFactory.createState({
        structure: {
          sections: [PCSFactory.makeSection({ hardness: 'hard', draft_state: 'empty' })],
        },
      });
      const engine = new ConsistencyEngine(state);

      const result = engine.runCheck();
      expect(result.valid).toBe(true);
      expect(engine.checkNodeBeforeGeneration('section-1')).toEqual([]);
    });

    it('handles no hard nodes (all soft)', () => {
      const state = PCSFactory.createState({
        structure: {
          sections: [
            PCSFactory.makeSection({ hardness: 'soft' }),
            PCSFactory.makeSection({ hardness: 'soft' }),
          ],
        },
      });
      const engine = new ConsistencyEngine(state);

      const result = engine.runCheck();
      expect(result.valid).toBe(true);
      expect(engine.checkNodeBeforeGeneration('section-1')).toEqual([]);
      expect(engine.checkNodeBeforeGeneration('section-2')).toEqual([]);
    });

    it('handles multiple sections with mixed hardness', () => {
      const state = PCSFactory.createState({
        structure: {
          sections: [
            PCSFactory.makeSection({ hardness: 'hard', draft_state: 'drafted' }),
            PCSFactory.makeSection({ hardness: 'soft', draft_state: 'empty' }),
            PCSFactory.makeSection({ hardness: 'hard', draft_state: 'approved' }),
          ],
        },
      });
      const engine = new ConsistencyEngine(state);

      const result = engine.runCheck();
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('handles state with unconfirmed fields', () => {
      const state = PCSFactory.createState({
        intent: {
          purpose: PCSFactory.makeField('test', { status: 'assumed' }),
        },
      });
      const engine = new ConsistencyEngine(state);

      const result = engine.runCheck();
      expect(result.valid).toBe(true);
    });

    it('produces a non-empty summary string', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);
      const result = engine.runCheck();

      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // ReviewIssue shape contract
  // -----------------------------------------------------------------------

  describe('ReviewIssue contract', () => {
    it('checkNodeBeforeGeneration returns valid ReviewIssue array', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);

      const issues: ReviewIssue[] = engine.checkNodeBeforeGeneration('section-1');
      expect(issues).toBeInstanceOf(Array);
    });

    it('checkNodeConflict returns valid ReviewIssue array', () => {
      const state = PCSFactory.createState();
      const engine = new ConsistencyEngine(state);

      const issues: ReviewIssue[] = engine.checkNodeConflict('section-1', 'content');
      expect(issues).toBeInstanceOf(Array);
    });
  });
});
