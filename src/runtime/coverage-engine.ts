/**
 * Coverage Planning Engine — Sprint 5
 * Analyzes the PCS to determine what topics are covered vs missing,
 * and generates suggestions for expanding coverage.
 */

import type { PCSState } from '@/pcs/types';
import type { CoverageMap, CoverageTopic } from './reflection-types';

/**
 * Analyzes the current PCS and generates a coverage map.
 * Compares required_topics (from Architect) against actual content in nodes.
 */
export function buildCoverageMap(state: PCSState): CoverageMap {
  const requiredTopics = state.knowledge.required_topics;
  const sections = state.structure.sections;

  const topics: CoverageTopic[] = requiredTopics.map((rt) => {
    // Check if this topic is covered in its assigned section
    const section = sections.find((s) => s.id === rt.section_id);
    const isCovered = rt.covered;

    let status: 'covered' | 'missing' | 'weak' = 'missing';
    if (isCovered) {
      status = 'covered';
    } else if (section?.content_draft && section.content_draft.length > 0) {
      // Has content but topic not explicitly marked as covered
      status = 'weak';
    }

    return {
      topic: rt.topic,
      status,
      relatedSection: rt.section_id,
    };
  });

  // Also scan for topics NOT in required_topics but present in content
  const coveredCount = topics.filter((t) => t.status === 'covered').length;
  const total = topics.length;
  const percentage = total > 0 ? Math.round((coveredCount / total) * 100) : 100;

  return {
    domain: state.intent.purpose.value.slice(0, 50),
    requiredTopics: topics,
    coveragePercentage: percentage,
    missingTopics: topics.filter((t) => t.status === 'missing').map((t) => t.topic),
    weakTopics: topics.filter((t) => t.status === 'weak').map((t) => t.topic),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate suggestions for improving coverage.
 */
export interface CoverageSuggestion {
  topic: string;
  /** What's missing */
  gap: string;
  /** Which section should cover it */
  targetSection: string;
  /** Suggested action */
  action: 'add_section' | 'expand_section' | 'add_research';
  /** Priority */
  priority: 'high' | 'medium' | 'low';
}

export function generateCoverageSuggestions(map: CoverageMap): CoverageSuggestion[] {
  const suggestions: CoverageSuggestion[] = [];

  for (const topic of map.requiredTopics) {
    if (topic.status === 'missing') {
      suggestions.push({
        topic: topic.topic,
        gap: `完全未覆盖主题："${topic.topic}"`,
        targetSection: topic.relatedSection || '（需新增章节）',
        action: topic.relatedSection ? 'expand_section' : 'add_section',
        priority: 'high',
      });
    } else if (topic.status === 'weak') {
      suggestions.push({
        topic: topic.topic,
        gap: `弱覆盖 — 需要更多内容支撑`,
        targetSection: topic.relatedSection || '',
        action: 'expand_section',
        priority: 'medium',
      });
    }
  }

  // Sort by priority
  return suggestions.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

/**
 * Estimate the breadth of a user's idea and suggest expanded coverage areas.
 * V1: keyword-based. V2: LLM domain analysis.
 */
export function suggestCoverageAreas(idea: string): string[] {
  const domainMap: Record<string, string[]> = {
    AI: ['技术原理', '应用案例', '伦理风险', '商业模式', '未来趋势', '政策环境'],
    教育: ['现状分析', '改革方向', '国际比较', '技术影响', '政策解读', '实践案例'],
    创业: ['市场分析', '商业模式', '竞争格局', '团队建设', '融资策略', '风险管理'],
    科技: ['技术趋势', '产业影响', '创新案例', '政策监管', '投资机会', '人才发展'],
  };

  // Match keywords from idea to domains
  const matchedAreas = new Set<string>();
  for (const [domain, areas] of Object.entries(domainMap)) {
    if (idea.includes(domain)) {
      for (const area of areas) {
        matchedAreas.add(area);
      }
    }
  }

  if (matchedAreas.size === 0) {
    // Default: general coverage areas
    return ['背景分析', '核心论点', '案例支撑', '数据引用', '结论建议'];
  }

  return Array.from(matchedAreas);
}

/**
 * Check if the current coverage meets minimum requirements.
 */
export function isCoverageAdequate(map: CoverageMap, minPercentage = 60): boolean {
  return map.coveragePercentage >= minPercentage;
}
