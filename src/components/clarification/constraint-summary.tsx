'use client';

import { useMemo } from 'react';
import type { PCSState, PCSField, FieldStatus } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldEntry {
  layer: string;
  field: string;
  label: string;
  pcsField: PCSField;
}

interface ConstraintSummaryProps {
  pcsState: PCSState;
  /** Called when user confirms all constraints and wants to proceed. */
  onConfirm: () => void;
  /** Called when user wants to revise a specific dimension. */
  onRevise: (dimension: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPCSField(value: unknown): value is PCSField {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  return 'status' in value && 'value' in value;
}

function flattenFields(layer: string, obj: Record<string, unknown>): FieldEntry[] {
  const entries: FieldEntry[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (isPCSField(val)) {
      entries.push({
        layer,
        field: key,
        label: FIELD_LABELS[key] ?? key,
        pcsField: val,
      });
    }
  }
  return entries;
}

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
  tone: '语气风格',
  voice: '叙述声音',
  avoid: '避免元素',
  style_reference: '风格参考',
  format_reference: '格式参考',
  thinking_reference: '思维参考',
};

const STATUS_CONFIG: Record<FieldStatus, { label: string; cls: string }> = {
  confirmed: {
    label: '✓ 已确认',
    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  proposed: {
    label: '○ 待确认',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  assumed: {
    label: '⚠ 假设值',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  deprecated: {
    label: '✗ 已弃用',
    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
  locked: {
    label: '🔒 已锁定',
    cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
};

const LAYER_DISPLAY_ORDER: Array<{ key: string; label: string }> = [
  { key: 'intent', label: '意图层 · Intent' },
  { key: 'audience', label: '受众层 · Audience' },
  { key: 'constraint', label: '约束层 · Constraint' },
  { key: 'expression', label: '表达层 · Expression' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConstraintSummary({
  pcsState,
  onConfirm,
  onRevise,
}: ConstraintSummaryProps) {
  // Flatten all PCSField entries across display layers
  const allFields = useMemo(() => {
    const entries: FieldEntry[] = [];
    for (const { key } of LAYER_DISPLAY_ORDER) {
      const layerObj = (pcsState as unknown as Record<string, unknown>)[key];
      if (layerObj !== null && layerObj !== undefined && typeof layerObj === 'object') {
        entries.push(...flattenFields(key, layerObj as Record<string, unknown>));
      }
    }
    return entries;
  }, [pcsState]);

  const unconfirmedCount = allFields.filter(
    (f) => f.pcsField.status !== 'confirmed' && f.pcsField.status !== 'locked',
  ).length;

  const formatValue = (field: PCSField): string => {
    if (Array.isArray(field.value)) {
      return field.value.length > 0 ? field.value.join('、') : '（空）';
    }
    if (field.value === '' || field.value === null || field.value === undefined) {
      return '（未填写）';
    }
    return String(field.value);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* ---------- Header ---------- */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">约束确认摘要</h2>
        <p className="text-gray-500 dark:text-gray-400">
          以下是根据你的回答汇总的创作约束。请确认无误后继续，或返回修改。
        </p>
        {unconfirmedCount > 0 && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400 font-medium">
            还有 {unconfirmedCount} 个字段需要确认
          </p>
        )}
      </div>

      {/* ---------- Layer-by-layer summary ---------- */}
      {LAYER_DISPLAY_ORDER.map(({ key, label }) => {
        const layerFields = allFields.filter((f) => f.layer === key);
        if (layerFields.length === 0) return null;

        return (
          <div key={key} className="mb-6">
            {/* Layer header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {label}
              </h3>
              <button
                onClick={() => onRevise(key)}
                className="
                  text-xs font-medium text-blue-600 dark:text-blue-400
                  hover:underline
                "
              >
                返回修改
              </button>
            </div>

            {/* Field rows */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              {layerFields.map((entry, idx) => (
                <div
                  key={`${entry.layer}.${entry.field}`}
                  className={`
                    flex items-center justify-between px-5 py-3
                    ${
                      idx < layerFields.length - 1
                        ? 'border-b border-gray-100 dark:border-gray-700/50'
                        : ''
                    }
                    ${
                      entry.pcsField.status === 'assumed'
                        ? 'bg-amber-50/40 dark:bg-amber-900/10'
                        : ''
                    }
                  `}
                >
                  {/* Left: label + value */}
                  <div className="min-w-0 flex-1 mr-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {entry.label}
                    </p>
                    <p
                      className={`
                        mt-0.5 text-sm truncate
                        ${
                          entry.pcsField.value === '' || entry.pcsField.value === null
                            ? 'text-gray-400 dark:text-gray-500 italic'
                            : 'text-gray-900 dark:text-gray-100'
                        }
                      `}
                      title={formatValue(entry.pcsField)}
                    >
                      {formatValue(entry.pcsField)}
                    </p>
                  </div>

                  {/* Right: status badge */}
                  <span
                    className={`
                      shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${STATUS_CONFIG[entry.pcsField.status]?.cls ?? 'bg-gray-100 text-gray-600'}
                    `}
                  >
                    {STATUS_CONFIG[entry.pcsField.status]?.label ?? entry.pcsField.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ---------- Actions ---------- */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
        <button
          onClick={onConfirm}
          className="
            w-full sm:w-auto px-8 py-3 rounded-xl text-lg font-semibold
            bg-blue-600 text-white
            hover:bg-blue-700 active:bg-blue-800
            transition-colors shadow-md hover:shadow-lg
          "
        >
          确认并继续
        </button>
        <button
          onClick={() => onRevise('intent')}
          className="
            w-full sm:w-auto px-8 py-3 rounded-xl text-lg font-medium
            border border-gray-300 dark:border-gray-600
            text-gray-700 dark:text-gray-300
            bg-white dark:bg-gray-800
            hover:bg-gray-50 dark:hover:bg-gray-700
            transition-colors
          "
        >
          返回修改
        </button>
      </div>
    </div>
  );
}
