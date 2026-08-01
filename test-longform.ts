// Load .env.local before anything else
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { SculptorOrchestrator } from './src/engine/orchestrator';

async function main() {
  console.log('═══ Sculptor 长篇深度测试 ═══\n');
  const orch = new SculptorOrchestrator('AI时代的教育变革——从知识传授到能力培养');

  // === DISCOVERY PHASE ===
  console.log('=== Phase 1: Discovery ===\n');

  let r = await orch.processInput(
    '我想写一篇深度长文，探讨AI时代教育应该如何变革。核心观点是：当AI可以完成大部分知识性工作，教育的重点必须从传授知识转向培养能力——批判性思维、创造力、协作能力、以及终身学习的习惯。',
  );
  console.log('R1:', r.slice(0, 400), '...\n');

  r = await orch.processInput(
    '读者是教育工作者、家长、以及关心教育未来的普通人。语气要理性但不晦涩，有数据支撑也有情感共鸣。文章类型是面向大众的深度分析文章。',
  );
  console.log('R2:', r.slice(0, 300), '...\n');

  r = await orch.processInput(
    '我想结合具体案例：芬兰的教育改革经验、中国的双减政策、美国项目式学习、以及AI在课堂中的实际应用——比如可汗学院的AI辅导。还要引用教育学者的观点，比如约翰·杜威的"做中学"和肯·罗宾逊的创造力教育理念。',
  );
  console.log('R3:', r.slice(0, 300), '...\n');

  // === OUTLINE PHASE ===
  console.log('=== Phase 2: Outline ===\n');

  r = await orch.processInput('/outline');
  console.log('OUTLINE:\n', r, '\n');

  // Expand outline via natural language feedback in outline phase
  // Concise prompt is key — LLM collapses on overly long/complex instructions
  let outlineLen = orch.getState().outline.length;

  if (outlineLen < 8) {
    console.log('Requesting outline expansion...\n');
    // Phase 1: targeted expansion prompt
    r = await orch.processInput(
      '大纲章节太少，请扩展到至少12节。增加：AI课堂应用具体案例（2节）、传统评价体系批判分析（2节）、核心能力培养方法论（2节）、未来教育形态与政策建议（2节）、给家长和学生的实操指南（2节）。',
    );
    console.log('EXPANDED:\n', r, '\n');
    outlineLen = orch.getState().outline.length;
    console.log(`Now ${outlineLen} sections\n`);

    // If expansion collapsed the outline, try again with simpler prompt
    if (outlineLen < 6) {
      console.log('Collapse detected, retrying with backup prompt...\n');
      r = await orch.processInput('/outline regenerate');
      console.log('REGENERATED:\n', r, '\n');
      // Then try expanding once more
      r = await orch.processInput('请扩展到至少12节，每节需要具体分析案例和论证方向');
      console.log('RE-EXPANDED:\n', r, '\n');
      outlineLen = orch.getState().outline.length;
      console.log(`Now ${outlineLen} sections\n`);
    }
  }

  // Final fallback: if still too short, just proceed with what we have
  if (outlineLen < 3) {
    r = await orch.processInput('/outline regenerate');
    console.log('FINAL REGENERATION:\n', r, '\n');
    outlineLen = orch.getState().outline.length;
  }

  // Accept the outline → enters writing phase
  r = await orch.processInput('确认');
  console.log('TRANSITION:\n', r.slice(0, 400), '\n');

  // Provide 3 material inputs for WritingAgent PhaseGate
  console.log('=== Material Collection for WritingAgent ===\n');

  r = await orch.processInput(
    '核心论点：AI时代教育必须从知识传授转向能力培养。批判性思维、创造力、协作沟通、终身学习能力才是未来核心竞争力。当前教育体系过度强调标准化考试和知识记忆。',
  );
  console.log('M1:', r.slice(0, 250), '...\n');

  r = await orch.processInput(
    '引用案例和理论：芬兰现象教学法改革、中国双减政策、美国High Tech High项目式学习、Khanmigo AI辅导。教育学理论：杜威做中学、罗宾逊创造力教育、佐藤学学习共同体。',
  );
  console.log('M2:', r.slice(0, 250), '...\n');

  r = await orch.processInput(
    '目标读者是教育工作者和家长。语气理性而温暖，有学术支撑也有生活案例。',
  );
  console.log('M3:', r.slice(0, 250), '...\n');

  // === WRITING PHASE ===
  console.log('=== Phase 3: Writing ===\n');

  const totalSections = orch.getState().outline.length;
  console.log(`Total sections to generate: ${totalSections}\n`);

  for (let i = 0; i < totalSections; i++) {
    console.log(`--- Section ${i + 1}/${totalSections} ---`);

    r = await orch.processInput('/gen');

    if (r.includes('还在收集素材') || r.includes('素材不足') || r.includes('🔒')) {
      console.log('BLOCKED by PhaseGate, providing more material...\n');
      r = await orch.processInput(
        '更多背景：芬兰现象教学、中国双减、High Tech High、Khanmigo、杜威、罗宾逊',
      );
      i--;
      continue;
    }

    console.log('  GEN:', r.slice(0, 200), '...\n');

    // Accept via multiple attempts (handles AWAITING_CLARIFICATION → PRESENTING → completeSection)
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await orch.processInput('/accept');
      if (r.includes('✅') || r.includes('全部完成') || r.includes('ALL_COMPLETE')) {
        break;
      }
    }

    // Read content from state AFTER /accept
    const sections = orch.getState().outline;
    const content = (i < sections.length && sections[i].content) || '';
    const contentChars = content.replace(/[\s\n]/g, '').length;
    console.log(`  Content: ${contentChars} chars\n`);

    if (r.includes('全部完成') || r.includes('ALL_COMPLETE')) {
      console.log('ALL COMPLETE at section', i + 1);
      break;
    }
  }

  // Polish — reader simulation (only works in ALL_COMPLETE state)
  console.log('=== Phase 4: Polish ===\n');
  r = await orch.processInput('/polish');
  console.log('POLISH:', r.slice(0, 600));
  if (r.length > 600) console.log('  ... (continued)');
  console.log('');

  // Final manuscript display
  console.log('\n═══ 完整稿件 ═══\n');
  const sections = orch.getState().outline.filter((s) => s.content);
  let totalChars = 0;

  for (const s of sections) {
    console.log(`\n## ${s.title}\n`);
    console.log(s.content || '(空)');
    totalChars += (s.content || '').replace(/[\s\n]/g, '').length;
  }

  console.log(`\n\n📊 总字数: ${totalChars}`);

  // Detailed stats
  console.log('\n═══ 统计 ═══');
  console.log(`Phase: ${orch.getState().phase}`);
  console.log(`Sections total: ${orch.getState().outline.length}`);
  console.log(`Sections with content: ${orch.getState().outline.filter((s) => s.content).length}`);
  for (const s of orch.getState().outline) {
    const chars = s.content ? s.content.replace(/[\s\n]/g, '').length : 0;
    console.log(`  ${s.title}: ${chars} chars`);
  }
}

main().catch(console.error);
