#!/usr/bin/env tsx

/**
 * Sculptor Console MVP — Main Entry
 *
 * A real interactive creative writing OS in the terminal.
 * Not a test runner. Not a batch pipeline.
 * A product users interact with to create complete works.
 *
 * Usage:
 *   npm run sculptor
 *   npx tsx src/console/sculptor.ts
 */

import { startConversationLoop } from './runtime/conversation-loop';

// Parse command line args
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Sculptor Console MVP');
  console.log('  npm run sculptor          Interactive mode');
  console.log('  --debug                   Start with debug on (default)');
  console.log('  --no-debug                Start with debug off');
  process.exit(0);
}

// Start the conversation
console.clear();
startConversationLoop();
