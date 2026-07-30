// ---------------------------------------------------------------------------
// Sculptor V1 — Review Engine (Phase 4→5: reviewing)
//
// V1 upgrade: 8 rule-based checks with zero LLM cost. Each check produces
// actionable feedback with specific suggestions, not just scores.
//
// Checks:
//   1. Completeness          — content present and above minimum length
//   2. Intent Alignment      — keyword overlap with the creative goal
//   3. Length Constraint     — word-count vs target
//   4. Style Consistency     — avoid-list violations
//   5. Knowledge Coverage    — required topics present
//   6. Readability           — sentence-length × audience mismatch
//   7. Sentence Cohesion     — adjacent-sentence word overlap
//   8. Grammar Issues        — punctuation repetition, overlong paragraphs
// ---------------------------------------------------------------------------

import type { AgentRequest, AgentResponse, IPCSAccessor, AgentId } from './types';
import { BaseAgent } from './types';
import { createAgentResponse, startTimer } from './base-agent';
import type { ReviewIssue, ReviewDimension } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewCheck {
  dimension: ReviewDimension;
  name: string;
  fn: (content: string, context: Record<string, unknown>) => ReviewIssue[];
}

// ---------------------------------------------------------------------------
// ReviewEngine
// ---------------------------------------------------------------------------

export class ReviewEngine extends BaseAgent {
  readonly agentId: AgentId = 'review' as AgentId;

  private checks: ReviewCheck[] = [];

