'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNodeLifecycle } from '@/hooks/use-node-lifecycle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratingNodeProps {
  nodeId: string;
}

interface SubSection {
  id: string;
  title: string;
  generated: boolean;
  content?: string;
}

// ---------------------------------------------------------------------------
// Mock sub-sections — in production these come from the GenerationPlan.
// ---------------------------------------------------------------------------

function mockSubSections(): SubSection[] {
  return [
    {
      id: 'sub-1',
      title: '引入：数据驱动的决策趋势',
      generated: true,
      content: '在现代商业环境中，数据驱动决策已经成为区分领先企业与跟随者的关键因素…',
    },
    { id: 'sub-2', title: '核心框架：CRISP-DM 六步法', generated: false },
    { id: 'sub-3', title: '案例：零售行业的应用', generated: false },
    { id: 'sub-4', title: '小结', generated: false },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GeneratingNode({ nodeId: _nodeId }: GeneratingNodeProps) {
  const { completeGeneration } = useNodeLifecycle();
  const [subSections, setSubSections] = useState<SubSection[]>(() => mockSubSections());
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [isStopped, setIsStopped] = useState(false);
  const [startedAt] = useState<number>(Date.now());
  const generationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  // -------------------------------------------------------------------
  // Generation simulation
  // -------------------------------------------------------------------

  const totalSections = subSections.length;
  const generatedCount = subSections.filter((s) => s.generated).length;

  const stopGeneration = useCallback(() => {
    if (generationRef.current) {
      clearInterval(generationRef.current);
      generationRef.current = null;
    }
    setIsStopped(true);
  }, []);

  const handleStopGeneration = useCallback(() => {
    stopGeneration();
    // Transition to DRAFTED with partial content
    const partialContent = subSections
      .filter((s) => s.generated && s.content)
      .map((s) => `### ${s.title}\n\n${s.content}`)
      .join('\n\n');
    completeGeneration(partialContent || `[生成中断] ${_nodeId} 部分内容`);
  }, [stopGeneration, subSections, completeGeneration, _nodeId]);

  // Auto-generation loop — simulates sub-sections completing one by one
  useEffect(() => {
    if (isStopped || completedRef.current) return;

    generationRef.current = setInterval(() => {
      setSubSections((prev) => {
        const nextPending = prev.findIndex((s) => !s.generated);
        if (nextPending === -1) {
          // All sections generated — clear interval and auto-transition
          completedRef.current = true;
          return prev;
        }

        return prev.map((s, i) =>
          i === nextPending
            ? {
                ...s,
                generated: true,
                content: `[自动生成内容] ${s.title} 的草稿内容…`,
              }
            : s,
        );
      });

      setProgress((prev) => {
        const next = prev + 1 / totalSections;
        return Math.min(next, 1);
      });
    }, 2500);

    return () => {
      if (generationRef.current) {
        clearInterval(generationRef.current);
      }
    };
  }, [isStopped, totalSections]);

  // Watch for completion → auto-transition to DRAFTED
  useEffect(() => {
    if (!completedRef.current || generatedCount !== totalSections) {
      return;
    }

    const fullContent = subSections.map((s) => `### ${s.title}\n\n${s.content ?? ''}`).join('\n\n');
    const timer = setTimeout(() => {
      completeGeneration(fullContent);
    }, 800);
    return () => clearTimeout(timer);
  }, [generatedCount, totalSections, subSections, completeGeneration]);

  // Estimate time remaining
  useEffect(() => {
    if (isStopped || generatedCount >= totalSections) {
      setEstimatedTime(null);
      return;
    }

    if (generatedCount === 0) {
      setEstimatedTime(totalSections * 2.5);
      return;
    }

    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = generatedCount / elapsed;
    const remaining = totalSections - generatedCount;

    if (rate > 0) {
      setEstimatedTime(remaining / rate);
    }
  }, [generatedCount, totalSections, startedAt, isStopped]);

  // Progress percentage for display
  const progressPercent = Math.round(progress * 100);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">✨ AI 正在生成内容</h2>
        <p className="text-sm text-gray-500">Scribe Agent 正在按照写作计划逐节生成内容…</p>
      </div>

      {/* Progress area */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Progress bar */}
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">生成进度</span>
          <span className="tabular-nums text-gray-500">{progressPercent}%</span>
        </div>
        <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`
              h-full rounded-full transition-all duration-700 ease-out
              ${isStopped ? 'bg-amber-400' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}
            `}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 text-xs text-gray-500">
          <span>
            <span className="font-medium text-gray-700">{generatedCount}</span>
            <span> / {totalSections} 节已完成</span>
          </span>

          {estimatedTime !== null && !isStopped && (
            <span>
              预计剩余{' '}
              <span className="font-medium text-gray-700">
                {estimatedTime < 60
                  ? `${Math.round(estimatedTime)} 秒`
                  : `${Math.round(estimatedTime / 60)} 分钟`}
              </span>
            </span>
          )}

          {isStopped && <span className="text-amber-600">已停止生成</span>}
        </div>
      </div>

      {/* Sub-sections list */}
      <div className="mb-8 space-y-3">
        {subSections.map((section, idx) => (
          <div
            key={section.id}
            className={`
              rounded-lg border px-4 py-3 transition-all duration-500
              ${
                section.generated
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 bg-gray-50 opacity-60'
              }
              ${
                !section.generated && idx === generatedCount
                  ? 'animate-pulse border-blue-300 bg-blue-50/50 opacity-90'
                  : ''
              }
            `}
          >
            <div className="flex items-center gap-3">
              {/* Status icon */}
              <span className="flex-shrink-0">
                {section.generated ? (
                  <svg
                    className="h-5 w-5 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : idx === generatedCount ? (
                  <svg
                    className="h-5 w-5 animate-spin text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                )}
              </span>

              {/* Section title */}
              <div className="min-w-0 flex-1">
                <p
                  className={`
                    text-sm font-medium
                    ${section.generated ? 'text-gray-800' : 'text-gray-500'}
                  `}
                >
                  {section.title}
                </p>
                {section.generated && section.content && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {section.content.slice(0, 60)}…
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stop button */}
      {!isStopped && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleStopGeneration}
            className="
              inline-flex items-center gap-2 rounded-lg border border-red-200
              px-5 py-2.5 text-sm font-medium text-red-600
              transition-colors
              hover:bg-red-50 hover:border-red-300
              focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2
            "
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            停止生成
          </button>
        </div>
      )}

      {/* Stopped state hint */}
      {isStopped && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center">
          <p className="text-sm text-amber-700">生成已停止。已生成的内容已保存为草稿。</p>
        </div>
      )}
    </div>
  );
}
