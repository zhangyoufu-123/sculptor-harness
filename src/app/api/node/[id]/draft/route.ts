import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const nodeId = params.id;
  try {
    const body = await request.json();
    const { content, draft_state } = body as { content?: string; draft_state?: string };

    // V1: Acknowledge save
    return NextResponse.json({
      success: true,
      node_id: nodeId,
      saved_at: new Date().toISOString(),
      content_length: content?.length ?? 0,
      draft_state: draft_state ?? 'drafted',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }
}
