/**
 * Decision History — Transversal audit log of all confirmed value changes
 * in the PCS (Project Creative State).
 *
 * Every time a field value changes — whether by user confirmation,
 * proposal acceptance, or system inference — a `DecisionRecord` is
 * appended to the decision log. This enables full auditability and
 * undo semantics.
 *
 * @module pcs/decision-history
 */

import type { DecisionRecord, FieldSource, PCSPhase } from './types';

/**
 * Parameters for recording a new decision entry.
 */
interface RecordParams {
  /**
   * Dot-delimited path to the field that changed.
   * e.g. `"intent.purpose"`, `"constraint.length_min"`.
   */
  fieldPath: string;
  /** The value before the decision was applied. */
  oldValue: unknown;
  /** The value after the decision was applied. */
  newValue: unknown;
  /** Human-readable rationale for the change. */
  reason: string;
  /** Whether a user, AI agent, or system made this decision. */
  initiator: FieldSource;
  /** The PCS phase during which the decision was made. */
  phase: PCSPhase;
}

/**
 * Transversal record of all confirmed value changes in the PCS.
 *
 * Every mutation to a confirmed or locked field is logged as a
 * `DecisionRecord` with full before/after values, rationale, and
 * contextual metadata (phase, initiator). The log supports field-level
 * history queries, phase-scoped audits, and full export for archiving.
 */
export class DecisionHistory {
  private records: DecisionRecord[] = [];

  private idCounter = 0;

  /**
   * Record a value change and return the generated `DecisionRecord`.
   *
   * An auto-generated ID and current ISO 8601 timestamp are assigned
   * at the moment of recording. The record is appended to the internal
   * log and also returned to the caller.
   */
  record(params: RecordParams): DecisionRecord {
    const record: DecisionRecord = {
      id: `${Date.now().toString(36)}-${++this.idCounter}`,
      timestamp: new Date().toISOString(),
      field_path: params.fieldPath,
      old_value: params.oldValue,
      new_value: params.newValue,
      reason: params.reason,
      initiator: params.initiator,
      phase: params.phase,
    };

    this.records.push(record);
    return record;
  }

  /**
   * Get all decision records for a specific field path.
   *
   * @param fieldPath - Dot-delimited path (e.g. `"intent.purpose"`).
   * @returns Records ordered by insertion (oldest first).
   */
  getForField(fieldPath: string): DecisionRecord[] {
    return this.records.filter((r) => r.field_path === fieldPath);
  }

  /**
   * Get every decision record in insertion order.
   */
  getAll(): DecisionRecord[] {
    return [...this.records];
  }

  /**
   * Get records filtered by the PCS phase in which they were made.
   */
  getByPhase(phase: PCSPhase): DecisionRecord[] {
    return this.records.filter((r) => r.phase === phase);
  }

  /**
   * Get records filtered by who made the decision (user / ai / system).
   */
  getByInitiator(initiator: FieldSource): DecisionRecord[] {
    return this.records.filter((r) => r.initiator === initiator);
  }

  /**
   * Get the most recent (last-inserted) change for a given field path.
   *
   * @returns The latest `DecisionRecord`, or `undefined` if the field
   *          has never been recorded.
   */
  getLatest(fieldPath: string): DecisionRecord | undefined {
    const fieldRecords = this.getForField(fieldPath);
    return fieldRecords.length > 0 ? fieldRecords[fieldRecords.length - 1] : undefined;
  }

  /**
   * Get records whose timestamp falls within the given ISO 8601 range.
   *
   * ISO 8601 strings compare correctly with lexicographic ordering
   * (`"2025-01-01T00:00:00Z" < "2025-06-01T00:00:00Z"`), so a simple
   * string comparison is sufficient.
   *
   * @param from - Inclusive lower bound (ISO 8601).
   * @param to   - Inclusive upper bound (ISO 8601).
   */
  getRange(from: string, to: string): DecisionRecord[] {
    return this.records.filter((r) => r.timestamp >= from && r.timestamp <= to);
  }

  /**
   * Export all records as a shallow-copied array.
   *
   * Useful for serialisation, archiving, or handing off to a
   * persistence layer. The returned array is a snapshot — mutations to
   * it do not affect the internal log.
   */
  export(): DecisionRecord[] {
    return [...this.records];
  }

  /**
   * Total number of decisions logged since instantiation.
   */
  get count(): number {
    return this.records.length;
  }
}
