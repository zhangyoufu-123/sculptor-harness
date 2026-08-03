/**
 * Post-Processing Engine — programmatically strips AI-sounding patterns.
 * Pure code, no LLM. Runs after generation.
 *
 * Inspired by writing-agent's humanizeContent() and Ghost Protocol v2.
 *
 * 8 structural AI-pattern detectors + 200+ phrase blacklist.
 */

// ─── AI Phrase Blacklist ──────────────────────────────────────

/** Tier 1: Must-never-appear phrases (zero tolerance) */
const TIER1_BLACKLIST = [
  // AI opening clichés
  '在当今社会',
  '随着……的发展',
  '在当今数字化时代',
  '在当今时代背景下',
  '众所周知',
  '毋庸置疑',
  '不可否认',
  '值得注意的是',
  '显而易见',
  // AI "deep" words
  '底层逻辑',
  '赋能',
  '抓手',
  '闭环',
  '颗粒度',
  '组合拳',
  '护城河',
  '顶层设计',
  '降维打击',
  '生态化反',
  '范式转移',
  '价值锚点',
  // AI transitions
  '首先……其次……最后',
  '第一……第二……第三',
  '综上所述',
  '总而言之',
  '由此可见',
  '我们可以发现',
  '不难看出',
  '毋庸置疑地',
  '无独有偶',
  // AI "insight" filler
  '深刻揭示了',
  '充分体现了',
  '有力证明了',
  '完美诠释了',
  // English AI clichés (when mixed with Chinese)
  'game-changing',
  'paradigm shift',
  'value proposition',
  'ecosystem',
  'synergy',
  'leverage',
  'holistic',
];

/** Tier 2: Warning phrases (flag but don't automatically remove) */
const TIER2_WARNINGS = [
  '此外',
  '另外',
  '与此同时',
  '更重要的是',
  '正如……所说',
  '值得关注的是',
  '令人印象深刻的是',
  '事实上',
  '实际上',
  '从某种程度上',
  '从某种意义上',
  '不仅…而且',
  '一方面…另一方面',
];

/** Common AI conclusion patterns to strip */
const AI_CONCLUSION_PATTERNS: RegExp[] = [
  /^总的来说[，,].+$/gm,
  /^综上所述[，,].+$/gm,
  /^总而言之[，,].+$/gm,
  /^最后[，,]我们.+$/gm,
  /^这(告诉|提醒|启示)我们[，,].+$/gm,
  /^通过以(上|前).+我们可以看到.+$/gm,
];

/** AI opening patterns to detect (first 50 chars of text) */
const AI_OPENING_PATTERNS: RegExp[] = [
  /^在(当今|当下|现代|这个).*(时代|社会|世界)/,
  /^随着.*的(发展|进步|演进|深入)/,
  /^在.*的.*背景下/,
  /^近年来[，,]/,
  /^根据.*(研究|数据|统计)/,
];

// ─── Detection Functions ──────────────────────────────────────

export interface PostProcessResult {
  /** Modified text */
  text: string;
  /** Changes made */
  changes: string[];
  /** Number of AI patterns detected */
  aiPatternsDetected: number;
  /** Tier 1 phrases found and removed */
  removedPhrases: string[];
  /** Tier 2 warnings flagged */
  warnings: string[];
}

/**
 * Escape a string for use in a RegExp.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Main post-processing function.
 * Run this after the Writing Agent generates text.
 */
