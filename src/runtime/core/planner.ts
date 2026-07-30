import type { RuntimeState } from './runtime-state';
import { recordEvent } from './runtime-state';

export interface AgentDecision {
  /** Which agent to invoke */
  agent: 'discovery' | 'architect' | 'scribe' | 'review' | 'intake';
  /** What action to tell the agent */
  action: string;
  /** Why this agent was chosen */
  reason: string;
  /** What we expect from this invocation */
  expectedOutput: string;
  /** Confidence in this decision (0-1) */
  confidence: number;
}

/**
 * Plan: analyze the RuntimeState and decide the next agent to invoke.
 * This replaces the old fixed "Phase 1 → Phase 2 → Phase 3" workflow.
 */
export function planNextAction(state: RuntimeState): AgentDecision {
  // Rule 1: If intent is unclear, use Discovery Agent
  if (state.intent.confidence < 0.6 || state.mode.type === 'unknown') {
    return {
      agent: 'discovery',
      action: state.roundCount === 0 ? 'initialize' : 'ask_next',
      reason: `意图置信度 ${Math.round(state.intent.confidence * 100)}%，需要进一步确认`,
      expectedOutput: '用户创作意图的澄清',
      confidence: 0.9,
    };
  }

  // Rule 2: If there are critical unknowns, continue discovery
  const criticalUnknowns = state.understanding.unknowns.filter((u) => u.importance > 0.7);
  if (criticalUnknowns.length > 0 && state.phase === 'discovery') {
    return {
      agent: 'discovery',
      action: 'ask_next',
      reason: `还有 ${criticalUnknowns.length} 个关键未知待确认`,
      expectedOutput: '解决关键未知',
      confidence: 0.85,
    };
  }

  // Rule 3: If discovery is sufficient but no structure exists, call Architect
  if (state.understanding.confirmed.length >= 3 && state.phase === 'discovery') {
    recordEvent(state, {
      type: 'PHASE_TRANSITION',
      agent: 'planner',
      action: 'transition',
      result: 'discovery→planning',
    });
    state.phase = 'planning';
    return {
      agent: 'architect',
      action: 'generate_structure',
      reason: '已收集足够信息，进入结构设计',
      expectedOutput: '作品大纲结构',
      confidence: 0.8,
    };
  }

  // Rule 4: If structure exists but content is incomplete, call Scribe
  if (state.phase === 'planning' || state.phase === 'writing') {
    state.phase = 'writing';
    return {
      agent: 'scribe',
      action: 'generate',
      reason: '结构已就绪，开始内容生成',
      expectedOutput: '节点内容',
      confidence: 0.85,
    };
  }

  // Rule 5: If content is complete, call Review
  if (state.phase === 'review') {
    return {
      agent: 'review',
      action: 'review',
      reason: '内容完成，进入审查',
      expectedOutput: '审查报告',
      confidence: 0.9,
    };
  }

  // Default: continue with Discovery
  return {
    agent: 'discovery',
    action: 'ask_next',
    reason: '默认：持续推进理解',
    expectedOutput: '下一步理解',
    confidence: 0.6,
  };
}
