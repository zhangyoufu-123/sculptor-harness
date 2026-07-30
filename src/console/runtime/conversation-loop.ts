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
import type { PCSState, StructureSection, DraftState, NodeFunction } from '@/pcs/types';

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
  // Conversation memory
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  // Writing state
  nodeContents: Record<string, string>;
}

// =========================================================================
// Clarification dimensions (ordered interview)
// =========================================================================

interface ClarifyDimension {
  key: string;
  label: string;
  field: string;
  options: string[];
}

const CLARIFY_DIMS: ClarifyDimension[] = [
  {
    key: 'purpose',
    label: '创作目的',
    field: 'intent.purpose',
    options: ['科普AI教育应用', '分析商业机会', '探讨教师角色变化', '论证AI教育必要性'],
  },
  {
    key: 'core_message',
    label: '核心观点',
    field: 'intent.core_message',
    options: [
      'AI不会替代教师但会重塑教育',
      'AI教育是下一个产业风口',
      '教育者应主动拥抱AI',
      'AI教育的核心是个性化',
    ],
  },
  {
    key: 'tone',
    label: '语气风格',
    field: 'expression.tone',
    options: ['专业分析型', '轻松科普型', '故事叙事型', '尖锐评论型'],
  },
  {
    key: 'audience',
    label: '目标读者',
    field: 'audience.audience_type',
    options: ['教育从业者', '普通读者', '投资人', '技术专家'],
  },
  {
    key: 'knowledge',
    label: '读者水平',
    field: 'audience.knowledge_level',
    options: ['入门', '中级', '专家'],
  },
  {
    key: 'format',
    label: '交付格式',
    field: 'constraint.format',
    options: ['公众号文章', '学术论文', '商业报告', '演讲稿'],
  },
  {
    key: 'length',
    label: '字数范围',
    field: 'constraint.length_min',
    options: ['1000字', '2000-3000字', '5000字以上'],
  },
  {
    key: 'success',
    label: '成功标准',
    field: 'intent.desired_impact',
    options: ['读者转发', '通过审稿', '说服读者', '建立权威'],
  },
];

// =========================================================================
// Blueprint (preset sections, adjustable)
// =========================================================================

interface BlueprintItem {
  id: string;
  title: string;
  goal: string;
  func: NodeFunction;
  hard: 'hard' | 'soft';
}

const BLUEPRINT: BlueprintItem[] = [
  { id: 'n1', title: '引言', goal: '建立读者对AI教育趋势的认知', func: 'introduce', hard: 'hard' },
  { id: 'n2', title: '技术分析', goal: '解释关键AI技术及教育应用', func: 'argument', hard: 'hard' },
  { id: 'n3', title: '案例研究', goal: '提供真实AI教育成功案例', func: 'evidence', hard: 'soft' },
  { id: 'n4', title: '挑战与风险', goal: '客观呈现限制和风险', func: 'counter', hard: 'hard' },
  { id: 'n5', title: '结论与建议', goal: '给出可执行的行动建议', func: 'conclude', hard: 'hard' },
];

// =========================================================================
// Mock content by section title
// =========================================================================

