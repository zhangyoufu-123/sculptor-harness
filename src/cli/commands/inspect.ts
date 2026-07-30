import { PCSManager } from '@/pcs/pcs-manager';
import { eventStore } from '@/runtime/domain-events';
import type { AggregateType } from '@/runtime/domain-events';

export async function inspectEvents(_projectId?: string): Promise<void> {
  console.log('\n📋 Event Store\n');

  try {
    // Query the in-memory event store for project aggregate events
    const events = await eventStore.getEvents({
      type: 'project' as AggregateType,
      id: _projectId ?? 'unknown',
    });

    if (events.length === 0) {
      console.log('  (No events recorded)\n');
      console.log('  格式: [timestamp] EVENT_TYPE v=version → aggregateId\n');
      return;
    }

    for (const event of events) {
      console.log(
        `  [${event.occurredAt}] ${event.eventType} v=${event.version} → ${event.aggregateId.type}/${event.aggregateId.id}`,
      );
    }
  } catch {
    // V1: fallback for when event store is empty or query fails
    console.log('  (V1: Event store inspection — connect to real store for full data)\n');
    console.log('  格式: [timestamp] EVENT_TYPE v=version → aggregateId\n');
  }

  console.log('');
}

export async function inspectDecisions(manager: PCSManager | null): Promise<void> {
  console.log('\n📋 Decision History\n');
  if (!manager) {
    console.log('  (No PCS Manager loaded)\n');
    return;
  }
  const decisions = manager.getDecisionHistory();
  if (decisions.length === 0) {
    console.log('  (No decisions recorded)\n');
    return;
  }
  for (const d of decisions) {
    console.log(
      `  [${d.timestamp}] ${d.field_path}: "${String(d.old_value)}" → "${String(d.new_value)}"`,
    );
    console.log(`    Reason: ${d.reason} | By: ${d.initiator} | Phase: ${d.phase}\n`);
  }
}

export async function inspectState(manager: PCSManager | null): Promise<void> {
  console.log('\n📋 Current PCS State\n');
  if (!manager) {
    console.log('  (No PCS Manager loaded)\n');
    return;
  }
  const state = manager.getSnapshot();
  console.log(`  Phase: ${state.phase}`);
  console.log(`  Project: ${state.project_id}`);
  console.log(`  Intent: ${state.intent.purpose.value.slice(0, 60)}...`);
  console.log(`  Audience: ${state.audience.audience_type.value}`);
  console.log(`  Sections: ${state.structure.sections.length}`);
  for (const s of state.structure.sections) {
    console.log(`    [${s.draft_state}] ${s.title}: ${s.goal.slice(0, 40)}...`);
  }
  console.log('');
}
