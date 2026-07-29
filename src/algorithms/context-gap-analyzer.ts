import type { PCSState } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GapAnalysisResult {
  dimension: string; // Which dimension was analyzed
  totalFields: number;
  confirmedFields: number;
  assumedFields: number;
  missingFields: string[]; // Field paths that need clarification
  suggestedQuestions: string[]; // Questions to ask the user
  confidence: number;
}

// ---------------------------------------------------------------------------
// Internal descriptors
// ---------------------------------------------------------------------------

/** Single-field descriptor linking a PCS field to its display info. */
interface FieldDescriptor {
  fieldPath: string;
  label: string;
  dimension: string;
  priority: number;
  /** Accessor that extracts the current PCS field value from state. */
  extractValue: (state: PCSState) => unknown;
  /** Accessor that extracts the current PCS field status from state. */
  extractStatus: (state: PCSState) => string;
}

const DIMENSION_ORDER: Record<string, number> = {
  Intent: 0,
  Audience: 1,
  Constraint: 2,
  Expression: 3,
};

/** Chinese labels for every PCS field across the 4 inspected dimensions. */
const FIELD_LABELS: Record<string, string> = {
  // Intent
  'intent.purpose': '写作目的',
  'intent.core_message': '核心信息',
  'intent.desired_impact': '预期影响',
  'intent.target_emotion': '目标情感',
  // Audience
  'audience.audience_type': '读者类型',
  'audience.knowledge_level': '知识水平',
  'audience.relationship': '作者与读者关系',
  'audience.pain_points': '读者痛点',
  // Constraint
  'constraint.type': '内容类型',
  'constraint.platform': '发布平台',
  'constraint.format': '格式',
  'constraint.length_min': '最小字数',
  'constraint.length_max': '最大字数',
  'constraint.deadline': '截止日期',
  'constraint.custom_constraints': '自定义约束',
  // Expression
  'expression.tone': '语调',
  'expression.voice': '声音',
  'expression.avoid': '避免项',
  'expression.style_reference': '风格参考',
  'expression.format_reference': '格式参考',
  'expression.thinking_reference': '思维参考',
};

/**
 * Populate descriptors for one dimension layer by enumerating its fields.
 *
 * Every field gets a descriptor that wraps its value + status extractors so
 * we can iterate uniformly over all dimensions.
 */
function buildDescriptors(state: PCSState): FieldDescriptor[] {
  const descriptors: FieldDescriptor[] = [];

  // ── Intent ──
  const intentFields: Array<{
    path: string;
    value: unknown;
    status: string;
  }> = [
    { path: 'intent.purpose', value: state.intent.purpose, status: state.intent.purpose.status },
    {
      path: 'intent.core_message',
      value: state.intent.core_message,
      status: state.intent.core_message.status,
    },
    {
      path: 'intent.desired_impact',
      value: state.intent.desired_impact,
      status: state.intent.desired_impact.status,
    },
    {
      path: 'intent.target_emotion',
      value: state.intent.target_emotion,
      status: state.intent.target_emotion.status,
    },
  ];

  for (const f of intentFields) {
    descriptors.push({
      fieldPath: f.path,
      label: FIELD_LABELS[f.path] ?? f.path,
      dimension: 'Intent',
      priority: DIMENSION_ORDER['Intent'] ?? 0,
      extractValue: () => (f.value as { value: unknown }).value,
      extractStatus: () => f.status,
    });
  }

  // ── Audience ──
  const audienceFields: Array<{
    path: string;
    value: unknown;
    status: string;
  }> = [
    {
      path: 'audience.audience_type',
      value: state.audience.audience_type,
      status: state.audience.audience_type.status,
    },
    {
      path: 'audience.knowledge_level',
      value: state.audience.knowledge_level,
      status: state.audience.knowledge_level.status,
    },
    {
      path: 'audience.relationship',
      value: state.audience.relationship,
      status: state.audience.relationship.status,
    },
    {
      path: 'audience.pain_points',
      value: state.audience.pain_points,
      status: state.audience.pain_points.status,
    },
  ];

  for (const f of audienceFields) {
    descriptors.push({
      fieldPath: f.path,
      label: FIELD_LABELS[f.path] ?? f.path,
      dimension: 'Audience',
      priority: DIMENSION_ORDER['Audience'] ?? 1,
      extractValue: () => (f.value as { value: unknown }).value,
      extractStatus: () => f.status,
    });
  }

  // ── Constraint ──
  const constraintFields: Array<{
    path: string;
    value: unknown;
    status: string;
  }> = [
    { path: 'constraint.type', value: state.constraint.type, status: state.constraint.type.status },
    {
      path: 'constraint.platform',
      value: state.constraint.platform,
      status: state.constraint.platform.status,
    },
    {
      path: 'constraint.format',
      value: state.constraint.format,
      status: state.constraint.format.status,
    },
    {
      path: 'constraint.length_min',
      value: state.constraint.length_min,
      status: state.constraint.length_min.status,
    },
    {
      path: 'constraint.length_max',
      value: state.constraint.length_max,
      status: state.constraint.length_max.status,
    },
    {
      path: 'constraint.deadline',
      value: state.constraint.deadline,
      status: state.constraint.deadline.status,
    },
    {
      path: 'constraint.custom_constraints',
      value: state.constraint.custom_constraints,
      status: state.constraint.custom_constraints.status,
    },
  ];

  for (const f of constraintFields) {
    descriptors.push({
      fieldPath: f.path,
      label: FIELD_LABELS[f.path] ?? f.path,
      dimension: 'Constraint',
      priority: DIMENSION_ORDER['Constraint'] ?? 2,
      extractValue: () => (f.value as { value: unknown }).value,
      extractStatus: () => f.status,
    });
  }

  // ── Expression ──
  const expressionFields: Array<{
    path: string;
    value: unknown;
    status: string;
  }> = [
    { path: 'expression.tone', value: state.expression.tone, status: state.expression.tone.status },
    {
      path: 'expression.voice',
      value: state.expression.voice,
      status: state.expression.voice.status,
    },
    {
      path: 'expression.avoid',
      value: state.expression.avoid,
      status: state.expression.avoid.status,
    },
    {
      path: 'expression.style_reference',
      value: state.expression.style_reference,
      status: state.expression.style_reference.status,
    },
    {
      path: 'expression.format_reference',
      value: state.expression.format_reference,
      status: state.expression.format_reference.status,
    },
    {
      path: 'expression.thinking_reference',
      value: state.expression.thinking_reference,
      status: state.expression.thinking_reference.status,
    },
  ];

  for (const f of expressionFields) {
    descriptors.push({
      fieldPath: f.path,
      label: FIELD_LABELS[f.path] ?? f.path,
      dimension: 'Expression',
      priority: DIMENSION_ORDER['Expression'] ?? 3,
      extractValue: () => (f.value as { value: unknown }).value,
      extractStatus: () => f.status,
    });
  }

  return descriptors;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine whether a value is semantically "empty" / missing. */
function isValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  return false;
}

