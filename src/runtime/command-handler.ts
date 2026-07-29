import {
  ICommandHandler,
  Command,
  CommandResult,
  CommandType,
  EventType,
  AggregateType,
  DomainEvent,
} from './domain-events';
import { commandRegistry } from './command-registry';
import type { DraftState } from '@/pcs/types';

// ============================================================================
// Handler 1: InitProjectHandler
// ============================================================================

export class InitProjectHandler implements ICommandHandler {
  readonly commandType = CommandType.INIT_PROJECT;

  handle(command: Command, _currentState: Record<string, unknown>): CommandResult {
    const projectId = command.aggregateId.id;
    const payload = command.payload as { purpose?: string; coreMessage?: string };

    const events: DomainEvent[] = [
      {
        id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        aggregateId: { type: AggregateType.PROJECT, id: projectId },
        version: 1,
        eventType: EventType.PROJECT_INITIALIZED,
        payload: {
          purpose: payload.purpose || '',
          coreMessage: payload.coreMessage || '',
          phase: 'initializing',
          nodeCount: 0,
        },
        occurredAt: new Date().toISOString(),
        actor: command.actor,
        correlationId: command.id,
      },
    ];

    return { success: true, events, newState: { phase: 'initializing', projectId } };
  }
}

// ============================================================================
// Handler 2: StartNodeHandler
// ============================================================================

export class StartNodeHandler implements ICommandHandler {
  readonly commandType = CommandType.START_NODE;

  handle(command: Command, currentState: Record<string, unknown>): CommandResult {
    const nodeId = command.aggregateId.id;
    const currentDraftState = (currentState.draftState as string) || 'empty';

    // Guard: can only start from empty or failed
    if (currentDraftState !== 'empty' && currentDraftState !== 'failed') {
      return {
        success: false,
        events: [],
        rejectionReason: `Cannot start node in state: ${currentDraftState}`,
      };
    }

    const events: DomainEvent[] = [
      {
        id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        aggregateId: { type: AggregateType.NODE, id: nodeId },
        version: ((currentState.version as number) || 0) + 1,
        eventType: EventType.NODE_STARTED,
        payload: { previousState: currentDraftState, nextState: 'planned' },
        occurredAt: new Date().toISOString(),
        actor: command.actor,
      },
    ];

    return {
      success: true,
      events,
      newState: { ...currentState, draftState: 'planned', version: events[0].version },
    };
  }
}

// ============================================================================
// Handler 3: SaveDraftHandler
// ============================================================================

export class SaveDraftHandler implements ICommandHandler {
  readonly commandType = CommandType.SAVE_DRAFT;

  handle(command: Command, currentState: Record<string, unknown>): CommandResult {
    const nodeId = command.aggregateId.id;
    const payload = command.payload as { content?: string };
    const content = payload.content || '';

    const events: DomainEvent[] = [
      {
        id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        aggregateId: { type: AggregateType.NODE, id: nodeId },
        version: ((currentState.version as number) || 0) + 1,
        eventType: EventType.NODE_DRAFT_SAVED,
        payload: { content, contentLength: content.length, previousState: currentState.draftState },
        occurredAt: new Date().toISOString(),
        actor: command.actor,
      },
    ];

    return {
      success: true,
      events,
      newState: { ...currentState, content, draftState: 'drafted', version: events[0].version },
    };
  }
}

// ============================================================================
// Handler 4: SubmitNodeHandler
// ============================================================================

export class SubmitNodeHandler implements ICommandHandler {
  readonly commandType = CommandType.SUBMIT_NODE;

  handle(command: Command, currentState: Record<string, unknown>): CommandResult {
    const nodeId = command.aggregateId.id;
    const currentDraftState = (currentState.draftState as DraftState) || 'empty';

    // Guard: can only submit from drafted or revising
    if (currentDraftState !== 'drafted' && currentDraftState !== 'revising') {
      return {
        success: false,
        events: [],
        rejectionReason: `Cannot submit node in state: ${currentDraftState}`,
      };
    }

    const events: DomainEvent[] = [
      {
        id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        aggregateId: { type: AggregateType.NODE, id: nodeId },
        version: ((currentState.version as number) || 0) + 1,
        eventType: EventType.NODE_SUBMITTED,
        payload: { previousState: currentDraftState, nextState: 'reviewing' },
        occurredAt: new Date().toISOString(),
        actor: command.actor,
      },
    ];

    return {
      success: true,
      events,
      newState: { ...currentState, draftState: 'reviewing', version: events[0].version },
    };
  }
}

// ============================================================================
// Handler 5: ApproveNodeHandler
// ============================================================================

export class ApproveNodeHandler implements ICommandHandler {
  readonly commandType = CommandType.APPROVE_NODE;

  handle(command: Command, currentState: Record<string, unknown>): CommandResult {
    const nodeId = command.aggregateId.id;
    const currentDraftState = (currentState.draftState as string) || 'empty';

    // Guard: can only approve from reviewing
    if (currentDraftState !== 'reviewing') {
      return {
        success: false,
        events: [],
        rejectionReason: `Cannot approve node in state: ${currentDraftState}`,
      };
    }

    const events: DomainEvent[] = [
      {
        id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        aggregateId: { type: AggregateType.NODE, id: nodeId },
        version: ((currentState.version as number) || 0) + 1,
        eventType: EventType.NODE_APPROVED,
        payload: { previousState: 'reviewing', nextState: 'approved' },
        occurredAt: new Date().toISOString(),
        actor: command.actor,
      },
    ];

    return {
      success: true,
      events,
      newState: { ...currentState, draftState: 'approved', version: events[0].version },
    };
  }
}

// ============================================================================
// Bootstrap
// ============================================================================

/** Register all command handlers during app bootstrap. Call once at startup. */
export function registerAllHandlers(): void {
  commandRegistry.register(new InitProjectHandler());
  commandRegistry.register(new StartNodeHandler());
  commandRegistry.register(new SaveDraftHandler());
  commandRegistry.register(new SubmitNodeHandler());
  commandRegistry.register(new ApproveNodeHandler());
}
