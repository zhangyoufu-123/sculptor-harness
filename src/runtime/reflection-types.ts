/**
 * Reflection Layer — Sprint 3
 * After each node is drafted, the Reflection Agent analyzes it and generates:
 * 1. A one-sentence thesis (core idea)
 * 2. Supporting arguments found in the text
 * 3. Open diagnostic questions for the user
 * 4. Potential problems detected
 */

// =========================================================================
// Paragraph Reflection — per-node analysis
// =========================================================================

export type ReflectionProblem =
  | 'LackEvidence' // Claims without supporting data or examples
  | 'LackTransition' // Poor connection to previous/next section
  | 'IntentMismatch' // Content drifts from the node's stated goal
  | 'ToneDrift' // Tone inconsistent with expression layer settings
  | 'MissingContext' // Assumes reader knowledge not established
  | 'LogicalGap' // Jump in reasoning without explanation
  | null; // No problem detected

export interface ParagraphReflection {
  /** Which node this reflection is for */
  nodeId: string;
  /** One-sentence summary of what this paragraph argues */
  thesis: string;
  /** Key arguments the author makes in this section */
  keyArguments: string[];
  /** Evidence or examples found in the text */
  supportingEvidence: string[];
  /** Diagnostic questions for the user to review */
  openQuestions: string[];
  /** Potential problem detected (if any) */
  potentialProblem: ReflectionProblem;
  /** Confidence in this analysis (0-1) */
  confidence: number;
  /** Whether the user has confirmed this reflection is accurate */
  userConfirmed: boolean;
  /** ISO timestamp */
  generatedAt: string;
}

// =========================================================================
// Coverage Map — what's covered vs what's missing
// =========================================================================

export type CoverageStatus = 'covered' | 'missing' | 'weak';

export interface CoverageTopic {
  topic: string;
  status: CoverageStatus;
  /** Which section covers this topic (if covered) */
  relatedSection?: string;
}

export interface CoverageMap {
  /** The writing domain (e.g., "AI教育") */
  domain: string;
  /** Required topics and their coverage status */
  requiredTopics: CoverageTopic[];
  /** Percentage of topics covered (0-100) */
  coveragePercentage: number;
  /** Topics that are completely missing */
  missingTopics: string[];
  /** Topics with weak coverage that need strengthening */
  weakTopics: string[];
  /** ISO timestamp */
  generatedAt: string;
}

// =========================================================================
// Reflection Report — aggregate for the full project
// =========================================================================

export interface ReflectionReport {
  projectId: string;
  /** Per-node reflections */
  nodeReflections: ParagraphReflection[];
  /** Overall coverage map */
  coverage: CoverageMap;
  /** Summary statistics */
  summary: {
    totalNodes: number;
    nodesWithProblems: number;
    nodesConfirmed: number;
    averageConfidence: number;
  };
  /** ISO timestamp */
  generatedAt: string;
}

// =========================================================================
// V1 Rule-based Reflection Generator
// =========================================================================

/**
 * Generate a paragraph reflection using rule-based heuristics (no LLM).
 * V2: upgrade to LLM-based deep semantic analysis.
 */
export function generateReflection(
  nodeId: string,
  content: string,
  goal: string,
): ParagraphReflection {
  const thesis = extractThesis(content, goal);
  const keyArgs = extractKeyArguments(content);
  const evidence = extractEvidence(content);
  const questions = generateQuestions(thesis, keyArgs, goal);
  const problem = detectProblems(content);

  return {
    nodeId,
    thesis,
    keyArguments: keyArgs,
    supportingEvidence: evidence,
    openQuestions: questions,
    potentialProblem: problem,
    confidence: Math.min(0.5 + content.length / 5000, 0.9),
    userConfirmed: false,
    generatedAt: new Date().toISOString(),
  };
}

function extractThesis(content: string, goal: string): string {
  if (!content || content.length === 0) return '（内容为空）';
  const sentences = content.split(/[。！？.!?]/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return goal;
  // First substantive sentence is usually the thesis
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed.length > 15) return trimmed;
  }
  return sentences[0]?.trim() || goal;
}

function extractKeyArguments(content: string): string[] {
  const args: string[] = [];
  const lines = content.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length > 20 &&
      (trimmed.startsWith('第一') ||
        trimmed.startsWith('第二') ||
        trimmed.startsWith('第三') ||
        trimmed.includes('首先') ||
        trimmed.includes('其次') ||
        trimmed.includes('最后') ||
        trimmed.includes('原因') ||
        trimmed.includes('因为') ||
        trimmed.includes('因此'))
    ) {
      args.push(trimmed.slice(0, 60));
    }
  }
  if (args.length === 0) {
    // Fallback: use first long sentence
    const sentences = content.split(/[。！？]/).filter((s) => s.trim().length > 30);
    args.push(...sentences.slice(0, 2).map((s) => s.trim().slice(0, 60)));
  }
  return args.slice(0, 5);
}

function extractEvidence(content: string): string[] {
  const evidence: string[] = [];
  const patterns = [
    /(\d+%)/g, // Percentages
    /(\d+亿)/g, // Large numbers
    /例如/g, // Examples
    /根据/g, // Citations
    /数据显示/g, // Data references
  ];
  const found = new Set<string>();
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const m of matches) {
        if (!found.has(m)) {
          evidence.push(m);
          found.add(m);
        }
      }
    }
  }
  return evidence.slice(0, 5);
}

function generateQuestions(thesis: string, args: string[], goal: string): string[] {
  const questions: string[] = [];

  if (!thesis || thesis === '（内容为空）') {
    questions.push('本节内容是否完成？');
    return questions;
  }

  questions.push(`核心观点"${thesis.slice(0, 30)}..."是否准确？`);

  if (args.length === 0) {
    questions.push('是否缺少关键论证？');
  } else {
    questions.push(`这个观点是否支撑了本节目标："${goal.slice(0, 30)}..."？`);
  }

  questions.push('读者看完这一段，是否知道下一步该想什么？');

  return questions;
}

function detectProblems(content: string): ReflectionProblem {
  if (!content || content.length < 50) return 'MissingContext';

  // Check for evidence
  if (!content.includes('例如') && !content.includes('根据') && !content.match(/\d+%|\d+亿/)) {
    return 'LackEvidence';
  }

  // Check for transition (has concluding sentence?)
  const sentences = content.split(/[。！？]/);
  const lastSentence = sentences[sentences.length - 1]?.trim() || '';
  if (lastSentence.length < 20 && sentences.length > 1) {
    return 'LackTransition';
  }

  return null;
}
