// ---------------------------------------------------------------------------
// Sculptor V1 — Clarification Agent (Phase 1: clarifying)
//
// Runs the context-gap-analyzer to find ambiguous/missing PCS fields, then
// generates targeted clarification questions via LLM. Can also confirm
// fields and produce a constraint summary.
// ---------------------------------------------------------------------------

import { BaseAgent } from './types';
import { createAgentResponse, startTimer } from './base-agent';
import type { AgentRequest, AgentResponse, IPCSAccessor, ProposalMutation } from './types';
import { LLMClient } from '@/lib/llm-client';
import { AlgorithmRunner } from '@/lib/algorithm-runner';
import { analyzeGaps } from '@/algorithms/context-gap-analyzer';
import type { GapAnalysisResult } from '@/algorithms/context-gap-analyzer';
import { evaluateConstraints } from '@/algorithms/sub-question-constraint';
import type { QuestionContext } from '@/algorithms/sub-question-constraint';
import { CLARIFY_OPTIONS_PROMPT, CLARIFY_SUMMARY_PROMPT } from '@/prompts/clarification-agent';
import type { PCSState } from '@/pcs/types';
import { promptRegistry } from '@/prompts/registry';

// ---------------------------------------------------------------------------
// Shared instances
// ---------------------------------------------------------------------------

const llmClient = new LLMClient();
const algorithmRunner = new AlgorithmRunner();

// ---------------------------------------------------------------------------
// ClarificationAgent
// ---------------------------------------------------------------------------

