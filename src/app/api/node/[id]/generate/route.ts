import { NextRequest, NextResponse } from 'next/server';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const nodeId = params.id;
  try {
    // V1: Return mock generated content with realistic Chinese text (body parsed in V2)
    const content = `在过去的五年中，AI教育市场经历了爆发式增长。根据权威研究机构的数据，全球教育科技市场规模预计将在2027年突破4000亿美元大关，其中AI驱动的个性化学习解决方案将占据最大份额。\n\n这一增长由三个核心驱动力推动：首先，全球教育资源的分配不均催生了对智能化教学工具的迫切需求；其次，大语言模型技术的成熟使个性化辅导从概念走向现实；第三，各国政府对教育数字化转型的政策支持为市场注入了强劲动力。`;

    return NextResponse.json({
      success: true,
      node_id: nodeId,
      content,
      metadata: { tokens_used: 150, latency_ms: 1200 },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to generate content' }, { status: 500 });
  }
}
