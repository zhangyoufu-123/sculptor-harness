/**
 * Style Fingerprint — extracts the user's "expression resistance" patterns.
 *
 * Not "what words does the user use?" but:
 * - What does the user AVOID? (Resistance)
 * - What does the user REPLACE with what? (Association)
 * - What metaphors resonate? (Metaphor Pattern)
 * - What does the user notice that others don't? (Attention Bias)
 *
 * Theory: Style = Language × Experience × Constraint
 * Style comes from LIMITATION, not ability.
 */

import { LLMClient } from '@/lib/llm-client';

// =========================================================================
// Style Fingerprint — the core data model
// =========================================================================

export interface StyleFingerprint {
  /** What the user avoids or rejects */
  resistance: ResistancePattern[];
  /** What the user associates with what (cognitive links) */
  associations: AssociationLink[];
  /** Preferred metaphor patterns */
  metaphorPatterns: MetaphorPattern[];
  /** What the user pays attention to */
  attentionBias: AttentionBias;
  /** Overall style confidence (how much data we have) */
  confidence: number;
  /** Number of observations collected */
  sampleCount: number;
  /** When last updated */
  updatedAt: string;
}

export interface ResistancePattern {
  /** What was rejected */
  pattern: string;
  /** Category: abstract, cliche, overly_formal, overly_casual, etc. */
  category: string;
  /** How many times this was observed */
  count: number;
}

export interface AssociationLink {
  /** Source concept */
  from: string;
  /** Associated concept (what the user connects it to) */
  to: string;
  /** Strength of association */
  strength: number;
  /** Category: personal_experience, social_critique, natural_metaphor, etc. */
  category: string;
}

export interface MetaphorPattern {
  /** Source domain (e.g., "nature", "body", "machinery") */
  sourceDomain: string;
  /** Target domain (what it's applied to) */
  targetDomain: string;
  /** Example from user's writing */
  example: string;
  /** Frequency */
  count: number;
}

export interface AttentionBias {
  /** What the user focuses on (vs what AI would focus on) */
  focusAreas: string[];
  /** What the user ignores */
  blindSpots: string[];
  /** Detail level preference (1=sparse, 5=rich detail) */
  detailLevel: number;
  /** Emotional register preference */
  emotionalRegister: string;
}

// =========================================================================
// Factory
// =========================================================================

