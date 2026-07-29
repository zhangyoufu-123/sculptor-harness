import { PCSState } from '@/pcs/types';

type RevisionType = 'expression' | 'structure' | 'intent';

interface RevisionImpact {
  type: RevisionType;
  affectedNodes: string[]; // Node IDs that may need update
  affectedFields: string[]; // PCS field paths that may need proposal
  requiresProposal: boolean;
  description: string;
  suggestedActions: string[];
}

// Analyze user's edit to determine its impact scope
// Phase 4: After user modifies a node's content
function analyzeRevision(
  nodeId: string,
  originalContent: string,
  newContent: string,
  state: PCSState,
): RevisionImpact {
  const node = state.structure.sections.find((s) => s.id === nodeId);
  if (!node) {
    return {
      type: 'expression',
      affectedNodes: [],
      affectedFields: [],
      requiresProposal: false,
      description: '节点未找到',
      suggestedActions: [],
    };
  }

  const diffRatio = calculateDiffRatio(originalContent, newContent);

  // Major structural change (>50% diff): type = structure
  if (diffRatio > 0.5) {
    return {
      type: 'structure',
      affectedNodes: [nodeId],
      affectedFields: [],
      requiresProposal: false,
      description: '内容大幅修改，可能影响结构一致性',
      suggestedActions: ['检查与相邻节点的衔接', '考虑更新节点goal'],
    };
  }

  // Intent conflict detection: check if new content contradicts core_message
  if (detectIntentConflict(newContent, state.intent.core_message.value)) {
    return {
      type: 'intent',
      affectedNodes: [],
      affectedFields: ['intent.core_message'],
      requiresProposal: true,
      description: '修改内容与创作意图存在偏差',
      suggestedActions: ['创建Proposal更新意图', '或调整节点内容以对齐意图'],
    };
  }

  // Default: expression-level change
  return {
    type: 'expression',
    affectedNodes: [],
    affectedFields: [],
    requiresProposal: false,
    description: '局部表达修改，不影响整体结构',
    suggestedActions: [],
  };
}

// Calculate rough diff ratio (V1: simple character-level)
function calculateDiffRatio(original: string, modified: string): number {
  if (original.length === 0) return modified.length > 0 ? 1 : 0;
  const changes = Math.abs(original.length - modified.length);
  return Math.min(changes / original.length, 1);
}

// V1: keyword-based intent conflict detection
function detectIntentConflict(_content: string, _coreMessage: string): boolean {
  // Extract key terms from core_message
  // Check if content contains negation of key terms
  // Simple heuristic: if content is very short vs core_message, potential conflict
  // For V1, this is a placeholder for semantic analysis
  return false; // Placeholder - actual semantic analysis in V2+
}

/**
 * Check if a user edit qualifies for training sample collection.
 * Called by scribe-agent after revision impact analysis.
 */
export function shouldRecordTrainingSample(
  originalContent: string,
  newContent: string,
  revisionType: RevisionType,
  wasExplicitStyleOp: boolean,
): boolean {
  // Expression-level edits with explicit style ops → always record
  if (wasExplicitStyleOp) return true;

  // Major rewrites of any type → record
  const diffRatio = calculateDiffRatio(originalContent, newContent);
  if (diffRatio > 0.5) return true;

  // Intent-level changes → record (high signal for style drift)
  if (revisionType === 'intent') return true;

  return false;
}

export { analyzeRevision };
export type { RevisionImpact, RevisionType };
