import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const nodeId = params.id;
  try {
    const body = await request.json();
    void body; // pcsSnapshot used in V2

    // V1: Return mock plan
    const plan = {
      node_id: nodeId,
      goal_summary: '本节将建立投资者对AI教育赛道的紧迫感',
      suggested_substructure: ['市场规模概览', '增长驱动力分析', '竞争格局'],
      estimated_length: 800,
      required_topics: ['AI教育市场规模', '头部玩家分析'],
      tone_instruction: '以分析型的语气写作，使用数据和事实支撑论点',
      avoid_instruction: '避免过度乐观的营销语言',
      transition_from: '（这是文章开头）',
      transition_to: '下一节将讨论技术可行性',
      created_at: new Date().toISOString(),
      confirmed: false,
    };

    return NextResponse.json({ success: true, plan });
  } catch {
    return NextResponse.json({ error: 'Failed to generate plan' }, { status: 500 });
  }
}
