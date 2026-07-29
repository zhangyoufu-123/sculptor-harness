/**
 * LoRA training data collection for Style personalization.
 * V1: records training samples during Phase 4 editing.
 * V2: uses accumulated samples to fine-tune a personal writing model via LoRA.
 */

/**
 * A single training sample — one AI generation + user correction pair.
 * Collected when user significantly modifies AI-generated content.
 */
export interface StyleTrainingSample {
  /** Unique sample ID */
  id: string;
  /** The original prompt sent to the LLM (the full generation context) */
  prompt: string;
  /** What the AI originally generated */
  ai_response: string;
  /** What the user changed it to (the corrected version) */
  user_correction: string;
  /** Quantified style features extracted from the user_correction */
  style_labels: StyleLabels;
  /** ISO timestamp */
  timestamp: string;
  /** Which project this belongs to */
  project_id: string;
  /** Which node/section triggered this sample */
  node_id: string;
}

/**
 * Quantified style features for training label alignment.
 */
export interface StyleLabels {
  /** The tone category (e.g., "分析型", "叙事型") */
  tone: string;
  /** Formality level 0.0 (very casual) to 1.0 (very formal) */
  formality: number;
  /** Average sentence length in characters */
  sentence_length_avg: number;
  /** Frequently used vocabulary patterns */
  vocabulary_preferences: string[];
}

/**
 * Collection of training samples for a project.
 */
export interface TrainingDataset {
  /** Project ID */
  project_id: string;
  /** All collected samples */
  samples: StyleTrainingSample[];
  /** Total sample count */
  total_samples: number;
  /** When the dataset was last updated */
  last_updated: string;
}

/**
 * Thresholds for deciding whether a user edit qualifies as a training sample.
 * Only HIGH-VALUE edits are recorded — not every small change.
 */
export const TRAINING_SAMPLE_THRESHOLDS = {
  /** Record if user rewrote more than this fraction of the AI content (0.0-1.0) */
  min_rewrite_ratio: 0.5,
  /** Record if user explicitly triggered a tone/style operation */
  explicit_style_operation: true,
  /** Minimum content length to be worth recording (characters) */
  min_content_length: 100,
} as const;

/**
 * Determine if a user edit qualifies as a high-value training sample.
 */
export function isTrainingSampleWorthy(
  originalContent: string,
  userContent: string,
  wasExplicitStyleOp: boolean,
): boolean {
  // Too short to be meaningful
  if (originalContent.length < TRAINING_SAMPLE_THRESHOLDS.min_content_length) {
    return false;
  }
  // User explicitly asked to change tone/style → always record
  if (wasExplicitStyleOp && TRAINING_SAMPLE_THRESHOLDS.explicit_style_operation) {
    return true;
  }
  // Significant rewrite (>50% changed)
  const diffRatio = calculateDiffRatio(originalContent, userContent);
  return diffRatio >= TRAINING_SAMPLE_THRESHOLDS.min_rewrite_ratio;
}

/**
 * Calculate how much the user changed (0.0 = identical, 1.0 = completely different).
 * V1: simple length-based ratio. V2: semantic diff.
 */
function calculateDiffRatio(original: string, modified: string): number {
  if (original.length === 0) return modified.length > 0 ? 1 : 0;
  return Math.min(Math.abs(original.length - modified.length) / original.length, 1);
}

/**
 * Extract style labels from a piece of user-corrected text.
 */
export function extractStyleLabels(text: string, tone: string): StyleLabels {
  const sentences = text.split(/[。！？.!?\n]+/).filter((s) => s.trim().length > 0);
  const avgLength =
    sentences.length > 0 ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length : 0;

  return {
    tone,
    formality: estimateFormality(text),
    sentence_length_avg: Math.round(avgLength),
    vocabulary_preferences: extractTopPhrases(text, 5),
  };
}

/** V1: heuristic formality estimation based on character/word patterns */
function estimateFormality(text: string): number {
  const formalMarkers = ['因此', '综上所述', '由此可见', '研究表明', '数据显示'];
  const casualMarkers = ['说实话', '其实', '反正', '就是', '的话'];

  let formalCount = 0;
  let casualCount = 0;

  for (const marker of formalMarkers) {
    if (text.includes(marker)) formalCount++;
  }
  for (const marker of casualMarkers) {
    if (text.includes(marker)) casualCount++;
  }

  const total = formalCount + casualCount;
  if (total === 0) return 0.5; // neutral
  return formalCount / total;
}

/** Extract top N most frequent 2-gram phrases */
function extractTopPhrases(text: string, topN: number): string[] {
  const words = text.split(/[\s，。、；：""''！？\n]+/).filter((w) => w.length >= 2);
  const phrases = new Map<string, number>();

  for (let i = 0; i < words.length - 1; i++) {
    const phrase = words[i] + words[i + 1];
    phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
  }

  return Array.from(phrases.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase]) => phrase);
}

/**
 * In-memory training data store (V1: no database).
 * V2: replace with persistent storage.
 */
export class TrainingDataStore {
  private datasets: Map<string, TrainingDataset> = new Map();

  /** Record a new training sample */
  addSample(projectId: string, sample: StyleTrainingSample): void {
    let dataset = this.datasets.get(projectId);
    if (!dataset) {
      dataset = {
        project_id: projectId,
        samples: [],
        total_samples: 0,
        last_updated: new Date().toISOString(),
      };
      this.datasets.set(projectId, dataset);
    }
    dataset.samples.push(sample);
    dataset.total_samples = dataset.samples.length;
    dataset.last_updated = new Date().toISOString();
  }

  /** Get all samples for a project */
  getSamples(projectId: string): StyleTrainingSample[] {
    return this.datasets.get(projectId)?.samples ?? [];
  }

  /** Check if enough samples exist for LoRA training (threshold: 500) */
  isReadyForTraining(projectId: string): boolean {
    const dataset = this.datasets.get(projectId);
    return (dataset?.total_samples ?? 0) >= 500;
  }

  /** Export dataset as JSON (for V2 LoRA training pipeline) */
  exportDataset(projectId: string): TrainingDataset | null {
    return this.datasets.get(projectId) ?? null;
  }

  /** Clear all data */
  reset(): void {
    this.datasets.clear();
  }
}

/** Global singleton for V1 */
export const trainingDataStore = new TrainingDataStore();
