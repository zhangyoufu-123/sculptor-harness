import { PCSState, GenerationPlan, StructureSection } from '@/pcs/types';

// Split into two steps:
// Step 1: Node Context Assembler - collects context needed for a node
// Step 2: Generation Plan Generator - creates the execution plan

interface NodeContext {
  node: StructureSection;
  previousNodeGoal?: string;
  previousNodeLastSentence?: string;
  nextNodeGoal?: string;
  requiredTopics: string[];
  toneDescription: string;
  avoidList: string[];
  styleReference: string;
  audienceContext: string;
}

// Step 1: Assemble context for a node
function assembleNodeContext(state: PCSState, nodeId: string): NodeContext {
  const sections = state.structure.sections;
  const nodeIndex = sections.findIndex((s) => s.id === nodeId);
  const node = sections[nodeIndex];
  const previous = nodeIndex > 0 ? sections[nodeIndex - 1] : undefined;
  const next = nodeIndex < sections.length - 1 ? sections[nodeIndex + 1] : undefined;

  return {
    node,
    previousNodeGoal: previous?.goal,
    previousNodeLastSentence: getLastSentence(previous?.content_draft),
    nextNodeGoal: next?.goal,
    requiredTopics: state.knowledge.required_topics
      .filter((t) => t.section_id === nodeId && !t.covered)
      .map((t) => t.topic),
    toneDescription: state.expression.tone.value,
    avoidList: state.expression.avoid.value,
    styleReference: state.expression.style_reference.value,
    audienceContext: state.audience.audience_type.value,
  };
}

// Step 2: Generate execution plan
function generatePlan(state: PCSState, nodeId: string): GenerationPlan {
  const node = state.structure.sections.find((s) => s.id === nodeId)!;
  const context = assembleNodeContext(state, nodeId);
  const estimatedLength = estimateNodeLength(node);

  // Generate internal substructure for large nodes (>800 chars)
  const substructure =
    estimatedLength > 800 ? generateSubstructure(node.goal, estimatedLength) : [];

  return {
    node_id: nodeId,
    goal_summary: node.goal,
    suggested_substructure: substructure,
    estimated_length: estimatedLength,
    required_topics: context.requiredTopics,
    tone_instruction: `以${context.toneDescription}的语气写作`,
    avoid_instruction: `避免：${context.avoidList.join('、')}`,
    transition_from: context.previousNodeGoal || '（这是文章开头）',
    transition_to: context.nextNodeGoal || '（这是文章结尾）',
    created_at: new Date().toISOString(),
    confirmed: false,
  };
}

// Helper: estimate word count for a node
function estimateNodeLength(node: StructureSection): number {
  const goalLength = node.goal.length;
  // Rough heuristic: goal complexity → expected length
  if (
    node.function === 'introduce' ||
    node.function === 'transition' ||
    node.function === 'conclude'
  ) {
    return Math.min(goalLength * 12, 600);
  }
  if (node.function === 'argument' || node.function === 'counter') {
    return Math.min(goalLength * 20, 1500);
  }
  return Math.min(goalLength * 15, 1000);
}

// Generate internal substructure for large nodes
function generateSubstructure(_goal: string, totalLength: number): string[] {
  const count = Math.min(Math.ceil(totalLength / 400), 4);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(`第${i + 1}部分`);
  }
  return parts;
}

// Get the last sentence of a text
function getLastSentence(text?: string): string | undefined {
  if (!text) return undefined;
  const sentences = text.split(/[。！？.!?]/).filter(Boolean);
  return sentences[sentences.length - 1]?.trim();
}

export { assembleNodeContext, generatePlan };
export type { GenerationPlan, NodeContext };
