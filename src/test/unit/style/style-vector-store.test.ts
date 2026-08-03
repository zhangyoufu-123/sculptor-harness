import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { StyleVectorStore } from '@/runtime/style/style-vector-store';
import * as fs from 'fs';
import * as path from 'path';

const PERSISTENCE_FILE = path.resolve(process.cwd(), '.sculptor', 'style-vector.json');

describe('StyleVectorStore', () => {
  let store: StyleVectorStore;

  beforeAll(() => {
    // Clean up any leftover persistence from previous test runs
    try {
      if (fs.existsSync(PERSISTENCE_FILE)) {
        fs.unlinkSync(PERSISTENCE_FILE);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    store = new StyleVectorStore();
    store.reset();
  });

  describe('predictChoices', () => {
    it('returns uniform distribution when no history', () => {
      const probs = store.predictChoices(['选项A', '选项B', '选项C']);
      expect(probs).toHaveLength(3);
      // With no history, should be roughly uniform
      expect(probs[0]).toBeCloseTo(1 / 3, 1);
    });

    it('returns normalized probabilities summing to 1', () => {
      const probs = store.predictChoices(['A', 'B', 'C', 'D']);
      const sum = probs.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 1);
    });

    it('handles single option', () => {
      const probs = store.predictChoices(['唯一选项']);
      expect(probs).toHaveLength(1);
      expect(probs[0]).toBe(1);
    });
  });

  describe('recordChoice', () => {
    it('updates confidence after recording a choice', () => {
      const before = store.getSnapshot().confidence;
      store.recordChoice({
        question: '测试问题',
        options: ['选项A', '选项B'],
        predictedProbs: [0.5, 0.5],
        actualChoice: 0,
        timestamp: Date.now(),
      });
      const after = store.getSnapshot().confidence;
      expect(after).toBeGreaterThan(before);
    });

    it('increments totalChoices', () => {
      store.recordChoice({
        question: 'Q',
        options: ['A', 'B'],
        predictedProbs: [0.5, 0.5],
        actualChoice: 0,
        timestamp: Date.now(),
      });
      expect(store.getSnapshot().totalChoices).toBe(1);
    });

    it('correct prediction boosts confidence more than wrong prediction', () => {
      // "Correct" prediction (predicted 0.9 for the chosen option)
      const store1 = new StyleVectorStore();
      store1.recordChoice({
        question: 'Q',
        options: ['A', 'B'],
        predictedProbs: [0.9, 0.1],
        actualChoice: 0,
        timestamp: Date.now(),
      });

      // "Wrong" prediction (predicted 0.1 for the chosen option)
      const store2 = new StyleVectorStore();
      store2.recordChoice({
        question: 'Q',
        options: ['A', 'B'],
        predictedProbs: [0.1, 0.9],
        actualChoice: 0,
        timestamp: Date.now(),
      });

      expect(store1.getSnapshot().confidence).toBeGreaterThan(store2.getSnapshot().confidence);
    });
  });

  describe('attentionFocus (Dimension 3)', () => {
    it('tracks tokens from chosen options', () => {
      store.recordChoice({
        question: '语气',
        options: ['犀利直接', '温和委婉'],
        predictedProbs: [0.5, 0.5],
        actualChoice: 0,
        timestamp: Date.now(),
      });

      const snap = store.getSnapshot();
      // "犀利" should have some attention weight
      const found = snap.topAttentionTargets.find((t) => t.target.includes('犀利'));
      expect(found).toBeDefined();
    });
  });

  describe('getSnapshot', () => {
    it('returns initial state with zero confidence', () => {
      const snap = store.getSnapshot();
      expect(snap.confidence).toBe(0);
      expect(snap.totalChoices).toBe(0);
    });

    it('returns vector with correct dimensions', () => {
      const snap = store.getSnapshot();
      expect(snap.vector.personalDataset).toHaveLength(512);
      expect(snap.vector.writingDeviation).toHaveLength(128);
    });
  });

  describe('reset', () => {
    it('clears all data', () => {
      store.recordChoice({
        question: 'Q',
        options: ['A'],
        predictedProbs: [1],
        actualChoice: 0,
        timestamp: Date.now(),
      });
      expect(store.getSnapshot().totalChoices).toBe(1);

      store.reset();
      const snap = store.getSnapshot();
      expect(snap.totalChoices).toBe(0);
      expect(snap.confidence).toBe(0);
    });
  });
});
