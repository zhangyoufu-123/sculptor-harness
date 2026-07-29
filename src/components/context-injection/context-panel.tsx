'use client';

import { useState, useCallback } from 'react';
import type { PCSState, MissingItem } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveTab = '3a' | '3b';

interface ContextPanelProps {
  pcsState: PCSState;
  /** Called when context injection is complete and user is ready to proceed. */
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Priority config
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  high: {
    label: '高优先',
    cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  medium: {
    label: '中优先',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  low: {
    label: '低优先',
    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContextPanel({ pcsState, onComplete }: ContextPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('3a');

  // --- 3A state ---
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceList, setSourceList] = useState<string[]>(pcsState.knowledge.sources.value ?? []);
  const [formatRef, setFormatRef] = useState(pcsState.expression.format_reference.value ?? '');
  const [thinkingRef, setThinkingRef] = useState(
    pcsState.expression.thinking_reference.value ?? '',
  );

  // --- 3B state ---
  const [sampleText, setSampleText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [styleResult, setStyleResult] = useState<{
    tone: string;
    phrases: string[];
    level: string;
  } | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // -----------------------------------------------------------------------
  // 3A Handlers
  // -----------------------------------------------------------------------

  const handleAddSource = useCallback(() => {
    const trimmed = sourceUrl.trim();
    if (trimmed.length === 0) return;
    setSourceList((prev) => [...prev, trimmed]);
    setSourceUrl('');
  }, [sourceUrl]);

  const handleRemoveSource = useCallback((index: number) => {
    setSourceList((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // -----------------------------------------------------------------------
  // 3B Handlers
  // -----------------------------------------------------------------------

  const handleAnalyzeStyle = useCallback(async () => {
    if (sampleText.trim().length === 0) return;
    setIsAnalyzing(true);
    try {
      // Simulate style-discovery analysis
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setStyleResult({
        tone: '分析型 + 略带叙事',
        phrases: ['值得注意的是', '进一步分析', '综上所述', '从数据来看'],
        level: '中高级阅读水平',
      });
    } catch {
      // ignore
    } finally {
      setIsAnalyzing(false);
    }
  }, [sampleText]);

  const handleApplyStyle = useCallback(async () => {
    if (!styleResult) return;
    setIsApplying(true);
    try {
      // Simulate creating a proposal for expression layer
      await new Promise((resolve) => setTimeout(resolve, 800));
      // In production: call usePCS().proposeField()
    } catch {
      // ignore
    } finally {
      setIsApplying(false);
    }
  }, [styleResult]);

  // -----------------------------------------------------------------------
  // Missing items
  // -----------------------------------------------------------------------

  const missingItems: MissingItem[] = pcsState.knowledge.missing_information ?? [];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* ---------- Header ---------- */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">上下文注入</h2>
        <p className="text-gray-500 dark:text-gray-400">为你的创作补充参考信息与风格指引</p>
      </div>

      {/* ---------- Tab bar ---------- */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab('3a')}
          className={`
            px-5 py-3 text-sm font-semibold border-b-2 transition-colors
            ${
              activeTab === '3a'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          参考资料
        </button>
        <button
          onClick={() => setActiveTab('3b')}
          className={`
            px-5 py-3 text-sm font-semibold border-b-2 transition-colors
            ${
              activeTab === '3b'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          风格发现
        </button>
      </div>

      {/* ================================================================= */}
      {/* TAB 3A — Context Injection                                       */}
      {/* ================================================================= */}
      {activeTab === '3a' && (
        <div className="space-y-6">
          {/* Source references */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              参考来源
            </h3>
            <div className="flex gap-2 mb-3">
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSource();
                }}
                placeholder="输入 URL 或文件路径..."
                className="
                  flex-1 rounded-lg border border-gray-300 dark:border-gray-600
                  bg-gray-50 dark:bg-gray-900 px-4 py-2.5
                  text-sm text-gray-900 dark:text-gray-100
                  placeholder-gray-400 dark:placeholder-gray-500
                  focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none
                "
              />
              <button
                onClick={handleAddSource}
                className="
                  px-4 py-2.5 rounded-lg text-sm font-semibold
                  bg-blue-600 text-white
                  hover:bg-blue-700 active:bg-blue-800
                  transition-colors
                "
              >
                添加
              </button>
            </div>

            {sourceList.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">暂无参考来源</p>
            ) : (
              <ul className="space-y-1.5">
                {sourceList.map((url, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400"
                  >
                    <button
                      onClick={() => handleRemoveSource(idx)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      title="移除"
                    >
                      ✕
                    </button>
                    <span className="truncate">{url}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Format reference */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              格式参考
            </label>
            <select
              value={formatRef}
              onChange={(e) => setFormatRef(e.target.value)}
              className="
                w-full rounded-lg border border-gray-300 dark:border-gray-600
                bg-gray-50 dark:bg-gray-900 px-4 py-2.5
                text-sm text-gray-900 dark:text-gray-100
                focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none
              "
            >
              <option value="">不指定</option>
              <option value="公众号文章">公众号文章</option>
              <option value="学术论文">学术论文</option>
              <option value="商业报告">商业报告</option>
              <option value="技术文档">技术文档</option>
              <option value="演讲稿">演讲稿</option>
              <option value="产品文案">产品文案</option>
            </select>
          </div>

          {/* Thinking pattern reference */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              思维模式参考
            </label>
            <textarea
              value={thinkingRef}
              onChange={(e) => setThinkingRef(e.target.value)}
              placeholder="描述你希望文章采用的思维模式或推理风格..."
              rows={3}
              className="
                w-full rounded-lg border border-gray-300 dark:border-gray-600
                bg-gray-50 dark:bg-gray-900 px-4 py-2.5
                text-sm text-gray-900 dark:text-gray-100
                placeholder-gray-400 dark:placeholder-gray-500
                resize-none
                focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none
              "
            />
          </div>

          {/* Knowledge gaps */}
          {missingItems.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                知识缺口
              </h3>
              <ul className="space-y-2">
                {missingItems.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-sm">
                    <span
                      className={`
                        shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium
                        ${PRIORITY_CONFIG[item.priority]?.cls ?? ''}
                      `}
                    >
                      {PRIORITY_CONFIG[item.priority]?.label ?? item.priority}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">{item.topic}</span>
                    {item.blocking && (
                      <span className="text-[11px] text-red-500 font-medium">阻塞</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3B — Style Discovery                                         */}
      {/* ================================================================= */}
      {activeTab === '3b' && (
        <div className="space-y-6">
          {/* Sample text input */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              风格样本
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              粘贴一段你欣赏的文字，系统将分析其风格特征
            </p>
            <textarea
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder="在此粘贴样本文字..."
              rows={5}
              className="
                w-full rounded-lg border border-gray-300 dark:border-gray-600
                bg-gray-50 dark:bg-gray-900 px-4 py-2.5
                text-sm text-gray-900 dark:text-gray-100
                placeholder-gray-400 dark:placeholder-gray-500
                resize-none
                focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none
              "
            />
            <button
              onClick={handleAnalyzeStyle}
              disabled={sampleText.trim().length === 0 || isAnalyzing}
              className="
                mt-3 px-5 py-2.5 rounded-lg text-sm font-semibold
                bg-indigo-600 text-white
                hover:bg-indigo-700 active:bg-indigo-800
                disabled:bg-gray-300 disabled:text-gray-500
                dark:disabled:bg-gray-700 dark:disabled:text-gray-400
                transition-colors flex items-center gap-2
              "
            >
              {isAnalyzing ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
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
                  分析中...
                </>
              ) : (
                '分析风格'
              )}
            </button>
          </div>

          {/* Results display */}
          {styleResult !== null && (
            <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10 p-5">
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">
                分析结果
              </h3>

              <div className="space-y-3">
                {/* Detected tone */}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">检测到的语气</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {styleResult.tone}
                  </p>
                </div>

                {/* Common phrases */}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">常用短语</p>
                  <div className="flex flex-wrap gap-1.5">
                    {styleResult.phrases.map((phrase, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                      >
                        {phrase}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Vocabulary level */}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">词汇水平</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {styleResult.level}
                  </p>
                </div>
              </div>

              {/* Apply style button */}
              <button
                onClick={handleApplyStyle}
                disabled={isApplying}
                className="
                  mt-4 px-5 py-2.5 rounded-lg text-sm font-semibold
                  bg-green-600 text-white
                  hover:bg-green-700 active:bg-green-800
                  disabled:bg-gray-300 disabled:text-gray-500
                  dark:disabled:bg-gray-700 dark:disabled:text-gray-400
                  transition-colors flex items-center gap-2
                "
              >
                {isApplying ? '应用中...' : '应用风格'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- Complete button ---------- */}
      <div className="text-center mt-10">
        <button
          onClick={onComplete}
          className="
            px-10 py-3 rounded-xl text-lg font-semibold
            bg-blue-600 text-white
            hover:bg-blue-700 active:bg-blue-800
            transition-colors shadow-md hover:shadow-lg
          "
        >
          完成上下文注入
        </button>
      </div>
    </div>
  );
}
