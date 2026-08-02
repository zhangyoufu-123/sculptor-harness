/**
 * Multi-Style Rewriter — LLM-driven deep rewrite.
 *
 * Flow:
 * 1. Analyze document → extract deep structure, themes, audience fit
 * 2. Analyze user goal → determine output format, tone, depth requirements  
 * 3. Generate rewrite strategy → LLM designs the optimal approach
 * 4. Execute rewrite → per-section generation driven by the strategy
 */

import { LLMClient } from '@/lib/llm-client';
import type { ExtractedBlueprint, BlueprintSection } from './blueprint-extractor';

const getLLM = () => new LLMClient();

// ─── Analysis Types ────────────────────────────────────────────

export interface DocumentAnalysis {
  /** What type of document is this? */
  documentType: string;
  /** Target audience the original was written for */
  originalAudience: string;
  /** Complexity level: basic, intermediate, advanced, expert */
  complexity: string;
  /** Key themes extracted */
  themes: string[];
  /** Structure pattern: argumentative, narrative, expository, etc. */
  structurePattern: string;
  /** Tone: formal, conversational, technical, emotional, neutral */
  tone: string;
  /** Notable stylistic features */
  stylisticFeatures: string[];
  /** Core arguments that must be preserved */
  coreArguments: string[];
  /** Weak points that need improvement */
  weaknesses: string[];
}

export interface RewriteStrategy {
  /** Output format: 学术论文, PPT演讲文案, 通俗科普, 社交媒体, 执行摘要, etc. */
  outputFormat: string;
  /** Target audience for the rewrite */
  targetAudience: string;
  /** Tone to use */
  tone: string;
  /** Structure transformation: how to remap sections */
  structureTransform: string;
  /** Depth adjustment: expand, condense, keep */
  depth: 'expand' | 'condense' | 'keep';
  /** Key angles to emphasize */
  angles: string[];
  /** Writing guidelines — LLM-generated, specific to this document+goal */
  writingGuidelines: string[];
  /** Example output snippets the LLM generates as reference */
  referenceStyle: string;
}

export interface RewrittenSection {
  originalTitle: string;
  rewrittenContent: string;
  strategyNotes: string;
}

export interface RewriteResult {
  strategy: RewriteStrategy;
  sections: RewrittenSection[];
  fullOutput: string;
}

// ─── Phase 1: Deep Document Analysis ───────────────────────────

/**
 * LLM deeply analyzes the document — NOT template matching.
 * Understands: type, audience, complexity, themes, structure, tone, weaknesses.
 */
export async function analyzeDocument(
  content: string,
  blueprint: ExtractedBlueprint,
): Promise<DocumentAnalysis> {
  const llm = getLLM();

  const prompt = `你是一位资深编辑和分析师。请深度分析以下文档：

【文档内容】
${content.slice(0, 4000)}

【已提取的结构】
- 主题: ${blueprint.topic}
- 论点: ${blueprint.thesis}
- 章节: ${blueprint.sections.map((s) => s.title).join('、')}
- 风格特征: ${blueprint.stylePatterns.join('、')}

请从以下维度进行深度分析（返回JSON）：

1. documentType: 这是什么类型的文档？（不要用简单标签，要具体描述）
2. originalAudience: 原文面向什么读者？
3. complexity: 复杂度（basic/intermediate/advanced/expert）
4. themes: 核心主题列表（至少3个）
5. structurePattern: 结构模式（argumentative/narrative/expository/mixed等）
6. tone: 语气风格（具体描述，不要单标签）
7. stylisticFeatures: 值得注意的写作特点（至少3个）
8. coreArguments: 必须保留的核心论点（至少3个）
9. weaknesses: 可以改进的弱点（至少2个）

输出JSON，不要有其他文字。`;

  try {
    const response = await llm.completeWithRetry({
      systemPrompt: '你是文档分析专家。深度理解文档的每个维度。输出纯JSON。',
      prompt,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 1500,
    });

    if (response.json) {
      return response.json as DocumentAnalysis;
    }
  } catch {
    /* fallback */
  }

  return {
    documentType: '未分类文档',
    originalAudience: '通用读者',
    complexity: 'intermediate',
    themes: [blueprint.topic],
    structurePattern: 'mixed',
    tone: 'neutral',
    stylisticFeatures: [],
    coreArguments: [blueprint.thesis],
    weaknesses: ['需要进一步分析'],
  };
}

// ─── Phase 2: Strategy Generation ──────────────────────────────

/**
 * LLM designs the rewrite strategy based on:
 * - Document analysis
 * - User's stated goal
 * - No hardcoded templates — LLM decides everything
 */
