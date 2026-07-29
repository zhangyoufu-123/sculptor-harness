'use client';

import React, { useEffect, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovedNodeProps {
  /** The structure section ID (for lifecycle transitions). */
  nodeId: string;
  /** The approved content to display read-only. */
  content: string;
  /** When true, no next node exists — suppress auto-advance. */
  isLastNode: boolean;
  /** Called when the user clicks "解锁修改". */
  onUnlock: () => void;
  /** Called to navigate to the next node (auto or manual). */
  onNext: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Seconds before auto-loading the next node (unless last node). */
const AUTO_NEXT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApprovedNode({ content, isLastNode, onUnlock, onNext }: ApprovedNodeProps) {
  const [autoSkipped, setAutoSkipped] = useState(false);

  // Auto-load next node after short delay (non-last only)
  useEffect(() => {
    if (isLastNode) return;

    const timer = setTimeout(() => {
      setAutoSkipped(true);
      onNext();
    }, AUTO_NEXT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isLastNode, onNext]);

  const handleManualNext = useCallback(() => {
    setAutoSkipped(true);
    onNext();
  }, [onNext]);

  return (
    <div className="flex flex-col h-full bg-green-50">
      {/* ---- Top badge ---- */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-green-200 bg-white">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold text-green-800 bg-green-100 rounded-full">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            已确认
          </span>
          <span className="text-xs text-gray-400">{autoSkipped ? '' : '即将自动加载下一节…'}</span>
        </div>

        <button
          type="button"
          onClick={onUnlock}
          className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors"
        >
          解锁修改
        </button>
      </div>

      {/* ---- Read-only content ---- */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto bg-white border border-green-200 rounded-lg shadow-sm p-6">
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap select-none">
            {content || <span className="text-gray-400 italic">（暂无内容）</span>}
          </div>
        </div>
      </div>

      {/* ---- Bottom: navigation ---- */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-green-200 bg-white">
        <div className="text-sm text-gray-400">← 上一节</div>

        {isLastNode ? (
          <div className="text-sm font-medium text-green-700">🎉 这是最后一节</div>
        ) : (
          <button
            type="button"
            onClick={handleManualNext}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shadow-sm"
          >
            下一节 →
          </button>
        )}
      </div>
    </div>
  );
}
