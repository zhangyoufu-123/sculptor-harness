'use client';

import { useState, useCallback } from 'react';
import { usePCS } from '@/hooks/use-pcs';
import type {
  PCSState,
  IntentLayer,
  AudienceLayer,
  ConstraintLayer,
  KnowledgeLayer,
  StructureLayer,
  ExpressionLayer,
  PCSField,
  FieldSource,
} from '@/pcs/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeField<T>(
  value: T,
  source: FieldSource = 'user',
  confidence: number = 0.5,
): PCSField<T> {
  return {
    value,
    status: 'assumed',
    source,
    confidence,
    last_updated: new Date().toISOString(),
    proposal: null,
  };
}

function buildSeedPCS(idea: string): PCSState {
  const now = new Date().toISOString();
  const id = crypto.randomUUID?.() ?? `pcs-${Date.now().toString(36)}`;

  const intent: IntentLayer = {
    purpose: makeField('inform', 'user', 0.5),
    core_message: makeField(idea, 'user', 0.6),
    desired_impact: makeField('', 'system', 0.2),
    target_emotion: makeField('', 'system', 0.2),
  };

  const audience: AudienceLayer = {
    audience_type: makeField('', 'system', 0.2),
    knowledge_level: makeField('', 'system', 0.2),
    relationship: makeField('', 'system', 0.2),
    pain_points: makeField([], 'system', 0.2),
  };

  const constraint: ConstraintLayer = {
    type: makeField('', 'system', 0.2),
    platform: makeField('', 'system', 0.2),
    format: makeField('markdown', 'system', 0.8),
    length_min: makeField(300, 'system', 0.5),
    length_max: makeField(3000, 'system', 0.5),
    deadline: makeField('', 'system', 0.2),
    custom_constraints: makeField([], 'system', 0.2),
  };

  const knowledge: KnowledgeLayer = {
    required_topics: [],
    known_topics: [],
    missing_information: [],
    sources: makeField([], 'system', 0.2),
  };

  const structure: StructureLayer = {
    sections: [],
  };

  const expression: ExpressionLayer = {
    tone: makeField('', 'system', 0.2),
    voice: makeField('', 'system', 0.2),
    avoid: makeField([], 'system', 0.2),
    style_reference: makeField('', 'system', 0.2),
    format_reference: makeField('', 'system', 0.2),
    thinking_reference: makeField('', 'system', 0.2),
  };

  return {
    id,
    project_id: `proj-${Date.now().toString(36)}`,
    phase: 'initializing',
    created_at: now,
    updated_at: now,
    intent,
    audience,
    constraint,
    knowledge,
    structure,
    expression,
  };
}

// ---------------------------------------------------------------------------
// Example card data
// ---------------------------------------------------------------------------

const EXAMPLE_IDEAS = [
  {
    title: '公众号技术文章',
    desc: '面向开发者的深度学习入门指南，注重实操和代码示例',
  },
  {
    title: '商业分析报告',
    desc: '针对 SaaS 市场的竞争格局分析，面向投资人和高管',
  },
  {
    title: '个人品牌故事',
    desc: '以第一人称叙述创业历程，传递坚持与创新的价值观',
  },
  {
    title: '产品发布文案',
    desc: '为新产品撰写发布宣传语，突出差异化卖点与用户价值',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IdeaInputProps {
  /** Called after the seed PCS has been initialised with the parsed idea. */
  onSubmit: (idea: string) => void;
}

export default function IdeaInput({ onSubmit }: IdeaInputProps) {
  const { initialize } = usePCS();
  const [idea, setIdea] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = idea.trim();
    if (trimmed.length === 0) {
      setError('请输入创作想法');
      return;
    }
    if (trimmed.length < 6) {
      setError('请至少输入 6 个字，让系统更好地理解你的意图');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Simulate parsing delay (intake agent analysis in production)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const seed = buildSeedPCS(trimmed);
      initialize(seed);

      // Allow parent to navigate onward
      onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [idea, initialize, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleExampleClick = useCallback((example: string) => {
    setIdea(example);
    setError(null);
  }, []);

  const canSubmit = idea.trim().length >= 6 && !isLoading;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 py-12">
      {/* ---------- Header ---------- */}
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Sculptor 创作工坊
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-10 text-center max-w-lg">
        用一句话描述你想要创作的内容，AI 将引导你完成从想法到成品的全过程
      </p>

      {/* ---------- Textarea ---------- */}
      <div className="w-full max-w-2xl mb-6">
        <textarea
          value={idea}
          onChange={(e) => {
            setIdea(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="请输入你的创作想法..."
          disabled={isLoading}
          rows={5}
          className="w-full resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-5 py-4 text-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 shadow-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        />

        {error !== null && <p className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>}
      </div>

      {/* ---------- Submit Button ---------- */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="
          px-8 py-3 rounded-xl text-lg font-semibold
          bg-blue-600 text-white
          hover:bg-blue-700 active:bg-blue-800
          disabled:bg-gray-300 disabled:text-gray-500
          dark:disabled:bg-gray-700 dark:disabled:text-gray-400
          transition-colors shadow-md hover:shadow-lg
          flex items-center gap-2
        "
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-5 w-5 text-white"
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
            正在解析...
          </>
        ) : (
          '开始创作'
        )}
      </button>

      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">按 ⌘+Enter 快速提交</p>

      {/* ---------- Example Cards ---------- */}
      <div className="mt-12 w-full max-w-2xl">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 text-center">
          或者从这些示例开始
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {EXAMPLE_IDEAS.map((example) => (
            <button
              key={example.title}
              onClick={() => handleExampleClick(`${example.title}：${example.desc}`)}
              disabled={isLoading}
              className="
                text-left p-4 rounded-xl border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800
                hover:border-blue-400 hover:shadow-md
                dark:hover:border-blue-500
                transition-all disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                {example.title}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {example.desc}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
