import type { PCSState, StructureSection } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlignmentResult {
  overallScore: number; // 0-1
  coreMessageCovered: boolean;
  uncoveredAspects: string[]; // Parts of core_message not addressed by any section
  sectionScores: Array<{
    sectionId: string;
    score: number;
    relevance: string; // How this section relates to core_message
  }>;
  recommendations: string[]; // Suggestions to improve alignment
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract meaningful tokens from a string by splitting on common Chinese and
 * Western punctuation, then filtering out short/empty tokens.
 */
function tokenize(text: string): string[] {
  return text
    .split(/[，,。！？、；：\s.!?;:\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Calculate a simple Jaccard-like overlap score between two token sets.
 *
 * Returns 0 if either set is empty; otherwise returns the proportion of
 * `needle` tokens that appear in `haystack`.
 */
function overlapScore(needle: string[], haystack: string[]): number {
  if (needle.length === 0) return 1; // no aspects → trivially covered
  const haystackSet = new Set(haystack.map((t) => t.toLowerCase()));
  let matched = 0;
  for (const token of needle) {
    if (haystackSet.has(token.toLowerCase())) {
      matched++;
    }
  }
  return matched / needle.length;
}

/** Build a human-readable relevance description from the overlap. */
function describeRelevance(overlap: number, sectionTitle: string): string {
  if (overlap >= 0.8) return `"${sectionTitle}" 与核心信息高度相关`;
  if (overlap >= 0.5) return `"${sectionTitle}" 与核心信息部分相关`;
  if (overlap > 0) return `"${sectionTitle}" 与核心信息关联较弱`;
  return `"${sectionTitle}" 未明显关联核心信息`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Architect Agent internal check: Does the Structure cover the Intent?
 *
 * Phase 2: After generating Structure, verify it covers the argument path.
 *
 * V1 implementation: rule-based token overlap between the `core_message` and
 * each section's `goal` + `title`. No LLM or semantic similarity is used.
 *
 * @param state - The full PCS state (must have `intent.core_message` and
 *                `structure.sections` populated).
 * @returns Alignment result with per-section scores and recommendations.
 */
function checkAlignment(state: PCSState): AlignmentResult {
  const coreMessage = state.intent.core_message.value;
  const sections: StructureSection[] = state.structure.sections;

  // ── Edge case: no core message or no sections ──
  if (!coreMessage || coreMessage.trim().length === 0) {
    return {
      overallScore: 0,
      coreMessageCovered: false,
      uncoveredAspects: [],
      sectionScores: [],
      recommendations: ['尚未设置核心信息，无法进行对齐检查。'],
    };
  }

  if (sections.length === 0) {
    return {
      overallScore: 0,
      coreMessageCovered: false,
      uncoveredAspects: tokenize(coreMessage),
      sectionScores: [],
      recommendations: ['尚未生成结构章节，请先生成大纲后再检查对齐度。'],
    };
  }

  // ── Tokenize core_message ──
  const coreTokens = tokenize(coreMessage);

  // ── Check each section ──
  const sectionScores: AlignmentResult['sectionScores'] = [];
  const aggregatedGoalTexts: string[] = [];

  for (const section of sections) {
    const sectionText = `${section.title} ${section.goal}`;
    const sectionTokens = tokenize(sectionText);
    aggregatedGoalTexts.push(...sectionTokens);

    const score = overlapScore(coreTokens, sectionTokens);
    sectionScores.push({
      sectionId: section.id,
      score: Math.round(score * 100) / 100,
      relevance: describeRelevance(score, section.title),
    });
  }

  // ── Overall coverage ──
  const overallScore = overlapScore(coreTokens, aggregatedGoalTexts);
  const covered = overallScore >= 0.5;

  // ── Uncovered aspects ──
  const aggregatedSet = new Set(aggregatedGoalTexts.map((t) => t.toLowerCase()));
  const uncoveredAspects = coreTokens.filter((token) => !aggregatedSet.has(token.toLowerCase()));

  // ── Recommendations ──
  const recommendations: string[] = [];
  if (!covered) {
    recommendations.push(
      `核心信息覆盖率仅为 ${Math.round(overallScore * 100)}%，建议增加或调整章节目标以更好地覆盖核心信息。`,
    );
  }
  if (uncoveredAspects.length > 0) {
    recommendations.push(
      `以下核心信息关键词未被任何章节涵盖：${uncoveredAspects.join('、')}。建议增加相关章节或在现有章节目标中补充。`,
    );
  }
  const weakSections = sectionScores.filter((s) => s.score < 0.3);
  if (weakSections.length > 0) {
    const titles = weakSections.map((s) => s.sectionId).join('、');
    recommendations.push(`章节 ${titles} 与核心信息关联较弱，请确认其必要性或调整目标。`);
  }

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    coreMessageCovered: covered,
    uncoveredAspects,
    sectionScores,
    recommendations,
  };
}

export { checkAlignment };
export type { AlignmentResult };
