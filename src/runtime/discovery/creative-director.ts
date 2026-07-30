/**
 * Creative Director — judges creative readiness.
 *
 * Not a simple threshold. Evaluates:
 * 1. Is the meaning clear? (hypothesis confidence)
 * 2. Do we have concrete material? (memory assets)
 * 3. Has the emotional arc been defined?
 * 4. Is there a symbolic core?
 * 5. Has the user had enough time to clarify?
 */

import type { CreativeHypothesis } from './hypothesis-generator';

// --- MemoryAsset (local definition; will move to memory-excavator.ts once created) ---

export interface MemoryAsset {
  type: string;
  confirmed: boolean;
}

// --- Creative Director ---

export interface CreativeReadiness {
  /** Can we proceed to outline? */
  canOutline: boolean;
  /** Can we start writing? */
  canWrite: boolean;
  /** Individual scores */
  scores: {
    meaningClarity: number; // How clear is the core meaning?
    materialRichness: number; // How much concrete material exists?
    emotionalClarity: number; // Is the emotional tone defined?
    symbolicCore: number; // Is there a central symbol/metaphor?
    interactionDepth: number; // Has the user had enough rounds?
  };
  /** Weighted overall (0-1) */
  overallScore: number;
  /** What's missing */
  gaps: string[];
  /** Recommendation */
  recommendation:
    | 'explore_meaning'
    | 'excavate_material'
    | 'define_emotion'
    | 'generate_outline'
    | 'start_writing';
}

/**
 * Assess whether the creative process is ready to advance.
 */
export function assessReadiness(
  hypotheses: CreativeHypothesis[],
  memories: MemoryAsset[],
  interactionRounds: number,
  emotionalTarget?: string,
): CreativeReadiness {
  const meaningClarity = assessMeaning(hypotheses);
  const materialRichness = assessMaterial(memories);
  const emotionalClarity = assessEmotion(emotionalTarget);
  const symbolicCore = assessSymbolic(memories);
  const interactionDepth = assessInteraction(interactionRounds);

  const overallScore =
    meaningClarity * 0.35 +
    materialRichness * 0.25 +
    emotionalClarity * 0.2 +
    symbolicCore * 0.1 +
    interactionDepth * 0.1;

  const gaps: string[] = [];
  if (meaningClarity < 0.5) gaps.push('核心意义不够清晰');
  if (materialRichness < 0.5) gaps.push('缺少具体素材和细节');
  if (emotionalClarity < 0.5) gaps.push('情感基调未明确');
  if (symbolicCore < 0.3) gaps.push('缺少核心象征物或隐喻');
  if (interactionDepth < 0.5) gaps.push('交互轮次不足');

  let recommendation: CreativeReadiness['recommendation'];
  if (materialRichness < 0.4 && memories.length < 2) {
    recommendation = 'excavate_material';
  } else if (meaningClarity < 0.5) {
    recommendation = 'explore_meaning';
  } else if (emotionalClarity < 0.4) {
    recommendation = 'define_emotion';
  } else if (overallScore >= 0.65) {
    recommendation = 'generate_outline';
  } else {
    recommendation = 'explore_meaning';
  }

  return {
    canOutline: overallScore >= 0.65,
    canWrite: overallScore >= 0.8 && gaps.length === 0,
    scores: {
      meaningClarity,
      materialRichness,
      emotionalClarity,
      symbolicCore,
      interactionDepth,
    },
    overallScore,
    gaps,
    recommendation,
  };
}

function assessMeaning(hypotheses: CreativeHypothesis[]): number {
  if (hypotheses.length === 0) return 0.2;
  const top = hypotheses[0];
  return Math.min(top.confidence * 1.2, 1.0);
}

function assessMaterial(memories: MemoryAsset[]): number {
  if (memories.length === 0) return 0.1;
  const confirmed = memories.filter((m) => m.confirmed).length;
  const types = new Set(memories.map((m) => m.type)).size;
  return Math.min((confirmed / 3) * 0.5 + (types / 4) * 0.5, 1.0);
}

function assessEmotion(target?: string): number {
  if (!target) return 0.2;
  return target.length > 5 ? 0.7 : 0.4;
}

function assessSymbolic(memories: MemoryAsset[]): number {
  const symbols = memories.filter((m) => m.type === 'symbol');
  if (symbols.length > 0) return 0.8;
  const scenes = memories.filter((m) => m.type === 'scene');
  return scenes.length > 0 ? 0.4 : 0.2;
}

function assessInteraction(rounds: number): number {
  if (rounds >= 4) return 1.0;
  if (rounds >= 3) return 0.8;
  if (rounds >= 2) return 0.5;
  return 0.2;
}
