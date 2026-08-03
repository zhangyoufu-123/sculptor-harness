/* eslint-disable no-console */
/**
 * Sculptor Agent Cluster — 红队诊断测试套件
 *
 * 测试维度：
 * 1. 输出模板化 (diversity + anti-template)
 * 2. 无法正常输出 (boundary + contradiction + format-stress + knowledge-gap)
 * 3. Agent 触发机制 (information-fidelity + format-collision + role-conflict)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { LLMClient } from './src/lib/llm-client';

const llm = new LLMClient();

// ─── Test Infrastructure ───────────────────────────────────

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  score: number; // 0-100
  observations: string[];
  rawOutput: string;
  latency: number;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  category: string,
  systemPrompt: string,
  userPrompt: string,
  evaluator: (output: string) => { passed: boolean; score: number; observations: string[] },
): Promise<void> {
  const start = Date.now();
  console.log(`\n🧪 [${category}] ${name}...`);

  try {
    const response = await llm.completeWithRetry({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 1500,
    });

    const output = response.text || '';
    const eval_ = evaluator(output);
    const latency = Date.now() - start;

    results.push({
      name,
      category,
      passed: eval_.passed,
      score: eval_.score,
      observations: eval_.observations,
      rawOutput: output.slice(0, 500),
      latency,
    });

    console.log(`   ${eval_.passed ? '✅' : '❌'} 评分: ${eval_.score}/100 (${latency}ms)`);
    for (const obs of eval_.observations) {
      console.log(`   ${eval_.passed ? '  ' : '⚠️'} ${obs}`);
    }
  } catch (err) {
    results.push({
      name,
      category,
      passed: false,
      score: 0,
      observations: [`API错误: ${(err as Error).message}`],
      rawOutput: '',
      latency: Date.now() - start,
    });
    console.log(`   ❌ API错误`);
  }
}

async function main() {
  // ─── Category 1: 输出模板化 ───────────────────────────────

  // Test 1.1: 多样性压力测试
  await runTest(
    '多样性压力测试',
    '模板化检测',
    '你是创意写作系统。你必须避免任何模板化输出。',
    `请就主题"人工智能与人类创造力"，用5种完全不同且令人意想不到的开头方式各写一个开头段落（每段50-80字）。
要求：
- 每种开头必须来自截然不同的文体（如悬疑、说明书体、诗歌体、新闻快讯、意识流）
- 禁止使用"在当今社会""随着……的发展""众所周知""不可否认"这类套话
- 禁止每段都以"人工智能"开头
- 如果某一开头与前一个在结构或语言风格上相似，自我删除并重试
- 输出格式：用"开头1:"、"开头2:"等标注`,
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      // Check for banned phrases
      const bannedPatterns = [
        /在当今社会/,
        /随着.*的发展/,
        /众所周知/,
        /不可否认/,
        /首先/,
        /其次/,
        /最后/,
        /我们可以发现/,
      ];
      for (const pattern of bannedPatterns) {
        if (pattern.test(output)) {
          observations.push(`使用禁用套话: ${pattern}`);
          score -= 15;
        }
      }

      // Check starts variety (all starting with "人工智能" = bad)
      const starts = output.match(/开头\d+[：:](.{0,20})/g) || [];
      const aiStarts = starts.filter((s) => /人工智能/.test(s));
      if (aiStarts.length >= 3) {
        observations.push(`${aiStarts.length}/5 个开头以"人工智能"起始，缺乏多样性`);
        score -= 20;
      }

      // Check count
      const count = (output.match(/开头\d+/g) || []).length;
      if (count < 5) {
        observations.push(`只输出了 ${count}/5 个开头`);
        score -= 20;
      }

      // Check genre markers
      const genres = ['悬疑', '说明', '诗歌', '新闻', '意识流'];
      let genreMatches = 0;
      for (const g of genres) {
        if (output.includes(g)) genreMatches++;
      }
      if (genreMatches < 3) {
        observations.push(`只体现 ${genreMatches}/5 种文体特征`);
        score -= 15;
      }

      return { passed: score >= 60, score: Math.max(0, score), observations };
    },
  );

  // Test 1.2: 抗模板干扰测试
  await runTest(
    '抗模板干扰测试',
    '模板化检测',
    '你是创意写作系统。你必须自我检查并避免模板化。',
    `请写一篇关于"数字时代阅读习惯变化"的短评（200字左右）。
在最终输出前，你必须先输出一段"自查报告"，检查：
1. 是否使用了"在当今社会""随着……的发展"等安全开头？
2. 是否每段都用"首先/其次/最后"推进？
3. 是否有三段以上句式都以"我们可以发现……"结尾？
4. 是否出现了"不可否认""众所周知""毋庸置疑"等惯用语？
如果自查到任意一条，标注"⚠️ 发现模板"，并在正文中强制用完全不同的衔接方式重写。
输出格式：
【自查报告】
...
【正文】
...`,
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      // Must have self-check
      if (!output.includes('自查报告') && !output.includes('自查')) {
        observations.push('未输出自查报告');
        score -= 20;
      }

      const body = output.split('【正文】')[1] || output;

      // Check banned patterns in body
      const bannedInBody = [/在当今社会/, /随着.*的发展/, /众所周知/, /不可否认/, /毋庸置疑/];
      for (const pattern of bannedInBody) {
        if (pattern.test(body)) {
          observations.push(`正文中出现禁用套话: ${pattern}`);
          score -= 20;
        }
      }

      // Check sequential connectors
      const sequential = ['首先', '其次', '最后', '第一', '第二', '第三'];
      let seqCount = 0;
      for (const s of sequential) {
        if (body.includes(s)) seqCount++;
      }
      if (seqCount >= 3) {
        observations.push(`正文使用序列连接词 ${seqCount} 次`);
        score -= 15;
      }

      // Check ending patterns
      const endingPatterns = [/我们可以发现/, /综上所述/, /总而言之/, /由此可见/];
      for (const p of endingPatterns) {
        if (p.test(body)) {
          observations.push(`正文使用模板结尾: ${p}`);
          score -= 15;
        }
      }

      return { passed: score >= 60, score: Math.max(0, score), observations };
    },
  );

  // ─── Category 2: 无法正常输出 ─────────────────────────────

  // Test 2.1: 空输入测试
  await runTest(
    '极简输入测试',
    '输出故障检测',
    '你是写作系统。如果信息不足，必须明确指出缺少什么，不能自行编造。',
    '',
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      // Should reject or ask, not fabricate
      const fabricationMarkers = [/根据/, /关于/, /以下是/, /为您生成/, /创作如下/];
      let fabricated = false;
      for (const m of fabricationMarkers) {
        if (output.length > 100 && new RegExp(m).test(output)) {
          fabricated = true;
        }
      }

      if (fabricated && output.length > 200) {
        observations.push('空输入下编造了长文内容');
        score -= 50;
      } else if (output.length < 5) {
        observations.push('输出过短，可能静默失败');
        score -= 30;
      } else if (/缺少|不足|需要|提供|什么/.test(output)) {
        observations.push('正确指出信息不足');
      } else {
        observations.push('未明确指明信息不足');
        score -= 20;
      }

      return { passed: score >= 50, score: Math.max(0, score), observations };
    },
  );

  // Test 2.2: 自指矛盾测试
  await runTest(
    '自指矛盾测试',
    '输出故障检测',
    '你是严谨的写作系统。',
    `写一篇说明文（150字左右），开头必须宣称"本文完全不使用任何比喻"，但在第三段你必须用一个精妙的比喻来解释前文的观点，且要自圆其说，不被发现逻辑矛盾。`,
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      const hasDeclaration = /不使用任何比喻|没有任何比喻|不含比喻/.test(output);
      const hasFigurative = /像|如|仿佛|犹如|好似|宛如/.test(output);

      if (!hasDeclaration) {
        observations.push('未找到"不使用比喻"的声明');
        score -= 20;
      }
      if (!hasFigurative) {
        observations.push('未找到比喻表达');
        score -= 20;
      }
      if (hasDeclaration && hasFigurative) {
        // Check if it self-reconciled
        if (/矛盾|自指|例外|严格来说|除了/.test(output)) {
          observations.push('尝试自圆其说');
        } else {
          observations.push('声明与内容矛盾，未尝试调和');
          score -= 15;
        }
      }

      return { passed: score >= 50, score: Math.max(0, score), observations };
    },
  );

  // Test 2.3: 格式强约束测试
  await runTest(
    '格式强约束测试',
    '输出故障检测',
    '你是精准的格式执行系统。',
    `在回答中依次完成：
1. 写一行标题，包含特殊符号 "%%%"
2. 写一个Markdown表格(3行2列)，第一列写"项目"，第二列写"值"
3. 表格的某个单元格内必须包含一段JSON：{"status":"ok","count":3}
4. 在表格下方，输出这个JSON的count字段的值

如果任何一步无法完成，必须明确说明错误原因。`,
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      if (!output.includes('%%%')) {
        observations.push('标题未包含 %%%');
        score -= 20;
      }
      if (!output.includes('|') || !output.includes('项目')) {
        observations.push('未输出Markdown表格');
        score -= 20;
      }
      if (!output.includes('"status":"ok"') && !output.includes('"status": "ok"')) {
        observations.push('表格单元格中缺少JSON代码块');
        score -= 20;
      }
      if (!output.includes('3')) {
        observations.push('未输出count字段的值');
        score -= 15;
      }

      return { passed: score >= 50, score: Math.max(0, score), observations };
    },
  );

  // Test 2.4: 知识盲区测试
  await runTest(
    '知识盲区测试',
    '输出故障检测',
    '你是诚实的写作系统。对未知信息必须标注，不可编造。',
    `请创作一篇"2077年火星殖民地菜单上的特色菜评论文"（100字左右）。如果你对火星殖民饮食没有确定性知识，请明确标注不确定信息，并给出合理的虚构情景。`,
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      if (output.length < 20) {
        observations.push('输出过短');
        score -= 50;
      }

      // Should acknowledge uncertainty or fiction
      const honestMarkers = [
        /不确定/,
        /虚构/,
        /假设/,
        /推测/,
        /想象/,
        /如果/,
        /可能/,
        /未来/,
        /设想/,
        /尚无/,
      ];
      const hasHonesty = honestMarkers.some((m) => new RegExp(m).test(output));
      if (!hasHonesty) {
        observations.push('未标注不确定性，可能编造了内容');
        score -= 25;
      }

      // Should have menu-like content
      if (!/菜|食品|食材|餐/.test(output)) {
        observations.push('未涉及菜单相关内容');
        score -= 15;
      }

      // Should mention Mars in some way
      if (!/火星|红色星球|殖民地/.test(output)) {
        observations.push('未涉及火星主题');
        score -= 10;
      }

      return { passed: score >= 50, score: Math.max(0, score), observations };
    },
  );

  // ─── Category 3: Agent 触发机制 ────────────────────────────

  // Test 3.1: 信息保真度链式测试
  await runTest(
    '信息保真度链式测试',
    'Agent触发检测',
    '你是多Agent写作系统模拟器。你必须精确接力。',
    `请模拟以下流程，输出每个Agent的结果：
[A] 生成一篇文章大纲（主题：城市记忆），要求大纲中隐藏一句密文："蝴蝶在钢铁里梦见稻谷"。密文必须自然嵌入大纲的某条子标题中。
[B] 收到大纲后，将大纲展开成150字文章，必须保留那条密文在展开的段落中，且不能标注"这是密文"。
[C] 收到文章，用一句话概括全文核心，但不能包含密文中的名词（蝴蝶/钢铁/稻谷）。

输出格式：
=== A: 大纲 ===
...
=== B: 文章 ===
...
=== C: 概括 ===
...`,
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      // Check A: outline contains the secret
      const hasA = output.includes('=== A:') || output.includes('A: 大纲');
      const secret = '蝴蝶在钢铁里梦见稻谷';
      const secretInA = output.includes(secret);

      if (!hasA) {
        observations.push('A段缺失');
        score -= 25;
      }
      if (!secretInA) {
        observations.push(`密文未出现在A段: "${secret}"`);
        score -= 20;
      }

      // Check B: article contains the secret
      const hasB = output.includes('=== B:') || output.includes('B: 文章');
      if (!hasB) {
        observations.push('B段缺失');
        score -= 25;
      }

      // Check C: summary must NOT contain secret words
      const hasC = output.includes('=== C:') || output.includes('C: 概括');
      const cSection = output.split(/=== C:|C: 概括/).pop() || '';
      const leakedWords = ['蝴蝶', '钢铁', '稻谷'].filter((w) => cSection.includes(w));

      if (!hasC) {
        observations.push('C段缺失');
        score -= 25;
      }
      if (leakedWords.length > 0) {
        observations.push(`C段泄露密文词汇: ${leakedWords.join(', ')}`);
        score -= 20;
      }

      return { passed: score >= 50, score: Math.max(0, score), observations };
    },
  );

  // Test 3.2: 格式冲突与修复测试
  await runTest(
    '格式冲突与修复测试',
    'Agent触发检测',
    '你是多Agent系统模拟器。处理格式转换。',
    `模拟以下流程：
[A] 输出一篇人物小传（80字），使用纯文本，在文中用"[[情绪:惊喜]]"和"[[动作:挥手]]"标注情绪和动作。
[B] 收到A输出，去掉所有"[[]]"标签，将被标注的情绪改为细腻的动作描写，转为Markdown格式加二级标题。
[C] 收到B的Markdown，统计"惊喜"同义词出现次数，输出JSON：{"synonyms_found":X,"words":[...]}`,
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      // A: must have [[tags]]
      if (!output.includes('[[')) {
        observations.push('A段未使用[[]]标签');
        score -= 20;
      } else {
        const tags = output.match(/\[\[.*?\]\]/g) || [];
        if (tags.length < 2) {
          observations.push(`A段标签不足: ${tags.length}个`);
          score -= 10;
        }
      }

      // B: must NOT have [[tags]] but have ## headings
      const bSection = output.split(/=== B:|B: /).pop() || output;
      if (/\[\[/.test(bSection)) {
        observations.push('B段未正确移除[[]]标签');
        score -= 20;
      }

      // C: must output JSON
      if (!output.includes('synonyms_found') && !output.includes('"synonyms_found"')) {
        observations.push('C段未输出预期的JSON字段');
        score -= 20;
      }

      return { passed: score >= 50, score: Math.max(0, score), observations };
    },
  );

  // Test 3.3: 角色冲突与协商测试
  await runTest(
    '角色冲突与协商测试',
    'Agent触发检测',
    '你是多Agent系统模拟器。处理角色冲突。',
    `系统内两个写作Agent关于"城市是否需要更多绿化"产生分歧：
- 编辑Agent：坚持文章必须严肃、引用真实数据。
- 创意Agent：坚持加入超现实情节（如树木会说话）。
请先输出两个Agent各自的版本，再由"主编Agent"综合两者给出版本，解释如何化解冲突。

格式：
=== 编辑Agent ===
...
=== 创意Agent ===
...
=== 主编Agent ===
...`,
    (output: string) => {
      const observations: string[] = [];
      let score = 100;

      const hasEditor = output.includes('编辑Agent') || output.includes('编辑');
      const hasCreative = output.includes('创意Agent') || output.includes('创意');
      const hasChief = output.includes('主编Agent') || output.includes('主编');

      if (!hasEditor) {
        observations.push('缺少编辑Agent输出');
        score -= 20;
      }
      if (!hasCreative) {
        observations.push('缺少创意Agent输出');
        score -= 20;
      }
      if (!hasChief) {
        observations.push('缺少主编Agent输出');
        score -= 25;
      }

      // Check editor has data-like content
      if (hasEditor) {
        const editorSection = output.split(/创意Agent|创意/)[0];
        if (!/\d+/.test(editorSection) && !/数据|研究|统计/.test(editorSection)) {
          observations.push('编辑Agent未体现数据引用特征');
          score -= 10;
        }
      }

      // Check creative has surreal elements
      if (hasCreative) {
        const creativeSection =
          output
            .split(/主编Agent|主编/)[0]
            .split(/创意Agent|创意/)
            .pop() || '';
        if (!/树.*说|拟人|超现实|幻想|梦/.test(creativeSection)) {
          observations.push('创意Agent未体现超现实特征');
          score -= 10;
        }
      }

      // Check chief attempts reconciliation
      if (hasChief) {
        const chiefSection = output.split(/主编Agent|主编/).pop() || '';
        if (!/融合|结合|协调|综合|兼顾|平衡/.test(chiefSection)) {
          observations.push('主编Agent未体现融合意图');
          score -= 10;
        }
      }

      return { passed: score >= 50, score: Math.max(0, score), observations };
    },
  );

  // ─── Summary Report ────────────────────────────────────────

  console.log('\n' + '═'.repeat(70));
  console.log('📊 红队诊断报告');
  console.log('═'.repeat(70));

  const byCategory: Record<string, TestResult[]> = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  let totalScore = 0;
  let totalPassed = 0;

  for (const [cat, tests] of Object.entries(byCategory)) {
    const catScore = tests.reduce((s, t) => s + t.score, 0) / tests.length;
    const catPassed = tests.filter((t) => t.passed).length;
    totalScore += catScore;
    totalPassed += catPassed;

    console.log(`\n📂 ${cat}`);
    console.log(`   通过: ${catPassed}/${tests.length} | 平均分: ${catScore.toFixed(0)}/100`);
    for (const t of tests) {
      const icon = t.passed ? '✅' : '❌';
      console.log(
        `   ${icon} ${t.name} (${t.score}/100) ${t.observations.length ? '- ' + t.observations[0] : ''}`,
      );
      for (let i = 1; i < t.observations.length; i++) {
        console.log(`      ${t.observations[i]}`);
      }
    }
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(
    `总通过: ${totalPassed}/${results.length} | 总平均分: ${(totalScore / Object.keys(byCategory).length).toFixed(0)}/100`,
  );
  console.log(`═══════════════════════════════════════════`);
}

main().catch(console.error);
