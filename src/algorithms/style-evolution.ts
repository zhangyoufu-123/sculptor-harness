import { isTrainingSampleWorthy, extractStyleLabels } from '@/pcs/training-data';
import { trainingDataStore, type StyleTrainingSample } from '@/pcs/training-data';
import { creativeSignalLog, type SignalType } from '@/pcs/creative-signal-log';

export type EvolutionLevel = 'L1_low_risk' | 'L1_high_risk' | 'L2' | 'L3';

export interface StyleChange {
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  level: EvolutionLevel;
  autoApply: boolean;
  reason: string;
}

export function analyzeStyleChange(
  field: string,
  currentValue: unknown,
  newValue: unknown,
  context: { occurrenceCount: number; consistencyScore: number },
): StyleChange {
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

export function classifyChangeLevel(
  field: string,
  context: { occurrenceCount: number; consistencyScore: number },
): EvolutionLevel {
  if (field === 'tone') return 'L1_high_risk';
  if (field === 'voice') return 'L2';
  if (field === 'style_reference' || field === 'thinking_reference') return 'L3';
  if (field === 'avoid' && context.consistencyScore > 0.7) return 'L1_low_risk';
  return 'L1_high_risk';
}

export function canAutoApply(change: StyleChange): boolean {
  return change.level === 'L1_low_risk';
}

export function recordTrainingSample(params: {
  prompt: string;
  aiResponse: string;
  userCorrection: string;
  tone: string;
  projectId: string;
  nodeId: string;
  wasExplicitStyleOp: boolean;
}): StyleTrainingSample | null {
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

export function recordCreativeSignal(params: {
  projectId: string;
  nodeId: string;
  signalType: SignalType;
  original: string;
  modified: string;
  detectedPreference: string;
  confidence: number;
  autoApplied: boolean;
}): void {
  creativeSignalLog.record({
    project_id: params.projectId,
    node_id: params.nodeId,
    signal_type: params.signalType,
    pattern: {
      original: params.original,
      modified: params.modified,
      detected_preference: params.detectedPreference,
      confidence: params.confidence,
    },
    auto_applied: params.autoApplied,
  });
}
