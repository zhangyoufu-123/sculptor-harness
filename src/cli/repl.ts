import * as readline from 'readline';
import { FullPipelineRunner } from './harness';
import { debugTracer } from './debug-tracer';

type REPLPhase = 'idea' | 'clarify' | 'blueprint' | 'write' | 'review' | 'export' | 'done';

interface REPLState {
  phase: REPLPhase;
  idea: string;
  projectId: string;
  runner: FullPipelineRunner | null;
  result: any;
  debugEnabled: boolean;
}

export function startREPL(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n> ',
  });

  const state: REPLState = {
    phase: 'idea',
    idea: '',
    projectId: '',
    runner: null,
    result: null,
    debugEnabled: false,
  };

  console.log('\n╔══════════════════════════════════╗');
  console.log('║       Sculptor Runtime v1        ║');
  console.log('║    "先理解，再写作，后反思"        ║');
  console.log('╚══════════════════════════════════╝');
  console.log('\n请输入创作主题（或输入 /help 查看命令）：');

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();

    if (input === '/exit' || input === '/quit') {
      console.log('\n👋 再见！\n');
      rl.close();
      return;
    }

    if (input === '/help') {
      showHelp();
      rl.prompt();
      return;
    }

    if (input === '/debug') {
      state.debugEnabled = !state.debugEnabled;
      debugTracer.setEnabled(state.debugEnabled);
      console.log(`Debug mode: ${state.debugEnabled ? 'ON' : 'OFF'}`);
      rl.prompt();
      return;
    }

    if (input.startsWith('/run')) {
      const idea = input.replace('/run', '').trim() || state.idea || 'AI教育的未来';
      state.runner = new FullPipelineRunner(state.debugEnabled);
      state.result = await state.runner.run(idea);
      if (state.result.success) {
        console.log('\n✅ 全流程完成！输入 /inspect 查看详情');
      } else {
        console.log('\n❌ 流程失败：', state.result.errors.join(', '));
      }
      rl.prompt();
      return;
    }

    if (input === '/inspect') {
      if (state.result) {
        console.log(`\n项目: ${state.result.projectId}`);
        console.log(`阶段: ${state.result.phases.join(' → ')}`);
        console.log(`耗时: ${(state.result.duration / 1000).toFixed(1)}s`);
      } else {
        console.log('\n暂无结果。输入 /run 启动流程');
      }
      rl.prompt();
      return;
    }

    if (input === '/trace') {
      const trace = debugTracer.getTraceLog();
      console.log(trace || '\n暂无 trace 记录');
      rl.prompt();
      return;
    }

    // Default: treat as idea input
    state.idea = input;
    state.phase = 'idea';
    console.log(`\n✅ 已接收创作主题: "${state.idea}"`);
    console.log('输入 /run 开始全流程测试，或 /help 查看更多命令');
    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

function showHelp(): void {
  console.log('\n┌────────────────────────────────────┐');
  console.log('│  Sculptor CLI 命令                  │');
  console.log('├────────────────────────────────────┤');
  console.log('│  <文本>      输入创作主题            │');
  console.log('│  /run [主题] 启动全流程测试           │');
  console.log('│  /inspect    查看当前结果             │');
  console.log('│  /trace      查看执行链路             │');
  console.log('│  /debug      切换Debug模式            │');
  console.log('│  /replay     回放上次会话             │');
  console.log('│  /help       显示帮助                 │');
  console.log('│  /exit       退出                     │');
  console.log('└────────────────────────────────────┘\n');
}
