// ============================================================
// agent-pcs-roundtrip.test.ts — Agent ↔ PCS round-trip tests
// ============================================================

import { describe, it, expect } from 'vitest';
import type { ProposalMutation, IPCSAccessor } from '@/agents/types';
import { PCSManager } from '@/pcs/pcs-manager';
import type { ProposalTrigger } from '@/pcs/types';
import { createPCSState } from '@/test/mocks/pcs-factory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ProposalMutation for the accessor. */
function makeProposal(overrides: Partial<ProposalMutation> = {}): ProposalMutation {
  return {
    fieldPath: 'intent.purpose',
    proposedValue: 'persuade',
    reason: 'Better fit for the audience',
    trigger: 'manual' as ProposalTrigger,
    confidence: 0.95,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent → PCS → Agent round-trip', () => {
  // -----------------------------------------------------------------------
  // 1. Complete read → propose → accept → read cycle
  // -----------------------------------------------------------------------

  it('preserves data through the full propose-readback cycle', () => {
    // Arrange: PCS in initializing phase (fields are mutable)
    const state = createPCSState('initializing');
    const manager = new PCSManager(state);
    const accessor: IPCSAccessor = manager.createAccessor();

    // --- Step 1: Agent reads current value ---
    const before = accessor.read('intent.purpose');
    expect(before).toBe('inform');

    // --- Step 2: Agent proposes a change ---
    const mutation = makeProposal({
      fieldPath: 'intent.purpose',
      proposedValue: 'persuade',
      reason: 'Audience prefers persuasive tone',
    });
    accessor.propose(mutation);

    // --- Step 3: Verify proposal is pending ---
    const pending = manager.getPendingProposals();
    expect(pending).toHaveLength(1);
    expect(pending[0].fieldPath).toBe('intent.purpose');
    expect(pending[0].proposal.status).toBe('pending');
    expect(pending[0].proposal.new_value).toBe('persuade');

    const proposalStatus = accessor.getProposalStatus('intent.purpose');
    expect(proposalStatus).toBe('pending');

    // --- Step 4: Field value is NOT yet changed ---
    const during = accessor.read('intent.purpose');
    expect(during).toBe('inform');

    // --- Step 5: User accepts the proposal ---
    const acceptResult = manager.acceptProposal('intent.purpose');
    expect(acceptResult.success).toBe(true);
    expect(acceptResult.oldValue).toBe('inform');
    expect(acceptResult.newValue).toBe('persuade');

    // --- Step 6: Proposal is no longer pending ---
    expect(manager.getPendingProposals()).toHaveLength(0);
    expect(accessor.getProposalStatus('intent.purpose')).toBeNull();

    // --- Step 7: Agent reads back updated value ---
    const after = accessor.read('intent.purpose');
    expect(after).toBe('persuade');

    // Data integrity: value survived the whole cycle unchanged
    expect(after).toBe(mutation.proposedValue);
  });

  // -----------------------------------------------------------------------
  // 2. Proposal rejection
  // -----------------------------------------------------------------------

  it('rejects a proposal without changing the field value', () => {
    const manager = new PCSManager(createPCSState('initializing'));
    const accessor = manager.createAccessor();

    const original = accessor.read('intent.purpose');

    accessor.propose(
      makeProposal({
        fieldPath: 'intent.purpose',
        proposedValue: 'entertain',
      }),
    );

    const rejectResult = manager.rejectProposal('intent.purpose');
    expect(rejectResult.success).toBe(true);

    // Value unchanged
    expect(accessor.read('intent.purpose')).toBe(original);
    // No pending proposals
    expect(manager.getPendingProposals()).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 3. Multiple proposals
  // -----------------------------------------------------------------------

  it('handles multiple concurrent proposals independently', () => {
    const manager = new PCSManager(createPCSState('initializing'));
    const accessor = manager.createAccessor();

    // Propose changes to three different fields
    accessor.propose(
      makeProposal({
        fieldPath: 'intent.purpose',
        proposedValue: 'inspire',
        reason: 'Inspire action',
      }),
    );
    accessor.propose(
      makeProposal({
        fieldPath: 'intent.core_message',
        proposedValue: 'You can do it',
        reason: 'More empowering message',
        confidence: 0.8,
      }),
    );
    accessor.propose(
      makeProposal({
        fieldPath: 'expression.tone',
        proposedValue: 'motivational',
        reason: 'Match the new intent',
        confidence: 0.9,
      }),
    );

    const pending = manager.getPendingProposals();
    expect(pending).toHaveLength(3);

    // Accept only the first two
    expect(manager.acceptProposal('intent.purpose').success).toBe(true);
    expect(manager.acceptProposal('intent.core_message').success).toBe(true);

    // Reject the third
    expect(manager.rejectProposal('expression.tone').success).toBe(true);

    // Only accepted values changed
    expect(accessor.read('intent.purpose')).toBe('inspire');
    expect(accessor.read('intent.core_message')).toBe('You can do it');
    expect(accessor.read('expression.tone')).toBe('analytical'); // default remains

    // Clean slate
    expect(manager.getPendingProposals()).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 4. Data integrity across snapshots
  // -----------------------------------------------------------------------

  it('snapshot reflects accepted proposal values', () => {
    const manager = new PCSManager(createPCSState('initializing'));
    const accessor = manager.createAccessor();

    accessor.propose(
      makeProposal({
        fieldPath: 'intent.purpose',
        proposedValue: 'educate',
      }),
    );
    manager.acceptProposal('intent.purpose');

    const snapshot = accessor.getSnapshot();
    // The snapshot's intent.purpose should carry the new value
    expect(snapshot.intent.purpose.value).toBe('educate');
    expect(snapshot.intent.purpose.status).toBe('confirmed');
  });

  // -----------------------------------------------------------------------
  // 5. Accessor read access to all layers
  // -----------------------------------------------------------------------

  it('accessor can read fields from every PCS layer', () => {
    const manager = new PCSManager(createPCSState('clarifying'));
    const accessor = manager.createAccessor();

    // Intent layer
    expect(accessor.read('intent.purpose')).toBe('inform');
    // Audience layer
    expect(accessor.read('audience.audience_type')).toBe('developers');
    // Constraint layer
    expect(accessor.read('constraint.length_min')).toBe(500);
    // Expression layer
    expect(accessor.read('expression.tone')).toBe('analytical');
  });

  // -----------------------------------------------------------------------
  // 6. Proposal overwrite (last proposal wins)
  // -----------------------------------------------------------------------

  it('last proposal overwrites the previous pending proposal', () => {
    const manager = new PCSManager(createPCSState('initializing'));
    const accessor = manager.createAccessor();

    accessor.propose(
      makeProposal({
        fieldPath: 'intent.purpose',
        proposedValue: 'first',
        reason: 'First attempt',
      }),
    );

    // Second proposal to the same field overwrites the first
    accessor.propose(
      makeProposal({
        fieldPath: 'intent.purpose',
        proposedValue: 'second',
        reason: 'Second attempt',
      }),
    );

    const pending = manager.getPendingProposals();
    expect(pending).toHaveLength(1);
    expect(pending[0].proposal.new_value).toBe('second');

    manager.acceptProposal('intent.purpose');
    expect(accessor.read('intent.purpose')).toBe('second');
  });

  // -----------------------------------------------------------------------
  // 7. Decision history is populated
  // -----------------------------------------------------------------------

  it('accepting a proposal records it in decision history', () => {
    const manager = new PCSManager(createPCSState('initializing'));
    const accessor = manager.createAccessor();

    accessor.propose(
      makeProposal({
        fieldPath: 'intent.purpose',
        proposedValue: 'chronicle',
        reason: 'Document the journey',
      }),
    );
    manager.acceptProposal('intent.purpose');

    const history = accessor.getDecisionHistory('intent.purpose');
    expect(history).toHaveLength(1);
    expect(history[0].field_path).toBe('intent.purpose');
    expect(history[0].old_value).toBe('inform');
    expect(history[0].new_value).toBe('chronicle');
    expect(history[0].initiator).toBe('user');
  });

  // -----------------------------------------------------------------------
  // 8. Edge: proposing to a non-existent field
  // -----------------------------------------------------------------------

  it('proposing to an unknown field path returns an error from the manager', () => {
    const manager = new PCSManager(createPCSState('initializing'));

    const result = manager.proposeField(
      'ghost.field',
      'value',
      'reason',
      'manual' as ProposalTrigger,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  // -----------------------------------------------------------------------
  // 9. Edge: accessor.read for unknown path returns undefined
  // -----------------------------------------------------------------------

  it('accessor.read returns undefined for unknown field path', () => {
    const manager = new PCSManager(createPCSState('initializing'));
    const accessor = manager.createAccessor();

    expect(accessor.read('nonexistent.path')).toBeUndefined();
  });
});
