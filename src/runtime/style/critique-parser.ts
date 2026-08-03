/**
 * Critique Parser — converts structured critique JSON into training signals
 * that feed back into the 3D style vector.
 */

/* eslint-disable no-console */
import { styleVectorStore } from './style-vector-store';
import type { StructuredCritique, Dimension1Correction } from '@/agents/cluster/style-critic-agent';

// ─── Training Signal Types ────────────────────────────────────

export interface TrainingSignal {
  /** What dimension of the vector to update */
  dimension: 1 | 2 | 3;
  /** The option text to embed as training data */
  optionText: string;
  /** The alternative that was REJECTED (for contrastive learning) */
  rejectedText?: string;
  /** Learning rate multiplier (1 = normal, >1 = aggressive) */
  weight: number;
  /** Human-readable reason */
  reason: string;
}

// ─── Parser ──────────────────────────────────────────────────

/**
 * Convert a StructuredCritique (from LLM) into a list of TrainingSignals
 * that can be fed to StyleVectorStore for vector correction.
 */
export function critiqueToSignals(
  critique: StructuredCritique,
  _originalText: string,
): TrainingSignal[] {
  const signals: TrainingSignal[] = [];

  // ── D1 Corrections → Personal Dataset signals ──────────
  for (const correction of critique.d1Corrections) {
    // Positive signal: train toward the target characteristic
    signals.push({
      dimension: 1,
      optionText: generatePositiveExample(correction),
      rejectedText: generateNegativeExample(correction),
      weight: correction.severity * 1.5, // Higher weight for severe issues
      reason: `D1: ${correction.feature} → ${correction.targetCharacteristic}`,
    });
  }

  // ── D2 Deviations → Deviation correction signals ───────
  for (const dev of critique.d2Deviations) {
    const gap = Math.abs(dev.targetValue - dev.currentValue);
    if (gap > 0.2) {
      // Significant deviation — train correction
      signals.push({
        dimension: 2,
        optionText: `写作应偏向：${dev.aspect}(${dev.targetValue > 0 ? '增加' : '减少'})`,
        weight: gap * 2,
        reason: `D2: ${dev.aspect}偏离 ${gap.toFixed(2)} — ${dev.reason}`,
      });
    }
  }

  // ── D3 Shifts → Attention focus adjustments ────────────
  for (const shift of critique.d3Shifts) {
    // Reduce attention to 'from'
    signals.push({
      dimension: 3,
      optionText: shift.from,
      weight: -Math.abs(shift.adjustment), // Negative = reduce
      reason: `D3: 减少关注"${shift.from}"`,
    });

    // Increase attention to 'to'
    signals.push({
      dimension: 3,
      optionText: shift.to,
      weight: Math.abs(shift.adjustment), // Positive = increase
      reason: `D3: 增加关注"${shift.to}"`,
    });
  }

  // ── Top improvements → weighted reinforcement ─────────
  for (let i = 0; i < critique.topImprovements.length; i++) {
    const improvement = critique.topImprovements[i];
    const importanceWeight = (3 - i) / 3; // First = 1.0, second = 0.67, third = 0.33

    signals.push({
      dimension: 1,
      optionText: `改进方向：${improvement}`,
      weight: importanceWeight * 1.2,
      reason: `Top improvement #${i + 1}: ${improvement}`,
    });
  }

  return signals;
}

/**
 * Apply training signals to the style vector store.
 * Each signal is treated as a "virtual user choice" — the option text
 * is embedded and used to update the vector.
 */
export function applySignals(signals: TrainingSignal[]): void {
  let applied = 0;
  let skipped = 0;

  for (const signal of signals) {
    if (signal.weight >= -0.05 && signal.weight <= 0.05) {
      skipped++;
      continue;
    }

    // Convert signal into a pseudo choice record
    const options = [signal.optionText];
    if (signal.rejectedText) {
      options.push(signal.rejectedText);
    }

    const actualChoice = 0; // Always choose the positive example

    // Adjust learning rate based on weight
    const predictedProbs = options.map(() => 1 / options.length);

    // For dimension 3 negative signals (reduce attention),
    // we simulate "not choosing" this option by recording a low-prob choice
    if (signal.weight < 0) {
      // Negative signal: treat as if we predicted high but user didn't choose it
      const adjustedProbs = [0.9]; // Predicted high
      styleVectorStore.recordChoice({
        question: signal.reason,
        options: [signal.optionText],
        predictedProbs: adjustedProbs,
        actualChoice: 0,
        timestamp: Date.now(),
      });
    } else {
      // Positive signal: standard choice recording
      styleVectorStore.recordChoice({
        question: signal.reason,
        options,
        predictedProbs,
        actualChoice,
        timestamp: Date.now(),
      });
    }

    applied++;
  }

  console.log(`[CritiqueParser] Applied ${applied} signals, skipped ${skipped} (low weight)`);
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Generate a positive example text that embodies the target characteristic.
 * E.g., correction "sentence_length → terse_dry" → "用短句，砍掉修饰，如风干的肉"
 */
function generatePositiveExample(correction: Dimension1Correction): string {
  return `偏向"${correction.targetCharacteristic}"而非"${correction.currentTendency}"——${correction.feature}`;
}

/**
 * Generate a negative example text that represents the problematic tendency.
 */
function generateNegativeExample(correction: Dimension1Correction): string {
  return `避免"${correction.currentTendency}"——${correction.feature}`;
}
