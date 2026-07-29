'use client';

import React, { useState, useCallback } from 'react';

interface NodeStudioLayoutProps {
  children: React.ReactNode;
}

export default function NodeStudioLayout({ children }: NodeStudioLayoutProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const toggleLeft = useCallback(() => {
    setLeftCollapsed((prev) => !prev);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left sidebar — StructureNav (240px, collapsible) */}
      <aside
        className={`
          relative flex-shrink-0 border-r border-gray-200 bg-white
          transition-all duration-300 ease-in-out
          ${leftCollapsed ? 'w-0 overflow-hidden border-r-0' : 'w-60'}
        `}
      >
        <div className="h-full w-60">{children}</div>
      </aside>

      {/* Collapse toggle button — pinned to the left sidebar edge */}
      <button
        type="button"
        onClick={toggleLeft}
        className={`
          absolute top-4 z-20 flex h-7 w-7 items-center justify-center
          rounded-full border border-gray-300 bg-white text-gray-500
          shadow-sm transition-all duration-300 hover:bg-gray-100 hover:text-gray-700
          ${leftCollapsed ? 'left-2' : 'left-[232px]'}
        `}
        aria-label={leftCollapsed ? '展开侧边栏' : '折叠侧边栏'}
        title={leftCollapsed ? '展开侧边栏' : '折叠侧边栏'}
      >
        {leftCollapsed ? (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        )}
      </button>
    </div>
  );
}
