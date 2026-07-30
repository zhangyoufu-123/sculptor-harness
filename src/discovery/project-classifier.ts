/**
 * Project Classifier — Sprint 0.6 Discovery Runtime
 *
 * Determines WHAT the user is trying to create — not just content type,
 * but dimensions of scope, maturity, and information completeness.
 *
 * V1: keyword + structural heuristics. V2: LLM-based classification.
 */

import type { CreativeType } from '@/runtime/creative-type-router';
import { classifyCreativeType, isFiction } from '@/runtime/creative-type-router';

// =========================================================================
// Project Dimensions — what we need to discover
// =========================================================================

export type DiscoveryDimension =
  | 'purpose' // Why are they creating this?
  | 'audience' // Who is it for?
  | 'scope' // How big/long/complex?
  | 'tone' // What feeling should it evoke?
  | 'structure' // What shape should it take?
  | 'protagonist' // Who is the main character? (fiction only)
  | 'conflict' // What is the core tension? (fiction only)
  | 'world' // What is the setting? (fiction only)
  | 'thesis' // What is the core argument? (non-fiction only)
  | 'evidence' // What supports the argument? (non-fiction only)
  | 'methodology'; // How will they approach this? (research only)

// =========================================================================
// Project Maturity — how far along is the user's thinking?
// =========================================================================

export type ProjectMaturity =
  | 'seed' // Just a vague idea — need to explore broadly
  | 'sprout' // Core concept is clear — need to refine dimensions
  | 'structured' // Detailed vision — ready for blueprint
  | 'expert'; // User knows exactly what they want — minimal discovery

// =========================================================================
// Classification Result
// =========================================================================

export interface ProjectClassification {
  /** Creative type (fiction/article/research/...) */
  creativeType: CreativeType;
  /** Confidence in this classification (0-1) */
  confidence: number;
  /** How mature is the user's idea? */
  maturity: ProjectMaturity;
  /** Dimensions that still need discovery, ordered by priority */
  unknowns: DiscoveryDimension[];
  /** Dimensions the user has already expressed */
  knowns: DiscoveryDimension[];
  /** Human-readable summary of what we understand */
  summary: string;
  /** Suggested workflow path */
  workflow:
    'fiction_discovery' | 'nonfiction_discovery' | 'research_discovery' | 'minimal_discovery';
}

// =========================================================================
// Classifier
// =========================================================================

/**
 * Classify the user's project from their initial input.
 * Determines creative type, maturity level, and what needs discovery.
 */
export function classifyProject(
  idea: string,
  _conversationContext?: string[],
): ProjectClassification {
  void _conversationContext;

  // Step 1: Creative type routing
  const typeResult = classifyCreativeType(idea);

  // Step 2: Maturity assessment
  const maturity = assessMaturity(idea);

  // Step 3: Unknown dimension detection
  const unknowns = detectUnknowns(idea, typeResult.type, maturity);

  // Step 4: Known detection
  const knowns = detectKnowns(idea, typeResult.type);

  // Step 5: Summary generation
  const summary = generateSummary(typeResult.type, maturity, knowns, unknowns);

  // Step 6: Workflow selection
  const workflow = selectWorkflow(typeResult.type, maturity);

  return {
    creativeType: typeResult.type,
    confidence: typeResult.confidence,
    maturity,
    unknowns,
    knowns,
    summary,
    workflow,
  };
}

// =========================================================================
// Maturity Assessment (V1: heuristic)
// =========================================================================