  constructor(pcs: IPCSAccessor) {
    super('review' as AgentId, pcs);
    this.initializeChecks();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const stop = startTimer();

    switch (request.action) {
      case 'review': {
        const payload = request.payload as {
          nodeId?: string;
          content?: string;
          goal?: string;
          avoidList?: string[];
          requiredTopics?: string[];
          targetAudience?: string;
          targetLength?: number;
        };

        const content = payload.content || '';

        const context: Record<string, unknown> = {
          nodeId: payload.nodeId || '',
          goal: payload.goal || '',
          avoidList: payload.avoidList || [],
          requiredTopics: payload.requiredTopics || [],
          targetAudience: payload.targetAudience || '普通读者',
          targetLength: payload.targetLength || 2000,
        };

        // Run all 8 checks
        const allIssues: ReviewIssue[] = [];
        for (const check of this.checks) {
          const issues = check.fn(content, context);
          allIssues.push(...issues);
        }

        const blocking = allIssues.filter((i) => i.severity === 'blocking');
        const warnings = allIssues.filter((i) => i.severity === 'warning');
        const passIssues = allIssues.filter((i) => i.severity === 'pass');

        return createAgentResponse(this.agentId, 'review', {
          result: {
            issues: allIssues,
            summary: {
              total: allIssues.length,
              blocking: blocking.length,
              warning: warnings.length,
              pass: passIssues.length,
            },
          },
          pcsMutations: [],
          nextActions: blocking.length > 0 ? ['fix_blocking'] : ['approve'],
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

  // -----------------------------------------------------------------------
  // Check registry
  // -----------------------------------------------------------------------

  private initializeChecks(): void {
    this.checks = [
      { dimension: 'structure_completeness', name: '章节完整度', fn: this.checkCompleteness },
      { dimension: 'intent_satisfaction', name: '意图一致性', fn: this.checkIntentAlignment },
      { dimension: 'constraint_compliance', name: '长度约束', fn: this.checkLengthConstraint },
      { dimension: 'expression_consistency', name: '风格一致性', fn: this.checkStyleConsistency },
      { dimension: 'knowledge_coverage', name: '知识点覆盖', fn: this.checkKnowledgeCoverage },
      { dimension: 'expression_consistency', name: '可读性检查', fn: this.checkReadability },
      { dimension: 'expression_consistency', name: '句子衔接', fn: this.checkSentenceCohesion },
      { dimension: 'expression_consistency', name: '语法问题', fn: this.checkGrammarIssues },
    ];
  }

  // =======================================================================
  // Check 1: Completeness — is content present and above minimum length?
  // =======================================================================
  private checkCompleteness = (
    content: string,
    context: Record<string, unknown>,
  ): ReviewIssue[] => {
    const issues: ReviewIssue[] = [];

    if (!content || content.length < 50) {
      issues.push({
        id: 'rev-comp-1',
        dimension: 'structure_completeness',
        severity: 'blocking',
        description: '内容为空或过短（<50字），请完成写作',
        location: context.nodeId as string,
        suggestion: '使用 /gen 让AI生成初稿，或直接输入内容',
      });
    }

    return issues;
  };

  // =======================================================================
  // Check 2: Intent Alignment — does the content relate to the goal?
  // =======================================================================
  private checkIntentAlignment = (
    content: string,
    context: Record<string, unknown>,
  ): ReviewIssue[] => {
    const issues: ReviewIssue[] = [];
    const goal = (context.goal as string) || '';

    if (!goal || !content) return issues;

    // Simple keyword overlap between goal tokens and content
    const goalKeywords = goal.split(/[\s，。、；：""''！？\n]+/).filter((w) => w.length > 1);
    if (goalKeywords.length === 0) return issues;

    let matchCount = 0;
    for (const kw of goalKeywords) {
      if (content.includes(kw)) matchCount++;
    }
    const ratio = matchCount / goalKeywords.length;

    if (ratio < 0.3) {
      issues.push({
        id: 'rev-intent-1',
        dimension: 'intent_satisfaction',
        severity: 'warning',
        description: `内容与目标"${goal.slice(0, 30)}..."关联较弱（关键词覆盖 ${Math.round(ratio * 100)}%）`,
        suggestion: '检查本节内容是否偏离了原始目标，或考虑更新目标描述',
      });
    }

    return issues;
  };

  // =======================================================================
  // Check 3: Length Constraint — does the content match the target length?
  // =======================================================================
  private checkLengthConstraint = (
    content: string,
    context: Record<string, unknown>,
  ): ReviewIssue[] => {
    const issues: ReviewIssue[] = [];
    const targetLength = (context.targetLength as number) || 0;

    if (!targetLength || !content) return issues;

    const actualLength = content.length;
    const ratio = actualLength / targetLength;

    if (ratio > 1.5) {
      issues.push({
        id: 'rev-len-1',
        dimension: 'constraint_compliance',
        severity: 'warning',
        description: `内容过长：${actualLength}字（目标 ${targetLength}字，超出 ${Math.round((ratio - 1) * 100)}%）`,
        suggestion: '考虑精简内容，或将部分内容拆分到其他章节',
      });
    } else if (ratio < 0.5 && actualLength > 0) {
      issues.push({
        id: 'rev-len-2',
        dimension: 'constraint_compliance',
        severity: 'warning',
        description: `内容偏短：${actualLength}字（目标 ${targetLength}字）`,
        suggestion: '考虑展开论述，增加案例或数据支撑',
      });
    }

    return issues;
  };

  // =======================================================================
  // Check 4: Style Consistency — any avoid-list violations?
  // =======================================================================
  private checkStyleConsistency = (
    content: string,
    context: Record<string, unknown>,
  ): ReviewIssue[] => {
    const issues: ReviewIssue[] = [];
    const avoidList = (context.avoidList as string[]) || [];

    if (!content) return issues;

    for (const term of avoidList) {
      if (term && content.includes(term)) {
        issues.push({
          id: `rev-style-${term}`,
          dimension: 'expression_consistency',
          severity: 'blocking',
          description: `内容包含禁止项："${term}"`,
          suggestion: `请移除或替换"${term}"`,
        });
      }
    }

    return issues;
  };

  // =======================================================================
  // Check 5: Knowledge Coverage — are all required topics present?
  // =======================================================================
  private checkKnowledgeCoverage = (
    content: string,
    context: Record<string, unknown>,
  ): ReviewIssue[] => {
    const issues: ReviewIssue[] = [];
    const requiredTopics = (context.requiredTopics as string[]) || [];

    if (!content) return issues;

    for (const topic of requiredTopics) {
      if (topic && !content.includes(topic)) {
        issues.push({
          id: `rev-cov-${topic}`,
          dimension: 'knowledge_coverage',
          severity: 'warning',
          description: `缺失知识点："${topic}"`,
          suggestion: `请在本节中添加关于"${topic}"的内容`,
        });
      }
    }

    return issues;
  };

  // =======================================================================
  // Check 6: Readability — sentence length compared to audience threshold
  // =======================================================================
  private checkReadability = (content: string, context: Record<string, unknown>): ReviewIssue[] => {
    const issues: ReviewIssue[] = [];

    if (!content) return issues;

    const sentences = content.split(/[。！？.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length < 3) return issues;

    const avgLen = sentences.reduce((sum, sent) => sum + sent.length, 0) / sentences.length;
    const longSentences = sentences.filter((s) => s.length > 60);
    const targetAudience = (context.targetAudience as string) || '普通读者';

    // Audience-specific thresholds (avg sentence length)
    const thresholds: Record<string, number> = {
      入门: 30,
      普通读者: 40,
      中级: 50,
      专家: 70,
    };
    const maxAvg = thresholds[targetAudience] ?? 40;

    if (avgLen > maxAvg) {
      issues.push({
        id: 'rev-read-1',
        dimension: 'expression_consistency',
        severity: 'warning',
        description: `平均句长 ${Math.round(avgLen)} 字，超过目标读者"${targetAudience}"的建议上限 ${maxAvg} 字`,
        suggestion: `将 ${longSentences.length} 个长句拆分为短句，提高可读性`,
      });
    }

    return issues;
  };

  // =======================================================================
  // Check 7: Sentence Cohesion — adjacent-sentence word overlap
  // =======================================================================
  private checkSentenceCohesion = (
    content: string,
    _context: Record<string, unknown>,
  ): ReviewIssue[] => {
    const issues: ReviewIssue[] = [];

    if (!content) return issues;

    const sentences = content.split(/[。！？.!?]+/).filter((s) => s.trim().length > 5);
    if (sentences.length < 3) return issues;

    let lowFlowCount = 0;

    for (let i = 0; i < sentences.length - 1; i++) {
      const words1 = new Set(
        sentences[i].split(/[\s，、；：""''！？\n]+/).filter((w) => w.length > 1),
      );
      const words2 = new Set(
        sentences[i + 1].split(/[\s，、；：""''！？\n]+/).filter((w) => w.length > 1),
      );

      if (words1.size === 0 || words2.size === 0) continue;

      let overlap = 0;
      for (const w of Array.from(words1)) {
        if (words2.has(w)) overlap++;
      }

      const similarity = overlap / Math.max(words1.size, words2.size);
      if (similarity < 0.1) lowFlowCount++;
    }

    const totalPairs = sentences.length - 1;

    if (lowFlowCount / totalPairs > 0.3) {
      issues.push({
        id: 'rev-cohesion-1',
        dimension: 'expression_consistency',
        severity: 'warning',
        description: `${lowFlowCount}/${totalPairs} 处句子衔接较弱，可能导致阅读跳跃`,
        suggestion: '在低衔接处增加过渡词（此外、然而、因此、具体来说）',
      });
    }

    return issues;
  };

  // =======================================================================
  // Check 8: Grammar Issues — common Chinese writing problems
  // =======================================================================
  private checkGrammarIssues = (
    content: string,
    _context: Record<string, unknown>,
  ): ReviewIssue[] => {
    const issues: ReviewIssue[] = [];

    if (!content) return issues;

    // Detect repeated punctuation (typo indicator)
    const repeated = content.match(/([。！？，、])\1{2,}/g);
    if (repeated) {
      issues.push({
        id: 'rev-gram-1',
        dimension: 'expression_consistency',
        severity: 'warning',
        description: `检测到 ${repeated.length} 处可能的标点重复`,
        suggestion: '检查是否有多余的标点符号',
      });
    }

    // Detect overlong paragraphs (>500 chars without line break)
    const paragraphs = content.split(/\n+/);
    const longParas = paragraphs.filter((p) => p.length > 500);
    if (longParas.length > 0) {
      issues.push({
        id: 'rev-gram-2',
        dimension: 'expression_consistency',
        severity: 'warning',
        description: `${longParas.length} 个段落过长（>500字），建议分段`,
        suggestion: '在逻辑断点处增加换行，改善阅读节奏',
      });
    }

    return issues;
  };
}
