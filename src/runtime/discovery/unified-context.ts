/**
 * Unified Discovery Context — single source of truth for ALL discovery skills.
 * Every skill reads from and contributes to this context.
 * No module builds its own context independently.
 */

import type { BeliefState } from '@/runtime/belief-revision';
import type { CreativeMemory } from '@/runtime/creative-memory';
import type { QuestionTracker } from '@/runtime/discovery/question-tracker';
import type { ExtractedBlueprint } from '@/runtime/import/blueprint-extractor';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface DiscoveryContext {
  // ── User Input ──
  userInput: string;
  conversationHistory: Message[];
  roundCount: number;

  // ── Belief State Summary ──
  beliefSummary: string; // Human-readable summary of current beliefs
  topic: string;
  artifact: string;
  audience: string;
  purpose: string;
  tone: string;
  confidence: number; // Overall belief confidence 0-1

  // ── Question Tracker ──
  askedQuestions: string[]; // All questions previously asked
  knownInfo: Record<string, string>; // Key → answered value
  avoidTopics: string[]; // Topics to NOT ask about again

  // ── Creative Memory ──
  emotionalSignals: string[]; // Detected emotions (e.g., "感动", "怀念")
  keyScenes: string[]; // User-described scenes
  metaphors: string[]; // User-used metaphors

  // ── Consensus & Genre ──
  consensusSignals: string; // What consensus engine detected
  detectedGenre: string; // Dynamic genre detection result

  // ── Framework State ──
  articleFramework: string; // 起承转合 framework text
  frameworkStage: string; // Which stage we're in: 起/承/转/合
  frameworkProgress: string; // What's been collected, what's missing

  // ── Frustration State ──
  lastQuestion: string; // Last question asked
  consecutiveShortAnswers: number; // Count of short user replies
  userConfused: boolean; // Detected confusion

  // ── Style Direction ──
  styleDirection: string; // Phase 1 style choice (e.g., "沉静内敛")
  styleDirectionConfirmed: boolean;

  // ── Empathy ──
  lastEmpathyAck: string; // Last empathy acknowledgment sent
  strongEmotionDetected: boolean;

  // ── Style Vector ──
  styleContext: string; // Formatted style context for prompts
  styleConfidence: number; // Current style prediction confidence

  // ── Import (if any) ──
  importedBlueprint: ExtractedBlueprint | null;
  importedContent: string | null;
}

/**
 * Build a unified DiscoveryContext from all state sources.
 * This is called ONCE before each skill pipeline execution.
 */
