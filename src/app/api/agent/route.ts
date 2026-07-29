/**
 * Agent Invocation API Endpoint
 * ====================================================================
 *
 * Receives agent routing requests, reconstructs a PCSManager from the
 * provided snapshot, and delegates execution to {@link AgentRouter}.
 *
 * POST body MUST include: agentId, phase, action, pcsSnapshot.
 * Optional: payload.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PCSState, PCSPhase } from '@/pcs/types';
import { PCSManager } from '@/pcs/pcs-manager';
import { AgentRouter } from '@/agents/router';
import type { AgentRequest, AgentId } from '@/agents/types';

// ---------------------------------------------------------------------------
// POST — Route an agent request
// ---------------------------------------------------------------------------

interface AgentInvocationBody {
  agentId?: string;
  phase?: string;
  action?: string;
  payload?: unknown;
  pcsSnapshot?: PCSState;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as AgentInvocationBody;
    const { agentId, phase, action, payload, pcsSnapshot } = body;

    // --- Input validation ---

    if (typeof agentId !== 'string' || agentId.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid "agentId" field' }, { status: 400 });
    }

    if (typeof phase !== 'string' || phase.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid "phase" field' }, { status: 400 });
    }

    if (typeof action !== 'string' || action.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid "action" field' }, { status: 400 });
    }

    if (pcsSnapshot === undefined || pcsSnapshot === null || typeof pcsSnapshot !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid "pcsSnapshot" field' },
        { status: 400 },
      );
    }

    // --- Reconstruct PCSManager from snapshot ---

    const pcsManager = new PCSManager(pcsSnapshot as PCSState);
    const accessor = pcsManager.createAccessor();

    // --- Build agent request ---

    const agentRequest: AgentRequest = {
      agentId: agentId as AgentId,
      phase: phase as PCSPhase,
      action,
      payload: (payload ?? null) as unknown,
      pcsSnapshot: pcsSnapshot as PCSState,
    };

    // --- Route and execute ---

    const router = new AgentRouter(accessor);
    const response = await router.route(agentRequest);

    return NextResponse.json(response);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agent invocation failed' },
      { status: 500 },
    );
  }
}
