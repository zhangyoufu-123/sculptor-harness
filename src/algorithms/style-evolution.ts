import { isTrainingSampleWorthy, extractStyleLabels } from '@/pcs/training-data';
import { trainingDataStore, type StyleTrainingSample } from '@/pcs/training-data';

type EvolutionLevel = 'L1_low_risk' | 'L1_high_risk' | 'L2' | 'L3';

interface StyleChange {
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  level: EvolutionLevel;
  autoApply: boolean; // true = apply without confirmation (L1 low risk only)
  reason: string;
}

// Style Evolution system with 3-level classification:
// L1 low-risk (word frequency, punctuation): auto-apply
// L1 high-risk (sentence pattern shift): proposal, user confirm
// L2/L3 (structural preference, thinking style): V1 forbids
function analyzeStyleChange(
  field: string,
  currentValue: unknown,
  newValue: unknown,
  context: { occurrenceCount: number; consistencyScore: number },
): StyleChange {
  // Classify the change level
  const level = classifyChangeLevel(field, context);

  return {
    field,
    currentValue,
    suggestedValue: newValue,
    level,
    autoApply: level === 'L1_low_risk',
    reason: `基于${context.occurrenceCount}次出现的风格模式`,
  };
}

function classifyChangeLevel(
  field: string,
  context: { occurrenceCount: number; consistencyScore: number },
): EvolutionLevel {
  // Tone-related: always L1 high-risk (needs proposal)
  if (field === 'tone') return 'L1_high_risk';
  // Voice/persona: L2 (forbidden in V1)
  if (field === 'voice') return 'L2';
  // Style reference: L3 (forbidden in V1)
  if (field === 'style_reference' || field === 'thinking_reference') return 'L3';
  // Avoid list additions: L1 low-risk if high consistency
  if (field === 'avoid' && context.consistencyScore > 0.7) return 'L1_low_risk';
  void context.occurrenceCount; // referenced for exhaustiveness
  return 'L1_high_risk';
}

// Check if a change is allowed to be auto-applied
function canAutoApply(change: StyleChange): boolean {
  return change.level === 'L1_low_risk';
}

/**
 * Record a training sample when user significantly edits AI-generated content.
 * Called during Phase 4 after user modifies a node.
 *
 * Only records HIGH-VALUE samples:
 * - User rewrote >50% of AI content
 * - User explicitly triggered a tone/style operation
 */
export function recordTrainingSample(params: {
  prompt: string;
  aiResponse: string;
  userCorrection: string;
  tone: string;
  projectId: string;
  nodeId: string;
  wasExplicitStyleOp: boolean;
}): StyleTrainingSample | null {
  // Only record high-value edits
  if (
    !isTrainingSampleWorthy(params.aiResponse, params.userCorrection, params.wasExplicitStyleOp)
  ) {
    return null;
  }

  const sample: StyleTrainingSample = {
    id: `sample-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    prompt: params.prompt,
    ai_response: params.aiResponse,
    user_correction: params.userCorrection,
    style_labels: extractStyleLabels(params.userCorrection, params.tone),
    timestamp: new Date().toISOString(),
    project_id: params.projectId,
    node_id: params.nodeId,
  };

  trainingDataStore.addSample(params.projectId, sample);
  return sample;
}

/**
 * Get training readiness status for a project.
 */
export function getTrainingReadiness(projectId: string): {
  totalSamples: number;
  isReady: boolean;
  samplesNeeded: number;
} {
  const samples = trainingDataStore.getSamples(projectId);
  return {
    totalSamples: samples.length,
    isReady: trainingDataStore.isReadyForTraining(projectId),
    samplesNeeded: Math.max(0, 500 - samples.length),
  };
}

export { analyzeStyleChange, classifyChangeLevel, canAutoApply };
export type { StyleChange, EvolutionLevel };
