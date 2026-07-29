import { describe, it, expect } from 'vitest';
import {
  analyzeStyleChange,
  classifyChangeLevel,
  canAutoApply,
} from '@/algorithms/style-evolution';
import type { StyleChange } from '@/algorithms/style-evolution';

describe('style-evolution', () => {
  // -----------------------------------------------------------------------
  // 1. Classifies L1 low-risk changes (auto-apply)
  // -----------------------------------------------------------------------

  it('classifies avoid list additions with high consistency as L1 low-risk', () => {
    const result = analyzeStyleChange('avoid', ['避免1'], ['避免1', '避免2'], {
      occurrenceCount: 5,
      consistencyScore: 0.9,
    });

    expect(result.level).toBe('L1_low_risk');
    expect(result.autoApply).toBe(true);
  });

  it('auto-applies L1 low-risk changes implicitly', () => {
    const result = analyzeStyleChange('avoid', ['旧值'], ['旧值', '新避讳'], {
      occurrenceCount: 3,
      consistencyScore: 0.85,
    });

    expect(result.autoApply).toBe(true);
    expect(result.suggestedValue).toEqual(['旧值', '新避讳']);
  });

  // -----------------------------------------------------------------------
  // 2. Classifies L1 high-risk changes (needs proposal)
  // -----------------------------------------------------------------------

  it('classifies tone changes as L1 high-risk', () => {
    const result = analyzeStyleChange('tone', '分析型', '叙事型', {
      occurrenceCount: 3,
      consistencyScore: 0.6,
    });

    expect(result.level).toBe('L1_high_risk');
    expect(result.autoApply).toBe(false);
  });

  it('classifies avoid with low consistency as L1 high-risk', () => {
    const result = analyzeStyleChange('avoid', ['A'], ['A', 'B'], {
      occurrenceCount: 2,
      consistencyScore: 0.5,
    });

    expect(result.level).toBe('L1_high_risk');
    expect(result.autoApply).toBe(false);
  });

  it('uses fallback classification for unknown fields', () => {
    const result = analyzeStyleChange('unknown_field', '旧', '新', {
      occurrenceCount: 1,
      consistencyScore: 0.5,
    });

    expect(result.level).toBe('L1_high_risk');
    expect(result.autoApply).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. Classifies L2/L3 changes (forbidden in V1)
  // -----------------------------------------------------------------------

  it('classifies voice changes as L2', () => {
    const result = analyzeStyleChange('voice', '专家', '幽默', {
      occurrenceCount: 2,
      consistencyScore: 0.8,
    });

    expect(result.level).toBe('L2');
    expect(result.autoApply).toBe(false);
  });

  it('classifies style_reference changes as L3', () => {
    const result = analyzeStyleChange('style_reference', '经济学人', '纽约时报', {
      occurrenceCount: 1,
      consistencyScore: 0.5,
    });

    expect(result.level).toBe('L3');
    expect(result.autoApply).toBe(false);
  });

  it('classifies thinking_reference changes as L3', () => {
    const result = analyzeStyleChange('thinking_reference', '数据驱动', '直觉驱动', {
      occurrenceCount: 1,
      consistencyScore: 0.5,
    });

    expect(result.level).toBe('L3');
    expect(result.autoApply).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 4. canAutoApply only returns true for L1 low-risk
  // -----------------------------------------------------------------------

  it('canAutoApply returns true for L1_low_risk', () => {
    const change: StyleChange = {
      field: 'avoid',
      currentValue: ['A'],
      suggestedValue: ['A', 'B'],
      level: 'L1_low_risk',
      autoApply: true,
      reason: 'test',
    };

    expect(canAutoApply(change)).toBe(true);
  });

  it.each(['L1_high_risk' as const, 'L2' as const, 'L3' as const])(
    'canAutoApply returns false for %s',
    (level) => {
      const change: StyleChange = {
        field: 'test',
        currentValue: 'a',
        suggestedValue: 'b',
        level,
        autoApply: false,
        reason: 'test',
      };

      expect(canAutoApply(change)).toBe(false);
    },
  );

  // -----------------------------------------------------------------------
  // 5. Tone changes always L1 high-risk
  // -----------------------------------------------------------------------

  it('tone change is always L1_high_risk regardless of context', () => {
    const result = analyzeStyleChange('tone', '分析型', '幽默', {
      occurrenceCount: 100,
      consistencyScore: 1.0,
    });

    expect(result.level).toBe('L1_high_risk');
    expect(result.autoApply).toBe(false);
  });

  it('tone change never auto-applies', () => {
    const result = analyzeStyleChange('tone', 'A', 'B', {
      occurrenceCount: 10,
      consistencyScore: 0.99,
    });

    expect(result.autoApply).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 6. Voice changes are L2
  // -----------------------------------------------------------------------

  it('voice change is always L2 regardless of context', () => {
    const result = analyzeStyleChange('voice', '专家', '朋友', {
      occurrenceCount: 100,
      consistencyScore: 1.0,
    });

    expect(result.level).toBe('L2');
  });

  // -----------------------------------------------------------------------
  // 7. classifyChangeLevel standalone tests
  // -----------------------------------------------------------------------

  it('classifyChangeLevel: tone → L1_high_risk', () => {
    expect(classifyChangeLevel('tone', { occurrenceCount: 5, consistencyScore: 0.9 })).toBe(
      'L1_high_risk',
    );
  });

  it('classifyChangeLevel: voice → L2', () => {
    expect(classifyChangeLevel('voice', { occurrenceCount: 1, consistencyScore: 0.5 })).toBe('L2');
  });

  it('classifyChangeLevel: style_reference → L3', () => {
    expect(
      classifyChangeLevel('style_reference', { occurrenceCount: 1, consistencyScore: 0.5 }),
    ).toBe('L3');
  });

  it('classifyChangeLevel: thinking_reference → L3', () => {
    expect(
      classifyChangeLevel('thinking_reference', { occurrenceCount: 1, consistencyScore: 0.5 }),
    ).toBe('L3');
  });

  it('classifyChangeLevel: avoid with high consistency → L1_low_risk', () => {
    expect(classifyChangeLevel('avoid', { occurrenceCount: 10, consistencyScore: 0.85 })).toBe(
      'L1_low_risk',
    );
  });

  it('classifyChangeLevel: avoid with consistency = 0.7 → true (exceeds threshold)', () => {
    // The condition is > 0.7, NOT >= 0.7
    expect(classifyChangeLevel('avoid', { occurrenceCount: 1, consistencyScore: 0.7 })).toBe(
      'L1_high_risk',
    ); // NOT greater than 0.7
  });

  it('classifyChangeLevel: avoid with consistency > 0.7 → L1_low_risk', () => {
    expect(classifyChangeLevel('avoid', { occurrenceCount: 1, consistencyScore: 0.71 })).toBe(
      'L1_low_risk',
    );
  });

  // -----------------------------------------------------------------------
  // 8. StyleChange reason includes occurrence count
  // -----------------------------------------------------------------------

  it('reason includes occurrence count', () => {
    const result = analyzeStyleChange('avoid', ['A'], ['A', 'B'], {
      occurrenceCount: 42,
      consistencyScore: 0.9,
    });

    expect(result.reason).toContain('42');
  });

  it('analyzeStyleChange returns correct field and values', () => {
    const result = analyzeStyleChange('tone', '分析型', '叙事型', {
      occurrenceCount: 3,
      consistencyScore: 0.6,
    });

    expect(result.field).toBe('tone');
    expect(result.currentValue).toBe('分析型');
    expect(result.suggestedValue).toBe('叙事型');
  });
});
