import { describe, it, expect, beforeEach } from 'vitest';
import { AgentBus } from '@/agents/cluster/agent-bus';
import type { AgentRole } from '@/agents/cluster/agent-bus';

describe('AgentBus', () => {
  let bus: AgentBus;

  beforeEach(() => {
    bus = new AgentBus();
  });

  describe('emit and on', () => {
    it('delivers events to subscribers', async () => {
      const received: unknown[] = [];
      bus.on('user_input_received', (event) => {
        received.push(event);
      });

      await bus.emit({
        type: 'user_input_received',
        source: 'question_agent',
        payload: { text: 'hello' },
        priority: 'medium',
      });

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveProperty('type', 'user_input_received');
    });

    it('does not deliver to unsubscribed handlers', async () => {
      let called = false;
      const handler = () => {
        called = true;
      };
      bus.on('user_input_received', handler);
      bus.off('user_input_received', handler);

      await bus.emit({
        type: 'user_input_received',
        source: 'question_agent',
        payload: {},
        priority: 'low',
      });

      expect(called).toBe(false);
    });

    it('delivers to multiple subscribers', async () => {
      let count = 0;
      bus.on('question_generated', () => {
        count++;
      });
      bus.on('question_generated', () => {
        count++;
      });

      await bus.emit({
        type: 'question_generated',
        source: 'question_agent',
        payload: {},
        priority: 'medium',
      });

      expect(count).toBe(2);
    });
  });

  describe('activation system', () => {
    it('activateAgent makes agent active', () => {
      bus.activateAgent('style_recorder');
      expect(bus.isActive('style_recorder')).toBe(true);
    });

    it('deactivateAgent makes agent inactive', () => {
      bus.activateAgent('data_recorder');
      bus.deactivateAgent('data_recorder');
      expect(bus.isActive('data_recorder')).toBe(false);
    });

    it('TTL expires agent after delay', async () => {
      bus.activateAgent('style_recorder', 1);
      // Initially still active before TTL expires
      expect(bus.isActive('style_recorder')).toBe(true);
      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(bus.isActive('style_recorder')).toBe(false);
    });
  });

  describe('shared memory', () => {
    it('getMemory returns initial state with correct dimensions', () => {
      const mem = bus.getMemory();
      expect(mem.styleVectors.personalDataset).toHaveLength(512);
      expect(mem.styleVectors.writingDeviation).toHaveLength(128);
    });

    it('updateMemory modifies shared state', () => {
      bus.updateMemory({
        styleVectors: {
          personalDataset: new Array(512).fill(0.5),
          writingDeviation: new Array(128).fill(0),
          attentionFocus: new Map(),
        },
      });
      const mem = bus.getMemory();
      expect(mem.styleVectors.personalDataset[0]).toBe(0.5);
    });
  });

  describe('event log', () => {
    it('records emitted events', async () => {
      await bus.emit({
        type: 'user_input_received',
        source: 'question_agent',
        payload: {},
        priority: 'low',
      });

      const events = bus.queryEvents({ type: 'user_input_received' });
      expect(events).toHaveLength(1);
    });

    it('queryEvents filters by type', async () => {
      await bus.emit({
        type: 'writing_session_started',
        source: 'writing_agent' as AgentRole,
        payload: {},
        priority: 'medium',
      });
      await bus.emit({
        type: 'user_input_received',
        source: 'question_agent' as AgentRole,
        payload: {},
        priority: 'medium',
      });

      const writingEvents = bus.queryEvents({ type: 'writing_session_started' });
      expect(writingEvents).toHaveLength(1);
      expect(writingEvents[0].source).toBe('writing_agent');

      const userEvents = bus.queryEvents({ type: 'user_input_received' });
      expect(userEvents).toHaveLength(1);
    });

    it('queryEvents filters by source', async () => {
      await bus.emit({
        type: 'writing_session_started',
        source: 'writing_agent' as AgentRole,
        payload: {},
        priority: 'medium',
      });
      await bus.emit({
        type: 'user_input_received',
        source: 'question_agent' as AgentRole,
        payload: {},
        priority: 'medium',
      });

      const events = bus.queryEvents({ source: 'writing_agent' as AgentRole });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('writing_session_started');
    });
  });
});
