'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAIOperations } from '@/hooks/use-ai-operations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIToolbarProps {
  /** The currently selected text to operate on. */
  selectedText: string;
  /** Called with the AI-returned result (replaces selection). */
  onOperationComplete: (result: string) => void;
  /** Pixel position where the toolbar should appear. */
  position: { x: number; y: number };
}

interface ToolbarButton {
  key: string;
  label: string;
  operation: Parameters<ReturnType<typeof useAIOperations>['executeOperation']>[0];
  shortcut: string;
}

// ---------------------------------------------------------------------------
// Button definitions
// ---------------------------------------------------------------------------

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { key: 'condense', label: '精简', operation: 'condense', shortcut: 'Ctrl+Shift+1' },
  { key: 'expand', label: '展开', operation: 'expand', shortcut: 'Ctrl+Shift+2' },
  { key: 'retone', label: '改语气', operation: 'retone', shortcut: 'Ctrl+Shift+3' },
  { key: 'find_data', label: '找数据', operation: 'find_data', shortcut: 'Ctrl+Shift+4' },
  {
    key: 'check_consistency',
    label: '检查一致性',
    operation: 'check_consistency',
    shortcut: 'Ctrl+Shift+5',
  },
  { key: 'rewrite', label: '重写', operation: 'rewrite', shortcut: 'Ctrl+Shift+6' },
  {
    key: 'continue_writing',
    label: '续写',
    operation: 'continue_writing',
    shortcut: 'Ctrl+Shift+7',
  },
  {
    key: 'insert_continuation',
    label: '插入续写',
    operation: 'insert_continuation',
    shortcut: 'Ctrl+Shift+8',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AIToolbar({ selectedText, onOperationComplete, position }: AIToolbarProps) {
  const aiOps = useAIOperations();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // ---- Adjust position so the toolbar stays within the viewport -----------
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) {
      setAdjustedPosition(position);
      return;
    }

    const rect = el.getBoundingClientRect();
    let { x, y } = position;

    // Keep within viewport horizontally
    if (x + rect.width > window.innerWidth - 12) {
      x = window.innerWidth - rect.width - 12;
    }
    if (x < 12) x = 12;

    // Flip above if toolbar would overflow bottom
    if (y + rect.height > window.innerHeight - 12) {
      y = position.y - rect.height - 24; // above selection
    }
    if (y < 12) y = 12;

    setAdjustedPosition({ x, y });
  }, [position]);

  // ---- Execute operation --------------------------------------------------
  const handleOperation = useCallback(
    async (btn: ToolbarButton) => {
      if (aiOps.isProcessing) return;

      setActiveOperation(btn.key);
      try {
        const result = await aiOps.executeOperation(btn.operation, selectedText);
        onOperationComplete(result);
      } catch {
        // Error already surfaced via aiOps.lastError — caller may inspect
      } finally {
        setActiveOperation(null);
      }
    },
    [aiOps, selectedText, onOperationComplete],
  );

  // ---- Keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;

      const index = Number.parseInt(e.key, 10);
      if (Number.isNaN(index) || index < 1 || index > TOOLBAR_BUTTONS.length) return;

      e.preventDefault();
      const btn = TOOLBAR_BUTTONS[index - 1];
      if (!btn) return;

      void handleOperation(btn);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleOperation]);

  // ---- render -------------------------------------------------------------
  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg px-1.5 py-1.5 shadow-xl select-none"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      role="toolbar"
      aria-label="AI 操作工具栏"
    >
      {TOOLBAR_BUTTONS.map((btn) => {
        const isLoading = activeOperation === btn.key;

        return (
          <button
            key={btn.key}
            type="button"
            onClick={() => handleOperation(btn)}
            disabled={aiOps.isProcessing}
            title={`${btn.label} (${btn.shortcut})`}
            className={`
              relative flex flex-col items-center justify-center gap-0.5
              px-2 py-1 rounded text-[11px] font-medium leading-tight
              whitespace-nowrap transition-colors duration-150
              ${
                isLoading
                  ? 'bg-blue-600 text-white cursor-wait'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white active:bg-gray-700'
              }
              ${aiOps.isProcessing && !isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {/* Loading spinner */}
            {isLoading && (
              <span className="absolute inset-0 flex items-center justify-center bg-blue-600 rounded">
                <svg
                  className="w-3.5 h-3.5 animate-spin text-white"
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </span>
            )}

            <span className={isLoading ? 'invisible' : ''}>{btn.label}</span>
            <span className={`text-[9px] opacity-60 ${isLoading ? 'invisible' : ''}`}>
              {btn.shortcut.replace('Ctrl+Shift+', '^⇧')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
