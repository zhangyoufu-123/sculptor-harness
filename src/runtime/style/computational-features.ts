/**
 * Computational Style Features — Pass 1 of style extraction.
 * Pure computation, no LLM, runs in milliseconds.
 *
 * Extracts: sentence length stats, word frequency, punctuation patterns,
 * paragraph structure, readability metrics, modifier density.
 */

// ─── Types ────────────────────────────────────────────────────

export interface SentenceStats {
  /** Total sentences */
  count: number;
  /** Average characters per sentence */
  avgLength: number;
  /** Standard deviation of sentence length */
  stdDev: number;
  /** Minimum sentence length */
  min: number;
  /** Maximum sentence length */
  max: number;
  /** Percentile distribution: [p10, p25, p50, p75, p90] */
  percentiles: number[];
  /** Proportion of short sentences (<15 chars) */
  shortRatio: number;
  /** Proportion of long sentences (>50 chars) */
  longRatio: number;
}

export interface WordFrequency {
  /** Total word count (Chinese: characters; English: space-separated) */
  totalWords: number;
  /** Unique word count */
  uniqueWords: number;
  /** Type-token ratio (unique / total) — higher = more diverse vocabulary */
  typeTokenRatio: number;
  /** Top 15 most frequent words (2-char+ Chinese words only) */
  topWords: Array<{ word: string; count: number }>;
  /** Top 5 most frequent bigrams */
  topBigrams: Array<{ bigram: string; count: number }>;
}

export interface PunctuationPatterns {
  /** Periods (。！？) per 100 chars */
  periodDensity: number;
  /** Exclamation marks (！) per 100 chars */
  exclamationDensity: number;
  /** Question marks (？) per 100 chars */
  questionDensity: number;
  /** Commas (，、) per 100 chars */
  commaDensity: number;
  /** Semicolons (；) per 100 chars */
  semicolonDensity: number;
  /** Quotation marks (""「」) per 100 chars */
  quoteDensity: number;
  /** Parentheses/brackets per 100 chars */
  bracketDensity: number;
  /** Em-dashes/ellipsis per 100 chars */
  dashDensity: number;
  /** Ratio of periods to commas — high = more declarative, low = more flowing */
  periodCommaRatio: number;
}

export interface ParagraphStats {
  /** Total paragraphs */
  count: number;
  /** Average sentences per paragraph */
  avgSentencesPerParagraph: number;
  /** Average chars per paragraph */
  avgCharsPerParagraph: number;
  /** Proportion of single-sentence paragraphs */
  singleSentenceRatio: number;
}

export interface ModifierStats {
  /** Estimated adjective/adverb density (ratio of modifier-bearing chars) */
  modifierDensity: number;
  /** Common modifier suffixes detected: 的, 地, 得 */
  deCount: number;
  diCount: number;
  deiCount: number;
  /** Descriptive compound ratio (phrases like "慢慢地", "红红的") */
  descriptiveCompoundRatio: number;
}

export interface DialogueStats {
  /** Proportion of text within quotation marks */
  dialogueRatio: number;
  /** Number of dialogue segments */
  dialogueSegments: number;
}

export interface ComputationalFeatures {
  /** Number of characters in the sample */
  charCount: number;
  /** Whether the text is primarily Chinese */
  isChinese: boolean;
  sentence: SentenceStats;
  words: WordFrequency;
  punctuation: PunctuationPatterns;
  paragraphs: ParagraphStats;
  modifiers: ModifierStats;
  dialogue: DialogueStats;
}

// ─── Main Extraction ──────────────────────────────────────────

export function extractComputationalFeatures(text: string): ComputationalFeatures {
  const charCount = text.length;
  const isChinese = (text.match(/[\u4e00-\u9fff]/g) || []).length > charCount * 0.3;

  return {
    charCount,
    isChinese,
    sentence: extractSentenceStats(text),
    words: extractWordFrequency(text, isChinese),
    punctuation: extractPunctuation(text),
    paragraphs: extractParagraphStats(text),
    modifiers: extractModifierStats(text, isChinese),
    dialogue: extractDialogueStats(text),
  };
}

// ─── Sentence Analysis ────────────────────────────────────────

function extractSentenceStats(text: string): SentenceStats {
  // Split by sentence-ending punctuation
  const sentences = text
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const lengths = sentences.map((s) => s.length);
  if (lengths.length === 0) {
    return {
      count: 0,
      avgLength: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      percentiles: [0, 0, 0, 0, 0],
      shortRatio: 0,
      longRatio: 0,
    };
  }

  const sorted = [...lengths].sort((a, b) => a - b);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((s, l) => s + (l - avg) ** 2, 0) / lengths.length;

  return {
    count: lengths.length,
    avgLength: Math.round(avg * 10) / 10,
    stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    percentiles: [0.1, 0.25, 0.5, 0.75, 0.9].map(
      (p) => sorted[Math.floor(p * (sorted.length - 1))] || 0,
    ),
    shortRatio: lengths.filter((l) => l < 15).length / lengths.length,
    longRatio: lengths.filter((l) => l > 50).length / lengths.length,
  };
}

// ─── Word Frequency ────────────────────────────────────────────

