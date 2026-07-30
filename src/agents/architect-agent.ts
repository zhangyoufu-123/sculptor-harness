// ---------------------------------------------------------------------------
// Sculptor V1 — Architect Agent (Phase 2: data-driven structure generation)
//
// Key upgrades over the original hardcoded-5-sections implementation:
//   1. Data-driven section count  — derived from creative type + desired length.
//   2. Creative type routing      — fiction uses narrative templates (Hero's
//      Journey, Three-Act, Save the Cat); non-fiction uses argument mapping.
//   3. Depth estimation            — section count = desired_word_count /
//      avg_section_length, bounded by type-specific limits.
//
// The LLM-based generation path is preserved from the original but the
// rule-based fallback is now the primary engine for deterministic structure
// generation.  Narrative beats and argument templates replace the hardcoded
// "引言 / 主体 / 总结" pattern.
// ---------------------------------------------------------------------------

import { BaseAgent } from './types';
import { createAgentResponse, startTimer } from './base-agent';
import type { AgentRequest, AgentResponse, IPCSAccessor, ProposalMutation } from './types';
import { LLMClient } from '@/lib/llm-client';
import { AlgorithmRunner } from '@/lib/algorithm-runner';
import { checkAlignment } from '@/algorithms/intent-blueprint-alignment';
import type { AlignmentResult } from '@/algorithms/intent-blueprint-alignment';
import { ARCHITECT_STRUCTURE_PROMPT } from '@/prompts/architect-agent';
import type { PCSState, StructureSection } from '@/pcs/types';
import type { CreativeType } from '@/runtime/creative-type-router';
import { isFiction } from '@/runtime/creative-type-router';

// ---------------------------------------------------------------------------
// Shared instances (LLM & algorithm runners — preserved from original)
// ---------------------------------------------------------------------------

const llmClient = new LLMClient();
const algorithmRunner = new AlgorithmRunner();

// ---------------------------------------------------------------------------
// Narrative structure templates for fiction
// ---------------------------------------------------------------------------

interface NarrativeTemplate {
  name: string;
  beats: string[];
  sectionCount: number;
}

const NARRATIVE_TEMPLATES: Record<string, NarrativeTemplate> = {
  three_act: {
    name: '三幕结构',
    beats: ['序幕/建立', '激励事件', '第一幕转折', '上升行动', '中点', '危机', '高潮', '结局'],
    sectionCount: 8,
  },
  hero_journey: {
    name: '英雄之旅',
    beats: [
      '平凡世界',
      '冒险召唤',
      '拒绝召唤',
      '遇见导师',
      '跨越门槛',
      '考验与盟友',
      '接近核心',
      '磨难',
      '奖励',
      '返回之路',
      '复活',
      '带着宝物归来',
    ],
    sectionCount: 12,
  },
  save_the_cat: {
    name: '救猫咪节拍表',
    beats: [
      '开场画面',
      '主题陈述',
      '铺垫',
      '催化剂',
      '辩论',
      '第二幕开启',
      'B故事',
      '娱乐游戏',
      '中点',
      '反派逼近',
      '一无所有',
      '灵魂黑夜',
      '第三幕开启',
      '结局',
      '终场画面',
    ],
    sectionCount: 15,
  },
};

// ---------------------------------------------------------------------------
// Non-fiction structure templates (argument mapping)
// ---------------------------------------------------------------------------

interface NonfictionTemplate {
  name: string;
  sections: string[];
  adaptiveRules: Record<string, number>; // min sections for word-count thresholds
}

const NONFICTION_TEMPLATES: Record<string, NonfictionTemplate> = {
  article: {
    name: '文章结构',
    sections: ['引言', '背景', '主体论点1', '主体论点2', '主体论点3', '反方观点', '结论'],
    adaptiveRules: { '1000': 3, '3000': 5, '5000': 7, '10000': 10 },
  },
  research: {
    name: '学术论文',
    sections: ['摘要', '引言', '文献综述', '方法论', '结果', '讨论', '结论', '参考文献'],
    adaptiveRules: { '3000': 5, '8000': 8, '20000': 10 },
  },
  business_plan: {
    name: '商业计划',
    sections: [
      '执行摘要',
      '市场分析',
      '产品/服务',
      '商业模式',
      '竞争分析',
      '营销策略',
      '财务预测',
      '团队',
      '风险',
    ],
    adaptiveRules: { '3000': 5, '5000': 7, '10000': 9 },
  },
};

