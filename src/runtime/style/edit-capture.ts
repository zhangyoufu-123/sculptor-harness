/**
 * Edit Capture — captures human edits to AI output and feeds them back
 * into the style vector as high-weight training signals.
 *
 * Human edits are the STRONGEST style signal — stronger than choice-based learning.
 */

import { styleVectorStore } from './style-vector-store';

// ─── Types ────────────────────────────────────────────────────

export interface EditCaptureResult {
  /** Number of style signals extracted */
  signalsExtracted: number;
  /** Key changes detected */
  changes: string[];
  /** Whether meaningful edits were found */
  hasEdits: boolean;
}

// ─── Core ─────────────────────────────────────────────────────

/**
 * Capture the difference between AI output and human edit.
 * Extracts style signals and feeds them into the vector.
 */
export function captureEdit(originalAI: string, humanEdited: string): EditCaptureResult {
  if (!originalAI || !humanEdited || originalAI === humanEdited) {
    return { signalsExtracted: 0, changes: [], hasEdits: false };
  }

  const changes: string[] = [];
  const signals: Array<{
    dimension: 1 | 2 | 3;
    feature: string;
    correction: number;
    reason: string;
  }> = [];

  // ═══ Analysis 1: Length change ═══════════════════════════
  const lenChange = humanEdited.length - originalAI.length;
  if (Math.abs(lenChange) > originalAI.length * 0.1) {
    if (lenChange < 0) {
      // User shortened — prefers concision
      changes.push(`缩短了 ${Math.abs(lenChange)} 字`);
      signals.push({
        dimension: 1,
        feature: '精炼压缩',
        correction: 0.6,
        reason: '人类编辑：大幅缩短',
      });
    } else {
      // User expanded — prefers detail
      changes.push(`扩展了 ${lenChange} 字`);
      signals.push({
        dimension: 1,
        feature: '细节扩展',
        correction: 0.4,
        reason: '人类编辑：大幅扩展',
      });
    }
  }

  // ═══ Analysis 2: Sentence transformation ═════════════════
  // Check if user split long sentences or merged short ones
  const aiSentences = originalAI.split(/[。！？\n]+/).filter((s) => s.trim());
  const humanSentences = humanEdited.split(/[。！？\n]+/).filter((s) => s.trim());

  if (aiSentences.length > 0 && humanSentences.length > 0) {
    const aiAvg = aiSentences.reduce((s, l) => s + l.length, 0) / aiSentences.length;
    const humanAvg = humanSentences.reduce((s, l) => s + l.length, 0) / humanSentences.length;

    if (humanAvg < aiAvg * 0.7) {
      changes.push(`句长缩短 ${(aiAvg - humanAvg).toFixed(0)} 字`);
      signals.push({
        dimension: 1,
        feature: '拆分长句',
        correction: 0.5,
        reason: `人类编辑：句长从${aiAvg.toFixed(0)}→${humanAvg.toFixed(0)}字`,
      });
    } else if (humanAvg > aiAvg * 1.3) {
      changes.push(`句长增长 ${(humanAvg - aiAvg).toFixed(0)} 字`);
      signals.push({
        dimension: 1,
        feature: '合并短句',
        correction: 0.3,
        reason: `人类编辑：句长从${aiAvg.toFixed(0)}→${humanAvg.toFixed(0)}字`,
      });
    }
  }

  // ═══ Analysis 3: Modifier density change ═════════════════
  const aiDe = (originalAI.match(/的/g) || []).length;
  const humanDe = (humanEdited.match(/的/g) || []).length;
  const aiLen = originalAI.length || 1;
  const humanLen = humanEdited.length || 1;
  const aiDensity = aiDe / aiLen;
  const humanDensity = humanDe / humanLen;

  if (humanDensity < aiDensity * 0.6) {
    changes.push('减少修饰词');
    signals.push({
      dimension: 1,
      feature: '去修饰',
      correction: 0.5,
      reason: '人类编辑：大幅减少"的"字',
    });
  } else if (humanDensity > aiDensity * 1.5) {
    changes.push('增加修饰词');
    signals.push({
      dimension: 1,
      feature: '增修饰',
      correction: 0.3,
      reason: '人类编辑：大幅增加修饰',
    });
  }

  // ═══ Analysis 4: Word replacement (removed words) ═══════
  // Extract words present in AI but NOT in human edit
  const aiWords = extractKeyWords(originalAI);
  const humanWords = new Set(extractKeyWords(humanEdited));
  const removedWords = aiWords.filter((w) => !humanWords.has(w) && w.length >= 2);

  if (removedWords.length > 0) {
    const top = removedWords.slice(0, 5);
    changes.push(`移除词汇: ${top.join('、')}`);
    for (const word of top) {
      signals.push({ dimension: 3, feature: word, correction: -0.4, reason: `人类删除: ${word}` });
    }
  }

  // ═══ Analysis 5: Added words (human-introduced) ═════════
  const aiWordSet = new Set(aiWords);
  const addedWords = extractKeyWords(humanEdited).filter((w) => !aiWordSet.has(w) && w.length >= 2);

  if (addedWords.length > 0) {
    const top = addedWords.slice(0, 5);
    changes.push(`新增词汇: ${top.join('、')}`);
    for (const word of top) {
      signals.push({ dimension: 3, feature: word, correction: 0.5, reason: `人类添加: ${word}` });
    }
  }

  // ═══ Apply signals ═════════════════════════════════════
  if (signals.length > 0) {
    const filtered = signals.filter((s) => Math.abs(s.correction) > 0.1);
    if (filtered.length > 0) {
      styleVectorStore.applyFeedbackBatch(filtered);
    }
  }

  return {
    signalsExtracted: signals.length,
    changes,
    hasEdits: signals.length > 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────

/** Extract meaningful 2-3 char Chinese words from text */
function extractKeyWords(text: string): string[] {
  const cleaned = text.replace(/[^\u4e00-\u9fff]/g, '');
  const words: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    words.push(cleaned.slice(i, i + 2));
  }
  return Array.from(new Set(words));
}
