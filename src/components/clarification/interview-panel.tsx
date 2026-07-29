'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIMENSIONS = ['Intent', 'Audience', 'Constraint', 'Expression'] as const;

const DIMENSION_MAP: Record<string, number> = {
  intent: 0,
  audience: 1,
  constraint: 2,
  expression: 3,
};

const DIMENSION_LABELS: Record<string, string> = {
  intent: '意图 · Intent',
  audience: '受众 · Audience',
  constraint: '约束 · Constraint',
  expression: '表达 · Expression',
};

/** Maximum sub-questions per dimension before auto-advancing. */
const MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InterviewPanelProps {
  /** The current dimension key being clarified. */
  dimension: string;
  /** The current question text. */
  question: string;
  /**
   * How many follow-up / sub-questions have been asked for this dimension
   * (0-indexed — 0 = first question, 1 = first sub-question).
   */
  attemptCount: number;
  /** Called when the user submits an answer. */
  onAnswer: (answer: string) => void;
  /** Called when the user wants to skip the current question. */
  onSkip: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InterviewPanel({
  dimension,
  question,
  attemptCount,
  onAnswer,
  onSkip,
}: InterviewPanelProps) {
  const [answer, setAnswer] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset input text when question changes
  useEffect(() => {
    setAnswer('');
    inputRef.current?.focus();
  }, [question]);

  const dimIndex = (DIMENSION_MAP[dimension] ?? 0) + 1;
  const dimLabel = DIMENSION_LABELS[dimension] ?? dimension;
  const remaining = MAX_ATTEMPTS - attemptCount;

  const isSubmitting = answer.trim().length === 0;

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSubmit = useCallback(() => {
    const trimmed = answer.trim();
    if (trimmed.length === 0) return;
    onAnswer(trimmed);
  }, [answer, onAnswer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleSkipClick = useCallback(() => {
    setAnswer('');
    onSkip();
  }, [onSkip]);

  const handleDontKnow = useCallback(() => {
    onAnswer('不知道');
  }, [onAnswer]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-8">
      {/* ---------- Dimension badge + progress ---------- */}
      <div className="flex items-center gap-3 mb-6">
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {dimLabel}
        </span>
        <span className="text-sm text-gray-400 dark:text-gray-500 font-mono">
          维度 {dimIndex}/{DIMENSIONS.length} · 问题 {attemptCount + 1}/{MAX_ATTEMPTS + 1}
        </span>
      </div>

      {/* ---------- Progress bar ---------- */}
      <div className="w-full max-w-lg mb-8">
        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{
              width: `${(attemptCount / (MAX_ATTEMPTS + 1)) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* ---------- Question ---------- */}
      <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 text-center max-w-xl mb-8 leading-relaxed">
        {question}
      </p>

      {/* ---------- Answer input ---------- */}
      <div className="w-full max-w-lg mb-6">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的回答..."
            className="
              w-full rounded-xl border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-800 px-5 py-3.5 pr-28
              text-base text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-500
              shadow-sm transition-colors
              focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none
            "
          />
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="
              absolute right-2 top-1/2 -translate-y-1/2
              px-4 py-1.5 rounded-lg text-sm font-semibold
              bg-blue-600 text-white
              hover:bg-blue-700 active:bg-blue-800
              disabled:bg-gray-300 disabled:text-gray-500
              dark:disabled:bg-gray-700 dark:disabled:text-gray-400
              transition-colors
            "
          >
            确认
          </button>
        </div>
      </div>

      {/* ---------- Remaining attempts ---------- */}
      {remaining > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">剩余追问次数：{remaining}</p>
      )}
      {remaining === 0 && (
        <p className="text-xs text-amber-500 dark:text-amber-400 mb-4">
          已达到最大追问次数，回答后将自动进入下一维度
        </p>
      )}

      {/* ---------- Auxiliary actions ---------- */}
      <div className="flex gap-3">
        <button
          onClick={handleSkipClick}
          className="
            px-5 py-2 rounded-lg text-sm font-medium
            border border-gray-300 dark:border-gray-600
            text-gray-600 dark:text-gray-400
            bg-white dark:bg-gray-800
            hover:bg-gray-50 dark:hover:bg-gray-700
            transition-colors
          "
        >
          跳过此问题
        </button>
        <button
          onClick={handleDontKnow}
          className="
            px-5 py-2 rounded-lg text-sm font-medium
            border border-gray-300 dark:border-gray-600
            text-gray-600 dark:text-gray-400
            bg-white dark:bg-gray-800
            hover:bg-gray-50 dark:hover:bg-gray-700
            transition-colors
          "
        >
          我不知道
        </button>
      </div>
    </div>
  );
}
