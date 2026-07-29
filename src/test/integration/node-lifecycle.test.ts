// ============================================================
// node-lifecycle.test.ts — Node 7-state draft lifecycle tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { PCSManager } from '@/pcs/pcs-manager';
import type { DraftState } from '@/pcs/types';
import { createPCSState, createSection } from '@/test/mocks/pcs-factory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify that a section's draft_state equals the expected value. */
function expectDraftState(manager: PCSManager, sectionId: string, expected: DraftState): void {
  const section = manager.getSection(sectionId);
  expect(section).toBeDefined();
  if (section !== undefined) {
    expect(section.draft_state).toBe(expected);
  }
}

/** Transition a section's draft_state and verify the update succeeded. */
function expectTransitionTo(manager: PCSManager, sectionId: string, target: DraftState): void {
  manager.updateSectionDraftState(sectionId, target);
  expectDraftState(manager, sectionId, target);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Node Draft-State Lifecycle', () => {
  // =======================================================================
  // Happy path: empty → planned → generating → drafted → reviewing → approved
  // =======================================================================

  it('completes the full 7-state lifecycle from empty to locked', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [createSection({ id: 'node-1', order: 0, draft_state: 'empty' })],
      },
    });
    const manager = new PCSManager(state);

    // empty → planned
    expectTransitionTo(manager, 'node-1', 'planned');
    // planned → generating
    expectTransitionTo(manager, 'node-1', 'generating');
    // generating → drafted
    expectTransitionTo(manager, 'node-1', 'drafted');
    // drafted → reviewing
    expectTransitionTo(manager, 'node-1', 'reviewing');
    // reviewing → approved
    expectTransitionTo(manager, 'node-1', 'approved');
    // approved → locked
    expectTransitionTo(manager, 'node-1', 'locked');

    // Verify the final snapshot reflects the locked state
    const snapshot = manager.getSnapshot();
    const section = snapshot.structure.sections.find((s) => s.id === 'node-1');
    expect(section).toBeDefined();
    if (section !== undefined) {
      expect(section.draft_state).toBe('locked');
    }
  });

  // =======================================================================
  // Path: planned → drafted (skip generation)
  // =======================================================================

  it('transitions from planned directly to drafted (skip generation path)', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [createSection({ id: 'skip-gen', order: 0, draft_state: 'planned' })],
      },
    });
    const manager = new PCSManager(state);

    expectTransitionTo(manager, 'skip-gen', 'drafted');
    expectDraftState(manager, 'skip-gen', 'drafted');
  });

  // =======================================================================
  // Path: drafted → planned (replan)
  // =======================================================================

  it('transitions from drafted back to planned (replan path)', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [createSection({ id: 'replan', order: 0, draft_state: 'drafted' })],
      },
    });
    const manager = new PCSManager(state);

    expectTransitionTo(manager, 'replan', 'planned');
    expectDraftState(manager, 'replan', 'planned');
  });

  // =======================================================================
  // Path: approved → drafted (unlock)
  // =======================================================================

  it('transitions from approved back to drafted (unlock / reopen path)', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [createSection({ id: 'unlock', order: 0, draft_state: 'approved' })],
      },
    });
    const manager = new PCSManager(state);

    expectTransitionTo(manager, 'unlock', 'drafted');
    expectDraftState(manager, 'unlock', 'drafted');
  });

  // =======================================================================
  // Path: generating → drafted (stop early)
  // =======================================================================

  it('transitions from generating directly to drafted (stop early path)', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [
          createSection({
            id: 'stop-early',
            order: 0,
            draft_state: 'generating',
          }),
        ],
      },
    });
    const manager = new PCSManager(state);

    expectTransitionTo(manager, 'stop-early', 'drafted');
    expectDraftState(manager, 'stop-early', 'drafted');
  });

  // =======================================================================
  // Multi-node: independent states
  // =======================================================================

  it('manages 3 nodes with independent draft-state lifecycles', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [
          createSection({ id: 'A', order: 0, draft_state: 'empty' }),
          createSection({ id: 'B', order: 1, draft_state: 'empty' }),
          createSection({ id: 'C', order: 2, draft_state: 'empty' }),
        ],
      },
    });
    const manager = new PCSManager(state);

    // Progress nodes at different speeds
    expectTransitionTo(manager, 'A', 'planned');
    expectTransitionTo(manager, 'A', 'generating');

    expectTransitionTo(manager, 'B', 'planned');

    // C stays empty

    expectDraftState(manager, 'A', 'generating');
    expectDraftState(manager, 'B', 'planned');
    expectDraftState(manager, 'C', 'empty');
  });

  // =======================================================================
  // Persistence: draft_state survives in PCS snapshot
  // =======================================================================

  it('persists draft_state changes across PCS snapshots', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [createSection({ id: 'persist', order: 0, draft_state: 'empty' })],
      },
    });
    const manager = new PCSManager(state);

    manager.updateSectionDraftState('persist', 'reviewing');

    // First snapshot
    const snap1 = manager.getSnapshot();
    const sec1 = snap1.structure.sections.find((s) => s.id === 'persist');
    expect(sec1?.draft_state).toBe('reviewing');

    // Further mutation
    manager.updateSectionDraftState('persist', 'approved');

    // Second snapshot
    const snap2 = manager.getSnapshot();
    const sec2 = snap2.structure.sections.find((s) => s.id === 'persist');
    expect(sec2?.draft_state).toBe('approved');

    // First snapshot unchanged (deep clone)
    expect(sec1?.draft_state).toBe('reviewing');
  });

  // =======================================================================
  // Edge cases
  // =======================================================================

  it('updateSectionDraftState is a no-op for unknown section ID', () => {
    const manager = new PCSManager(createPCSState('executing'));

    // Should not throw
    manager.updateSectionDraftState('ghost-node', 'approved');

    // PCS state unchanged — updated_at should still have been bumped though
    const snapshot = manager.getSnapshot();
    expect(snapshot.structure.sections).toHaveLength(3);
  });

  it('allows setting draft_state to any valid value from any state', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [createSection({ id: 'flex', order: 0, draft_state: 'locked' })],
      },
    });
    const manager = new PCSManager(state);

    // Jump from locked directly to empty (no guard currently enforces ordering)
    manager.updateSectionDraftState('flex', 'empty');
    expectDraftState(manager, 'flex', 'empty');

    // Jump to approved
    manager.updateSectionDraftState('flex', 'approved');
    expectDraftState(manager, 'flex', 'approved');
  });

  it('content_draft is preserved when only draft_state changes', () => {
    const state = createPCSState('executing', {
      structure: {
        sections: [
          createSection({
            id: 'content',
            order: 0,
            draft_state: 'drafted',
            content_draft: '# Important content',
          }),
        ],
      },
    });
    const manager = new PCSManager(state);

    manager.updateSectionDraftState('content', 'reviewing');

    const section = manager.getSection('content');
    expect(section?.draft_state).toBe('reviewing');
    expect(section?.content_draft).toBe('# Important content');
  });
});