export function createStyleFingerprint(): StyleFingerprint {
  return {
    resistance: [],
    associations: [],
    metaphorPatterns: [],
    attentionBias: { focusAreas: [], blindSpots: [], detailLevel: 3, emotionalRegister: 'neutral' },
    confidence: 0.1,
    sampleCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

// =========================================================================
// Implicit Learning from User Actions
// =========================================================================

/**
 * Record a resistance pattern from user rejection.
 * "User rejected this → they avoid this kind of expression"
 */
export function recordResistance(
  fp: StyleFingerprint,
  rejectedText: string,
  category: string,
): void {
  const existing = fp.resistance.find((r) => r.pattern === rejectedText.slice(0, 30));
  if (existing) {
    existing.count++;
  } else {
    fp.resistance.push({ pattern: rejectedText.slice(0, 100), category, count: 1 });
  }
  fp.sampleCount++;
  fp.confidence = Math.min(fp.confidence + 0.05, 1.0);
  fp.updatedAt = new Date().toISOString();
}

/**
 * Record an association from user edit.
 * "User replaced X with Y → they associate this with that"
 */
export function recordAssociation(
  fp: StyleFingerprint,
  original: string,
  replacement: string,
): void {
  // Extract the "essence" of what changed
  const category = classifyAssociationType(original, replacement);

  fp.associations.push({
    from: original.slice(0, 40),
    to: replacement.slice(0, 40),
    strength: 0.5,
    category,
  });

  // Strengthen existing similar associations
  for (const link of fp.associations) {
    if (link.category === category) {
      link.strength = Math.min(link.strength + 0.1, 1.0);
    }
  }

  fp.sampleCount++;
  fp.confidence = Math.min(fp.confidence + 0.03, 1.0);
  fp.updatedAt = new Date().toISOString();
}

/**
 * Record a metaphor pattern from user's writing.
 */
export function recordMetaphor(
  fp: StyleFingerprint,
  sourceDomain: string,
  targetDomain: string,
  example: string,
): void {
  const existing = fp.metaphorPatterns.find(
    (m) => m.sourceDomain === sourceDomain && m.targetDomain === targetDomain,
  );
  if (existing) {
    existing.count++;
  } else {
    fp.metaphorPatterns.push({
      sourceDomain,
      targetDomain,
      example: example.slice(0, 100),
      count: 1,
    });
  }
  fp.sampleCount++;
  fp.confidence = Math.min(fp.confidence + 0.04, 1.0);
  fp.updatedAt = new Date().toISOString();
}

/**
 * Update attention bias from user's focus patterns.
 */
export function updateAttentionBias(
  fp: StyleFingerprint,
  userFocus: string,
  aiWouldFocus: string,
): void {
  if (!fp.attentionBias.focusAreas.includes(userFocus)) {
    fp.attentionBias.focusAreas.push(userFocus);
  }
  if (!fp.attentionBias.blindSpots.includes(aiWouldFocus)) {
    fp.attentionBias.blindSpots.push(aiWouldFocus);
  }
  fp.updatedAt = new Date().toISOString();
}

// =========================================================================
// Style Constraint Generation
// =========================================================================

/**
 * Generate style constraints for LLM prompt injection.
 * "Write with these constraints that match the user's fingerprint"
 */
export function buildStyleConstraints(fp: StyleFingerprint): string {
  if (fp.confidence < 0.3) return '';

  const constraints: string[] = [];
  constraints.push('## 风格约束（基于你的写作习惯）');

  // Resistance patterns → avoidance rules
  if (fp.resistance.length > 0) {
    const topResistance = fp.resistance.sort((a, b) => b.count - a.count).slice(0, 3);
    constraints.push('\n### 避免以下表达:');
    for (const r of topResistance) {
      constraints.push(`- ❌ 避免: ${r.pattern.slice(0, 60)} (已拒绝${r.count}次)`);
    }
  }

  // Association patterns → preference rules
  if (fp.associations.length > 0) {
    constraints.push('\n### 表达偏好:');
    const categories = Array.from(new Set(fp.associations.map((a) => a.category)));
    for (const cat of categories.slice(0, 3)) {
      const examples = fp.associations.filter((a) => a.category === cat).slice(0, 2);
      constraints.push(
        `- 偏好${cat}: ${examples.map((e) => `"${e.from.slice(0, 20)}"→"${e.to.slice(0, 20)}"`).join(', ')}`,
      );
    }
  }

  // Metaphor patterns
  if (fp.metaphorPatterns.length > 0) {
    constraints.push('\n### 比喻偏好:');
    const top = fp.metaphorPatterns[0];
    constraints.push(`- 倾向用"${top.sourceDomain}"比喻"${top.targetDomain}"`);
  }

  // Attention bias
  if (fp.attentionBias.focusAreas.length > 0) {
    constraints.push(`\n### 注意力偏向: ${fp.attentionBias.focusAreas.join(', ')}`);
  }

  return constraints.join('\n');
}

/**
 * Get a compact version for token-limited prompts.
 */
export function getCompactStyleConstraints(fp: StyleFingerprint): string {
  if (fp.confidence < 0.3) return '';
  const avoid = fp.resistance
    .slice(0, 2)
    .map((r) => r.pattern.slice(0, 30))
    .join(', ');
  return `风格约束: 避免[${avoid}] | 细节度${fp.attentionBias.detailLevel}/5 | ${fp.attentionBias.emotionalRegister}`;
}

/**
 * Generate contrastive examples for style injection.
 * "This is what you DO want, this is what you DON'T want"
 * Based on the Contrastive Examples (CE) technique.
 */
export function buildContrastiveExamples(fp: StyleFingerprint): string {
  if (fp.confidence < 0.3 || fp.resistance.length === 0) return '';

  const examples: string[] = [];
  examples.push('\n## 对比示例');

  for (const r of fp.resistance.slice(0, 3)) {
    // Find the association that replaced this resistance
    const replacement = fp.associations.find((a) => a.from.includes(r.pattern.slice(0, 15)));

    examples.push(`\n❌ 不要这样写（已被拒绝${r.count}次）:`);
    examples.push(`   "${r.pattern.slice(0, 60)}"`);

    if (replacement) {
      examples.push(`✅ 应该这样写:`);
      examples.push(`   "${replacement.to.slice(0, 60)}"`);
    }
  }

  return examples.join('\n');
}

// =========================================================================
// Helpers
// =========================================================================

function classifyAssociationType(original: string, replacement: string): string {
  // Abstract → concrete
  if (original.length < 20 && replacement.length > 50) return '具体化';
  // Concrete → abstract
  if (original.length > 50 && replacement.length < 20) return '抽象化';
  // Formal → casual
  if (replacement.includes('了') || replacement.includes('吧') || replacement.includes('呢'))
    return '口语化';
  // Emotional → restrained
  if (original.includes('！') && !replacement.includes('！')) return '克制';
  return '改写';
}

// =========================================================================
// X-Prompt: Auto Style Profiling via LLM
// =========================================================================

/**
 * Auto-extract a style profile from user's writing samples using LLM.
 * X-Prompt approach: generates a natural language style prefix for injection.
 */
export async function extractStyleProfile(samples: string[]): Promise<string> {
  if (samples.length === 0) return '';

  const llm = new LLMClient();

  try {
    const response = await llm.completeWithRetry({
      systemPrompt: `你是写作风格分析专家。分析用户的写作样本，提取风格画像。输出JSON: {"tone":"语气","sentenceStyle":"句式特点","vocabulary":"词汇特征","patterns":["模式1","模式2"],"voice":["描述1","描述2"],"avoidList":["应避免的表达"]}`,
      prompt: `分析以下写作样本的风格:\n${samples.map((s, i) => `样本${i + 1}: ${s.slice(0, 200)}`).join('\n')}\n\n以JSON格式输出风格画像。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 500,
    });

    if (response.json) {
      const profile = response.json as Record<string, unknown>;
      const parts: string[] = ['## 自动提取的风格画像'];
      if (profile.tone) parts.push(`语气: ${profile.tone}`);
      if (profile.sentenceStyle) parts.push(`句式: ${profile.sentenceStyle}`);
      if (profile.vocabulary) parts.push(`词汇: ${profile.vocabulary}`);
      if (Array.isArray(profile.patterns))
        parts.push(`模式: ${(profile.patterns as string[]).join(', ')}`);
      if (Array.isArray(profile.voice))
        parts.push(`声音: ${(profile.voice as string[]).join(', ')}`);
      if (Array.isArray(profile.avoidList))
        parts.push(`避免: ${(profile.avoidList as string[]).join(', ')}`);
      return parts.join('\n');
    }
  } catch {
    /* fallback */
  }

  return '';
}

// =========================================================================
// Enhanced Contrastive Examples — "other author" wrong patterns
// =========================================================================

/**
 * Generate enhanced contrastive examples including "other author" wrong patterns.
 */
export function buildEnhancedContrastiveExamples(fp: StyleFingerprint): string {
  if (fp.confidence < 0.3 || fp.resistance.length === 0) return '';

  const examples: string[] = [];
  examples.push('\n## ⚠️ 风格对比（避免 → 偏好）');

  // User's own preference patterns
  for (const r of fp.resistance.slice(0, 2)) {
    const replacement = fp.associations.find((a) => a.from.includes(r.pattern.slice(0, 15)));
    examples.push(`\n### 你倾向于避免: ${r.category}`);
    examples.push(`❌ 不要: "${r.pattern.slice(0, 50)}" (已拒绝${r.count}次)`);
    if (replacement) {
      examples.push(`✅ 你偏好: "${replacement.to.slice(0, 50)}"`);
    }
  }

  // Generic "everyone does this" patterns that the user avoids
  const universalClichés = {
    generic: ['其他作者常写的通用表达（如"综上所述"、"不可否认"、"具有重要意义"）'],
    overly_formal: ['其他作者常见的过度正式表达（如"在此基础之上"、"有鉴于此"）'],
    overly_casual: ['其他作者常见的过度口语表达（如"咱们就是说"、"绝绝子"）'],
  };

  const userCategories = new Set(fp.resistance.map((r) => r.category));
  for (const [cat, patterns] of Object.entries(universalClichés)) {
    if (userCategories.has(cat)) {
      examples.push(`\n### 其他人常写（但你要避免）: ${cat}`);
      for (const p of patterns) {
        examples.push(`⚠️ ${p}`);
      }
    }
  }

  return examples.join('\n');
}
