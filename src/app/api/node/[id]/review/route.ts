import { NextRequest, NextResponse } from 'next/server';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const nodeId = params.id;
  try {
    // V1: Return mock review result
    const review = {
      node_id: nodeId,
      passed: true,
      issues: [] as Array<Record<string, unknown>>,
      summary: {
        intent_alignment: 'pass',
        constraint_compliance: 'pass',
        expression_consistency: 'pass',
        structure_completeness: 'pass',
      },
      reviewed_at: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, review });
  } catch {
    return NextResponse.json({ error: 'Failed to review node' }, { status: 500 });
  }
}
