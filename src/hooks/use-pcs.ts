'use client';

import { useState, useCallback, useRef } from 'react';
import { PCSManager } from '@/pcs/pcs-manager';
import { PCSState, PCSPhase, StructureSection, ProposalTrigger, DraftState } from '@/pcs/types';

interface UsePCSReturn {
  // State
  pcsState: PCSState | null;
  isLoaded: boolean;

  // Read
  getField: <T>(path: string) => T | undefined;
  getPhase: () => PCSPhase | undefined;
  getSections: () => StructureSection[];

  // Write
  writeField: (path: string, value: unknown) => Promise<boolean>;
  proposeField: (
    path: string,
    value: unknown,
    reason: string,
    trigger: ProposalTrigger,
  ) => Promise<boolean>;
  acceptProposal: (path: string) => Promise<boolean>;
  rejectProposal: (path: string) => Promise<boolean>;

  // Phase
  transitionTo: (phase: PCSPhase) => Promise<boolean>;

  // Structure
  updateSectionContent: (sectionId: string, content: string) => void;
  updateSectionDraftState: (sectionId: string, state: string) => void;

  // Initialize
  initialize: (initialState: PCSState) => void;
}

export function usePCS(): UsePCSReturn {
  const managerRef = useRef<PCSManager | null>(null);
  const [pcsState, setPCSState] = useState<PCSState | null>(null);

  // Lazy init: create PCSManager on first use when pcsState is available.
  const getManager = useCallback((): PCSManager | null => {
    if (!managerRef.current && pcsState) {
      managerRef.current = new PCSManager(pcsState);
    }
    return managerRef.current;
  }, [pcsState]);

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  const getField = useCallback(
    <T>(path: string): T | undefined => {
      const manager = getManager();
      if (!manager) return undefined;
      return manager.getField<T>(path);
    },
    [getManager],
  );

  const getPhase = useCallback((): PCSPhase | undefined => {
    const manager = getManager();
    if (!manager) return undefined;
    return manager.getPhase();
  }, [getManager]);

  const getSections = useCallback((): StructureSection[] => {
    const manager = getManager();
    if (!manager) return [];
    return manager.getSections();
  }, [getManager]);

  // ---------------------------------------------------------------------------
  // Write Operations
  // ---------------------------------------------------------------------------

  const writeField = useCallback(
    async (path: string, value: unknown): Promise<boolean> => {
      const manager = getManager();
      if (!manager) return false;

      const result = manager.writeField(path, value, 'user');
      if (result.success) {
        setPCSState(manager.getSnapshot());
      }
      return result.success;
    },
    [getManager],
  );

  const proposeField = useCallback(
    async (
      path: string,
      value: unknown,
      reason: string,
      trigger: ProposalTrigger,
    ): Promise<boolean> => {
      const manager = getManager();
      if (!manager) return false;

      const result = manager.proposeField(path, value, reason, trigger);
      if (result.success) {
        setPCSState(manager.getSnapshot());
      }
      return result.success;
    },
    [getManager],
  );

  const acceptProposal = useCallback(
    async (path: string): Promise<boolean> => {
      const manager = getManager();
      if (!manager) return false;

      const result = manager.acceptProposal(path);
      if (result.success) {
        setPCSState(manager.getSnapshot());
      }
      return result.success;
    },
    [getManager],
  );

  const rejectProposal = useCallback(
    async (path: string): Promise<boolean> => {
      const manager = getManager();
      if (!manager) return false;

      const result = manager.rejectProposal(path);
      if (result.success) {
        setPCSState(manager.getSnapshot());
      }
      return result.success;
    },
    [getManager],
  );

  // ---------------------------------------------------------------------------
  // Phase Transition
  // ---------------------------------------------------------------------------

  const transitionTo = useCallback(
    async (phase: PCSPhase): Promise<boolean> => {
      const manager = getManager();
      if (!manager) return false;

      const result = manager.transitionTo(phase);
      if (result.success) {
        setPCSState(manager.getSnapshot());
      }
      return result.success;
    },
    [getManager],
  );

  // ---------------------------------------------------------------------------
  // Structure Operations
  // ---------------------------------------------------------------------------

  const updateSectionContent = useCallback(
    (sectionId: string, content: string) => {
      const manager = getManager();
      if (!manager) return;
      manager.updateSectionContent(sectionId, content);
      setPCSState(manager.getSnapshot());
    },
    [getManager],
  );

  const updateSectionDraftState = useCallback(
    (sectionId: string, state: string) => {
      const manager = getManager();
      if (!manager) return;
      manager.updateSectionDraftState(sectionId, state as DraftState);
      setPCSState(manager.getSnapshot());
    },
    [getManager],
  );

  // ---------------------------------------------------------------------------
  // Initialize
  // ---------------------------------------------------------------------------

  const initialize = useCallback((initialState: PCSState) => {
    managerRef.current = new PCSManager(initialState);
    setPCSState(initialState);
  }, []);

  return {
    pcsState,
    isLoaded: pcsState !== null,
    getField,
    getPhase,
    getSections,
    writeField,
    proposeField,
    acceptProposal,
    rejectProposal,
    transitionTo,
    updateSectionContent,
    updateSectionDraftState,
    initialize,
  };
}
