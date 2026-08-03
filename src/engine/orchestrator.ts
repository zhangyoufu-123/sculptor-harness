/**
 * Sculptor Agent Orchestrator
 *
 * Lightweight coordinator that:
 * 1. Loads prompts from markdown files
 * 2. Routes to skills (intent-understanding, structure-planning, content-generation)
 * 3. Maintains shared Belief State
 * 4. Coordinates the conversation flow
 */

// Agent Cluster
import { agentBus, ensureAgentsActive, type AgentRole } from '@/agents/cluster';
import {
  predictUserChoices,
  recordUserChoice,
  formatStyleContext,
} from '@/runtime/style/style-predictor';
import { styleOnboarding, looksLikePastedText } from '@/runtime/style/style-onboarding';
import { extractStyle } from '@/runtime/style/style-extractor';
import { styleVectorStore } from '@/runtime/style/style-vector-store';
import type { StyleProfile } from '@/prompts/discovery/style-extraction.prompt';
import type { ExtractionResult } from '@/runtime/style/style-extractor';

import { LLMClient } from '@/lib/llm-client';
import { WritingAgent } from '@/agent/writing-agent';
import {
  createBeliefState,
  getBeliefContext,
  reviseBelief,
  type BeliefState,
} from '@/runtime/belief-revision';
import { planStructure } from '@/skills/structure-planning';

import type { CreativeHypothesis } from '@/runtime/discovery/hypothesis-generator';
import type { MemoryAsset } from '@/runtime/discovery/memory-excavator';
import type { OutlineSection as IncOutlineSection } from '@/runtime/discovery/incremental-outline';
import {
  generateHierarchicalOutline,
  displayHierarchicalOutline,
  shouldUseHierarchical,
} from '@/runtime/discovery/hierarchical-outline';
import {
  createCreativeMemory,
  buildWritingContext,
  type CreativeMemory,
} from '@/runtime/creative-memory';
import { questionTracker } from '@/runtime/discovery/question-tracker';
import { loadDocument, summarizeDocument } from '@/runtime/import/document-loader';
import {
  extractBlueprint,
  summarizeBlueprint,
  type ExtractedBlueprint,
} from '@/runtime/import/blueprint-extractor';
import {
  analyzeDocument,
  generateRewriteStrategy,
  executeRewrite,
  type DocumentAnalysis,
} from '@/runtime/import/multi-style-rewriter';
import {
  buildDiscoveryContext,
  ctxToString,
  type DiscoveryContext,
} from '@/runtime/discovery/unified-context';
import { hasStrongEmotion } from '@/prompts/discovery/empathy-acknowledger.prompt';
import { shouldTriggerStyleDirection } from '@/prompts/discovery/style-direction.prompt';
import { ERROR_TRANSPARENCY_MESSAGES } from '@/prompts/discovery/error-transparency.prompt';
import { promptRegistry } from '@/prompts/registry';

let _llm: LLMClient | null = null;
function getLLM(): LLMClient {
  if (!_llm) _llm = new LLMClient();
  return _llm;
}

// =========================================================================
// Belief State (shared across agents)
// =========================================================================

export interface OutlineSection {
  title: string;
  goal: string;
  content?: string;
}

export interface SessionState {
  belief: BeliefState;
  outline: OutlineSection[];
  currentSection: number;
  messages: Array<{ role: string; content: string }>;
  phase: 'discovery' | 'outline' | 'writing' | 'done';
  hypotheses: CreativeHypothesis[];
  memories: MemoryAsset[];
  /** Incremental outline — grows during conversation */
  incOutline: IncOutlineSection[];
  creativeMemory: CreativeMemory;

  // ── Discovery pipeline state ──
  roundCount?: number;
  lastConsensus?: string;
  detectedGenre?: string;
  articleFramework?: string;
  frameworkStage?: string;
  frameworkProgress?: string;
  lastQuestion?: string;
  consecutiveShortAnswers?: number;
  styleDirection?: string;
  styleDirectionConfirmed?: boolean;
  lastEmpathyAck?: string;
  lastEmotionWasStrong?: boolean;
  userConfused?: boolean;
  importedBlueprint?: ExtractedBlueprint;
  importedContent?: string;
  currentInput?: string;

  // ── Agent Cluster ──
  lastPrediction?: {
    question: string;
    options: string[];
    predictedProbs: number[];
    mostLikely: number;
  };
  lastStyleContext?: string;

  // ── Style Extraction ──
  styleProfile?: StyleProfile | null;
  extractionResult?: ExtractionResult | null;
  styleOnboardingComplete?: boolean;
}

// =========================================================================
// Orchestrator
// =========================================================================

