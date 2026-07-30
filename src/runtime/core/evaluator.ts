import type { RuntimeState } from './runtime-state';
import { recordEvent } from './runtime-state';

export interface Evaluation {
  /** Was the agent execution successful? */
  success: boolean;
  /** Should we continue the loop or stop? */
  shouldContinue: boolean;
  /** What changed in the understanding */
  changes: string[];
  /** What the next phase should be */
  suggestedPhase?: string;
}

/**
 * Evaluate: assess the result of an agent execution and update state.
 */
export function evaluate(
  state: RuntimeState,
  agentId: string,
  action: string,
  result: unknown,
): Evaluation {
  const changes: string[] = [];

  // Record the execution
  recordEvent(state, {
    type: 'AGENT_EXECUTED',
    agent: agentId,
    action,
    result: typeof result === 'string' ? result.slice(0, 50) : 'done',
  });

  // Evaluate based on agent and action
  switch (`${agentId}.${action}`) {
    case 'discovery.initialize': {
      changes.push('已分析用户意图');
      state.intent.confidence = Math.min(state.intent.confidence + 0.2, 0.9);
      break;
    }
    case 'discovery.ask_next': {
      changes.push('已向用户提问');
      break;
    }
    case 'discovery.answer_received': {
      changes.push('已接收用户回答');
      if (state.understanding.unknowns.length > 0) {
        state.understanding.unknowns.shift(); // Remove the addressed unknown
      }
      state.intent.confidence = Math.min(state.intent.confidence + 0.15, 1.0);
      break;
    }
    case 'architect.generate_structure': {
      changes.push('已生成作品结构');
      state.phase = 'writing';
      break;
    }
    case 'scribe.generate': {
      changes.push('已生成内容');
      break;
    }
    case 'review.review': {
      changes.push('已完成审查');
      state.phase = 'publish';
      break;
    }
    default: {
      changes.push(`已执行: ${agentId}.${action}`);
    }
  }

  // Decide whether to continue
  const shouldContinue = state.phase !== 'publish';

  return {
    success: true,
    shouldContinue,
    changes,
    suggestedPhase: state.phase,
  };
}
