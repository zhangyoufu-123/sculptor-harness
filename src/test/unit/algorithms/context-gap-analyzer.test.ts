import { describe, it, expect } from 'vitest';
import { analyzeGaps } from '@/algorithms/context-gap-analyzer';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { PCSState } from '@/pcs/types';

function findResultFor(results: ReturnType<typeof analyzeGaps>, dimension: string) {
  return results.find((r) => r.dimension === dimension);
}

describe('context-gap-analyzer', () => {
  // -----------------------------------------------------------------------
  // 1. Identifies assumed fields in Intent/Audience/Constraint/Expression
  // -----------------------------------------------------------------------

  it('identifies assumed fields in the Intent dimension', () => {
    const state = PCSFactory.createAssumed();
    const results = analyzeGaps(state);
    const intent = findResultFor(results, 'Intent')!;

    expect(intent).toBeDefined();
    expect(intent.assumedFields).toBeGreaterThan(0);
    // "purpose" and "core_message" are assumed (status = 'assumed')
    expect(intent.assumedFields).toBeGreaterThanOrEqual(2);
  });

  it('identifies assumed fields in the Audience dimension', () => {
    const state = PCSFactory.createAssumed();
    const results = analyzeGaps(state);
    const audience = findResultFor(results, 'Audience')!;

    expect(audience).toBeDefined();
    expect(audience.assumedFields).toBeGreaterThan(0);
  });

  it('identifies assumed fields in the Expression dimension', () => {
    const state = PCSFactory.createEmpty();
    const results = analyzeGaps(state);
    const expression = findResultFor(results, 'Expression')!;

    expect(expression).toBeDefined();
    expect(expression.assumedFields).toBeGreaterThan(0);
  });

  it('identifies assumed fields in the Constraint dimension', () => {
    const state = PCSFactory.createEmpty();
    const results = analyzeGaps(state);
    const constraint = findResultFor(results, 'Constraint')!;

    expect(constraint).toBeDefined();
    expect(constraint.assumedFields).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 2. Generates questions for assumed fields
  // -----------------------------------------------------------------------

  it('generates questions for assumed (non-empty) fields', () => {
    const state = PCSFactory.createAssumed();
    const results = analyzeGaps(state);
    const intent = findResultFor(results, 'Intent')!;

    // Assumed fields with values should generate confirmation-style questions
    expect(intent.suggestedQuestions.length).toBeGreaterThan(0);
    const purposeQuestion = intent.suggestedQuestions.find((q) => q.includes('写作目的'));
    expect(purposeQuestion).toBeDefined();
    expect(purposeQuestion).toContain('是否正确');
  });

  it('generates "please provide" questions for missing fields', () => {
    const state = PCSFactory.createEmpty();
    const results = analyzeGaps(state);
    const intent = findResultFor(results, 'Intent')!;

    const missingQuestions = intent.suggestedQuestions.filter((q) => q.startsWith('请提供'));
    expect(missingQuestions.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 3. Flags missing (empty) fields
  // -----------------------------------------------------------------------

  it('flags empty fields as missing', () => {
    const state = PCSFactory.createEmpty();
    const results = analyzeGaps(state);

    for (const result of results) {
      // Empty state should have many missing fields
      expect(result.missingFields.length).toBeGreaterThan(0);
    }
  });

  it('does not flag confirmed non-empty fields as missing', () => {
    const state = PCSFactory.createConfirmed();
    const results = analyzeGaps(state);

    for (const result of results) {
      expect(result.missingFields.length).toBe(0);
    }
  });

  it('does not flag confirmed+locked fields as missing', () => {
    const state = PCSFactory.createConfirmed();
    // Lock a field
    state.intent.purpose.status = 'locked';
    const results = analyzeGaps(state);
    const intent = findResultFor(results, 'Intent')!;

    expect(intent.missingFields).not.toContain('intent.purpose');
  });

  // -----------------------------------------------------------------------
  // 4. Sorts results by priority (Intent > Audience > Constraint > Expression)
  // -----------------------------------------------------------------------

  it('returns results sorted by dimension priority', () => {
    const state = PCSFactory.createEmpty();
    const results = analyzeGaps(state);

    const dimensions = results.map((r) => r.dimension);
    expect(dimensions).toEqual(['Intent', 'Audience', 'Constraint', 'Expression']);
  });

  it('respects sort order when only some dimensions are analyzed', () => {
    const state = PCSFactory.createEmpty();
    const results = analyzeGaps(state, 'Expression');

    // Only one dimension, but still at correct position
    expect(results).toHaveLength(1);
    expect(results[0].dimension).toBe('Expression');
  });

  // -----------------------------------------------------------------------
  // 5. Handles empty PCS state
  // -----------------------------------------------------------------------

  it('handles completely empty PCS state', () => {
    const state = PCSFactory.createEmpty();
    const results = analyzeGaps(state);

    // All 4 dimensions should be present
    expect(results).toHaveLength(4);

    // Every dimension should have zero confirmed fields
    for (const result of results) {
      expect(result.confirmedFields).toBe(0);
      expect(result.confidence).toBeLessThan(1);
    }
  });

  it('returns low confidence for all assumed+empty fields', () => {
    // All fields assumed and empty → confidence = (0 + 4 * 0.5) / 4 = 0.5
    const state: PCSState = {
      ...PCSFactory.createEmpty(),
      intent: {
        purpose: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0,
          last_updated: '',
          proposal: null,
        },
        core_message: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0,
          last_updated: '',
          proposal: null,
        },
        desired_impact: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0,
          last_updated: '',
          proposal: null,
        },
        target_emotion: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0,
          last_updated: '',
          proposal: null,
        },
      },
    };
    const results = analyzeGaps(state);
    const intent = findResultFor(results, 'Intent')!;

    // All fields assumed with empty values: confidence = (0 + 4*0.5)/4 = 0.5
    expect(intent.confidence).toBe(0.5);
  });

  // -----------------------------------------------------------------------
  // 6. Handles fully confirmed state (no gaps)
  // -----------------------------------------------------------------------

  it('returns no gaps for a fully confirmed state', () => {
    const state = PCSFactory.createConfirmed();
    const results = analyzeGaps(state);

    for (const result of results) {
      expect(result.missingFields).toHaveLength(0);
      // All fields confirmed → no suggested questions needed
      // (But we may still generate questions for confirmed fields)
      expect(result.assumedFields).toBe(0);
    }
  });

  it('returns high confidence for fully confirmed state', () => {
    const state = PCSFactory.createConfirmed();
    const results = analyzeGaps(state);

    for (const result of results) {
      expect(result.confidence).toBe(1);
      expect(result.confirmedFields).toBe(result.totalFields);
    }
  });

  // -----------------------------------------------------------------------
  // 7. focusDimension parameter
  // -----------------------------------------------------------------------

  it('only analyzes the specified dimension when focusDimension is set', () => {
    const state = PCSFactory.createEmpty();
    const results = analyzeGaps(state, 'Intent');

    expect(results).toHaveLength(1);
    expect(results[0].dimension).toBe('Intent');
  });
});