export class SculptorOrchestrator {
  private state: SessionState;
  private writingAgent: WritingAgent | null = null;

  constructor(initialIdea: string) {
    this.state = {
      belief: createBeliefState(initialIdea),
      outline: [],
      currentSection: 0,
      messages: [],
      phase: 'discovery',
      hypotheses: [],
      incOutline: [],
      memories: [],
      creativeMemory: createCreativeMemory(),
      // Discovery pipeline defaults
      roundCount: 0,
      lastConsensus: '',
      detectedGenre: '',
      articleFramework: '',
      frameworkStage: '起',
      frameworkProgress: '',
      lastQuestion: '',
      consecutiveShortAnswers: 0,
      styleDirection: '',
      styleDirectionConfirmed: false,
      lastEmpathyAck: '',
      lastEmotionWasStrong: false,
      userConfused: false,
      importedBlueprint: undefined,
      importedContent: undefined,
      currentInput: '',
    };

    // Initialize agent cluster
    ensureAgentsActive('question');

    // Subscribe to style vector updates for writing phase
    agentBus.on('style_vector_updated', (event) => {
      if (this.state.phase === 'writing') {
        const styleContext = (event.payload as { styleContext?: string }).styleContext;
        if (styleContext) {
          this.state.lastStyleContext = styleContext;
        }
      }
    });
  }

  // =========================================================================
  // Main entry: process user input
  // =========================================================================

