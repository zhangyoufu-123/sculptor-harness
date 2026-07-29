'use client';

import { useState, useCallback, useMemo } from 'react';
import { StructureSection } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseNodeNavigationOptions {
  sections: StructureSection[];
  onNodeChange?: (fromId: string, toId: string) => void;
}

interface AdjacentNodes {
  previous?: StructureSection;
  current?: StructureSection;
  next?: StructureSection;
}

interface NodeProgress {
  completed: number;
  total: number;
  percentage: number;
}

interface UseNodeNavigationReturn {
  currentNodeId: string | null;

  // Navigation
  goToNode: (nodeId: string) => void;
  goToNext: () => void;
  goToPrevious: () => void;
  goToFirst: () => void;
  goToLast: () => void;

  // Save current draft before navigating away
  saveAndNavigate: (nodeId: string, draftContent: string) => void;

  // Get adjacent node info (for context panel)
  getAdjacentNodes: () => AdjacentNodes;

  // Progress
  getProgress: () => NodeProgress;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Draft states that count as "completed" for progress tracking. */
const COMPLETED_STATES: ReadonlySet<string> = new Set([
  'drafted',
  'reviewing',
  'approved',
  'locked',
]);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNodeNavigation(options: UseNodeNavigationOptions): UseNodeNavigationReturn {
  const { sections, onNodeChange } = options;

  const [currentNodeId, setCurrentNodeId] = useState<string | null>(() => {
    // Default to the first section if available.
    return sections.length > 0 ? sections[0].id : null;
  });

  // -----------------------------------------------------------------------
  // Derived: current index
  // -----------------------------------------------------------------------

  const currentIndex = useMemo(() => {
    if (currentNodeId === null) return -1;
    return sections.findIndex((s) => s.id === currentNodeId);
  }, [currentNodeId, sections]);

  // -----------------------------------------------------------------------
  // Core navigation helper
  // -----------------------------------------------------------------------

  const navigateToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= sections.length) return;
      const targetId = sections[index].id;
      if (targetId === currentNodeId) return;

      const fromId = currentNodeId;
      setCurrentNodeId(targetId);

      if (onNodeChange && fromId !== null) {
        onNodeChange(fromId, targetId);
      }
    },
    [sections, currentNodeId, onNodeChange],
  );

  // -----------------------------------------------------------------------
  // Navigation methods
  // -----------------------------------------------------------------------

  const goToNode = useCallback(
    (nodeId: string) => {
      const index = sections.findIndex((s) => s.id === nodeId);
      if (index === -1) return;
      navigateToIndex(index);
    },
    [sections, navigateToIndex],
  );

  const goToNext = useCallback(() => {
    if (currentIndex < sections.length - 1) {
      navigateToIndex(currentIndex + 1);
    }
  }, [currentIndex, sections.length, navigateToIndex]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      navigateToIndex(currentIndex - 1);
    }
  }, [currentIndex, navigateToIndex]);

  const goToFirst = useCallback(() => {
    if (sections.length > 0) {
      navigateToIndex(0);
    }
  }, [sections, navigateToIndex]);

  const goToLast = useCallback(() => {
    if (sections.length > 0) {
      navigateToIndex(sections.length - 1);
    }
  }, [sections, navigateToIndex]);

  // -----------------------------------------------------------------------
  // Save and navigate
  // -----------------------------------------------------------------------

  const saveAndNavigate = useCallback(
    (nodeId: string, _draftContent: string) => {
      // In the hook, we don't persist content to PCSManager — that's the
      // parent's responsibility via onNodeChange or a separate hook.
      // We navigate AND pass the intent through onNodeChange.

      const targetIndex = sections.findIndex((s) => s.id === nodeId);
      if (targetIndex === -1) return;

      const fromId = currentNodeId;
      setCurrentNodeId(nodeId);

      if (onNodeChange && fromId !== null) {
        onNodeChange(fromId, nodeId);
      }
    },
    [sections, currentNodeId, onNodeChange],
  );

  // -----------------------------------------------------------------------
  // Adjacent nodes
  // -----------------------------------------------------------------------

  const getAdjacentNodes = useCallback((): AdjacentNodes => {
    if (currentIndex === -1) return {};

    return {
      previous: currentIndex > 0 ? sections[currentIndex - 1] : undefined,
      current: sections[currentIndex],
      next: currentIndex < sections.length - 1 ? sections[currentIndex + 1] : undefined,
    };
  }, [currentIndex, sections]);

  // -----------------------------------------------------------------------
  // Progress
  // -----------------------------------------------------------------------

  const getProgress = useCallback((): NodeProgress => {
    const total = sections.length;
    if (total === 0) return { completed: 0, total: 0, percentage: 0 };

    const completed = sections.filter((s) => COMPLETED_STATES.has(s.draft_state)).length;

    return {
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
    };
  }, [sections]);

  return {
    currentNodeId,
    goToNode,
    goToNext,
    goToPrevious,
    goToFirst,
    goToLast,
    saveAndNavigate,
    getAdjacentNodes,
    getProgress,
  };
}
