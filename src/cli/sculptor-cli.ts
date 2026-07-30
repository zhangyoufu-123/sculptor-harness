#!/usr/bin/env tsx

import { Command } from 'commander';
import { startREPL } from './repl';
import { runWorkflow } from './commands/workflow-run';
import { inspectEvents, inspectDecisions, inspectState } from './commands/inspect';

const program = new Command();

program.name('sculptor').description('Sculptor Runtime CLI — AI写作创作运行时').version('1.0.0');

// Default: interactive REPL
program
  .command('repl', { isDefault: true })
  .description('启动交互式 REPL')
  .action(() => {
    startREPL();
  });

// Batch workflow
program
  .command('run')
  .description('运行全流程测试')
  .argument('[idea]', '创作主题', 'AI教育的未来')
  .option('-d, --debug', '启用 Debug 模式，显示完整执行链路')
  .option('-v, --verbose', '详细输出')
  .option('--full-pipeline', '运行完整 Phase 0→5 流程')
  .action(
    async (
      idea: string,
      options: { debug?: boolean; verbose?: boolean; fullPipeline?: boolean },
    ) => {
      await runWorkflow(idea, {
        debug: options.debug || false,
        verbose: options.verbose || false,
      });
    },
  );

// Inspect commands
program
  .command('inspect')
  .description('查看内部记录')
  .argument('<target>', 'events | decisions | state')
  .action(async (target: string) => {
    switch (target) {
      case 'events':
        await inspectEvents();
        break;
      case 'decisions':
        await inspectDecisions(null);
        break;
      case 'state':
        await inspectState(null);
        break;
      default:
        console.log(`未知目标: ${target}。可用: events, decisions, state`);
    }
  });

// Replay
program
  .command('replay')
  .description('回放会话')
  .argument('[sessionId]', '会话 ID')
  .action((sessionId?: string) => {
    console.log(`\n⏪ 回放模式（V1: 回放功能待实现）`);
    console.log(`   Session: ${sessionId || 'latest'}\n`);
  });

// Parse — isDefault on 'repl' handles the no-args case
program.parse();
