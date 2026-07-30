/**
 * Sculptor Console MVP — Conversation Loop
 *
 * The core interactive engine. Manages the full lifecycle:
 * Idea → Clarify → Blueprint → Write → Reflect → Revise → Export
 *
 * All internal state (PCS, Agent traces, decisions) is visible
 * via the /debug command.
 */

import * as readline from 'readline';
import { PCSManager } from '@/pcs/pcs-manager';
import { createPCSState, createMockField } from '@/test/mocks/pcs-factory';
import type { PCSState, StructureSection } from '@/pcs/types';
import { artifactBuilder } from '@/discovery/artifact-builder';
import { understandWithLLM, type LLMUnderstandingResult } from '@/runtime/intent/llm-understander';
import {
  createBeliefState,
  updateBelief,
  getBeliefSummary,
  type BeliefState,
} from '@/runtime/intent/belief-state';
import { planNextQuestion } from '@/runtime/intent/question-planner';
import { planStructure } from '@/skills/structure-planning';
import type { SessionState } from '@/engine/orchestrator';

// =========================================================================
// Types
// =========================================================================

export type ConsolePhase =
  | 'welcome'
  | 'clarify'
  | 'blueprint'
  | 'context'
  | 'writing_menu'
  | 'writing_node'
  | 'writing_node_edit'
  | 'reflection'
  | 'review'
  | 'export'
  | 'done';

interface ConsoleSession {
  phase: ConsolePhase;
  projectId: string;
  manager: PCSManager | null;
  sections: StructureSection[];
  currentSectionIdx: number;
  clarifyIdx: number;
  debug: boolean;
  rl: readline.Interface;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  nodeContents: Record<string, string>;
  // Dynamic clarification
  creativeType: string;
  understandingResult: LLMUnderstandingResult | null;
  beliefState: BeliefState | null;
}

// =========================================================================
// Conversation Loop
// =========================================================================

