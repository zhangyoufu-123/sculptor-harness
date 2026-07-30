import { PCSManager } from '@/pcs/pcs-manager';
// AgentRouter skipped in mock harness — all phases are simulated directly.
// import { AgentRouter } from '@/agents/router';
import { PCSFactory } from '@/test/mocks/pcs-factory';
import { debugTracer } from './debug-tracer';
import type { PCSState, StructureSection } from '@/pcs/types';

interface PipelineResult {
  success: boolean;
  projectId: string;
  phases: string[];
  errors: string[];
  events: number;
  decisions: number;
  duration: number;
}

/**
 * Pre-built sections for the blueprint simulation.
 * In the real app, the Architect agent creates these during Phase 2.
 */
const BLUEPRINT_SECTIONS: StructureSection[] = [
  {
    id: 'node_001',
    title: '引言',
    goal: '建立读者对AI教育趋势的认知',
    function: 'introduce',
    hardness: 'hard',
    draft_state: 'empty',
    content_draft: '',
    pcs_status: 'confirmed',
    source: 'ai',
    confidence: 0.9,
    order: 0,
  },
  {
    id: 'node_002',
    title: '技术分析',
    goal: '解释三个关键AI技术及其效果',
    function: 'argument',
    hardness: 'hard',
    draft_state: 'empty',
    content_draft: '',
    pcs_status: 'confirmed',
    source: 'ai',
    confidence: 0.9,
    order: 1,
  },
  {
    id: 'node_003',
    title: '案例研究',
    goal: '提供真实AI教育成功案例',
    function: 'evidence',
    hardness: 'soft',
    draft_state: 'empty',
    content_draft: '',
    pcs_status: 'confirmed',
    source: 'ai',
    confidence: 0.9,
    order: 2,
  },
  {
    id: 'node_004',
    title: '挑战与风险',
    goal: '客观呈现AI教育的限制',
    function: 'counter',
    hardness: 'hard',
    draft_state: 'empty',
    content_draft: '',
    pcs_status: 'confirmed',
    source: 'ai',
    confidence: 0.9,
    order: 3,
  },
  {
    id: 'node_005',
    title: '结论',
    goal: '给出可执行的行动建议',
    function: 'conclude',
    hardness: 'hard',
    draft_state: 'empty',
    content_draft: '',
    pcs_status: 'confirmed',
    source: 'ai',
    confidence: 0.9,
    order: 4,
  },
];

/** Mock content templates keyed by section title. */
const MOCK_CONTENT: Record<string, string> = {
  引言: '在过去的五年中，AI技术以前所未有的速度渗透到各行各业。教育领域作为社会发展的基石，正面临着深刻的变革。',
  技术分析:
    '自适应学习系统是个性化教育的核心引擎。通过分析学生的学习行为，AI能够动态调整教学内容和难度。',
  案例研究: '以某知名在线教育平台为例，其AI驱动的推荐系统帮助85%的用户在三个月内提升了学习效率。',
  挑战与风险: '然而，AI在教育领域的应用也面临着数据隐私、算法偏见和教师培训等多重挑战。',
  结论: '基于以上分析，教育从业者应当采取渐进策略，将AI整合到现有教学流程中，同时保持教师在教育中的核心地位。',
};

/**
 * Runs the full Sculptor pipeline: Phase 0→1→2→3→4→5.
 * All LLM calls use mock responses (predictable, fast).
 */
export class FullPipelineRunner {
  private manager: PCSManager | null = null;

  constructor(debug = false) {
    debugTracer.setEnabled(debug);
  }

  async run(idea: string): Promise<PipelineResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const phases: string[] = [];
    const projectId = `proj-${Date.now().toString(36)}`;

