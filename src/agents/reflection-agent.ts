import type { AgentRequest, AgentResponse, IPCSAccessor } from './types';
import { BaseAgent, AgentId } from './types';
import { createAgentResponse, startTimer } from './base-agent';
import { generateReflection } from '@/runtime/reflection-types';
import type {
  ParagraphReflection,
  CoverageMap,
  ReflectionReport,
  ReflectionProblem,
} from '@/runtime/reflection-types';

/**
 * Reflection Agent — Sprint 3
 * After each node is drafted, generates:
 * 1. Paragraph-level reflection (thesis + arguments + questions)
 * 2. Coverage map (what's covered vs missing)
 * 3. Aggregated reflection report
 */
export class ReflectionAgent extends BaseAgent {
  readonly agentId: AgentId = 'reflection' as AgentId;

  constructor(pcs: IPCSAccessor) {
    super('reflection' as AgentId, pcs);
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const stop = startTimer();

    switch (request.action) {
      case 'reflect_node': {
        const payload = request.payload as { nodeId: string; content: string; goal: string };
        const reflection = generateReflection(payload.nodeId, payload.content, payload.goal);
        return createAgentResponse(this.agentId, 'reflect_node', {
          result: reflection,
          pcsMutations: [],
          nextActions: ['confirm_reflection'],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
      }

      case 'confirm_reflection': {
        const payload = request.payload as { nodeId: string; confirmed: boolean };
        // V1: store confirmation status
        return createAgentResponse(this.agentId, 'confirm_reflection', {
          result: { nodeId: payload.nodeId, confirmed: payload.confirmed },
          pcsMutations: [],
          nextActions: [],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
      }

      case 'build_coverage_map': {
        const snapshot = this.pcs.getSnapshot();
        const requiredTopics = snapshot.knowledge.required_topics;

        const coverageTopics = requiredTopics.map((t) => ({
          topic: t.topic,
          status: t.covered ? ('covered' as const) : ('missing' as const),
          relatedSection: t.section_id,
        }));

        const total = coverageTopics.length;
        const covered = coverageTopics.filter((t) => t.status === 'covered').length;
        const percentage = total > 0 ? Math.round((covered / total) * 100) : 100;

        const coverageMap: CoverageMap = {
          domain: snapshot.intent.purpose.value.slice(0, 50),
          requiredTopics: coverageTopics,
          coveragePercentage: percentage,
          missingTopics: coverageTopics.filter((t) => t.status === 'missing').map((t) => t.topic),
          weakTopics: [],
          generatedAt: new Date().toISOString(),
        };

        return createAgentResponse(this.agentId, 'build_coverage_map', {
          result: coverageMap,
          pcsMutations: [],
          nextActions: [],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
      }

      case 'build_report': {
        const payload = request.payload as {
          projectId: string;
          nodeReflections: ParagraphReflection[];
        };
        const snapshot = this.pcs.getSnapshot();

        // Build coverage map
        const requiredTopics = snapshot.knowledge.required_topics;
        const total = requiredTopics.length;
        const covered = requiredTopics.filter((t) => t.covered).length;

        const report: ReflectionReport = {
          projectId: payload.projectId,
          nodeReflections: payload.nodeReflections,
          coverage: {
            domain: snapshot.intent.purpose.value.slice(0, 50),
            requiredTopics: requiredTopics.map((t) => ({
              topic: t.topic,
              status: t.covered ? ('covered' as const) : ('missing' as const),
              relatedSection: t.section_id,
            })),
            coveragePercentage: total > 0 ? Math.round((covered / total) * 100) : 100,
            missingTopics: requiredTopics.filter((t) => !t.covered).map((t) => t.topic),
            weakTopics: [],
            generatedAt: new Date().toISOString(),
          },
          summary: {
            totalNodes: snapshot.structure.sections.length,
            nodesWithProblems: payload.nodeReflections.filter((r) => r.potentialProblem).length,
            nodesConfirmed: payload.nodeReflections.filter((r) => r.userConfirmed).length,
            averageConfidence:
              payload.nodeReflections.reduce((s, r) => s + r.confidence, 0) /
              Math.max(payload.nodeReflections.length, 1),
          },
          generatedAt: new Date().toISOString(),
        };

        return createAgentResponse(this.agentId, 'build_report', {
          result: report,
          pcsMutations: [],
          nextActions: [],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
      }

      default:
        return createAgentResponse(this.agentId, request.action, {
          result: null,
          pcsMutations: [],
          nextActions: [],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
    }
  }
}

// Re-export types for convenience
export type { ParagraphReflection, CoverageMap, ReflectionReport, ReflectionProblem };
