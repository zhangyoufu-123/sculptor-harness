// ---------------------------------------------------------------------------
// Sculptor V1 — Review Engine (Phase 4→5: reviewing)
//
// Runs a multi-dimensional quality review of the completed work against the
// original creative intent, all constraints, knowledge requirements, and
// structural plan. Produces a ReviewReport that gates progression to
// the `completed` phase.
// ---------------------------------------------------------------------------

import { BaseAgent } from './types';
import { createAgentResponse, startTimer } from './base-agent';
import type { AgentRequest, AgentResponse, IPCSAccessor } from './types';
import { LLMClient } from '@/lib/llm-client';
import { AlgorithmRunner } from '@/lib/algorithm-runner';
import { checkConstraints } from '@/algorithms/constraint-checker';
import { REVIEW_CHECKLIST_PROMPT } from '@/prompts/review-engine';
import type { PCSState, ReviewReport, ReviewIssue, ReviewDimension } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Shared instances
// ---------------------------------------------------------------------------

const llmClient = new LLMClient();
const algorithmRunner = new AlgorithmRunner();

// ---------------------------------------------------------------------------
// ReviewEngine
// ---------------------------------------------------------------------------

export class ReviewEngine extends BaseAgent {
  constructor(pcs: IPCSAccessor) {
    super('review', pcs);
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const stop = startTimer();
    const action = request.action;
    const snapshot = request.pcsSnapshot;

    switch (action) {
      // ── review ────────────────────────────────────────────────────
      case 'review': {
        const fullContent = assembleFullContent(snapshot);

        // Run all five consistency checks
        const [intentResult, knowledgeResult, constraintResult, expressionResult, structureResult] =
          await Promise.all([
            algorithmRunner.run({ name: 'review-intent-satisfaction' }, () =>
              Promise.resolve(checkIntentSatisfaction(snapshot, fullContent)),
            ),
            algorithmRunner.run({ name: 'review-knowledge-coverage' }, () =>
              Promise.resolve(checkKnowledgeCoverage(snapshot, fullContent)),
            ),
            algorithmRunner.run({ name: 'review-constraint-compliance' }, () =>
              checkConstraintCompliance(snapshot, fullContent),
            ),
            algorithmRunner.run({ name: 'review-expression-consistency' }, () =>
              Promise.resolve(checkExpressionConsistency(snapshot, fullContent)),
            ),
            algorithmRunner.run({ name: 'review-structure-completeness' }, () =>
              Promise.resolve(checkStructureCompleteness(snapshot, fullContent)),
            ),
          ]);

        // Collect all issues
        const allIssues: ReviewIssue[] = [];
        const dimensionResults: Array<{
          name: ReviewDimension;
          label: string;
          score: number;
          passed: boolean;
          issues: ReviewIssue[];
        }> = [];

        const addDimension = (
          name: ReviewDimension,
          label: string,
          issues: ReviewIssue[],
        ): void => {
          allIssues.push(...issues);
          const blockingCount = issues.filter((i) => i.severity === 'blocking').length;
          const warningCount = issues.filter((i) => i.severity === 'warning').length;
          const passCount = issues.filter((i) => i.severity === 'pass').length;
          const total = issues.length;
          const score = total > 0 ? (passCount * 1.0 + warningCount * 0.5) / total : 1.0;

          dimensionResults.push({
            name,
            label,
            score: Math.round(score * 100) / 100,
            passed: blockingCount === 0,
            issues,
          });
        };

        const fallbackIntent: ReviewIssue[] = [
          {
            id: 'err-intent',
            dimension: 'intent_satisfaction',
            severity: 'blocking',
            description: '意图满足度检查失败',
          },
        ];
        const fallbackKnowledge: ReviewIssue[] = [
          {
            id: 'err-knowledge',
            dimension: 'knowledge_coverage',
            severity: 'blocking',
            description: '知识覆盖度检查失败',
          },
        ];
        const fallbackConstraint: ReviewIssue[] = [
          {
            id: 'err-constraint',
            dimension: 'constraint_compliance',
            severity: 'blocking',
            description: '约束合规度检查失败',
          },
        ];
        const fallbackExpression: ReviewIssue[] = [
          {
            id: 'err-expression',
            dimension: 'expression_consistency',
            severity: 'blocking',
            description: '表达一致性检查失败',
          },
        ];
        const fallbackStructure: ReviewIssue[] = [
          {
            id: 'err-structure',
            dimension: 'structure_completeness',
            severity: 'blocking',
            description: '结构完整度检查失败',
          },
        ];

        addDimension(
          'intent_satisfaction',
          '意图满足度',
          intentResult.success ? (intentResult.data ?? fallbackIntent) : fallbackIntent,
        );
        addDimension(
          'knowledge_coverage',
          '知识覆盖度',
          knowledgeResult.success ? (knowledgeResult.data ?? fallbackKnowledge) : fallbackKnowledge,
        );
        addDimension(
          'constraint_compliance',
          '约束合规度',
          constraintResult.success
            ? (constraintResult.data ?? fallbackConstraint)
            : fallbackConstraint,
        );
        addDimension(
          'expression_consistency',
          '表达一致性',
          expressionResult.success
            ? (expressionResult.data ?? fallbackExpression)
            : fallbackExpression,
        );
        addDimension(
          'structure_completeness',
          '结构完整度',
          structureResult.success ? (structureResult.data ?? fallbackStructure) : fallbackStructure,
        );

        // Build ReviewReport
        const reviewReport: ReviewReport = {
          id: `review-${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
          phase: 'reviewing',
          issues: allIssues,
          summary: {
            total: allIssues.length,
            blocking: allIssues.filter((i) => i.severity === 'blocking').length,
            warning: allIssues.filter((i) => i.severity === 'warning').length,
            pass: allIssues.filter((i) => i.severity === 'pass').length,
          },
        };

        // Try LLM-powered review for richer analysis
        let llmCalls = 0;
        let tokensUsed = 0;
        let llmReviewResult: unknown = null;

        try {
          const variables: Record<string, unknown> = {
            full_content: fullContent,
            intent_summary: buildIntentSummary(snapshot),
            knowledge_summary: buildKnowledgeSummary(snapshot),
            constraint_summary: buildConstraintSummary(snapshot),
            expression_summary: buildExpressionSummary(snapshot),
            structure_summary: buildStructureSummary(snapshot),
          };

          const systemPrompt = REVIEW_CHECKLIST_PROMPT.systemPrompt ?? '';
          let prompt = REVIEW_CHECKLIST_PROMPT.template;
          for (const [key, val] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
          }

          const response = await llmClient.complete({
            prompt,
            systemPrompt,
            responseFormat: 'json',
            maxTokens: REVIEW_CHECKLIST_PROMPT.maxTokens,
          });

          llmCalls = 1;
          tokensUsed = response.usage.totalTokens;
          llmReviewResult = response.json;
        } catch {
          // LLM review unavailable — rule-based results are sufficient
        }

        const approved = reviewReport.summary.blocking === 0;
        const latency = stop();

        return createAgentResponse('review', action, {
          result: {
            report: reviewReport,
            dimensions: dimensionResults,
            llmReview: llmReviewResult,
            approved,
          },
          nextActions: approved ? ['export'] : ['revise'],
          latency,
          llmCalls,
          tokensUsed,
        });
      }

      // ── export ────────────────────────────────────────────────────
      case 'export': {
        const fullContent = assembleFullContent(snapshot);
        const format = snapshot.constraint.format.value || 'markdown';

        let exported = fullContent;
        if (format === 'plain-text') {
          exported = stripMarkdown(fullContent);
        }

        const latency = stop();
        return createAgentResponse('review', action, {
          result: {
            exported,
            format,
            length: exported.length,
            sectionCount: snapshot.structure.sections.length,
          },
          nextActions: ['complete'],
          latency,
        });
      }

      default:
        return createAgentResponse('review', action, {
          result: { error: `Unknown action: ${action}` },
          latency: stop(),
        });
    }
  }
}

// ---------------------------------------------------------------------------
// Five-dimension consistency checks (V1: rule-based)
// ---------------------------------------------------------------------------

let issueCounter = 0;
function nextIssueId(): string {
  issueCounter += 1;
  return `ri-${Date.now().toString(36)}-${issueCounter}`;
}

function tokenize(text: string): string[] {
  return text
    .split(/[，,。！？、；：\s.!?;:\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

// 1. Intent Satisfaction
function checkIntentSatisfaction(state: PCSState, content: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const coreMessage = state.intent.core_message.value;

  if (!coreMessage || coreMessage.trim().length === 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'intent_satisfaction',
      severity: 'warning',
      description: '核心信息未设置，无法检查意图满足度。',
    });
    return issues;
  }

  const coreTokens = tokenize(coreMessage);
  const contentTokens = tokenize(content);
  const contentSet = new Set(contentTokens.map((t) => t.toLowerCase()));
  const covered = coreTokens.filter((t) => contentSet.has(t.toLowerCase()));
  const coverage = coreTokens.length > 0 ? covered.length / coreTokens.length : 0;

  if (coverage >= 0.8) {
    issues.push({
      id: nextIssueId(),
      dimension: 'intent_satisfaction',
      severity: 'pass',
      description: `核心信息覆盖率 ${Math.round(coverage * 100)}%，意图满足度良好。`,
    });
  } else if (coverage >= 0.5) {
    issues.push({
      id: nextIssueId(),
      dimension: 'intent_satisfaction',
      severity: 'warning',
      description: `核心信息覆盖率 ${Math.round(coverage * 100)}%，部分意图未充分表达。`,
      suggestion:
        '检查以下关键词是否被覆盖：' +
        coreTokens.filter((t) => !contentSet.has(t.toLowerCase())).join('、'),
    });
  } else {
    issues.push({
      id: nextIssueId(),
      dimension: 'intent_satisfaction',
      severity: 'blocking',
      description: `核心信息覆盖率仅 ${Math.round(coverage * 100)}%，意图未充分传达。`,
      suggestion: '建议重写以确保核心信息在文中得到充分阐述。',
    });
  }

  return issues;
}

// 2. Knowledge Coverage
function checkKnowledgeCoverage(state: PCSState, content: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const requiredTopics = state.knowledge.required_topics;
  const missingInfo = state.knowledge.missing_information;

  if (requiredTopics.length === 0 && missingInfo.length === 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'knowledge_coverage',
      severity: 'pass',
      description: '无知识覆盖要求或所有知识点已覆盖。',
    });
    return issues;
  }

  let uncoveredCount = 0;
  for (const rt of requiredTopics) {
    if (!rt.covered && !content.toLowerCase().includes(rt.topic.toLowerCase())) {
      uncoveredCount += 1;
    }
  }

  if (uncoveredCount === 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'knowledge_coverage',
      severity: 'pass',
      description: `所有 ${requiredTopics.length} 个知识点均已覆盖。`,
    });
  } else {
    issues.push({
      id: nextIssueId(),
      dimension: 'knowledge_coverage',
      severity: uncoveredCount > 2 ? 'blocking' : 'warning',
      description: `有 ${uncoveredCount} 个必要知识点未被覆盖。`,
      suggestion:
        '请补充以下知识点：' +
        requiredTopics
          .filter((rt) => !rt.covered && !content.toLowerCase().includes(rt.topic.toLowerCase()))
          .map((rt) => rt.topic)
          .join('、'),
    });
  }

  return issues;
}

// 3. Constraint Compliance (delegates to constraint-checker)
async function checkConstraintCompliance(state: PCSState, content: string): Promise<ReviewIssue[]> {
  // Aggregate section-level constraint checks
  const allIssues: ReviewIssue[] = [];

  for (const section of state.structure.sections) {
    const result = checkConstraints(section.content_draft || content, state, section.id);
    // Remap expression_consistency dimension to constraint_compliance
    const remapped = result.issues.map((issue) => ({
      ...issue,
      dimension: 'constraint_compliance' as ReviewDimension,
    }));
    allIssues.push(...remapped);
  }

  // Global constraint check
  const globalResult = checkConstraints(content, state, 'global');
  const globalRemapped = globalResult.issues.map((issue) => ({
    ...issue,
    dimension: 'constraint_compliance' as ReviewDimension,
  }));
  allIssues.push(...globalRemapped);

  if (allIssues.length === 0) {
    allIssues.push({
      id: nextIssueId(),
      dimension: 'constraint_compliance',
      severity: 'pass',
      description: '所有约束合规检查通过。',
    });
  }

  return allIssues;
}

// 4. Expression Consistency
function checkExpressionConsistency(state: PCSState, content: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const avoidList: string[] = state.expression.avoid.value;

  // Check avoid list
  const violations: string[] = [];
  for (const term of avoidList) {
    if (term.length > 0 && content.includes(term)) {
      violations.push(term);
    }
  }

  if (violations.length > 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'expression_consistency',
      severity: 'blocking',
      description: `内容包含 ${violations.length} 个禁止项：${violations.join('、')}`,
      suggestion: '请移除或替换上述禁止项。',
    });
  }

  // Check tone consistency (simple heuristic: paragraph length variation)
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 3) {
    const lengths = paragraphs.map((p) => p.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const maxDev = Math.max(...lengths.map((l) => Math.abs(l - avg)));
    if (maxDev > avg * 2) {
      issues.push({
        id: nextIssueId(),
        dimension: 'expression_consistency',
        severity: 'warning',
        description: '段落长度差异较大，表达节奏可能不一致。',
        suggestion: '建议统一段落长度以保持表达节奏稳定。',
      });
    }
  }

  if (issues.length === 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'expression_consistency',
      severity: 'pass',
      description: '表达一致性检查通过。',
    });
  }

  return issues;
}

// 5. Structure Completeness
function checkStructureCompleteness(state: PCSState, _content: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const sections = state.structure.sections;

  if (sections.length === 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'structure_completeness',
      severity: 'blocking',
      description: '文章结构为空，尚未生成大纲。',
    });
    return issues;
  }

  const emptySections = sections.filter(
    (s) => !s.content_draft || s.content_draft.trim().length === 0,
  );
  const incompleteSections = sections.filter(
    (s) => s.draft_state !== 'approved' && s.draft_state !== 'locked',
  );

  if (emptySections.length > 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'structure_completeness',
      severity: 'blocking',
      description: `有 ${emptySections.length} 个章节内容为空：${emptySections.map((s) => s.title).join('、')}`,
      suggestion: '请为所有空章节生成内容。',
    });
  }

  if (incompleteSections.length > 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'structure_completeness',
      severity: 'warning',
      description: `有 ${incompleteSections.length} 个章节尚未完成审核：${incompleteSections.map((s) => s.title).join('、')}`,
    });
  }

  if (issues.length === 0) {
    issues.push({
      id: nextIssueId(),
      dimension: 'structure_completeness',
      severity: 'pass',
      description: '所有章节已完成并通过审核。',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assembleFullContent(state: PCSState): string {
  const parts: string[] = [];
  for (const section of state.structure.sections) {
    if (section.content_draft && section.content_draft.trim().length > 0) {
      parts.push(`## ${section.title}\n\n${section.content_draft}`);
    }
  }
  return parts.join('\n\n');
}

function buildIntentSummary(state: PCSState): string {
  return [
    `目的: ${state.intent.purpose.value || '未指定'}`,
    `核心信息: ${state.intent.core_message.value || '未指定'}`,
    `预期影响: ${state.intent.desired_impact.value || '未指定'}`,
    `目标情感: ${state.intent.target_emotion.value || '未指定'}`,
  ].join('\n');
}

function buildKnowledgeSummary(state: PCSState): string {
  const topics = state.knowledge.required_topics;
  if (topics.length === 0) return '无特定知识要求。';
  return topics
    .map((t) => `- ${t.topic} [${t.covered ? '已覆盖' : '未覆盖'}] (章节: ${t.section_id})`)
    .join('\n');
}

function buildConstraintSummary(state: PCSState): string {
  return [
    `类型: ${state.constraint.type.value || '未指定'}`,
    `平台: ${state.constraint.platform.value || '未指定'}`,
    `格式: ${state.constraint.format.value || '未指定'}`,
    `字数范围: ${state.constraint.length_min.value || 0}–${state.constraint.length_max.value || '不限'}`,
    `截止日期: ${state.constraint.deadline.value || '无'}`,
    `自定义约束: ${state.constraint.custom_constraints.value.join('、') || '无'}`,
  ].join('\n');
}

function buildExpressionSummary(state: PCSState): string {
  return [
    `语气: ${state.expression.tone.value || '未指定'}`,
    `声音: ${state.expression.voice.value || '未指定'}`,
    `避免: ${state.expression.avoid.value.join('、') || '无'}`,
    `风格参考: ${state.expression.style_reference.value || '无'}`,
  ].join('\n');
}

function buildStructureSummary(state: PCSState): string {
  return state.structure.sections
    .map((s) => `- [${s.order}] ${s.title} (${s.function}, ${s.draft_state}): ${s.goal}`)
    .join('\n');
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}
