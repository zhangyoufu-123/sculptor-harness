'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNodeNavigation } from '@/hooks/use-node-navigation';
import { useNodeLifecycle } from '@/hooks/use-node-lifecycle';
import { useAIOperations } from '@/hooks/use-ai-operations';
import NodeStudioLayout from '@/components/node-studio/node-studio-layout';
import StructureNav from '@/components/node-studio/structure-nav';
import WritingArea from '@/components/node-studio/writing-area';
import ContextPanel from '@/components/node-studio/context-panel';
import type { StructureSection } from '@/pcs/types';

// ---------------------------------------------------------------------------
// V1 mock sections — diverse draft states for UI validation
// ---------------------------------------------------------------------------

function buildMockSections(): StructureSection[] {
  return [
    {
      id: 'sec-1',
      title: '引言：AI 时代的创作范式转移',
      goal: '引出核心命题，建立读者对 AI 辅助创作的基本认知',
      function: 'introduce',
      hardness: 'hard',
      draft_state: 'approved',
      content_draft: '在过去十年中，人工智能技术经历了从实验室到产业化的跨越式发展...',
      pcs_status: 'confirmed',
      source: 'user',
      confidence: 0.95,
      order: 0,
    },
    {
      id: 'sec-2',
      title: '从工具到协作者：AI 写作助手的进化',
      goal: '梳理 AI 写作工具的发展脉络，对比各阶段能力边界',
      function: 'argument',
      hardness: 'soft',
      draft_state: 'drafted',
      content_draft: '早期的 AI 写作工具主要聚焦于语法纠错和简单的文本补全...',
      pcs_status: 'confirmed',
      source: 'ai',
      confidence: 0.85,
      order: 1,
    },
    {
      id: 'sec-3',
      title: '结构化创作方法论：PCS 框架详解',
      goal: '系统介绍 PCS 六层创作框架，展示如何用结构化方法管理创意',
      function: 'argument',
      hardness: 'hard',
      draft_state: 'generating',
      content_draft: '',
      pcs_status: 'confirmed',
      source: 'ai',
      confidence: 0.88,
      order: 2,
    },
    {
      id: 'sec-4',
      title: '案例研究：从灵感到成品的完整旅程',
      goal: '通过一个完整的创作案例，展示 AI 辅助写作的实际效果',
      function: 'evidence',
      hardness: 'soft',
      draft_state: 'planned',
      content_draft: '',
      pcs_status: 'confirmed',
      source: 'ai',
      confidence: 0.75,
      order: 3,
    },
    {
      id: 'sec-5',
      title: '人机协作的最佳实践',
      goal: '总结人与 AI 高效协作的实用原则与技巧',
      function: 'argument',
      hardness: 'soft',
      draft_state: 'empty',
      content_draft: '',
      pcs_status: 'assumed',
      source: 'system',
      confidence: 0.5,
      order: 4,
    },
    {
      id: 'sec-6',
      title: '未来展望与总结',
      goal: '展望 AI 辅助创作的未来发展方向，总结全文核心观点',
      function: 'conclude',
      hardness: 'hard',
      draft_state: 'empty',
      content_draft: '',
      pcs_status: 'assumed',
      source: 'system',
      confidence: 0.5,
      order: 5,
    },
  ];
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function NodeStudioPage({ params }: { params: { id: string } }) {
  // ---- Mock data (V1) ----
  const sections = useMemo(() => buildMockSections(), []);
  // V1: project ID available for future use (API calls, persistence)
  void params.id;

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
