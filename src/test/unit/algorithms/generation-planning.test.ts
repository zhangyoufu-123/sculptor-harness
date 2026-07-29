import { describe, it, expect } from 'vitest';
import { assembleNodeContext, generatePlan } from '@/algorithms/generation-planning';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { RequiredTopic } from '@/pcs/types';

function makeTopic(topic: string, sectionId: string, covered = false): RequiredTopic {
  return { topic, section_id: sectionId, covered };
}

describe('generation-planning', () => {
  // -----------------------------------------------------------------------
  // 1. assembleNodeContext: includes previous/next node info
  // -----------------------------------------------------------------------

  it('includes previous node goal when node is not first', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '引入话题', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', '核心论证', 'argument', { order: 1 }),
      PCSFactory.createSection('s3', '总结收尾', 'conclude', { order: 2 }),
    ]);

    const ctx = assembleNodeContext(state, 's2');

    expect(ctx.previousNodeGoal).toBe('引入话题');
    expect(ctx.nextNodeGoal).toBe('总结收尾');
  });

  it('previousNodeGoal is undefined for the first node', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '引入话题', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', '核心论证', 'argument', { order: 1 }),
    ]);

    const ctx = assembleNodeContext(state, 's1');

    expect(ctx.previousNodeGoal).toBeUndefined();
    expect(ctx.nextNodeGoal).toBe('核心论证');
  });

  it('nextNodeGoal is undefined for the last node', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '引入话题', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', '总结收尾', 'conclude', { order: 1 }),
    ]);

    const ctx = assembleNodeContext(state, 's2');

    expect(ctx.previousNodeGoal).toBe('引入话题');
    expect(ctx.nextNodeGoal).toBeUndefined();
  });

  it('includes previous node last sentence when content exists', () => {
    const sections = [
      PCSFactory.createSection('s1', 'A', 'introduce', {
        order: 0,
        content_draft: '这是第一段。这里是第二句。这是最后一句。',
      }),
      PCSFactory.createSection('s2', 'B', 'argument', { order: 1 }),
    ];
    const state = PCSFactory.createWithSections(sections);

    const ctx = assembleNodeContext(state, 's2');

    expect(ctx.previousNodeLastSentence).toBe('这是最后一句');
  });

  it('previousNodeLastSentence is undefined when previous has no content', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', 'A', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', 'B', 'argument', { order: 1 }),
    ]);

    const ctx = assembleNodeContext(state, 's2');

    expect(ctx.previousNodeLastSentence).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 2. assembleNodeContext: includes required topics, tone, avoid list
  // -----------------------------------------------------------------------

  it('includes required topics for the node', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试章节', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [
      makeTopic('碳排放', 's1'),
      makeTopic('碳中和', 's1'),
      makeTopic('其他章节话题', 's2'),
    ];

    const ctx = assembleNodeContext(state, 's1');

    expect(ctx.requiredTopics).toContain('碳排放');
    expect(ctx.requiredTopics).toContain('碳中和');
    expect(ctx.requiredTopics).not.toContain('其他章节话题');
    expect(ctx.requiredTopics).toHaveLength(2);
  });

  it('excludes already-covered topics from requiredTopics', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试章节', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [
      makeTopic('碳排放', 's1', false),
      makeTopic('碳中和', 's1', true), // already covered
    ];

    const ctx = assembleNodeContext(state, 's1');

    expect(ctx.requiredTopics).toContain('碳排放');
    expect(ctx.requiredTopics).not.toContain('碳中和');
  });

  it('includes tone description', () => {
    const state = PCSFactory.createConfirmed();
    state.expression.tone.value = '分析型';
    state.structure.sections = [PCSFactory.createSection('s1', '测试', 'argument', { order: 0 })];

    const ctx = assembleNodeContext(state, 's1');

    expect(ctx.toneDescription).toBe('分析型');
  });

  it('includes avoid list', () => {
    const state = PCSFactory.createConfirmed();
    state.expression.avoid.value = ['AI生成', '陈词滥调'];
    state.structure.sections = [PCSFactory.createSection('s1', '测试', 'argument', { order: 0 })];

    const ctx = assembleNodeContext(state, 's1');

    expect(ctx.avoidList).toEqual(['AI生成', '陈词滥调']);
  });

  // -----------------------------------------------------------------------
  // 3. generatePlan: creates plan with correct node_id, estimates length
  // -----------------------------------------------------------------------

  it('creates a plan with correct node_id', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('node-abc', '测试目标', 'argument', { order: 0 }),
    ]);

    const plan = generatePlan(state, 'node-abc');

    expect(plan.node_id).toBe('node-abc');
    expect(plan.goal_summary).toBe('测试目标');
  });

  it('creates plan with confirmed = false', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);

    const plan = generatePlan(state, 's1');

    expect(plan.confirmed).toBe(false);
  });

  it('includes tone and avoid instructions in plan', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.expression.tone.value = '分析型';
    state.expression.avoid.value = ['AI生成', '陈词滥调'];

    const plan = generatePlan(state, 's1');

    expect(plan.tone_instruction).toContain('分析型');
    expect(plan.avoid_instruction).toContain('AI生成');
    expect(plan.avoid_instruction).toContain('陈词滥调');
  });

  it('includes transition_from and transition_to', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '开头章', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', '中间章', 'argument', { order: 1 }),
      PCSFactory.createSection('s3', '结尾章', 'conclude', { order: 2 }),
    ]);

    const plan = generatePlan(state, 's2');

    expect(plan.transition_from).toBe('开头章');
    expect(plan.transition_to).toBe('结尾章');
  });

  it('transition_from indicates first when no previous node', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '唯一章', 'introduce', { order: 0 }),
    ]);

    const plan = generatePlan(state, 's1');

    expect(plan.transition_from).toContain('文章开头');
    expect(plan.transition_to).toContain('文章结尾');
  });

  // -----------------------------------------------------------------------
  // 4. estimateNodeLength: different lengths for introduce/argument/conclude
  // -----------------------------------------------------------------------

  it('estimates shorter length for introduce nodes', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '这是一个引言章节的目标描述', 'introduce', { order: 0 }),
      PCSFactory.createSection('s2', '这是一个论证章节的目标描述', 'argument', { order: 1 }),
    ]);

    const introPlan = generatePlan(state, 's1');
    const argPlan = generatePlan(state, 's2');

    // introduce uses *12, argument uses *20 — should differ
    expect(argPlan.estimated_length).toBeGreaterThan(introPlan.estimated_length);
  });

  it('estimates moderate length for conclude nodes', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '总结', 'conclude', { order: 0 }),
    ]);

    const plan = generatePlan(state, 's1');

    // conclude uses *12, capped at 600
    expect(plan.estimated_length).toBeGreaterThan(0);
    expect(plan.estimated_length).toBeLessThanOrEqual(600);
  });

  // -----------------------------------------------------------------------
  // 5. Giant node detection: goal > 800 chars gets substructure
  // -----------------------------------------------------------------------

  it('generates substructure for nodes with estimated length > 800', () => {
    // A long goal that yields estimated_length > 800 for an argument node (*20 multiplier)
    const longGoal = '这是一个非常详细的目标描述' + 'x'.repeat(50);
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', longGoal, 'argument', { order: 0 }),
    ]);

    const plan = generatePlan(state, 's1');

    expect(plan.suggested_substructure.length).toBeGreaterThan(0);
    // Each part is labeled
    expect(plan.suggested_substructure[0]).toContain('部分');
  });

  it('produces no substructure for small nodes', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '简短目标', 'introduce', { order: 0 }),
    ]);

    const plan = generatePlan(state, 's1');

    expect(plan.suggested_substructure).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 6. Handles first and last nodes (no previous/next)
  // -----------------------------------------------------------------------

  it('handles single node (both first and last)', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('solo', '唯一章节', 'argument', { order: 0 }),
    ]);

    const ctx = assembleNodeContext(state, 'solo');

    expect(ctx.previousNodeGoal).toBeUndefined();
    expect(ctx.nextNodeGoal).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 7. Handles nodes with no required topics
  // -----------------------------------------------------------------------

  it('returns empty requiredTopics when no topics exist', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [];

    const ctx = assembleNodeContext(state, 's1');

    expect(ctx.requiredTopics).toEqual([]);
  });

  it('includes styleReference and audienceContext', () => {
    const state = PCSFactory.createConfirmed();
    state.structure.sections = [PCSFactory.createSection('s1', '测试', 'argument', { order: 0 })];

    const ctx = assembleNodeContext(state, 's1');

    expect(ctx.styleReference).toBe(state.expression.style_reference.value);
    expect(ctx.audienceContext).toBe(state.audience.audience_type.value);
  });
});
