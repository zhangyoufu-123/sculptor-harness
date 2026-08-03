/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { extractStyle } from './src/runtime/style/style-extractor';

const sample = `我常觉得这中间有宿命的味道：仿佛这古园就是为了等我，而历经沧桑在那儿等待了四百多年。它等待我出生，然后又等待我活到最狂妄的年龄上忽地残废了双腿。四百多年里，它剥蚀了古殿檐头浮夸的琉璃，淡褪了门壁上炫耀的朱红，坍圮了一段段高墙又散落了玉砌雕栏，祭坛四周的老柏树愈见苍幽，到处的野草荒藤也都茂盛得自在坦荡。这时候想必我是该来了。十五年前的一个下午，我摇着轮椅进入园中，它为一个失魂落魄的人把一切都准备好了。`;

async function main() {
  console.log(`📝 测试样本: 史铁生《我与地坛》片段 (${sample.length}字)\n`);

  const result = await extractStyle(sample);

  console.log('═══ PASS 1: 计算特征 ═══');
  const c = result.computational;
  console.log(
    `句长: 均值${c.sentence.avgLength}字 标准差${c.sentence.stdDev} 短句比${(c.sentence.shortRatio * 100).toFixed(0)}%`,
  );
  console.log(
    `修饰密度: ${(c.modifiers.modifierDensity * 100).toFixed(1)}% (的${c.modifiers.deCount}/地${c.modifiers.diCount}/得${c.modifiers.deiCount})`,
  );
  console.log(
    `高频词: ${c.words.topWords
      .slice(0, 5)
      .map((w) => w.word)
      .join(' ')}`,
  );

  console.log('\n═══ PASS 2: LLM 14维分析 ═══');
  if (result.profile) {
    const p = result.profile;
    console.log(`作者推断: ${p.authorName || 'unknown'}`);
    console.log(`整体描述: ${p.narrativeSummary || ''}`);
    console.log(`最接近风格: ${p.closestKnownStyle || 'unknown'}`);
    console.log(`独特指数: ${p.uniquenessFactor?.toFixed?.(2) || 'N/A'}`);
    const dims = p.dimensions as Record<string, unknown> | null;
    if (dims) {
      const keys = Object.keys(dims);
      console.log(`维度数: ${keys.length} — ${keys.slice(0, 5).join(', ')}...`);
      for (const key of keys.slice(0, 5)) {
        const val = dims[key] as Record<string, unknown> | undefined;
        const score = typeof val?.score === 'number' ? val.score.toFixed(2) : '?';
        console.log(`  ${key}: score=${score}`);
      }
    }
  } else {
    console.log('(LLM分析未成功，使用计算特征)');
  }

  console.log('\n═══ PASS 3: 对比锚定 ═══');
  console.log(`高置信维度: ${result.anchor.highConfidenceDimensions.join(', ') || '无'}`);
  console.log(`低置信维度: ${result.anchor.lowConfidenceDimensions.join(', ') || '无'}`);
  console.log(`突出特征: ${result.anchor.distinguishingFeatures.join(' | ')}`);

  console.log('\n═══ PASS 4: 向量状态 ═══');
  const v = result.vectorSnapshot;
  console.log(`置信度: ${(v.confidence * 100).toFixed(0)}%`);
  console.log(
    `D3 关注焦点: ${v.topAttentionTargets
      .slice(0, 5)
      .map((t) => t.target)
      .join('、')}`,
  );
  console.log(
    `D1 技法: ${v.topTechniques
      .slice(0, 3)
      .map((t) => `${t.technique}x${t.frequency}`)
      .join('、')}`,
  );

  console.log(`\n⏱ 总耗时: ${result.extractionTime}ms`);
  console.log(`✅ 成功: ${result.success}`);
}

main().catch((e) => console.error('ERROR:', e.message));