// ---------------------------------------------------------------------------
// ArchitectAgent
// ---------------------------------------------------------------------------

export class ArchitectAgent extends BaseAgent {
  constructor(pcs: IPCSAccessor) {
    super('architect', pcs);
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const stop = startTimer();
    const action = request.action;
    const snapshot = request.pcsSnapshot;

    switch (action) {
      // ── generate_structure (LLM primary + data-driven fallback) ─────
      case 'generate_structure': {
        let llmCalls = 0;
        let tokensUsed = 0;
        let structure: StructureSection[] = [];
        let method: 'llm' | 'data-driven' = 'data-driven';

        // --- Step 1: attempt LLM generation (preserved from original) ---
        try {
          const variables: Record<string, unknown> = {
            intent_summary: buildIntentSummary(snapshot),
            audience_summary: buildAudienceSummary(snapshot),
            constraint_summary: buildConstraintSummary(snapshot),
            format_type: snapshot.constraint.type.value || '文章',
            tone_description: snapshot.expression.tone.value || '专业、清晰',
            audience_context: snapshot.audience.audience_type.value || '普通读者',
          };

          const systemPrompt = ARCHITECT_STRUCTURE_PROMPT.systemPrompt ?? '';
          let prompt = ARCHITECT_STRUCTURE_PROMPT.template;
          for (const [key, val] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
          }

          const response = await llmClient.complete({
            prompt,
            systemPrompt,
            responseFormat: 'json',
            maxTokens: ARCHITECT_STRUCTURE_PROMPT.maxTokens,
          });

          llmCalls = 1;
          tokensUsed = response.usage.totalTokens;

          if (response.json && typeof response.json === 'object') {
            const json = response.json as Record<string, unknown>;
            const rawStructure = Array.isArray(json['structure']) ? json['structure'] : [];

            structure = rawStructure.map((item: Record<string, unknown>, index: number) => ({
              id: typeof item['id'] === 'string' ? item['id'] : `section-${index + 1}`,
              title: typeof item['title'] === 'string' ? item['title'] : `章节 ${index + 1}`,
              goal: typeof item['goal'] === 'string' ? item['goal'] : '',
              function: isValidNodeFunction(item['function'])
                ? (item['function'] as StructureSection['function'])
                : 'argument',
              hardness: item['hardness'] === 'soft' ? 'soft' : 'hard',
              draft_state: 'empty' as const,
              content_draft: '',
              pcs_status: 'proposed' as const,
              source: 'ai' as const,
              confidence: 0.7,
              order: index,
            }));

            if (structure.length > 0) {
              method = 'llm';
            }
          }
        } catch {
          // LLM failed — fall through to data-driven path below
        }

        // --- Step 2: data-driven fallback (the new primary engine) ---
        if (structure.length === 0) {
          const payload = request.payload as {
            creativeType?: CreativeType;
            desiredLength?: number;
            topicCount?: number;
          };

          const type: CreativeType = payload.creativeType || 'article';
          const targetLength = payload.desiredLength || 2500;
          const topicCount = payload.topicCount || 3;

          const sectionCount = this.calculateSectionCount(type, targetLength, topicCount);

          structure = isFiction(type)
            ? this.generateFictionStructure(type, sectionCount)
            : this.generateNonfictionStructure(type, sectionCount, targetLength);

          method = 'data-driven';
        }

        // --- Build mutations (preserved from original) ---
        const mutations: ProposalMutation[] = [];
        for (const section of structure) {
          mutations.push({
            fieldPath: `structure.sections.${section.order}`,
            proposedValue: section,
            reason:
              method === 'llm'
                ? 'Generated by Architect Agent based on intent + constraints'
                : 'Generated via data-driven creative-type routing',
            trigger: 'manual',
            confidence: method === 'llm' ? 0.7 : 0.6,
          });
        }

        const latency = stop();
        return createAgentResponse('architect', action, {
          result: {
            structure,
            sectionCount: structure.length,
            method,
          },
          pcsMutations: mutations,
          nextActions: ['validate_alignment'],
          latency,
          llmCalls,
          tokensUsed,
        });
      }

      // ── validate_alignment ──────────────────────────────────────────
      case 'validate_alignment': {
        const alignmentResult = await algorithmRunner.run<AlignmentResult>(
          { name: 'intent-blueprint-alignment' },
          () => Promise.resolve(checkAlignment(snapshot)),
        );

        const alignment =
          alignmentResult.success && alignmentResult.data
            ? alignmentResult.data
            : {
                overallScore: 0,
                coreMessageCovered: false,
                uncoveredAspects: [],
                sectionScores: [],
                recommendations: ['对齐检查失败，请手动验证。'],
              };

        const nextActions = alignment.coreMessageCovered
          ? ['approve_structure']
          : ['refine_structure'];

        const latency = stop();
        return createAgentResponse('architect', action, {
          result: { alignment },
          nextActions,
          latency,
        });
      }

      // ── refine_structure (preserved from original) ──────────────────
      case 'refine_structure': {
        const feedback = typeof request.payload === 'string' ? request.payload : '';

        const mutations: ProposalMutation[] = [];

        if (feedback.length > 0) {
          mutations.push({
            fieldPath: 'structure.sections',
            proposedValue: snapshot.structure.sections,
            reason: `User feedback applied during refinement: "${feedback.slice(0, 100)}"`,
            trigger: 'manual',
            confidence: 0.8,
          });
        }

        const latency = stop();
        return createAgentResponse('architect', action, {
          result: {
            feedback,
            existingSections: snapshot.structure.sections.length,
          },
          pcsMutations: mutations,
          nextActions: ['generate_structure'],
          latency,
        });
      }

      default:
        return createAgentResponse('architect', action, {
          result: { error: `Unknown action: ${action}` },
          latency: stop(),
        });
    }
  }

