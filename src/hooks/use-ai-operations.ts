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
  // executeOperation – calls /api/agent
  // -----------------------------------------------------------------------

  const executeOperation = useCallback(
    async (operation: AIOperation, selectedText: string, instruction?: string): Promise<string> => {
      setIsProcessing(true);
      setLastError(null);

      try {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'scribe',
            phase: 'executing',
            action: 'revise',
            payload: { text: selectedText, operation, instruction },
            pcsSnapshot: null, // Will be filled by the API route from PCS context
          }),
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        const result = data.result?.content || data.result?.text || JSON.stringify(data);
        setLastResult(result);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setLastError(message);
        return selectedText; // Fallback: return original text
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  // -----------------------------------------------------------------------
  // generateNodeContent – calls /api/generate
  // -----------------------------------------------------------------------

  const generateNodeContent = useCallback(
    async (nodeId: string, planSummary: string): Promise<string> => {
      setIsProcessing(true);
      setLastError(null);

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId, planSummary, pcsSnapshot: null }),
        });

        if (!response.ok) throw new Error(`Generate error: ${response.status}`);
        const data = await response.json();
        const content = data.content || data.result?.content || '';
        setLastResult(content);
        return content;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setLastError(message);
        return ''; // Fallback
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  // -----------------------------------------------------------------------
  // backgroundCheck – calls /api/agent (check action)
  // -----------------------------------------------------------------------

  const backgroundCheck = useCallback(
    async (nodeId: string, content: string): Promise<BackgroundCheckResult> => {
      try {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'scribe',
            phase: 'executing',
            action: 'check',
            payload: { nodeId, content },
            pcsSnapshot: null,
          }),
        });

        if (!response.ok) return { hasConflict: false };
        const data = await response.json();
        const issues = data.result?.issues || [];
        return {
          hasConflict: issues.length > 0,
          message: issues.length > 0 ? issues[0].description : undefined,
        };
      } catch {
        return { hasConflict: false };
      }
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
