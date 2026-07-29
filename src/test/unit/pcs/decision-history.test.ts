/**
 * Unit tests for DecisionHistory.
 *
 * Validates the transversal audit log: record creation, field-level
 * filtering, phase/initiator queries, range queries, count, and export.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DecisionHistory } from '@/pcs/decision-history';
import type { PCSPhase, FieldSource } from '@/pcs/types';

describe('DecisionHistory', () => {
  let history: DecisionHistory;

  beforeEach(() => {
    history = new DecisionHistory();
  });

  // -----------------------------------------------------------------------
  // record
  // -----------------------------------------------------------------------

  describe('record', () => {
    it('creates a record with auto-generated ID and timestamp', () => {
      const record = history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'persuade',
        newValue: 'inform',
        reason: 'Better match',
        initiator: 'user',
        phase: 'clarifying',
      });

      expect(record.id).toBeDefined();
      expect(typeof record.id).toBe('string');
      expect(record.id.length).toBeGreaterThan(0);
      expect(record.timestamp).toBeDefined();
      expect(typeof record.timestamp).toBe('string');
      // Verify it's a valid ISO 8601 date
      expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
    });

    it('auto-generated IDs are unique across records', () => {
      const r1 = history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R1',
        initiator: 'user',
        phase: 'initializing',
      });
      const r2 = history.record({
        fieldPath: 'intent.core_message',
        oldValue: 'c',
        newValue: 'd',
        reason: 'R2',
        initiator: 'ai',
        phase: 'clarifying',
      });

      expect(r1.id).not.toBe(r2.id);
    });

    it('sets provided field values correctly', () => {
      const record = history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'persuade',
        newValue: 'inform',
        reason: 'Better alignment with audience',
        initiator: 'user',
        phase: 'clarifying',
      });

      expect(record.field_path).toBe('intent.purpose');
      expect(record.old_value).toBe('persuade');
      expect(record.new_value).toBe('inform');
      expect(record.reason).toBe('Better alignment with audience');
      expect(record.initiator).toBe('user');
      expect(record.phase).toBe('clarifying');
    });

    it('returns the created record', () => {
      const record = history.record({
        fieldPath: 'constraint.length_min',
        oldValue: 300,
        newValue: 500,
        reason: 'Adjusted length',
        initiator: 'system',
        phase: 'structured',
      });

      expect(record).toBeDefined();
      expect(record.field_path).toBe('constraint.length_min');
    });

    it('initial count is 0', () => {
      expect(history.count).toBe(0);
    });

    it('can record with different initiator types', () => {
      const sources: FieldSource[] = ['user', 'ai', 'system'];
      const phases: PCSPhase[] = [
        'initializing',
        'clarifying',
        'structured',
        'executing',
        'reviewing',
        'completed',
      ];

      for (const source of sources) {
        for (const phase of phases) {
          const record = history.record({
            fieldPath: 'intent.purpose',
            oldValue: 'old',
            newValue: 'new',
            reason: `Test ${source} ${phase}`,
            initiator: source,
            phase,
          });
          expect(record.initiator).toBe(source);
          expect(record.phase).toBe(phase);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // getForField
  // -----------------------------------------------------------------------

  describe('getForField', () => {
    it('returns only records for the specified field path', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R1',
        initiator: 'user',
        phase: 'initializing',
      });
      history.record({
        fieldPath: 'intent.core_message',
        oldValue: 'c',
        newValue: 'd',
        reason: 'R2',
        initiator: 'user',
        phase: 'initializing',
      });
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'b',
        newValue: 'e',
        reason: 'R3',
        initiator: 'ai',
        phase: 'clarifying',
      });

      const purposeRecords = history.getForField('intent.purpose');
      expect(purposeRecords).toHaveLength(2);
      expect(purposeRecords.every((r) => r.field_path === 'intent.purpose')).toBe(true);

      const coreRecords = history.getForField('intent.core_message');
      expect(coreRecords).toHaveLength(1);
    });

    it('returns empty array for field with no records', () => {
      const records = history.getForField('expression.tone');
      expect(records).toEqual([]);
    });

    it('returns records in insertion order', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'v1',
        newValue: 'v2',
        reason: 'First change',
        initiator: 'user',
        phase: 'initializing',
      });
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'v2',
        newValue: 'v3',
        reason: 'Second change',
        initiator: 'user',
        phase: 'clarifying',
      });

      const records = history.getForField('intent.purpose');
      expect(records[0].reason).toBe('First change');
      expect(records[1].reason).toBe('Second change');
    });
  });

  // -----------------------------------------------------------------------
  // getByPhase
  // -----------------------------------------------------------------------

  describe('getByPhase', () => {
    it('filters records by PCS phase', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R1',
        initiator: 'user',
        phase: 'initializing',
      });
      history.record({
        fieldPath: 'intent.core_message',
        oldValue: 'c',
        newValue: 'd',
        reason: 'R2',
        initiator: 'user',
        phase: 'clarifying',
      });
      history.record({
        fieldPath: 'expression.tone',
        oldValue: 'e',
        newValue: 'f',
        reason: 'R3',
        initiator: 'user',
        phase: 'clarifying',
      });

      const initRecords = history.getByPhase('initializing');
      expect(initRecords).toHaveLength(1);
      expect(initRecords[0].field_path).toBe('intent.purpose');

      const clarifyRecords = history.getByPhase('clarifying');
      expect(clarifyRecords).toHaveLength(2);
    });

    it('returns empty array for phase with no records', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R',
        initiator: 'user',
        phase: 'initializing',
      });

      const records = history.getByPhase('completed');
      expect(records).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getByInitiator
  // -----------------------------------------------------------------------

  describe('getByInitiator', () => {
    it('filters records by source', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R1',
        initiator: 'user',
        phase: 'initializing',
      });
      history.record({
        fieldPath: 'intent.core_message',
        oldValue: 'c',
        newValue: 'd',
        reason: 'R2',
        initiator: 'ai',
        phase: 'clarifying',
      });
      history.record({
        fieldPath: 'constraint.length_min',
        oldValue: 100,
        newValue: 200,
        reason: 'R3',
        initiator: 'system',
        phase: 'structured',
      });

      expect(history.getByInitiator('user')).toHaveLength(1);
      expect(history.getByInitiator('ai')).toHaveLength(1);
      expect(history.getByInitiator('system')).toHaveLength(1);
    });

    it('returns empty array for source with no records', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R',
        initiator: 'user',
        phase: 'initializing',
      });

      expect(history.getByInitiator('ai')).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getLatest
  // -----------------------------------------------------------------------

  describe('getLatest', () => {
    it('returns the most recent record for a field', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'v1',
        newValue: 'v2',
        reason: 'First change',
        initiator: 'user',
        phase: 'initializing',
      });
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'v2',
        newValue: 'v3',
        reason: 'Latest change',
        initiator: 'ai',
        phase: 'clarifying',
      });

      const latest = history.getLatest('intent.purpose');
      expect(latest).toBeDefined();
      expect(latest!.reason).toBe('Latest change');
      expect(latest!.new_value).toBe('v3');
    });

    it('returns undefined for field with no records', () => {
      const latest = history.getLatest('nonexistent.field');
      expect(latest).toBeUndefined();
    });

    it('returns the only record when there is one', () => {
      history.record({
        fieldPath: 'audience.audience_type',
        oldValue: 'general',
        newValue: 'expert',
        reason: 'Only record',
        initiator: 'user',
        phase: 'clarifying',
      });

      const latest = history.getLatest('audience.audience_type');
      expect(latest).toBeDefined();
      expect(latest!.reason).toBe('Only record');
    });
  });

  // -----------------------------------------------------------------------
  // getRange
  // -----------------------------------------------------------------------

  describe('getRange', () => {
    it('filters records by ISO timestamp range', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R1',
        initiator: 'user',
        phase: 'initializing',
      });

      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'b',
        newValue: 'c',
        reason: 'R2',
        initiator: 'user',
        phase: 'clarifying',
      });

      // All records should fall in a wide range
      const all = history.getRange('2020-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z');
      expect(all).toHaveLength(2);

      // Narrow range that excludes both
      const none = history.getRange('2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z');
      expect(none).toEqual([]);
    });

    it('handles inclusive boundary correctly', () => {
      const r = history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R',
        initiator: 'user',
        phase: 'initializing',
      });

      const records = history.getRange(r.timestamp, r.timestamp);
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(r.id);
    });

    it('returns empty when range is before all records', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R',
        initiator: 'user',
        phase: 'initializing',
      });

      const records = history.getRange('2015-01-01T00:00:00.000Z', '2015-12-31T23:59:59.999Z');
      expect(records).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // count
  // -----------------------------------------------------------------------

  describe('count', () => {
    it('starts at 0', () => {
      expect(history.count).toBe(0);
    });

    it('increments with each record', () => {
      expect(history.count).toBe(0);

      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R1',
        initiator: 'user',
        phase: 'initializing',
      });
      expect(history.count).toBe(1);

      history.record({
        fieldPath: 'intent.core_message',
        oldValue: 'c',
        newValue: 'd',
        reason: 'R2',
        initiator: 'ai',
        phase: 'clarifying',
      });
      expect(history.count).toBe(2);

      history.record({
        fieldPath: 'expression.tone',
        oldValue: 'e',
        newValue: 'f',
        reason: 'R3',
        initiator: 'system',
        phase: 'structured',
      });
      expect(history.count).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // export
  // -----------------------------------------------------------------------

  describe('export', () => {
    it('returns a shallow copy of all records', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R1',
        initiator: 'user',
        phase: 'initializing',
      });
      history.record({
        fieldPath: 'intent.core_message',
        oldValue: 'c',
        newValue: 'd',
        reason: 'R2',
        initiator: 'ai',
        phase: 'clarifying',
      });

      const exported = history.export();
      expect(exported).toHaveLength(2);
      expect(exported[0].field_path).toBe('intent.purpose');
      expect(exported[1].field_path).toBe('intent.core_message');
    });

    it('returns a new array — mutations do not affect internal log', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'R',
        initiator: 'user',
        phase: 'initializing',
      });

      const exported = history.export();
      exported.pop();

      // Internal count should remain unchanged
      expect(history.count).toBe(1);
      // A second export should still return the full set
      expect(history.export()).toHaveLength(1);
    });

    it('returns empty array when no records exist', () => {
      const exported = history.export();
      expect(exported).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getAll
  // -----------------------------------------------------------------------

  describe('getAll', () => {
    it('returns all records in insertion order', () => {
      history.record({
        fieldPath: 'intent.purpose',
        oldValue: 'a',
        newValue: 'b',
        reason: 'First',
        initiator: 'user',
        phase: 'initializing',
      });
      history.record({
        fieldPath: 'intent.core_message',
        oldValue: 'c',
        newValue: 'd',
        reason: 'Second',
        initiator: 'ai',
        phase: 'clarifying',
      });

      const all = history.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].reason).toBe('First');
      expect(all[1].reason).toBe('Second');
    });
  });
});
