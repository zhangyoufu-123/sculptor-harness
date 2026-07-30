import type { IRuntimeContextBuilder, NodeRuntimeContext } from './domain-events';
import type { PCSState, StructureSection } from '@/pcs/types';
import { detectSignals, type ContextSignal, type ContextSignalType } from './context-signal-types';

/**
 * Assembles standardized NodeRuntimeContext from PCS state.
 * Replaces ad-hoc prompt variable assembly in individual agents.
 *
 * Scribe Agent receives this — never assembles context on its own.
 */
export class RuntimeContextBuilder implements IRuntimeContextBuilder {
  buildNodeContext(pcs: PCSState, nodeId: string): NodeRuntimeContext {
    const sections = pcs.structure.sections;
    const nodeIndex = sections.findIndex((s) => s.id === nodeId);
    const node = sections[nodeIndex];

    if (!node) {
      return this.buildEmptyContext(nodeId);
    }

    const previous = nodeIndex > 0 ? sections[nodeIndex - 1] : undefined;
    const next = nodeIndex < sections.length - 1 ? sections[nodeIndex + 1] : undefined;

    return {
      node: {
        id: node.id,
        goal: node.goal,
        function: node.function,
        title: node.title,
        hardness: node.hardness,
        estimatedLength: this.estimateLength(node),
        draftState: node.draft_state,
      },
      intent: {
        purpose: pcs.intent.purpose.value,
        coreMessage: pcs.intent.core_message.value,
        desiredImpact: pcs.intent.desired_impact.value,
      },
      audience: {
        audienceType: pcs.audience.audience_type.value,
        knowledgeLevel: pcs.audience.knowledge_level.value,
        painPoints: pcs.audience.pain_points.value,
      },
      style: {
        tone: pcs.expression.tone.value,
        avoid: pcs.expression.avoid.value,
        styleReference: pcs.expression.style_reference.value,
        formatReference: pcs.expression.format_reference.value,
      },
      constraints: {
        format: pcs.constraint.format.value,
        lengthMin: pcs.constraint.length_min.value,
        lengthMax: pcs.constraint.length_max.value,
      },
      adjacentNodes: {
        previous: previous
          ? {
              id: previous.id,
              goal: previous.goal,
              lastSentence: this.getLastSentence(previous.content_draft),
            }
          : undefined,
        next: next ? { id: next.id, goal: next.goal } : undefined,
      },
      requiredTopics: pcs.knowledge.required_topics
        .filter((t) => t.section_id === nodeId && !t.covered)
        .map((t) => t.topic),
      revisionHistory: [], // V2: from event store
      globalPhase: pcs.phase,
    };
  }

  buildAssistContext(pcs: PCSState, nodeId: string, _content: string): Partial<NodeRuntimeContext> {
    const full = this.buildNodeContext(pcs, nodeId);
    // For assist mode, only return tier 1+2 fields to save context window
    return {
      intent: full.intent,
      style: full.style,
      audience: full.audience,
      constraints: full.constraints,
      node: { ...full.node, estimatedLength: 0, draftState: full.node.draftState },
      globalPhase: full.globalPhase,
    };
  }

  /**
   * Analyze user input for context signals and return detected changes.
   * Called when user types in the editor (debounced).
   */
  analyzeSignals(userInput: string, nodeId: string, previousContent: string): ContextSignal[] {
    const result = detectSignals(userInput, nodeId, previousContent);
    return result.signals;
  }

  /**
   * Build context that adapts based on detected signals.
   * E.g., if TOPIC_SHIFT detected, exclude current node context.
   */
  buildAdaptiveContext(
    pcs: PCSState,
    nodeId: string,
    signals: ContextSignal[],
  ): NodeRuntimeContext {
    const baseContext = this.buildNodeContext(pcs, nodeId);

    for (const signal of signals) {
      switch (signal.type) {
        case 'TOPIC_SHIFT':
          // Clear node-specific context since topic is changing
          baseContext.node = {
            ...baseContext.node,
            goal: '（主题变更中 — 等待用户确认）',
          };
          break;
        case 'TEMP_REQUEST':
          // User is asking a question, not editing — keep context light
          baseContext.requiredTopics = [];
          baseContext.revisionHistory = [];
          break;
        case 'USER_EVIDENCE':
          // Add user's personal experience to knowledge context
          baseContext.requiredTopics = [...baseContext.requiredTopics, '用户提供的个人经验'];
          break;
        case 'INTENT':
          // Flag that intent may need updating
          baseContext.intent = {
            ...baseContext.intent,
            purpose: '⚠️ 意图可能已变更 — ' + baseContext.intent.purpose,
          };
          break;
        default:
          // Keep existing context
          break;
      }
    }

    return baseContext;
  }

  private buildEmptyContext(nodeId: string): NodeRuntimeContext {
    return {
      node: {
        id: nodeId,
        goal: '',
        function: 'introduce',
        title: '',
        hardness: 'soft' as const,
        estimatedLength: 300,
        draftState: 'empty',
      },
      intent: { purpose: '', coreMessage: '', desiredImpact: '' },
      audience: { audienceType: '', knowledgeLevel: '', painPoints: [] },
      style: { tone: '', avoid: [], styleReference: '', formatReference: '' },
      constraints: { format: '', lengthMin: 0, lengthMax: 0 },
      adjacentNodes: {},
      requiredTopics: [],
      revisionHistory: [],
      globalPhase: 'initializing',
    };
  }

  private estimateLength(node: StructureSection): number {
    const goalLen = node.goal.length;
    if (
      node.function === 'introduce' ||
      node.function === 'transition' ||
      node.function === 'conclude'
    ) {
      return Math.min(goalLen * 12, 600);
    }
    if (node.function === 'argument' || node.function === 'counter') {
      return Math.min(goalLen * 20, 1500);
    }
    return Math.min(goalLen * 15, 1000);
  }

  private getLastSentence(text?: string): string | undefined {
    if (!text) return undefined;
    const sentences = text.split(/[。！？.!?]/).filter(Boolean);
    const last = sentences[sentences.length - 1]?.trim();
    return last || undefined;
  }
}

/** Global singleton */
export const runtimeContextBuilder = new RuntimeContextBuilder();

export type { ContextSignal, ContextSignalType };
