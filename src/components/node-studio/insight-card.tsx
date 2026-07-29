'use client';

import React, { useState } from 'react';

interface InsightCardProps {
  /** Type of insight detected */
  type: 'missing_case' | 'missing_data' | 'goal_drift' | 'transition_weak';
  /** Human-readable suggestion */
  message: string;
  /** Which paragraph this insight applies to */
  paragraphIndex: number;
  /** Callback when user clicks "generate suggestion" */
  onGenerate?: () => void;
  /** Callback when user dismisses */
  onDismiss?: () => void;
}

/**
 * Non-intrusive insight card displayed alongside a paragraph.
 * Triggered by Insight Generator when it detects structural gaps.
 */
export default function InsightCard({
  type,
  message,
  paragraphIndex: _paragraphIndex,
  onGenerate,
  onDismiss,
}: InsightCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const typeLabel: Record<string, string> = {
    missing_case: '缺少案例',
    missing_data: '缺少数据',
    goal_drift: '目标偏离',
    transition_weak: '衔接薄弱',
  };

  const typeColor: Record<string, string> = {
    missing_case: 'border-l-amber-400 bg-amber-50',
    missing_data: 'border-l-blue-400 bg-blue-50',
    goal_drift: 'border-l-orange-400 bg-orange-50',
    transition_weak: 'border-l-purple-400 bg-purple-50',
  };

  return (
    <div
      className={`my-2 p-3 border-l-4 rounded-r-lg text-sm ${typeColor[type] || 'border-l-gray-400 bg-gray-50'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-medium text-gray-700">{typeLabel[type] || type}</span>
          <p className="text-gray-600 mt-1">{message}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {onGenerate && (
            <button
              onClick={onGenerate}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              生成建议
            </button>
          )}
          <button
            onClick={() => {
              setDismissed(true);
              onDismiss?.();
            }}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
