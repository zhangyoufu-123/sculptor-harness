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
        systemPrompt:
          '你只输出一个JSON对象，每个字段的值必须是0.0到1.0之间的数字。不要输出任何文字描述，不要用字符串代替数字。如果你不确定某个值，就填0.5。',
        prompt:
          prompt +
          '\n\n🔴 重要：每个维度的值必须是数字（0.0到1.0之间），不是字符串。"沉静内敛"不是有效值，必须写成数字如0.3。不确定就填0.5。',
        responseFormat: 'json',
        temperature: 0.3,
        maxTokens: 2000,
      });

      // response.json is auto-parsed when responseFormat='json'
      if (response.json) {
        profile = response.json as StyleProfile;
        console.error(
          '[StyleExtractor] profile.json present. Top keys:',
          Object.keys(response.json as object).join(', '),
        );

        // Normalize: LLM may return flat dimensions without wrapping
        const p = profile as unknown as Record<string, unknown>;
        if (!p.dimensions) {
          const dims: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(p)) {
            if (typeof v === 'number') {
              dims[k] = { score: v, description: String(k), confidence: 'medium' };
            } else if (typeof v === 'string') {
              // LLM gave a description instead of a number — infer score from text
              const score = inferScoreFromText(v);
              dims[k] = { score, description: v, confidence: 'low' };
            } else if (typeof v === 'object' && v !== null && 'score' in (v as object)) {
              dims[k] = v;
            }
          }
          if (Object.keys(dims).length > 0) {
            p.dimensions = dims;
            console.error(
              '[StyleExtractor] Normalized',
              Object.keys(dims).length,
              'flat dims into dimensions',
            );
          } else {
            const sampleEntry = Object.entries(p).find(([k]) => k !== 'dimensions');
            console.error(
              '[StyleExtractor] WARNING: No dims extracted. Sample:',
              sampleEntry?.[0],
              '→',
              typeof sampleEntry?.[1],
              '=',
              JSON.stringify(sampleEntry?.[1])?.slice(0, 60),
            );
          }
        }
      } else {
        // Fallback: try parsing from text
        const raw = response.text || '';
        if (raw) {
          profile = extractJSON(raw) as StyleProfile | null;
        }
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
  if (!profile || !profile.dimensions) {
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
  for (const [key, dim] of Object.entries(profile.dimensions || {})) {
    const d = dim as DimensionScore;
    if (!d) continue;
    const score = typeof d.score === 'number' ? d.score : Number(d.score);
    if (isNaN(score)) continue;
    if (d.confidence === 'low') continue;

    // Convert each dimension's score into a correction signal
    // Extreme scores (>0.7 or <0.3) get stronger corrections
    const extremity = Math.abs(score - 0.5) * 2; // 0 (neutral) to 1 (extreme)
    const correction = score > 0.5 ? extremity : -extremity;
    const desc = (d.description || '').slice(0, 30);

    feedbacks.push({
      dimension: 1,
      feature: `${key}:${desc}`,
      correction,
      reason: `D1 seed: ${key}=${score.toFixed(2)}`,
    });
  }

  // ── D2: Deviation from average (from uniqueness) ────────
  if (typeof profile.uniquenessFactor === 'number' && profile.uniquenessFactor > 0.3) {
    feedbacks.push({
      dimension: 2,
      feature: `独特风格因子:${profile.uniquenessFactor.toFixed(2)}`,
      correction: profile.uniquenessFactor * 0.5,
      reason: `D2 seed: uniqueness=${profile.uniquenessFactor.toFixed(2)}`,
    });
  }

  // ── D3: Attention Focus from top words and imagery ──────
  for (const word of (profile.topWords || []).slice(0, 8)) {
    if (!word) continue;
    feedbacks.push({
      dimension: 3,
      feature: word,
      correction: 1.0,
      reason: `D3 seed: vocabulary "${word}"`,
    });
  }

  for (const imagery of (profile.topImagery || []).slice(0, 5)) {
    if (!imagery) continue;
    feedbacks.push({
      dimension: 3,
      feature: imagery,
      correction: 0.8,
      reason: `D3 seed: imagery "${imagery}"`,
    });
  }

  for (const technique of (profile.topTechniques || []).slice(0, 5)) {
    if (!technique) continue;
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

// ─── Robust JSON Extraction ────────────────────────────────────

/**
 * Infer a numeric score from a descriptive text.
 * Handles common patterns: "沉静而内敛" → 0.3, "热烈激昂" → 0.9, "中性" → 0.5
 */
function inferScoreFromText(text: string): number {
  const t = text.toLowerCase();
  // High extreme keywords
  if (/热烈|激昂|极端|极其|非常|极强|十分|强烈/.test(t)) return 0.9;
  if (/犀利|激烈|浓郁|丰富|突出|密集/.test(t)) return 0.8;
  if (/较多|偏强|偏多|明显/.test(t)) return 0.7;
  // Medium-high
  if (/适中偏|稍强|较多|较浓/.test(t)) return 0.6;
  // Neutral
  if (/中等|均衡|适中|平和|中性|自然/.test(t)) return 0.5;
  // Medium-low
  if (/偏少|偏弱|较低|较少/.test(t)) return 0.4;
  if (/克制|含蓄|收敛|冷静|简约/.test(t)) return 0.3;
  if (/极少|极弱|极其克制/.test(t)) return 0.2;
  if (/无|全无|空白/.test(t)) return 0.1;
  // Default
  return 0.5;
}

/**
 * Extract JSON from a potentially messy LLM text response.
 * Handles: markdown code blocks, trailing text, BOM characters.
 */
function extractJSON(raw: string): unknown | null {
  if (!raw) return null;

  // Strategy 1: Direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // Strategy 2: Strip markdown code blocks
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Strategy 3: Find the first { and last }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // continue
    }
  }

  // Strategy 4: Remove BOM, try again
  try {
    const cleaned = raw.replace(/[\u200B\uFEFF]/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // give up
  }

  return null;
}