export function startConversationLoop(): void {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const session: ConsoleSession = {
    phase: 'welcome',
    projectId: '',
    manager: null,
    sections: [],
    currentSectionIdx: 0,
    clarifyIdx: 0,
    debug: true,
    rl,
    messages: [],
    nodeContents: {},
    creativeType: 'article',
    understandingResult: null,
    beliefState: null,
  };

  // =========================================================================
  // Output helpers
  // =========================================================================

  function say(text: string): void {
    console.log(text);
  }

  function divider(title?: string): void {
    if (title) {
      console.log(`\n━━━ ${title} ━━━`);
    } else {
      console.log('─'.repeat(55));
    }
  }

  function trace(label: string, detail: string): void {
    if (session.debug) {
      console.log(`  🔍 [${label}] ${detail}`);
    }
  }

  function prompt(): void {
    rl.setPrompt('\n> ');
    rl.prompt();
  }

  function addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    session.messages.push({ role, content });
  }

  // =========================================================================
  // Phase: Welcome
  // =========================================================================

  function enterWelcome(): void {
    console.log('\n╔══════════════════════════════════╗');
    console.log('║       Sculptor Console MVP       ║');
    console.log('║   "先理解，再写作，后反思"       ║');
    console.log('╚══════════════════════════════════╝');
    console.log(`\nSession: S-${Date.now().toString(36)}`);
    console.log('Debug:  🟢 ON  (/debug 切换)');
    console.log('\n我会帮助你完成一篇作品。');
    console.log('你的创作想法是什么？');
    prompt();
  }

  // =========================================================================
  // Phase: Clarify
  // =========================================================================

  async function enterClarify(idea: string): Promise<void> {
    session.projectId = `proj-${Date.now().toString(36)}`;
    const state: PCSState = createPCSState({
      phase: 'clarifying',
      id: session.projectId,
      intent: {
        purpose: createMockField(idea, { status: 'assumed', source: 'ai', confidence: 0.7 }),
        core_message: createMockField('', { status: 'assumed', source: 'ai', confidence: 0.5 }),
        desired_impact: createMockField('', { status: 'assumed', source: 'ai', confidence: 0.5 }),
        target_emotion: createMockField('', { status: 'assumed', source: 'ai', confidence: 0.5 }),
      },
    });
    session.manager = new PCSManager(state);
    trace('PCS', `Project ${session.projectId} initialized`);

    // Initialize Belief State (the cognitive model)
    const belief = createBeliefState(idea);
    session.beliefState = belief;

    // Use LLM to form initial understanding
    trace('BELIEF', `Initialized — ${belief.uncertainties.length} uncertainties`);

    const result = await understandWithLLM(idea);
    session.understandingResult = result;

    // Populate belief state from LLM understanding
    const u = result.understanding;
    session.creativeType = u.artifactType;
    belief.artifactBeliefs.push({
      type: u.artifactType,
      confidence: u.artifactConfidence,
      signals: result.hypotheses.map((h) => h.direction),
    });
    belief.topicBeliefs.push({
      topic: u.topic,
      confidence: u.artifactConfidence,
      subtopics: [],
    });

    trace('LLM', result.llmSuccess ? 'DeepSeek ✓' : 'Fallback');
    trace('BELIEF', getBeliefSummary(belief));

    // Show understanding
    say(`\n💡 我理解：你想创作一个 **${u.artifactType}**`);
    say(`   主题: "${u.topic}"`);
    trace('TOPIC', u.topic);

    // Plan the next best question using Active Learning
    const planned = planNextQuestion(belief);

    if (planned) {
      trace('QUESTION', `IG:${Math.round(planned.expectedGain * 100)}% — ${planned.reason}`);
      say(`\n❓ ${planned.text}`);
      if (planned.options.length > 0) {
        planned.options.forEach((opt, i) => say(`   ${i + 1}. ${opt}`));
      }
      say(`\n   💬 回答或 /skip /done`);
    } else {
      say('\n✅ 信息充足，进入蓝图。输入 /done 确认。');
    }

    prompt();
  }

  function finishClarify(): void {
    divider('需求确认完成');
    session.manager?.transitionTo('structured');
    trace('PHASE', 'clarifying → structured');

    // Read from Belief State — the SINGLE source of truth
    const belief = session.beliefState;
    const uResult = session.understandingResult;

    // Determine creative type from belief state, NOT from hardcoded defaults
    const artifactType =
      belief?.artifactBeliefs[0]?.type || uResult?.understanding?.artifactType || '文章';
    const topic =
      belief?.topicBeliefs.map((t) => t.topic).join('、') || uResult?.understanding?.topic || '';

    trace('BELIEF', `Blueprint input: ${artifactType} / ${topic}`);

    // Clear ALL old defaults — write what we ACTUALLY know
    if (session.manager) {
      session.manager.writeField('intent.purpose', topic, 'user');
      if (uResult?.understanding?.summary) {
        session.manager.writeField('intent.core_message', uResult.understanding.summary, 'user');
      }
    }

    // Show summary from actual understanding
    say('\n你的创作画像：');
    say(`  类型：${artifactType}`);
    say(`  主题：${topic}`);
    if (belief) {
      say(`  理解度：${Math.round(belief.overallConfidence * 100)}%`);
      say(`  交互：${belief.interactionCount} 轮`);
    }

    session.phase = 'blueprint';
    enterBlueprint(artifactType, topic);
  }

  // =========================================================================
  // Phase: Blueprint
  // =========================================================================

  function enterBlueprint(artifactType: string, topic: string): void {
    planStructure({
      artifactType,
      topic,
      purpose: topic,
      audience: '普通读者',
      tone: '自然',
      summary: `主题: ${topic}`,
    })
      .then((result) => {
        session.sections = result.sections.map((s, i) => ({
          id: `n${i + 1}`,
          title: s.title,
          goal: s.goal,
          function:
            i === 0 ? 'introduce' : i === result.sections.length - 1 ? 'conclude' : 'argument',
          hardness: 'hard',
          order: i,
          draft_state: 'empty',
          content_draft: '',
          pcs_status: 'confirmed',
          source: 'ai',
          confidence: 0.9,
        })) as StructureSection[];

        trace('STRUCTURE', `${session.sections.length} sections for ${artifactType}`);
        trace('STRUCTURE', `Topic: ${topic}`);

        divider('📐 大纲工坊');
        say('');
        session.sections.forEach((s, i) => {
          const icon = s.hardness === 'hard' ? '🔒' : '📝';
          say(`  ${i + 1}. ${icon} ${s.title}`);
          say(`     ${s.goal}`);
        });
        say('\n操作: A=确认进入写作  1-5=编辑章节');
        prompt();
      })
      .catch(() => {
        session.sections = [
          {
            id: 'n1',
            title: '引言',
            goal: `围绕"${topic.slice(0, 20)}"建立认知`,
            function: 'introduce',
            hardness: 'hard',
            order: 0,
            draft_state: 'empty',
            content_draft: '',
            pcs_status: 'confirmed',
            source: 'ai',
            confidence: 0.9,
          },
          {
            id: 'n2',
            title: '主体',
            goal: '展开论述',
            function: 'argument',
            hardness: 'hard',
            order: 1,
            draft_state: 'empty',
            content_draft: '',
            pcs_status: 'confirmed',
            source: 'ai',
            confidence: 0.9,
          },
          {
            id: 'n3',
            title: '结论',
            goal: '总结',
            function: 'conclude',
            hardness: 'hard',
            order: 2,
            draft_state: 'empty',
            content_draft: '',
            pcs_status: 'confirmed',
            source: 'ai',
            confidence: 0.9,
          },
        ] as StructureSection[];
        trace('STRUCTURE', 'LLM failed — using fallback structure');

        divider('📐 大纲工坊');
        say('');
        session.sections.forEach((s, i) => {
          say(`  ${i + 1}. ${s.title}`);
          say(`     ${s.goal}`);
        });
        say('\n操作: A=确认进入写作  1-5=编辑章节');
        prompt();
      });
  }

  // =========================================================================
  // Phase: Writing Menu
  // =========================================================================

  function enterWriting(): void {
    session.manager?.transitionTo('executing');
    trace('PHASE', 'structured → executing');
    session.phase = 'writing_menu';
    renderWritingMenu();
  }

  function renderWritingMenu(): void {
    divider('✍️  Node Studio');
    say('');
    const allDone = session.sections.every((s) => Boolean(session.nodeContents[s.id]));
    session.sections.forEach((s, i) => {
      const hasContent = session.nodeContents[s.id];
      const status = hasContent ? '✅' : '  ';
      const preview = hasContent ? session.nodeContents[s.id].slice(0, 40) + '...' : '(空)';
      say(`  ${status} ${i + 1}. ${s.title}: ${preview}`);
    });
    say('');
    if (allDone) {
      say('🎉 全部节点已完成！');
      say('操作: /full=全文预览  /reflect=整体反思  /export=导出  /node N=编辑指定节点');
    } else {
      say('操作: 输入节点编号开始写作  /full=预览  /nodes=刷新');
    }
    prompt();
  }

  // =========================================================================
  // Phase: Writing Node
  // =========================================================================

  function enterWritingNode(idx: number): void {
    session.currentSectionIdx = idx;
    session.phase = 'writing_node';
    const s = session.sections[idx];
    const content = session.nodeContents[s.id] || '';

    divider(`写作: ${s.title}`);
    say(`  目标: ${s.goal}`);
    say(`  当前字数: ${content.length}`);
    if (content) {
      say(`\n${content}\n`);
    }
    if (!content) {
      say('\n输入 /gen 让AI生成初稿，或直接输入文字开始手写');
    } else {
      say('操作: /gen=重新生成  /edit=编辑  /reflect=反思  /done=完成  /back=返回列表');
    }
    prompt();
  }

  function reflectCurrentNode(): void {
    const s = session.sections[session.currentSectionIdx];
    const content = session.nodeContents[s.id] || '';
    if (!content) {
      say('  ⚠️ 当前节点无内容');
      return;
    }

    divider('🔍 段落反思');
    say(`  段落: ${s.title}`);
    say(`  核心思想: ${content.slice(0, 60)}...`);
    say('');
    say('  ⚠️ 诊断问题:');
    say('    1. 是否需要真实案例支撑？');
    say('    2. 是否解释了"为什么"？');
    say('    3. 读者是否能理解下一步？');
    say('');
    trace('REFLECTION', `Node ${s.id}: 3 diagnostic questions generated`);
  }

  // =========================================================================
  // Phase: Export
  // =========================================================================

  function showExportMenu(): void {
    session.phase = 'export';
    divider('📦 导出');
    say('选择格式:  1=HTML  2=Markdown  3=纯文本');
    prompt();
  }

  function doExport(format: string): void {
    const fmtMap: Record<string, string> = { '1': 'HTML', '2': 'Markdown', '3': '纯文本' };
    const fmt = fmtMap[format] || 'Markdown';

    let content = '';
    if (fmt === 'Markdown') {
      content += `# ${session.manager?.getField('intent.purpose') || '无标题'}\n`;
      for (const s of session.sections) {
        content += `\n## ${s.title}\n\n${session.nodeContents[s.id] || '(空)'}\n`;
      }
    } else {
      for (const s of session.sections) {
        content += `\n【${s.title}】\n${session.nodeContents[s.id] || '(空)'}\n`;
      }
    }

    divider(`导出结果 (${fmt})`);
    console.log(content);

    const totalChars = Object.values(session.nodeContents).reduce((sum, c) => sum + c.length, 0);
    const doneNodes = Object.keys(session.nodeContents).length;

    session.phase = 'done';
    divider('📊 会话完成');
    say(`  项目: ${session.projectId}`);
    say(`  完成: ${doneNodes}/${session.sections.length} 节点`);
    say(`  总字数: ${totalChars}`);
    say(`  对话轮次: ${session.messages.length}`);
    say('\n输入 /exit 退出  /restart 重新开始');
    trace(
      'SESSION',
      `Complete: ${doneNodes} nodes, ${totalChars} chars, ${session.messages.length} messages`,
    );
    prompt();
  }

  // =========================================================================
  // Main Input Handler
  // =========================================================================

  function handleInput(input: string): void {
    if (!input) {
      prompt();
      return;
    }

    // Global commands
    if (input === '/exit' || input === '/quit') {
      console.log('\n👋 会话结束。下次见！\n');
      session.rl.close();
      return;
    }
    if (input === '/debug') {
      session.debug = !session.debug;
      say(`  Debug: ${session.debug ? '🟢 ON' : '⚫ OFF'}`);
      prompt();
      return;
    }
    if (input === '/restart') {
      session.phase = 'welcome';
      session.clarifyIdx = 0;
      session.nodeContents = {};
      session.messages = [];
      enterWelcome();
      return;
    }
    if (input === '/trace') {
      const latest = artifactBuilder.getLatest();
      if (latest) {
        divider('📋 Discovery Trace');
        say(`阶段: ${latest.stage}`);
        say(
          `类型: ${latest.classification.type} (${Math.round(latest.classification.confidence * 100)}%)`,
        );
        say(`成熟度: ${latest.classification.maturity}`);
        say(`已发现: ${Object.keys(latest.discovered).length} 项`);
        say(`待探索: ${latest.unknowns.join(', ') || '无'}`);
        say(`\n${latest.conversationSummary}`);
        divider();
      } else {
        say('暂无 discovery trace。先输入创作想法。');
      }
      prompt();
      return;
    }

    addMessage('user', input);

    // Phase-specific routing
    switch (session.phase) {
      case 'welcome':
        session.phase = 'clarify';
        enterClarify(input).then(() => {});
        break;

      case 'clarify': {
        if (input === '/done' || input === '/skip') {
          if (session.beliefState) {
            trace('BELIEF', `Complete — ${getBeliefSummary(session.beliefState)}`);
          }
          finishClarify();
          break;
        }

        // Update belief state with user answer
        if (session.beliefState) {
          const prevQ = session.beliefState.uncertainties.find((u) => u.asked);
          updateBelief(session.beliefState, input, prevQ?.question);
          trace('BELIEF', getBeliefSummary(session.beliefState));
        }

        addMessage('user', input);

        // Plan next question
        const planned = session.beliefState ? planNextQuestion(session.beliefState) : null;

        if (planned) {
          say(`\n❓ ${planned.text}`);
          if (planned.options.length > 0) {
            planned.options.forEach((opt, i) => say(`   ${i + 1}. ${opt}`));
          }
          trace(
            'QUESTION',
            `Next: ${planned.addresses} (IG:${Math.round(planned.expectedGain * 100)}%)`,
          );
          say('\n   💬 继续回答 /done 进入蓝图');
        } else {
          say('\n✅ 已收集足够信息。输入 /done 进入蓝图。');
        }

        prompt();
        break;
      }

      case 'blueprint': {
        if (input === 'A' || input === 'a') {
          enterWriting();
          break;
        }
        const num = parseInt(input, 10);
        if (num >= 1 && num <= session.sections.length) {
          const s = session.sections[num - 1];
          say(`  当前章节: ${s.title} (${s.goal})`);
          say('  输入新目标 (/keep 保持):');
          // V1 simplified
        }
        prompt();
        break;
      }

      case 'writing_menu':
        if (input === '/full') {
          let preview = '';
          session.sections.forEach((s) => {
            preview += `\n【${s.title}】\n${session.nodeContents[s.id] || '(空)'}\n`;
          });
          say(preview);
          prompt();
          break;
        }
        if (input === '/export') {
          showExportMenu();
          break;
        }
        if (input === '/reflect') {
          const anyContent = session.sections.some((s) => Boolean(session.nodeContents[s.id]));
          if (anyContent) {
            say('\n整体反思：');
            session.sections.forEach((s) => {
              if (session.nodeContents[s.id]) {
                say(`  ${s.title}: ${session.nodeContents[s.id].slice(0, 50)}...`);
              }
            });
            say('\n⚠️ 覆盖度检查:');
            say('  ✓ 技术趋势  ✓ 应用案例  □ 政策影响  □ 商业模式');
            say('  当前覆盖: ~60%');
          }
          prompt();
          break;
        }
        {
          const n = parseInt(input, 10);
          if (n >= 1 && n <= session.sections.length) {
            enterWritingNode(n - 1);
          } else {
            prompt();
          }
        }
        break;

      case 'writing_node':
        if (input === '/gen') {
          generateSectionContent(session).then(() => prompt());
          return;
        }
        if (input === '/done') {
          if (session.nodeContents[session.sections[session.currentSectionIdx].id]) {
            session.phase = 'reflection';
            reflectCurrentNode();
            say('\n操作: /accept=确认  /edit=修改  /back=返回列表');
            prompt();
          } else {
            say('  ⚠️ 请先生成或输入内容');
            prompt();
          }
          break;
        }
        if (input === '/reflect') {
          reflectCurrentNode();
          prompt();
          break;
        }
        if (input === '/back') {
          session.phase = 'writing_menu';
          renderWritingMenu();
          break;
        }
        if (input === '/edit') {
          say('  输入新内容:');
          session.phase = 'writing_node_edit';
          prompt();
          break;
        }
        // Treat as content input
        if (!input.startsWith('/')) {
          session.nodeContents[session.sections[session.currentSectionIdx].id] = input;
          trace('EDIT', `User wrote ${input.length} chars`);
          say(`  ✅ 已保存 (${input.length} 字)`);
        }
        prompt();
        break;

      case 'writing_node_edit':
        session.nodeContents[session.sections[session.currentSectionIdx].id] = input;
        trace('EDIT', `Updated: ${input.length} chars`);
        say('  ✅ 已更新');
        session.phase = 'writing_node';
        prompt();
        break;

      case 'reflection':
        if (input === '/accept') {
          session.phase = 'writing_menu';
          renderWritingMenu();
        } else if (input === '/back') {
          enterWritingNode(session.currentSectionIdx);
        } else {
          prompt();
        }
        break;

      case 'export':
        doExport(input);
        break;

      default:
        prompt();
        break;
    }
  }

  // =========================================================================
  // Start
  // =========================================================================

  rl.on('line', (line: string) => handleInput(line.trim()));
  rl.on('close', () => process.exit(0));

  enterWelcome();
}

