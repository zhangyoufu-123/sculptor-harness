/**
 * Style Extractor — orchestrates the 4-pass style extraction pipeline.
 *
 * Pass 1: Computational features (milliseconds, no LLM)
 * Pass 2: LLM deep analysis (14-dimension structured JSON)
 * Pass 3: Comparative anchoring (position user in style space)
 * Pass 4: Seed 3D style vector (convert profile to trainable vector)
 */

import { LLMClient } from '@/lib/llm-client';
import {
  extractComputationalFeatures,
  formatComputationalSummary,
  type ComputationalFeatures,
} from './computational-features';
import { styleVectorStore, type StyleSnapshot } from './style-vector-store';
import type { StyleProfile, DimensionScore } from '@/prompts/discovery/style-extraction.prompt';

const getLLM = () => new LLMClient();

// ─── Types ────────────────────────────────────────────────────

export interface ExtractionResult {
  /** Whether extraction succeeded */
  success: boolean;
  /** Pass 1: raw computational features */
  computational: ComputationalFeatures;
  /** Pass 2: LLM-extracted style profile (14 dimensions) */
  profile: StyleProfile | null;
  /** Pass 3: anchor comparison */
  anchor: StyleAnchor;
  /** Pass 4: post-seed vector snapshot */
  vectorSnapshot: StyleSnapshot;
  /** Human-readable summary for user feedback */
  userFeedback: string;
  /** Total extraction time in ms */
  extractionTime: number;
  /** Error message if failed */
  error?: string;
}

export interface StyleAnchor {
  /** Closest known style from profile */
  closest: string;
  /** Dimensions with highest confidence (>0.7) */
  highConfidenceDimensions: string[];
  /** Dimensions with lowest confidence (<0.3) — need more data */
  lowConfidenceDimensions: string[];
  /** What makes this style unique (top 3 distinguishing features) */
  distinguishingFeatures: string[];
  /** Overall uniqueness score (0-1) */
  uniquenessScore: number;
}

// ─── Main Pipeline ────────────────────────────────────────────

/**
 * Run the full 4-pass style extraction pipeline on a text sample.
 * Sample should be 300-5000 characters for best results.
 */
export async function extractStyle(
  textSample: string,
  options?: {
    /** Skip LLM pass (Pass 2) — only use computational features */
    skipLLM?: boolean;
    /** Existing style profile to merge with (for incremental extraction) */
    existingProfile?: StyleProfile | null;
  },
): Promise<ExtractionResult> {
  const startTime = Date.now();

  // Validate input
  if (!textSample || textSample.trim().length < 50) {
    return {
      success: false,
      computational: extractComputationalFeatures(''),
      profile: null,
      anchor: {
        closest: 'unknown',
        highConfidenceDimensions: [],
        lowConfidenceDimensions: [],
        distinguishingFeatures: [],
        uniquenessScore: 0,
      },
      vectorSnapshot: styleVectorStore.getSnapshot(),
      userFeedback: '文本太短，至少需要50字才能进行风格分析。',
      extractionTime: Date.now() - startTime,
      error: 'TEXT_TOO_SHORT',
    };
  }

  if (options?.existingProfile) {
    void options.existingProfile;
  }

  // ═══ PASS 1: Computational Features ═════════════════════════
  const computational = extractComputationalFeatures(textSample);
  const compSummary = formatComputationalSummary(computational);

  // ═══ PASS 2: LLM Deep Analysis ═════════════════════════════
  let profile: StyleProfile | null = null;

  if (!options?.skipLLM) {
    try {
      const llm = getLLM();
      const prompt = buildExtractionPrompt(textSample, compSummary);

      const response = await llm.completeWithRetry({
        systemPrompt: '你是文学风格分析师。从14个维度提取作者风格特征。输出纯JSON。',
        prompt,
        responseFormat: 'json',
        temperature: 0.3,
        maxTokens: 2000,
      });

      if (response.json) {
        profile = response.json as StyleProfile;
      }
    } catch (err) {
      console.error('[StyleExtractor] LLM extraction failed:', err);
      // Continue with computational-only — profile will be null
    }
  }

  // ═══ PASS 3: Comparative Anchoring ═════════════════════════
  const anchor = buildAnchor(profile, computational);

  // ═══ PASS 4: Seed 3D Style Vector ════════════════════════
  if (profile) {
    seedVectorFromProfile(profile, textSample);
  } else {
    // Fallback: seed from computational only
    seedVectorFromComputational(computational);
  }

  const vectorSnapshot = styleVectorStore.getSnapshot();
  const userFeedback = buildUserFeedback(profile, anchor, computational);

  return {
    success: true,
    computational,
    profile,
    anchor,
    vectorSnapshot,
    userFeedback,
    extractionTime: Date.now() - startTime,
  };
}

