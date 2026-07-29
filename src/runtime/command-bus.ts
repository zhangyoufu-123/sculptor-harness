import type {
  ICommandBus,
  Command,
  CommandResult,
  ICommandHandler,
  AggregateId,
} from './domain-events';
import { eventStore } from './domain-events';
import { commandRegistry } from './command-registry';

/**
 * Central command bus — the ONLY entry point for state mutations.
 * Flow: Command → Handler → Events → Store → Response
 *
 * All writes go through this bus:
 * 1. Validate command structure
 * 2. Route to registered handler
 * 3. Handler checks business rules and produces events
 * 4. Events appended to event store
 * 5. Return result with new state
 */
export class CommandBus implements ICommandBus {
  private handlerMap = new Map<string, ICommandHandler>();

  constructor() {
    // Load all registered handlers
    const types = commandRegistry.list();
    for (const type of types) {
      const handler = commandRegistry.get(type);
      if (handler) {
        this.handlerMap.set(type, handler);
      }
    }
  }

  async dispatch(command: Command): Promise<CommandResult> {
    // 1. Validate command structure
    if (!command.id || !command.type || !command.aggregateId) {
      return {
        success: false,
        events: [],
        rejectionReason: `Invalid command: missing id, type, or aggregateId`,
      };
    }

    // 2. Route to handler
    const handler = this.handlerMap.get(command.type);
    if (!handler) {
      return {
        success: false,
        events: [],
        rejectionReason: `No handler registered for command: ${command.type}`,
      };
    }

    // 3. Load current state for the aggregate
    const currentState = await this.loadCurrentState(command.aggregateId);

    // 4. Execute handler
    const result = handler.handle(command, currentState);

    // 5. If successful, persist events
    if (result.success && result.events.length > 0) {
      try {
        await eventStore.append(result.events);
      } catch (error) {
        return {
          success: false,
          events: [],
          rejectionReason: `Failed to persist events: ${error instanceof Error ? error.message : 'unknown'}`,
        };
      }
    }

    return result;
  }

  registerHandler(handler: ICommandHandler): void {
    this.handlerMap.set(handler.commandType, handler);
    // Also register in the global registry
    try {
      commandRegistry.register(handler);
    } catch {
      // Already registered — that's fine
    }
  }

  /**
   * Reconstruct current state for an aggregate by replaying its events.
   * V1: simple replay that merges payload fields. V2: proper projection.
   */
  private async loadCurrentState(aggregateId: AggregateId): Promise<Record<string, unknown>> {
    const events = await eventStore.getEvents(aggregateId);
    const state: Record<string, unknown> = { version: events.length };

    for (const event of events) {
      // Simple merge: payload values override previous state
      // V2: each event type has its own projection logic
      Object.assign(state, event.payload);
      state.version = event.version;
    }

    return state;
  }
}

/** Global singleton */
export const commandBus = new CommandBus();