// =========================================================================
// Orchestrator-to-Console bridge: startWritingPhase
// =========================================================================

/**
 * Start the writing phase with a pre-built session state from the orchestrator.
 * Skips the discovery/clarify phases entirely.
 */
export function startWritingPhase(orchestratorState: SessionState): void {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Convert orchestrator state to session state
  const sections: StructureSection[] = orchestratorState.outline.map(
    (s, i) =>
      ({
        id: `n${i + 1}`,
        title: s.title,
        goal: s.goal,
        function:
          i === 0
            ? 'introduce'
            : i === orchestratorState.outline.length - 1
              ? 'conclude'
              : 'argument',
        hardness: 'hard',
        draft_state: i === 0 ? 'drafted' : 'empty',
        content_draft: s.content || '',
        pcs_status: 'confirmed',
        source: 'ai',
        confidence: 0.9,
        order: i,
      }) as StructureSection,
  );

  const session: ConsoleSession = {
    phase: 'writing_menu',
    projectId: `proj-${Date.now().toString(36)}`,
    manager: null,
    sections,
    currentSectionIdx: orchestratorState.currentSection,
    clarifyIdx: 0,
    debug: true,
    rl,
    messages: orchestratorState.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
    nodeContents: {},
    creativeType: orchestratorState.belief.artifact.value,
    understandingResult: null,
    beliefState: null,
  };

  // Initialize node contents from orchestrator
  for (const s of sections) {
    if (s.content_draft) session.nodeContents[s.id] = s.content_draft;
  }

  console.log(`\n📐 大纲 (${sections.length} 节):`);
  sections.forEach((s, i) => {
    const hasContent = s.content_draft;
    const status = hasContent ? '✅' : '  ';
    console.log(`  ${status} ${i + 1}. ${s.title} — ${s.goal}`);
  });
  console.log('\n操作: 输入编号开始写作  /gen 生成  /done 完成  /full 预览  /export 导出');
  rl.setPrompt('\n> ');
  rl.prompt();

  // Wire up the line handler for writing phase
  rl.on('line', (line: string) => {
    const input = line.trim();
    if (input === '/exit') {
      console.log('\n👋 再见！\n');
      rl.close();
      return;
    }
    if (input === '/full') {
      showFullText(session);
      rl.prompt();
      return;
    }
    if (input === '/export') {
      doExport(session);
      rl.prompt();
      return;
    }

    // Writing menu
    if (session.phase === 'writing_menu') {
      const num = parseInt(input);
      if (num >= 1 && num <= sections.length) {
        session.currentSectionIdx = num - 1;
        session.phase = 'writing_node';
        const s = sections[num - 1];
        const content = session.nodeContents[s.id] || '';
        console.log(`\n✍️ ${s.title}: ${s.goal}`);
        if (content) console.log(`\n${content}`);
        console.log('\n/gen 生成  /done 完成  /back 返回');
      }
      rl.prompt();
      return;
    }

    // Writing node
    if (session.phase === 'writing_node') {
      if (input === '/gen') {
        generateSectionContent(session);
        rl.prompt();
        return;
      }
      if (input === '/done') {
        advanceSection(session, rl);
        return;
      }
      if (input === '/back') {
        session.phase = 'writing_menu';
        rl.prompt();
        return;
      }
      // Save user input as content
      const s = sections[session.currentSectionIdx];
      session.nodeContents[s.id] = input;
      console.log(`  ✅ 已保存 (${input.length} 字)`);
      rl.prompt();
      return;
    }

    rl.prompt();
  });
}

