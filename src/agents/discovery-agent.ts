import type { AgentRequest, AgentResponse, IPCSAccessor } from './types';
import { BaseAgent, AgentId } from './types';
import { createAgentResponse, startTimer } from './base-agent';
import {
  UnderstandingManager,
  type NextAction,
  type UnderstandingState,
} from './understanding-state';
import { classifyProject, type ProjectClassification } from '@/discovery/project-classifier';
import { CREATIVE_TYPE_LABELS } from '@/runtime/creative-type-router';

/**
 * Creative Discovery Agent — replaces the old ClarificationAgent.
 *
 * Philosophy: "Understand first, ask later."
 * The agent analyzes the user's idea, builds a cognitive model,
 * and ONLY asks questions that resolve high-impact uncertainties.
 * It NEVER asks from a fixed list.
 */
export class DiscoveryAgent extends BaseAgent {
  readonly agentId: AgentId = 'discovery' as AgentId;
  private understanding: UnderstandingManager | null = null;
  private classification: ProjectClassification | null = null;

  constructor(pcs: IPCSAccessor) {
    super('discovery' as AgentId, pcs);
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const stop = startTimer();

    switch (request.action) {
      case 'initialize': {
        // Phase 0: User just gave their idea
        const payload = request.payload as { idea: string };
        const idea = payload.idea;

        // Step 1: Classify the project
        const classification = classifyProject(idea);
        this.classification = classification;
        const typeLabel = CREATIVE_TYPE_LABELS[classification.creativeType];

        // Step 2: Build initial understanding
        this.understanding = new UnderstandingManager({
          summary: `用户想创作一个${typeLabel.label}`,
          creativeType: classification.creativeType,
          confidence: classification.confidence,
        });

        // Step 3: Seed hypotheses and uncertainties based on creative type
        this.seedHypotheses(idea, classification);
        this.seedUncertainties(classification);

        // Step 4: Generate first action
        const firstAction = this.understanding.decideNextAction();

        return createAgentResponse(this.agentId, 'initialize', {
          result: {
            classification: {
              type: classification.creativeType,
              label: typeLabel.label,
              emoji: typeLabel.emoji,
              confidence: Math.round(classification.confidence * 100),
              maturity: classification.maturity,
              workflow: classification.workflow,
            },
            understanding: this.understanding.getSummary(),
            nextAction: firstAction,
            signals: this.extractSignals(idea),
          },
          pcsMutations: [],
          nextActions: firstAction.type === 'proceed' ? ['confirm_blueprint'] : ['ask_question'],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
      }

      case 'answer': {
        // User answered the last question
        if (!this.understanding) {
          return this.errorResponse('Not initialized', stop());
        }

        const payload = request.payload as {
          answer: string;
          questionAddressed?: string;
          field?: string;
        };

        // Record the user's answer as a fact
        this.understanding.addFact(payload.answer, payload.field);

        // Resolve the uncertainty that was being addressed
        if (payload.questionAddressed) {
          this.understanding.resolveUncertainty(payload.questionAddressed);
        }

        // Validate any hypotheses that match this answer
        this.validateMatchingHypotheses(payload.answer);

        // Decide next action
        const nextAction = this.understanding.decideNextAction();

        return createAgentResponse(this.agentId, 'answer', {
          result: {
            understanding: this.understanding.getSummary(),
            nextAction,
            factsCollected: this.understanding.getState().confirmedFacts.length,
          },
          pcsMutations: payload.field
            ? [
                {
                  fieldPath: payload.field,
                  proposedValue: payload.answer,
                  reason: `Discovery Agent: user confirmed ${payload.field}`,
                  trigger: 'manual',
                  confidence: 1.0,
                },
              ]
            : [],
          nextActions: nextAction.type === 'proceed' ? ['confirm_blueprint'] : ['ask_question'],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
      }

      case 'get_state': {
        // Return current understanding state (for CLI display)
        if (!this.understanding) {
          return this.errorResponse('Not initialized', stop());
        }
        return createAgentResponse(this.agentId, 'get_state', {
          result: {
            state: this.understanding.getState(),
            summary: this.understanding.getSummary(),
            classification: this.classification,
          },
          pcsMutations: [],
          nextActions: [],
          latency: stop(),
          llmCalls: 0,
          tokensUsed: 0,
        });
      }

      default:
        return this.errorResponse(`Unknown action: ${request.action}`, stop());
    }
  }

  // =========================================================================
  // Hypothesis Seeding
  // =========================================================================

  private seedHypotheses(idea: string, classification: ProjectClassification): void {
    if (!this.understanding) return;

    const type = classification.creativeType;

    if (type === 'fiction_novel' || type === 'short_story' || type === 'screenplay') {
      this.understanding.addHypothesis({
        hypothesis: '用户想创作虚构故事',
        confidence: 0.9,
        needsValidation: false,
      });
      this.understanding.addHypothesis({
        hypothesis: '故事主题涉及人与技术的关系',
        confidence: 0.5,
        validationQuestion: '这个故事的核心是探讨人与技术的关系，还是其他主题？',
        affectsField: 'intent.core_message',
      });
    }

    if (type === 'article' || type === 'research' || type === 'business_plan') {
      this.understanding.addHypothesis({
        hypothesis: '用户想创作非虚构内容',
        confidence: 0.9,
        needsValidation: false,
      });
      this.understanding.addHypothesis({
        hypothesis: '目标读者是行业相关人士',
        confidence: 0.4,
        validationQuestion: '你的目标读者是谁？专业人士还是普通读者？',
        affectsField: 'audience.audience_type',
      });
    }

    this.understanding.addHypothesis({
      hypothesis: `用户的创作动机是${classification.maturity === 'seed' ? '探索想法' : '完成具体作品'}`,
      confidence: 0.6,
      validationQuestion: '你创作这个作品的主要目的是什么？',
      affectsField: 'intent.purpose',
    });

    void idea; // Explicitly mark as used — reserved for future hypothesis seeding
  }

  private seedUncertainties(classification: ProjectClassification): void {
    if (!this.understanding) return;

    const type = classification.creativeType;

    // Fiction uncertainties
    if (type === 'fiction_novel' || type === 'short_story' || type === 'screenplay') {
      this.understanding.addUncertainty({
        question: '你的故事发生在什么样的世界？是近未来、架空世界、还是现实背景？',
        impact: 'critical',
        affectsDimensions: ['worldbuilding', 'tone', 'plot'],
        targetField: 'intent.purpose',
        askedCount: 0,
      });
      this.understanding.addUncertainty({
        question: '故事的主角是一个什么样的人？他的核心动机是什么？',
        impact: 'critical',
        affectsDimensions: ['character', 'plot', 'reader_connection'],
        targetField: 'audience.audience_type',
        askedCount: 0,
      });
      this.understanding.addUncertainty({
        question: '这个故事的冲突核心是什么？人对抗AI？人对抗命运？还是内心挣扎？',
        impact: 'high',
        affectsDimensions: ['theme', 'structure', 'ending'],
        targetField: 'intent.core_message',
        askedCount: 0,
      });
      this.understanding.addUncertainty({
        question: '你希望读者读完有什么感受？兴奋、思考、悲伤、还是希望？',
        impact: 'high',
        affectsDimensions: ['tone', 'style', 'ending'],
        targetField: 'expression.tone',
        askedCount: 0,
      });
    }

    // Article/Non-fiction uncertainties
    if (
      type === 'article' ||
      type === 'research' ||
      type === 'business_plan' ||
      type === 'course'
    ) {
      this.understanding.addUncertainty({
        question: '这篇文章的核心观点是什么？你能用一句话概括吗？',
        impact: 'critical',
        affectsDimensions: ['structure', 'thesis', 'evidence'],
        targetField: 'intent.core_message',
        askedCount: 0,
      });
      this.understanding.addUncertainty({
        question: '你的目标读者是谁？他们的知识水平如何？',
        impact: 'high',
        affectsDimensions: ['language', 'depth', 'examples'],
        targetField: 'audience.audience_type',
        askedCount: 0,
      });
      this.understanding.addUncertainty({
        question: '这篇文章最终想达到什么效果？说服、教育、还是启发？',
        impact: 'high',
        affectsDimensions: ['tone', 'structure', 'conclusion'],
        targetField: 'intent.desired_impact',
        askedCount: 0,
      });
    }

    // Scope uncertainty (common to all types)
    this.understanding.addUncertainty({
      question: '你计划写多长？这会决定结构设计的深度。',
      impact: 'medium',
      affectsDimensions: ['structure', 'detail_level'],
      targetField: 'constraint.length_min',
      askedCount: 0,
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private validateMatchingHypotheses(answer: string): void {
    if (!this.understanding) return;
    const state = this.understanding.getState();
    state.hypotheses.forEach((h, i) => {
      if (h.needsValidation && answer.includes(h.hypothesis.slice(0, 10))) {
        this.understanding!.validateHypothesis(i, answer);
      }
    });
  }

  private extractSignals(idea: string): string[] {
    const signals: string[] = [];
    const keywords = ['小说', '故事', '论文', '报告', '诗歌', '剧本', '教程', '课程', '计划'];
    for (const kw of keywords) {
      if (idea.includes(kw)) signals.push(kw);
    }
    return signals;
  }

  private errorResponse(message: string, latency: number): AgentResponse {
    return createAgentResponse(this.agentId, 'error', {
      result: { error: message },
      pcsMutations: [],
      nextActions: [],
      latency,
      llmCalls: 0,
      tokensUsed: 0,
    });
  }
}

// Re-export UnderstandingState types for consumers
export type { NextAction, UnderstandingState };
