/**
 * PCS CRUD API Endpoint
 * ====================================================================
 *
 * Handles GET (read current PCS state) and POST (apply PCS mutations).
 *
 * V1: Uses an in-memory singleton PCSManager initialised with mock state.
 * V2: Replace with session-scoped or database-backed PCSManager.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PCSState, PCSField, ProposalTrigger } from '@/pcs/types';
import { PCSManager } from '@/pcs/pcs-manager';

// ---------------------------------------------------------------------------
// V1 In-memory singleton
// ---------------------------------------------------------------------------

let pcsManager: PCSManager | null = null;

function getOrCreateManager(): PCSManager {
  if (pcsManager === null) {
    pcsManager = new PCSManager(MOCK_PCS_STATE);
  }
  return pcsManager;
}

// ---------------------------------------------------------------------------
// GET — Return current PCS state
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const manager = getOrCreateManager();
    return NextResponse.json(manager.getSnapshot());
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve PCS state' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Apply a PCS mutation
// ---------------------------------------------------------------------------

interface PCSMutationBody {
  action?: string;
  path?: string;
  value?: unknown;
  reason?: string;
  trigger?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as PCSMutationBody;
    const { action, path: fieldPath, value, reason, trigger } = body;

    // --- Input validation ---

    if (typeof action !== 'string' || action.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid "action" field' }, { status: 400 });
    }

    if (typeof fieldPath !== 'string' || fieldPath.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid "path" field' }, { status: 400 });
    }

    const manager = getOrCreateManager();

    // --- Route by action ---

    switch (action) {
      case 'write': {
        if (value === undefined) {
          return NextResponse.json(
            { error: '"value" is required for write action' },
            { status: 400 },
          );
        }
        const result = manager.writeField(fieldPath, value, 'user');
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        break;
      }

      case 'propose': {
        if (value === undefined) {
          return NextResponse.json(
            { error: '"value" is required for propose action' },
            { status: 400 },
          );
        }
        const validTrigger: ProposalTrigger =
          trigger === 'conflict' || trigger === 'blocking' || trigger === 'manual'
            ? trigger
            : 'manual';
        const result = manager.proposeField(fieldPath, value, reason ?? '', validTrigger);
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        break;
      }

      case 'accept': {
        const result = manager.acceptProposal(fieldPath);
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        break;
      }

      case 'reject': {
        const result = manager.rejectProposal(fieldPath);
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: "${action}". Expected one of: write, propose, accept, reject` },
          { status: 400 },
        );
    }

    // Return updated snapshot after mutation
    return NextResponse.json(manager.getSnapshot());
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process PCS mutation' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// V1 Mock PCS State
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

/** Create a PCSField with sensible defaults for V1 mock data. */
function mf<T>(value: T, overrides?: Partial<PCSField<T>>): PCSField<T> {
  return {
    value,
    status: 'assumed',
    source: 'system',
    confidence: 0.5,
    last_updated: NOW,
    ...overrides,
  };
}

const MOCK_PCS_STATE: PCSState = {
  id: 'mock-pcs-001',
  project_id: 'mock-project-001',
  phase: 'initializing',
  created_at: NOW,
  updated_at: NOW,

  intent: {
    purpose: mf('inform'),
    core_message: mf(''),
    desired_impact: mf(''),
    target_emotion: mf(''),
  },

  audience: {
    audience_type: mf('general'),
    knowledge_level: mf('intermediate'),
    relationship: mf('peer'),
    pain_points: mf<string[]>([]),
  },

  constraint: {
    type: mf('article'),
    platform: mf('web'),
    format: mf('markdown'),
    length_min: mf(500),
    length_max: mf(2000),
    deadline: mf(''),
    custom_constraints: mf<string[]>([]),
  },

  knowledge: {
    required_topics: [],
    known_topics: [],
    missing_information: [],
    sources: mf<string[]>([]),
  },

  structure: {
    sections: [],
  },

  expression: {
    tone: mf('professional'),
    voice: mf('authoritative'),
    avoid: mf<string[]>([]),
    style_reference: mf(''),
    format_reference: mf(''),
    thinking_reference: mf(''),
  },
};
