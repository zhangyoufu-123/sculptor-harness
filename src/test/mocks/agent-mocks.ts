// ============================================================
// agent-mocks.ts — Mock agent & accessor for integration testing
// ============================================================
//
// Provides a MockAgent that extends BaseAgent with configurable
// responses, and a createMockAccessor() factory for building
// lightweight IPCSAccessor implementations in tests.
// ============================================================

import type { PCSState, PCSPhase, DecisionRecord, ProposalStatus } from '@/pcs/types';
import {
  BaseAgent,
  type AgentId,
  type AgentRequest,
  type AgentResponse,
  type ProposalMutation,
  type IPCSAccessor,
} from '@/agents/types';

// ===========================================================================
// MockAgent
// ===========================================================================

export class MockAgent extends BaseAgent {
  private mockResponse: AgentResponse;

  /**
   * @param agentId  - Agent identity (e.g. `'scribe'`, `'architect'`).
   * @param pcs      - PCS accessor injected by the test harness.
   * @param response - Optional pre-built response; sensible defaults used otherwise.
   */
  constructor(agentId: string, pcs: IPCSAccessor, response?: Partial<AgentResponse>) {
    super(agentId as AgentId, pcs);
    this.mockResponse = {
      agentId: agentId as AgentId,
      action: 'mock-action',
      result: null,
      pcsMutations: [],
      nextActions: [],
      metadata: {
        latency: 0,
        llmCalls: 0,
        tokensUsed: 0,
      },
      ...response,
      // Ensure agentId stays consistent (override if response specifies one)
      ...(response?.agentId ? { agentId: response.agentId as AgentId } : {}),
    };
  }

  /**
   * Execute returns the pre-configured mock response without doing any
   * real work.  Use {@link setResponse} to change the response between
   * assertions.
   */
  async execute(_request: AgentRequest): Promise<AgentResponse> {
    return this.mockResponse;
  }

  /**
   * Replace the mock response that will be returned by the next
   * {@link execute} call.
   */
  setResponse(response: Partial<AgentResponse>): void {
    this.mockResponse = {
      ...this.mockResponse,
      ...response,
      agentId: (response.agentId ?? this.mockResponse.agentId) as AgentId,
    };
  }
}

// ===========================================================================
// createMockAccessor
// ===========================================================================

/**
 * Internal PCS snapshot used by the mock accessor.
 * Mutations are tracked so tests can assert on them.
 */
interface MockAccessorState {
  snapshot: PCSState;
  proposals: ProposalMutation[];
  decisionHistory: DecisionRecord[];
}

/**
 * Create a lightweight, fully-functional {@link IPCSAccessor} backed by
 * an in-memory PCSState.
 *
 * @param state - Partial PCSState to seed the snapshot. Unspecified fields
 *                are defaulted to a minimal initialized PCS.
 * @returns An accessor suitable for passing to agents under test.
 *
 * @example
 * ```ts
 * const accessor = createMockAccessor({ phase: 'executing' });
 * const agent = new MockAgent('scribe', accessor);
 * ```
 */
export function createMockAccessor(state?: Partial<PCSState>): IPCSAccessor {
  const store: MockAccessorState = {
    snapshot: {
      id: 'mock-pcs-001',
      project_id: 'test-project-001',
      phase: 'initializing' as PCSPhase,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      intent: {
        purpose: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        core_message: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        desired_impact: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        target_emotion: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
      },
      audience: {
        audience_type: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        knowledge_level: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        relationship: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        pain_points: {
          value: [] as string[],
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
      },
      constraint: {
        type: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        platform: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        format: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        length_min: {
          value: 0,
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        length_max: {
          value: 0,
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        deadline: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        custom_constraints: {
          value: [] as string[],
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
      },
      knowledge: {
        required_topics: [],
        known_topics: [],
        missing_information: [],
        sources: {
          value: [] as string[],
          status: 'assumed',
          source: 'system',
          confidence: 0.5,
          last_updated: new Date().toISOString(),
        },
      },
      structure: { sections: [] },
      expression: {
        tone: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.4,
          last_updated: new Date().toISOString(),
        },
        voice: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.4,
          last_updated: new Date().toISOString(),
        },
        avoid: {
          value: [] as string[],
          status: 'assumed',
          source: 'system',
          confidence: 0.4,
          last_updated: new Date().toISOString(),
        },
        style_reference: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        format_reference: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
        thinking_reference: {
          value: '',
          status: 'assumed',
          source: 'system',
          confidence: 0.2,
          last_updated: new Date().toISOString(),
        },
      },
      ...state,
    },
    proposals: [],
    decisionHistory: [],
  };

  /**
   * Walk a dot-notation path (e.g. `"intent.purpose"`) into the PCS
   * snapshot and return the value.
   */
  function readPath(path: string): unknown {
    const parts = path.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = store.snapshot;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      // Support array-index access: "sections[0]"
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        current = current[arrayMatch[1]]?.[Number(arrayMatch[2])];
      } else {
        current = current[part];
      }
    }
    // If we landed on a PCSField wrapper, unwrap `.value`
    if (
      current !== null &&
      typeof current === 'object' &&
      'value' in current &&
      'status' in current &&
      'source' in current
    ) {
      return (current as { value: unknown }).value;
    }
    return current;
  }

  return {
    read(path: string): unknown {
      return readPath(path);
    },

    getSnapshot(): PCSState {
      return store.snapshot;
    },

    propose(mutation: ProposalMutation): void {
      store.proposals.push(mutation);
    },

    getProposalStatus(_fieldPath: string): ProposalStatus | null {
      // Simple mock: treat proposals as pending unless a decision
      // record exists for the same path (then "accepted").
      const hasDecision = store.decisionHistory.some((d) => d.field_path === _fieldPath);
      if (hasDecision) return 'accepted';
      const hasProposal = store.proposals.some((p) => p.fieldPath === _fieldPath);
      return hasProposal ? 'pending' : null;
    },

    getDecisionHistory(fieldPath?: string): DecisionRecord[] {
      if (fieldPath === undefined) {
        return [...store.decisionHistory];
      }
      return store.decisionHistory.filter((d) => d.field_path === fieldPath);
    },

    getCurrentPhase(): PCSPhase {
      return store.snapshot.phase;
    },

    isLocked(fieldPath: string): boolean {
      const value = readPath(fieldPath);
      // A field is locked if its wrapper has status 'locked'
      if (value !== null && typeof value === 'object' && 'status' in value) {
        return (value as { status: string }).status === 'locked';
      }
      return false;
    },
  };
}
