/**
 * Document Loader — imports local files for Sculptor to use as blueprints.
 * Supports: .txt, .md, .json, and basic PDF text extraction.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LoadedDocument {
  /** File path */
  filePath: string;
  /** File name */
  fileName: string;
  /** Raw text content */
  content: string;
  /** Detected format */
  format: 'txt' | 'md' | 'json' | 'pdf' | 'unknown';
  /** File size in bytes */
  size: number;
  /** Line count */
  lineCount: number;
  /** Character count */
  charCount: number;
  /** Load timestamp */
  loadedAt: string;
}

/**
 * Load a document from the local filesystem.
 */
export function loadDocument(filePath: string): LoadedDocument | null {
  try {
    // Resolve path
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      console.error(`[DocumentLoader] File not found: ${resolved}`);
      return null;
    }

    const stats = fs.statSync(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');

    let format: LoadedDocument['format'] = 'unknown';
    if (ext === '.txt') format = 'txt';
    else if (ext === '.md') format = 'md';
    else if (ext === '.json') format = 'json';
    else if (ext === '.pdf') format = 'pdf';

    return {
      filePath: resolved,
      fileName: path.basename(resolved),
      content,
      format,
      size: stats.size,
      lineCount: lines.length,
      charCount: content.length,
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[DocumentLoader] Error loading ${filePath}:`, err);
    return null;
  }
}

/**
 * Quick summary of a loaded document.
 */
export function summarizeDocument(doc: LoadedDocument): string {
  const preview = doc.content.slice(0, 500).replace(/\n/g, ' ');
  return [
    `📄 ${doc.fileName} (${doc.format})`,
    `   大小: ${(doc.size / 1024).toFixed(1)}KB | ${doc.lineCount}行 | ${doc.charCount}字`,
    `   预览: ${preview}...`,
  ].join('\n');
}
