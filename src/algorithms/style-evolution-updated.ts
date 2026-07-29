import { creativeSignalLog, type SignalType } from '@/pcs/creative-signal-log';

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
