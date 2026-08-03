/**
 * Writing Patterns — journalism-informed writing rules.
 *
 * Extracted from analysis of 40+ real articles from HBR, ESPN, CNN, WSJ, SEL.
 * Injected into the Writing Agent's system prompt.
 */

// ─── Core Rules ───────────────────────────────────────────────

export const JOURNALISM_PATTERNS = {
  /** Opening patterns: how real writers start articles */
  openings: [
    '以具体场景或事实开头，而非"在当今…"',
    '用新闻导语式开头：谁/什么/何时/何地/为什么',
    '以一个惊人的具体数字或引语开场',
    '第一句话就是钩子——不要铺垫',
  ],

  /** Paragraph structure: real writers vary wildly */
  paragraphs: [
    '段落长度变化多端：1句段落紧接5句段落',
    '不要有连续3段长度相近的段落',
    '短段落用于节奏加速，长段落用于深度展开',
    '对话/引语独占一段',
  ],

  /** Sentence rules */
  sentences: [
    '句长变异大：7字短句紧接52字长句',
    '不要连续3句长度相近',
    '用连词开头（但是。然而。）制造断裂感',
    '用片语（fragments）制造口语感',
  ],

  /** Metaphor usage */
  metaphors: [
    '每个比喻只用一次，用完即弃',
    '不要把一个比喻贯穿全文',
    '比喻要具体、出人意料，不要用烂俗比喻',
  ],

  /** Endings: how real writers conclude */
  endings: [
    '以具体引语结尾',
    '以一个具体事实或数字结尾',
    '戛然而止——不要总结',
    '绝对不用"综上所述"或"总之"',
    '结尾不要升华——点到为止',
  ],

  /** Transitions */
  transitions: [
    '用突然的转折而非平滑过渡（"但是"、"然而"）',
    '用分段本身作为过渡——不需要"此外"、"另外"',
    '跳过过渡直接进入下一个观点',
  ],

  /** Data usage */
  data: [
    '使用精确数字（15.2%，36.8M，不是"显著增长"）',
    '数据作为叙事的锚点，不是装饰',
    '一个段落只放一个核心数据',
  ],

  /** Attribution */
  attribution: [
    '引用带姓名和头衔的专家（"哈佛商学院教授John Smith"不是"专家说"）',
    '包含与论点相矛盾的信息——真人不会每个证据都支持自己的观点',
  ],

  /** Voice */
  voice: [
    '每800字有2-3个具体的个性时刻',
    '不要每段都注入个性标记',
    '用第一人称时是"我看到了什么"而非"我认为什么"',
  ],
};

/**
 * Format journalism patterns as a system prompt section.
 * Inject this into the Writing Agent's system prompt.
 */
export function formatPatternsAsPrompt(): string {
  const rules: string[] = [];

  rules.push('## 🖊️ 真人写作模式（基于 HBR/ESPN/CNN/WSJ 分析）');
  rules.push('');

  rules.push('### 开头');
  for (const rule of JOURNALISM_PATTERNS.openings) {
    rules.push(`- ${rule}`);
  }
  rules.push('');

  rules.push('### 段落');
  for (const rule of JOURNALISM_PATTERNS.paragraphs) {
    rules.push(`- ${rule}`);
  }
  rules.push('');

  rules.push('### 句式');
  for (const rule of JOURNALISM_PATTERNS.sentences) {
    rules.push(`- ${rule}`);
  }
  rules.push('');

  rules.push('### 比喻');
  for (const rule of JOURNALISM_PATTERNS.metaphors) {
    rules.push(`- ${rule}`);
  }
  rules.push('');

  rules.push('### 结尾');
  for (const rule of JOURNALISM_PATTERNS.endings) {
    rules.push(`- ${rule}`);
  }
  rules.push('');

  rules.push('### 过渡');
  for (const rule of JOURNALISM_PATTERNS.transitions) {
    rules.push(`- ${rule}`);
  }
  rules.push('');

  rules.push('### 数据');
  for (const rule of JOURNALISM_PATTERNS.data) {
    rules.push(`- ${rule}`);
  }
  rules.push('');

  rules.push('### 引用');
  for (const rule of JOURNALISM_PATTERNS.attribution) {
    rules.push(`- ${rule}`);
  }
  rules.push('');

  rules.push('### 语气');
  for (const rule of JOURNALISM_PATTERNS.voice) {
    rules.push(`- ${rule}`);
  }

  return rules.join('\n');
}

/**
 * Structural style metrics — what to extract instead of "catchphrases".
 */
export const STRUCTURAL_METRICS = [
  'sentenceLengthDistribution', // Not average — the full distribution (min, p25, p50, p75, max)
  'paragraphLengthVariance', // Coefficient of variation across paragraphs
  'conjunctionStartRatio', // % of sentences starting with But/And/Yet/然而/但是
  'fragmentRatio', // % of fragments (sentences <5 chars after punctuation)
  'parentheticalFrequency', // How often the writer uses () or —— for asides
  'metaphorLifespan', // Do metaphors appear once or recur?
  'dataDensity', // Specific numbers per 1000 words
  'quoteRatio', // % of text in quotation marks
  'rhetoricalQARatio', // Self-Q&A frequency
  'tricolonFrequency', // Groups of three
  'emDashFrequency', // Per 1000 chars
  'endingType', // Quote / Fact / Abrupt stop / Summary / Elevation
] as const;
