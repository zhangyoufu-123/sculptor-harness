'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePCS } from '@/hooks/use-pcs';
import PCSPanel from '@/components/pcs-viewer/pcs-panel';
import type { PCSState } from '@/pcs/types';

// ---------------------------------------------------------------------------
// V1 mock PCS data — used when the user navigates directly without going
// through the home page (where usePCS would be uninitialized).
// ---------------------------------------------------------------------------

function buildMockPCS(): PCSState {
  const now = new Date().toISOString();
  const id = crypto.randomUUID?.() ?? `pcs-${Date.now().toString(36)}`;

  return {
    id,
    project_id: `proj-${Date.now().toString(36)}`,
    phase: 'initializing',
    created_at: now,
    updated_at: now,
    intent: {
      purpose: {
        value: 'inform',
        status: 'assumed',
        source: 'user',
        confidence: 0.5,
        last_updated: now,
        proposal: null,
      },
      core_message: {
        value: 'AI 辅助创作将彻底改变内容生产方式',
        status: 'assumed',
        source: 'user',
        confidence: 0.6,
        last_updated: now,
        proposal: null,
      },
      desired_impact: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      target_emotion: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
    },
    audience: {
      audience_type: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      knowledge_level: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      relationship: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      pain_points: {
        value: [],
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
    },
    constraint: {
      type: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      platform: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      format: {
        value: 'markdown',
        status: 'assumed',
        source: 'system',
        confidence: 0.8,
        last_updated: now,
        proposal: null,
      },
      length_min: {
        value: 300,
        status: 'assumed',
        source: 'system',
        confidence: 0.5,
        last_updated: now,
        proposal: null,
      },
      length_max: {
        value: 3000,
        status: 'assumed',
        source: 'system',
        confidence: 0.5,
        last_updated: now,
        proposal: null,
      },
      deadline: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      custom_constraints: {
        value: [],
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
    },
    knowledge: {
      required_topics: [],
      known_topics: [],
      missing_information: [],
      sources: {
        value: [],
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
    },
    structure: {
      sections: [],
    },
    expression: {
      tone: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      voice: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      avoid: {
        value: [],
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      style_reference: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      format_reference: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
      thinking_reference: {
        value: '',
        status: 'assumed',
        source: 'system',
        confidence: 0.2,
        last_updated: now,
        proposal: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Phase routing links
// ---------------------------------------------------------------------------

interface PhaseLink {
  label: string;
  href: string;
  phase: string;
  description: string;
  enabled: boolean;
}

function buildPhaseLinks(projectId: string, currentPhase: string): PhaseLink[] {
  const phases: Omit<PhaseLink, 'enabled'>[] = [
    {
      label: '🎯 需求澄清',
      href: `/project/${projectId}/clarification`,
      phase: 'clarifying',
      description: '多轮对话式澄清，细化创作意图',
    },
    {
      label: '🏗️ 蓝图规划',
      href: `/project/${projectId}/blueprint`,
      phase: 'structured',
      description: '生成文章大纲与结构蓝图',
    },
    {
      label: '📚 知识注入',
      href: `/project/${projectId}/context-injection`,
      phase: 'structured',
      description: '注入外部知识与参考资料',
    },
    {
      label: '✍️ 节点写作',
      href: `/project/${projectId}/node-studio`,
      phase: 'executing',
      description: '逐节撰写、AI 辅助生成与审核',
    },
  ];

  const phaseOrder = [
    'initializing',
    'clarifying',
    'structured',
    'executing',
    'reviewing',
    'completed',
  ];
  const currentIndex = phaseOrder.indexOf(currentPhase);

  return phases.map((link) => {
    const requiredIndex = phaseOrder.indexOf(link.phase);
    const enabled = currentIndex >= requiredIndex || currentPhase === 'initializing';
    return { ...link, enabled };
  });
}

const PHASE_LABELS: Record<string, string> = {
  initializing: '初始化中',
  clarifying: '澄清阶段',
  structured: '结构化',
  executing: '执行中',
  reviewing: '审核中',
  completed: '已完成',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ProjectPage({ params }: { params: { id: string } }) {
  const { pcsState, isLoaded } = usePCS();

  // Fall back to mock data in V1 when navigating directly
  const resolvedState = useMemo(
    () => (isLoaded && pcsState ? pcsState : buildMockPCS()),
    [pcsState, isLoaded],
  );

  const phaseLinks = useMemo(
    () => buildPhaseLinks(params.id, resolvedState.phase),
    [params.id, resolvedState.phase],
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* ---------- Header ---------- */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sculptor</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              项目 {params.id.slice(0, 8)}...
            </p>
          </div>

          <span
            className={`
              px-3 py-1 rounded-full text-xs font-semibold
              bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300
            `}
          >
            {PHASE_LABELS[resolvedState.phase] ?? resolvedState.phase}
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* ---------- Phase Navigation Links ---------- */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">工作流程</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {phaseLinks.map((link) => {
              const cardContent = (
                <>
                  <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-1">
                    {link.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {link.description}
                  </p>
                </>
              );

              const cardClasses = `
                block rounded-xl border p-4 transition-all
                ${
                  link.enabled
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-400 hover:shadow-md dark:hover:border-blue-500 cursor-pointer'
                    : 'border-gray-100 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/50 cursor-not-allowed opacity-50'
                }
              `;

              return (
                <div key={link.label} className="relative">
                  {link.enabled ? (
                    <Link href={link.href} className={cardClasses}>
                      {cardContent}
                    </Link>
                  ) : (
                    <span className={cardClasses} aria-disabled="true">
                      {cardContent}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------- PCS Viewer ---------- */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            PCS 状态面板
          </h2>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <PCSPanel pcsState={resolvedState} />
          </div>
        </section>
      </div>
    </div>
  );
}
