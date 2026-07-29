'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { usePCS } from '@/hooks/use-pcs';
import AIToolbar from '@/components/node-studio/ai-toolbar';
import BackgroundGuardian from '@/components/node-studio/background-guardian';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftedNodeProps {
  /** The structure section ID (maps to PCS updateSectionContent sectionId). */
  nodeId: string;
  /** Initial content for this node. */
  content: string;
  /** The node's goal statement (shown in collapsible top bar). */
  goal: string;
  /** Callback when user clicks "完成此部分 →". */
  onComplete: () => void;
}

interface SelectionRect {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_SAVE_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DraftedNode({
  nodeId,
  content: initialContent,
  goal,
  onComplete,
}: DraftedNodeProps) {
  const pcs = usePCS();

  // ---- local editor state -------------------------------------------------
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draftText, setDraftText] = useState<string>(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [goalExpanded, setGoalExpanded] = useState(false);

  // ---- AI toolbar state ---------------------------------------------------
  const [selectedText, setSelectedText] = useState<string>('');
  const [toolbarPosition, setToolbarPosition] = useState<SelectionRect | null>(null);

  // ---- conflict-warning state ---------------------------------------------
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  // ---- one-line goal summary ----------------------------------------------
  const goalPreview = useMemo(() => {
    if (!goal) return '无目标描述';
    if (goal.length <= 60) return goal;
    return goal.slice(0, 60).trimEnd() + '…';
  }, [goal]);

  // ---- save helpers -------------------------------------------------------
  const saveContent = useCallback(() => {
    if (!isDirty) return;
    pcs.updateSectionContent(nodeId, draftText);
    setIsDirty(false);
  }, [isDirty, nodeId, draftText, pcs]);

  // ---- auto-save interval (every 30 s) ------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      saveContent();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [saveContent]);

  // ---- text selection → toolbar -------------------------------------------
  const handleSelectionChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Small delay so DOM reflects the new selection
    requestAnimationFrame(() => {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value.slice(start, end).trim();

      if (text.length === 0) {
        setSelectedText('');
        setToolbarPosition(null);
        return;
      }

      setSelectedText(text);

      // Approximate caret position via a hidden measurement div approach:
      // Compute position relative to textarea.
      const rect = textarea.getBoundingClientRect();

      // Use a simple heuristic: coords near vertical center of selection.
      // For production, a hidden mirror div would give pixel-precise coords.
      const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight || '20');
      const textBefore = textarea.value.slice(0, start);
      const linesBefore = textBefore.split('\n').length - 1;
      const y = rect.top + linesBefore * lineHeight + window.scrollY + 4;

      // Approximate x from last line
      const lastLineStart = textBefore.lastIndexOf('\n') + 1;
      const col = start - lastLineStart;
      const charWidth = 8.5; // approximate monospace width
      const x = rect.left + col * charWidth + window.scrollX;

      setToolbarPosition({ x, y: y + lineHeight + 6 });
    });
  }, []);

  const handleBlur = useCallback(() => {
    saveContent();
  }, [saveContent]);

  // ---- AI operation completion --------------------------------------------
  const handleOperationComplete = useCallback((result: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);

    const newText = before + result + after;
    setDraftText(newText);
    setIsDirty(true);

    // Restore cursor position after the inserted result
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = before.length + result.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });

    setSelectedText('');
    setToolbarPosition(null);
  }, []);

  // ---- conflict handler ---------------------------------------------------
  const handleConflict = useCallback((message: string) => {
    setConflictMessage(message);
  }, []);

  // ---- keyboard: close toolbar on Escape ----------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setToolbarPosition(null);
        setSelectedText('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ---- "完成此部分" → navigate, save first --------------------------------
  const handleComplete = useCallback(() => {
    saveContent();
    onComplete();
  }, [saveContent, onComplete]);

  // ---- render -------------------------------------------------------------
  return (
    <BackgroundGuardian nodeId={nodeId} content={draftText} onConflict={handleConflict}>
      <div className="flex flex-col h-full bg-white">
        {/* ---- Conflict warning bar ---- */}
        {conflictMessage && (
          <div className="flex items-center gap-2 bg-yellow-100 border-b border-yellow-300 px-4 py-2 text-sm text-yellow-800">
            <span className="text-base">⚠️</span>
            <span>{conflictMessage}</span>
            <button
              type="button"
              className="ml-auto text-yellow-600 hover:text-yellow-900 text-xs underline"
              onClick={() => setConflictMessage(null)}
            >
              忽略
            </button>
          </div>
        )}

        {/* ---- Top bar: goal ---- */}
        <div className="border-b border-gray-200 px-4 py-2">
          <button
            type="button"
            onClick={() => setGoalExpanded((prev) => !prev)}
            className="flex items-center gap-2 w-full text-left text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span className="text-xs select-none">{goalExpanded ? '▾' : '▸'}</span>
            <span className="font-medium">本节目标：</span>
            <span className={goalExpanded ? '' : 'truncate'}>
              {goalExpanded ? goal : goalPreview}
            </span>
          </button>

          {goalExpanded && (
            <div className="mt-2 pl-6 text-sm text-gray-500 leading-relaxed">{goal}</div>
          )}
        </div>

        {/* ---- Main editing area ---- */}
        <div className="flex-1 relative px-2 py-2">
          <textarea
            ref={textareaRef}
            className="w-full h-full resize-none border-0 bg-transparent text-gray-800 text-base leading-relaxed p-4 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 rounded-md transition-shadow"
            placeholder="在此撰写内容…"
            value={draftText}
            onChange={(e) => {
              setDraftText(e.target.value);
              setIsDirty(true);
            }}
            onSelect={handleSelectionChange}
            onBlur={handleBlur}
            onMouseUp={handleSelectionChange}
          />

          {/* ---- AI Toolbar (floating) ---- */}
          {toolbarPosition && selectedText && (
            <AIToolbar
              selectedText={selectedText}
              onOperationComplete={handleOperationComplete}
              position={toolbarPosition}
            />
          )}
        </div>

        {/* ---- Bottom: transition preview + navigation ---- */}
        <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-gray-50">
          {/* Transition preview */}
          <div className="text-sm text-gray-400 italic flex-1">
            下一节将自然引出本节结论的延伸讨论…
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              ← 上一节
            </button>

            <button
              type="button"
              onClick={handleComplete}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shadow-sm"
            >
              完成此部分 →
            </button>
          </div>
        </div>
      </div>
    </BackgroundGuardian>
  );
}