export class ClarificationAgent extends BaseAgent {
  constructor(pcs: IPCSAccessor) {
    super('clarification', pcs);
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const stop = startTimer();
    const action = request.action;
    const snapshot = request.pcsSnapshot;

    switch (action) {
      // ── analyze_gaps ──────────────────────────────────────────────
      case 'analyze_gaps': {
        const focusDimension = typeof request.payload === 'string' ? request.payload : undefined;

        const gapResult = await algorithmRunner.run<GapAnalysisResult[]>(
          { name: 'context-gap-analyzer' },
          () => Promise.resolve(analyzeGaps(snapshot, focusDimension)),
        );

        const gaps = gapResult.success && gapResult.data ? gapResult.data : [];
        const allQuestions = gaps.flatMap((g) => g.suggestedQuestions);

        // Build sub-question constraint context from accumulated Q&A
        const qc: QuestionContext = {
          dimension: focusDimension ?? 'all',
          attemptCount: 0,
          userResponses: [],
          originalQuestion: allQuestions[0] ?? '',
          informationGain: 0.5,
        };
        const constraintResult = evaluateConstraints(qc);

        const latency = stop();
        return createAgentResponse('clarification', action, {
          result: {
            gaps,
            questions: allQuestions,
            shouldContinue: constraintResult.shouldContinue,
            suggestedAction: constraintResult.suggestedAction,
          },
          nextActions: constraintResult.shouldContinue ? ['ask_user'] : ['summarize'],
          latency,
        });
      }

      // ── confirm_field ─────────────────────────────────────────────
      case 'confirm_field': {
        const payload = request.payload as Record<string, unknown> | null;
        const fieldPath = typeof payload?.['fieldPath'] === 'string' ? payload['fieldPath'] : '';
        const value = payload?.['value'];

        const mutations: ProposalMutation[] = [];
        if (fieldPath.length > 0) {
          mutations.push({
            fieldPath,
            proposedValue: value,
            reason: 'User confirmed field value during clarification',
            trigger: 'manual',
            confidence: 1.0,
          });
        }

        const latency = stop();
        return createAgentResponse('clarification', action, {
          result: { confirmed: fieldPath, value },
          pcsMutations: mutations,
          nextActions: ['analyze_gaps'],
          latency,
        });
      }

      // ── summarize ─────────────────────────────────────────────────
      case 'summarize': {
        let llmCalls = 0;
        let tokensUsed = 0;
        let summary: unknown = null;

        try {
          const pcsSummary = summarizePCSForPrompt(snapshot);
          const systemPrompt = CLARIFY_SUMMARY_PROMPT.systemPrompt ?? '';
          const prompt = CLARIFY_SUMMARY_PROMPT.template.replace('{{pcs_summary}}', pcsSummary);

          const response = await llmClient.complete({
            prompt,
            systemPrompt,
            responseFormat: 'json',
            maxTokens: CLARIFY_SUMMARY_PROMPT.maxTokens,
          });

          llmCalls = 1;
          tokensUsed = response.usage.totalTokens;
          summary = response.json;
        } catch {
          // Fallback: rule-based summary
          summary = buildFallbackSummary(snapshot);
        }

        const latency = stop();
        return createAgentResponse('clarification', action, {
          result: { summary },
          nextActions: ['generate_structure'],
          latency,
          llmCalls,
          tokensUsed,
        });
      }

      // ── generate_options ────────────────────────────────────────────
      case 'generate_options': {
        const userTopic = (request.payload as { topic?: string } | null) ?? { topic: '' };
        let llmCalls = 0;
        let tokensUsed = 0;
        let options: Record<string, { options: string[]; recommended: number }> | null = null;

        try {
          // Register template so the registry can resolve it
          promptRegistry.register(CLARIFY_OPTIONS_PROMPT);

          const rendered = promptRegistry.render('clarify-options', {
            user_topic: userTopic.topic ?? '',
            pcs_context: this.assembleContext(2),
          });

          const response = await llmClient.complete({
            prompt: rendered.prompt,
            systemPrompt: rendered.systemPrompt,
            responseFormat: 'json',
            temperature: 0.7,
          });

          options = response.json as Record<string, { options: string[]; recommended: number }>;
          llmCalls = 1;
          tokensUsed = response.usage.totalTokens;
        } catch {
          // Fallback: return hardcoded common options
          options = getFallbackOptions();
        }

        const latency = stop();
        return createAgentResponse('clarification', action, {
          result: options,
          pcsMutations: [],
          nextActions: ['collect_field'],
          latency,
          llmCalls,
          tokensUsed,
        });
      }

      default:
        return createAgentResponse('clarification', action, {
          result: { error: `Unknown action: ${action}` },
          latency: stop(),
        });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizePCSForPrompt(state: PCSState): string {
  const parts: string[] = [];
  parts.push(`写作目的: ${state.intent.purpose.value || '(未设置)'}`);
  parts.push(`核心信息: ${state.intent.core_message.value || '(未设置)'}`);
  parts.push(`读者类型: ${state.audience.audience_type.value || '(未设置)'}`);
  parts.push(`内容类型: ${state.constraint.type.value || '(未设置)'}`);
  parts.push(`发布平台: ${state.constraint.platform.value || '(未设置)'}`);
  parts.push(`语气: ${state.expression.tone.value || '(未设置)'}`);
  return parts.join('\n');
}

function buildFallbackSummary(state: PCSState): Record<string, unknown> {
  const confirmed: Array<{ field: string; value: string; source: string }> = [];
  const assumed: Array<{ field: string; value: string; basis: string; confidence: number }> = [];
  const gaps: Array<{ field: string; reason: string; priority: string }> = [];

  const checkField = (fieldPath: string, value: unknown, status: string, label: string): void => {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (status === 'confirmed' || status === 'locked') {
      confirmed.push({
        field: fieldPath,
        value: strValue,
        source: status === 'locked' ? 'system' : 'user',
      });
    } else if (status === 'assumed' || status === 'proposed') {
      assumed.push({ field: fieldPath, value: strValue, basis: 'inference', confidence: 0.5 });
    } else {
      gaps.push({ field: fieldPath, reason: `「${label}」尚未设置`, priority: 'high' });
    }
  };

  checkField('intent.purpose', state.intent.purpose.value, state.intent.purpose.status, '写作目的');
  checkField(
    'intent.core_message',
    state.intent.core_message.value,
    state.intent.core_message.status,
    '核心信息',
  );
  checkField(
    'audience.audience_type',
    state.audience.audience_type.value,
    state.audience.audience_type.status,
    '读者类型',
  );
  checkField(
    'constraint.type',
    state.constraint.type.value,
    state.constraint.type.status,
    '内容类型',
  );
  checkField(
    'constraint.platform',
    state.constraint.platform.value,
    state.constraint.platform.status,
    '发布平台',
  );

  const total = confirmed.length + assumed.length + gaps.length;
  return {
    confirmed,
    assumed,
    gaps,
    overall_completeness: total > 0 ? Math.round((confirmed.length / total) * 100) / 100 : 0,
    summary_text: `已确认 ${confirmed.length} 项，推断 ${assumed.length} 项，仍有 ${gaps.length} 项缺口。`,
  };
}

/**
 * Return hardcoded fallback options for the Creative Brief form
 * when the LLM is unavailable or the call fails.
 */
function getFallbackOptions(): Record<string, { options: string[]; recommended: number }> {
  return {
    purpose: {
      options: ['普及知识', '分享观点', '引发讨论', '提供方案', '讲述故事'],
      recommended: 0,
    },
    core_message: {
      options: ['核心观点尚未确定，请手动填写'],
      recommended: 0,
    },
    tone: {
      options: ['专业严谨', '轻松幽默', '平实叙述', '文艺优美', '犀利直接'],
      recommended: 0,
    },
    style_reference: {
      options: ['经济学人', '得到APP', '人民日报评论', '鲁迅杂文', '纽约时报'],
      recommended: 0,
    },
    audience_type: {
      options: ['行业从业者', '普通大众', '学生群体', '决策者/管理者', '技术专家'],
      recommended: 0,
    },
    format: {
      options: ['公众号文章', '学术论文', '商业报告', '演讲稿', '专栏长文'],
      recommended: 0,
    },
    length: {
      options: ['1000字以内', '2000-3000字', '5000字以上', '10000字以内'],
      recommended: 1,
    },
    success_definition: {
      options: ['读者理解核心观点', '引发广泛转发', '获得专业认可', '促进实际行动'],
      recommended: 0,
    },
  };
}
