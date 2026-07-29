'use client';

import { useState, useCallback } from 'react';
import { DraftState, StructureSection } from '@/pcs/types';
import { usePCSContext } from '@/contexts/pcs-context';

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
  failGeneration: () => void; // GENERATING → FAILED
  retryGeneration: () => void; // FAILED → GENERATING
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
  generating: ['drafted', 'failed'], // generation can succeed or fail
  drafted: ['reviewing', 'planned'], // review or replan
  reviewing: ['approved', 'drafted'], // approve or go back
  approved: ['drafted'], // unlock to edit
  revising: ['drafted'],
  failed: ['generating'], // retry generation
  locked: [], // final state
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNodeLifecycle(): UseNodeLifecycleReturn {
  const [currentNode, setCurrentNode] = useState<StructureSection | null>(null);
  const { updateSectionDraftState, updateSectionContent, getSections } = usePCSContext();

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

  const enterNode = useCallback(
    (nodeId: string, sections: StructureSection[]) => {
      const found = sections.find((s) => s.id === nodeId) ?? null;
      // Sync current content from PCS if available
      if (found) {
        const pcsSections = getSections();
        const pcsNode = pcsSections.find((s) => s.id === nodeId);
        if (pcsNode) {
          setCurrentNode({
            ...found,
            draft_state: pcsNode.draft_state,
            content_draft: pcsNode.content_draft,
          });
          return;
        }
      }
      setCurrentNode(found);
    },
    [getSections],
  );

  // -----------------------------------------------------------------------
  // State transition methods
  // -----------------------------------------------------------------------

  const planNode = useCallback(() => {
    applyTransition('planned');
    if (currentNode?.id) {
      updateSectionDraftState(currentNode.id, 'planned');
    }
  }, [applyTransition, currentNode, updateSectionDraftState]);

  const startGeneration = useCallback(() => {
    applyTransition('generating');
    if (currentNode?.id) {
      updateSectionDraftState(currentNode.id, 'generating');
    }
  }, [applyTransition, currentNode, updateSectionDraftState]);

  const completeGeneration = useCallback(
    (content: string) => {
      applyTransition('drafted', content);
      if (currentNode?.id) {
        updateSectionContent(currentNode.id, content);
        updateSectionDraftState(currentNode.id, 'drafted');
      }
    },
    [applyTransition, currentNode, updateSectionContent, updateSectionDraftState],
  );

  const startReview = useCallback(() => {
    applyTransition('reviewing');
  }, [applyTransition]);

  const approveNode = useCallback(() => {
    applyTransition('approved');
    if (currentNode?.id) {
      updateSectionDraftState(currentNode.id, 'approved');
    }
  }, [applyTransition, currentNode, updateSectionDraftState]);

  const unlockNode = useCallback(() => {
    applyTransition('drafted');
    if (currentNode?.id) {
      updateSectionDraftState(currentNode.id, 'drafted');
    }
  }, [applyTransition, currentNode, updateSectionDraftState]);

  const rejectAndReplan = useCallback(() => {
    applyTransition('planned');
  }, [applyTransition]);

  const skipToDrafting = useCallback(() => {
    applyTransition('drafted');
  }, [applyTransition]);

  const failGeneration = useCallback(() => {
    if (!currentNode?.id) return;
    applyTransition('failed');
    updateSectionDraftState(currentNode.id, 'failed');
  }, [currentNode, applyTransition, updateSectionDraftState]);

  const retryGeneration = useCallback(() => {
    if (!currentNode?.id) return;
    applyTransition('generating');
    updateSectionDraftState(currentNode.id, 'generating');
  }, [currentNode, applyTransition, updateSectionDraftState]);

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
    failGeneration,
    retryGeneration,
    rejectAndReplan,
    skipToDrafting,
    canTransition,
    isTransitionAllowed,
  };
}
