/**
 * Error-logger ("错题本") — records AI/API errors for future prompt injection.
 *
 * CURRENT: File-based fallback (no database dependency).
 * MIGRATION PATH: Uncomment the Prisma section below when a database is wired.
 *
 * --- Prisma schema (future) ---
 * model ErrorLog {
 *   id                String   @id @default(cuid())
 *   userId            String
 *   documentId        String
 *   errorType         String
 *   errorDescription  String
 *   contextSnapshot   Json
 *   fixInstruction    String
 *   createdAt         DateTime @default(now())
 * }
 *
 * Then replace logError() body with:
 *   await prisma.errorLog.create({ data: { ... } });
 */

import fs from 'fs';
import path from 'path';

const ERROR_LOG_PATH = path.join(process.cwd(), '.error-log.jsonl');

interface ErrorLogEntry {
  timestamp: string;
  userId: string;
  documentId: string;
  errorType: string;
  description: string;
  contextSnapshot: unknown;
  fixInstruction: string;
}

export async function logError(params: {
  userId: string;
  documentId: string;
  errorType: string;
  description: string;
  contextSnapshot: unknown;
  fixInstruction: string;
}): Promise<void> {
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    userId: params.userId,
    documentId: params.documentId,
    errorType: params.errorType,
    description: params.description,
    contextSnapshot: params.contextSnapshot,
    fixInstruction: params.fixInstruction,
  };

  // File-based fallback — append one JSON line per error
  try {
    fs.appendFileSync(ERROR_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (fsError) {
    console.error('[ErrorLogger] Failed to write error log:', fsError);
  }

  // Also log to console for immediate visibility
  console.warn(`[ErrorLogger] ${params.errorType}: ${params.description}`);
}

/**
 * Read recent errors for prompt injection (e.g., warn AI about past mistakes).
 */
export function getRecentErrors(limit = 10): ErrorLogEntry[] {
  try {
    if (!fs.existsSync(ERROR_LOG_PATH)) return [];
    const lines = fs.readFileSync(ERROR_LOG_PATH, 'utf-8').trim().split('\n');
    return lines
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as ErrorLogEntry)
      .reverse();
  } catch {
    return [];
  }
}
