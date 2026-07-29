'use client';

import { useState, useCallback } from 'react';
import { DraftState, StructureSection } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseNodeLifecycleReturn {
  currentNode: StructureSection | null;
  currentState: DraftState | null;

  // State transitions
  enterNode: (nodeId: string, sections: StructureSection[]) => void;
  planNode: () => void; // EMPTY → PLANNED
  startGeneration: () => void; // PLANNED → GENERATING
  completeGeneration: (content: string) => void; // GENERATING → DRAFTED
  startReview: () => void; // DRAFTED → REVIEWING
  approveNode: () => void; // REVIEWING → APPROVED
  unlockNode: () => void; // APPROVED → DRAFTED
  rejectAndReplan: () => void; // DRAFTED → PLANNED
  skipToDrafting: () => void; // PLANNED → DRAFTED (skip generation)

  // Queries
  canTransition: (target: DraftState) => boolean;
  isTransitionAllowed: (from: DraftState, to: DraftState) => boolean;
}

// ---------------------------------------------------------------------------
// Valid Node Lifecycle transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<DraftState, DraftState[]> = {
  empty: ['planned'],
  planned: ['generating', 'drafted'], // can skip generation
  generating: ['drafted'], // or stop early → drafted
  drafted: ['reviewing', 'planned'], // review or replan
  reviewing: ['approved', 'drafted'], // approve or go back
  approved: ['drafted'], // unlock to edit
  locked: [], // final state
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNodeLifecycle(): UseNodeLifecycleReturn {
  const [currentNode, setCurrentNode] = useState<StructureSection | null>(null);

  // -----------------------------------------------------------------------
  // Transition helpers
  // -----------------------------------------------------------------------

  const isTransitionAllowed = useCallback((from: DraftState, to: DraftState): boolean => {
    const allowed = VALID_TRANSITIONS[from];
    return allowed !== undefined && allowed.includes(to);
  }, []);

  const canTransition = useCallback(
    (target: DraftState): boolean => {
      if (!currentNode) return false;
      return isTransitionAllowed(currentNode.draft_state, target);
    },
    [currentNode, isTransitionAllowed],
  );

  /**
   * Apply a `DraftState` transition to the current node if valid.
   * Uses functional state update to avoid stale-closure issues.
   */
  const applyTransition = useCallback(
    (target: DraftState, content?: string) => {
      setCurrentNode((prev) => {
        if (!prev) return null;
        if (!isTransitionAllowed(prev.draft_state, target)) return prev;

        return {
          ...prev,
          draft_state: target,
          content_draft: content !== undefined ? content : prev.content_draft,
        };
      });
    },
    [isTransitionAllowed],
  );

  // -----------------------------------------------------------------------
  // Node entry
  // -----------------------------------------------------------------------

  const enterNode = useCallback((nodeId: string, sections: StructureSection[]) => {
    const found = sections.find((s) => s.id === nodeId) ?? null;
    setCurrentNode(found);
  }, []);

  // -----------------------------------------------------------------------
  // State transition methods
  // -----------------------------------------------------------------------

  const planNode = useCallback(() => {
    applyTransition('planned');
  }, [applyTransition]);

  const startGeneration = useCallback(() => {
    applyTransition('generating');
  }, [applyTransition]);

  const completeGeneration = useCallback(
    (content: string) => {
      applyTransition('drafted', content);
    },
    [applyTransition],
  );

  const startReview = useCallback(() => {
    applyTransition('reviewing');
  }, [applyTransition]);

  const approveNode = useCallback(() => {
    applyTransition('approved');
  }, [applyTransition]);

  const unlockNode = useCallback(() => {
    applyTransition('drafted');
  }, [applyTransition]);

  const rejectAndReplan = useCallback(() => {
    applyTransition('planned');
  }, [applyTransition]);

  const skipToDrafting = useCallback(() => {
    applyTransition('drafted');
  }, [applyTransition]);

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const currentState: DraftState | null = currentNode?.draft_state ?? null;

  return {
    currentNode,
    currentState,
    enterNode,
    planNode,
    startGeneration,
    completeGeneration,
    startReview,
    approveNode,
    unlockNode,
    rejectAndReplan,
    skipToDrafting,
    canTransition,
    isTransitionAllowed,
  };
}
