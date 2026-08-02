/**
 * Multi-Style Rewriter — rewrites content in different styles.
 * Uses the imported document as a blueprint, then rewrites each section
 * in the user's chosen style.
 */

import { LLMClient } from '@/lib/llm-client';
import type { ExtractedBlueprint, BlueprintSection } from './blueprint-extractor';

const getLLM = () => new LLMClient();

export type RewriteStyle =
  | 'academic' // 学术论文
  | 'popular' // 通俗科普
  | 'ppt' // PPT演讲文案
  | 'social' // 社交媒体
  | 'executive' // 执行摘要
  | 'narrative' // 叙事散文
  | 'technical' // 技术文档
  | 'preserve'; // 保持原风格

export interface RewriteOptions {
  style: RewriteStyle;
  targetAudience?: string;
  targetLength?: 'shorter' | 'similar' | 'longer';
  preserveClaims?: boolean;
  addExamples?: boolean;
}

export interface RewrittenSection {
  originalTitle: string;
  originalSummary: string;
  rewrittenContent: string;
  style: RewriteStyle;
  notes: string;
}

const STYLE_PROMPTS: Record<RewriteStyle, string> = {
  academic: '改写为学术论文风格。使用正式语言、文献引用、逻辑论证结构。',
  popular: '改写为通俗科普风格。用简单语言解释复杂概念，加入生活化比喻。',
  ppt: '改写为PPT演讲文案。使用短句、口语化表达、强调节奏感和感染力。每段控制在50字内。',
  social: '改写为社交媒体风格。简短有力，有话题性，适合朋友圈/小红书发布。',
  executive: '改写为执行摘要。提炼核心观点，去除细节，适合快速阅读。',
  narrative: '改写为叙事散文风格。用具体场景和细节表达观点，有情感温度。',
  technical: '改写为技术文档风格。保持技术准确性，增加代码示例和架构说明。',
  preserve: '保持原风格，仅优化表达流畅度和逻辑结构。',
};

/**
 * Rewrite a blueprint section in a specified style.
 */
export async function rewriteSection(
  section: BlueprintSection,
  originalContent: string,
  options: RewriteOptions,
): Promise<RewrittenSection> {
  const stylePrompt = STYLE_PROMPTS[options.style] || STYLE_PROMPTS.preserve;

  const prompt = `原始内容:
${originalContent.slice(0, 1500)}

改写要求:
- 风格: ${stylePrompt}
${options.targetAudience ? `- 目标读者: ${options.targetAudience}` : ''}
${options.targetLength === 'shorter' ? '- 长度: 精简到原文的60%' : ''}
${options.targetLength === 'longer' ? '- 长度: 扩展到原文的150%，增加细节' : ''}
${options.preserveClaims ? '- 保留所有核心观点和数据' : ''}
${options.addExamples ? '- 适当增加案例和例证' : ''}

请输出改写后的内容。`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: `你是多风格写作专家。根据指定风格改写内容。保留核心信息，调整表达方式。`,
      prompt,
      temperature: 0.5,
      maxTokens: 2000,
    });

    return {
      originalTitle: section.title,
      originalSummary: section.summary,
      rewrittenContent: response.text || originalContent,
      style: options.style,
      notes: `改写为${options.style}风格`,
    };
  } catch {
    return {
      originalTitle: section.title,
      originalSummary: section.summary,
      rewrittenContent: originalContent,
      style: options.style,
      notes: '改写失败，保持原文',
    };
  }
}

/**
 * Rewrite an entire blueprint in a new style.
 */
export async function rewriteBlueprint(
  blueprint: ExtractedBlueprint,
  content: string,
  options: RewriteOptions,
): Promise<RewrittenSection[]> {
  const results: RewrittenSection[] = [];

  // Rewrite the thesis/introduction first
  const introSection: BlueprintSection = {
    title: '引言',
    summary: blueprint.thesis,
    keyPoints: [],
    importance: 'core',
  };
  const introResult = await rewriteSection(introSection, content.slice(0, 800), options);
  results.push(introResult);

  // Rewrite each major section
  for (const section of blueprint.sections.slice(0, 5)) {
    const sectionContent = extractSectionContent(content, section.title);
    const result = await rewriteSection(section, sectionContent || content.slice(0, 500), options);
    results.push(result);
  }

  return results;
}

/** Extract content around a section title from the document */
function extractSectionContent(content: string, title: string): string {
  const idx = content.indexOf(title);
  if (idx < 0) return '';
  const start = Math.max(0, idx);
  const end = Math.min(content.length, idx + 1000);
  return content.slice(start, end);
}
