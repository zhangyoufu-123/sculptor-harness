'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useNodeLifecycle } from '@/hooks/use-node-lifecycle';
import { GenerationPlan } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlannedNodeProps {
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Mock plan data — in production this comes from PCSManager or a dedicated
// hook that fetches the GenerationPlan by nodeId.
// ---------------------------------------------------------------------------

function mockGenerationPlan(nodeId: string): GenerationPlan {
  return {
    node_id: nodeId,
    goal_summary: '阐述数据分析方法论的核心框架，并说明其在实际商业场景中的应用价值',
    suggested_substructure: [
      '引入：数据驱动的决策趋势',
      '核心框架：CRISP-DM 六步法',
      '案例：零售行业的应用',
      '小结',
    ],
    estimated_length: 1200,
    required_topics: ['CRISP-DM 方法论', '2024年零售行业数据统计', '数据质量评估标准'],
    tone_instruction: '保持分析型语气，使用客观数据和逻辑推导，避免主观感受',
    avoid_instruction: '避免过度使用专业术语 · 避免未经数据支撑的断言 · 避免过度主观评价',
    transition_from: '前文探讨了数据在现代决策中的重要性，本节将进一步介绍具体的分析框架',
    transition_to: '后续将通过真实案例展示该框架的实际应用效果',
    created_at: new Date().toISOString(),
    confirmed: false,
  };
}

// ---------------------------------------------------------------------------
// Mock adhesion check — returns overlap warnings for overlapping content
// with adjacent sections.
// ---------------------------------------------------------------------------

interface AdhesionResult {
  hasOverlap: boolean;
  overlappingSections: string[];
}

function checkAdhesion(_nodeId: string): AdhesionResult {
  // In production, this calls ConsistencyEngine.checkAdhesion().
  // For V1 we return a deterministic mock.
  return { hasOverlap: false, overlappingSections: [] };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlannedNode({ nodeId }: PlannedNodeProps) {
  const { startGeneration, skipToDrafting } = useNodeLifecycle();
  const [isAdjusting, setIsAdjusting] = useState(false);

  const plan = useMemo(() => mockGenerationPlan(nodeId), [nodeId]);
  const adhesion = useMemo(() => checkAdhesion(nodeId), [nodeId]);

  const handleStartGeneration = useCallback(() => {
    startGeneration();
  }, [startGeneration]);

  const handleSkipToDrafting = useCallback(() => {
    skipToDrafting();
  }, [skipToDrafting]);

  const handleAdjustPlan = useCallback(() => {
    setIsAdjusting(true);
  }, []);

  // -------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------

  const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({
    label,
    children,
  }) => (
    <div className="flex items-start gap-3 border-b border-gray-100 py-3 last:border-b-0">
      <span className="w-28 flex-shrink-0 pt-0.5 text-xs font-medium text-gray-400">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-gray-700">{children}</div>
    </div>
  );

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">📋 写作计划</h2>
        <p className="mt-1 text-sm text-gray-500">
          Architect Agent 已为本章节生成以下写作计划，请确认后开始生成
        </p>
      </div>

      {/* Adhesion warning banner */}
      {adhesion.hasOverlap && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 flex-shrink-0 text-amber-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">内容衔接警告</p>
              <p className="mt-0.5 text-xs text-amber-700">
                检测到与以下章节存在内容重叠：{adhesion.overlappingSections.join('、')}。
                建议调整计划以避免重复。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan detail card */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Goal */}
        <div className="border-b border-gray-100 px-5 py-4">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
            本节目标（一句话）
          </span>
          <p className="text-sm font-medium text-gray-800">{plan.goal_summary}</p>
        </div>

        {/* Fields */}
        <div className="px-5 py-2">
          {/* Suggested substructure */}
          {plan.suggested_substructure.length > 0 && (
            <FieldRow label="建议结构">
              <ol className="list-inside list-decimal space-y-1">
                {plan.suggested_substructure.map((sub, idx) => (
                  <li key={idx} className="text-gray-700">
                    {sub}
                  </li>
                ))}
              </ol>
            </FieldRow>
          )}

          {/* Estimated length */}
          <FieldRow label="预估字数">
            <span className="font-medium text-gray-800">
              {plan.estimated_length.toLocaleString()} 字
            </span>
          </FieldRow>

          {/* Required knowledge topics */}
          {plan.required_topics.length > 0 && (
            <FieldRow label="需覆盖的知识点">
              <ul className="space-y-1">
                {plan.required_topics.map((topic) => (
                  <li key={topic} className="flex items-center gap-1.5">
                    <span className="text-blue-400">◆</span>
                    {topic}
                  </li>
                ))}
              </ul>
            </FieldRow>
          )}

          {/* Tone instruction */}
          <FieldRow label="语气指令">
            <p>{plan.tone_instruction}</p>
          </FieldRow>

          {/* Avoid instruction */}
          <FieldRow label="衔接提示">
            <div className="space-y-2">
              <p className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
                ← 承接上文：{plan.transition_from}
              </p>
              <p className="rounded bg-green-50 px-3 py-2 text-xs text-green-700">
                → 连接下文：{plan.transition_to}
              </p>
            </div>
          </FieldRow>

          {/* Avoid items */}
          <FieldRow label="避免事项">
            <p className="text-red-600">{plan.avoid_instruction}</p>
          </FieldRow>
        </div>
      </div>

      {/* Plan adjustment panel (inline, shown when user clicks "调整计划") */}
      {isAdjusting && (
        <div className="mb-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">调整写作计划</h3>
            <button
              type="button"
              onClick={() => setIsAdjusting(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              取消
            </button>
          </div>
          <p className="text-sm text-gray-500">
            计划编辑器将在后续版本中提供完整的编辑功能。当前你可以调整以下内容：
          </p>
          {/* Placeholder editor fields */}
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">目标摘要</label>
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                rows={2}
                defaultValue={plan.goal_summary}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">预估字数</label>
              <input
                type="number"
                className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                defaultValue={plan.estimated_length}
              />
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Primary: start generation */}
        <button
          type="button"
          onClick={handleStartGeneration}
          className="
            inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5
            text-sm font-medium text-white shadow-sm
            transition-all duration-200
            hover:bg-blue-700 hover:shadow-md
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            active:scale-[0.98]
          "
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
          </svg>
          按此计划开始
        </button>

        {/* Secondary: adjust plan */}
        <button
          type="button"
          onClick={handleAdjustPlan}
          className="
            inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2.5
            text-sm font-medium text-gray-700 transition-colors
            hover:bg-gray-50
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          调整计划
        </button>

        {/* Tertiary: skip planning */}
        <button
          type="button"
          onClick={handleSkipToDrafting}
          className="
            inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5
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
          跳过规划，直接写
        </button>
      </div>
    </div>
  );
}
