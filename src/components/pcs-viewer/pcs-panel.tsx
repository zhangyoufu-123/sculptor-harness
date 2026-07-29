'use client';

import { useState, useCallback, useMemo } from 'react';
import type { PCSState, PCSField, FieldStatus, FieldSource, DecisionRecord } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PCSPanelProps {
  pcsState: PCSState;
  /** When true, fields can be edited in-place. */
  editable?: boolean;
  /** Called when user clicks to edit a field (editable mode). */
  onEdit?: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

type LayerId = 'intent' | 'audience' | 'constraint' | 'knowledge' | 'structure' | 'expression';

interface LayerConfig {
  id: LayerId;
  label: string;
  icon: string;
  color: string;
}

const LAYER_CONFIGS: LayerConfig[] = [
  { id: 'intent', label: '意图层 Intent', icon: '🎯', color: 'border-l-blue-500' },
  { id: 'audience', label: '受众层 Audience', icon: '👥', color: 'border-l-green-500' },
  { id: 'constraint', label: '约束层 Constraint', icon: '📏', color: 'border-l-amber-500' },
  { id: 'knowledge', label: '知识层 Knowledge', icon: '📚', color: 'border-l-purple-500' },
  { id: 'structure', label: '结构层 Structure', icon: '🏗️', color: 'border-l-indigo-500' },
  { id: 'expression', label: '表达层 Expression', icon: '🎨', color: 'border-l-pink-500' },
];

const STATUS_CONFIG: Record<FieldStatus, { label: string; cls: string }> = {
  confirmed: {
    label: '✓ 已确认',
    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  proposed: {
    label: '○ 提案',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  assumed: {
    label: '⚠ 假设',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  deprecated: {
    label: '✗ 弃用',
    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
  locked: {
    label: '🔒 锁定',
    cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
};

const SOURCE_CONFIG: Record<FieldSource, string> = {
  user: '用户',
  ai: 'AI',
  system: '系统',
};

const PHASE_LABELS: Record<string, string> = {
  initializing: '初始化中',
  clarifying: '澄清阶段',
  structured: '结构化',
  executing: '执行中',
  reviewing: '审核中',
  completed: '已完成',
};

const FIELD_LABELS: Record<string, string> = {
  purpose: '创作目的',
  core_message: '核心信息',
  desired_impact: '预期影响',
  target_emotion: '目标情感',
  audience_type: '受众类型',
  knowledge_level: '知识水平',
  relationship: '关系定位',
  pain_points: '痛点',
  type: '内容类型',
  platform: '发布平台',
  format: '格式',
  length_min: '最小字数',
  length_max: '最大字数',
  deadline: '截止日期',
  custom_constraints: '自定义约束',
  sources: '参考来源',
  tone: '语气风格',
  voice: '叙述声音',
  avoid: '避免元素',
  style_reference: '风格参考',
  format_reference: '格式参考',
  thinking_reference: '思维参考',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPCSField(value: unknown): value is PCSField {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  return 'status' in value && 'value' in value;
}

interface FieldEntry {
  key: string;
  path: string;
  label: string;
  pcsField: PCSField;
}

function extractFields(
  _layerId: string,
  obj: Record<string, unknown>,
  prefix: string,
): FieldEntry[] {
  const entries: FieldEntry[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (isPCSField(val)) {
      entries.push({
        key,
        path: `${prefix}${key}`,
        label: FIELD_LABELS[key] ?? key,
        pcsField: val,
      });
    }
  }
  return entries;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((v) => String(v)).join(', ') : '（空）';
  }
  if (value === '' || value === null || value === undefined) return '（未设置）';
  return String(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PCSPanel({ pcsState, editable = false, onEdit }: PCSPanelProps) {
  const [expandedLayers, setExpandedLayers] = useState<Set<LayerId>>(new Set<LayerId>(['intent']));
  const [selectedFieldPath, setSelectedFieldPath] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Mock decision history for display purposes
  const mockDecisionHistory: DecisionRecord[] = useMemo(
    () => [
      {
        id: 'dh-1',
        timestamp: pcsState.created_at,
        field_path: 'intent.core_message',
        old_value: null,
        new_value: pcsState.intent.core_message.value,
        reason: 'Initial idea capture',
        initiator: 'user',
        phase: 'initializing',
      },
    ],
    [pcsState],
  );

  // -----------------------------------------------------------------------
  // Layer toggle
  // -----------------------------------------------------------------------

  const toggleLayer = useCallback((layerId: LayerId) => {
    setExpandedLayers((prev) => {
      const next = new Set<LayerId>(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Extract layer data
  // -----------------------------------------------------------------------

  const getLayerFields = useCallback(
    (layerId: LayerId): FieldEntry[] => {
      const layerObj = (pcsState as unknown as Record<string, unknown>)[layerId];
      if (layerObj === null || layerObj === undefined || typeof layerObj !== 'object') return [];
      return extractFields(layerId, layerObj as Record<string, unknown>, `${layerId}.`);
    },
    [pcsState],
  );

  // -----------------------------------------------------------------------
  // Knowledge layer special display
  // -----------------------------------------------------------------------

  const getKnowledgeSummary = useCallback((): string => {
    const knowledge = pcsState.knowledge;
    const parts: string[] = [];
    if (knowledge.required_topics.length > 0) {
      parts.push(`${knowledge.required_topics.length} 个必需主题`);
    }
    if (knowledge.missing_information.length > 0) {
      parts.push(`${knowledge.missing_information.length} 个信息缺口`);
    }
    if (knowledge.sources.value.length > 0) {
      parts.push(`${knowledge.sources.value.length} 个参考来源`);
    }
    return parts.length > 0 ? parts.join(' · ') : '无知识数据';
  }, [pcsState]);

  const getStructureSummary = useCallback((): string => {
    const sections = pcsState.structure.sections;
    if (sections.length === 0) return '无大纲节点';
    return `${sections.length} 个节点 · ${sections.filter((s) => s.draft_state === 'approved').length} 已批准`;
  }, [pcsState]);

  // -----------------------------------------------------------------------
  // Export handler
  // -----------------------------------------------------------------------

  const handleExport = useCallback(() => {
    setShowExportMenu(false);
    const data = JSON.stringify(pcsState, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pcs-${pcsState.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pcsState]);

  // -----------------------------------------------------------------------
  // Field click → decision history mock
  // -----------------------------------------------------------------------

  const handleFieldClick = useCallback(
    (path: string) => {
      setSelectedFieldPath((prev) => (prev === path ? null : path));
      if (editable && onEdit) {
        onEdit(path);
      }
    },
    [editable, onEdit],
  );

  // -----------------------------------------------------------------------
  // Render field row
  // -----------------------------------------------------------------------

  const renderFieldRow = useCallback(
    (entry: FieldEntry, hasProposal: boolean) => {
      const statusCfg = STATUS_CONFIG[entry.pcsField.status] ?? STATUS_CONFIG.assumed;
      const isSelected = selectedFieldPath === entry.path;

      return (
        <div key={entry.path}>
          <button
            onClick={() => handleFieldClick(entry.path)}
            className={`
              w-full flex items-center gap-3 px-3 py-2 text-left
              hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors
              ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
              ${hasProposal ? 'ring-2 ring-orange-400 dark:ring-orange-500 rounded-lg' : ''}
            `}
          >
            {/* Label */}
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">
              {entry.label}
            </span>

            {/* Value */}
            <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate min-w-0">
              {formatValue(entry.pcsField.value)}
            </span>

            {/* Source */}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 w-8 text-center shrink-0">
              {SOURCE_CONFIG[entry.pcsField.source] ?? entry.pcsField.source}
            </span>

            {/* Status badge */}
            <span
              className={`
                shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium
                ${statusCfg.cls}
              `}
            >
              {statusCfg.label}
            </span>

            {/* Confidence */}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 w-10 text-right shrink-0 font-mono">
              {Math.round(entry.pcsField.confidence * 100)}%
            </span>
          </button>

          {/* Decision history flyout */}
          {isSelected && (
            <div className="mx-3 mb-2 mt-0.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                决策历史
              </p>
              {mockDecisionHistory.filter((r) => r.field_path === entry.path).length === 0 ? (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                  此字段暂无决策记录
                </p>
              ) : (
                <div className="space-y-1.5">
                  {mockDecisionHistory
                    .filter((r) => r.field_path === entry.path)
                    .map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-gray-400">
                          {new Date(r.timestamp).toLocaleDateString()}
                        </span>
                        <span className="text-gray-600 dark:text-gray-300">
                          {String(r.old_value).slice(0, 20)} → {String(r.new_value).slice(0, 20)}
                        </span>
                        <span className="text-gray-400">({r.reason})</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [selectedFieldPath, mockDecisionHistory, handleFieldClick],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto">
      {/* ---------- Header with phase + export ---------- */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`
              px-3 py-1 rounded-full text-xs font-semibold
              bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300
            `}
          >
            {PHASE_LABELS[pcsState.phase] ?? pcsState.phase}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
            {pcsState.id.slice(0, 8)}...
          </span>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowExportMenu((prev) => !prev)}
            className="
              px-3 py-1.5 rounded-lg text-xs font-medium
              border border-gray-300 dark:border-gray-600
              text-gray-600 dark:text-gray-400
              hover:bg-gray-50 dark:hover:bg-gray-700
              transition-colors
            "
          >
            导出 ↧
          </button>
          {showExportMenu && (
            <div
              className="
                absolute right-0 top-full mt-1 z-10
                rounded-lg border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 shadow-lg py-1 min-w-[140px]
              "
            >
              <button
                onClick={handleExport}
                className="
                  w-full text-left px-4 py-1.5 text-xs
                  text-gray-700 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-700
                  transition-colors
                "
              >
                JSON 导出
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Accordion layers ---------- */}
      <div className="space-y-2">
        {LAYER_CONFIGS.map((layer) => {
          const isExpanded = expandedLayers.has(layer.id);
          let fields: FieldEntry[] = [];
          let summary = '';

          if (layer.id === 'knowledge') {
            summary = getKnowledgeSummary();
          } else if (layer.id === 'structure') {
            summary = getStructureSummary();
          } else {
            fields = getLayerFields(layer.id);
            summary =
              fields.length > 0
                ? `${fields.filter((f) => f.pcsField.status === 'confirmed' || f.pcsField.status === 'locked').length}/${fields.length} 已确认`
                : '无字段';
          }

          const hasPending = fields.some(
            (f) => f.pcsField.proposal != null && f.pcsField.proposal.status === 'pending',
          );

          return (
            <div
              key={layer.id}
              className={`
                rounded-xl border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 overflow-hidden
                border-l-4 ${layer.color}
              `}
            >
              {/* Layer header */}
              <button
                onClick={() => toggleLayer(layer.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{layer.icon}</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {layer.label}
                  </span>
                  {hasPending && (
                    <span className="w-2 h-2 rounded-full bg-orange-400" title="有待处理提案" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{summary}</span>
                  <span
                    className={`
                      text-xs text-gray-400 transition-transform duration-200
                      ${isExpanded ? 'rotate-180' : ''}
                    `}
                  >
                    ▼
                  </span>
                </div>
              </button>

              {/* Layer body */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-700/50">
                  {layer.id === 'knowledge' ? (
                    /* Knowledge layer special display */
                    <div className="px-4 py-3 space-y-3">
                      {/* Sources field */}
                      {(() => {
                        const srcEntry = getLayerFields('knowledge').find(
                          (f) => f.key === 'sources',
                        );
                        if (srcEntry) {
                          return renderFieldRow(srcEntry, false);
                        }
                        return null;
                      })()}

                      {/* Required topics */}
                      {pcsState.knowledge.required_topics.length > 0 && (
                        <div className="pl-3">
                          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                            必需主题
                          </p>
                          <ul className="space-y-0.5">
                            {pcsState.knowledge.required_topics.map((t, i) => (
                              <li key={i} className="flex items-center gap-2 text-xs">
                                <span className={t.covered ? 'text-green-500' : 'text-amber-500'}>
                                  {t.covered ? '✓' : '○'}
                                </span>
                                <span className="text-gray-700 dark:text-gray-300">{t.topic}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Missing information */}
                      {pcsState.knowledge.missing_information.length > 0 && (
                        <div className="pl-3">
                          <p className="text-[11px] font-medium text-red-500 dark:text-red-400 mb-1">
                            信息缺口
                          </p>
                          <ul className="space-y-1">
                            {pcsState.knowledge.missing_information.map((item, i) => (
                              <li key={i} className="text-xs flex gap-2">
                                <span
                                  className={`
                                      shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium
                                      ${
                                        item.priority === 'high'
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                          : item.priority === 'medium'
                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                      }
                                    `}
                                >
                                  {item.priority}
                                </span>
                                <span className="text-gray-700 dark:text-gray-300">
                                  {item.topic}
                                </span>
                                {item.blocking && (
                                  <span className="text-red-500 text-[10px] font-medium">
                                    BLOCK
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : layer.id === 'structure' ? (
                    /* Structure layer summary */
                    <div className="px-4 py-3">
                      {pcsState.structure.sections.length === 0 ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                          尚未生成大纲
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {pcsState.structure.sections.map((section) => (
                            <li key={section.id} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-gray-400 w-5 text-right">
                                {section.order + 1}
                              </span>
                              <span className="text-gray-700 dark:text-gray-300">
                                {section.title}
                              </span>
                              <span
                                className={`
                                  shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium
                                  ${
                                    section.hardness === 'hard'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                  }
                                `}
                              >
                                {section.hardness}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    /* Default: PCSField rows */
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/30">
                      {fields.map((entry) => {
                        const hasProposal =
                          entry.pcsField.proposal != null &&
                          entry.pcsField.proposal.status === 'pending';
                        return renderFieldRow(entry, hasProposal);
                      })}
                      {fields.length === 0 && (
                        <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 italic">
                          该层没有可显示字段
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---------- Footer metadata ---------- */}
      <div className="mt-4 px-1 flex justify-between text-[10px] text-gray-400 dark:text-gray-500 font-mono">
        <span>创建: {new Date(pcsState.created_at).toLocaleString()}</span>
        <span>更新: {new Date(pcsState.updated_at).toLocaleString()}</span>
      </div>
    </div>
  );
}
