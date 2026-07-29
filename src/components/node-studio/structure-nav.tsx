'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { StructureSection, DraftState } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Draft-state indicator mapping
// ---------------------------------------------------------------------------

const DRAFT_STATE_INDICATOR: Record<
  DraftState,
  { symbol: string; label: string; className: string }
> = {
  empty: { symbol: '○', label: '待处理', className: 'text-gray-400' },
  planned: { symbol: '◑', label: '已规划', className: 'text-yellow-500' },
  generating: { symbol: '◑', label: '生成中', className: 'text-blue-500 animate-pulse' },
  drafted: { symbol: '●', label: '已完成', className: 'text-green-500' },
  reviewing: { symbol: '●', label: '审核中', className: 'text-purple-500' },
  approved: { symbol: '✓', label: '已通过', className: 'text-emerald-600' },
  locked: { symbol: '🔒', label: '已锁定', className: 'text-gray-600' },
};

// Count a node as "completed" for the progress bar.
const COMPLETED_STATES: ReadonlySet<DraftState> = new Set<DraftState>([
  'drafted',
  'reviewing',
  'approved',
  'locked',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StructureNavProps {
  sections: StructureSection[];
  currentNodeId: string;
  onNodeSelect: (id: string) => void;
  onInsertNode?: (afterId: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  afterId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StructureNav({
  sections,
  currentNodeId,
  onNodeSelect,
  onInsertNode,
}: StructureNavProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    afterId: '',
  });

  // ---- Progress ----
  const progress = useMemo(() => {
    const total = sections.length;
    if (total === 0) return { completed: 0, total: 0, text: '0/0 已完成' };
    const completed = sections.filter((s) => COMPLETED_STATES.has(s.draft_state)).length;
    return { completed, total, text: `${completed}/${total} 已完成` };
  }, [sections]);

  // ---- Right-click handler ----
  const handleContextMenu = useCallback((e: React.MouseEvent, afterId: string) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, afterId });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleInsert = useCallback(() => {
    if (onInsertNode) {
      onInsertNode(contextMenu.afterId);
    }
    closeContextMenu();
  }, [onInsertNode, contextMenu.afterId, closeContextMenu]);

  // ---- Flatten sections (including children for tree view) ----
  const flattenSections = useCallback(
    (nodes: StructureSection[], depth: number = 0): Array<StructureSection & { depth: number }> => {
      const result: Array<StructureSection & { depth: number }> = [];
      for (const node of nodes) {
        result.push({ ...node, depth });
        if (node.children && node.children.length > 0) {
          result.push(...flattenSections(node.children, depth + 1));
        }
      }
      return result;
    },
    [],
  );

  const flatNodes = useMemo(() => flattenSections(sections), [sections, flattenSections]);

  // ---- Render ----
  return (
    <div className="flex h-full flex-col bg-white">
      {/* Progress bar */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
          <span>写作进度</span>
          <span className="font-medium text-gray-700">{progress.text}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{
              width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Section tree */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {/* Header row for insertion above the first node */}
          <li
            className="cursor-context-menu rounded px-3 py-0.5 text-center text-[11px] text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-400"
            onContextMenu={(e) => handleContextMenu(e, '__before_first__')}
          >
            ↑ 在此上方插入新部分
          </li>

          {flatNodes.map((node) => {
            const indicator = DRAFT_STATE_INDICATOR[node.draft_state];
            const isCurrent = node.id === currentNodeId;

            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onNodeSelect(node.id)}
                  onContextMenu={(e) => handleContextMenu(e, node.id)}
                  className={`
                    group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm
                    transition-colors duration-150
                    ${
                      isCurrent
                        ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200'
                        : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                  style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                >
                  {/* Draft-state indicator */}
                  <span
                    className={`flex-shrink-0 text-base leading-none ${indicator.className}`}
                    title={indicator.label}
                  >
                    {indicator.symbol}
                  </span>

                  {/* Node title */}
                  <span
                    className={`
                      flex-1 truncate
                      ${isCurrent ? 'font-semibold' : 'font-normal'}
                    `}
                  >
                    {node.title}
                  </span>
                </button>

                {/* Insertion point between nodes */}
                <div
                  className="cursor-context-menu mx-3 my-0.5 rounded py-0.5 text-center text-[10px] text-transparent transition-colors hover:bg-gray-100 hover:text-gray-400"
                  onContextMenu={(e) => handleContextMenu(e, node.id)}
                >
                  ↓ 在此插入新部分
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Context menu */}
      {contextMenu.visible && (
        <>
          {/* Click-outside backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeContextMenu();
            }}
          />

          <div
            className="fixed z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={handleInsert}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              在此插入新部分
            </button>
          </div>
        </>
      )}
    </div>
  );
}
