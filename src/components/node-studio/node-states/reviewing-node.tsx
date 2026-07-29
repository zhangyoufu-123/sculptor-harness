'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { ReviewIssue } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewingNodeProps {
  /** The structure section ID being reviewed. */
  nodeId: string;
  /** All review issues for this node. */
  issues: ReviewIssue[];
  /** Called when the user approves (ALL PASS or ignores warnings). */
  onApprove: () => void;
  /** Called when the user wants to go back and edit. */
  onReturn: () => void;
}

/** Rolled-up summary derived from issues. */
type ReviewOutcome =
  | { kind: 'loading' }
  | { kind: 'all-pass' }
  | { kind: 'warnings'; warnings: ReviewIssue[] }
  | { kind: 'blocking'; blockers: ReviewIssue[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeOutcome(issues: ReviewIssue[]): ReviewOutcome {
  if (issues.length === 0) return { kind: 'all-pass' };

  const blockers = issues.filter((i) => i.severity === 'blocking');
  if (blockers.length > 0) {
    return { kind: 'blocking', blockers };
  }

  const warnings = issues.filter((i) => i.severity === 'warning' || i.severity === 'pass');
  if (warnings.length > 0) {
    return { kind: 'warnings', warnings };
  }

  return { kind: 'all-pass' };
}

const DIMENSION_LABELS: Record<string, string> = {
  intent_satisfaction: '意图满足度',
  knowledge_coverage: '知识覆盖度',
  constraint_compliance: '约束合规性',
  expression_consistency: '表达一致性',
  structure_completeness: '结构完整性',
};

const SEVERITY_STYLES: Record<string, string> = {
  pass: 'text-green-600 bg-green-50 border-green-200',
  warning: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  blocking: 'text-red-700 bg-red-50 border-red-200',
};

const SEVERITY_LABELS: Record<string, string> = {
  pass: '通过',
  warning: '警告',
  blocking: '阻塞',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReviewingNode({ issues, onApprove, onReturn }: ReviewingNodeProps) {
  const [outcome, setOutcome] = useState<ReviewOutcome>({ kind: 'loading' });

  // Simulate review processing delay (1-2 s)
  useEffect(() => {
    const delay = 1000 + Math.random() * 1000; // 1-2 s
    const timer = setTimeout(() => {
      setOutcome(computeOutcome(issues));
    }, delay);

    return () => clearTimeout(timer);
  }, [issues]);

  // ---- warning issue list -------------------------------------------------
  const warningIssues = useMemo(() => issues.filter((i) => i.severity === 'warning'), [issues]);

  const blockingIssues = useMemo(() => issues.filter((i) => i.severity === 'blocking'), [issues]);

  // ---- render -------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-white p-6">
      {/* ---- Loading state ---- */}
      {outcome.kind === 'loading' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
          <p className="text-gray-500 text-sm">正在检查本部分内容…</p>
        </div>
      )}

      {/* ---- ALL PASS ---- */}
      {outcome.kind === 'all-pass' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-green-800">本部分已完成</h3>
          <p className="text-sm text-gray-500">所有检查均已通过</p>

          <button
            type="button"
            onClick={onApprove}
            className="mt-4 px-6 py-2.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors shadow-sm"
          >
            确认完成 ✓
          </button>
        </div>
      )}

      {/* ---- WARNINGS ---- */}
      {outcome.kind === 'warnings' && (
        <div className="flex flex-col flex-1 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-yellow-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01M12 3l9.66 16.5H2.34L12 3z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-yellow-800">
                发现 {warningIssues.length} 个警告
              </h3>
              <p className="text-sm text-yellow-600">建议修改，但不影响完成本部分</p>
            </div>
          </div>

          {/* Warning list */}
          <ul className="space-y-2 pl-1">
            {warningIssues.map((issue) => (
              <li
                key={issue.id}
                className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm"
              >
                <span className="text-yellow-600 shrink-0 mt-0.5">⚠️</span>
                <div>
                  <p className="text-yellow-900 font-medium">{issue.description}</p>
                  {issue.suggestion && (
                    <p className="text-yellow-700 mt-0.5 text-xs">建议：{issue.suggestion}</p>
                  )}
                  {issue.location && (
                    <p className="text-yellow-600 mt-0.5 text-xs">位置：{issue.location}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Action buttons */}
          <div className="mt-auto flex items-center justify-center gap-4 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onReturn}
              className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              返回修改
            </button>
            <button
              type="button"
              onClick={onApprove}
              className="px-5 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700 transition-colors shadow-sm"
            >
              忽略，确认完成
            </button>
          </div>
        </div>
      )}

      {/* ---- BLOCKING ---- */}
      {outcome.kind === 'blocking' && (
        <div className="flex flex-col flex-1 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-800">
                发现 {blockingIssues.length} 个阻塞问题
              </h3>
              <p className="text-sm text-red-600">必须修改后才能完成本部分</p>
            </div>
          </div>

          {/* Blocking list */}
          <ul className="space-y-2 pl-1">
            {blockingIssues.map((issue) => (
              <li
                key={issue.id}
                className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm"
              >
                <span className="text-red-600 shrink-0 mt-0.5">✗</span>
                <div>
                  <p className="text-red-900 font-medium">{issue.description}</p>
                  {issue.suggestion && (
                    <p className="text-red-700 mt-0.5 text-xs">建议：{issue.suggestion}</p>
                  )}
                  {issue.location && (
                    <p className="text-red-600 mt-0.5 text-xs">位置：{issue.location}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Action */}
          <div className="mt-auto flex items-center justify-center pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onReturn}
              className="px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors shadow-sm"
            >
              返回修改
            </button>
          </div>
        </div>
      )}

      {/* ---- Check summary (all dimensions) ---- */}
      {outcome.kind !== 'loading' && (
        <div className="mt-6 border-t border-gray-200 pt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            检查摘要
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className={`flex items-center justify-between px-3 py-1.5 text-xs border rounded-md ${SEVERITY_STYLES[issue.severity] ?? 'text-gray-500'}`}
              >
                <span>{DIMENSION_LABELS[issue.dimension] ?? issue.dimension}</span>
                <span className="font-medium">
                  {SEVERITY_LABELS[issue.severity] ?? issue.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