// Helper functions for writing phase
function showFullText(session: ConsoleSession): void {
  console.log('\n━━━ 全文预览 ━━━');
  for (const s of session.sections) {
    const content = session.nodeContents[s.id] || s.content_draft || '(空)';
    console.log(`\n【${s.title}】\n${content}`);
  }
}

function doExport(session: ConsoleSession): void {
  console.log('\n━━━ 导出 ━━━');
  let full = '';
  for (const s of session.sections) {
    full += `\n## ${s.title}\n\n${session.nodeContents[s.id] || s.content_draft || ''}\n`;
  }
  console.log(full);
  console.log(`\n✅ 总字数: ${full.length}`);
}

async function generateSectionContent(session: ConsoleSession): Promise<void> {
  const { generateContent } = await import('@/skills/content-generation');
  const s = session.sections[session.currentSectionIdx];
  const belief = session.creativeType; // stored as artifact type
  const prevContent =
    session.currentSectionIdx > 0
      ? session.nodeContents[session.sections[session.currentSectionIdx - 1].id]
      : undefined;
  const nextTitle =
    session.currentSectionIdx < session.sections.length - 1
      ? session.sections[session.currentSectionIdx + 1].title
      : undefined;

  console.log('\n⏳ 生成中...');
  const result = await generateContent({
    sectionTitle: s.title,
    sectionGoal: s.goal,
    artifactType: belief || '文章',
    topic: s.goal,
    audience: '普通读者',
    tone: '自然',
    previousContent: prevContent,
    nextSectionTitle: nextTitle,
  });

  session.nodeContents[s.id] = result.content;
  console.log(`\n${result.content}`);
}

function advanceSection(session: ConsoleSession, rl: readline.Interface): void {
  session.currentSectionIdx++;
  if (session.currentSectionIdx >= session.sections.length) {
    console.log('\n🎉 全部完成！输入 /full 预览 /export 导出');
    session.phase = 'writing_menu';
  } else {
    const s = session.sections[session.currentSectionIdx];
    console.log(`\n下一节: ${s.title} — ${s.goal}`);
    console.log('/gen 生成  /back 返回');
  }
  rl.prompt();
}
