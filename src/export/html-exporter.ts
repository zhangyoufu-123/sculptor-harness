/**
 * Multimodal HTML Publishing Engine — Sprint 6
 * Exports completed Sculptor projects as self-contained HTML artifacts
 * with embedded media, styled typography, and hidden creation metadata.
 */

import type { PCSState, StructureSection } from '@/pcs/types';

export interface MediaAsset {
  type: 'image' | 'audio' | 'video' | 'link';
  url: string;
  position: string;
  caption: string;
  source: string;
  license?: string;
}

export interface ExportOptions {
  /** Include AI-generated summaries as asides */
  includeSummaries?: boolean;
  /** Include media assets */
  includeMedia?: boolean;
  /** Inline CSS (vs external stylesheet) */
  inlineCss?: boolean;
  /** Hide creation metadata in HTML comments */
  hideMetadata?: boolean;
  /** Output format */
  format?: 'html' | 'markdown' | 'text';
}

export interface ExportResult {
  /** File path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Generated HTML content */
  content: string;
  /** Included sections count */
  sectionCount: number;
  /** Included media count */
  mediaCount: number;
}

/**
 * Export a completed Sculptor project as HTML.
 */
export function exportToHTML(
  state: PCSState,
  sections: StructureSection[],
  mediaAssets: MediaAsset[],
  options: ExportOptions = {},
): ExportResult {
  const completedSections = sections
    .filter(
      (s) =>
        s.draft_state === 'approved' || s.draft_state === 'locked' || s.draft_state === 'drafted',
    )
    .sort((a, b) => a.order - b.order);

  const includeSummaries = options.includeSummaries ?? true;
  const hideMetadata = options.hideMetadata ?? false;

  // Build HTML
  const htmlParts: string[] = [];

  // Header
  htmlParts.push(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Sculptor AI">
  <meta name="created" content="${new Date().toISOString()}">
  <title>${escapeHtml(state.intent.purpose.value.slice(0, 60))}</title>
  <style>
    body { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; font-family: system-ui, -apple-system, sans-serif; line-height: 1.8; color: #1a1a1a; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; margin-top: 2.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
    p { margin: 1em 0; }
    .summary { background: #f8f9fa; border-left: 3px solid #4a90d9; padding: 1em; margin: 1.5em 0; font-size: 0.9em; color: #555; }
    .metadata { display: none; }
    figure { margin: 2em 0; text-align: center; }
    figcaption { font-size: 0.85em; color: #888; margin-top: 0.5em; }
    img { max-width: 100%; height: auto; }
    audio, video { max-width: 100%; margin: 1em 0; }
    a { color: #4a90d9; }
    @media print { body { max-width: 100%; } }
  </style>
</head>
<body>
`);

  // Title
  const title = state.intent.purpose.value || '无标题';
  htmlParts.push(`<h1>${escapeHtml(title)}</h1>`);
  if (state.intent.core_message.value) {
    htmlParts.push(
      `<p class="subtitle"><em>${escapeHtml(state.intent.core_message.value)}</em></p>`,
    );
  }

  // Sections
  for (const section of completedSections) {
    if (!section.content_draft || section.content_draft.length === 0) continue;

    htmlParts.push(`<section id="${section.id}">`);
    htmlParts.push(`<h2>${escapeHtml(section.title)}</h2>`);

    // Content
    const paragraphs = section.content_draft.split('\n').filter((p) => p.trim().length > 0);
    for (const para of paragraphs) {
      htmlParts.push(`<p>${escapeHtml(para.trim())}</p>`);
    }

    // Summary aside
    if (includeSummaries && section.goal) {
      htmlParts.push(`<aside class="summary">🎯 本节目标：${escapeHtml(section.goal)}</aside>`);
    }

    // Injected media for this section
    for (const asset of mediaAssets) {
      if (asset.position === section.id || asset.position === section.title) {
        htmlParts.push(renderMediaAsset(asset));
      }
    }

    htmlParts.push('</section>');
  }

  // Footer with metadata
  htmlParts.push('<footer>');
  if (!hideMetadata) {
    htmlParts.push(`<!-- sculptor:phase=${state.phase} -->`);
    htmlParts.push(`<!-- sculptor:project=${state.project_id} -->`);
    htmlParts.push(`<!-- sculptor:sections=${completedSections.length} -->`);
    htmlParts.push(`<!-- sculptor:exported=${new Date().toISOString()} -->`);
  }
  htmlParts.push(
    `<p class="metadata">Created with Sculptor AI · ${completedSections.length} sections · ${new Date().toISOString().slice(0, 10)}</p>`,
  );
  htmlParts.push('</footer>');

  htmlParts.push('</body></html>');

  const content = htmlParts.join('\n');

  return {
    path: `exports/${state.project_id}.html`,
    size: Buffer.byteLength(content, 'utf-8'),
    content,
    sectionCount: completedSections.length,
    mediaCount: mediaAssets.length,
  };
}

/**
 * Export as plain Markdown.
 */
export function exportToMarkdown(state: PCSState, sections: StructureSection[]): string {
  const completed = sections
    .filter((s) => s.content_draft && s.content_draft.length > 0)
    .sort((a, b) => a.order - b.order);

  const parts: string[] = [];
  parts.push(`# ${state.intent.purpose.value || '无标题'}\n`);

  for (const section of completed) {
    parts.push(`## ${section.title}\n`);
    parts.push(section.content_draft);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Export as plain text.
 */
export function exportToText(state: PCSState, sections: StructureSection[]): string {
  const completed = sections
    .filter((s) => s.content_draft && s.content_draft.length > 0)
    .sort((a, b) => a.order - b.order);

  const parts: string[] = [];
  parts.push(`${state.intent.purpose.value || '无标题'}\n`);
  parts.push('='.repeat(40));

  for (const section of completed) {
    parts.push(`\n【${section.title}】\n`);
    parts.push(section.content_draft);
  }

  return parts.join('\n');
}

// =========================================================================
// Helpers
// =========================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMediaAsset(asset: MediaAsset): string {
  switch (asset.type) {
    case 'image':
      return `<figure><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.caption)}" loading="lazy"><figcaption>${escapeHtml(asset.caption)} · 来源：${escapeHtml(asset.source)}</figcaption></figure>`;
    case 'audio':
      return `<figure><audio controls><source src="${escapeHtml(asset.url)}"></audio><figcaption>${escapeHtml(asset.caption)}</figcaption></figure>`;
    case 'video':
      return `<figure><video controls><source src="${escapeHtml(asset.url)}"></video><figcaption>${escapeHtml(asset.caption)}</figcaption></figure>`;
    case 'link':
      return `<p><a href="${escapeHtml(asset.url)}" target="_blank" rel="noopener">${escapeHtml(asset.caption)}</a> · ${escapeHtml(asset.source)}</p>`;
    default:
      return '';
  }
}