const MOCK_CONTENT: Record<string, string> = {
  引言: '人工智能技术正以前所未有的速度渗透到各行各业。教育领域，作为社会发展的基石，面临着深刻的变革。过去五年间，全球教育科技投资增长了300%，AI驱动的个性化学习成为最受关注的赛道。',
  技术分析:
    '自适应学习系统是AI教育的技术核心。通过实时分析学生的学习行为、知识盲区和认知风格，系统能够动态调整教学内容和难度。自然语言处理和知识图谱技术已在智能答疑、自动批改和学情分析三个方向取得突破。',
  案例研究:
    '以可汗学院的Khanmigo助手为例，该系统已服务超过50万名学生。数据显示，使用AI辅助学习的学生在数学科目上平均提升了23%的成绩。中国好未来教育集团的AI教师已覆盖300多个城市的线下课堂。',
  挑战与风险:
    '然而，AI在教育领域的大规模应用仍面临三大核心挑战：数据隐私保护、算法偏见问题、以及教师角色的重新定义。如何在个性化服务和隐私保护之间取得平衡，是行业必须回答的问题。',
  结论与建议:
    '基于以上分析，教育从业者应采取渐进策略整合AI：第一步，将AI引入批改和练习等重复性工作；第二步，建立校内AI素养培训体系；第三步，制定数据伦理规范。教师不会被AI替代，但善用AI的教师将替代不用的教师。',
};

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
    debug: true, // DEFAULT ON for MVP
    rl,
    messages: [],
    nodeContents: {},
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

  function enterClarify(idea: string): void {
    // Initialize PCS
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
    trace('INTENT', `Parsed idea: "${idea.slice(0, 50)}"`);

    say(`\n收到："${idea}"`);
    say('\n我先理解你的目标。确认几个关键维度：');
    showClarifyQuestion();
  }

  function showClarifyQuestion(): void {
    const dim = CLARIFY_DIMS[session.clarifyIdx];
    if (!dim) return;

    divider(`${session.clarifyIdx + 1}/${CLARIFY_DIMS.length}  ${dim.label}`);
    dim.options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
    say('\n选择编号或直接输入自定义内容 (/skip 跳过 /back 返回上一项)');
    prompt();
  }

  function handleClarifyAnswer(input: string): void {
    const dim = CLARIFY_DIMS[session.clarifyIdx];
    if (!dim || !session.manager) return;

    let value = input;
    if (input === '/skip') {
      value = dim.options[0];
    } else if (input === '/back' && session.clarifyIdx > 0) {
      session.clarifyIdx--;
      showClarifyQuestion();
      return;
    } else {
      const num = parseInt(input, 10);
      if (num >= 1 && num <= dim.options.length) value = dim.options[num - 1];
    }

    // Write to PCS
    const result = session.manager.writeField(dim.field, value, 'user');
    trace('FIELD', `${dim.field} = "${value}" ${result.success ? '✓' : '✗'}`);

    // Handle special: length needs actual number
    if (dim.key === 'length') {
      const lenMap: Record<string, number> = {
        '1000字': 1000,
        '2000-3000字': 2500,
        '5000字以上': 5000,
      };
      session.manager.writeField('constraint.length_min', lenMap[value] || 1000, 'user');
    }

    addMessage('assistant', `${dim.label}: ${value}`);
    say(`  ✅ ${dim.label} → ${value}`);

    session.clarifyIdx++;
    if (session.clarifyIdx >= CLARIFY_DIMS.length) {
      finishClarify();
    } else {
      showClarifyQuestion();
    }
  }

  function finishClarify(): void {
    divider('需求确认完成');
    session.manager?.transitionTo('structured');
    trace('PHASE', 'clarifying → structured');

    // Show summary
    say('\n你的创作画像：');
    say(`  目的：${session.manager?.getField('intent.purpose')}`);
    say(`  观点：${session.manager?.getField('intent.core_message')}`);
    say(`  风格：${session.manager?.getField('expression.tone')}`);
    say(`  读者：${session.manager?.getField('audience.audience_type')}`);
    say(`  格式：${session.manager?.getField('constraint.format')}`);

    // Enter blueprint
    session.phase = 'blueprint';
    enterBlueprint();
  }

  // =========================================================================
  // Phase: Blueprint
  // =========================================================================

  function enterBlueprint(): void {
    session.sections = BLUEPRINT.map((s, i): StructureSection => ({
      id: s.id,
      title: s.title,
      goal: s.goal,
      function: s.func,
      hardness: s.hard,
      draft_state: 'empty' as DraftState,
      content_draft: '',
      pcs_status: 'confirmed' as const,
      source: 'ai',
      confidence: 0.9,
      order: i,
    }));
    trace('STRUCTURE', `${session.sections.length} sections generated`);

    divider('📐 大纲工坊');
    say('');
    session.sections.forEach((s, i) => {
      const icon = s.hardness === 'hard' ? '🔒' : '📝';
      say(`  ${i + 1}. ${icon} ${s.title}`);
      say(`     ${s.goal}`);
    });
    say('\n操作: A=确认进入写作  1-5=编辑章节  +=新增  -=删除');
    prompt();
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

  function generateContent(): void {
    const s = session.sections[session.currentSectionIdx];
    const text = MOCK_CONTENT[s.title] || `关于"${s.goal}"的生成内容。`;
    session.nodeContents[s.id] = text;
    trace('GENERATE', `Node ${s.id}: ${text.length} chars`);
    say(`\n✍️ AI生成:\n\n${text}\n`);
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

    addMessage('user', input);

    // Phase-specific routing
    switch (session.phase) {
      case 'welcome':
        session.phase = 'clarify';
        enterClarify(input);
        break;

      case 'clarify':
        handleClarifyAnswer(input);
        break;

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
          generateContent();
          prompt();
          break;
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
