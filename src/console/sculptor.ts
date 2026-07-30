#!/usr/bin/env tsx

/**
 * Sculptor Console — Agent Collaboration Cluster
 *
 * Uses SculptorOrchestrator for discovery/outline,
 * then hands off to conversation-loop for writing.
 */

import { SculptorOrchestrator } from '@/engine/orchestrator';
import { startWritingPhase } from './runtime/conversation-loop';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Sculptor Console');
  console.log('  npm run sculptor    Interactive mode');
  process.exit(0);
}

async function main() {
  console.clear();
  console.log('\n╔══════════════════════════════════╗');
  console.log('║       Sculptor — AI 创作伙伴     ║');
  console.log('║    "理解你，再帮你表达"          ║');
  console.log('╚══════════════════════════════════╝');

  // Step 1: Discovery phase via orchestrator
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n你好！想创作什么？');
  rl.setPrompt('\n> ');
  rl.prompt();

  rl.on('line', async (input: string) => {
    const text = input.trim();
    if (text === '/exit' || text === '/quit') {
      console.log('\n👋 再见！\n');
      rl.close();
      return;
    }

    // Create orchestrator on first input
    if (!_orchestrator) {
      _orchestrator = new SculptorOrchestrator(text);
    }

    const reply = await _orchestrator!.processInput(text);
    console.log(`\n${reply}`);

    // Check if ready for writing phase
    const state = _orchestrator!.getState();
    if (state.phase === 'writing') {
      console.log('\n进入写作阶段...');
      rl.close();
      startWritingPhase(state);
      return;
    }

    rl.prompt();
  });
}

let _orchestrator: SculptorOrchestrator | null = null;
main();