function extractWordFrequency(text: string, isChinese: boolean): WordFrequency {
  if (!isChinese) {
    // Simple space-based tokenization for non-Chinese
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    return {
      totalWords: words.length,
      uniqueWords: new Set(words).size,
      typeTokenRatio: words.length > 0 ? new Set(words).size / words.length : 0,
      topWords: [],
      topBigrams: [],
    };
  }

  // Chinese: extract 2-4 char grams from cleaned text
  const cleaned = text.replace(/[^\u4e00-\u9fff]/g, '');
  const trigrams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    trigrams.push(cleaned.slice(i, i + 2));
  }
  for (let i = 0; i < cleaned.length - 2; i++) {
    trigrams.push(cleaned.slice(i, i + 3));
  }

  const freq = new Map<string, number>();
  for (const g of trigrams) {
    freq.set(g, (freq.get(g) || 0) + 1);
  }

  const sorted = Array.from(freq.entries())
    .sort(([, a], [, b]) => b - a)
    .filter(([w]) => w.length >= 2);

  const topWords = sorted.slice(0, 15).map(([word, count]) => ({ word, count }));

  // Bigrams
  const bigrams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.push(cleaned.slice(i, i + 2));
  }
  const bigramFreq = new Map<string, number>();
  for (const b of bigrams) {
    bigramFreq.set(b, (bigramFreq.get(b) || 0) + 1);
  }
  const topBigrams = Array.from(bigramFreq.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([bigram, count]) => ({ bigram, count }));

  return {
    totalWords: cleaned.length, // Approximate: total Chinese chars
    uniqueWords: freq.size,
    typeTokenRatio: cleaned.length > 0 ? freq.size / cleaned.length : 0,
    topWords,
    topBigrams,
  };
}

// ─── Punctuation ──────────────────────────────────────────────

function extractPunctuation(text: string): PunctuationPatterns {
  const per100 = text.length / 100 || 1;

  return {
    periodDensity: (text.match(/[。！？!?]/g) || []).length / per100,
    exclamationDensity: (text.match(/[！!]/g) || []).length / per100,
    questionDensity: (text.match(/[？?]/g) || []).length / per100,
    commaDensity: (text.match(/[，、,]/g) || []).length / per100,
    semicolonDensity: (text.match(/[；;]/g) || []).length / per100,
    quoteDensity: (text.match(/[""「」""''\u2018\u2019\u201c\u201d]/g) || []).length / per100,
    bracketDensity: (text.match(/[（）()[\]【】]/g) || []).length / per100,
    dashDensity: (text.match(/[—…\-.]{2,}/g) || []).length / per100,
    periodCommaRatio:
      (text.match(/[。！？!?]/g) || []).length / Math.max(1, (text.match(/[，、,]/g) || []).length),
  };
}

// ─── Paragraph Structure ──────────────────────────────────────

function extractParagraphStats(text: string): ParagraphStats {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  if (paragraphs.length === 0) {
    return {
      count: 0,
      avgSentencesPerParagraph: 0,
      avgCharsPerParagraph: 0,
      singleSentenceRatio: 0,
    };
  }

  const sentencesPerParagraph = paragraphs.map((p) => {
    const sentences = p.split(/[。！？!?]+/).filter((s) => s.trim().length > 0);
    return sentences.length || 1;
  });

  return {
    count: paragraphs.length,
    avgSentencesPerParagraph:
      Math.round((sentencesPerParagraph.reduce((a, b) => a + b, 0) / paragraphs.length) * 10) / 10,
    avgCharsPerParagraph: Math.round(text.length / paragraphs.length),
    singleSentenceRatio: sentencesPerParagraph.filter((s) => s === 1).length / paragraphs.length,
  };
}

// ─── Modifier Density ─────────────────────────────────────────

function extractModifierStats(text: string, _isChinese: boolean): ModifierStats {
  const cleaned = text.replace(/\s/g, '');
  const len = cleaned.length || 1;

  return {
    modifierDensity:
      ((cleaned.match(/的/g) || []).length +
        (cleaned.match(/地/g) || []).length +
        (cleaned.match(/得/g) || []).length) /
      len,
    deCount: (cleaned.match(/的/g) || []).length,
    diCount: (cleaned.match(/地/g) || []).length,
    deiCount: (cleaned.match(/得/g) || []).length,
    descriptiveCompoundRatio: (cleaned.match(/(.)\1的/g) || []).length / len,
  };
}

// ─── Dialogue Ratio ───────────────────────────────────────────

function extractDialogueStats(text: string): DialogueStats {
  const quoteMatches = text.match(/[""「」""''\u2018\u2019\u201c\u201d]/g) || [];
  const dialogueSegments = text.split(/[""「"].*?[""」"]/g).length - 1;

  return {
    dialogueRatio: quoteMatches.length / (text.length || 1),
    dialogueSegments: Math.max(0, dialogueSegments),
  };
}

// ─── Summary Formatter ────────────────────────────────────────

/**
 * Format computational features as a concise summary string
 * for injection into LLM prompts (Pass 2).
 */
export function formatComputationalSummary(features: ComputationalFeatures): string {
  const s = features.sentence;
  const w = features.words;
  const p = features.punctuation;
  const m = features.modifiers;

  return [
    `[计算特征]`,
    `总字数: ${features.charCount}`,
    `句长: 均值${s.avgLength}字 | 标准差${s.stdDev} | 短句比${(s.shortRatio * 100).toFixed(0)}% | 长句比${(s.longRatio * 100).toFixed(0)}%`,
    `词汇: 类符比${w.typeTokenRatio.toFixed(3)} | 高频词: ${w.topWords
      .slice(0, 5)
      .map((w) => w.word)
      .join(' ')}`,
    `标点: 句号密度${p.periodDensity.toFixed(1)} | 感叹密度${p.exclamationDensity.toFixed(1)} | 逗号密度${p.commaDensity.toFixed(1)} | 句逗比${p.periodCommaRatio.toFixed(2)}`,
    `修饰: 的密度${(m.modifierDensity * 100).toFixed(1)}% | 的${m.deCount}/地${m.diCount}/得${m.deiCount}`,
    `对话: 占比${(features.dialogue.dialogueRatio * 100).toFixed(1)}% | ${features.dialogue.dialogueSegments}段`,
  ].join('\n');
}
