'use client';

import { useState, useCallback } from 'react';
import type { StructureSection, NodeFunction, Hardness } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_FUNCTION_OPTIONS: Array<{ value: NodeFunction; label: string }> = [
  { value: 'introduce', label: '引入 Introduce' },
  { value: 'argument', label: '论点 Argument' },
  { value: 'evidence', label: '论据 Evidence' },
  { value: 'counter', label: '驳论 Counter' },
  { value: 'transition', label: '过渡 Transition' },
  { value: 'conclude', label: '总结 Conclude' },
  { value: 'elaborate', label: '阐述 Elaborate' },
];

const NODE_FUNCTION_LABELS: Record<NodeFunction, string> = {
  introduce: '引入',
  argument: '论点',
  evidence: '论据',
  counter: '驳论',
  transition: '过渡',
  conclude: '总结',
  elaborate: '阐述',
};

const HARDNESS_OPTIONS: Array<{ value: Hardness; label: string; icon: string }> = [
  { value: 'hard', label: '固定', icon: '🔒' },
  { value: 'soft', label: '可调', icon: '📝' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StructureEditorProps {
  /** The current list of structure sections. */
  sections: StructureSection[];
  /** Called whenever sections are modified. */
  onUpdate: (sections: StructureSection[]) => void;
  /** Called when user locks in the blueprint. */
  onConfirm: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StructureEditor({ sections, onUpdate, onConfirm }: StructureEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // -----------------------------------------------------------------------
  // Reorder
  // -----------------------------------------------------------------------

  const moveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const updated = [...sections];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      // Update order numbers
      updated.forEach((s, i) => {
        s.order = i;
      });
      onUpdate(updated);
    },
    [sections, onUpdate],
  );

  const moveDown = useCallback(
    (index: number) => {
      if (index >= sections.length - 1) return;
      const updated = [...sections];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      updated.forEach((s, i) => {
        s.order = i;
      });
      onUpdate(updated);
    },
    [sections, onUpdate],
  );

  // -----------------------------------------------------------------------
  // Add section
  // -----------------------------------------------------------------------

  const handleAddSection = useCallback(
    (insertIndex?: number) => {
      const idx = insertIndex ?? sections.length;
      const newSection: StructureSection = {
        id: generateId(),
        title: newTitle.trim() || `新部分 ${idx + 1}`,
        goal: '',
        function: 'argument',
        hardness: 'soft',
        draft_state: 'empty',
        content_draft: '',
        pcs_status: 'assumed',
        source: 'user',
        confidence: 0.5,
        order: idx,
      };
      const updated = [...sections];
      updated.splice(idx, 0, newSection);
      // Re-index orders
      updated.forEach((s, i) => {
        s.order = i;
      });
      onUpdate(updated);
      setNewTitle('');
    },
    [sections, newTitle, onUpdate],
  );

  // -----------------------------------------------------------------------
  // Delete section
  // -----------------------------------------------------------------------

  const handleDeleteConfirm = useCallback(
    (id: string) => {
      setDeleteConfirmId(null);
      const updated = sections.filter((s) => s.id !== id);
      updated.forEach((s, i) => {
        s.order = i;
      });
      onUpdate(updated);
    },
    [sections, onUpdate],
  );

  // -----------------------------------------------------------------------
  // Edit section fields
  // -----------------------------------------------------------------------

  const handleEditField = useCallback(
    (id: string, field: 'goal' | 'function' | 'title', value: string) => {
      const updated = sections.map((s) => {
        if (s.id !== id) return s;
        return { ...s, [field]: value } as StructureSection;
      });
      onUpdate(updated);
    },
    [sections, onUpdate],
  );

  const handleHardnessToggle = useCallback(
    (id: string) => {
      const updated = sections.map((s) => {
        if (s.id !== id) return s;
        const toggled: Hardness = s.hardness === 'hard' ? 'soft' : 'hard';
        return { ...s, hardness: toggled } as StructureSection;
      });
      onUpdate(updated);
    },
    [sections, onUpdate],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* ---------- Header ---------- */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">大纲编辑</h2>
        <p className="text-gray-500 dark:text-gray-400">
          调整你文章的结构、顺序和各部分的目标与功能
        </p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500 font-mono">
          {sections.length} 个部分 · 拖拽排序即将到来
        </p>
      </div>

      {/* ---------- Section list ---------- */}
      {sections.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-lg mb-2">还没有任何部分</p>
          <p className="text-sm">点击下方按钮添加你的第一个大纲节点</p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {sections.map((section, index) => {
            const isExpanded = expandedId === section.id;
            const isDeleting = deleteConfirmId === section.id;
            const hardnessCfg =
              HARDNESS_OPTIONS.find((h) => h.value === section.hardness) ?? HARDNESS_OPTIONS[1];

            return (
              <div
                key={section.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
              >
                {/* Row header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Order number */}
                  <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-6 text-center">
                    {index + 1}
                  </span>

                  {/* Up / down arrows */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className="text-xs leading-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="上移"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      disabled={index === sections.length - 1}
                      className="text-xs leading-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="下移"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Title + badge */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => toggleExpand(section.id)}
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {section.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {section.goal ? section.goal.slice(0, 40) : '（无目标）'}
                      </span>
                    </div>
                  </div>

                  {/* Function badge */}
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                    {NODE_FUNCTION_LABELS[section.function]}
                  </span>

                  {/* Hardness indicator */}
                  <button
                    onClick={() => handleHardnessToggle(section.id)}
                    className="text-sm shrink-0"
                    title={`${hardnessCfg.label} — 点击切换`}
                  >
                    {hardnessCfg.icon}
                  </button>

                  {/* Delete button */}
                  {isDeleting ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDeleteConfirm(section.id)}
                        className="text-xs font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        确认删除
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(section.id);
                      }}
                      className="text-sm text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      title="删除此部分"
                    >
                      🗑
                    </button>
                  )}
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700/50">
                    {/* Title edit */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        标题
                      </label>
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => handleEditField(section.id, 'title', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                      />
                    </div>

                    {/* Goal edit */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        目标
                      </label>
                      <input
                        type="text"
                        value={section.goal}
                        onChange={(e) => handleEditField(section.id, 'goal', e.target.value)}
                        placeholder="这部分要实现什么目标？"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                      />
                    </div>

                    {/* Function select */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        功能角色
                      </label>
                      <select
                        value={section.function}
                        onChange={(e) => handleEditField(section.id, 'function', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                      >
                        {NODE_FUNCTION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Add new section ---------- */}
      <div className="flex items-center gap-3 mb-8">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddSection();
          }}
          placeholder="新部分标题..."
          className="
            flex-1 rounded-xl border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-800 px-4 py-2.5
            text-sm text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-500
            focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none
          "
        />
        <button
          onClick={() => handleAddSection()}
          className="
            shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold
            bg-indigo-600 text-white
            hover:bg-indigo-700 active:bg-indigo-800
            transition-colors shadow-sm
          "
        >
          添加新部分
        </button>
      </div>

      {/* ---------- Confirm button ---------- */}
      <div className="text-center">
        <button
          onClick={onConfirm}
          disabled={sections.length === 0}
          className="
            px-10 py-3 rounded-xl text-lg font-semibold
            bg-blue-600 text-white
            hover:bg-blue-700 active:bg-blue-800
            disabled:bg-gray-300 disabled:text-gray-500
            dark:disabled:bg-gray-700 dark:disabled:text-gray-400
            transition-colors shadow-md hover:shadow-lg
          "
        >
          确认大纲
        </button>
        {sections.length === 0 && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">请至少添加一个部分</p>
        )}
      </div>
    </div>
  );
}