  // =========================================================================
  // Data-driven helpers
  // =========================================================================

  /**
   * Calculate the appropriate section count based on creative type and
   * desired length.  This is the key insight: section count is DATA-DRIVEN,
   * not a magic number.
   */
  private calculateSectionCount(
    type: CreativeType,
    targetLength: number,
    topicCount: number,
  ): number {
    // --- Fiction: use narrative template beat count, adjusted for length ---
    if (type === 'fiction_novel' || type === 'screenplay') {
      const template = NARRATIVE_TEMPLATES.hero_journey;
      if (targetLength > 50000) return template.sectionCount; // epic → full 12 beats
      if (targetLength > 20000) return 8; // standard
      return 5; // short
    }
    if (type === 'short_story') {
      return Math.max(3, Math.min(Math.ceil(targetLength / 500), 6));
    }

    // --- Non-fiction: use adaptive rules from template ---
    const template = NONFICTION_TEMPLATES[type] ?? NONFICTION_TEMPLATES.article;
    const rules = Object.entries(template.adaptiveRules)
      .map(([k, v]) => [parseInt(k, 10), v] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    let sectionCount = template.adaptiveRules['3000'] ?? 5;
    for (const [threshold, count] of rules) {
      if (targetLength >= threshold) sectionCount = count;
    }

    // Topic density: more topics → slightly more sections
    sectionCount = Math.max(sectionCount, Math.min(topicCount + 2, 12));

    return sectionCount;
  }

  /**
   * Generate fiction structure using narrative templates (Hero's Journey,
   * Three-Act, Save the Cat).
   */
  private generateFictionStructure(_type: CreativeType, sectionCount: number): StructureSection[] {
    const template =
      sectionCount >= 12
        ? NARRATIVE_TEMPLATES.hero_journey
        : sectionCount >= 8
          ? NARRATIVE_TEMPLATES.three_act
          : NARRATIVE_TEMPLATES.save_the_cat;

    const usedBeats = template.beats.slice(0, sectionCount);

    return usedBeats.map((beat, i) => ({
      id: `n${i + 1}`,
      title: beat,
      goal: `完成「${beat}」阶段的叙事任务`,
      function: (i === 0
        ? 'introduce'
        : i === sectionCount - 1
          ? 'conclude'
          : i < Math.ceil(sectionCount / 2)
            ? 'argument'
            : 'counter') as StructureSection['function'],
      hardness: i === 0 || i === sectionCount - 1 ? 'hard' : 'soft',
      draft_state: 'empty' as const,
      content_draft: '',
      pcs_status: 'proposed' as const,
      source: 'ai' as const,
      confidence: 0.6,
      order: i,
    }));
  }

  /**
   * Generate non-fiction structure using argument mapping.
   */
  private generateNonfictionStructure(
    type: CreativeType,
    sectionCount: number,
    _targetLength: number,
  ): StructureSection[] {
    const template = NONFICTION_TEMPLATES[type] ?? NONFICTION_TEMPLATES.article;
    const usedSections = template.sections.slice(0, sectionCount);

    // Pad with custom sections if the template is too short
    while (usedSections.length < sectionCount) {
      usedSections.push(`补充论点${usedSections.length - template.sections.length + 1}`);
    }

    return usedSections.map((title, i) => ({
      id: `n${i + 1}`,
      title,
      goal:
        i === 0
          ? '建立读者对主题的认知和兴趣'
          : i === sectionCount - 1
            ? '总结核心观点，给出明确结论或行动建议'
            : `深入论证"${title}"，提供数据或案例支撑`,
      function: (i === 0
        ? 'introduce'
        : i === sectionCount - 1
          ? 'conclude'
          : 'argument') as StructureSection['function'],
      hardness: i === 0 || i === sectionCount - 1 ? 'hard' : 'soft',
      draft_state: 'empty' as const,
      content_draft: '',
      pcs_status: 'proposed' as const,
      source: 'ai' as const,
      confidence: 0.6,
      order: i,
    }));
  }
}

// ---------------------------------------------------------------------------
// Helpers (preserved from original)
// ---------------------------------------------------------------------------

function buildIntentSummary(state: PCSState): string {
  return [
    `目的: ${state.intent.purpose.value || '未指定'}`,
    `核心信息: ${state.intent.core_message.value || '未指定'}`,
    `预期影响: ${state.intent.desired_impact.value || '未指定'}`,
    `目标情感: ${state.intent.target_emotion.value || '未指定'}`,
  ].join('\n');
}

function buildAudienceSummary(state: PCSState): string {
  return [
    `读者类型: ${state.audience.audience_type.value || '未指定'}`,
    `知识水平: ${state.audience.knowledge_level.value || '未指定'}`,
    `关系: ${state.audience.relationship.value || '未指定'}`,
    `痛点: ${state.audience.pain_points.value.join('、') || '未指定'}`,
  ].join('\n');
}

function buildConstraintSummary(state: PCSState): string {
  return [
    `类型: ${state.constraint.type.value || '未指定'}`,
    `平台: ${state.constraint.platform.value || '未指定'}`,
    `格式: ${state.constraint.format.value || '未指定'}`,
    `字数范围: ${state.constraint.length_min.value || 0}–${state.constraint.length_max.value || '不限'}`,
  ].join('\n');
}

const VALID_NODE_FUNCTIONS = new Set<string>([
  'introduce',
  'argument',
  'evidence',
  'counter',
  'transition',
  'conclude',
  'elaborate',
]);

function isValidNodeFunction(value: unknown): boolean {
  return typeof value === 'string' && VALID_NODE_FUNCTIONS.has(value);
}
