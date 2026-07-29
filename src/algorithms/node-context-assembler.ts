import { PCSState } from '@/pcs/types';

interface AdhesionCheckResult {
  hasAdhesion: boolean;
  similarityScore: number;
  previousNodeId?: string;
  nextNodeId?: string;
  previousNodeGoal?: string;
  nextNodeGoal?: string;
  suggestion: 'different_angle' | 'direct_transition' | 'keep_original';
}

// Check for adhesion (goal overlap) between adjacent nodes
// BI-DIRECTIONAL: check both previous and next node
function checkAdhesion(state: PCSState, nodeId: string): AdhesionCheckResult {
  const sections = state.structure.sections;
  const idx = sections.findIndex((s) => s.id === nodeId);
  const node = sections[idx];
  const previous = idx > 0 ? sections[idx - 1] : undefined;
  const next = idx < sections.length - 1 ? sections[idx + 1] : undefined;

  // V1: simple keyword overlap similarity
  const prevSimilarity = previous ? calculateSimilarity(node.goal, previous.goal) : 0;
  const nextSimilarity = next ? calculateSimilarity(node.goal, next.goal) : 0;
  const maxSimilarity = Math.max(prevSimilarity, nextSimilarity);

  return {
    hasAdhesion: maxSimilarity > 0.7,
    similarityScore: maxSimilarity,
    previousNodeId: prevSimilarity > 0.7 ? previous?.id : undefined,
    nextNodeId: nextSimilarity > 0.7 ? next?.id : undefined,
    previousNodeGoal: previous?.goal,
    nextNodeGoal: next?.goal,
    suggestion: maxSimilarity > 0.7 ? 'different_angle' : 'keep_original',
  };
}

// Check if a node is "giant" (estimated content > 800 chars)
function checkGiantNode(
  state: PCSState,
  nodeId: string,
): { isGiant: boolean; estimatedLength: number; suggestedParts: number } {
  const node = state.structure.sections.find((s) => s.id === nodeId);
  if (!node) return { isGiant: false, estimatedLength: 0, suggestedParts: 0 };

  const estimatedLength = node.goal.length * 15; // rough heuristic
  const isGiant = estimatedLength > 800;

  return {
    isGiant,
    estimatedLength,
    suggestedParts: isGiant ? Math.min(Math.ceil(estimatedLength / 400), 4) : 0,
  };
}

// Simple keyword-based similarity (V1 approximation of semantic similarity)
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/[\s，。、；：""''！？\n]+/).filter((w) => w.length > 1));
  const words2 = new Set(text2.split(/[\s，。、；：""''！？\n]+/).filter((w) => w.length > 1));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  words1.forEach((word) => {
    if (words2.has(word)) intersection++;
  });

  return intersection / Math.max(words1.size, words2.size);
}

export { checkAdhesion, checkGiantNode, calculateSimilarity };
export type { AdhesionCheckResult };
