import type { RuntimeState } from './runtime-state';

export interface Observation {
  /** What kind of input this is */
  type: 'idea' | 'answer' | 'correction' | 'command' | 'question' | 'affirmation';
  /** The raw text */
  content: string;
  /** Extracted information */
  extracted?: Record<string, string>;
}

/**
 * Observe: classify the user's input and update the RuntimeState.
 */
export function observe(input: string, state: RuntimeState): Observation {
  // Classify input type
  const type = classifyInputType(input);

  // Extract signals
  const extracted = type === 'idea' ? extractFromIdea(input) : undefined;

  // Update state
  if (type === 'idea') {
    state.intent.raw = input;
    state.intent.interpreted = input;
    state.intent.confidence = 0.4;
  }

  return { type, content: input, extracted };
}

function classifyInputType(input: string): Observation['type'] {
  if (input.startsWith('/')) return 'command';
  if (['是', '对', '好', '确认', 'ok', 'yes'].includes(input.trim())) return 'affirmation';
  if (input.includes('?') || input.includes('？')) return 'question';
  if (/不是|不对|改|应该是/.test(input)) return 'correction';
  if (input.length > 20) return 'idea';
  return 'answer';
}

function extractFromIdea(input: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Creative type signals
  if (input.includes('小说')) result.creativeType = 'fiction';
  if (input.includes('论文') || input.includes('研究')) result.creativeType = 'research';
  if (input.includes('报告') || input.includes('计划')) result.creativeType = 'business';
  if (input.includes('文章') || input.includes('写')) result.creativeType = 'essay';

  return result;
}
