import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const nodeId = params.id;
  try {
    const body = await request.json();
    const { original, modified } = body as { original?: string; modified?: string };

    // V1: Simple length-based impact analysis
    const diffRatio =
      original && modified
        ? Math.abs(original.length - modified.length) / Math.max(original.length, 1)
        : 0;

    let impactLevel = 'L0';
    if (diffRatio > 0.5) impactLevel = 'L2';
    else if (diffRatio > 0.2) impactLevel = 'L1';

    return NextResponse.json({
      success: true,
      node_id: nodeId,
      impact: {
        level: impactLevel,
        diff_ratio: Math.round(diffRatio * 100) / 100,
        affected_nodes: impactLevel === 'L2' ? ['downstream nodes'] : [],
        requires_proposal: impactLevel === 'L2',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to analyze revision' }, { status: 500 });
  }
}
