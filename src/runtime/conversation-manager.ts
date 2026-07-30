import type {
  ConversationThread,
  Message,
  ConversationScope,
  MessageRole,
  DecisionCandidate,
} from './conversation-types';
import { extractDecisions } from './conversation-types';

/**
 * Manages all conversations for a project.
 * Threads are scoped (INTENT/STRUCTURE/REVISION/KNOWLEDGE/STYLE/PUBLISHING)
 * so Context Runtime knows which history to read for each agent.
 */
export class ConversationManager {
  private threads: Map<string, ConversationThread> = new Map();

  /**
   * Create a new conversation thread with a specific scope.
   */
  createThread(params: {
    projectId: string;
    scope: ConversationScope;
    relatedNodeId?: string;
  }): ConversationThread {
    const thread: ConversationThread = {
      id: `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: params.projectId,
      scope: params.scope,
      relatedNodeId: params.relatedNodeId,
      messages: [],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.threads.set(thread.id, thread);
    return thread;
  }

  /**
   * Add a message to a thread.
   */
  addMessage(params: {
    threadId: string;
    role: MessageRole;
    content: string;
    relatedEntity?: string;
  }): Message | null {
    const thread = this.threads.get(params.threadId);
    if (!thread || !thread.isActive) return null;

    const message: Message = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      conversationId: params.threadId,
      role: params.role,
      content: params.content,
      relatedEntity: params.relatedEntity,
      createdAt: new Date().toISOString(),
    };

    thread.messages.push(message);
    thread.updatedAt = new Date().toISOString();
    return message;
  }

  /**
   * Get all messages for a thread.
   */
  getMessages(threadId: string): Message[] {
    return this.threads.get(threadId)?.messages ?? [];
  }

  /**
   * Get recent messages across threads for context assembly.
   */
  getRecentContext(projectId: string, limit = 20): Message[] {
    const allMessages: Message[] = [];
    Array.from(this.threads.values()).forEach((thread) => {
      if (thread.projectId === projectId) {
        allMessages.push(...thread.messages);
      }
    });
    return allMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-limit);
  }

  /**
   * Get messages from a specific scope, for agent context injection.
   */
  getScopeContext(projectId: string, scope: ConversationScope, limit = 10): Message[] {
    const scopedMessages: Message[] = [];
    Array.from(this.threads.values()).forEach((thread) => {
      if (thread.projectId === projectId && thread.scope === scope) {
        scopedMessages.push(...thread.messages);
      }
    });
    return scopedMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-limit);
  }

  /**
   * Extract PCS decision candidates from recent conversation.
   * Called after each user message to detect implicit intent changes.
   */
  extractDecisions(threadId: string): DecisionCandidate[] {
    const thread = this.threads.get(threadId);
    if (!thread) return [];
    return extractDecisions(thread.messages, thread.projectId);
  }

  /**
   * Close a thread (no more messages).
   */
  closeThread(threadId: string): void {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.isActive = false;
      thread.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Get thread summary for debugging.
   */
  getThreadSummary(threadId: string): string | null {
    const thread = this.threads.get(threadId);
    if (!thread) return null;
    return `[${thread.scope}] ${thread.messages.length} messages (${thread.isActive ? 'active' : 'closed'})`;
  }

  /** Find or create a thread for a specific scope and node */
  findOrCreateThread(params: {
    projectId: string;
    scope: ConversationScope;
    relatedNodeId?: string;
  }): ConversationThread {
    // Find existing active thread with same scope+node
    const existing = Array.from(this.threads.values()).find(
      (thread) =>
        thread.projectId === params.projectId &&
        thread.scope === params.scope &&
        thread.relatedNodeId === params.relatedNodeId &&
        thread.isActive,
    );
    if (existing) return existing;
    // Create new
    return this.createThread(params);
  }

  /** List all threads for a project */
  listThreads(projectId: string): ConversationThread[] {
    return Array.from(this.threads.values()).filter((t) => t.projectId === projectId);
  }

  /** Reset for testing */
  reset(): void {
    this.threads.clear();
  }
}

/** Global singleton */
export const conversationManager = new ConversationManager();
