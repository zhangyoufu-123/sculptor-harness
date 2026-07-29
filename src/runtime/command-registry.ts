import type { ICommandHandler, CommandType } from './domain-events';

/**
 * Maps each CommandType to its handler.
 * Registration is explicit — no auto-discovery, no magic.
 * Each handler is added in runtime/command-handler.ts during app bootstrap.
 */
export class CommandRegistry {
  private handlers = new Map<CommandType, ICommandHandler>();

  /** Register a handler for a command type. One handler per command type. */
  register(handler: ICommandHandler): void {
    if (this.handlers.has(handler.commandType)) {
      throw new Error(`Handler already registered for command: ${handler.commandType}`);
    }
    this.handlers.set(handler.commandType, handler);
  }

  /** Get the handler for a command type, or undefined if not registered */
  get(type: CommandType): ICommandHandler | undefined {
    return this.handlers.get(type);
  }

  /** Check if a handler is registered */
  has(type: CommandType): boolean {
    return this.handlers.has(type);
  }

  /** List all registered command types */
  list(): CommandType[] {
    return Array.from(this.handlers.keys());
  }
}

/** Global singleton */
export const commandRegistry = new CommandRegistry();
