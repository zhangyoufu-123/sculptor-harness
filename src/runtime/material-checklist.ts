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
  core_memory: '核心记忆/场景',
  emotional_tone: '情感基调',
  symbolic_element: '象征物/隐喻',
  concrete_detail: '具体感官细节',
  reader_connection: '读者连接',
};

/**
 * Create a checklist based on creative type.
 */
export function createMaterialChecklist(creativeType: string): MaterialChecklist {
  // All types need at least 3 categories
  const required: MaterialCategory[] = ['core_memory', 'emotional_tone', 'concrete_detail'];

  // Fiction/prose need symbolic elements
  if (
    creativeType.includes('散文') ||
    creativeType.includes('小说') ||
    creativeType.includes('故事')
  ) {
    required.push('symbolic_element');
  }

  // Articles/essays need reader connection
  if (
    creativeType.includes('文章') ||
    creativeType.includes('论文') ||
    creativeType.includes('博客')
  ) {
    required.push('reader_connection');
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
