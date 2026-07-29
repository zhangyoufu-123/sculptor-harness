'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { PCSState, PCSPhase, StructureSection, ProposalTrigger } from '@/pcs/types';
import { PCSManager } from '@/pcs/pcs-manager';

interface PCSContextValue {
  pcsState: PCSState | null;
  isLoaded: boolean;
  // Initialize PCS from idea (Phase 0)
  initialize: (state: PCSState) => void;
  // Navigate to a new phase
  transitionTo: (phase: PCSPhase) => boolean;
  // Read
  getField: <T>(path: string) => T | undefined;
  getPhase: () => PCSPhase | undefined;
  getSections: () => StructureSection[];
  // Write
  writeField: (path: string, value: unknown) => Promise<boolean>;
  updateSectionContent: (sectionId: string, content: string) => void;
  updateSectionDraftState: (sectionId: string, state: string) => void;
  // Proposal
  proposeField: (
    path: string,
    value: unknown,
    reason: string,
    trigger: ProposalTrigger,
  ) => Promise<boolean>;
  acceptProposal: (path: string) => Promise<boolean>;
  rejectProposal: (path: string) => Promise<boolean>;
}

const PCSContext = createContext<PCSContextValue | null>(null);

export function PCSProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: PCSState;
}) {
  const managerRef = useRef<PCSManager | null>(null);
  const [pcsState, setPCSState] = useState<PCSState | null>(initialState || null);
  const [isLoaded, setIsLoaded] = useState(!!initialState);

  const getManager = useCallback((): PCSManager | null => {
    if (!managerRef.current && pcsState) {
      managerRef.current = new PCSManager(pcsState);
    }
    return managerRef.current;
  }, [pcsState]);

  const refresh = useCallback(() => {
    const m = getManager();
    if (m) setPCSState({ ...m.getSnapshot() });
  }, [getManager]);

  const initialize = useCallback((state: PCSState) => {
    managerRef.current = new PCSManager(state);
    setPCSState(state);
    setIsLoaded(true);
  }, []);

  const transitionTo = useCallback(
    (phase: PCSPhase): boolean => {
      const m = getManager();
      if (!m) return false;
      const result = m.transitionTo(phase);
      if (result.success) refresh();
      return result.success;
    },
    [getManager, refresh],
  );

  const getField = useCallback(
    <T,>(path: string): T | undefined => {
      return getManager()?.getField<T>(path);
    },
    [getManager],
  );

  const getPhase = useCallback((): PCSPhase | undefined => {
    return getManager()?.getPhase();
  }, [getManager]);

  const getSections = useCallback((): StructureSection[] => {
    return getManager()?.getSections() || [];
  }, [getManager]);

  const writeField = useCallback(
    async (path: string, value: unknown): Promise<boolean> => {
      const m = getManager();
      if (!m) return false;
      const r = m.writeField(path, value, 'user');
      if (r.success) refresh();
      return r.success;
    },
    [getManager, refresh],
  );

  const updateSectionContent = useCallback(
    (sectionId: string, content: string) => {
      getManager()?.updateSectionContent(sectionId, content);
      refresh();
    },
    [getManager, refresh],
  );

  const updateSectionDraftState = useCallback(
    (sectionId: string, state: string) => {
      getManager()?.updateSectionDraftState(sectionId, state as never);
      refresh();
    },
    [getManager, refresh],
  );

  const proposeField = useCallback(
    async (
      path: string,
      value: unknown,
      reason: string,
      trigger: ProposalTrigger,
    ): Promise<boolean> => {
      const m = getManager();
      if (!m) return false;
      const r = m.proposeField(path, value, reason, trigger);
      if (r.success) refresh();
      return r.success;
    },
    [getManager, refresh],
  );

  const acceptProposal = useCallback(
    async (path: string): Promise<boolean> => {
      const m = getManager();
      if (!m) return false;
      const r = m.acceptProposal(path);
      if (r.success) refresh();
      return r.success;
    },
    [getManager, refresh],
  );

  const rejectProposal = useCallback(
    async (path: string): Promise<boolean> => {
      const m = getManager();
      if (!m) return false;
      const r = m.rejectProposal(path);
      if (r.success) refresh();
      return r.success;
    },
    [getManager, refresh],
  );

  return React.createElement(
    PCSContext.Provider,
    {
      value: {
        pcsState,
        isLoaded,
        initialize,
        transitionTo,
        getField,
        getPhase,
        getSections,
        writeField,
        updateSectionContent,
        updateSectionDraftState,
        proposeField,
        acceptProposal,
        rejectProposal,
      },
    },
    children,
  );
}

export function usePCSContext(): PCSContextValue {
  const ctx = useContext(PCSContext);
  if (!ctx) throw new Error('usePCSContext must be used within PCSProvider');
  return ctx;
}