  async processInput(userInput: string): Promise<string> {
    this.state.messages.push({ role: 'user', content: userInput });

    // ── Style Onboarding Flow ──────────────────────────────
    if (!styleOnboarding.isDone() && this.state.phase !== 'done') {
      const stage = styleOnboarding.getStage();

      // Stage: waiting for sample
      if (stage === 'waiting_for_sample') {
        if (userInput.trim() === '/skip') {
          return styleOnboarding.skip();
        }

        // Check if user pasted text
        if (looksLikePastedText(userInput)) {
          const result = await styleOnboarding.processSample(userInput);

          // Store extraction result for later use
          this.state.styleProfile = styleOnboarding.getResult()?.profile || null;
          this.state.extractionResult = styleOnboarding.getResult() || null;

          return result;
        }

        // User didn't paste text and didn't skip — proceed
        styleOnboarding.skip();
        // Fall through to normal processing
      }

      // Stage: waiting for confirmation
      if (stage === 'showing_results' || stage === 'waiting_for_confirmation') {
        const { response, isDone } = styleOnboarding.handleConfirmation(userInput);
        if (!isDone) return response;
        // Otherwise, onboarding done — fall through to normal processing
      }
    }

    // ── Opportunistic Style Extraction ─────────────────────
    // If user pastes long text during discovery, extract style
    if (
      this.state.phase === 'discovery' &&
      looksLikePastedText(userInput) &&
      !this.state.styleProfile
    ) {
      try {
        const result = await extractStyle(userInput);
        if (result.success) {
          this.state.styleProfile = result.profile;
          this.state.extractionResult = result;
        }
      } catch {
        // Non-blocking: style extraction failure shouldn't break discovery
      }
    }

    // Handle /outline command
    if (userInput.startsWith('/outline')) {
      // Handle /outline regenerate — force regeneration
      if (userInput.startsWith('/outline regenerate')) {
        if (shouldUseHierarchical(this.state.belief.artifact.value)) {
          const hierOutline = await generateHierarchicalOutline({
            artifactType: this.state.belief.artifact.value,
            topic: this.state.belief.topic.value,
            purpose: this.state.belief.intent.value,
            audience: this.state.belief.audience.value,
            tone: this.state.belief.tone.value,
            summary: getBeliefContext(this.state.belief),
          });
          this.state.outline = hierOutline.flatList.map((n) => ({
            title: n.title,
            goal: n.goal,
          }));
          this.state.phase = 'outline';
          return (
            displayHierarchicalOutline(hierOutline.root!) +
            '\n\n这个结构可以吗？输入 "确认" 开始写作。'
          );
        }

        const outlineResult = await planStructure({
          artifactType: this.state.belief.artifact.value,
          topic: this.state.belief.topic.value,
          purpose: this.state.belief.intent.value,
          audience: this.state.belief.audience.value,
          tone: this.state.belief.tone.value,
          summary: getBeliefContext(this.state.belief),
        });
        this.state.outline = outlineResult.sections;
        this.state.phase = 'outline';
        return (
          outlineResult.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
          '\n\n输入 "确认" 开始写作，或告诉我需要调整的地方。'
        );
      }

      // Show current outline if it exists, otherwise generate new
      if (this.state.outline.length > 0) {
        const sections =
          this.state.incOutline.length > 0
            ? this.state.incOutline
            : this.state.outline.map((s) => ({
                title: s.title,
                goal: s.goal,
                status: 'confirmed' as const,
                addedAt: '',
              }));

        const status = sections
          .map((s, i) => {
            const icon = s.status === 'confirmed' ? '✅' : s.status === 'proposed' ? '💡' : '⬜';
            return `  ${icon} ${i + 1}. ${s.title} — ${s.goal}`;
          })
          .join('\n');

        return `📐 当前大纲 (${sections.length} 节):\n${status}\n\n输入 /outline regenerate 重新生成\n输入 /edit-section N <修改建议> 修改指定节`;
      }

      // No outline exists — generate new
      // Hierarchical outline for long-form works (novel, 长篇)
      if (shouldUseHierarchical(this.state.belief.artifact.value)) {
        const hierOutline = await generateHierarchicalOutline({
          artifactType: this.state.belief.artifact.value,
          topic: this.state.belief.topic.value,
          purpose: this.state.belief.intent.value,
          audience: this.state.belief.audience.value,
          tone: this.state.belief.tone.value,
          summary: getBeliefContext(this.state.belief),
        });
        this.state.outline = hierOutline.flatList.map((n) => ({
          title: n.title,
          goal: n.goal,
        }));
        this.state.phase = 'outline';
        return (
          displayHierarchicalOutline(hierOutline.root!) +
          '\n\n这个结构可以吗？输入 "确认" 开始写作。'
        );
      }

      const outlineResult = await planStructure({
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
        purpose: this.state.belief.intent.value,
        audience: this.state.belief.audience.value,
        tone: this.state.belief.tone.value,
        summary: getBeliefContext(this.state.belief),
      });
      this.state.outline = outlineResult.sections;
      this.state.phase = 'outline';
      return (
        outlineResult.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
        '\n\n输入 "确认" 开始写作，或告诉我需要调整的地方。'
      );
    }

    // Handle /import command
    if (userInput.startsWith('/import')) {
      const filePath = userInput.replace('/import', '').trim();
      if (!filePath) return '请指定文件路径: /import <文件路径>';

      const doc = loadDocument(filePath);
      if (!doc) return `❌ 无法加载文件: ${filePath}`;

      const summary = summarizeDocument(doc);
      const blueprint = await extractBlueprint(doc);
      const bpSummary = summarizeBlueprint(blueprint);

      // Deep document analysis (Phase 1)
      const analysis = await analyzeDocument(doc.content, blueprint);

      // Store in creative memory as source material
      this.state.creativeMemory.constraints.mustInclude.push(`源文件: ${doc.fileName}`);
      this.state.creativeMemory.keyMessages.push(doc.content.slice(0, 500));

      // Store everything
      (this.state as unknown as Record<string, unknown>).importedBlueprint = blueprint;
      (this.state as unknown as Record<string, unknown>).importedContent = doc.content;
      (this.state as unknown as Record<string, unknown>).docAnalysis = analysis;

      return [
        `✅ 文档已导入并深度分析`,
        ``,
        summary,
        ``,
        bpSummary,
        ``,
        `🔬 深度分析结果:`,
        `  类型: ${analysis.documentType}`,
        `  复杂度: ${analysis.complexity}`,
        `  主题: ${analysis.themes.join('、')}`,
        `  语气: ${analysis.tone}`,
        `  核心论点: ${analysis.coreArguments.slice(0, 3).join('；')}`,
        `  可改进: ${analysis.weaknesses.join('；')}`,
        ``,
        '请告诉我你想怎么改写（例如："写成PPT演讲稿"、"通俗化"、"改成学术论文"），',
        '或者直接输入 /rewrite 让我根据对话上下文自动判断。',
      ].join('\n');
    }

    // Handle /rewrite command — LLM-driven, no style picking
    if (userInput.startsWith('/rewrite')) {
      const userGoal = userInput.replace('/rewrite', '').trim();
      const bp = (this.state as unknown as Record<string, unknown>)
        .importedBlueprint as ExtractedBlueprint;
      const content = (this.state as unknown as Record<string, unknown>).importedContent as string;
      const analysis = (this.state as unknown as Record<string, unknown>)
        .docAnalysis as DocumentAnalysis;

      if (!bp || !content || !analysis) return '请先导入文档: /import <文件路径>';

      // If user didn't specify a goal, try to infer from conversation
      const goal = userGoal || this.state.belief.intent.value || '优化表达并适配更广泛的读者';

      // Phase 2: Generate rewrite strategy
      const strategy = await generateRewriteStrategy(analysis, goal, bp);

      // Phase 3: Execute rewrite
      const result = await executeRewrite(bp, content, strategy);

      // Store result for later use
      (this.state as unknown as Record<string, unknown>).lastRewriteResult = result;

      return [
        `🎯 改写策略（LLM自动生成）`,
        `  格式: ${strategy.outputFormat}`,
        `  读者: ${strategy.targetAudience}`,
        `  语气: ${strategy.tone}`,
        `  角度: ${strategy.angles.join('、')}`,
        ``,
        `📝 改写结果（${result.sections.length}节）`,
        '',
        result.fullOutput.slice(0, 2000) +
          (result.fullOutput.length > 2000 ? '\n\n... (输入 /full 查看完整结果)' : ''),
      ].join('\n');
    }

    // Handle /style — show document analysis
    if (userInput === '/style') {
      const analysis = (this.state as unknown as Record<string, unknown>)
        .docAnalysis as DocumentAnalysis;
      if (!analysis) return '请先导入文档: /import <文件路径>';
      return [
        `🔬 文档深度分析`,
        ``,
        `类型: ${analysis.documentType}`,
        `原读者: ${analysis.originalAudience}`,
        `复杂度: ${analysis.complexity}`,
        `结构: ${analysis.structurePattern}`,
        `语气: ${analysis.tone}`,
        ``,
        `主题:`,
        ...analysis.themes.map((t, i) => `  ${i + 1}. ${t}`),
        ``,
        `写作特点:`,
        ...analysis.stylisticFeatures.map((f, i) => `  ${i + 1}. ${f}`),
        ``,
        `核心论点:`,
        ...analysis.coreArguments.map((a, i) => `  ${i + 1}. ${a}`),
        ``,
        `改进空间:`,
        ...analysis.weaknesses.map((w, i) => `  ${i + 1}. ${w}`),
      ].join('\n');
    }

    switch (this.state.phase) {
      case 'discovery':
        return await this.handleDiscovery(userInput);
      case 'outline':
        return await this.handleOutline(userInput);
      case 'writing':
        return await this.handleWriting(userInput);
      default:
        return '已完成。';
    }
  }

