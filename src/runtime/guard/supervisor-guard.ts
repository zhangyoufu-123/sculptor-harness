/**
 * Supervisor Guard — prevents template contamination and topic drift.
 *
 * Runs checks at every phase transition:
 * - Blueprint generation: does the outline match the creative intent?
 * - Node generation: is the goal aligned with the overall topic?
 * - Export: does the final output reflect the original intent?
 */

import type { BeliefState } from '@/runtime/intent/belief-state';

export interface GuardResult {
  passed: boolean;
  checks: GuardCheck[];
  summary: string;
}

export interface GuardCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: 'blocking' | 'warning';
}

/**
 * Check blueprint BEFORE allowing it to proceed.
 * Prevents the "山林散文 → AI教育大纲" bug.
 */
export function guardBlueprint(
  belief: BeliefState,
  sections: Array<{ title: string; goal: string }>,
): GuardResult {
  const checks: GuardCheck[] = [];

  // Check 1: Topic relevance
  const topicWords = belief.topicBeliefs.flatMap((t) => t.topic.split(/[\s，。]+/));
  const topicMatched = sections.some((s) =>
    topicWords.some((tw) => s.goal.includes(tw) || s.title.includes(tw)),
  );

  checks.push({
    name: '主题相关性',
    passed: topicMatched || belief.topicBeliefs.length === 0,
    detail: topicMatched
      ? `大纲与主题"${belief.topicBeliefs[0]?.topic}"匹配`
      : `⚠️ 大纲未包含任何主题关键词: ${topicWords.join(', ')}`,
    severity: topicMatched ? 'warning' : 'blocking',
  });

  // Check 2: No default contamination
  const defaultSignals = [
    'AI教育',
    '技术分析',
    '案例研究',
    '挑战与风险',
    'developers',
    'analytical',
  ];
  const hasDefaultContamination = sections.some((s) =>
    defaultSignals.some((ds) => s.title.includes(ds) || s.goal.includes(ds)),
  );

  checks.push({
    name: '默认模板污染',
    passed: !hasDefaultContamination,
    detail: hasDefaultContamination
      ? '❌ 检测到默认模板残留 — 蓝图未根据实际主题生成'
      : '✓ 无默认模板污染',
    severity: hasDefaultContamination ? 'blocking' : 'warning',
  });

  // Check 3: Artifact type consistency
  if (belief.artifactBeliefs.length > 0) {
    const topArtifact = belief.artifactBeliefs[0];
    const isProse = topArtifact.type === '散文' || topArtifact.type === 'prose';
    const hasProseStructure =
      sections.length <= 5 &&
      sections.some(
        (s) => s.goal.includes('体验') || s.goal.includes('感悟') || s.goal.includes('反思'),
      );

    checks.push({
      name: '体裁一致性',
      passed: !isProse || hasProseStructure,
      detail: isProse
        ? hasProseStructure
          ? '✓ 散文结构匹配'
          : '⚠️ 散文应有体验→反思→回归的结构'
        : '✓ 非散文体裁',
      severity: 'warning',
    });
  }

  const blockingCount = checks.filter((c) => c.severity === 'blocking' && !c.passed).length;
  const passed = blockingCount === 0;

  return {
    passed,
    checks,
    summary: passed ? '✅ 蓝图检查通过' : `❌ ${blockingCount} 项阻塞 — 蓝图不符合创作意图`,
  };
}

/**
 * Check a node's goal against the overall belief state.
 */
export function guardNodeGeneration(belief: BeliefState, nodeGoal: string): GuardResult {
  const checks: GuardCheck[] = [];
  const topicWords = belief.topicBeliefs
    .flatMap((t) => t.topic.split(/[\s，。]+/))
    .filter((w) => w.length > 1);

  // Check node goal relevance to topic
  const goalRelevant = topicWords.length === 0 || topicWords.some((tw) => nodeGoal.includes(tw));

  checks.push({
    name: '节点目标相关性',
    passed: goalRelevant,
    detail: goalRelevant
      ? '节点目标与主题相关'
      : `⚠️ 节点目标"${nodeGoal.slice(0, 40)}"未包含主题关键词`,
    severity: goalRelevant ? 'warning' : 'blocking',
  });

  return {
    passed: checks.every((c) => c.passed || c.severity !== 'blocking'),
    checks,
    summary: goalRelevant ? '✅' : '⚠️ 节点可能偏离主题',
  };
}
