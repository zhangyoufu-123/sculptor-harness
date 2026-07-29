// ---------------------------------------------------------------------------
// Sculptor V1 — Agent Router
//
// Lightweight replacement for LangGraph. Routes user requests to the
// correct agent based on the current PCS phase and requested action.
//
// Phase-to-Agent mapping:
//   initializing → intake
//   clarifying   → clarification
//   structured   → architect
//   executing    → scribe
//   reviewing    → review
//   completed    → (none — returns error)
// ---------------------------------------------------------------------------

import type { AgentId, AgentRequest, AgentResponse, IPCSAccessor } from './types';
import { BaseAgent } from './types';
import { createAgentResponse } from './base-agent';
import { IntakeAgent } from './intake-agent';
import { ClarificationAgent } from './clarification-agent';
import { ArchitectAgent } from './architect-agent';
import { ScribeAgent } from './scribe-agent';
import { ReviewEngine } from './review-engine';
import type { PCSPhase } from '@/pcs/types';

/**
 * Lightweight agent router that replaces LangGraph for V1.
 *
 * Maintains a registry of agent instances and routes inbound
 * {@link AgentRequest}s to the correct agent based on the current
 * PCS phase. The router does NOT make routing decisions — it is a
 * deterministic lookup: phase → agent → execute.
 */
export class AgentRouter {
  /** All instantiated agents, keyed by their {@link AgentId}. */
  private readonly agents: Map<AgentId, BaseAgent>;

  /**
   * Static lookup table mapping every PCS phase to the agent that
   * owns it.  Phases without a handler (e.g. `"completed"`) map to
   * `null` so the router can return a clear error instead of silently
   * dropping the request.
   */
  private static readonly PHASE_AGENT_MAP: Record<PCSPhase, AgentId | null> = {
    initializing: 'intake',
    clarifying: 'clarification',
    structured: 'architect',
    executing: 'scribe',
    reviewing: 'review',
    completed: null,
  };

  /**
   * @param pcs — The PCS accessor shared by all agents.  The router
   *   injects this into every agent at construction time so they can
   *   read state and submit proposals through the standard contract.
   */
  constructor(pcs: IPCSAccessor) {
    this.agents = new Map<AgentId, BaseAgent>([
      ['intake', new IntakeAgent(pcs)],
      ['clarification', new ClarificationAgent(pcs)],
      ['architect', new ArchitectAgent(pcs)],
      ['scribe', new ScribeAgent(pcs)],
      ['review', new ReviewEngine(pcs)],
    ]);
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Route a request to the appropriate agent based on the request's
   * current PCS phase.
   *
   * Steps:
   *   1. Look up the agent ID for the request's phase.
   *   2. If no agent is mapped, return an error response immediately.
   *   3. Retrieve the agent instance from the internal registry.
   *   4. Delegate to {@link BaseAgent.execute} and return its result.
   *
   * @param request — The inbound request to route.
   * @returns The agent's response, or an error response when the
   *   phase has no handler.
   */
  async route(request: AgentRequest): Promise<AgentResponse> {
    // 1. Determine which agent handles the request's phase.
    const agentId = AgentRouter.PHASE_AGENT_MAP[request.phase];

    // 2. If agent not found, return error response.
    if (agentId === null || agentId === undefined) {
      return createAgentResponse(request.agentId, request.action, {
        result: {
          error: `No agent is mapped to phase "${request.phase}".`,
        },
      });
    }

    // Defensive: the agent should always be in the map, but guard anyway.
    const agent = this.agents.get(agentId);
    if (!agent) {
      return createAgentResponse(request.agentId, request.action, {
        result: {
          error: `Agent "${agentId}" is referenced by the phase map but was not registered.`,
        },
      });
    }

    // 3 & 4. Delegate to the agent and return its response.
    return agent.execute(request);
  }

  /**
   * Get the {@link AgentId} responsible for a given PCS phase.
   *
   * @param phase — The phase to look up.
   * @returns The agent ID that handles the phase.
   * @throws {Error} If no agent is mapped to the given phase
   *   (e.g. `"completed"`).
   */
  getAgentForPhase(phase: PCSPhase): AgentId {
    const agentId = AgentRouter.PHASE_AGENT_MAP[phase];
    if (agentId === null || agentId === undefined) {
      throw new Error(`No agent mapped to phase "${phase}".`);
    }
    return agentId;
  }

  /**
   * Check whether a given PCS phase has a valid agent handler.
   *
   * Returns `false` for phases like `"completed"` that exist in the
   * phase state machine but do not have a corresponding agent.
   *
   * @param phase — The phase to validate.
   * @returns `true` when the phase can be routed to an agent.
   */
  isValidPhase(phase: PCSPhase): boolean {
    const agentId = AgentRouter.PHASE_AGENT_MAP[phase];
    return agentId !== null && agentId !== undefined;
  }

  /**
   * List every agent ID registered in the router.
   *
   * @returns Agent IDs in insertion order.
   */
  listAgents(): AgentId[] {
    return Array.from(this.agents.keys());
  }
}
