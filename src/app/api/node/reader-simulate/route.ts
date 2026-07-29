import { NextRequest, NextResponse } from 'next/server';
import {
  generateReaderProfiles,
  simulateReading,
  aggregateSimulations,
} from '@/algorithms/reader-simulator';
import type { PCSState, StructureSection } from '@/pcs/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pcsSnapshot, sections } = body as {
      pcsSnapshot?: PCSState;
      sections?: StructureSection[];
    };

    if (!pcsSnapshot) {
      // V1 fallback: use mock PCS
      const mockPCS: PCSState = {
        id: 'mock-pcs',
        project_id: 'mock-project',
        phase: 'executing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        intent: {
          purpose: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          core_message: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          desired_impact: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          target_emotion: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
        },
        audience: {
          audience_type: {
            value: '普通读者',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          knowledge_level: {
            value: 'intermediate',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          relationship: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          pain_points: {
            value: [],
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
        },
        constraint: {
          type: { value: '', status: 'assumed', source: 'ai', confidence: 0.5, last_updated: '' },
          platform: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          format: { value: '', status: 'assumed', source: 'ai', confidence: 0.5, last_updated: '' },
          length_min: {
            value: 0,
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          length_max: {
            value: 0,
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          deadline: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          custom_constraints: {
            value: [],
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
        },
        knowledge: {
          required_topics: [],
          known_topics: [],
          missing_information: [],
          sources: {
            value: [],
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
        },
        structure: { sections: sections || [] },
        expression: {
          tone: { value: '', status: 'assumed', source: 'ai', confidence: 0.5, last_updated: '' },
          voice: { value: '', status: 'assumed', source: 'ai', confidence: 0.5, last_updated: '' },
          avoid: { value: [], status: 'assumed', source: 'ai', confidence: 0.5, last_updated: '' },
          style_reference: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          format_reference: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
          thinking_reference: {
            value: '',
            status: 'assumed',
            source: 'ai',
            confidence: 0.5,
            last_updated: '',
          },
        },
      };

      const profiles = generateReaderProfiles(mockPCS);
      const simSections = sections || [
        {
          id: 's1',
          title: '引言',
          goal: '',
          function: 'introduce',
          hardness: 'hard',
          draft_state: 'drafted',
          content_draft: 'AI技术正在改变教育行业...',
          pcs_status: 'confirmed',
          source: 'ai',
          confidence: 0.8,
          order: 0,
        },
        {
          id: 's2',
          title: '市场分析',
          goal: '',
          function: 'argument',
          hardness: 'hard',
          draft_state: 'drafted',
          content_draft:
            '全球教育科技市场预计2027年达到4000亿美元，其中AI驱动的个性化学习解决方案占据最大份额。',
          pcs_status: 'confirmed',
          source: 'ai',
          confidence: 0.8,
          order: 1,
        },
      ];

      const simulations = profiles.map((reader) => simulateReading(simSections, reader));
      const report = aggregateSimulations('default', simulations);

      return NextResponse.json({ success: true, report });
    }

    const profiles = generateReaderProfiles(pcsSnapshot);
    const simSections = sections || pcsSnapshot.structure.sections;
    const simulations = profiles.map((reader) => simulateReading(simSections, reader));
    const report = aggregateSimulations(pcsSnapshot.project_id, simulations);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('[ReaderSimulate] Error:', error);
    return NextResponse.json({ error: 'Failed to run reader simulation' }, { status: 500 });
  }
}