function assessMaturity(idea: string): ProjectMaturity {
  const len = idea.length;
  const hasDetail = /具体|首先|然后|最后|第一章|第一节|大纲|结构/.test(idea);
  const hasCharacter = /主角|人物|角色|反派|主人公/.test(idea);
  const hasWorld = /世界|背景|设定|年代|未来|古代/.test(idea);
  const hasThesis = /观点|论证|论点|证明|数据|研究表明/.test(idea);
  const hasFormat = /格式|排版|字数|页数|章节/.test(idea);

  const detailScore = [hasDetail, hasCharacter, hasWorld, hasThesis, hasFormat].filter(
    Boolean,
  ).length;

  if (len < 15 && !hasDetail) return 'seed';
  if (len > 100 && detailScore >= 3) return 'structured';
  if (detailScore >= 4) return 'expert';
  if (len > 50 || detailScore >= 2) return 'sprout';
  return 'seed';
}

// =========================================================================
// Unknown Detection (what still needs discovery)
// =========================================================================

function detectUnknowns(
  idea: string,
  type: CreativeType,
  _maturity: ProjectMaturity,
): DiscoveryDimension[] {
  void _maturity;

  const unknowns: DiscoveryDimension[] = [];
  const lower = idea.toLowerCase();

  // Always need purpose (unless explicitly stated)
  if (!lower.includes('为了') && !lower.includes('目标')) {
    unknowns.push('purpose');
  }

  // Always need audience
  if (!lower.includes('读者') && !lower.includes('给') && !lower.includes('面向')) {
    unknowns.push('audience');
  }

  // Fiction-specific
  if (isFiction(type)) {
    if (!lower.includes('主角') && !lower.includes('主人公') && !lower.includes('人物')) {
      unknowns.push('protagonist');
    }
    if (!lower.includes('冲突') && !lower.includes('矛盾') && !lower.includes('对抗')) {
      unknowns.push('conflict');
    }
    if (!lower.includes('世界') && !lower.includes('背景') && !lower.includes('设定')) {
      unknowns.push('world');
    }
  }

  // Non-fiction specific
  if (!isFiction(type) && type !== 'poetry') {
    if (!lower.includes('观点') && !lower.includes('论点') && !lower.includes('核心')) {
      unknowns.push('thesis');
    }
    if (
      type === 'research' &&
      !lower.includes('方法') &&
      !lower.includes('研究') &&
      !lower.includes('实验')
    ) {
      unknowns.push('methodology');
    }
  }

  // Scope is almost always unknown initially
  if (
    !lower.includes('字数') &&
    !lower.includes('页') &&
    !lower.includes('篇') &&
    !lower.includes('长')
  ) {
    unknowns.push('scope');
  }

  return unknowns;
}

function detectKnowns(idea: string, _type: CreativeType): DiscoveryDimension[] {
  void _type;

  const knowns: DiscoveryDimension[] = [];
  const lower = idea.toLowerCase();

  if (lower.includes('主角') || lower.includes('主人公')) knowns.push('protagonist');
  if (lower.includes('冲突') || lower.includes('矛盾')) knowns.push('conflict');
  if (lower.includes('世界') || lower.includes('背景')) knowns.push('world');
  if (lower.includes('观点') || lower.includes('论点')) knowns.push('thesis');
  if (lower.includes('读者') || lower.includes('给')) knowns.push('audience');
  if (lower.includes('为了') || lower.includes('目标')) knowns.push('purpose');

  return knowns;
}

// =========================================================================
// Summary + Workflow
// =========================================================================

function generateSummary(
  type: CreativeType,
  maturity: ProjectMaturity,
  knowns: DiscoveryDimension[],
  unknowns: DiscoveryDimension[],
): string {
  void type;

  const parts: string[] = [];
  if (knowns.length > 0) parts.push(`已明确: ${knowns.join('、')}`);
  if (unknowns.length > 0) parts.push(`待探索: ${unknowns.join('、')}`);
  parts.push(`成熟度: ${maturity}`);
  return parts.join(' | ');
}

function selectWorkflow(
  type: CreativeType,
  maturity: ProjectMaturity,
): ProjectClassification['workflow'] {
  if (maturity === 'expert') return 'minimal_discovery';
  if (isFiction(type)) return 'fiction_discovery';
  if (type === 'research') return 'research_discovery';
  return 'nonfiction_discovery';
}
