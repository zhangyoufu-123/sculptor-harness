import type { PCSState, ReviewIssue, ReviewSeverity } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConstraintCheckResult {
  passed: boolean;
  issues: ReviewIssue[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a short unique identifier.
 *
 * Format: `cc-{base36 timestamp}-{4 random chars}`
 */
function generateId(): string {
  return `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Estimate the word count of a string using a simple whitespace boundary
 * split. For Chinese text this is a rough character-count estimate; for
 * mixed CJK / Latin text the count is approximate by design (V1).
 */
function estimateWordCount(text: string): number {
  // Split on whitespace boundaries, filter empty segments.
  const segments = text.split(/\s+/).filter(Boolean);
  return segments.length;
}

/**
 * Build a `ReviewIssue` with standardised fields.
 */
function makeIssue(
  description: string,
  nodeId: string,
  severity: ReviewSeverity = 'blocking',
): ReviewIssue {
  return {
    id: generateId(),
    dimension: 'expression_consistency',
    severity,
    description,
    location: nodeId,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check content against PCS constraints (tone, avoid list, length, format).
 *
 * Used by Scribe Agent in Phase 4 before/after generation.
 *
 * Currently checks:
 *   - **Avoid list**: scans content for every forbidden term in
 *     `state.expression.avoid.value`. Each hit produces a `blocking` issue.
 *   - **Length constraint**: approximate word-count check against
 *     `state.constraint.length_max.value` and `length_min.value`.
 *     Produces `warning` issues when bounds are exceeded.
 *
 * @param content - The generated (or to-be-reviewed) text content.
 * @param state   - The full PCS state containing expression + constraint layers.
 * @param nodeId  - The structure section ID this content belongs to.
 * @returns A result indicating whether all checks passed, with any issues
 *          enumerated.
 */
function checkConstraints(content: string, state: PCSState, nodeId: string): ConstraintCheckResult {
  const issues: ReviewIssue[] = [];

  // ── 1. Avoid list ──
  const avoidList: string[] = state.expression.avoid.value;
  for (const term of avoidList) {
    if (term.length > 0 && content.includes(term)) {
      issues.push(makeIssue(`内容包含禁止项: "${term}"`, nodeId, 'blocking'));
    }
  }

  // ── 2. Length constraint ──
  const wordCount = estimateWordCount(content);
  const maxWords = state.constraint.length_max.value;
  const minWords = state.constraint.length_min.value;

  if (maxWords > 0 && wordCount > maxWords) {
    issues.push(makeIssue(`字数 (${wordCount}) 超过上限 (${maxWords})`, nodeId, 'warning'));
  }

  if (minWords > 0 && wordCount < minWords) {
    issues.push(makeIssue(`字数 (${wordCount}) 不足下限 (${minWords})`, nodeId, 'warning'));
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

export { checkConstraints };
export type { ConstraintCheckResult };
