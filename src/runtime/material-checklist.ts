/**
 * Material Checklist — validates that enough user material exists before generation.
 *
 * Pattern from: AI ghostwriter interview pipeline + LinkedIn ghostwriting skill.
 * Blocks phase transition until essential material categories are filled.
 */

export type MaterialCategory =
  'core_memory' | 'emotional_tone' | 'symbolic_element' | 'concrete_detail' | 'reader_connection';

export interface MaterialItem {
  category: MaterialCategory;
  content: string;
  source: 'user' | 'extracted';
  timestamp: string;
}

export interface MaterialChecklist {
  items: MaterialItem[];
  /** Required categories for the current creative type */
  requiredCategories: MaterialCategory[];
  /** Progress 0-1 */
  completion: number;
}

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  core_memory: '核心论点/主题',
  emotional_tone: '论证方向/立场',
  symbolic_element: '理论框架/象征',
  concrete_detail: '具体论据/案例',
  reader_connection: '读者/学术贡献',
};

/**
 * Create a checklist based on creative type.
 * Different types need different material categories.
 */
export function createMaterialChecklist(creativeType: string): MaterialChecklist {
  let required: MaterialCategory[] = [];

  if (
    creativeType.includes('论文') ||
    creativeType.includes('学术') ||
    creativeType.includes('研究') ||
    creativeType.includes('分析')
  ) {
    // Academic: need thesis, evidence, structure — NOT sensory details
    required = ['core_memory', 'emotional_tone', 'reader_connection'];
  } else if (
    creativeType.includes('散文') ||
    creativeType.includes('小说') ||
    creativeType.includes('故事') ||
    creativeType.includes('回忆')
  ) {
    // Creative: need sensory details, emotional tone, metaphors
    required = ['core_memory', 'emotional_tone', 'concrete_detail', 'symbolic_element'];
  } else if (
    creativeType.includes('教程') ||
    creativeType.includes('教学') ||
    creativeType.includes('指南')
  ) {
    // Tutorial: need topic clarity, audience, examples
    required = ['core_memory', 'emotional_tone', 'concrete_detail'];
  } else if (
    creativeType.includes('文章') ||
    creativeType.includes('博客') ||
    creativeType.includes('公众号')
  ) {
    // Blog: need core message + reader connection
    required = ['core_memory', 'emotional_tone', 'reader_connection'];
  } else {
    // Default: minimum requirements
    required = ['core_memory', 'emotional_tone'];
  }

  return { items: [], requiredCategories: required, completion: 0 };
}

/**
 * Record a material item from user input.
 */
export function recordMaterial(
  checklist: MaterialChecklist,
  category: MaterialCategory,
  content: string,
): void {
  // Don't duplicate same category content
  const existing = checklist.items.find((i) => i.category === category);
  if (existing) {
    existing.content = content;
    existing.timestamp = new Date().toISOString();
  } else {
    checklist.items.push({
      category,
      content: content.slice(0, 200),
      source: 'user',
      timestamp: new Date().toISOString(),
    });
  }
  checklist.completion = calculateCompletion(checklist);
}

/**
 * Try to auto-extract material from user input.
 */
export function extractMaterial(checklist: MaterialChecklist, input: string): void {
  // BROAD academic detection — must come FIRST
  const academicWords = [
    '论文',
    '学术',
    '研究',
    '分析',
    '批判',
    '论证',
    '理论',
    '框架',
    '算法',
    '文化',
    '认知',
    '技术',
    '语言',
    '传播',
    '模因',
    '媒体',
    '现象',
    '问题',
    '观点',
    '立场',
    '角度',
    '维度',
    '层面',
    '结构',
    '逻辑',
  ];
  const hasAcademicSignal = academicWords.some((w) => input.includes(w));

  if (hasAcademicSignal) {
    // Auto-fill core categories for academic work
    if (!checklist.items.some((i) => i.category === 'core_memory')) {
      recordMaterial(checklist, 'core_memory', input.slice(0, 200));
    }
    if (!checklist.items.some((i) => i.category === 'emotional_tone')) {
      recordMaterial(checklist, 'emotional_tone', `学术分析方向: ${input.slice(0, 150)}`);
    }
    if (
      !checklist.items.some((i) => i.category === 'reader_connection') &&
      checklist.requiredCategories.includes('reader_connection')
    ) {
      recordMaterial(checklist, 'reader_connection', '学术读者');
    }
  }

  // Core memory: user mentions a specific time/place/person
  if (
    input.includes('外婆') ||
    input.includes('奶奶') ||
    input.includes('妈妈') ||
    input.includes('老师') ||
    input.includes('同学')
  ) {
    recordMaterial(checklist, 'core_memory', input.slice(0, 200));
  }
  // Emotional tone
  if (
    input.includes('怀念') ||
    input.includes('感动') ||
    input.includes('悲伤') ||
    input.includes('快乐') ||
    input.includes('宁静')
  ) {
    recordMaterial(checklist, 'emotional_tone', input.slice(0, 200));
  }
  // Concrete detail
  if (input.match(/闻到|听见|看到|摸到|尝到|颜色|声音|气味|味道|触感|光|风|雨|烟/)) {
    recordMaterial(checklist, 'concrete_detail', input.slice(0, 200));
  }
  // Symbolic element
  if (
    input.includes('像') ||
    input.includes('象征') ||
    input.includes('代表') ||
    input.includes('隐喻') ||
    input.includes('正如')
  ) {
    recordMaterial(checklist, 'symbolic_element', input.slice(0, 200));
  }
  // Reader connection
  if (
    input.includes('读者') ||
    input.includes('写给') ||
    input.includes('希望') ||
    input.includes('共鸣')
  ) {
    recordMaterial(checklist, 'reader_connection', input.slice(0, 200));
  }
}

/**
 * Check if all required categories are filled.
 */
export function isMaterialComplete(checklist: MaterialChecklist): boolean {
  const filled = new Set(checklist.items.map((i) => i.category));
  return checklist.requiredCategories.every((c) => filled.has(c));
}

/**
 * Get missing categories for display.
 */
export function getMissingCategories(checklist: MaterialChecklist): string[] {
  const filled = new Set(checklist.items.map((i) => i.category));
  return checklist.requiredCategories.filter((c) => !filled.has(c)).map((c) => CATEGORY_LABELS[c]);
}

/**
 * Get progress display string.
 */
export function getMaterialProgress(checklist: MaterialChecklist): string {
  const filled = new Set(checklist.items.map((i) => i.category));
  const done = checklist.requiredCategories.filter((c) => filled.has(c)).length;
  const total = checklist.requiredCategories.length;
  const missing = getMissingCategories(checklist);
  return `素材: ${done}/${total} · 还缺: ${missing.join(', ') || '无'}`;
}

function calculateCompletion(checklist: MaterialChecklist): number {
  const filled = new Set(checklist.items.map((i) => i.category));
  const done = checklist.requiredCategories.filter((c) => filled.has(c)).length;
  return checklist.requiredCategories.length > 0 ? done / checklist.requiredCategories.length : 1;
}
