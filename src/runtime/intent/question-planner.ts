/**
 * Question Planner — Active Learning question selection.
 *
 * Uses the Belief State's uncertainty model to choose the next question
 * that maximizes information gain (minimizes expected uncertainty).
 *
 * This is the "questioning strategy" layer — it translates raw
 * uncertainties into natural-language questions with guided options.
 */

import { getNextUncertainty, type BeliefState } from '@/runtime/intent/belief-state';

export interface PlannedQuestion {
  /** The question text to display to the user */
  text: string;
  /** Suggested answer options (may be empty) */
  options: string[];
  /** Expected information gain from answering (0-1) */
  expectedGain: number;
  /** Why this question was chosen (debug trace) */
  reason: string;
  /** What category/uncertainty this addresses */
  addresses: string;
}

/**
 * Plan the next best question based on the current belief state.
 * Returns null if no meaningful uncertainties remain.
 */
export function planNextQuestion(state: BeliefState): PlannedQuestion | null {
  const next = getNextUncertainty(state);
  if (!next) return null;

  // Generate relevant options based on uncertainty category
  const options = generateOptions(next.category, state);

  return {
    text: next.question,
    options,
    expectedGain: next.informationGain * next.impact,
    reason: `Addressing ${next.category} uncertainty`,
    addresses: next.category,
  };
}

/**
 * Generate context-sensitive answer options for each uncertainty category.
 */
function generateOptions(category: string, state: BeliefState): string[] {
  switch (category) {
    case 'artifact_type':
      return ['文章/博客', '学术论文', '创意故事', '演讲稿', '教程/指南'];

    case 'audience':
      if (state.artifactBeliefs.length > 0) {
        const artifactType = state.artifactBeliefs[0].type;
        if (/论文|学术/.test(artifactType)) {
          return ['学术同行', '导师/评审', '跨学科研究者', '大众科普读者'];
        }
        if (/教程|指南/.test(artifactType)) {
          return ['零基础新手', '有一定基础的学习者', '进阶开发者'];
        }
      }
      return ['专业人士', '普通读者', '学生/学习者', '决策者/管理层'];

    case 'tone':
      return ['正式严谨', '轻松活泼', '情感共鸣型', '中立客观'];

    case 'scope':
      return ['深度聚焦一个角度', '全面覆盖多个维度', '案例驱动', '理论为主'];

    case 'direction':
      if (state.artifactBeliefs.length > 0 && state.artifactBeliefs[0].signals.length > 0) {
        return state.artifactBeliefs[0].signals.slice(0, 4);
      }
      return [];

    default:
      return [];
  }
}
