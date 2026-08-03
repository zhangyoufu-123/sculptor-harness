/**
 * Style Vector Store — 3D user style profile with incremental learning.
 *
 * Dimension 1: Personal Dataset (512-dim) — user's common associations, techniques, vocab
 * Dimension 2: Writing Deviation (128-dim) — how user differs from predicted preferences
 * Dimension 3: Attention Focus (dynamic sparse) — specific objects/scenes user focuses on
 *
 * Learning: Each user choice (A/B/C) provides a training signal.
 * The vector predicts next choice, deviation = actual - predicted,
 * and the vector is updated via gradient descent on prediction error.
 */

// ─── Types ────────────────────────────────────────────────────

export interface StyleVector {
  /** Dimension 1: Personal associations, techniques, vocabulary patterns */
  personalDataset: Float64Array; // 512-dim
  /** Dimension 2: Writing deviation from predicted preferences */
  writingDeviation: Float64Array; // 128-dim
  /** Dimension 3: Attention focus over concept space */
  attentionFocus: Map<string, number>; // concept → attention weight (0-1)
}

export interface ChoiceRecord {
  /** The question context */
  question: string;
  /** Available options (A, B, C, ...) */
  options: string[];
  /** Predicted choice probabilities [0-1 per option] */
  predictedProbs: number[];
  /** Actual chosen index (0-based) */
  actualChoice: number;
  /** When this choice was made */
  timestamp: number;
}

export interface StyleSnapshot {
  vector: StyleVector;
  confidence: number; // 0-1, how confident we are in predictions
  totalChoices: number; // How many choices have been recorded
  lastUpdated: number; // Timestamp of last update
  topAssociations: Array<{ concept: string; weight: number }>;
  topTechniques: Array<{ technique: string; frequency: number }>;
  topAttentionTargets: Array<{ target: string; weight: number }>;
}

// ─── Association / Technique Maps ─────────────────────────────

/** Common writing techniques that the vector tracks */
const KNOWN_TECHNIQUES = [
  '比喻',
  '排比',
  '反问',
  '设问',
  '拟人',
  '夸张',
  '对偶',
  '反复',
  '白描',
  '细描',
  '象征',
  '通感',
  '借景抒情',
  '托物言志',
  '直抒胸臆',
  '对比',
  '衬托',
  '铺垫',
  '伏笔',
  '呼应',
  '点面结合',
  '动静结合',
] as const;

// ─── Implementation ───────────────────────────────────────────

export class StyleVectorStore {
  private vector: StyleVector;
  private choices: ChoiceRecord[] = [];
  private confidence: number = 0;
  private learningRate: number = 0.05;
  private techniqueFreq: Map<string, number> = new Map();
  private associationFreq: Map<string, number> = new Map();

  constructor() {
    this.vector = {
      personalDataset: new Float64Array(512),
      writingDeviation: new Float64Array(128),
      attentionFocus: new Map(),
    };
  }

  // ── Core Operations ──────────────────────────────────────

  /** Predict the user's likely choice from a set of options (0-1 per option) */
  predictChoices(options: string[]): number[] {
    if (this.choices.length === 0) {
      // No history — uniform distribution
      return options.map(() => 1 / options.length);
    }

    const probs: number[] = [];
    for (const option of options) {
      let score = 0;
      const tokens = this.tokenize(option);

      // Weight by attention focus
      for (const token of tokens) {
        if (this.vector.attentionFocus.has(token)) {
          score += this.vector.attentionFocus.get(token)!;
        }
      }

      // Weight by association match (Dimension 1)
      const embedding = this.simpleEmbed(option);
      score += this.dotProduct(embedding, Array.from(this.vector.personalDataset)) * 10;

      // Adjust by deviation pattern (Dimension 2) — user tends to prefer certain types
      const deviationSignal = this.analyzeDeviation(option);
      score += deviationSignal * 2;

      // Softmax safety: ensure non-negative
      probs.push(Math.max(score, 0.01));
    }

    // Normalize to probabilities
    const total = probs.reduce((a, b) => a + b, 0);
    return probs.map((p) => p / total);
  }

