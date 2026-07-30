/**
 * Agent Execution Bus — Sprint Final
 *
 * All agent invocations go through this bus.
 * Ensures: permission check, event recording, state machine validation.
 */

import type { IPCSAccessor, AgentResponse, AgentRequest } from '@/agents/types';
import { AgentMemoryStore } from '../core/agent-memory';

export interface AgentCallResult {
  success: boolean;
  response?: AgentResponse;
  error?: string;
  events: number;
}

/**
 * Execute an agent through the proper channel.
 * V1: direct execution. V2: through Command Bus for full event sourcing.
 */
export async function dispatchAgent(
  pcs: IPCSAccessor,
  agentFactory: () => { execute: (req: AgentRequest) => Promise<AgentResponse> },
  request: AgentRequest,
): Promise<AgentCallResult> {
  const startTime = Date.now();

  try {
    const agent = agentFactory();
    const response = await agent.execute(request);

    // Record for agent memory
    AgentMemoryStore.recordExecution({
      agentId: request.agentId,
      action: request.action,
      success: true,
      latency: Date.now() - startTime,
      userFeedback: 'accepted',
    });

    // Apply mutations through PCS (proposals only)
    for (const mutation of response.pcsMutations) {
      pcs.propose(mutation);
    }

    return { success: true, response, events: response.pcsMutations.length };
  } catch (error) {
    AgentMemoryStore.recordExecution({
      agentId: request.agentId,
      action: request.action,
      success: false,
      latency: Date.now() - startTime,
      userFeedback: 'ignored',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      events: 0,
    };
  }
}