/** Generate a human-readable question based on field label and current state. */
function generateQuestion(label: string, isMissing: boolean, currentValue: unknown): string {
  if (isMissing) {
    return `请提供「${label}」的具体内容。`;
  }
  const preview =
    typeof currentValue === 'string'
      ? currentValue.slice(0, 40)
      : String(currentValue ?? '').slice(0, 40);
  return `请确认「${label}」：「${preview}」是否正确？或提供更准确的描述。`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze PCS state and identify gaps that need user clarification.
 *
 * Phase 1: Moves fields from 'assumed' to 'confirmed' by asking targeted
 * questions. Checks Intent, Audience, Constraint, and Expression layers.
 *
 * @param state         - The full PCS state to analyze.
 * @param focusDimension - Optional: only analyze one dimension.
 * @returns Gap analysis results sorted by layer priority:
 *          Intent > Audience > Constraint > Expression.
 */
function analyzeGaps(state: PCSState, focusDimension?: string): GapAnalysisResult[] {
  const descriptors = buildDescriptors(state);

  // Group descriptors by dimension
  const grouped: Record<string, FieldDescriptor[]> = {};
  for (const d of descriptors) {
    if (focusDimension !== undefined && d.dimension !== focusDimension) continue;
    if (!grouped[d.dimension]) grouped[d.dimension] = [];
    grouped[d.dimension].push(d);
  }

  const results: GapAnalysisResult[] = [];

  for (const [dimension, fields] of Object.entries(grouped)) {
    const totalFields = fields.length;
    let confirmedFields = 0;
    let assumedFields = 0;
    const missingFields: string[] = [];
    const suggestedQuestions: string[] = [];

    for (const field of fields) {
      const status = field.extractStatus(state);
      const value = field.extractValue(state);

      if (status === 'confirmed' || status === 'locked') {
        confirmedFields++;
        continue;
      }

      if (status === 'assumed' || status === 'proposed') {
        assumedFields++;
      }

      if (isValueEmpty(value)) {
        missingFields.push(field.fieldPath);
      }

      suggestedQuestions.push(generateQuestion(field.label, isValueEmpty(value), value));
    }

    const confidence = totalFields > 0 ? (confirmedFields + assumedFields * 0.5) / totalFields : 0;

    results.push({
      dimension,
      totalFields,
      confirmedFields,
      assumedFields,
      missingFields,
      suggestedQuestions,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  // Sort by dimension priority: Intent > Audience > Constraint > Expression
  results.sort(
    (a, b) => (DIMENSION_ORDER[a.dimension] ?? 99) - (DIMENSION_ORDER[b.dimension] ?? 99),
  );

  return results;
}

export { analyzeGaps };
export type { GapAnalysisResult };
