/**
 * Style Predictor — predicts user preferences from style vector.
 * Used by Question Agent to bias question generation toward the user's style.
 */

import { styleVectorStore, type StyleSnapshot } from './style-vector-store';

export interface StylePrediction {
  /** Predicted probabilities for each option */
  optionProbs: number[];
  /** The most likely option index */
  mostLikely: number;
  /** Confidence in the prediction (0-1) */
  confidence: number;
  /** Style snapshot at prediction time */
  styleSnapshot: StyleSnapshot;
  /** Suggestions for question wording based on style */
  wordingHints: string[];
}

/**
 * Predict which options the user is most likely to choose.
 */
export function predictUserChoices(options: string[]): StylePrediction {
  const probs = styleVectorStore.predictChoices(options);
  const mostLikely = probs.indexOf(Math.max(...probs));
  const snapshot = styleVectorStore.getSnapshot();

  // Generate wording hints based on style
  const wordingHints: string[] = [];

  if (snapshot.topTechniques.length > 0) {
    const topTech = snapshot.topTechniques[0].technique;
    wordingHints.push(`用户偏好使用：${topTech}`);
  }

  if (snapshot.topAttentionTargets.length > 0) {
    const topTarget = snapshot.topAttentionTargets[0].target;
    wordingHints.push(`用户关注点：${topTarget}`);
  }

  return {
    optionProbs: probs,
    mostLikely,
    confidence: snapshot.confidence,
    styleSnapshot: snapshot,
    wordingHints,
  };
}

/**
 * Record that the user chose a specific option.
 * Updates the style vector and returns learning metrics.
 */
export function recordUserChoice(
  question: string,
  options: string[],
  actualChoice: number,
  predictedProbs: number[],
): { error: number; confidenceChange: number } {
  const prevConfidence = styleVectorStore.getSnapshot().confidence;

  styleVectorStore.recordChoice({
    question,
    options,
    predictedProbs,
    actualChoice,
    timestamp: Date.now(),
  });

  const newConfidence = styleVectorStore.getSnapshot().confidence;

  return {
    error: 1 - (predictedProbs[actualChoice] || 0),
    confidenceChange: newConfidence - prevConfidence,
  };
}

/**
 * Format style context for injection into LLM prompts.
 * Used by Question Agent and Writing Agent.
 */
export function formatStyleContext(): string {
  const snap = styleVectorStore.getSnapshot();

  const parts: string[] = [];
  parts.push(
    `[风格置信度: ${(snap.confidence * 100).toFixed(0)}% | 已学习 ${snap.totalChoices} 次选择]`,
  );

  if (snap.topAttentionTargets.length > 0) {
    parts.push(
      `关注焦点: ${snap.topAttentionTargets
        .slice(0, 3)
        .map((t) => t.target)
        .join('、')}`,
    );
  }

  if (snap.topTechniques.length > 0) {
    parts.push(
      `写作手法: ${snap.topTechniques
        .slice(0, 3)
        .map((t) => t.technique)
        .join('、')}`,
    );
  }

  if (snap.topAssociations.length > 0) {
    parts.push(
      `联想模式: ${snap.topAssociations
        .slice(0, 3)
        .map((a) => a.concept)
        .join('→')}`,
    );
  }

  return parts.join('\n');
}
