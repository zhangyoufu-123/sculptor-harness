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
