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
  /** Child components (this is a non-visual wrapper). */
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce window in milliseconds before firing backgroundCheck. */
const DEBOUNCE_MS = 2_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BackgroundGuardian — Non-visual wrapper component that monitors for PCS
 * consistency conflicts in the background while the user is drafting.
 *
 * - Debounces calls to `useAIOperations.backgroundCheck` (2 s delay).
 * - Only alerts for conflicts that have NOT been dismissed this session.
 * - Dismissed set resets when `nodeId` changes (new node → clean slate).
 */
export default function BackgroundGuardian({
  nodeId,
  content,
  onConflict,
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

        if (!result.hasConflict || !result.message) return;

        // Skip if user already dismissed this exact message this session
        setDismissedMessages((prev) => {
          if (prev.has(result.message!)) return prev;
          // New conflict — notify parent
          onConflict(result.message!);
          return prev;
        });
      } catch {
        // Silent failure — background check is best-effort
      }
    },
    [aiOps, onConflict],
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
