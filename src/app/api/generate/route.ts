/**
 * Content Generation Streaming API Endpoint
 * ====================================================================
 *
 * Generates prose content for a single structure node using the Scribe Agent.
 * Falls back to V1 mock content when the Scribe Agent is unavailable or
 * LLM access is not configured.
 *
 * POST body MUST include: nodeId, pcsSnapshot.
 *
 * V1 response format: JSON (streaming reserved for V2).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PCSState } from '@/pcs/types';
import { PCSManager } from '@/pcs/pcs-manager';
import type { AgentRequest } from '@/agents/types';

// ---------------------------------------------------------------------------
// POST — Generate content for a node
// ---------------------------------------------------------------------------

interface GenerateBody {
  nodeId?: string;
  pcsSnapshot?: PCSState;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as GenerateBody;
    const { nodeId, pcsSnapshot } = body;

    // --- Input validation ---

    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid "nodeId" field' }, { status: 400 });
    }

    if (pcsSnapshot === undefined || pcsSnapshot === null || typeof pcsSnapshot !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid "pcsSnapshot" field' },
        { status: 400 },
      );
    }

    // --- Try Scribe Agent (LLM-powered generation) ---

    try {
      const { ScribeAgent } = await import('@/agents/scribe-agent');
      const pcsManager = new PCSManager(pcsSnapshot as PCSState);
      const accessor = pcsManager.createAccessor();
      const scribe = new ScribeAgent(accessor);

      const agentRequest: AgentRequest = {
        agentId: 'scribe',
        phase: pcsSnapshot.phase,
        action: 'generate',
        payload: { nodeId },
        pcsSnapshot: pcsSnapshot as PCSState,
      };

      const response = await scribe.execute(agentRequest);
      return NextResponse.json(response);
    } catch {
      // LLM unavailable — fall through to V1 mock
    }

    // --- V1 Mock Fallback ---

    const snapshot = pcsSnapshot as PCSState;
    const section = snapshot.structure.sections.find((s) => s.id === nodeId);
    const coreMessage = snapshot.intent.core_message.value || '主题';
    const title = section?.title ?? '章节';
    const goal = section?.goal ?? '展开论述';
    const content = `【${title}】\n\n本节围绕「${coreMessage}」展开，目标：${goal}。\n\n（此为 V1 规则生成的占位内容，将在 LLM 接入后替换为正式文本。）`;

    return NextResponse.json({
      agentId: 'scribe' as const,
      action: 'generate' as const,
      result: { nodeId, content, contentLength: content.length },
      pcsMutations: [] as const,
      nextActions: ['check'] as const,
      metadata: {
        latency: 0,
        llmCalls: 0,
        tokensUsed: 0,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Content generation failed' },
      { status: 500 },
    );
  }
}
