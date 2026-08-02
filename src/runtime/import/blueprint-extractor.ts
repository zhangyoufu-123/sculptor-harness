/**
 * Blueprint Extractor — extracts structure from imported documents.
 * The imported document becomes the "base blueprint" for rewriting.
 */

import { LLMClient } from '@/lib/llm-client';
import type { LoadedDocument } from './document-loader';

const getLLM = () => new LLMClient();

export interface ExtractedBlueprint {
  /** Source document */
  sourceFile: string;
  /** Overall topic */
  topic: string;
  /** Core thesis/argument */
  thesis: string;
  /** Key sections with their content summaries */
  sections: BlueprintSection[];
  /** Key claims made in the document */
  claims: BlueprintClaim[];
  /** Evidence and data points */
  evidence: BlueprintEvidence[];
  /** Detected writing style patterns */
  stylePatterns: string[];
  /** Suggested rewrite approaches */
  rewriteApproaches: string[];
}

export interface BlueprintSection {
  title: string;
  summary: string;
  keyPoints: string[];
  importance: 'core' | 'supporting' | 'optional';
}

export interface BlueprintClaim {
  claim: string;
  support: string;
  confidence: number;
}

export interface BlueprintEvidence {
  type: 'data' | 'quote' | 'example' | 'citation';
  content: string;
  source: string;
}

/**
 * Extract a blueprint from a loaded document using LLM.
 */
export async function extractBlueprint(doc: LoadedDocument): Promise<ExtractedBlueprint> {
  // For large documents, analyze in chunks
  const chunks = chunkDocument(doc.content, 3000);
  const analysis = await analyzeChunk(chunks[0], doc.fileName);

  // For multi-chunk docs, merge analyses
  for (let i = 1; i < Math.min(chunks.length, 3); i++) {
    const chunkAnalysis = await analyzeChunk(chunks[i], doc.fileName);
    analysis.sections.push(...chunkAnalysis.sections);
    analysis.claims.push(...chunkAnalysis.claims);
    analysis.evidence.push(...chunkAnalysis.evidence);
    analysis.stylePatterns = dedupeStrings([
      ...analysis.stylePatterns,
      ...chunkAnalysis.stylePatterns,
    ]);
  }

  return analysis;
}

async function analyzeChunk(content: string, fileName: string): Promise<ExtractedBlueprint> {
  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: `你是文档分析专家。从导入的文档中提取结构化蓝图。输出JSON。`,
      prompt: `分析以下文档内容，提取:
1. 主题、核心论点
2. 章节结构（标题、摘要、关键点）
3. 主要观点和支撑
4. 数据、引用、案例
5. 写作风格特征
6. 建议的改写方向

文档内容:
${content.slice(0, 2500)}

以JSON格式输出。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 1500,
    });

    if (response.json) {
      const data = response.json as Record<string, unknown>;
      return {
        sourceFile: fileName,
        topic: (data.topic as string) || '',
        thesis: (data.thesis as string) || '',
        sections: (data.sections as BlueprintSection[]) || [],
        claims: (data.claims as BlueprintClaim[]) || [],
        evidence: (data.evidence as BlueprintEvidence[]) || [],
        stylePatterns: (data.stylePatterns as string[]) || [],
        rewriteApproaches: (data.rewriteApproaches as string[]) || [],
      };
    }
  } catch {
    /* fallback */
  }

  return {
    sourceFile: fileName,
    topic: '',
    thesis: '',
    sections: [{ title: '正文', summary: '导入的文档内容', keyPoints: [], importance: 'core' }],
    claims: [],
    evidence: [],
    stylePatterns: [],
    rewriteApproaches: ['保持原意的学术改写', '通俗化改写', '精简提炼'],
  };
}

/** Deduplicate an array of strings preserving order */
function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/** Split long document into manageable chunks */
function chunkDocument(content: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);
  let current = '';
  for (const p of paragraphs) {
    if (current.length + p.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = p;
    } else {
      current += (current ? '\n\n' : '') + p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Generate a summary of the extracted blueprint for display.
 */
export function summarizeBlueprint(bp: ExtractedBlueprint): string {
  return [
    `📋 蓝图: ${bp.sourceFile}`,
    `📌 主题: ${bp.topic}`,
    `💡 论点: ${bp.thesis.slice(0, 100)}`,
    ``,
    `📐 结构 (${bp.sections.length}节):`,
    ...bp.sections.map(
      (s) => `  ${s.importance === 'core' ? '⭐' : '  '} ${s.title}: ${s.summary.slice(0, 60)}`,
    ),
    ``,
    `🎨 风格: ${bp.stylePatterns.join(', ') || '未检测'}`,
    `🔄 建议改写方向: ${bp.rewriteApproaches.join(' | ')}`,
  ].join('\n');
}
