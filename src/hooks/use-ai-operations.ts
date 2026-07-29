'use client';

import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AIOperation =
  | 'condense'
  | 'expand'
  | 'retone'
  | 'find_data'
  | 'check_consistency'
  | 'rewrite'
  | 'continue_writing'
  | 'insert_continuation';

interface BackgroundCheckResult {
  hasConflict: boolean;
  message?: string;
}

interface UseAIOperationsReturn {
  isProcessing: boolean;
  lastResult: string | null;
  lastError: string | null;

  // Execute an AI operation on selected text
  executeOperation: (
    operation: AIOperation,
    selectedText: string,
    instruction?: string,
  ) => Promise<string>;

  // Generate content for an empty node (Phase 4 active generation)
  generateNodeContent: (nodeId: string, planSummary: string) => Promise<string>;

  // Background guardian: check for conflicts silently
  backgroundCheck: (nodeId: string, content: string) => Promise<BackgroundCheckResult>;

  // Clear state
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAIOperations(): UseAIOperationsReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // executeOperation – V1 mock
  // -----------------------------------------------------------------------

  const executeOperation = useCallback(
    async (operation: AIOperation, selectedText: string, instruction?: string): Promise<string> => {
      setIsProcessing(true);
      setLastError(null);

      try {
        // Simulate network delay (real API call in production)
        await new Promise((resolve) => setTimeout(resolve, 600));

        let result: string;

        switch (operation) {
          case 'condense':
            result =
              selectedText.length > 120
                ? selectedText.slice(0, 120) + '… [condensed]'
                : '[condensed] ' + selectedText;
            break;

          case 'expand':
            result =
              selectedText +
              '\n\n[Expanded content — this section has been elaborated with additional detail, examples, and supporting context.]';
            break;

          case 'retone': {
            const toneHint = instruction ?? '更正式的语气';
            result = `[Retoned to: ${toneHint}]\n\n${selectedText}`;
            break;
          }

          case 'find_data':
            result = `[Data lookup results for "${selectedText.slice(0, 80)}"]\n\n• 相关数据点 A\n• 统计数据 B (来源: 示例数据集)\n• 引用 C`;
            break;

          case 'check_consistency':
            result = `[Consistency check for selected text]\n\n✅ 意图一致性: 通过\n✅ 知识覆盖: 通过\n⚠️  表达风格: 轻微偏差 (建议统一术语)\n\n${selectedText}`;
            break;

          case 'rewrite':
            result = `[Rewritten with instruction: "${instruction ?? '提高可读性'}"]\n\n${selectedText
              .split('.')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => '• ' + s + '.')
              .join('\n')}`;
            break;

          case 'continue_writing':
            result =
              selectedText +
              '\n\n[继续写作] 基于上文的逻辑自然延伸，补充论述的下一层论据。结合前文提出的观点，进一步展开分析，并引入相关案例加以佐证…';
            break;

          case 'insert_continuation':
            result =
              selectedText +
              '\n\n[插入过渡段] 以上阐述了核心论点。接下来我们将从另一个维度审视这一问题，探讨其深层原因与广泛影响。';
            break;

          default:
            result = selectedText;
        }

        setLastResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown AI operation error';
        setLastError(message);
        return selectedText; // fallback: return original text
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  // -----------------------------------------------------------------------
  // generateNodeContent – V1 mock
  // -----------------------------------------------------------------------

  const generateNodeContent = useCallback(
    async (nodeId: string, planSummary: string): Promise<string> => {
      setIsProcessing(true);
      setLastError(null);

      try {
        // Simulate generation delay
        await new Promise((resolve) => setTimeout(resolve, 1200));

        const generated = [
          `[Scribe Agent — mock generated content for node ${nodeId}]`,
          '',
          `## ${planSummary}`,
          '',
          '这是根据 Architect Agent 提供的生成计划自动撰写的内容。',
          '',
          '在实际生产环境中，此处将由 Scribe Agent 调用 LLM 进行真实的内容生成，',
          '结合 Knowledge Layer 中确认的知识点、Expression Layer 中的风格参数、',
          '以及本节点的 GenerationPlan 中指定的子结构、长度估算和过渡指令。',
          '',
          '当前为 V1 模拟输出，用于验证 UI 流程和数据管道。',
        ].join('\n');

        setLastResult(generated);
        return generated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown generation error';
        setLastError(message);
        return '';
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  // -----------------------------------------------------------------------
  // backgroundCheck – V1 mock (always no conflict)
  // -----------------------------------------------------------------------

  const backgroundCheck = useCallback(
    async (_nodeId: string, _content: string): Promise<BackgroundCheckResult> => {
      // No-op in V1 — always returns no conflict.
      // In production, this calls ConsistencyEngine.checkNodeConflict().
      return { hasConflict: false };
    },
    [],
  );

  // -----------------------------------------------------------------------
  // reset
  // -----------------------------------------------------------------------

  const reset = useCallback(() => {
    setIsProcessing(false);
    setLastResult(null);
    setLastError(null);
  }, []);

  return {
    isProcessing,
    lastResult,
    lastError,
    executeOperation,
    generateNodeContent,
    backgroundCheck,
    reset,
  };
}
