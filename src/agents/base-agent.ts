// ---------------------------------------------------------------------------
// Sculptor V1 — Base Agent Re-export & Runtime Helpers
//
// This file is the recommended entry point for agent implementations.
// It re-exports the BaseAgent abstract class and all core agent types from
// ./types, plus a few standalone helpers that are awkward to house inside
// the abstract class itself (they don't depend on `this`).
//
// Usage:
//   import { BaseAgent, type AgentRequest, type AgentResponse, ... }
//     from "@/agents/base-agent";
// ---------------------------------------------------------------------------

export {
  BaseAgent,
  type AgentId,
  type AgentRequest,
  type AgentResponse,
  type ProposalMutation,
  type IPCSAccessor,
  type AgentConstructor,
  type AgentRegistry,
} from './types';

import type { AgentId, AgentResponse, ProposalMutation } from './types';

// ===========================================================================
// Standalone helpers
// ===========================================================================

/**
 * Convenience factory for an {@link AgentResponse} with sensible defaults.
 *
 * Concrete agents can spread or override fields as needed.  This is a pure
 * function — it has no side effects and does not depend on agent state — so
 * it lives here rather than on the abstract class.
 *
 * @example
 * ```ts
 * return createAgentResponse("review", "audit", {
 *   result: { score: 95 },
 *   pcsMutations: [],
 * });
 * ```
 */
export function createAgentResponse(
  agentId: AgentId,
  action: string,
  overrides: {
    result?: unknown;
    pcsMutations?: ProposalMutation[];
    nextActions?: string[];
    latency?: number;
    llmCalls?: number;
    tokensUsed?: number;
  } = {},
): AgentResponse {
  return {
    agentId,
    action,
    result: overrides.result ?? null,
    pcsMutations: overrides.pcsMutations ?? [],
    nextActions: overrides.nextActions ?? [],
    metadata: {
      latency: overrides.latency ?? 0,
      llmCalls: overrides.llmCalls ?? 0,
      tokensUsed: overrides.tokensUsed ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Telemetry timer
// ---------------------------------------------------------------------------

/**
 * High-resolution timer that agents should use to populate the `latency`
 * field in {@link AgentResponse.metadata}.  Returns a stop function that
 * yields the elapsed wall-clock time in **milliseconds**.
 *
 * @example
 * ```ts
 * const stop = startTimer();
 * // ... agent work ...
 * const latency = stop();
 * ```
 */
export function startTimer(): () => number {
  const t0 = performance.now();
  return () => performance.now() - t0;
}
