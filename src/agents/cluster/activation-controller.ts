/**
 * Activation Controller — manages agent lifecycle activation/deactivation.
 *
 * Handles:
 * - Priority-based activation queue
 * - TTL enforcement for time-limited agents
 * - Ensuring required agents are active when needed
 */

import { agentBus, type AgentRole } from './agent-bus';

export class ActivationController {
  /** Ensure a specific agent is active, activating if needed */
  ensureActive(role: AgentRole, reason: string, ttl?: number): void {
    if (!agentBus.isActive(role)) {
      agentBus.requestActivation({
        targetAgent: role,
        reason,
        priority: 'high',
        context: {},
        requestedBy: 'data_recorder',
        timestamp: Date.now(),
        ttl,
      });
    }
  }

  /** Deactivate all agents except those in the keepAlive list */
  deactivateAllExcept(keepAlive: AgentRole[]): void {
    const allRoles: AgentRole[] = [
      'style_recorder',
      'data_recorder',
      'question_agent',
      'writing_agent',
    ];
    for (const role of allRoles) {
      if (!keepAlive.includes(role) && agentBus.isActive(role)) {
        agentBus.deactivateAgent(role);
      }
    }
  }

  /** Check TTL for all active agents and deactivate expired ones */
  checkTTLs(): void {
    const allRoles: AgentRole[] = [
      'style_recorder',
      'data_recorder',
      'question_agent',
      'writing_agent',
    ];
    for (const role of allRoles) {
      agentBus.isActive(role); // This internally checks TTL and deactivates if expired
    }
  }
}

export const activationController = new ActivationController();

/**
 * Ensure that all required agents are active based on the current phase.
 */
export function ensureAgentsActive(phase: 'question' | 'writing' | 'idle'): void {
  switch (phase) {
    case 'question':
      activationController.ensureActive(
        'style_recorder',
        'question phase requires style prediction',
        60000,
      );
      break;
    case 'writing':
      activationController.ensureActive(
        'style_recorder',
        'writing phase requires style context',
        120000,
      );
      break;
    case 'idle':
      activationController.deactivateAllExcept(['data_recorder']);
      break;
  }
}
