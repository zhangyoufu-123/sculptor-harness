/**
 * Feedback Loop Test — Critique → Retrain → Regenerate
 *
 * Scenario:
 * 1. Seed Lu Xun style vector (same 10 training choices as before)
 * 2. Generate first draft
 * 3. Apply human critique (the 82/100 evaluation)
 * 4. Retrain the vector based on critique feedback
 * 5. Regenerate improved version
 */

/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runFeedbackLoop } from './src/runtime/style/feedback-loop';
import { styleVectorStore } from './src/runtime/style/style-vector-store';

// ─── Step 1: Seed Lu Xun Style ──────────────────────────────────

function seedLuXunStyle() {
  console.log('🎨 播种鲁迅风格向量（10轮模拟选择）...\n');

  const trainingChoices = [
    { q: '语气', opts: ['温和委婉', '犀利直接', '客观冷静'], choice: 1 },
    { q: '句式', opts: ['长句铺陈', '短句断喝', '长短交错'], choice: 1 },
    { q: '修辞', opts: ['排比铺陈', '反语讽刺', '白描细写'], choice: 1 },
    { q: '语言', opts: ['纯粹白话', '文白夹杂', '欧化句式'], choice: 1 },
    { q: '视角', opts: ['第一人称', '第三人称', '第二人称'], choice: 0 },
    { q: '情感', opts: ['热烈激昂', '冷峻深沉', '平和冲淡'], choice: 1 },
    { q: '意象', opts: ['风花雪月', '铁屋黑夜路', '家庭日常'], choice: 1 },
    { q: '结尾', opts: ['总结升华', '戛然而止', '呼应开头'], choice: 1 },
    { q: '议论', opts: ['正面立论', '借题发挥', '引经据典'], choice: 1 },
    { q: '传统', opts: ['尊重传承', '激烈批判', '回避不谈'], choice: 1 },
  ];

  for (const t of trainingChoices) {
    styleVectorStore.recordChoice({
      question: t.q,
      options: t.opts,
      predictedProbs: t.opts.map(() => 1 / t.opts.length),
      actualChoice: t.choice,
      timestamp: Date.now(),
    });
  }

  console.log(`  已播种 ${trainingChoices.length} 条风格数据\n`);
}

// ─── Step 2: Run Feedback Loop ──────────────────────────────────

async function main() {
  seedLuXunStyle();

  // The human critique from earlier — embedded as external feedback
  const externalFeedback = `综合评分：82/100

问题：
1. 批判的锋芒尚欠火候——批判对象过于泛泛，缺少具体的社会语境锚定。鲁迅写孔乙己、魏连殳都是贴着具体的社会结构写的。
2. 语言的"仿"痕过重——有些句子过于"文艺化"，像郁达夫或废名，不像鲁迅。鲁迅的文字像风干的肉，需要多砍掉形容词，让句子更"干"。
3. 结尾的力量不足——停在"黑洞洞的没有一盏灯"，缺少一个"翻上去"的思想动作。鲁迅的结尾往往由实入虚、气象开阔。

建议：
- 多砍掉一些形容词，让句子更干一些
- 引入更具体的社会症候，贴着具体的社会结构写
- 结尾需要由实入虚，打开思辨空间
- 学会鲁迅的"眼"而不只是"笔"`;

  const result = await runFeedbackLoop({
    targetStyle: {
      name: '鲁迅',
      characteristics: [
        '犀利讽刺：用反语和讽刺直指社会弊病',
        '短句断喝：句子短而有力，如匕首投枪',
        '文白夹杂：白话文中融入文言词汇',
        '冷峻深沉：文字表面冰冷，内里关切民族命运',
        '借题发挥：从日常小事引出对时代的深刻批判',
        '戛然而止：结尾以警句或留白收束',
        '社会意象：铁屋、黑夜、路、血',
      ],
      knownTechniques: ['反语', '讽刺', '对比', '白描', '象征'],
      samplePhrases: [
        '我横竖睡不着，仔细看了半夜，才从字缝里看出字来',
        '其实地上本没有路，走的人多了，也便成了路',
      ],
    },
    generationPrompt: {
      systemPrompt: `你是鲁迅。用鲁迅的口吻和文风写作。

核心原则：
- 句子要短、要干、要有力。像风干的肉，嚼起来才有劲道。
- 不要"文艺化"的修饰——砍掉不必要的形容词。
- 用反语和讽刺直指社会弊病。
- 文白夹杂，古雅凝练。
- 以日常生活场景起笔，借题发挥，引出深刻批判。
- 第一人称"我"的视角。
- 结尾要有"翻上去"的思想动作——由实入虚。

特别提醒（基于之前的批评）：
- 批判要贴着具体的社会结构写，不要泛泛谈"读书无用"
- 语言要更干、更硬，减少修饰性形容词
- 结尾不要停在描述上，要翻上去——打开一个思辨空间`,
      userPrompt: `题目：劝学

写一篇鲁迅风格的劝学文章。劝的不是科举八股的死学问，而是睁眼看世界的真学问。`,
    },
    stopCriteria: {
      minScore: 88,
      maxIterations: 3,
      minImprovement: 3,
    },
    externalFeedback,
  });

  // ─── Output ──────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60));
  console.log('  📊 反馈闭环结果');
  console.log('='.repeat(60));
  console.log(`  总耗时: ${(result.totalTime / 1000).toFixed(1)}s`);
  console.log(`  迭代次数: ${result.iterations.length}`);
  console.log(`  最终评分: ${result.finalScore}/100`);
  console.log(`  是否收敛: ${result.converged ? '✅' : '⚠️'}`);
  console.log(`  最终置信度: ${(result.finalSnapshot.confidence * 100).toFixed(0)}%`);

  console.log('\n  迭代历程:');
  for (const iter of result.iterations) {
    const top3 = iter.vectorSnapshot.topAttentionTargets
      .slice(0, 3)
      .map((t) => t.target)
      .join('、');
    console.log(
      `    第${iter.iteration}轮: ${iter.score}分 | ${iter.signalsApplied}条训练信号 | D3焦点: ${top3}`,
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('  《劝学》—— 最终版本（反馈闭环优化后）');
  console.log('='.repeat(60));
  console.log('');
  console.log(result.finalText);
  console.log('');
  console.log('='.repeat(60));
}

main().catch(console.error);
