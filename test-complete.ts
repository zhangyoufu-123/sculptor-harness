// Load .env.local before anything else
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { SculptorOrchestrator } from '@/engine/orchestrator';

async function main() {
  const initialIdea =
    '我想写一篇散文《相逢长出草》，关于人与人之间的相遇像种子一样，不经意间就生长出深厚的情感';

  const orch = new SculptorOrchestrator(initialIdea);

  // ============ DISCOVERY PHASE ============

  // Step 1: Discovery — provide material
  console.log('=== Step 1: Discovery ===');
  let r = await orch.processInput(initialIdea);
  console.log(r.slice(0, 200));

  // Step 2: Provide more details
  r = await orch.processInput(
    '核心意象是草——不需要刻意照料，自己就会生长。就像初中时的同桌，毕业后再也没见过，但那份回忆一直在心里',
  );
  console.log('\n=== Step 2: More details ===');
  console.log(r.slice(0, 200));

  // Step 3: Generate outline
  r = await orch.processInput('/outline');
  console.log('\n=== Step 3: Outline ===');
  console.log(r);

  // Step 4: Confirm outline → enter writing
  r = await orch.processInput('ok');
  console.log('\n=== Step 4: Enter Writing ===');
  console.log(r.slice(0, 300));

  // ============ WRITING PHASE — Material Collection ============

  // The PhaseGate starts in COLLECTING and needs ≥3 material items before /gen works.
  // Provide 3 material items (non-command text >10 chars each).

  // Step 5: Material 1
  r = await orch.processInput(
    '那是一个九月的下午，教室里刚换了新座位。我注意到旁边坐着一个安静的女孩，课本的边角都卷起来了',
  );
  console.log('\n=== Step 5: Material 1 ===');
  console.log(r);

  // Step 6: Material 2
  r = await orch.processInput(
    '她有个习惯，会在草稿纸的空白处画小花。每次数学课她都在计算题的旁边画一朵五瓣的小花，从来不画叶子',
  );
  console.log('\n=== Step 6: Material 2 ===');
  console.log(r);

  // Step 7: Material 3
  r = await orch.processInput(
    '毕业那天下了小雨，操场上没什么人。我看到她站在篮球架旁边，手里攥着一包纸巾，最后也没有给我，就各自散了',
  );
  console.log('\n=== Step 7: Material 3 ===');
  console.log(r);

  // ============ GENERATION PHASE ============

  // Step 8: Generate section 1
  r = await orch.processInput('/gen');
  console.log('\n=== Step 8: Section 1 (gen) ===');
  console.log(r.slice(0, 500));

  // Step 9: Accept section 1
  r = await orch.processInput('/accept');
  console.log('\n=== Step 9: Accept S1 ===');
  console.log(r.slice(0, 200));

  // Step 10: Generate section 2
  r = await orch.processInput('/gen');
  console.log('\n=== Step 10: Section 2 (gen) ===');
  console.log(r.slice(0, 500));

  // Step 11: Accept section 2
  r = await orch.processInput('/accept');
  console.log('\n=== Step 11: Accept S2 ===');
  console.log(r.slice(0, 200));

  // Step 12: Generate section 3
  r = await orch.processInput('/gen');
  console.log('\n=== Step 12: Section 3 (gen) ===');
  console.log(r.slice(0, 500));

  // Step 13: Accept section 3
  r = await orch.processInput('/accept');
  console.log('\n=== Step 13: Accept S3 ===');
  console.log(r.slice(0, 200));

  // Step 14: Generate section 4
  r = await orch.processInput('/gen');
  console.log('\n=== Step 14: Section 4 (gen) ===');
  console.log(r.slice(0, 500));

  // Step 15: Accept section 4
  r = await orch.processInput('/accept');
  console.log('\n=== Step 15: Accept S4 (ALL COMPLETE) ===');
  console.log(r);
}

main().catch(console.error);
