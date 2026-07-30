/**
 * SculptorRuntime — the Agent Orchestration Kernel.
 *
 * OBSERVE → UNDERSTAND → PLAN → ACT → EVALUATE → UPDATE
 *
 * This is the "brain" that replaces the old fixed workflow.
 * Every agent invocation goes through this loop.
 */

import type { RuntimeState, RuntimePhase } from './runtime-state';
import { createRuntimeState, recordEvent, getStateSummary } from './runtime-state';
import { observe } from './observer';
import { planNextAction, type AgentDecision } from './planner';
import { evaluate, type Evaluation } from './evaluator';
import { ProjectMemoryStore } from './project-memory';
import { AgentMemoryStore } from './agent-memory';
import { DiscoveryAgent } from '@/agents/discovery-agent';
import { ArchitectAgent } from '@/agents/architect-agent';
import { ScribeAgent } from '@/agents/scribe-agent';
import { ReviewEngine } from '@/agents/review-engine';
import { IntakeAgent } from '@/agents/intake-agent';
import type { IPCSAccessor, AgentResponse, AgentRequest } from '@/agents/types';
import type { PCSPhase } from '@/pcs/types';

export interface RuntimeStep {
  phase: string;
  decision: AgentDecision;
  result: unknown;
  evaluation: Evaluation;
  stateSummary: string;
}

export class SculptorRuntime {
  private state: RuntimeState;
  private pcs: IPCSAccessor;
  private trace: RuntimeStep[] = [];
  private debug = true;

  constructor(idea: string, pcs: IPCSAccessor) {
    this.state = createRuntimeState(idea);
    this.pcs = pcs;
  }

  /** Run one cycle of the O-U-P-A-E-U loop */
  async step(
    input: string,
  ): Promise<{ decision: AgentDecision; result: unknown; stateSummary: string }> {
    // 1. OBSERVE
    const observation = observe(input, this.state);
    this.log('OBSERVE', `Type: ${observation.type} | "${input.slice(0, 40)}"`);

    // 2. UNDERSTAND (update state with observation)
    if (observation.type === 'idea' && observation.extracted?.creativeType) {
      this.state.mode.type = observation.extracted.creativeType as never;
      this.state.mode.confidence = 0.6;
    }
    this.log('UNDERSTAND', getStateSummary(this.state));

    // 3. PLAN
    const decision = planNextAction(this.state);
    this.log('PLAN', `${decision.agent}.${decision.action} — ${decision.reason}`);
    recordEvent(this.state, { type: 'PLANNED', agent: decision.agent, action: decision.action });

    // 4. ACT
    const result = await this.executeAgent(decision);
    this.log('ACT', `${decision.agent}.${decision.action} → done`);

    // 5. EVALUATE
    const evaluation = evaluate(this.state, decision.agent, decision.action, result);
    this.log('EVALUATE', `${evaluation.success ? '✓' : '✗'} ${evaluation.changes.join(', ')}`);

    // 6. UPDATE
    ProjectMemoryStore.incrementRounds(this.state.sessionId);
    AgentMemoryStore.recordExecution({
      agentId: decision.agent,
      action: decision.action,
      success: evaluation.success,
      latency: 0,
    });

    // Save step to trace
    this.trace.push({
      phase: this.state.phase,
      decision,
      result,
      evaluation,
      stateSummary: getStateSummary(this.state),
    });

    return { decision, result, stateSummary: getStateSummary(this.state) };
  }

  /** Execute an agent based on the planner's decision */
  private async executeAgent(decision: AgentDecision): Promise<unknown> {
    const request: AgentRequest = {
      agentId: decision.agent,
      phase: mapToPCSPhase(this.state.phase),
      action: decision.action,
      payload: { idea: this.state.intent.raw },
      pcsSnapshot: this.pcs.getSnapshot(),
    };

    let agent;
    switch (decision.agent) {
      case 'discovery':
        agent = new DiscoveryAgent(this.pcs);
        break;
      case 'architect':
        agent = new ArchitectAgent(this.pcs);
        break;
      case 'scribe':
        agent = new ScribeAgent(this.pcs);
        break;
      case 'review':
        agent = new ReviewEngine(this.pcs);
        break;
      case 'intake':
        agent = new IntakeAgent(this.pcs);
        break;
      default:
        return { error: `Unknown agent: ${decision.agent}` };
    }

    const response: AgentResponse = await agent.execute(request);
    return response.result;
  }

  /** Check if the runtime should continue */
  shouldContinue(): boolean {
    return this.state.phase !== 'publish' && this.state.roundCount < 50;
  }

  /** Get current state */
  getState(): RuntimeState {
    return this.state;
  }

  /** Get full execution trace */
  getTrace(): RuntimeStep[] {
    return [...this.trace];
  }

  /** Get trace summary for display */
  getTraceSummary(): string {
    return this.trace
      .map(
        (s) =>
          `[${s.phase}] ${s.decision.agent}.${s.decision.action} → ${s.evaluation.changes.join(', ')}`,
      )
      .join('\n');
  }

  /** Enable/disable debug logging */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  private log(label: string, detail: string): void {
    if (this.debug) console.log(`  🔍 [${label}] ${detail}`);
  }
}

/** Map RuntimePhase to PCSPhase for AgentRequest compatibility */
function mapToPCSPhase(rp: RuntimePhase): PCSPhase {
  const map: Record<RuntimePhase, PCSPhase> = {
    discovery: 'clarifying',
    planning: 'structured',
    writing: 'executing',
    revision: 'executing',
    review: 'reviewing',
    publish: 'completed',
  };
  return map[rp];
}