export async function generateRewriteStrategy(
  analysis: DocumentAnalysis,
  userGoal: string,
  blueprint: ExtractedBlueprint,
): Promise<RewriteStrategy> {
  const llm = getLLM();

  const prompt = `你是一位创意写作策略师。根据以下信息，设计一个改写策略。

【文档分析】
- 类型: ${analysis.documentType}
- 原读者: ${analysis.originalAudience}
- 复杂度: ${analysis.complexity}
- 主题: ${analysis.themes.join('、')}
- 结构: ${analysis.structurePattern}
- 语气: ${analysis.tone}
- 特点: ${analysis.stylisticFeatures.join('、')}
- 核心论点: ${analysis.coreArguments.join('、')}
- 弱点: ${analysis.weaknesses.join('、')}

【用户目标】
${userGoal}

【文档结构】
${blueprint.sections.map((s) => `- ${s.title} (${s.importance}): ${s.summary}`).join('\n')}

请设计最优改写策略（返回JSON）：

1. outputFormat: 输出格式的具体描述（如"面向企业高管的15分钟PPT演讲文案"而非简单的"PPT"）
2. targetAudience: 目标读者详细画像
3. tone: 具体语气风格描述（包含具体例子）
4. structureTransform: 如何重新组织原文结构？哪些保留、哪些重构、哪些删除？
5. depth: expand（扩展）/ condense（压缩）/ keep（保持）
6. angles: 强调的角度（至少3个，具体且有针对性）
7. writingGuidelines: 写作指南（5-8条，具体可执行，针对本文档）
8. referenceStyle: 生成一段100字的示例文本，展示目标风格

输出JSON，不要有其他文字。`;

  try {
    const response = await llm.completeWithRetry({
      systemPrompt: '你是创意策略专家。根据文档分析设计最优改写方案。输出纯JSON。',
      prompt,
      responseFormat: 'json',
      temperature: 0.5,
      maxTokens: 1500,
    });

    if (response.json) {
      return response.json as RewriteStrategy;
    }
  } catch {
    /* fallback */
  }

  return {
    outputFormat: userGoal,
    targetAudience: '通用读者',
    tone: '专业但不失可读性',
    structureTransform: '保留核心结构，优化表达',
    depth: 'keep',
    angles: ['核心论点', '实用价值'],
    writingGuidelines: ['保持原意', '优化结构', '增强可读性'],
    referenceStyle: '保持原文风格，优化表达流畅度。',
  };
}

// ─── Phase 3: Execute Rewrite ──────────────────────────────────

/**
 * Rewrite each section based on the LLM-generated strategy.
 * NO hardcoded templates — strategy drives everything.
 */
export async function executeRewrite(
  blueprint: ExtractedBlueprint,
  content: string,
  strategy: RewriteStrategy,
): Promise<RewriteResult> {
  const llm = getLLM();
  const sections: RewrittenSection[] = [];

  // Rewrite introduction/thesis
  const introSection: BlueprintSection = {
    title: '引言与核心论点',
    summary: blueprint.thesis,
    keyPoints: blueprint.claims.map((c) => c.claim),
    importance: 'core',
  };
  const intro = await rewriteOneSection(llm, introSection, content.slice(0, 1500), strategy);
  sections.push(intro);

  // Rewrite each body section
  for (const section of blueprint.sections.slice(0, 6)) {
    const sectionContent = extractSectionContent(content, section.title);
    const result = await rewriteOneSection(
      llm,
      section,
      sectionContent || content.slice(0, 800),
      strategy,
    );
    sections.push(result);
  }

  // Compile full output
  const fullOutput = sections
    .map((s) => `## ${s.originalTitle}\n\n${s.rewrittenContent}`)
    .join('\n\n---\n\n');

  return { strategy, sections, fullOutput };
}

async function rewriteOneSection(
  llm: LLMClient,
  section: BlueprintSection,
  sectionContent: string,
  strategy: RewriteStrategy,
): Promise<RewrittenSection> {
  const prompt = `【改写策略】
- 输出格式: ${strategy.outputFormat}
- 目标读者: ${strategy.targetAudience}
- 语气: ${strategy.tone}
- 结构变换: ${strategy.structureTransform}
- 深度: ${strategy.depth}
- 强调角度: ${strategy.angles.join('、')}
- 写作指南:
${strategy.writingGuidelines.map((g, i) => `  ${i + 1}. ${g}`).join('\n')}
- 参考风格: ${strategy.referenceStyle}

【原始章节】
标题: ${section.title}
摘要: ${section.summary}
关键点: ${section.keyPoints.join('、')}

【原始内容】
${sectionContent.slice(0, 2000)}

请按照上述策略改写这一节。输出改写后的完整内容，不要加任何解释。`;

  try {
    const response = await llm.completeWithRetry({
      systemPrompt: `你是${strategy.outputFormat}的写作专家。严格按照策略改写内容。`,
      prompt,
      temperature: 0.6,
      maxTokens: 2000,
    });

    return {
      originalTitle: section.title,
      rewrittenContent: response.text || sectionContent,
      strategyNotes: `${strategy.outputFormat} | ${strategy.tone}`,
    };
  } catch {
    return {
      originalTitle: section.title,
      rewrittenContent: sectionContent,
      strategyNotes: '改写失败，保持原文',
    };
  }
}

/** Extract content around a section title */
function extractSectionContent(content: string, title: string): string {
  const idx = content.indexOf(title);
  if (idx < 0) return '';
  return content.slice(idx, Math.min(content.length, idx + 1500));
}
