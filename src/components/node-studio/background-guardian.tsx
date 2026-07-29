'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useAIOperations } from '@/hooks/use-ai-operations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackgroundGuardianProps {
  /** The currently active node ID. */
  nodeId: string;
  /** Current draft content being monitored. */
  content: string;
  /** Called when a new, non-dismissed conflict is detected. */
  onConflict: (message: string) => void;
  /** Called when structural insights are detected. */
  onInsight?: (insights: Array<{ type: string; message: string; paragraphIndex: number }>) => void;
  /** Child components (this is a non-visual wrapper). */
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce window in milliseconds before firing backgroundCheck. */
const DEBOUNCE_MS = 2_000;

// ---------------------------------------------------------------------------
// Mock insight detection (V1 — heuristics-based)
// ---------------------------------------------------------------------------

/**
 * Scans content for structural gaps using simple heuristics.
 * V1 mock: returns insights based on keyword detection.
 */
function detectInsights(
  content: string,
): Array<{ type: string; message: string; paragraphIndex: number }> {
  const results: Array<{ type: string; message: string; paragraphIndex: number }> = [];

  // Detect missing data: mentions data/statistics without specific numbers
  if (content.includes('数据') && !content.match(/\d+%/)) {
    results.push({
      type: 'missing_data',
      message: '这段提到了数据但缺少具体数字',
      paragraphIndex: 0,
    });
  }

  // Detect missing case: uses "例如" (for example) but content is too short
  if (content.includes('例如') && content.length < 200) {
    results.push({
      type: 'missing_case',
      message: '这里可以增加一个具体案例来支撑观点',
      paragraphIndex: 0,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------

/**
 * BackgroundGuardian — Non-visual wrapper component that monitors for PCS
 * consistency conflicts and structural insights in the background while
 * the user is drafting.
 *
 * - Debounces calls to `useAIOperations.backgroundCheck` (2 s delay).
 * - Only alerts for conflicts that have NOT been dismissed this session.
 * - Dismissed set resets when `nodeId` changes (new node → clean slate).
 * - Runs mock insight detection and reports via `onInsight` callback.
 */
export default function BackgroundGuardian({
  nodeId,
  content,
  onConflict,
  onInsight,
  children,
}: BackgroundGuardianProps) {
  const aiOps = useAIOperations();

  // ---- Dismissed conflict set (keyed by message) --------------------------
  // State is used inside the runCheck callback via functional setState
  const [, setDismissedMessages] = useState<Set<string>>(new Set());

  // Track last nodeId so we can reset dismissed set on node change
  const lastNodeId = useRef<string>(nodeId);

  // ---- Debounce timer ref -----------------------------------------------
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Perform the check --------------------------------------------------
  const runCheck = useCallback(
    async (currentContent: string, currentNodeId: string) => {
      try {
        const result = await aiOps.backgroundCheck(currentNodeId, currentContent);

        // ---- Conflict detection ------------------------------------------
        if (result.hasConflict && result.message) {
          setDismissedMessages((prev) => {
            if (prev.has(result.message!)) return prev;
            // New conflict — notify parent
            onConflict(result.message!);
            return prev;
          });
        }

        // ---- Insight detection (V1 mock heuristics) ----------------------
        const insights = detectInsights(currentContent);
        if (insights.length > 0 && onInsight) {
          onInsight(insights);
        }
      } catch {
        // Silent failure — background check is best-effort
      }
    },
    [aiOps, onConflict, onInsight],
  );

  // ---- Effect: debounce content changes -----------------------------------
  useEffect(() => {
    // Clear any pending timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Skip empty content — nothing to validate
    if (!content.trim()) return;

    // Schedule check after debounce window
    debounceRef.current = setTimeout(() => {
      void runCheck(content, nodeId);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [content, nodeId, runCheck]);

  // ---- Effect: reset dismissed set when entering a new node ---------------
  useEffect(() => {
    if (nodeId !== lastNodeId.current) {
      lastNodeId.current = nodeId;
      setDismissedMessages(new Set());
    }
  }, [nodeId]);

  // ---- Effect: cleanup on unmount ---------------------------------------
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // ---- render (transparent) -----------------------------------------------
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
}
