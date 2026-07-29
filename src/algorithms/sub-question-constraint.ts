// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionContext {
  dimension: string;
  attemptCount: number;
  userResponses: string[]; // Previous answers
  originalQuestion: string;
  informationGain: number; // 0-1 how much new info was gained
}

type TerminationCondition = 'max_attempts' | 'low_willingness' | 'low_gain';
type SuggestedAction = 'ask_next' | 'mark_assumed' | 'skip_dimension';

interface ConstraintResult {
  shouldContinue: boolean;
  reason: string;
  terminationCondition: TerminationCondition | null;
  suggestedAction: SuggestedAction;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of sub-question rounds before termination. */
const MAX_ATTEMPTS = 2;

/** Information gain below which the sub-question loop is considered stale. */
const MIN_INFORMATION_GAIN = 0.3;

/** Keywords that indicate the user has low willingness to engage. */
const LOW_WILLINGNESS_SIGNALS: readonly string[] = [
  '随便',
  '都可以',
  '你决定',
  '不重要',
  '无所谓',
  '不知道',
  '没想法',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dynamic sub-question termination logic.
 *
 * Evaluates the current questioning context against three termination
 * conditions. ANY condition being met triggers stop:
 *
 *   1. `attemptCount >= MAX_ATTEMPTS` (2)
 *   2. User shows low willingness (detected via keyword matching)
 *   3. Information gain below threshold (< 0.3)
 *
 * @param context - The current sub-question context including attempt count,
 *                  user responses, and measured information gain.
 * @returns A constraint result indicating whether to continue and what
 *          action to take next.
 */
function evaluateConstraints(context: QuestionContext): ConstraintResult {
  // Condition 1: max attempts reached
  if (context.attemptCount >= MAX_ATTEMPTS) {
    return {
      shouldContinue: false,
      reason: `已达到最大追问次数 (${MAX_ATTEMPTS})。`,
      terminationCondition: 'max_attempts',
      suggestedAction: 'mark_assumed',
    };
  }

  // Condition 2: low willingness detected in any user response
  for (const response of context.userResponses) {
    if (detectLowWillingness(response)) {
      return {
        shouldContinue: false,
        reason: '检测到用户回应意愿较低，停止追问。',
        terminationCondition: 'low_willingness',
        suggestedAction: 'skip_dimension',
      };
    }
  }

  // Condition 3: information gain below threshold
  if (context.informationGain < MIN_INFORMATION_GAIN) {
    return {
      shouldContinue: false,
      reason: `信息增益 (${context.informationGain.toFixed(2)}) 低于阈值 (${MIN_INFORMATION_GAIN})。`,
      terminationCondition: 'low_gain',
      suggestedAction: 'mark_assumed',
    };
  }

  // All conditions pass — continue asking
  return {
    shouldContinue: true,
    reason: '所有条件均未触发，继续追问。',
    terminationCondition: null,
    suggestedAction: 'ask_next',
  };
}

/**
 * Detect low willingness signals in a user response.
 *
 * Matches the response against a predefined list of Chinese keywords that
 * indicate the user is unwilling or unable to provide meaningful input.
 *
 * @param response - The user's response string.
 * @returns `true` if a low-willingness signal is detected.
 */
function detectLowWillingness(response: string): boolean {
  return LOW_WILLINGNESS_SIGNALS.some((signal) => response.includes(signal));
}

export { evaluateConstraints, detectLowWillingness };
export type { QuestionContext, ConstraintResult, TerminationCondition, SuggestedAction };
