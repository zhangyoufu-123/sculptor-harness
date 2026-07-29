import { describe, it, expect } from 'vitest';
import { analyzeRevision } from '@/algorithms/revision-impact-analyzer';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { PCSState } from '@/pcs/types';

function stateWithNode(nodeId: string, content: string): PCSState {
  const state = PCSFactory.createWithSections([
    PCSFactory.createSection(nodeId, '节点目标', 'argument', {
      order: 0,
      content_draft: content,
      draft_state: 'drafted',
    }),
  ]);
  return state;
}

describe('revision-impact-analyzer', () => {
  // -----------------------------------------------------------------------
  // 1. Small edits (< 10% diff) → expression type
  // -----------------------------------------------------------------------

  it('classifies small edits as expression type', () => {
    const original = '这是一段很长的内容用来测试修改比例'.repeat(5);
    const revised = original + '小改动';

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).toBe('expression');
    expect(result.requiresProposal).toBe(false);
    expect(result.affectedNodes).toEqual([]);
  });

  it('suggests no actions for expression-level edits', () => {
    const original = '长文本内容'.repeat(10);
    const revised = original + '小修改';

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.suggestedActions).toEqual([]);
    expect(result.description).toContain('局部');
  });

  // -----------------------------------------------------------------------
  // 2. Major edits (> 50% diff) → structure type
  // -----------------------------------------------------------------------

  it('classifies major edits (>50% diff) as structure type', () => {
    // NOTE: calculateDiffRatio is length-based (V1).
    // original=100 chars, revised=200 chars → diff = 100/100 = 1.0 → structure
    const original = 'A'.repeat(100);
    const revised = 'B'.repeat(200);

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).toBe('structure');
  });

  it('major edits affect the edited node', () => {
    const original = 'A'.repeat(100);
    const revised = 'B'.repeat(200);

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.affectedNodes).toContain('s1');
  });

  it('major edits suggest checking adjacent nodes', () => {
    const original = 'A'.repeat(100);
    const revised = 'B'.repeat(200);

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.suggestedActions).toContain('检查与相邻节点的衔接');
    expect(result.suggestedActions).toContain('考虑更新节点goal');
  });

  // -----------------------------------------------------------------------
  // 3. Intent conflict detection (V1 placeholder)
  // -----------------------------------------------------------------------

  it('detectIntentConflict returns false in V1 (placeholder)', () => {
    const state = PCSFactory.createConfirmed();
    const original = '原始内容';
    const revised = '与意图冲突的内容';

    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).not.toBe('intent');
  });

  // -----------------------------------------------------------------------
  // 4. Handles empty original content
  // -----------------------------------------------------------------------

  it('handles empty original content (treats as structure)', () => {
    const original = '';
    const revised = '这是全新的内容';

    const state = stateWithNode('s1', '');
    const result = analyzeRevision('s1', original, revised, state);

    // diff ratio = 1 → structure
    expect(result.type).toBe('structure');
  });

  it('handles both empty (0% diff)', () => {
    const original = '';
    const revised = '';

    const state = stateWithNode('s1', '');
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).toBe('expression');
  });

  // -----------------------------------------------------------------------
  // 5. Handles same content (no diff)
  // -----------------------------------------------------------------------

  it('classifies identical content as expression type', () => {
    const content = '完全相同的内容';

    const state = stateWithNode('s1', content);
    const result = analyzeRevision('s1', content, content, state);

    expect(result.type).toBe('expression');
    expect(result.affectedNodes).toEqual([]);
    expect(result.requiresProposal).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 6. Each type has correct suggested actions
  // -----------------------------------------------------------------------

  it('structure type has adjacency and goal suggestions', () => {
    const original = 'A'.repeat(100);
    const revised = 'B'.repeat(200);

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).toBe('structure');
    expect(result.suggestedActions.length).toBeGreaterThan(0);
  });

  it('expression type has empty suggested actions', () => {
    const original = '一些内容';
    const revised = original + '微调';

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).toBe('expression');
    expect(result.suggestedActions).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 7. Non-existent node handling
  // -----------------------------------------------------------------------

  it('handles non-existent node gracefully', () => {
    const state = stateWithNode('s1', '内容');

    const result = analyzeRevision('nonexistent', '原始', '修改', state);

    expect(result.type).toBe('expression');
    expect(result.affectedNodes).toEqual([]);
    expect(result.description).toBe('节点未找到');
  });

  // -----------------------------------------------------------------------
  // 8. diff ratio edge cases
  // -----------------------------------------------------------------------

  it('diff ratio ~10% → still expression', () => {
    const original = 'A'.repeat(100);
    const revised = original.slice(0, 90) + 'B'.repeat(10);

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).toBe('expression');
  });

  it('diff ratio exactly 0.5 is not structure (<= 0.5)', () => {
    const original = 'A'.repeat(100);
    const revised = 'B'.repeat(50);

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).toBe('expression');
  });

  it('diff ratio > 0.5 → structure', () => {
    const original = 'A'.repeat(100);
    const revised = 'B'.repeat(151);

    const state = stateWithNode('s1', original);
    const result = analyzeRevision('s1', original, revised, state);

    expect(result.type).toBe('structure');
  });
});
