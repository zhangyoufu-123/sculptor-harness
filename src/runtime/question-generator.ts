/**
 * Dynamic Question Generator — Sprint Fix P0
 *
 * Generates clarification questions dynamically based on:
 * 1. Creative type (fiction needs character questions, article needs audience questions)
 * 2. What information is already known (don't re-ask)
 * 3. What's most important to ask next (highest impact on structure)
 *
 * Replaces: fixed 8-dimension template for all creative types.
 */

import type { CreativeType } from './creative-type-router';
import type { ClarifyDimension } from './clarification-schemas';
import { getClarificationSchema } from './clarification-schemas';

// =========================================================================
// Conversation State (what's been discussed so far)
// =========================================================================

export interface ConversationState {
  /** Creative type detected */
  creativeType: CreativeType;
  /** Keys of dimensions already answered */
  answeredKeys: string[];
  /** The user's original idea */
  idea: string;
  /** Messages so far */
  messageCount: number;
  /** Whether the user seems impatient (short answers, skipping) */
  userImpatience: number; // 0-1, higher = more impatient
}

// =========================================================================
// Generated Question
// =========================================================================

export interface GeneratedQuestion {
  /** The question text to show the user */
  question: string;
  /** Explanation of WHY this question is being asked (for debug) */
  reason: string;
  /** How important is this question for structural planning? (0-1) */
  importance: number;
  /** Options (generated or from schema) */
  options: string[];
  /** Allow free-text input? */
  freeform: boolean;
  /** PCS field path this question fills */
  field: string;
  /** What creative aspects this affects */
  affects: string[];
}

// =========================================================================
// Generator
// =========================================================================

/**
 * Generate the NEXT question to ask the user.
 * V1: selects from schema dimensions, skipping already-answered ones.
 * V2: LLM generates context-aware questions dynamically.
 */
export function generateNextQuestion(
  state: ConversationState,
  previousAnswers: Record<string, string> = {},
): GeneratedQuestion | null {
  const schema = getClarificationSchema(state.creativeType);

  // Find dimensions not yet answered
  const remaining = schema.dimensions.filter((d) => !state.answeredKeys.includes(d.key));

  if (remaining.length === 0) return null; // Done

  // Pick the highest-impact remaining dimension
  // V1: use the first unanswered (schema order implies priority)
  // V2: rank by importance based on creative type
  const next = remaining[0]!;

  // Build contextual question
  const question = buildContextualQuestion(state, next, previousAnswers);

  // Determine options — use schema defaults or generate contextually
  const options =
    next.options.length > 0 ? next.options : generateDefaultOptions(next.key, state.creativeType);

  return {
    question,
    reason: `确定${next.label}以构建${state.creativeType}的结构`,
    importance: 1 - state.answeredKeys.length / schema.dimensions.length,
    options,
    freeform: next.freeform || false,
    field: next.field,
    affects: getAffectedAspects(next.key, state.creativeType),
  };
}

/**
 * Build a contextually-aware question by incorporating what we know.
 */
function buildContextualQuestion(
  state: ConversationState,
  dim: ClarifyDimension,
  _previousAnswers: Record<string, string>,
): string {
  const hint = dim.hint || '';

  // For fiction, make questions more narrative
  if (state.creativeType === 'fiction_novel') {
    if (dim.key === 'protagonist') {
      return `我理解你的故事核心。现在告诉我：\n\n故事的主人公是谁？他/她是一个什么样的人？\n\n${hint}`;
    }
    if (dim.key === 'core_conflict') {
      return `这个故事最终想让读者思考什么？\n\n${hint}`;
    }
    if (dim.key === 'ai_nature') {
      return `在你的世界中，AI是什么样的存在？它为什么成为冲突的焦点？\n\n${hint}`;
    }
  }

  // For article, use the standard question format
  if (state.creativeType === 'article') {
    return dim.label + '：' + (hint || '请选择或自定义');
  }

  // Default: warm, conversational
  return `${dim.label}\n\n${hint || '请选择或自定义输入'}`;
}

/**
 * Generate default options when schema doesn't provide them.
 */
function generateDefaultOptions(key: string, _type: CreativeType): string[] {
  const defaults: Record<string, string[]> = {
    protagonist: ['年轻人', '中年人', '专业人士', '普通人', '反英雄'],
    core_conflict: ['人与技术', '人与社会', '内心挣扎', '成长旅程'],
    world_type: ['现实世界', '近未来', '架空世界', '历史背景'],
    purpose: ['分享知识', '表达观点', '讲述故事', '说服读者'],
    audience: ['普通读者', '专业人士', '爱好者', '学生'],
  };
  return defaults[key] || ['自定义输入'];
}

/**
 * What aspects of the creative work does answering this question affect?
 */
function getAffectedAspects(key: string, _type: CreativeType): string[] {
  const map: Record<string, string[]> = {
    protagonist: ['character_arc', 'narrative_voice', 'reader_connection'],
    world_type: ['worldbuilding', 'tone', 'plot_constraints'],
    core_conflict: ['plot_structure', 'theme', 'ending'],
    ai_nature: ['worldbuilding', 'conflict_type', 'moral_framework'],
    purpose: ['structure', 'tone', 'evaluation_criteria'],
    audience: ['language_level', 'content_depth', 'examples'],
    tone: ['word_choice', 'sentence_structure', 'reader_experience'],
    format: ['delivery_method', 'length', 'structure_template'],
  };
  return map[key] || ['general_structure'];
}

/**
 * Check if the user seems to want to skip detailed clarification.
 */
export function detectUserImpatience(messages: Array<{ role: string; content: string }>): number {
  const recentUserMessages = messages.filter((m) => m.role === 'user').slice(-5);

  let impatienceScore = 0;

  for (const msg of recentUserMessages) {
    const content = msg.content.toLowerCase();
    // Short answers suggest impatience
    if (content.length < 5) impatienceScore += 0.2;
    // Skip signals
    if (content.includes('跳过') || content.includes('不用') || content.includes('直接'))
      impatienceScore += 0.3;
    // Enthusiasm signals (lower impatience)
    if (content.length > 50) impatienceScore -= 0.1;
  }

  return Math.max(0, Math.min(1, impatienceScore));
}

/**
 * Should we skip remaining clarification and go to blueprint?
 */
export function shouldSkipClarification(state: ConversationState): boolean {
  // If user is very impatient and we have the basics covered
  if (state.userImpatience > 0.7 && state.answeredKeys.length >= 3) return true;
  // If we've answered most dimensions
  if (state.answeredKeys.length >= 6) return true;
  return false;
}
