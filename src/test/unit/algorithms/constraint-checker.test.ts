import { describe, it, expect } from 'vitest';
import { checkConstraints } from '@/algorithms/constraint-checker';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { PCSState } from '@/pcs/types';

/** Create a state with no length constraints for avoid-list-only tests. */
function stateForAvoid(avoid: string[]): PCSState {
  const state = PCSFactory.createConfirmed();
  state.expression.avoid.value = avoid;
  state.constraint.length_min.value = 0;
  state.constraint.length_max.value = 0;
  return state;
}

describe('constraint-checker', () => {
  // -----------------------------------------------------------------------
  // 1. Detects avoid list violations in content
  // -----------------------------------------------------------------------

  it('detects avoid list violations', () => {
    const state = stateForAvoid(['AI生成', '陈词滥调', '过度承诺']);

    const result = checkConstraints('这段内容包含AI生成的痕迹', state, 'node-1');

    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.description.includes('AI生成'))).toBe(true);
  });

  it('detects multiple avoid list violations in the same content', () => {
    const state = stateForAvoid(['AI生成', '陈词滥调']);

    const result = checkConstraints('这段AI生成的内容充满了陈词滥调', state, 'node-1');

    expect(result.issues.length).toBe(2);
  });

  it('detects avoid list violations regardless of position in content', () => {
    const state = stateForAvoid(['禁止词']);

    const result = checkConstraints('开头的内容 中间有禁止词 结尾也有', state, 'node-1');

    expect(result.passed).toBe(false);
    expect(result.issues[0].description).toContain('禁止词');
  });

  // -----------------------------------------------------------------------
  // 2. Does not flag content without violations
  // -----------------------------------------------------------------------

  it('passes when no avoid list terms appear in content', () => {
    const state = stateForAvoid(['AI生成', '陈词滥调']);

    const result = checkConstraints('这是一段完全正常的人类撰写的内容', state, 'node-1');

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 3. Handles empty avoid list
  // -----------------------------------------------------------------------

  it('handles empty avoid list without errors', () => {
    const state = stateForAvoid([]);

    const result = checkConstraints('任何内容', state, 'node-1');

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 4. Handles empty content
  // -----------------------------------------------------------------------

  it('handles empty content', () => {
    const state = stateForAvoid(['AI生成']);

    const result = checkConstraints('', state, 'node-1');

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('does not flag empty string terms in avoid list', () => {
    const state = stateForAvoid(['', 'AI生成']);

    const result = checkConstraints('无相关内容的文本', state, 'node-1');

    expect(result.passed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 5. Each violation gets correct dimension and severity
  // -----------------------------------------------------------------------

  it('avoid list violations are blocking severity', () => {
    const state = stateForAvoid(['AI生成']);

    const result = checkConstraints('AI生成内容', state, 'node-1');

    for (const issue of result.issues) {
      expect(issue.severity).toBe('blocking');
    }
  });

  it('each violation has correct dimension', () => {
    const state = stateForAvoid(['禁止项']);

    const result = checkConstraints('包含禁止项的文字', state, 'node-1');

    for (const issue of result.issues) {
      expect(issue.dimension).toBe('expression_consistency');
    }
  });

  it('each violation has a unique id', () => {
    const state = stateForAvoid(['A', 'B', 'C']);

    const result = checkConstraints('包含A、B、C的内容', state, 'node-1');

    const ids = result.issues.map((i) => i.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('each violation records the node location', () => {
    const state = stateForAvoid(['禁止']);

    const result = checkConstraints('禁止的内容', state, 'section-42');

    for (const issue of result.issues) {
      expect(issue.location).toBe('section-42');
    }
  });

  // -----------------------------------------------------------------------
  // 6. Length constraint checks
  // -----------------------------------------------------------------------

  it('flags exceeding max word count', () => {
    const state = stateForAvoid([]);
    state.constraint.length_max.value = 5;

    const result = checkConstraints(
      'one two three four five six seven eight nine ten',
      state,
      'node-1',
    );

    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.description.includes('超过上限'))).toBe(true);
  });

  it('flags below min word count', () => {
    const state = stateForAvoid([]);
    state.constraint.length_min.value = 100;

    const result = checkConstraints('short text', state, 'node-1');

    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.description.includes('不足下限'))).toBe(true);
  });

  it('length violations are warning severity', () => {
    const state = stateForAvoid([]);
    state.constraint.length_max.value = 2;

    const result = checkConstraints('one two three', state, 'node-1');

    for (const issue of result.issues) {
      expect(issue.severity).toBe('warning');
    }
  });

  it('passes when within length bounds', () => {
    const state = stateForAvoid([]);
    state.constraint.length_min.value = 1;
    state.constraint.length_max.value = 9999;

    const result = checkConstraints('正常的长度内容', state, 'node-1');

    expect(result.passed).toBe(true);
  });
});
