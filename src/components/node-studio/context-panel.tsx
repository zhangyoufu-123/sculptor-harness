'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MissingItem } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContextPanelProps {
  nodeId: string;
  hasConflict: boolean;
  conflictMessage?: string;
}

// ---------------------------------------------------------------------------
// Mock data helpers — in production these would use usePCS() and real data.
// ---------------------------------------------------------------------------

interface PanelContextData {
  tone: string;
  avoidList: string[];
  coreMessage: string;
  previousGoal: string | null;
  previousLastSentence: string | null;
  nextGoal: string | null;
  missingInfo: MissingItem[];
}

function mockContextData(_nodeId: string): PanelContextData {
  return {
    tone: '分析型 — 客观冷静，数据驱动',
    avoidList: ['过度主观评价', '未经数据支撑的断言', '过度使用专业术语'],
    coreMessage: '数据驱动的决策比直觉更可靠，但需要正确的分析框架。',
    previousGoal: '引出话题，介绍数据分析在现代决策中的重要性',
    previousLastSentence: '…这也是本文将要深入探讨的核心命题。',
    nextGoal: '通过案例研究展示数据分析的实际应用',
    missingInfo: [
      {
        topic: '2024年行业数据统计报告',
        reason: 'draft',
        priority: 'high',
        blocking: true,
        related_section: _nodeId,
      },
      {
        topic: '竞争对手分析方法论',
        reason: 'draft',
        priority: 'medium',
        blocking: false,
        related_section: _nodeId,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContextPanel({ nodeId, hasConflict, conflictMessage }: ContextPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const hoverZoneRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextData = mockContextData(nodeId);

  // Force-open when consistency engine detects a conflict.
  useEffect(() => {
    if (hasConflict) {
      setForceOpen(true);
      setIsOpen(true);
    }
  }, [hasConflict]);

  // Clear force-open after user dismisses it once.
  const handleDismissConflict = useCallback(() => {
    setForceOpen(false);
    if (!hasConflict) {
      setIsOpen(false);
    }
  }, [hasConflict]);

  const handleMouseEnter = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (forceOpen) return;
    hideTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 300);
  }, [forceOpen]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // -------------------------------------------------------------------
  // Section renderer helpers
  // -------------------------------------------------------------------

  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="border-b border-gray-100 px-4 py-4 last:border-b-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <>
      {/* Hover activation zone — a thin strip at the right edge of the screen */}
      <div
        ref={hoverZoneRef}
        onMouseEnter={handleMouseEnter}
        className="fixed right-0 top-0 z-30 h-full w-3"
        aria-hidden
      />

      {/* Sliding panel */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`
          fixed right-0 top-0 z-30 flex h-full w-[280px] flex-col border-l
          border-gray-200 bg-white shadow-lg transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-[280px]'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">写作上下文</h2>

          {hasConflict && (
            <button
              type="button"
              onClick={handleDismissConflict}
              className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200"
              title={conflictMessage ?? '检测到冲突'}
            >
              <svg
                className="h-3.5 w-3.5"
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
              冲突
            </button>
          )}
        </div>

        {/* Conflict message banner */}
        {hasConflict && conflictMessage && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs leading-relaxed text-amber-800">{conflictMessage}</p>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* 当前约束 */}
          <Section title="当前约束">
            <ul className="space-y-1.5">
              <li className="flex gap-2">
                <span className="flex-shrink-0 text-gray-400">语气:</span>
                <span>{contextData.tone}</span>
              </li>
              <li>
                <span className="mb-1 block text-gray-400">避免:</span>
                <ul className="ml-2 space-y-0.5">
                  {contextData.avoidList.map((item) => (
                    <li key={item} className="text-red-600">
                      ✗ {item}
                    </li>
                  ))}
                </ul>
              </li>
              <li>
                <span className="mb-1 block text-gray-400">核心信息:</span>
                <p className="text-gray-700">{contextData.coreMessage}</p>
              </li>
            </ul>
          </Section>

          {/* 前一节 */}
          <Section title="前一节">
            {contextData.previousGoal ? (
              <div className="space-y-2">
                <p className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  {contextData.previousGoal}
                </p>
                {contextData.previousLastSentence && (
                  <p className="border-l-2 border-blue-300 pl-3 text-xs italic text-gray-500">
                    {contextData.previousLastSentence}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">（无前一节 — 这是第一章）</p>
            )}
          </Section>

          {/* 下一节 */}
          <Section title="下一节">
            {contextData.nextGoal ? (
              <p className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                {contextData.nextGoal}
              </p>
            ) : (
              <p className="text-xs text-gray-400">（无下一节 — 这是最后一章）</p>
            )}
          </Section>

          {/* 知识缺口 */}
          <Section title="知识缺口">
            {contextData.missingInfo.length > 0 ? (
              <ul className="space-y-2">
                {contextData.missingInfo.map((item) => (
                  <li
                    key={item.topic}
                    className={`
                      rounded-md px-3 py-2 text-xs
                      ${
                        item.blocking
                          ? 'border border-red-200 bg-red-50 text-red-700'
                          : 'bg-gray-50 text-gray-600'
                      }
                    `}
                  >
                    <div className="flex items-center gap-1.5">
                      {item.blocking && (
                        <svg
                          className="h-3 w-3 flex-shrink-0 text-red-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      <span className="font-medium">{item.topic}</span>
                    </div>
                    <p className="mt-1 text-[11px] opacity-70">
                      优先级:{' '}
                      {item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                      {item.blocking && ' · 阻塞中'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-green-600">✓ 所有知识点已覆盖</p>
            )}
          </Section>
        </div>
      </aside>
    </>
  );
}