// ─── Pass 2 Helper: Build extraction prompt ──────────────────

function buildExtractionPrompt(text: string, compSummary: string): string {
  return `【文本样本】
${text.slice(0, 4000)}

【计算语言学辅助数据】
${compSummary}

请按照14维分析框架，输出结构化JSON。`;
}

// ─── Pass 3: Comparative Anchoring ────────────────────────────

function buildAnchor(
  profile: StyleProfile | null,
  computational: ComputationalFeatures,
): StyleAnchor {
  if (!profile) {
    // Computational-only anchoring
    const features: string[] = [];
    if (computational.sentence.shortRatio > 0.5) features.push('短句主导');
    if (computational.sentence.longRatio > 0.3) features.push('长句主导');
    if (computational.modifiers.modifierDensity < 0.01) features.push('修饰极少');
    if (computational.modifiers.modifierDensity > 0.05) features.push('修饰丰富');
    if (computational.dialogue.dialogueSegments > 0) features.push('含对话');

    return {
      closest: 'unknown',
      highConfidenceDimensions: [],
      lowConfidenceDimensions: ['all (LLM extraction skipped)'],
      distinguishingFeatures: features,
      uniquenessScore: 0.3,
    };
  }

  const highConf: string[] = [];
  const lowConf: string[] = [];

  for (const [key, dim] of Object.entries(profile.dimensions)) {
    if ((dim as DimensionScore).confidence === 'high') highConf.push(key);
    else if ((dim as DimensionScore).confidence === 'low') lowConf.push(key);
  }

  // Distinguishing features: dimensions with extreme scores (<0.2 or >0.8)
  const distinguishing: string[] = [];
  for (const [key, dim] of Object.entries(profile.dimensions)) {
    const d = dim as DimensionScore;
    if (d.score < 0.2 || d.score > 0.8) {
      distinguishing.push(
        `${key}: ${d.score < 0.2 ? '极低' : '极高'} (${d.description.slice(0, 20)})`,
      );
    }
  }

  return {
    closest: profile.closestKnownStyle,
    highConfidenceDimensions: highConf,
    lowConfidenceDimensions: lowConf,
    distinguishingFeatures: distinguishing.slice(0, 3),
    uniquenessScore: profile.uniquenessFactor,
  };
}

// ─── Pass 4: Seed 3D Style Vector ────────────────────────────

function seedVectorFromProfile(profile: StyleProfile, textSample: string): void {
  // textSample is reserved for future use (e.g., sample-based embedding refinement)
  void textSample;

  const feedbacks: Array<{
    dimension: 1 | 2 | 3;
    feature: string;
    correction: number;
    reason: string;
  }> = [];

  // ── D1: Personal Dataset from 14 dimensions ─────────────
  for (const [key, dim] of Object.entries(profile.dimensions)) {
    const d = dim as DimensionScore;
    if (d.confidence === 'low') continue;

    // Convert each dimension's score into a correction signal
    // Extreme scores (>0.7 or <0.3) get stronger corrections
    const extremity = Math.abs(d.score - 0.5) * 2; // 0 (neutral) to 1 (extreme)
    const correction = d.score > 0.5 ? extremity : -extremity;

    feedbacks.push({
      dimension: 1,
      feature: `${key}:${d.description.slice(0, 30)}`,
      correction,
      reason: `D1 seed: ${key}=${d.score.toFixed(2)}`,
    });
  }

  // ── D2: Deviation from average (from uniqueness) ────────
  if (profile.uniquenessFactor > 0.3) {
    feedbacks.push({
      dimension: 2,
      feature: `独特风格因子:${profile.uniquenessFactor.toFixed(2)}`,
      correction: profile.uniquenessFactor * 0.5,
      reason: `D2 seed: uniqueness=${profile.uniquenessFactor.toFixed(2)}`,
    });
  }

  // ── D3: Attention Focus from top words and imagery ──────
  for (const word of profile.topWords.slice(0, 8)) {
    feedbacks.push({
      dimension: 3,
      feature: word,
      correction: 1.0,
      reason: `D3 seed: vocabulary "${word}"`,
    });
  }

  for (const imagery of profile.topImagery.slice(0, 5)) {
    feedbacks.push({
      dimension: 3,
      feature: imagery,
      correction: 0.8,
      reason: `D3 seed: imagery "${imagery}"`,
    });
  }

  for (const technique of profile.topTechniques.slice(0, 5)) {
    feedbacks.push({
      dimension: 3,
      feature: technique,
      correction: 0.7,
      reason: `D3 seed: technique "${technique}"`,
    });
  }

  // Apply all at once
  styleVectorStore.applyFeedbackBatch(feedbacks);
}

