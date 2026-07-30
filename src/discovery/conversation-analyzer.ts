/**
 * Conversation Analyzer — Sprint 0.6 Discovery Runtime
 *
 * Classifies each user input to determine intent:
 * - New information (discovery)
 * - Correction (revising a previous answer)
 * - Conflict (changing core intent)
 * - Temporary idea (exploration, not commitment)
 * - Typo/error (no semantic change)
 */

// =========================================================================
// Input Classification
// =========================================================================

export type InputClass =
  | 'new_info' // User is providing new information
  | 'correction' // User is fixing a previous statement
  | 'conflict' // User is changing core intent
  | 'temp_idea' // User is exploring a possibility
  | 'typo' // User made a typo
  | 'question' // User is asking a question
  | 'affirmation'; // User is confirming (yes/no/ok)

export interface InputAnalysis {
  /** What kind of input this is */
  class: InputClass;
  /** Confidence in this classification (0-1) */
  confidence: number;
  /** If this is a correction, what is being corrected */
  correctsField?: string;
  /** If this is a conflict, what is changing */
  conflictsWith?: string;
  /** Extracted key information (if any) */
  extractedInfo?: Record<string, string>;
}

// =========================================================================
// Analyzer
// =========================================================================

/**
 * Classify a user's input based on content and conversation context.
 */
export function analyzeInput(
  input: string,
  previousMessages: Array<{ role: string; content: string }> = [],
): InputAnalysis {
  const lower = input.toLowerCase().trim();

  // Affirmation
  if (['是', '对', '好', '可以', '确认', 'ok', 'yes', 'y', '嗯'].includes(lower)) {
    return { class: 'affirmation', confidence: 0.95 };
  }

  // Question
  if (/[？?]$/.test(input) || /^为什么|^怎么|^什么是|^能否|^可以|^如何/.test(input)) {
    return { class: 'question', confidence: 0.9 };
  }

  // Correction patterns
  if (detectCorrection(input)) {
    const field = extractCorrectionField(input);
    return {
      class: 'correction',
      confidence: 0.85,
      correctsField: field,
      extractedInfo: field ? { [field]: extractNewValue(input) } : undefined,
    };
  }

  // Conflict patterns
  if (detectConflict(input)) {
    return {
      class: 'conflict',
      confidence: 0.75,
      conflictsWith: 'intent',
      extractedInfo: extractConflictInfo(input),
    };
  }

  // Temp idea patterns
  if (detectTempIdea(input)) {
    return { class: 'temp_idea', confidence: 0.7 };
  }

  // Typo detection (very short input, high similarity to previous)
  if (input.length < 3 && previousMessages.length > 0) {
    return { class: 'typo', confidence: 0.5 };
  }

  // Default: new information
  return { class: 'new_info', confidence: 0.6 };
}

// =========================================================================
// Pattern detectors
// =========================================================================

export function detectCorrection(input: string): boolean {
  const patterns = [
    /不是(.+)，?(?:而是|是)(.+)/,
    /不对/,
    /改(?:成|为)/,
    /应该是/,
    /其实(?:是)/,
    /不叫/,
    /换个/,
    /重新/,
  ];
  return patterns.some((p) => p.test(input));
}

export function detectConflict(input: string): boolean {
  return /算了|不写了|换个方向|换个主题|重新来|推翻|全部重来/.test(input);
}

export function detectTempIdea(input: string): boolean {
  return /也许|可能|或者|试试|假如|如果|暂时|先看看/.test(input);
}

export function extractCorrectionField(input: string): string | undefined {
  const match = input.match(
    /(?:不是|改|应该是|其实)(?:关于)?(.+?)(?:[，。！？]|而是|改成|应该是|是)/,
  );
  return match?.[1]?.trim();
}

export function extractNewValue(input: string): string {
  const match = input.match(/(?:而是|改成|应该是|叫)(.+?)(?:[，。！？]|$)/);
  return match?.[1]?.trim() || '';
}

export function extractConflictInfo(_input: string): Record<string, string> | undefined {
  return { intent_changed: 'true' };
}
