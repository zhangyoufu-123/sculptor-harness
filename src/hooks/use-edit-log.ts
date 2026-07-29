'use client';

import { useRef, useCallback, useEffect } from 'react';

interface EditRecord {
  /** Unique edit ID */
  id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Project identifier */
  projectId: string;
  /** Node identifier */
  nodeId: string;
  /** What the content was before this edit */
  before: string;
  /** What the content became after this edit */
  after: string;
  /** Character-level diff summary (first 200 chars changed) */
  diffSummary: string;
}

interface UseEditLogOptions {
  /** Project ID for grouping edits */
  projectId: string;
  /** Current node ID */
  nodeId: string;
  /** Debounce interval in ms before sending batch (default: 5000) */
  debounceMs?: number;
  /** Max records before force-send (default: 50) */
  maxBatchSize?: number;
}

interface UseEditLogReturn {
  /** Record an edit event */
  recordEdit: (before: string, after: string) => void;
  /** Force-send pending edits immediately */
  flush: () => Promise<void>;
  /** Number of pending edits */
  pendingCount: number;
}

/**
 * Hook that records raw edit events in the browser and periodically
 * sends them in batches to the server for lightweight logging.
 *
 * This is the RAW edit log — every keystroke-level change.
 * Different from Creative Signal Log (semantic patterns) and
 * Decision History (architectural decisions).
 */
export function useEditLog(options: UseEditLogOptions): UseEditLogReturn {
  const { projectId, nodeId, debounceMs = 5000, maxBatchSize = 50 } = options;

  const pendingRef = useRef<EditRecord[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCountRef = useRef(0);

  const sendBatch = useCallback(async (records: EditRecord[]) => {
    if (records.length === 0) return;

    try {
      await fetch('/api/node/edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits: records }),
      });
    } catch (error) {
      // Raw edit log is best-effort; failures are silently ignored
      console.warn('[EditLog] Failed to send edit batch:', error);
    }
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const batch = [...pendingRef.current];
    pendingRef.current = [];
    pendingCountRef.current = 0;
    await sendBatch(batch);
  }, [sendBatch]);

  const recordEdit = useCallback(
    (before: string, after: string) => {
      // Don't record if no change or if strings are identical
      if (before === after) return;

      const record: EditRecord = {
        id: `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        projectId,
        nodeId,
        before: before.slice(0, 500), // Truncate for storage
        after: after.slice(0, 500),
        diffSummary: computeDiff(before, after),
      };

      pendingRef.current.push(record);
      pendingCountRef.current = pendingRef.current.length;

      // Force-send if batch is full
      if (pendingRef.current.length >= maxBatchSize) {
        flush();
        return;
      }

      // Debounced send
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        flush();
      }, debounceMs);
    },
    [projectId, nodeId, maxBatchSize, debounceMs, flush],
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current.length > 0) {
        sendBatch([...pendingRef.current]);
      }
    };
  }, [sendBatch]);

  return {
    recordEdit,
    flush,
    pendingCount: pendingCountRef.current,
  };
}

/** Simple character-level diff summary */
function computeDiff(before: string, after: string): string {
  if (before.length === 0) return `新增 ${after.slice(0, 50)}...`;
  if (after.length === 0) return `删除 ${before.slice(0, 50)}...`;

  const added = after.length - before.length;
  if (added > 0) return `增加 ${added} 字符`;
  if (added < 0) return `减少 ${Math.abs(added)} 字符`;
  return '修改内容';
}