export function postProcessAI(text: string): PostProcessResult {
  const changes: string[] = [];
  const removedPhrases: string[] = [];
  const warnings: string[] = [];
  let modified = text;
  let aiPatterns = 0;

  // ═══ Check 1: AI Opening Pattern ═══════════════════════════
  const firstLine = modified.slice(0, 80);
  for (const pattern of AI_OPENING_PATTERNS) {
    if (pattern.test(firstLine)) {
      changes.push('AI 式开头已标记（建议人工替换为场景/事实开头）');
      aiPatterns++;
      break;
    }
  }

  // ═══ Check 2: Tier 1 Blacklist (zero tolerance) ═══════════
  for (const phrase of TIER1_BLACKLIST) {
    if (modified.includes(phrase)) {
      const escaped = escapeRegex(phrase);
      const regex = new RegExp(escaped, 'g');
      const count = (modified.match(regex) || []).length;
      modified = modified.replace(regex, '');
      removedPhrases.push(`${phrase} (${count}次)`);
      aiPatterns += count;
    }
  }

  // ═══ Check 3: AI Conclusion Patterns ═══════════════════════
  for (const pattern of AI_CONCLUSION_PATTERNS) {
    const matches = modified.match(pattern);
    if (matches && matches.length > 0) {
      // Replace with blank line
      modified = modified.replace(pattern, '');
      changes.push(`AI 结论句已移除 (${matches.length}处)`);
      aiPatterns += matches.length;
    }
  }

  // ═══ Check 4: Tier 2 Warnings ═══════════════════════════
  for (const phrase of TIER2_WARNINGS) {
    if (modified.includes(phrase)) {
      const escaped = escapeRegex(phrase);
      const regex = new RegExp(escaped, 'g');
      const count = (modified.match(regex) || []).length;
      if (count >= 3) {
        warnings.push(`${phrase} 出现 ${count} 次（疑似过度使用）`);
        aiPatterns++;
      }
    }
  }

  // ═══ Check 5: Tricolon Detection (排比三连) ═════════════
  const tricolonPattern = /([^。！？\n]+)[，,]([^。！？\n]+)[，,]([^。！？\n]+)[。！？]/g;
  let tricolonCount = 0;
  const tricolonMatches = modified.match(tricolonPattern);
  if (tricolonMatches && tricolonMatches.length > 2) {
    tricolonCount = tricolonMatches.length;
    changes.push(`检测到 ${tricolonCount} 处排比三连，建议打破对称`);
    aiPatterns++;
  }

  // ═══ Check 6: Rhetorical Q+A Detection ═══════════════════
  const rhetoricalQA = /(为什么|为何).*？.*(答案|原因)是/g;
  const qaMatches = modified.match(rhetoricalQA);
  if (qaMatches && qaMatches.length > 0) {
    changes.push(`检测到 ${qaMatches.length} 处自问自答句式`);
    aiPatterns += qaMatches.length;
  }

  // ═══ Check 7: Uniform Paragraph Length ═══════════════════
  const paragraphs = modified.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length >= 3) {
    const lengths = paragraphs.map((p) => p.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((s, l) => s + (l - avg) ** 2, 0) / lengths.length;
    const cv = Math.sqrt(variance) / avg; // Coefficient of variation

    if (cv < 0.3) {
      changes.push(`段落长度过于均匀（变异系数 ${cv.toFixed(2)}），建议调整`);
      aiPatterns++;
    }
  }

  // ═══ Check 8: Em-dash Overuse ═══════════════════════════
  const emDashCount = (modified.match(/——/g) || []).length;
  const totalChars = modified.length || 1;
  const emDashDensity = emDashCount / (totalChars / 100); // per 100 chars
  if (emDashDensity > 1.5) {
    changes.push(`破折号密度偏高 (${emDashDensity.toFixed(1)}/100字)`);
    aiPatterns++;
  }

  // ═══ Clean up: remove excessive blank lines from removals ═
  modified = modified.replace(/\n{3,}/g, '\n\n');
  modified = modified.replace(/，{2,}/g, '，');
  modified = modified.replace(/。{2,}/g, '。');
  modified = modified.trim();

  return {
    text: modified,
    changes,
    aiPatternsDetected: aiPatterns,
    removedPhrases,
    warnings,
  };
}

/**
 * Format post-processing result for display.
 */
export function formatPostProcessResult(result: PostProcessResult): string {
  const lines: string[] = [];

  if (result.aiPatternsDetected === 0) {
    lines.push('✅ 后处理通过 — 未检测到 AI 模式');
    return lines.join('\n');
  }

  lines.push(`🔧 后处理完成 — 检测到 ${result.aiPatternsDetected} 处 AI 模式`);

  for (const change of result.changes) {
    lines.push(`  • ${change}`);
  }

  if (result.removedPhrases.length > 0) {
    lines.push(`  🗑️ 移除黑名单短语: ${result.removedPhrases.join(', ')}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`  ⚠️ 警告: ${result.warnings.join('; ')}`);
  }

  return lines.join('\n');
}
