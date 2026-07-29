import { PCSState } from '@/pcs/types';

interface StyleFingerprint {
  tone: string;
  voice: string;
  commonPhrases: string[];
  sentencePatterns: string[]; // e.g., "短句为主", "复合句为主"
  vocabularyLevel: 'basic' | 'intermediate' | 'advanced';
  detectedPreferences: Record<string, string>;
  confidence: number;
}

// Phase 3B: Extract L1 expression fingerprint from sample texts
// L1 = low-risk features: word frequency, punctuation patterns, common phrases
function discoverStyle(sampleTexts: string[]): StyleFingerprint {
  if (sampleTexts.length === 0) {
    return {
      tone: '未检测',
      voice: '未检测',
      commonPhrases: [],
      sentencePatterns: [],
      vocabularyLevel: 'intermediate',
      detectedPreferences: {},
      confidence: 0,
    };
  }

  const combined = sampleTexts.join('\n');

  // L1 features
  const commonPhrases = extractCommonPhrases(combined);
  const sentencePatterns = analyzeSentencePatterns(combined);
  const vocabularyLevel = estimateVocabularyLevel(combined);

  return {
    tone: '已从样本中提取',
    voice: '用户风格',
    commonPhrases,
    sentencePatterns,
    vocabularyLevel,
    detectedPreferences: {
      commonPhrases: commonPhrases.join(', '),
      pattern: sentencePatterns[0] || '未检测',
      vocabLevel: vocabularyLevel,
    },
    confidence: Math.min(sampleTexts.length * 0.15, 0.8),
  };
}

// Apply discovered style to PCS Expression layer
function applyStyleToPCS(_state: PCSState, fingerprint: StyleFingerprint): void {
  if (fingerprint.confidence > 0.5) {
    // Only update assumed or proposed fields
    // L1 auto-adjust: tone preferences
    if (fingerprint.tone !== '未检测') {
      // Create proposal for tone update
    }
  }
}

function extractCommonPhrases(text: string): string[] {
  // V1: simple 2-gram extraction
  const words = text.split(/[\s，。、；：""''！？\n]+/).filter((w) => w.length >= 2);
  const phrases: Map<string, number> = new Map();
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = words[i] + words[i + 1];
    phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
  }
  return Array.from(phrases.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

function analyzeSentencePatterns(text: string): string[] {
  const sentences = text.split(/[。！？.!?]+/).filter((s) => s.trim().length > 0);
  const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
  if (avgLength < 20) return ['短句为主'];
  if (avgLength > 50) return ['长句为主'];
  return ['中短句混合'];
}

function estimateVocabularyLevel(text: string): 'basic' | 'intermediate' | 'advanced' {
  const words = new Set(text.split(/[\s，。、；：""''！？\n]+/).filter((w) => w.length > 1));
  if (words.size < 100) return 'basic';
  if (words.size < 300) return 'intermediate';
  return 'advanced';
}

export { discoverStyle, applyStyleToPCS };
export type { StyleFingerprint };
