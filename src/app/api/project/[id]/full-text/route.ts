import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;

  try {
    const mockSections = [
      {
        id: 'section_1',
        title: '引言',
        content:
          '这是第一节的示例内容。\n\n教育领域作为社会发展的基石，正面临着前所未有的机遇和挑战。',
        draft_state: 'approved',
        order: 0,
      },
      {
        id: 'section_2',
        title: '市场分析',
        content: '根据权威机构预测，全球教育科技市场规模将在2027年达到4000亿美元。',
        draft_state: 'approved',
        order: 1,
      },
      {
        id: 'section_3',
        title: '技术方案',
        content: '我们的核心技术基于大语言模型和自适应学习算法。',
        draft_state: 'drafted',
        order: 2,
      },
      { id: 'section_4', title: '结论', content: '', draft_state: 'empty', order: 3 },
    ];

    const includedSections = mockSections
      .filter((s) => s.content.length > 0)
      .sort((a, b) => a.order - b.order);

    let fullText = '';
    const sections: Array<{ title: string; content: string }> = [];
    for (const section of includedSections) {
      fullText += `【${section.title}】\n${section.content}\n\n`;
      sections.push({ title: section.title, content: section.content });
    }

    return NextResponse.json({
      project_id: projectId,
      total_sections: mockSections.length,
      included_sections: includedSections.length,
      full_text: fullText.trim(),
      sections,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[FullText] Error for project ${projectId}:`, error);
    return NextResponse.json({ error: 'Failed to generate full text' }, { status: 500 });
  }
}
