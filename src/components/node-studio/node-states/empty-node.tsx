'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useNodeLifecycle } from '@/hooks/use-node-lifecycle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmptyNodeProps {
  nodeId: string;
  goal?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmptyNode({ nodeId: _nodeId, goal = '（目标待定）' }: EmptyNodeProps) {
  const { planNode, skipToDrafting } = useNodeLifecycle();
  const [isPlanning, setIsPlanning] = useState(false);
  const [dotCount, setDotCount] = useState(0);

  // "AI is preparing writing plan..." animation — cycling dots
  useEffect(() => {
    if (!isPlanning) return;
    const interval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, [isPlanning]);

  const handlePlanNode = useCallback(() => {
    setIsPlanning(true);
    planNode();
  }, [planNode]);

  const handleSkip = useCallback(() => {
    skipToDrafting();
  }, [skipToDrafting]);

  // If planning has been triggered, show the loading animation
  if (isPlanning) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8">
        <div className="mb-6 rounded-full bg-blue-50 p-6">
          <svg className="h-16 w-16 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
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
        </div>
        <p className="text-lg font-medium text-gray-700">
          AI 正在准备写作计划
          <span className="inline-block w-8 text-left">{'.'.repeat(dotCount)}</span>
        </p>
        <p className="mt-2 text-sm text-gray-400">正在分析本节目标、知识需求和风格约束…</p>
      </div>
    );
  }

  // Default empty state with goal display and action button
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      {/* Goal display */}
      <div className="mb-8 max-w-lg">
        <span className="mb-3 inline-block text-4xl">🎯</span>
        <h2 className="mb-2 text-xl font-semibold text-gray-800">本节目标</h2>
        <p className="text-base leading-relaxed text-gray-600">{goal}</p>
      </div>

      {/* Action area */}
      <div className="flex flex-col items-center gap-4">
        {/* Primary: plan via AI */}
        <button
          type="button"
          onClick={handlePlanNode}
          className="
            inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3
            text-sm font-medium text-white shadow-sm
            transition-all duration-200
            hover:bg-blue-700 hover:shadow-md
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            active:scale-[0.98]
          "
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
            />
          </svg>
          AI 生成写作计划
        </button>

        {/* Secondary: skip directly to drafting */}
        <button
          type="button"
          onClick={handleSkip}
          className="
            inline-flex items-center gap-1.5 rounded-lg px-4 py-2
            text-sm text-gray-500 transition-colors
            hover:bg-gray-100 hover:text-gray-700
            focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1
          "
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
          直接开始写作（跳过规划）
        </button>
      </div>

      {/* Subtle hint */}
      <p className="mt-8 text-xs text-gray-400">你也可以直接在下方编辑器中手动开始写作</p>
    </div>
  );
}
