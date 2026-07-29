import { describe, it, expect } from 'vitest';
import { checkAlignment } from '@/algorithms/intent-blueprint-alignment';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import type { PCSState } from '@/pcs/types';

describe('intent-blueprint-alignment', () => {
  // -----------------------------------------------------------------------
  // 1. High score when sections cover core_message aspects
  // -----------------------------------------------------------------------

  it('returns high score when sections cover core_message aspects', () => {
    // Use spaces to create token boundaries: the tokenizer splits on commas
    // and spaces, so individual words become separate tokens.
    const state: PCSState = {
      ...PCSFactory.createConfirmed(),
      intent: {
        ...PCSFactory.createConfirmed().intent,
        core_message: {
          value: 'AI，教育，提升，效率',
          status: 'confirmed',
          source: 'user',
          confidence: 1,
          last_updated: new Date().toISOString(),
          proposal: null,
        },
      },
      structure: {
        sections: [
          PCSFactory.createSection('s1', 'AI，教育，变革', 'introduce', { order: 0 }),
          PCSFactory.createSection('s2', '提升，效率，方法', 'argument', { order: 1 }),
        ],
      },
    };
    const result = checkAlignment(state);

    expect(result.overallScore).toBeGreaterThan(0);
  });

  it('returns high overall score when all sections match core_message', () => {
    const state: PCSState = {
      ...PCSFactory.createConfirmed(),
      intent: {
        ...PCSFactory.createConfirmed().intent,
        core_message: {
          value: 'AI，教育，效率',
          status: 'confirmed',
          source: 'user',
          confidence: 1,
          last_updated: new Date().toISOString(),
          proposal: null,
        },
      },
      structure: {
        sections: [
          PCSFactory.createSection('s1', 'AI，改变，教育，效率', 'introduce', { order: 0 }),
          PCSFactory.createSection('s2', 'AI，提升，效率，案例', 'argument', { order: 1 }),
        ],
      },
    };
    const result = checkAlignment(state);

    expect(result.overallScore).toBeGreaterThan(0.5);
    expect(result.coreMessageCovered).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 2. Low score when no sections match core_message
  // -----------------------------------------------------------------------

  it('returns low score when no sections match core_message', () => {
    const state: PCSState = {
      ...PCSFactory.createConfirmed(),
      intent: {
        ...PCSFactory.createConfirmed().intent,
        core_message: {
          value: 'XYZ，罕见，概念',
          status: 'confirmed',
          source: 'user',
          confidence: 1,
          last_updated: new Date().toISOString(),
          proposal: null,
        },
      },
      structure: {
        sections: [
          PCSFactory.createSection('s1', '环保，影响，可持续', 'introduce', { order: 0 }),
          PCSFactory.createSection('s2', '个人，行动，指南', 'argument', { order: 1 }),
        ],
      },
    };
    const result = checkAlignment(state);

    expect(result.overallScore).toBe(0);
    expect(result.coreMessageCovered).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. Identifies uncovered aspects of core_message
  // -----------------------------------------------------------------------

  it('identifies uncovered aspects of core_message', () => {
    const state: PCSState = {
      ...PCSFactory.createConfirmed(),
      intent: {
        ...PCSFactory.createConfirmed().intent,
        core_message: {
          value: 'AI，教育，效率',
          status: 'confirmed',
          source: 'user',
          confidence: 1,
          last_updated: new Date().toISOString(),
          proposal: null,
        },
      },
      structure: {
        sections: [PCSFactory.createSection('s1', 'AI，教育', 'introduce', { order: 0 })],
      },
    };
    const result = checkAlignment(state);

    expect(result.uncoveredAspects.length).toBeGreaterThan(0);
    // "效率" is not covered
    expect(result.uncoveredAspects).toContain('效率');
  });

  it('provides recommendations when aspects are uncovered', () => {
    const state: PCSState = {
      ...PCSFactory.createConfirmed(),
      intent: {
        ...PCSFactory.createConfirmed().intent,
        core_message: {
          value: 'XYZ，新概念，探讨',
          status: 'confirmed',
          source: 'user',
          confidence: 1,
          last_updated: new Date().toISOString(),
          proposal: null,
        },
      },
      structure: {
        sections: [PCSFactory.createSection('s1', '完全不同，话题', 'introduce', { order: 0 })],
      },
    };
    const result = checkAlignment(state);

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.some((r) => r.includes('覆盖率'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 4. Handles empty core_message
  // -----------------------------------------------------------------------

  it('handles empty core_message gracefully', () => {
    const state = PCSFactory.createConfirmed();
    state.intent.core_message.value = '';

    const result = checkAlignment(state);

    expect(result.overallScore).toBe(0);
    expect(result.coreMessageCovered).toBe(false);
    expect(result.uncoveredAspects).toHaveLength(0);
    expect(result.recommendations.some((r) => r.includes('尚未设置核心信息'))).toBe(true);
  });

  it('handles core_message with only whitespace', () => {
    const state = PCSFactory.createConfirmed();
    state.intent.core_message.value = '   \n  ';

    const result = checkAlignment(state);

    expect(result.overallScore).toBe(0);
    expect(result.coreMessageCovered).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 5. Handles no sections
  // -----------------------------------------------------------------------

  it('handles empty sections array', () => {
    const state = PCSFactory.createConfirmed();
    state.structure.sections = [];

    const result = checkAlignment(state);

    expect(result.overallScore).toBe(0);
    expect(result.coreMessageCovered).toBe(false);
    expect(result.sectionScores).toHaveLength(0);
    expect(result.uncoveredAspects.length).toBeGreaterThan(0);
    expect(result.recommendations.some((r) => r.includes('尚未生成结构章节'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 6. Each section gets individual score
  // -----------------------------------------------------------------------

  it('returns per-section scores', () => {
    const state = PCSFactory.createConfirmed();
    const result = checkAlignment(state);

    expect(result.sectionScores).toHaveLength(state.structure.sections.length);

    for (const sectionScore of result.sectionScores) {
      expect(sectionScore.sectionId).toBeDefined();
      expect(sectionScore.score).toBeGreaterThanOrEqual(0);
      expect(sectionScore.score).toBeLessThanOrEqual(1);
      expect(sectionScore.relevance).toBeDefined();
      expect(sectionScore.relevance.length).toBeGreaterThan(0);
    }
  });

  it('section score includes relevance description', () => {
    const state: PCSState = {
      ...PCSFactory.createConfirmed(),
      intent: {
        ...PCSFactory.createConfirmed().intent,
        core_message: {
          value: '好处，效益',
          status: 'confirmed',
          source: 'user',
          confidence: 1,
          last_updated: new Date().toISOString(),
          proposal: null,
        },
      },
      structure: {
        sections: [
          PCSFactory.createSection('s1', '环境，效益，好处', 'introduce', { order: 0 }),
          PCSFactory.createSection('s2', '无关，内容', 'argument', { order: 1 }),
        ],
      },
    };
    const result = checkAlignment(state);

    const goodSection = result.sectionScores.find((s) => s.sectionId === 's1')!;
    const badSection = result.sectionScores.find((s) => s.sectionId === 's2')!;

    expect(goodSection.score).toBeGreaterThan(badSection.score);
  });
});
