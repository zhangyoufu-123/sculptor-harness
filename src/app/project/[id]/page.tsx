'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePCSContext } from '@/contexts/pcs-context';
import PCSPanel from '@/components/pcs-viewer/pcs-panel';

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
  const { pcsState } = usePCSContext();

  const phaseLinks = useMemo(
    () => (pcsState ? buildPhaseLinks(params.id, pcsState.phase) : []),
    [params.id, pcsState],
  );

  if (!pcsState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">未加载 PCS 状态</p>
      </div>
    );
  }

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
            {PHASE_LABELS[pcsState.phase] ?? pcsState.phase}
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
            <PCSPanel pcsState={pcsState} />
          </div>
        </section>
      </div>
    </div>
  );
}