  /** Record a user choice and update the vector */
  recordChoice(choice: ChoiceRecord): void {
    this.choices.push(choice);

    // Compute prediction error
    const predProb = choice.predictedProbs[choice.actualChoice] || 0;
    const error = 1 - predProb; // How wrong was the prediction?

    // Update confidence (EMA)
    this.confidence = this.confidence * 0.9 + (1 - error) * 0.1;

    // ── Update Dimension 1: Personal Dataset ─────────────
    const optionText = choice.options[choice.actualChoice] || '';
    const embedding = this.simpleEmbed(optionText);
    const lr = this.learningRate * (1 + error); // Higher error → higher learning rate

    for (let i = 0; i < 512; i++) {
      this.vector.personalDataset[i] += embedding[i] * lr;
    }

    // Track techniques and associations
    for (const tech of KNOWN_TECHNIQUES) {
      if (optionText.includes(tech)) {
        const freq = (this.techniqueFreq.get(tech) || 0) + 1;
        this.techniqueFreq.set(tech, freq);
      }
    }

    // ── Update Dimension 2: Writing Deviation ────────────
    // Deviation = difference between personal vector and "average" writing vector
    const avgEmbedding = this.computeAverageEmbedding();
    for (let i = 0; i < 128; i++) {
      const dev = embedding[i % 128] - avgEmbedding[i];
      this.vector.writingDeviation[i] = this.vector.writingDeviation[i] * 0.95 + dev * lr * 0.3;
    }

    // ── Update Dimension 3: Attention Focus ────────────
    const tokens = this.tokenize(optionText);
    for (const token of tokens) {
      if (token.length < 2) continue;
      const current = this.vector.attentionFocus.get(token) || 0;
      // Exponential moving average: recent choices have more weight
      this.vector.attentionFocus.set(token, current * 0.85 + 0.15);
    }
    // Decay older entries
    Array.from(this.vector.attentionFocus.entries()).forEach(([key, weight]) => {
      if (weight < 0.01) {
        this.vector.attentionFocus.delete(key);
      }
    });
  }

  /** Get a snapshot of the current style vector */
  getSnapshot(): StyleSnapshot {
    // Top attention targets
    const topAttention = Array.from(this.vector.attentionFocus.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([target, weight]) => ({ target, weight: Math.round(weight * 100) / 100 }));

    // Top techniques
    const topTechniques = Array.from(this.techniqueFreq.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([technique, frequency]) => ({ technique, frequency }));

    // Top associations (from personal dataset clustering)
    const topAssociations = Array.from(this.vector.attentionFocus.entries())
      .filter(([, w]) => w > 0.2)
      .slice(0, 5)
      .map(([concept, weight]) => ({ concept, weight }));

    return {
      vector: this.vector,
      confidence: Math.round(this.confidence * 100) / 100,
      totalChoices: this.choices.length,
      lastUpdated: Date.now(),
      topAssociations,
      topTechniques,
      topAttentionTargets: topAttention,
    };
  }

  /** Get the last N choice records */
  getRecentChoices(n: number = 10): ChoiceRecord[] {
    return this.choices.slice(-n);
  }

  /** Reset the vector (for new users or sessions) */
  reset(): void {
    this.vector.personalDataset = new Float64Array(512);
    this.vector.writingDeviation = new Float64Array(128);
    this.vector.attentionFocus.clear();
    this.choices = [];
    this.confidence = 0;
    this.techniqueFreq.clear();
    this.associationFreq.clear();
  }

  // ── Private Helpers ─────────────────────────────────────

  /** Simple tokenization for Chinese text */
  private tokenize(text: string): string[] {
    // Split by punctuation and whitespace, keep meaningful chunks
    const cleaned = text.replace(/[，。！？、；：""''（）【】\s]+/g, ' ').trim();
    const chunks: string[] = [];
    let current = '';
    for (const char of cleaned) {
      if (/[\u4e00-\u9fff]/.test(char)) {
        current += char;
        if (current.length >= 2) {
          chunks.push(current);
          current = char;
        }
      } else {
        if (current.length >= 2) chunks.push(current);
        current = '';
      }
    }
    if (current.length >= 2) chunks.push(current);
    return chunks;
  }

  /** Simple 512-dim embedding via character n-gram hashing */
  private simpleEmbed(text: string): Float64Array {
    const vec = new Float64Array(512);
    const tokens = this.tokenize(text);
    for (const token of tokens) {
      for (let i = 0; i < token.length; i++) {
        const hashCode = this.hashStr(token.slice(i, Math.min(i + 3, token.length)));
        vec[Math.abs(hashCode) % 512] += 1;
      }
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < 512; i++) vec[i] /= norm;
    }
    return vec;
  }

  private hashStr(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private dotProduct(a: Float64Array | number[], b: number[]): number {
    const aArr = Array.isArray(a) ? a : Array.from(a);
    return aArr.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
  }

  private computeAverageEmbedding(): Float64Array {
    const avg = new Float64Array(128);
    if (this.choices.length === 0) return avg;
    let count = 0;
    for (const choice of this.choices.slice(-20)) {
      const text = choice.options[choice.actualChoice] || '';
      const emb = this.simpleEmbed(text);
      for (let i = 0; i < 128; i++) avg[i] += emb[i];
      count++;
    }
    for (let i = 0; i < 128; i++) avg[i] /= count;
    return avg;
  }

  /** Analyze how much an option deviates from user's normal pattern */
  private analyzeDeviation(option: string): number {
    const embedding = this.simpleEmbed(option);
    let deviation = 0;
    for (let i = 0; i < 128; i++) {
      deviation += embedding[i] * this.vector.writingDeviation[i];
    }
    // Normalize: high deviation = user is likely to prefer this
    return Math.tanh(deviation); // [-1, 1] range
  }
}

// ─── Global Singleton ────────────────────────────────────────

export const styleVectorStore = new StyleVectorStore();
