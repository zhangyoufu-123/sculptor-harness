/**
 * Completion Assessor — determines if understanding is sufficient.
 *
 * Not a simple confidence threshold. Evaluates MULTIPLE dimensions:
 * 1. Core identity: do we know what type of work this is?
 * 2. Topic clarity: is the central topic well-defined?
 * 3. Audience understanding: do we know who this is for?
 * 4. Purpose clarity: do we know WHY they're creating this?
 * 5. Depth sufficiency: have we explored enough detail?
 * 6. Interaction quality: has the user had enough chance to clarify?
 */

import type { BeliefState } from './belief-revision';

export interface CompletionAssessment {
  /** Overall: is understanding sufficient to proceed? */
  isReady: boolean;
  /** Individual dimension scores (0-1) */
  dimensions: {
    artifactClarity: number;
    topicClarity: number;
    audienceClarity: number;
    purposeClarity: number;
    depthSufficiency: number;
    interactionSufficiency: number;
  };
  /** Weighted overall score (0-1) */
  overallScore: number;
  /** What's still missing */
  gaps: string[];
  /** Recommended action */
  recommendation: 'ask_more' | 'generate_outline' | 'proceed_to_writing';
  /** How many more interactions are recommended */
  suggestedRemainingRounds: number;
}

/**
 * Assess whether the current belief state is complete enough.
 *
 * Key principle: the AI should dynamically determine how many rounds
 * of interaction are needed — NOT a fixed 1-2 question limit.
 */
export function assessCompletion(
  belief: BeliefState,
  _conversationHistory?: string,
): CompletionAssessment {
  // Future hook: conversation history length can inform interaction quality
  void (_conversationHistory as string | undefined);

  // Dimension 1: Artifact clarity (30% weight)
  const artifactClarity = assessArtifactClarity(belief);

  // Dimension 2: Topic clarity (25% weight)
  const topicClarity = assessTopicClarity(belief);

  // Dimension 3: Audience clarity (15% weight)
  const audienceClarity = assessAudienceClarity(belief);

  // Dimension 4: Purpose clarity (15% weight)
  const purposeClarity = assessPurposeClarity(belief);

  // Dimension 5: Depth sufficiency (10% weight)
  const depthSufficiency = assessDepth(belief);

  // Dimension 6: Interaction sufficiency (5% weight)
  const interactionSufficiency = assessInteraction(belief);

  // Weighted overall score
  const overallScore =
    artifactClarity * 0.3 +
    topicClarity * 0.25 +
    audienceClarity * 0.15 +
    purposeClarity * 0.15 +
    depthSufficiency * 0.1 +
    interactionSufficiency * 0.05;

  // Identify gaps
  const gaps = identifyGaps(belief, artifactClarity, topicClarity, audienceClarity, purposeClarity);

  // Determine readiness
  const isReady = overallScore >= 0.65 && gaps.length <= 2;

  // Recommendation
  let recommendation: CompletionAssessment['recommendation'];
  if (overallScore >= 0.8 && gaps.length === 0) {
    recommendation = 'proceed_to_writing';
  } else if (overallScore >= 0.65) {
    recommendation = 'generate_outline';
  } else {
    recommendation = 'ask_more';
  }

  // Suggested remaining rounds based on gap severity
  const suggestedRemainingRounds = Math.min(gaps.length, 4);

  return {
    isReady,
    dimensions: {
      artifactClarity,
      topicClarity,
      audienceClarity,
      purposeClarity,
      depthSufficiency,
      interactionSufficiency,
    },
    overallScore,
    gaps,
    recommendation,
    suggestedRemainingRounds,
  };
}

// =========================================================================
// Dimension Assessors
// =========================================================================

function assessArtifactClarity(belief: BeliefState): number {
  const { artifact } = belief;
  // High confidence + user confirmed = high clarity
  if (artifact.confidence > 0.8) return 0.95;
  if (artifact.confidence > 0.6) return 0.75;
  if (artifact.confidence > 0.4 && artifact.evidence.length >= 2) return 0.6;
  if (artifact.confidence > 0.3) return 0.4;
  return 0.2; // Still unknown
}

function assessTopicClarity(belief: BeliefState): number {
  const { topic } = belief;
  // Topic is clear when confidence is high AND the topic is specific (not generic)
  const isSpecific = topic.value.length > 5 && !topic.value.includes('未知');
  if (topic.confidence > 0.8 && isSpecific) return 0.95;
  if (topic.confidence > 0.6 && isSpecific) return 0.75;
  if (topic.confidence > 0.4) return 0.5;
  return 0.3;
}

function assessAudienceClarity(belief: BeliefState): number {
  const { audience } = belief;
  if (audience.confidence > 0.8) return 0.95;
  if (audience.confidence > 0.5) return 0.7;
  if (audience.confidence > 0.3) return 0.45;
  return 0.2; // Don't know audience yet
}

function assessPurposeClarity(belief: BeliefState): number {
  const { intent } = belief;
  if (intent.confidence > 0.8) return 0.95;
  if (intent.confidence > 0.5) return 0.7;
  if (intent.confidence > 0.3) return 0.45;
  return 0.2;
}

function assessDepth(belief: BeliefState): number {
  // Depth = how many specific details we've gathered
  const detailSignals = [
    belief.artifact.evidence.length >= 2,
    belief.intent.alternatives.length >= 2,
    belief.misunderstandings.length > 0, // Corrections = deeper understanding
    belief.roundCount >= 2, // Multiple interactions
  ];
  return detailSignals.filter(Boolean).length / detailSignals.length;
}

function assessInteraction(belief: BeliefState): number {
  // Users need at least 1-2 rounds to clarify, but not too many
  if (belief.roundCount >= 3) return 1.0;
  if (belief.roundCount >= 2) return 0.85;
  if (belief.roundCount >= 1) return 0.5;
  return 0.2;
}

// =========================================================================
// Gap Identification
// =========================================================================

function identifyGaps(
  belief: BeliefState,
  artifactClarity: number,
  topicClarity: number,
  audienceClarity: number,
  purposeClarity: number,
): string[] {
  const gaps: string[] = [];

  if (artifactClarity < 0.5) gaps.push('作品类型不够明确');
  if (topicClarity < 0.5) gaps.push('核心主题需要进一步明确');
  if (audienceClarity < 0.5) gaps.push('目标读者不够清晰');
  if (purposeClarity < 0.5) gaps.push('创作目的需要澄清');

  // Additional gap: do we know the angle/direction?
  if (belief.intent.alternatives.length === 0 && belief.intent.confidence < 0.7) {
    gaps.push('创作角度/切入点未确定');
  }

  // Do we have enough concrete details?
  if (belief.artifact.evidence.length < 2 && belief.roundCount >= 2) {
    gaps.push('需要更多具体细节来支撑理解');
  }

  return gaps;
}
