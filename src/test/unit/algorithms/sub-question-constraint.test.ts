import { describe, it, expect } from 'vitest';
import { evaluateConstraints, detectLowWillingness } from '@/algorithms/sub-question-constraint';
import type { QuestionContext } from '@/algorithms/sub-question-constraint';

function makeContext(overrides?: Partial<QuestionContext>): QuestionContext {
  return {
    dimension: 'Intent',
    attemptCount: 0,
    userResponses: [],
    originalQuestion: '你想表达的核心信息是什么？',
    informationGain: 0.8,
    ...overrides,
  };
}

describe('sub-question-constraint', () => {
  // -----------------------------------------------------------------------
  // 1. Terminates when attemptCount >= 2
  // -----------------------------------------------------------------------

  it('terminates when attemptCount equals MAX_ATTEMPTS (2)', () => {
    const ctx = makeContext({ attemptCount: 2 });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(false);
    expect(result.terminationCondition).toBe('max_attempts');
    expect(result.reason).toContain('2');
  });

  it('terminates when attemptCount exceeds MAX_ATTEMPTS', () => {
    const ctx = makeContext({ attemptCount: 5 });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(false);
    expect(result.terminationCondition).toBe('max_attempts');
  });

  it('continues when attemptCount is below 2', () => {
    const ctx = makeContext({ attemptCount: 1 });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(true);
    expect(result.terminationCondition).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. Terminates when user shows low willingness
  // -----------------------------------------------------------------------

  it.each([['随便'], ['都可以'], ['你决定'], ['不重要'], ['无所谓'], ['不知道'], ['没想法']])(
    'terminates when response contains "%s"',
    (signal) => {
      const ctx = makeContext({ userResponses: [`我觉得${signal}吧`] });
      const result = evaluateConstraints(ctx);

      expect(result.shouldContinue).toBe(false);
      expect(result.terminationCondition).toBe('low_willingness');
      expect(result.suggestedAction).toBe('skip_dimension');
    },
  );

  it('detects low willingness even among multiple responses', () => {
    const ctx = makeContext({
      userResponses: ['我想写关于环保的文章', '随便你定吧'],
    });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(false);
    expect(result.terminationCondition).toBe('low_willingness');
  });

  // -----------------------------------------------------------------------
  // 3. Terminates when information gain < 0.3
  // -----------------------------------------------------------------------

  it('terminates when information gain is below the threshold', () => {
    const ctx = makeContext({ informationGain: 0.1 });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(false);
    expect(result.terminationCondition).toBe('low_gain');
    expect(result.reason).toContain('0.10');
  });

  it('terminates when information gain equals exactly 0.0', () => {
    const ctx = makeContext({ informationGain: 0 });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(false);
    expect(result.terminationCondition).toBe('low_gain');
  });

  it('continues when information gain equals 0.3 (threshold boundary)', () => {
    // < 0.3 triggers termination, so 0.3 should NOT terminate
    const ctx = makeContext({ informationGain: 0.3 });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(true);
    expect(result.terminationCondition).toBeNull();
  });

  it('continues when information gain is 0.3001', () => {
    const ctx = makeContext({ informationGain: 0.3001 });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 4. Continues when all conditions are fine
  // -----------------------------------------------------------------------

  it('continues when all conditions are fine', () => {
    const ctx = makeContext({
      attemptCount: 0,
      userResponses: ['我想写关于AI在教育中的应用'],
      informationGain: 0.7,
    });
    const result = evaluateConstraints(ctx);

    expect(result.shouldContinue).toBe(true);
    expect(result.terminationCondition).toBeNull();
    expect(result.suggestedAction).toBe('ask_next');
    expect(result.reason).toContain('所有条件均未触发');
  });

  // -----------------------------------------------------------------------
  // 5. detectLowWillingness correctly identifies all signal words
  // -----------------------------------------------------------------------

  it('detects "随便" as low willingness', () => {
    expect(detectLowWillingness('随便吧')).toBe(true);
  });

  it('detects "都可以" as low willingness', () => {
    expect(detectLowWillingness('我都可以')).toBe(true);
  });

  it('detects "你决定" as low willingness', () => {
    expect(detectLowWillingness('那就你决定吧')).toBe(true);
  });

  it('detects "不重要" as low willingness', () => {
    expect(detectLowWillingness('这个不重要')).toBe(true);
  });

  it('detects "无所谓" as low willingness', () => {
    expect(detectLowWillingness('无所谓了')).toBe(true);
  });

  it('detects "不知道" as low willingness', () => {
    expect(detectLowWillingness('我也不知道怎么写')).toBe(true);
  });

  it('detects "没想法" as low willingness', () => {
    expect(detectLowWillingness('没想法')).toBe(true);
  });

  it('returns false for engaged responses', () => {
    expect(detectLowWillingness('我想写一篇关于气候变化的文章')).toBe(false);
    expect(detectLowWillingness('我希望语气严肃一点')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(detectLowWillingness('')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 6. Returns correct terminationCondition in result
  // -----------------------------------------------------------------------

  it('returns max_attempts when attempt threshold is hit', () => {
    const ctx = makeContext({ attemptCount: 3 });
    const result = evaluateConstraints(ctx);
    expect(result.terminationCondition).toBe('max_attempts');
  });

  it('returns low_willingness when user is disengaged', () => {
    const ctx = makeContext({ userResponses: ['随便'] });
    const result = evaluateConstraints(ctx);
    expect(result.terminationCondition).toBe('low_willingness');
  });

  it('returns low_gain when information gain is insufficient', () => {
    const ctx = makeContext({ informationGain: 0.05 });
    const result = evaluateConstraints(ctx);
    expect(result.terminationCondition).toBe('low_gain');
  });

  it('returns null when no termination condition is hit', () => {
    const ctx = makeContext({ attemptCount: 0, informationGain: 0.9, userResponses: [] });
    const result = evaluateConstraints(ctx);
    expect(result.terminationCondition).toBeNull();
  });
});