    try {
      debugTracer.begin(`Pipeline: "${idea.slice(0, 50)}..."`);

      // Phase 0: Initialize
      phases.push('initializing');
      debugTracer.step('PHASE', '0: Initializing');
      const initialState = this.createInitialState(projectId, idea);
      this.manager = new PCSManager(initialState);
      debugTracer.success('PCS initialized');

      // Phase 1: Clarify
      phases.push('clarifying');
      debugTracer.step('PHASE', '1: Clarifying');
      this.simulateClarification();
      this.manager.transitionTo('clarifying');
      this.manager.transitionTo('structured');
      debugTracer.success('Clarification complete');

      // Phase 2: Blueprint
      phases.push('structured');
      debugTracer.step('PHASE', '2: Blueprint');
      this.simulateBlueprint();
      this.manager.transitionTo('executing');
      debugTracer.success('Blueprint created');

      // Phase 3: Context Injection
      phases.push('structured (context)');
      debugTracer.step('PHASE', '3: Context Injection');
      debugTracer.success('Context injection complete (mock)');

      // Phase 4: Writing (5 nodes)
      phases.push('executing');
      debugTracer.step('PHASE', '4: Writing');
      const sections = this.manager.getSections();
      for (const section of sections) {
        debugTracer.step('NODE', `Writing: ${section.title}`);
        this.manager.updateSectionDraftState(section.id, 'generating');
        // Simulate generation
        await this.delay(100);
        this.manager.updateSectionContent(section.id, this.mockContent(section));
        this.manager.updateSectionDraftState(section.id, 'drafted');
        // Simulate review
        this.manager.updateSectionDraftState(section.id, 'reviewing');
        this.manager.updateSectionDraftState(section.id, 'approved');
        debugTracer.success(`Node complete: ${section.title}`);
      }
      debugTracer.success(`All ${sections.length} nodes written`);

      // Phase 5: Review + Export
      this.manager.transitionTo('reviewing');
      phases.push('reviewing');
      debugTracer.step('PHASE', '5: Reviewing');
      this.manager.transitionTo('completed');
      phases.push('completed');
      debugTracer.success('Pipeline complete');

      const duration = Date.now() - startTime;
      return {
        success: true,
        projectId,
        phases,
        errors,
        events: 0, // V1: events tracked in event store
        decisions: 0,
        duration,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        projectId,
        phases,
        errors,
        events: 0,
        decisions: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  private createInitialState(projectId: string, idea: string): PCSState {
    const state = PCSFactory.createEmpty();
    state.id = projectId;
    state.project_id = projectId;

    const now = new Date().toISOString();

    // Pre-fill intent fields with initial assumed values
    state.intent.purpose.value = idea;
    state.intent.purpose.confidence = 0.7;
    state.intent.purpose.source = 'ai';
    state.intent.purpose.last_updated = now;

    state.intent.core_message.confidence = 0.5;
    state.intent.core_message.source = 'ai';
    state.intent.core_message.last_updated = now;

    state.intent.desired_impact.confidence = 0.5;
    state.intent.desired_impact.source = 'ai';
    state.intent.desired_impact.last_updated = now;

    state.intent.target_emotion.confidence = 0.5;
    state.intent.target_emotion.source = 'ai';
    state.intent.target_emotion.last_updated = now;

    // Pre-load blueprint sections so they exist before PCSManager is constructed.
    // writeField resolveField does not handle array-index paths (e.g. "structure.sections.0"),
    // so sections must be added directly to the state before manager initialization.
    state.structure.sections = BLUEPRINT_SECTIONS.map((s) => ({ ...s }));

    return state;
  }

  private simulateClarification(): void {
    if (!this.manager) return;
    this.manager.writeField('intent.purpose', '论证AI教育的必要性和紧迫性', 'user');
    this.manager.writeField('intent.core_message', 'AI不会替代教师，但会重塑教育产业链', 'user');
    this.manager.writeField('audience.audience_type', '教育从业者', 'user');
    this.manager.writeField('audience.knowledge_level', '中级', 'user');
    this.manager.writeField('expression.tone', '专业分析型', 'user');
    this.manager.writeField('constraint.format', '公众号文章', 'user');
    this.manager.writeField('constraint.length_min', 2000, 'user');
    this.manager.writeField('constraint.length_max', 3000, 'user');
  }

  /**
   * Blueprint sections are pre-loaded in {@link createInitialState}.
   * This method validates they were loaded and simulates any additional
   * Architect agent work (e.g., knowledge topic assignment).
   */
  private simulateBlueprint(): void {
    if (!this.manager) return;
    const sections = this.manager.getSections();
    if (sections.length === 0) {
      debugTracer.error('Blueprint simulation failed: no sections loaded');
    }
    // In the real app, the Architect agent would create GenerationPlan objects
    // and assign RequiredTopic entries to each section during this phase.
    // For the mock harness, sections are pre-built — if this is insufficient
    // for future test scenarios, add GenerationPlan mocking here.
  }

  private mockContent(section: Pick<StructureSection, 'title' | 'goal'>): string {
    const template = MOCK_CONTENT[section.title];
    if (template) return template;
    return `这是关于"${section.goal}"的生成内容。`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
