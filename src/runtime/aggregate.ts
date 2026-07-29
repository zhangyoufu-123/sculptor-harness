import type { DomainEvent, AggregateId } from './domain-events';
import { EventType, AggregateType, ActorType, eventStore } from './domain-events';

/**
 * Projection: rebuilds aggregate state by replaying events.
 * Event sourcing principle: state = fold(initialState, events).
 */

/** Generic aggregate state */
export interface AggregateState {
  aggregateId: AggregateId;
  version: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Replay all events for an aggregate and return its current state.
 * V1: simple payload merge. V2: per-event-type projection functions.
 */
export async function rebuildState(aggregateId: AggregateId): Promise<AggregateState> {
  const events = await eventStore.getEvents(aggregateId);

  const state: AggregateState = {
    aggregateId,
    version: 0,
    createdAt: events.length > 0 ? events[0].occurredAt : new Date().toISOString(),
    updatedAt: events.length > 0 ? events[events.length - 1].occurredAt : new Date().toISOString(),
  };

  for (const event of events) {
    applyEvent(state, event);
  }

  return state;
}

/**
 * Apply a single event to the aggregate state.
 * V1: payload merge. V2: switch on EventType for type-safe projections.
 */
function applyEvent(state: AggregateState, event: DomainEvent): void {
  // Update version
  state.version = event.version;
  state.updatedAt = event.occurredAt;

  // Merge payload — last write wins for overlapping keys
  Object.assign(state, event.payload);

  // Special handling for known fields
  if (event.payload.draftState !== undefined) {
    state.draftState = event.payload.draftState;
  }
  if (event.payload.content !== undefined) {
    state.content = event.payload.content;
  }
  if (event.payload.phase !== undefined) {
    state.phase = event.payload.phase;
  }
}

/**
 * Create a new event for an aggregate.
 * Auto-increments version from the event store.
 */
export async function createEvent(params: {
  aggregateId: AggregateId;
  eventType: EventType;
  payload: Record<string, unknown>;
  actor?: string;
  correlationId?: string;
}): Promise<DomainEvent> {
  const latestVersion = await eventStore.getLatestVersion(params.aggregateId);

  return {
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    aggregateId: params.aggregateId,
    version: latestVersion + 1,
    eventType: params.eventType,
    payload: params.payload,
    occurredAt: new Date().toISOString(),
    actor: (params.actor as ActorType) || ActorType.SYSTEM,
    correlationId: params.correlationId,
  };
}

/**
 * Build a simple node aggregate ID.
 */
export function nodeAggregate(nodeId: string): AggregateId {
  return { type: AggregateType.NODE, id: nodeId };
}

/**
 * Build a simple project aggregate ID.
 */
export function projectAggregate(projectId: string): AggregateId {
  return { type: AggregateType.PROJECT, id: projectId };
}

/**
 * Build a simple PCS aggregate ID.
 */
export function pcsAggregate(projectId: string): AggregateId {
  return { type: AggregateType.PCS, id: projectId };
}
