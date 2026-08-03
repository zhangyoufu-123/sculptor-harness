/**
 * 鲁迅风格劝学 — style vector training + generation test
 *
 * Steps:
 * 1. Seed StyleVectorStore with Lu Xun's known style characteristics
 * 2. Use LLM to generate a "劝学" essay in Lu Xun's style
 * 3. Output the complete result
 */

/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { LLMClient } from './src/lib/llm-client';
import { styleVectorStore } from './src/runtime/style/style-vector-store';
import { formatStyleContext } from './src/runtime/style/style-predictor';

// ─── Lu Xun Style Seed ─────────────────────────────────────
// We train the vector by simulating "user choices" that reflect
// Lu Xun's known writing preferences.

function seedLuXunStyle() {
  console.log('🎨 播种鲁迅风格向量...\n');

  // Simulated "questions" about writing choices, with Lu Xun's known preferences
  const trainingChoices: Array<{
    question: string;
    options: string[];
    luXunChoice: number; // which option Lu Xun would choose
    reason: string;
  }> = [
    {
      question: '语气倾向',
      options: ['温和委婉，含而不露', '犀利直接，一针见血', '客观冷静，不动声色'],
      luXunChoice: 1, // 犀利直接
      reason: '鲁迅文风以犀利讽刺著称',
    },
    {
      question: '句式偏好',
      options: ['长句铺陈，层层递进', '短句断喝，节奏紧凑', '长短交错，张弛有度'],
      luXunChoice: 1, // 短句断喝
      reason: '鲁迅善用短句，如匕首投枪',
    },
    {
      question: '修辞手法',
      options: ['排比铺陈，气势恢宏', '反语讽刺，意在言外', '白描细写，不动声色'],
      luXunChoice: 1, // 反语讽刺
      reason: '反语和讽刺是鲁迅的核心手法',
    },
    {
      question: '语言风格',
      options: ['纯粹白话，通俗易懂', '文白夹杂，古雅凝练', '欧化句式，逻辑严密'],
      luXunChoice: 1, // 文白夹杂
      reason: '鲁迅作品文白夹杂，有文言功底',
    },
    {
      question: '叙述视角',
      options: ['第一人称，亲切真实', '第三人称，客观冷静', '第二人称，直指读者'],
      luXunChoice: 0, // 第一人称
      reason: '鲁迅常用第一人称，"我"既是叙述者也是批判者',
    },
    {
      question: '情感温度',
      options: ['热烈激昂，催人奋进', '冷峻深沉，引人深思', '平和冲淡，悠然自得'],
      luXunChoice: 1, // 冷峻深沉
      reason: '鲁迅的文字温度是"冷"的，但冷中有热',
    },
    {
      question: '意象选择',
      options: ['风花雪月，自然景物', '铁屋、黑夜、路、血——社会意象', '家庭日常，生活细节'],
      luXunChoice: 1, // 社会意象：铁屋、黑夜、路
      reason: '鲁迅的意象多与社会批判相关',
    },
    {
      question: '结尾方式',
      options: ['总结升华，点明主旨', '戛然而止，留白余味', '呼应开头，结构圆融'],
      luXunChoice: 1, // 戛然而止，留白
      reason: '鲁迅文章常以警句或留白结尾',
    },
    {
      question: '议论方式',
      options: ['正面立论，层层推进', '借题发挥，以小见大', '引经据典，以古论今'],
      luXunChoice: 1, // 借题发挥，以小见大
      reason: '鲁迅善从日常小事引出深刻批判',
    },
    {
      question: '对待传统的态度',
      options: ['尊重传承，取其精华', '激烈批判，鞭辟入里', '回避不谈，另辟蹊径'],
      luXunChoice: 1, // 激烈批判
      reason: '鲁迅对封建传统持激烈批判态度',
    },
  ];

  for (const choice of trainingChoices) {
    const predictedProbs = choice.options.map(() => 1 / choice.options.length); // uniform prior
    styleVectorStore.recordChoice({
      question: choice.question,
      options: choice.options,
      predictedProbs,
      actualChoice: choice.luXunChoice,
      timestamp: Date.now(),
    });
    console.log(
      `  ✅ "${choice.question}" → "${choice.options[choice.luXunChoice]}" (${choice.reason})`,
    );
  }

  console.log('');
}

// ─── Generate Lu Xun Style 劝学 ────────────────────────────

async function generateLuXunQuanXue() {
  console.log('📝 生成鲁迅风格《劝学》...\n');

  const llm = new LLMClient();

  const styleContext = formatStyleContext();
  const snapshot = styleVectorStore.getSnapshot();

  console.log(`  风格置信度: ${(snapshot.confidence * 100).toFixed(0)}%`);
  console.log(`  已学习选择: ${snapshot.totalChoices}次`);
  console.log(
    `  关注焦点: ${snapshot.topAttentionTargets
      .slice(0, 3)
      .map((t) => t.target)
      .join('、')}`,
  );
  console.log(
    `  写作手法: ${snapshot.topTechniques
      .slice(0, 3)
      .map((t) => t.technique)
      .join('、')}`,
  );
  console.log('');

  const systemPrompt = `你是鲁迅——中国现代文学的开山巨匠。你的写作特点是：

1. 犀利讽刺：用反语和讽刺直指社会弊病，一针见血
2. 短句断喝：句子短而有力，如匕首、如投枪
3. 文白夹杂：白话文中融入文言词汇，古雅而凝练
4. 冷峻深沉：文字表面冰冷，内里却是对民族命运的深切关怀
5. 借题发挥：从日常小事引出对时代、社会、人性的深刻批判
6. 第一人称：常以"我"的视角叙述，既是观察者也是批判者
7. 戛然而止：结尾不拖泥带水，以警句或留白收束
8. 意象鲜明：铁屋、黑夜、路、血、吃人——社会批判性意象

请以鲁迅的口吻和文风，写一篇《劝学》——但不要写那种陈腐的说教。
你要"劝"的学，不是科举八股的死学问，而是睁眼看世界的真学问。

要求：
- 使用第一人称"我"
- 以一件日常小事或一个场景起笔，借题发挥
- 善用反语和讽刺
- 句式短而有力，文白夹杂
- 2000字左右
- 结尾要有警句或留白

直接输出文章正文，不要加任何说明文字。`;

  const prompt = `题目：劝学

请以鲁迅的风格，写一篇劝学的文章。`;

  console.log('⏳ 正在生成...\n');

  const response = await llm.completeWithRetry({
    systemPrompt,
    prompt,
    temperature: 0.7,
    maxTokens: 4000,
  });

  console.log('='.repeat(60));
  console.log('  《劝学》—— 鲁迅风格');
  console.log('='.repeat(60));
  console.log('');
  console.log(response.text);
  console.log('');
  console.log('='.repeat(60));

  // Also show the style vector state after generation
  console.log('\n📊 风格向量状态:');
  console.log(styleContext);

  return response.text;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  seedLuXunStyle();
  await generateLuXunQuanXue();
}

main().catch(console.error);
