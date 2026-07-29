'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { usePCSContext } from '@/contexts/pcs-context';
import { useNodeNavigation } from '@/hooks/use-node-navigation';
import { useNodeLifecycle } from '@/hooks/use-node-lifecycle';
import { useAIOperations } from '@/hooks/use-ai-operations';
import NodeStudioLayout from '@/components/node-studio/node-studio-layout';
import StructureNav from '@/components/node-studio/structure-nav';
import WritingArea from '@/components/node-studio/writing-area';
import ContextPanel from '@/components/node-studio/context-panel';
// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function NodeStudioPage({ params: _params }: { params: { id: string } }) {
  // ---- PCS Context: sections come from the shared PCS state ----
  const { pcsState, getSections } = usePCSContext();
  const sections = useMemo(() => {
    if (pcsState) return getSections();
    return [];
  }, [pcsState, getSections]);

  // ---- Hooks ----
  const { currentNodeId, goToNode, goToNext, goToPrevious, getAdjacentNodes } = useNodeNavigation({
    sections,
  });

  const { currentNode, enterNode } = useNodeLifecycle();

  const { backgroundCheck } = useAIOperations();

  // ---- Local state ----
  const [conflictState, setConflictState] = useState({ hasConflict: false, message: '' });

  // ---- Enter current node when it changes ----
  useEffect(() => {
    if (currentNodeId && sections.length > 0) {
      enterNode(currentNodeId, sections);
    }
  }, [currentNodeId, sections, enterNode]);

  // ---- Background consistency check on node change ----
  useEffect(() => {
    if (currentNode && currentNode.content_draft) {
      backgroundCheck(currentNode.id, currentNode.content_draft).then((result) => {
        setConflictState({
          hasConflict: result.hasConflict,
          message: result.message ?? '',
        });
      });
    } else {
      setConflictState({ hasConflict: false, message: '' });
    }
  }, [currentNode, backgroundCheck]);

  // ---- Derived navigation state ----
  const adjacent = useMemo(() => getAdjacentNodes(), [getAdjacentNodes]);
  const currentSection = useMemo(
    () => sections.find((s) => s.id === currentNodeId) ?? null,
    [sections, currentNodeId],
  );

  // ---- Handlers ----
  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      goToNode(nodeId);
    },
    [goToNode],
  );

  const handleInsertNode = useCallback((_afterId: string) => {
    // V1: placeholder — no-op
    // eslint-disable-next-line no-console
    console.log('[V1] Insert node after:', _afterId);
  }, []);

  return (
    <div className="relative h-screen overflow-hidden flex bg-gray-50">
      {/* ---- Left sidebar: StructureNav ---- */}
      <NodeStudioLayout>
        <StructureNav
          sections={sections}
          currentNodeId={currentNodeId ?? ''}
          onNodeSelect={handleNodeSelect}
          onInsertNode={handleInsertNode}
        />
      </NodeStudioLayout>

      {/* ---- Center: WritingArea ---- */}
      <div className="flex-1 overflow-hidden">
        <WritingArea
          nodeId={currentNodeId ?? ''}
          section={currentSection}
          onPrevious={goToPrevious}
          onNext={goToNext}
          hasPrevious={!!adjacent.previous}
          hasNext={!!adjacent.next}
        />
      </div>

      {/* ---- Right: ContextPanel (fixed-position hover overlay) ---- */}
      <ContextPanel
        nodeId={currentNodeId ?? ''}
        hasConflict={conflictState.hasConflict}
        conflictMessage={conflictState.message}
      />
    </div>
  );
}
