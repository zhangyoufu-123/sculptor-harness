#!/usr/bin/env tsx

// Load .env.local before anything else
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

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
    if (state.phase === 'outline' && state.outline.length > 0) {
      console.log('\n📐 已生成大纲:');
      state.outline.forEach((s, i) => console.log(`  ${i + 1}. ${s.title} — ${s.goal}`));
      console.log('\n输入 "确认" 开始写作，或提出修改意见。');
    }
    if (state.phase === 'writing') {
      console.log('\n进入写作阶段...');
      rl.close();
      startWritingPhase(state);
      return;
    }

    // Guard: don't prompt on closed readline (piped input)
    try {
      rl.prompt();
    } catch {
      /* piped input — ignore */
    }
  });
}

let _orchestrator: SculptorOrchestrator | null = null;
main();
