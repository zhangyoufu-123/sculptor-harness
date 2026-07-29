'use client';

import React, { useState, useCallback } from 'react';
import { useNodeLifecycle } from '@/hooks/use-node-lifecycle';
import { DraftState, StructureSection } from '@/pcs/types';
import EmptyNode from './node-states/empty-node';
import PlannedNode from './node-states/planned-node';
import GeneratingNode from './node-states/generating-node';
import DraftedNode from './node-states/drafted-node';

// ---------------------------------------------------------------------------
// State-component registry
// ---------------------------------------------------------------------------

type StateComponentMap = Partial<
  Record<
    DraftState,
    React.ComponentType<{
      nodeId: string;
      goal?: string;
      content?: string;
      onComplete?: () => void;
    }>
  >
>;

function DraftedNodeWrapper({
  nodeId,
  goal,
  content,
  onComplete,
}: {
  nodeId: string;
  goal?: string;
  content?: string;
  onComplete?: () => void;
}) {
  return (
    <DraftedNode
      nodeId={nodeId}
      content={content ?? ''}
      goal={goal ?? ''}
      onComplete={onComplete ?? (() => {})}
    />
  );
}

const STATE_COMPONENTS: StateComponentMap = {
  empty: EmptyNode,
  planned: PlannedNode,
  generating: GeneratingNode,
  drafted: DraftedNodeWrapper,
  reviewing: ReviewingNode,
  approved: ApprovedNode,
};

// ---------------------------------------------------------------------------
// Sub-components for states that don't have dedicated files yet
// ---------------------------------------------------------------------------

function ReviewingNode({ nodeId }: { nodeId: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-500">
      <p className="mb-2 text-lg">🔍 审核中</p>
      <p className="text-sm">节点 {nodeId} — 正在进行5维度审核</p>
    </div>
  );
}

function ApprovedNode({ nodeId }: { nodeId: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-500">
      <p className="mb-2 text-lg">✅ 已通过</p>
      <p className="text-sm">节点 {nodeId} — 内容已锁定</p>
    </div>
  );
}

function LockedPlaceholder({ nodeId }: { nodeId: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-400">
      <p className="mb-2 text-3xl">🔒</p>
      <p className="text-sm">节点 {nodeId} — 已锁定，不可编辑</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WritingArea
// ---------------------------------------------------------------------------

interface WritingAreaProps {
  nodeId: string;
  /** Current section data — when omitted, draft_state defaults to 'empty'. */
  section?: StructureSection | null;
  /** Navigate to the previous section. */
  onPrevious?: () => void;
  /** Navigate to the next section. */
  onNext?: () => void;
  /** Whether there is a previous section to navigate to. */
  hasPrevious?: boolean;
  /** Whether there is a next section to navigate to. */
  hasNext?: boolean;
}

export default function WritingArea({
  nodeId,
  section,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: WritingAreaProps) {
  const { currentNode: lifecycleNode, startReview } = useNodeLifecycle();
  const [goalBarCollapsed, setGoalBarCollapsed] = useState(false);

  // Resolve section data: explicit prop > lifecycle hook > null
  const resolvedSection = section ?? lifecycleNode ?? null;

  const toggleGoalBar = useCallback(() => {
    setGoalBarCollapsed((prev) => !prev);
  }, []);

  // Determine which component to render based on draft state
  const draftState: DraftState = resolvedSection?.draft_state ?? 'empty';

  const StateComponent = STATE_COMPONENTS[draftState] ?? LockedPlaceholder;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Top navigation bar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!hasPrevious || !onPrevious}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          上一节
        </button>

        <span className="text-sm font-medium text-gray-500">
          {resolvedSection?.title ?? '未选择章节'}
        </span>

        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext || !onNext}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          下一节
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Goal bar (collapsible) */}
      {resolvedSection && (
        <div
          className={`border-b border-gray-100 transition-all duration-300 ${goalBarCollapsed ? 'h-10 overflow-hidden' : ''}`}
        >
          <div className="flex items-start gap-2 px-6 py-3">
            <button
              type="button"
              onClick={toggleGoalBar}
              className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-gray-600"
              title={goalBarCollapsed ? '展开目标' : '折叠目标'}
            >
              <svg
                className={`h-4 w-4 transition-transform ${goalBarCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                本节目标
              </span>
              {!goalBarCollapsed && (
                <p className="mt-1 text-sm text-gray-600">{resolvedSection.goal}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* State-specific content */}
      <div className="flex-1 overflow-y-auto">
        <StateComponent
          nodeId={nodeId}
          goal={resolvedSection?.goal}
          content={resolvedSection?.content_draft}
          onComplete={startReview}
        />
      </div>
    </div>
  );
}
