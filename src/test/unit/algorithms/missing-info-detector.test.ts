import { describe, it, expect } from 'vitest';
import { detectMissingInfo, markTopicCovered } from '@/algorithms/missing-info-detector';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { PCSState, RequiredTopic } from '@/pcs/types';

function makeTopic(topic: string, sectionId: string, covered = false): RequiredTopic {
  return { topic, section_id: sectionId, covered };
}

function cloneState(state: PCSState): PCSState {
  return JSON.parse(JSON.stringify(state)) as PCSState;
}

describe('missing-info-detector', () => {
  // -----------------------------------------------------------------------
  // 1. Detects required topics not yet covered in content
  // -----------------------------------------------------------------------

  it('detects required topics not covered in content', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试章节', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [
      makeTopic('碳排放数据', 's1'),
      makeTopic('碳中和方案', 's1'),
    ];

    const result = detectMissingInfo('这里讨论了一些环境问题', state, 's1');

    expect(result.newGaps.length).toBe(2);
    expect(result.newGaps.some((g) => g.topic === '碳排放数据')).toBe(true);
    expect(result.newGaps.some((g) => g.topic === '碳中和方案')).toBe(true);
  });

  it('newGaps have correct properties', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试章节', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [makeTopic('碳排放数据', 's1')];

    const result = detectMissingInfo('无关内容', state, 's1');

    expect(result.newGaps).toHaveLength(1);
    const gap = result.newGaps[0];
    expect(gap.topic).toBe('碳排放数据');
    expect(gap.reason).toBe('draft');
    expect(gap.priority).toBe('high');
    expect(gap.blocking).toBe(true);
    expect(gap.related_section).toBe('s1');
  });

  // -----------------------------------------------------------------------
  // 2. Marks topics as covered when found in content
  // -----------------------------------------------------------------------

  it('marks topics as covered when found in content', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试章节', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [
      makeTopic('碳排放数据', 's1'),
      makeTopic('碳中和方案', 's1'),
    ];

    const result = detectMissingInfo('本章节详细讨论了碳排放数据', state, 's1');

    expect(result.resolvedGaps).toContain('碳排放数据');
    expect(result.resolvedGaps).not.toContain('碳中和方案');
  });

  it('marks topic covered with case-insensitive matching', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [makeTopic('Carbon Emission', 's1')];

    const result = detectMissingInfo('We discuss carbon emission in detail', state, 's1');

    expect(result.resolvedGaps).toContain('Carbon Emission');
  });

  it('mutates topic.covered to true when covered', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [makeTopic('碳排放', 's1')];

    detectMissingInfo('这是一段关于碳排放的讨论', state, 's1');

    const topicEntry = state.knowledge.required_topics.find((t) => t.topic === '碳排放');
    expect(topicEntry?.covered).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 3. Resolved topics removed from missing list
  // -----------------------------------------------------------------------

  it('does not include resolved topics in newGaps', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [makeTopic('碳排放', 's1'), makeTopic('碳中和', 's1')];

    const result = detectMissingInfo('关于碳排放的分析，必须考虑碳中和方案', state, 's1');

    expect(result.resolvedGaps).toContain('碳排放');
    expect(result.resolvedGaps).toContain('碳中和');
    expect(result.newGaps).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 4. Handles empty required topics
  // -----------------------------------------------------------------------

  it('handles empty required topics gracefully', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [];

    const result = detectMissingInfo('任何内容', state, 's1');

    expect(result.newGaps).toHaveLength(0);
    expect(result.resolvedGaps).toHaveLength(0);
  });

  it('only checks topics for the specified section', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '章节一', 'argument', { order: 0 }),
      PCSFactory.createSection('s2', '章节二', 'argument', { order: 1 }),
    ]);
    state.knowledge.required_topics = [makeTopic('碳排放', 's1'), makeTopic('碳中和', 's2')];

    const result = detectMissingInfo('关于碳排放的数据', state, 's1');

    // Only s1's topic "碳排放" is checked
    expect(result.resolvedGaps).toContain('碳排放');
    // s2's topic should not appear
    expect(result.resolvedGaps).not.toContain('碳中和');
    expect(result.newGaps).toHaveLength(0);
  });

  it('skips already-covered topics', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [
      makeTopic('碳排放', 's1', true), // already covered
    ];

    const result = detectMissingInfo('无关内容', state, 's1');

    expect(result.resolvedGaps).not.toContain('碳排放');
    expect(result.newGaps).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 5. markTopicCovered updates the covered flag
  // -----------------------------------------------------------------------

  it('markTopicCovered sets covered to true', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [makeTopic('碳排放', 's1')];

    markTopicCovered(state, '碳排放', 's1');

    const topic = state.knowledge.required_topics.find((t) => t.topic === '碳排放');
    expect(topic?.covered).toBe(true);
  });

  it('markTopicCovered does nothing for non-existent topic', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [makeTopic('碳排放', 's1')];

    // Should not throw
    expect(() => {
      markTopicCovered(state, '不存在的主题', 's1');
    }).not.toThrow();
  });

  it('markTopicCovered does nothing for wrong section', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [makeTopic('碳排放', 's1')];

    markTopicCovered(state, '碳排放', 'wrong-section');

    const topic = state.knowledge.required_topics.find((t) => t.topic === '碳排放');
    expect(topic?.covered).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 6. Deduplication
  // -----------------------------------------------------------------------

  it('does not create duplicate newGaps for same topic', () => {
    const state = PCSFactory.createWithSections([
      PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
    ]);
    state.knowledge.required_topics = [
      makeTopic('碳排放', 's1'),
      makeTopic('碳排放', 's1'), // duplicate
    ];

    const result = detectMissingInfo('无关', state, 's1');

    // Should have at most 1 gap per unique topic
    const gapTopics = result.newGaps.map((g) => g.topic);
    expect(new Set(gapTopics).size).toBe(gapTopics.length);
  });

  // -----------------------------------------------------------------------
  // 7. stillMissing reflects current state
  // -----------------------------------------------------------------------

  it('returns stillMissing for the specified section', () => {
    const state = cloneState(
      PCSFactory.createWithSections([
        PCSFactory.createSection('s1', '测试', 'argument', { order: 0 }),
      ]),
    );
    state.knowledge.missing_information = [
      {
        topic: '碳排放数据',
        reason: 'draft',
        priority: 'high',
        blocking: true,
        related_section: 's1',
      },
      {
        topic: '其他话题',
        reason: 'draft',
        priority: 'low',
        blocking: false,
        related_section: 's2',
      },
    ];

    const result = detectMissingInfo('一些内容', state, 's1');

    expect(result.stillMissing).toHaveLength(1);
    expect(result.stillMissing[0].topic).toBe('碳排放数据');
  });
});