  // =========================================================================
  // Discovery Phase
  // =========================================================================

  /**
   * Render a discovery prompt with unified context.
   * All discovery skills use this to ensure context consistency.
   */
  private async renderDiscoveryPrompt(
    promptId: string,
    extraVars: Record<string, string> = {},
  ): Promise<string> {
    const ctx = this.buildContext();
    const ctxString = ctxToString(ctx);

    const rendered = promptRegistry.render(promptId, {
      discovery_context: ctxString,
      user_input: ctx.userInput,
      topic: ctx.topic,
      artifact: ctx.artifact,
      audience: ctx.audience,
      purpose: ctx.purpose,
      tone: ctx.tone,
      known_info: Object.entries(ctx.knownInfo)
        .map(([k, v]) => `${k}: ${v}`)
        .join('；'),
      has_framework: ctx.articleFramework ? 'yes' : 'no',
      framework_stage: ctx.frameworkStage,
      stage_need: ctx.frameworkProgress || '收集本阶段素材',
      style_context: ctx.styleContext ? `\n【风格学习】${ctx.styleContext}` : '',
      ...extraVars,
    });

    return rendered.prompt;
  }

  /**
   * Build unified discovery context from current state.
   */
  private buildContext(): DiscoveryContext {
    return buildDiscoveryContext({
      userInput: this.state.currentInput || '',
      conversationHistory: this.state.messages as Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
      }>,
      roundCount: this.state.belief.roundCount || 1,
      belief: this.state.belief,
      questionTracker,
      creativeMemory: this.state.creativeMemory,
      consensusSignals: this.state.lastConsensus || '',
      detectedGenre: this.state.detectedGenre || '',
      articleFramework: this.state.articleFramework || '',
      frameworkStage: this.state.frameworkStage || '起',
      frameworkProgress: this.state.frameworkProgress || '',
      lastQuestion: this.state.lastQuestion || '',
      consecutiveShortAnswers: this.state.consecutiveShortAnswers || 0,
      styleDirection: this.state.styleDirection || '',
      styleDirectionConfirmed: this.state.styleDirectionConfirmed || false,
      lastEmpathyAck: this.state.lastEmpathyAck || '',
      strongEmotionDetected: this.state.lastEmotionWasStrong || false,
      importedBlueprint: this.state.importedBlueprint || null,
      importedContent: this.state.importedContent || null,
      styleContext: formatStyleContext(),
      styleConfidence: styleVectorStore.getSnapshot().confidence,
    });
  }

  private async handleDiscovery(userInput: string): Promise<string> {
    this.state.currentInput = userInput;
    this.state.belief.roundCount = (this.state.belief.roundCount || 0) + 1;

    // Step 0: Record answer to last question
    if (this.state.lastQuestion && this.state.belief.roundCount > 1) {
      const answered = userInput.length > 5 ? userInput.slice(0, 80) : userInput;
      questionTracker.recordAnswer(this.state.lastQuestion, answered);

      // Record user choice if previous question had options
      if (this.state.lastPrediction) {
        const chosenOption = this.determineChosenOption(
          userInput,
          this.state.lastPrediction.options,
        );
        if (chosenOption !== undefined) {
          agentBus.emit({
            type: 'user_choice_made',
            source: 'question_agent' as AgentRole,
            payload: {
              question: this.state.lastPrediction.question,
              options: this.state.lastPrediction.options,
              chosenIndex: chosenOption,
              predictedProbs: this.state.lastPrediction.predictedProbs,
            },
            priority: 'high',
          });

          // Record for style learning
          recordUserChoice(
            this.state.lastPrediction.question,
            this.state.lastPrediction.options,
            chosenOption,
            this.state.lastPrediction.predictedProbs,
          );
        }
        this.state.lastPrediction = undefined;
      }
    }

    // ─── SKILL PIPELINE ───────────────────────────────────────

    // Build unified context ONCE for the entire pipeline
    const ctx = this.buildContext();

    // ═══ STEP 1: Frustration/Confusion Detection (fast, non-LLM) ═══
    const frustrationPatterns = [/什么(意思|鬼)/, /没懂/, /不懂/, /不明白/, /^[？?]$/];
    const isFrustrated = frustrationPatterns.some((p) => p.test(userInput.trim()));
    const isConfused = userInput.trim().length < 5 && userInput.trim() !== '';

    if (isFrustrated || isConfused) {
      const recovery = isFrustrated
        ? `抱歉，我问得不太好。${this.state.lastQuestion ? `刚才其实是想了解：${this.state.lastQuestion}` : ''}\n\n不如我们换个方式——你现在最想记下来的，到底是什么感觉或画面？`
        : '抱歉，我可能绕远了。我们回到你刚才说的——你现在最想表达的是什么？';
      this.state.lastQuestion = '';
      return recovery;
    }

    this.state.userConfused = false;

    // ═══ STEP 2: Empathy Acknowledgment (LLM) ═══
    const strongEmotion = hasStrongEmotion(userInput);
    const promptText = await this.renderDiscoveryPrompt('empathy-acknowledger');

    try {
      const empathyResponse = await getLLM().completeWithRetry({
        systemPrompt: '你是共情助手。用一句话让用户感到你的理解。',
        prompt: promptText,
        temperature: 0.5,
        maxTokens: 100,
      });

      const ack = empathyResponse.text?.trim() || '';
      if (ack && (strongEmotion || ctx.roundCount <= 2)) {
        this.state.lastEmpathyAck = ack;
        this.state.lastEmotionWasStrong = strongEmotion;
      }
    } catch {
      // Empathy failure is not critical — continue pipeline
    }

    // ═══ STEP 3: Consensus Reflection (first interaction only) ═══
    if (ctx.roundCount <= 2 && ctx.consensusSignals) {
      // reflectConsensus is already called, use its result
    }

    // ═══ STEP 4: Revise Belief ═══
    reviseBelief(
      this.state.belief,
      {
        topic: this.state.belief.topic.value || userInput,
      },
      `用户说: ${userInput.slice(0, 80)}`,
    );

    // Extract artifact type from user input if explicitly stated
    const explicitTypes: Record<string, string> = {
      散文: '散文',
      小说: '小说',
      论文: '学术论文',
      诗: '诗歌',
      教程: '教程',
      博客: '博客',
      公众号: '博客',
      报告: '研究报告',
      演讲稿: '演讲稿',
      剧本: '剧本',
    };
    for (const [keyword, type] of Object.entries(explicitTypes)) {
      if (userInput.includes(keyword)) {
        reviseBelief(this.state.belief, { artifact: type }, `用户明确提到"${keyword}"`);
        break;
      }
    }

    // Extract audience if explicitly stated
    if (userInput.includes('莘莘学子') || userInput.includes('学生')) {
      reviseBelief(this.state.belief, { audience: '学生' }, `用户提到受众`);
    }

    // ═══ STEP 5: Framework Building (LLM) ═══
    if (!ctx.articleFramework && ctx.roundCount >= 2 && ctx.topic) {
      try {
        const frameworkPrompt = await this.renderDiscoveryPrompt('framework-builder');
        const frameworkResponse = await getLLM().completeWithRetry({
          systemPrompt: '你是文章框架设计师。',
          prompt: frameworkPrompt,
          temperature: 0.4,
          maxTokens: 300,
        });

        const frameworkText = frameworkResponse.text?.trim() || '';
        if (frameworkText) {
          this.state.articleFramework = frameworkText;
          // Parse stage from framework text
          if (frameworkText.includes('起')) this.state.frameworkStage = '起';
          else if (frameworkText.includes('承')) this.state.frameworkStage = '承';
          else if (frameworkText.includes('转')) this.state.frameworkStage = '转';
          else if (frameworkText.includes('合')) this.state.frameworkStage = '合';
        }
      } catch {
        // Framework failure is not critical
      }
    }

    // ═══ STEP 6: Style Direction (conditional) ═══
    if (
      shouldTriggerStyleDirection({
        topic: ctx.topic,
        audience: ctx.audience,
        purpose: ctx.purpose,
        confidence: ctx.confidence,
        roundCount: ctx.roundCount,
        styleDirection: ctx.styleDirection,
      })
    ) {
      try {
        const stylePrompt = await this.renderDiscoveryPrompt('style-direction-picker');
        const styleResponse = await getLLM().completeWithRetry({
          systemPrompt: '你是风格顾问。',
          prompt: stylePrompt,
          temperature: 0.5,
          maxTokens: 400,
        });

        const styleText = styleResponse.text?.trim() || '';
        if (styleText) {
          this.state.lastQuestion = 'style_direction';
          return styleText;
        }
      } catch {
        // Style failure is not critical
      }
    }

    // ═══ STEP 7: Context-Grown Questions (LLM) ═══
    try {
      const questionPrompt = await this.renderDiscoveryPrompt('context-questioner');
      const questionResponse = await getLLM().completeWithRetry({
        systemPrompt: '你是追问设计师。从用户话语中自然生长问题。',
        prompt: questionPrompt,
        temperature: 0.6,
        maxTokens: 500,
      });

      const questionText = questionResponse.text?.trim() || '';
      if (questionText) {
        this.state.lastQuestion = questionText;

        // Extract options from the question text (parse A/B/C format)
        const optionLines = questionText.split('\n').filter((l) => /^[A-C][.、]/.test(l.trim()));
        const options = optionLines.map((l) => l.replace(/^[A-C][.、]\s*/, '').trim());

        if (options.length >= 2) {
          // Predict user's likely choice
          const prediction = predictUserChoices(options);

          // Store prediction for when user responds
          this.state.lastPrediction = {
            question: questionText,
            options,
            predictedProbs: prediction.optionProbs,
            mostLikely: prediction.mostLikely,
          };

          // Emit event to Agent Bus
          agentBus.emit({
            type: 'question_generated',
            source: 'question_agent' as AgentRole,
            payload: {
              question: questionText,
              options,
              predictedProbs: prediction.optionProbs,
              phase: 'discovery',
            },
            priority: 'medium',
          });

          // Ensure recording agents are active
          ensureAgentsActive('question');
        }

        return questionText;
      }
    } catch {
      // API error — transparent fallback
      return ERROR_TRANSPARENCY_MESSAGES.apiRecovery();
    }

    // ═══ FALLBACK ═══
    return '我们继续——你还有什么想说的？';
  }

  // @ts-expect-error — kept for future recovery needs
  private async _handleRecovery(input: string): Promise<string> {
    const recoveryPrompt = `对话出错了。用户说: "${input}"
对话历史: ${this.state.messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
      .join('\n')}
请: 1.承认跑偏 2.回顾核心议题 3.回到正轨。不要道歉过度。`;

    const response = await getLLM().completeWithRetry({
      systemPrompt: '你是创作伙伴。对话跑偏时，承认、回顾、回到正轨。',
      prompt: recoveryPrompt,
      temperature: 0.5,
      maxTokens: 400,
    });
    return response.text || '抱歉，让我们回到正题。';
  }

  // =========================================================================
  // Outline Phase
  // =========================================================================

  private async handleOutline(input: string): Promise<string> {
    // CHECK CONFIRMATION FIRST — before anything else
    if (
      input.includes('确认') ||
      input.includes('开始') ||
      input.includes('好') ||
      input === 'ok' ||
      input === 'OK'
    ) {
      this.state.phase = 'writing';
      this.state.currentSection = 0;
      this.writingAgent = null;
      return [
        `✅ 进入写作阶段`,
        ``,
        `📋 创作概要:`,
        `  类型: ${this.state.belief.artifact.value || '文章'}`,
        `  主题: ${this.state.belief.topic.value}`,
        `  读者: ${this.state.belief.audience.value || '未指定'}`,
        `  语气: ${this.state.belief.tone.value || '未指定'}`,
        ``,
        `📐 大纲 (${this.state.outline.length} 节):`,
        ...this.state.outline.map((s, i) => `  ${i + 1}. ${s.title} — ${s.goal}`),
        ``,
        `输入 /gen 生成内容`,
      ].join('\n');
    }

    // THEN check for dissatisfaction
    if (
      input.includes('不行') ||
      input.includes('不对') ||
      input.includes('重新') ||
      input.includes('再讨论')
    ) {
      const response = await getLLM().completeWithRetry({
        systemPrompt: '你是创作顾问。当用户对大纲不满意时，你先分析原因，再提出方向。',
        prompt: `用户对大纲不满意: "${input}"
当前大纲: ${this.state.outline.map((s, i) => `${i + 1}. ${s.title} — ${s.goal}`).join('\n')}
创作记忆: ${buildWritingContext(this.state.creativeMemory)}
请分析用户可能不满意的原因，提出2-3个更接近用户意图的方向。`,
        temperature: 0.5,
        maxTokens: 500,
      });
      return response.text || '我理解了你的不满意。能告诉我具体哪里不符合你的想法吗？';
    }

    // THEN check section-specific edits
    // Section-specific edit: "/edit-section 2 目标不够具体"
    if (input.startsWith('/edit-section')) {
      const parts = input.replace('/edit-section', '').trim().split(/\s+/);
      const sectionNum = parseInt(parts[0]);
      const suggestion = parts.slice(1).join(' ');

      if (isNaN(sectionNum) || sectionNum < 1 || sectionNum > this.state.outline.length) {
        return `无效的节号。当前共 ${this.state.outline.length} 节，请选择 1-${this.state.outline.length}`;
      }

      const idx = sectionNum - 1;
      const section = this.state.outline[idx];

      // Use LLM to understand and apply the edit
      const response = await getLLM().completeWithRetry({
        systemPrompt:
          '你是大纲编辑助手。根据用户建议修改指定章节的标题或目标。输出JSON: {"title": "新标题", "goal": "新目标"}',
        prompt: `当前章节: 标题="${section.title}", 目标="${section.goal}"\n修改建议: ${suggestion}\n请根据建议修改。如果只改目标，保持原标题。如果只改标题，保持原目标。`,
        responseFormat: 'json',
        temperature: 0.3,
        maxTokens: 300,
      });

      if (response.json) {
        const edit = response.json as { title?: string; goal?: string };
        if (edit.title) section.title = edit.title;
        if (edit.goal) section.goal = edit.goal;
        return `✅ 第${sectionNum}节已更新:\n  标题: ${section.title}\n  目标: ${section.goal}`;
      }

      // Fallback: apply suggestion directly to goal
      section.goal = suggestion;
      return `✅ 第${sectionNum}节目标已更新为: ${suggestion}`;
    }

    // Natural language section edit: "把第2节改成XXX"
    const naturalEditMatch = input.match(
      /第?\s*(\d+)\s*[节章]\s*(?:改成|改为|修改|调整|换成)\s*(.+)/,
    );
    if (naturalEditMatch) {
      const sectionNum = parseInt(naturalEditMatch[1]);
      const suggestion = naturalEditMatch[2].trim();
      return await this.handleSectionEdit(sectionNum, suggestion, true);
    }

    // User wants to adjust — regenerate via LLM
    // Hierarchical outline for long-form works (novel, 长篇)
    if (shouldUseHierarchical(this.state.belief.artifact.value)) {
      const hierOutline = await generateHierarchicalOutline({
        artifactType: this.state.belief.artifact.value,
        topic: this.state.belief.topic.value,
        purpose: this.state.belief.intent.value,
        audience: this.state.belief.audience.value,
        tone: this.state.belief.tone.value,
        summary: getBeliefContext(this.state.belief) + `\n用户反馈: ${input}`,
      });
      this.state.outline = hierOutline.flatList.map((n) => ({
        title: n.title,
        goal: n.goal,
      }));
      return displayHierarchicalOutline(hierOutline.root!) + '\n\n调整后的层级结构。确认开始写作？';
    }

    const result = await planStructure({
      artifactType: this.state.belief.artifact.value,
      topic: this.state.belief.topic.value,
      purpose: this.state.belief.intent.value,
      audience: this.state.belief.audience.value,
      tone: this.state.belief.tone.value,
      summary: getBeliefContext(this.state.belief) + `\n用户反馈: ${input}`,
    });
    this.state.outline = result.sections;
    return (
      result.sections.map((s, i) => `${i + 1}. **${s.title}** — ${s.goal}`).join('\n') +
      '\n\n调整后的结构。确认开始写作？'
    );
  }

  // =========================================================================
  // Section Edit Helper
  // =========================================================================

  private async handleSectionEdit(
    sectionNum: number,
    suggestion: string,
    allowTitleChange: boolean,
  ): Promise<string> {
    if (sectionNum < 1 || sectionNum > this.state.outline.length) {
      return `无效。共 ${this.state.outline.length} 节，选 1-${this.state.outline.length}`;
    }
    const idx = sectionNum - 1;
    const section = this.state.outline[idx];

    const response = await getLLM().completeWithRetry({
      systemPrompt:
        '你是大纲编辑助手。根据用户建议修改指定章节。输出JSON: {"title":"新标题","goal":"新目标"}',
      prompt: `当前: 标题="${section.title}", 目标="${section.goal}"\n建议: ${suggestion}\n修改并输出JSON。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 300,
    });

    if (response.json) {
      const edit = response.json as { title?: string; goal?: string };
      if (edit.title && allowTitleChange) section.title = edit.title;
      if (edit.goal) section.goal = edit.goal;
    } else {
      section.goal = suggestion;
    }

    return `✅ 第${sectionNum}节: ${section.title} — ${section.goal}`;
  }

  // =========================================================================
  // Writing Phase
  // =========================================================================

  async handleWriting(input: string): Promise<string> {
    if (!this.writingAgent) {
      // Build full handoff context from discovery phase
      const handoffContext = [
        `创作类型: ${this.state.belief.artifact.value} (${Math.round(this.state.belief.artifact.confidence * 100)}%)`,
        `核心主题: ${this.state.belief.topic.value}`,
        `目标读者: ${this.state.belief.audience.value}`,
        `创作意图: ${this.state.belief.intent.value}`,
        `语气风格: ${this.state.belief.tone.value}`,
        `整体置信度: ${Math.round(this.state.belief.overallConfidence * 100)}%`,
      ].join('\n');

      const handoffSummary = buildWritingContext(this.state.creativeMemory);

      this.writingAgent = new WritingAgent({
        belief: this.state.belief,
        outline: this.state.outline.map((s) => ({ title: s.title, goal: s.goal })),
        creativeMemory: this.state.creativeMemory,
        conversationContext: handoffContext,
        discoverySummary: handoffSummary,
      });
      // Don't return early — pass the input through to the WritingAgent
      // so material collection can begin immediately.
      const result = await this.writingAgent.handle(input);
      this.state.outline = this.state.outline.map((s, i) => ({
        ...s,
        content: this.writingAgent!.getOutline()[i]?.content || s.content,
      }));
      if (result.phase === 'done') this.state.phase = 'done';
      return (
        `开始写作！共 ${this.state.outline.length} 节。\n` +
        `第一节: **${this.state.outline[0].title}**\n\n` +
        result.response
      );
    }
    const result = await this.writingAgent.handle(input);
    this.state.outline = this.state.outline.map((s, i) => ({
      ...s,
      content: this.writingAgent!.getOutline()[i]?.content || s.content,
    }));
    if (result.phase === 'done') this.state.phase = 'done';
    return result.response;
  }

  /** Get current state for display */
  getState(): SessionState {
    return this.state;
  }

  /** Determine which option the user chose from their response */
  private determineChosenOption(userInput: string, options: string[]): number | undefined {
    const trimmed = userInput.trim().toLowerCase();

    // Direct letter match: "A", "B", "C"
    const letterMatch = trimmed.match(/^[a-c]$/);
    if (letterMatch) {
      return letterMatch[0].charCodeAt(0) - 97;
    }

    // Chinese number match: "一"、"二"、"三"
    const cnNums: Record<string, number> = { 一: 0, 二: 1, 三: 2 };
    if (cnNums[trimmed] !== undefined) return cnNums[trimmed];

    // Best substring match against options
    let bestMatch = -1;
    let bestScore = 0;
    for (let i = 0; i < options.length; i++) {
      const score = this.textSimilarity(trimmed, options[i].toLowerCase());
      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = i;
      }
    }

    return bestMatch >= 0 ? bestMatch : undefined;
  }

  /** Simple Jaccard-like similarity for option matching */
  private textSimilarity(a: string, b: string): number {
    const tokensA = Array.from(new Set(a.split('')));
    const tokensB = new Set(b.split(''));
    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }
    const union = tokensA.length + tokensB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}
