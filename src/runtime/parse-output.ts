/**
 * ParseOutput — Zod validation layer for LLM responses.
 *
 * Every LLM response is validated before reaching the display.
 * All fields have .default() to prevent "undefined" from UI bugs.
 *
 * Pattern from: dev.to validation patterns + Zod official + Mastra PR #17655
 */

// =========================================================================
// Core Types
// =========================================================================

export type AgentOutput<T> = { ok: true; data: T } | { ok: false; reason: string; raw: string };

// =========================================================================
// Normalization — converts null to undefined for Zod .default() to fire
// =========================================================================

function normalizeNulls(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      result[key] = undefined; // Zod .default() fires on undefined
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) =>
        v === null
          ? undefined
          : typeof v === 'object' && v !== null
            ? normalizeNulls(v as Record<string, unknown>)
            : v,
      );
    } else if (typeof value === 'object') {
      result[key] = normalizeNulls(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// =========================================================================
// Safe defaults for display (never return undefined)
// =========================================================================

/**
 * Safe accessor: never returns undefined for display values.
 */
export function safeStr(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

export function safeNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}

export function safeArr(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => safeStr(v));
  return [];
}

// =========================================================================
// Uncertainty display fix — prevents "undefined" questions
// =========================================================================

export interface SafeUncertainty {
  question: string;
  assumption: string;
  suggestedAnswer: string;
}

/**
 * Normalize LLM uncertainty output for safe display.
 * Every field gets a default — no undefined reaches the UI.
 */
export function normalizeUncertainties(raw: unknown[] | undefined | null): SafeUncertainty[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((u) => {
      if (typeof u !== 'object' || u === null) {
        return { question: '', assumption: '', suggestedAnswer: '' };
      }
      const obj = u as Record<string, unknown>;
      return {
        question: safeStr(obj.question, '需要确认的细节'),
        assumption: safeStr(obj.assumption, 'AI的推测'),
        suggestedAnswer: safeStr(obj.suggestedAnswer, '待用户确认'),
      };
    })
    .filter((u) => u.question !== '');
}

// =========================================================================
// Generic parse wrapper
// =========================================================================

/**
 * Parse and validate LLM JSON output.
 * Strips code fences, normalizes nulls, applies defaults.
 */
export function parseAgentOutput<T>(
  raw: unknown,
  applyDefaults: (data: Record<string, unknown>) => T,
  schemaName: string,
): AgentOutput<T> {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: `${schemaName}: empty response from LLM`, raw: '' };
  }

  try {
    let data: Record<string, unknown>;
    if (typeof raw === 'string') {
      // Strip code fences
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```\w*\n?/g, '').trim();
      }
      data = JSON.parse(cleaned) as Record<string, unknown>;
    } else if (typeof raw === 'object') {
      data = raw as Record<string, unknown>;
    } else {
      return {
        ok: false,
        reason: `${schemaName}: unexpected type ${typeof raw}`,
        raw: String(raw),
      };
    }

    // Normalize nulls so Zod .default() fires
    data = normalizeNulls(data);

    const result = applyDefaults(data);
    return { ok: true, data: result };
  } catch (e) {
    return {
      ok: false,
      reason: `${schemaName}: ${e instanceof Error ? e.message : 'unknown parse error'}`,
      raw: typeof raw === 'string' ? raw.slice(0, 200) : String(raw).slice(0, 200),
    };
  }
}