export function buildDiscoveryContext(params: {
  userInput: string;
  conversationHistory: Message[];
  roundCount: number;
  belief: BeliefState;
  questionTracker: QuestionTracker;
  creativeMemory: CreativeMemory;
  consensusSignals?: string;
  detectedGenre?: string;
  articleFramework?: string;
  frameworkStage?: string;
  frameworkProgress?: string;
  lastQuestion?: string;
  consecutiveShortAnswers?: number;
  styleDirection?: string;
  styleDirectionConfirmed?: boolean;
  lastEmpathyAck?: string;
  strongEmotionDetected?: boolean;
  importedBlueprint?: ExtractedBlueprint | null;
  importedContent?: string | null;
  styleContext?: string;
  styleConfidence?: number;
}): DiscoveryContext {
  // Build belief summary
  const beliefParts: string[] = [];
  if (params.belief.topic?.value) beliefParts.push(`主题: ${params.belief.topic.value}`);
  if (params.belief.artifact?.value) beliefParts.push(`体裁: ${params.belief.artifact.value}`);
  if (params.belief.audience?.value) beliefParts.push(`读者: ${params.belief.audience.value}`);
  if (params.belief.intent?.value) beliefParts.push(`目的: ${params.belief.intent.value}`);
  if (params.belief.tone?.value) beliefParts.push(`语气: ${params.belief.tone.value}`);

  const beliefSummary = beliefParts.join('；') || '尚未确定';

  // Collect known info
  const knownInfo: Record<string, string> = {};
  if (params.belief.topic?.value) knownInfo['主题'] = params.belief.topic.value;
  if (params.belief.artifact?.value) knownInfo['体裁'] = params.belief.artifact.value;
  if (params.belief.audience?.value) knownInfo['读者'] = params.belief.audience.value;
  if (params.belief.intent?.value) knownInfo['目的'] = params.belief.intent.value;
  if (params.belief.tone?.value) knownInfo['语气'] = params.belief.tone.value;

  // Extract asked questions from tracker history
  const qContext = params.questionTracker.getContext();
  const askedQuestions = qContext.history.map((q) => q.question);

  // Extract emotional signals from emotionalArc objects
  const emotionalSignals = params.creativeMemory?.emotionalArc?.map((e) => e.feeling) || [];

  // Extract metaphor values from CreativeMetaphor objects
  const metaphors = params.creativeMemory?.metaphors?.map((m) => m.value) || [];

  return {
    userInput: params.userInput,
    conversationHistory: params.conversationHistory,
    roundCount: params.roundCount,
    beliefSummary,
    topic: params.belief.topic?.value || '',
    artifact: params.belief.artifact?.value || '',
    audience: params.belief.audience?.value || '',
    purpose: params.belief.intent?.value || '',
    tone: params.belief.tone?.value || '',
    confidence: params.belief.overallConfidence || 0,
    askedQuestions,
    knownInfo,
    avoidTopics: params.questionTracker.buildAvoidList?.() || [],
    emotionalSignals,
    keyScenes: params.creativeMemory?.keyMessages?.slice(0, 5) || [],
    metaphors,
    consensusSignals: params.consensusSignals || '',
    detectedGenre: params.detectedGenre || '',
    articleFramework: params.articleFramework || '',
    frameworkStage: params.frameworkStage || '起',
    frameworkProgress: params.frameworkProgress || '',
    lastQuestion: params.lastQuestion || '',
    consecutiveShortAnswers: params.consecutiveShortAnswers || 0,
    userConfused: false,
    styleDirection: params.styleDirection || '',
    styleDirectionConfirmed: params.styleDirectionConfirmed || false,
    lastEmpathyAck: params.lastEmpathyAck || '',
    strongEmotionDetected: params.strongEmotionDetected || false,
    styleContext: params.styleContext || '',
    styleConfidence: params.styleConfidence || 0,
    importedBlueprint: params.importedBlueprint || null,
    importedContent: params.importedContent || null,
  };
}

/**
 * Convert DiscoveryContext to a compact string for LLM system prompts.
 */
export function ctxToString(ctx: DiscoveryContext): string {
  const parts: string[] = [];

  parts.push('【当前已理解】');
  parts.push(ctx.beliefSummary || '（尚无明确理解）');

  if (ctx.consensusSignals) {
    parts.push(`\n【共识信号】${ctx.consensusSignals}`);
  }

  if (ctx.emotionalSignals.length > 0) {
    parts.push(`\n【情感信号】${ctx.emotionalSignals.join('、')}`);
  }

  if (ctx.articleFramework) {
    parts.push(`\n【文章框架】${ctx.articleFramework}`);
    parts.push(`当前阶段: ${ctx.frameworkStage}`);
  }

  if (ctx.askedQuestions.length > 0) {
    parts.push(`\n【已问过的问题】${ctx.askedQuestions.slice(-5).join(' | ')}`);
  }

  if (ctx.avoidTopics.length > 0) {
    parts.push(`\n【避免话题】${ctx.avoidTopics.join('、')}`);
  }

  if (ctx.styleDirection) {
    parts.push(`\n【风格方向】${ctx.styleDirection}`);
  }

  parts.push(`\n【对话轮次】第${ctx.roundCount}轮`);
  parts.push(`【置信度】${(ctx.confidence * 100).toFixed(0)}%`);

  return parts.join('\n');
}
