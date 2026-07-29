import { describe, it, expect } from 'vitest';
import {
  checkAdhesion,
  checkGiantNode,
  calculateSimilarity,
} from '@/algorithms/node-context-assembler';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { StructureSection } from '@/pcs/types';

function withSections(sections: StructureSection[]) {
  return PCSFactory.createWithSections(sections);
}

describe('node-context-assembler', () => {
  // -----------------------------------------------------------------------
  // 1. checkAdhesion: detects goal overlap (similarity > 0.7)
  // -----------------------------------------------------------------------

  it('detects high goal overlap with previous node', () => {
    const state = withSections([
      PCSFactory.createSection('s1', 'AI，教育，应用，前景', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', 'AI，教育，应用，前景', 'argument', { order: 1 }),
    ]);

    const result = checkAdhesion(state, 's2');

    expect(result.hasAdhesion).toBe(true);
    expect(result.similarityScore).toBe(1);
    expect(result.previousNodeId).toBe('s1');
    expect(result.suggestion).toBe('different_angle');
  });

  it('detects high goal overlap with next node', () => {
    const state = withSections([
      PCSFactory.createSection('s1', 'AI，教育，应用，前景', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', 'AI，教育，应用，前景', 'argument', { order: 1 }),
    ]);

    const result = checkAdhesion(state, 's1');

    expect(result.hasAdhesion).toBe(true);
    expect(result.nextNodeId).toBe('s2');
  });

  it('detects adhesion when similarity is just above 0.7', () => {
    // 4 shared words out of 5 = 0.8
    const state = withSections([
      PCSFactory.createSection('s1', 'AI，教育，应用，前景，分析', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', 'AI，教育，应用，前景，深度', 'argument', { order: 1 }),
    ]);

    const result = checkAdhesion(state, 's2');

    expect(result.similarityScore).toBeGreaterThan(0.7);
    expect(result.hasAdhesion).toBe(true);
  });

  it('does not flag low overlap as adhesion', () => {
    const state = withSections([
      PCSFactory.createSection('s1', '气候，变化，全球，影响', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', 'AI，教育，应用，前景', 'argument', { order: 1 }),
    ]);

    const result = checkAdhesion(state, 's2');

    expect(result.similarityScore).toBe(0);
    expect(result.hasAdhesion).toBe(false);
    expect(result.suggestion).toBe('keep_original');
  });

  // -----------------------------------------------------------------------
  // 2. checkAdhesion: bidirectional (checks both previous and next)
  // -----------------------------------------------------------------------

  it('returns max similarity from both directions', () => {
    const state = withSections([
      PCSFactory.createSection('s1', '完全，不同，话题AAA', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', '中间，节点，话题，相似', 'argument', { order: 1 }),
      PCSFactory.createSection('s3', '中间，节点，话题，相似，内容', 'argument', { order: 2 }),
    ]);

    const result = checkAdhesion(state, 's2');

    // s2 shares 4 words with s3 → 4/5 = 0.8 > 0.7; 0 with s1
    expect(result.nextNodeId).toBe('s3');
    expect(result.previousNodeId).toBeUndefined();
  });

  it('previousNodeId set only when prev similarity > 0.7', () => {
    const state = withSections([
      PCSFactory.createSection('s1', 'AI，教育，应用，前景，学习', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', 'AI，教育，应用，前景，分析', 'argument', { order: 1 }),
    ]);

    const result = checkAdhesion(state, 's2');

    expect(result.previousNodeId).toBe('s1');
  });

  it('nextNodeId set only when next similarity > 0.7', () => {
    const state = withSections([
      PCSFactory.createSection('s1', 'AI，教育，应用，前景，分析', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', 'AI，教育，应用，前景，学习', 'argument', { order: 1 }),
    ]);

    const result = checkAdhesion(state, 's1');

    expect(result.nextNodeId).toBe('s2');
  });

  // -----------------------------------------------------------------------
  // 3. checkGiantNode: returns true when estimated length > 800
  // -----------------------------------------------------------------------

  it('returns true for goals estimating > 800 chars', () => {
    const longGoal = '这是一个非常非常长的目标描述' + '非常长的内容'.repeat(10);
    const state = withSections([
      PCSFactory.createSection('s1', longGoal, 'argument', { order: 0 }),
    ]);

    const result = checkGiantNode(state, 's1');

    expect(result.isGiant).toBe(true);
    expect(result.estimatedLength).toBeGreaterThan(800);
    expect(result.suggestedParts).toBeGreaterThan(0);
  });

  it('returns false for short goals', () => {
    const state = withSections([
      PCSFactory.createSection('s1', '简短目标', 'introduce', { order: 0 }),
    ]);

    const result = checkGiantNode(state, 's1');

    expect(result.isGiant).toBe(false);
    expect(result.estimatedLength).toBeLessThanOrEqual(800);
    expect(result.suggestedParts).toBe(0);
  });

  it('returns isGiant=false for non-existent node', () => {
    const state = withSections([PCSFactory.createSection('s1', '目标', 'argument', { order: 0 })]);

    const result = checkGiantNode(state, 'nonexistent');

    expect(result.isGiant).toBe(false);
    expect(result.estimatedLength).toBe(0);
  });

  it('suggestedParts is capped at 4', () => {
    const veryLongGoal = '目标'.repeat(500);
    const state = withSections([
      PCSFactory.createSection('s1', veryLongGoal, 'argument', { order: 0 }),
    ]);

    const result = checkGiantNode(state, 's1');

    expect(result.suggestedParts).toBeLessThanOrEqual(4);
  });

  // -----------------------------------------------------------------------
  // 4. calculateSimilarity: returns 0 for completely different, 1 for identical
  // -----------------------------------------------------------------------

  it('returns 1 for identical texts', () => {
    const score = calculateSimilarity('完全相同，的内容', '完全相同，的内容');
    expect(score).toBe(1);
  });

  it('returns 0 for completely different texts', () => {
    const score = calculateSimilarity('AAAA，BBBB，CCCC', 'DDDD，EEEE，FFFF');
    expect(score).toBe(0);
  });

  it('returns 0 for single-character words (filtered out)', () => {
    const score = calculateSimilarity('A，B，C，D', 'A，B，C，D');
    expect(score).toBe(0);
  });

  it('handles partial overlap', () => {
    // "AI教育" vs "AI趋势" — single words, no delimiter → single token each → 0 overlap
    // Use comma to separate: "AI，教育，分析" vs "AI，教育，趋势" → 2/3 ≈ 0.67
    const score = calculateSimilarity('AI，教育，应用，分析', 'AI，教育，发展，趋势');
    expect(score).toBe(0.5); // 2 shared / 4 unique = 0.5
  });

  it('handles text with punctuation', () => {
    const score = calculateSimilarity('AI，教育，应用', 'AI，教育，趋势');
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 when both texts have only single-char words', () => {
    const score = calculateSimilarity('我，你，他', '我，你，他');
    expect(score).toBe(0);
  });

  it('returns 0 when both texts are empty', () => {
    const score = calculateSimilarity('', '');
    expect(score).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 5. Handles single node (no adjacent nodes)
  // -----------------------------------------------------------------------

  it('handles single node with no adjacent nodes', () => {
    const state = withSections([
      PCSFactory.createSection('solo', '唯一，章节', 'argument', { order: 0 }),
    ]);

    const result = checkAdhesion(state, 'solo');

    expect(result.hasAdhesion).toBe(false);
    expect(result.similarityScore).toBe(0);
    expect(result.previousNodeId).toBeUndefined();
    expect(result.nextNodeId).toBeUndefined();
    expect(result.suggestion).toBe('keep_original');
  });

  it('previousNodeGoal and nextNodeGoal are set correctly', () => {
    const state = withSections([
      PCSFactory.createSection('s1', '第一个，目标', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', '第二个，目标', 'argument', { order: 1 }),
    ]);

    const result = checkAdhesion(state, 's2');

    expect(result.previousNodeGoal).toBe('第一个，目标');
    expect(result.nextNodeGoal).toBeUndefined();
  });
});