function seedVectorFromComputational(computational: ComputationalFeatures): void {
  // Fallback: seed from computational features only
  const feedbacks: Array<{
    dimension: 1 | 2 | 3;
    feature: string;
    correction: number;
    reason: string;
  }> = [];

  // Sentence length preference
  if (computational.sentence.shortRatio > 0.5) {
    feedbacks.push({ dimension: 1, feature: '短句偏好', correction: 0.8, reason: '短句主导' });
  } else if (computational.sentence.longRatio > 0.3) {
    feedbacks.push({ dimension: 1, feature: '长句偏好', correction: 0.8, reason: '长句主导' });
  }

  // Modifier density
  if (computational.modifiers.modifierDensity < 0.01) {
    feedbacks.push({ dimension: 1, feature: '修饰极少', correction: 0.6, reason: '修饰密度低' });
  } else if (computational.modifiers.modifierDensity > 0.05) {
    feedbacks.push({ dimension: 1, feature: '修饰丰富', correction: 0.6, reason: '修饰密度高' });
  }

  // Dialogue
  if (computational.dialogue.dialogueSegments > 0) {
    feedbacks.push({ dimension: 3, feature: '对话', correction: 0.5, reason: '含对话' });
  }

  // Top words
  for (const w of computational.words.topWords.slice(0, 8)) {
    feedbacks.push({ dimension: 3, feature: w.word, correction: 0.6, reason: `高频词:${w.word}` });
  }

  // Punctuation patterns
  if (computational.punctuation.exclamationDensity > 0.5) {
    feedbacks.push({ dimension: 1, feature: '感叹号偏好', correction: 0.5, reason: '感叹号密集' });
  }
  if (computational.punctuation.questionDensity > 0.5) {
    feedbacks.push({ dimension: 1, feature: '问号偏好', correction: 0.5, reason: '问号密集' });
  }

  styleVectorStore.applyFeedbackBatch(feedbacks);
}

// ─── User Feedback Builder ───────────────────────────────────

function buildUserFeedback(
  profile: StyleProfile | null,
  anchor: StyleAnchor,
  computational: ComputationalFeatures,
): string {
  const lines: string[] = [];

  if (profile) {
    lines.push(`📊 风格分析完成（${computational.charCount}字样本）`);
    lines.push('');
    lines.push(profile.narrativeSummary);
    lines.push('');

    if (anchor.closest !== 'unknown') {
      lines.push(`🎯 最接近的风格类型：${anchor.closest}`);
    }

    if (anchor.distinguishingFeatures.length > 0) {
      lines.push(`✨ 突出特征：`);
      for (const f of anchor.distinguishingFeatures) {
        lines.push(`   • ${f}`);
      }
    }

    if (anchor.lowConfidenceDimensions.length > 0) {
      lines.push('');
      lines.push(`⚠️ 以下维度数据不足，将在后续对话中继续学习：`);
      lines.push(`   ${anchor.lowConfidenceDimensions.join('、')}`);
    }
  } else {
    lines.push(`📊 基础风格分析完成`);
    lines.push(`   样本: ${computational.charCount}字`);
    lines.push(`   句长: 均值${computational.sentence.avgLength}字`);
    lines.push(`   修饰密度: ${(computational.modifiers.modifierDensity * 100).toFixed(1)}%`);
    lines.push('');
    lines.push('（LLM深度分析未执行，使用计算特征作为初始向量）');
  }

  lines.push('');
  lines.push('💡 在后续对话中，你的每次选择都会帮助我更好地理解你的风格。');

  return lines.join('\n');
}

// Re-export DimensionScore for consumers
export type { DimensionScore };
