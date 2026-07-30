/**
 * Artifact Hypothesis Layer
 *
 * Before asking questions, the AI should FORM HYPOTHESES about what the user wants.
 * These hypotheses are then VALIDATED through targeted questions.
 *
 * "I think the user wants X. Let me ask to confirm."
 * NOT: "What do you want? (1) X (2) Y (3) Z"
 */

import type { IntentInterpretation, ArtifactType } from './intent-interpreter';
import { interpretIntent, ARTIFACT_LABELS } from './intent-interpreter';

export interface CreativeHypothesis {
  /** What kind of work this might be */
  artifactType: ArtifactType;
  /** The core topic/theme */
  topic: string;
  /** What the user is trying to achieve */
  purpose: string;
  /** 1-3 possible directions the work could take */
  possibleDirections: string[];
  /** What we're most uncertain about */
  keyQuestion: string;
  /** Confidence in this hypothesis (0-1) */
  confidence: number;
}

export interface HypothesisResult {
  /** The interpretation that generated these hypotheses */
  interpretation: IntentInterpretation;
  /** 1-3 ranked hypotheses */
  hypotheses: CreativeHypothesis[];
  /** The SINGLE best question to ask next */
  nextQuestion: {
    text: string;
    reason: string;
    options: string[];
  };
}

/**
 * Generate creative hypotheses from the user's input.
 * Instead of asking "what type?", the system says "I think you mean X. Is this right?"
 */
export function generateHypotheses(input: string): HypothesisResult {
  const interpretation = interpretIntent(input);
  const hypotheses = buildHypotheses(interpretation);
  const nextQuestion = selectBestQuestion(hypotheses, interpretation);

  return { interpretation, hypotheses, nextQuestion };
}

function buildHypotheses(interp: IntentInterpretation): CreativeHypothesis[] {
  const hypotheses: CreativeHypothesis[] = [];
  const topic = interp.topic;

  // Primary hypothesis (from top artifact type)
  const primary = interp.primaryArtifact;
  hypotheses.push({
    artifactType: primary.type,
    topic,
    purpose: interp.purpose.type,
    possibleDirections: generateDirections(primary.type, topic),
    keyQuestion: interp.unknowns[0] || '核心意图',
    confidence: primary.confidence,
  });

  // Secondary hypothesis (from runner-up, if close enough)
  const runnerUp = interp.artifactCandidates[1];
  if (runnerUp && runnerUp.confidence > 0.3) {
    hypotheses.push({
      artifactType: runnerUp.type,
      topic,
      purpose: interp.purpose.type,
      possibleDirections: generateDirections(runnerUp.type, topic),
      keyQuestion: interp.unknowns[0] || '核心意图',
      confidence: runnerUp.confidence,
    });
  }

  return hypotheses;
}

/**
 * Generate possible creative directions for a given artifact type and topic.
 */
function generateDirections(type: ArtifactType, topic: string): string[] {
  const directions: Record<ArtifactType, string[]> = {
    argumentative_essay: [
      `论证"${topic}"的重要性`,
      `批判关于"${topic}"的常见误解`,
      `比较关于"${topic}"的不同观点`,
    ],
    academic_paper: [
      `研究"${topic}"的影响因素`,
      `分析"${topic}"的发展趋势`,
      `评估关于"${topic}"的现有理论`,
    ],
    blog_post: [
      `分享关于"${topic}"的实用经验`,
      `解读"${topic}"的最新动态`,
      `总结"${topic}"的核心要点`,
    ],
    novel: [
      `以"${topic}"为背景的成长故事`,
      `围绕"${topic}"展开的冲突叙事`,
      `通过"${topic}"探讨人性主题`,
    ],
    narrative_essay: [`记录一段与"${topic}"相关的个人经历`, `讲述一个关于"${topic}"的真实故事`],
    research_report: [`调查"${topic}"的现状与问题`, `分析"${topic}"的数据趋势`],
    business_proposal: [`提出关于"${topic}"的商业方案`, `分析"${topic}"的市场机会`],
    tutorial: [`从零开始学会"${topic}"`, `掌握"${topic}"的核心技巧`],
    speech: [`关于"${topic}"的激励演讲`, `在"${topic}"领域的专业分享`],
    short_story: [`一个关于"${topic}"的短篇故事`],
    poetry: [`以"${topic}"为主题的诗歌`],
    expository_essay: [`介绍"${topic}"的基本概念`],
    unknown: [`探索"${topic}"`],
  };

  return directions[type] || [topic];
}

/**
 * Select the single best question based on information gain.
 */
function selectBestQuestion(
  hypotheses: CreativeHypothesis[],
  interp: IntentInterpretation,
): { text: string; reason: string; options: string[] } {
  const top = hypotheses[0];

  // If confidence is low, ask about artifact type
  if (top.confidence < 0.5) {
    return {
      text: `我理解你想创作关于"${interp.topic}"的内容。你更希望它是：`,
      reason: '作品类型不确定',
      options: interp.artifactCandidates.slice(0, 3).map((c) => ARTIFACT_LABELS[c.type]),
    };
  }

  // If there are multiple high-confidence directions, ask about direction
  if (top.possibleDirections.length >= 2) {
    return {
      text: `关于"${interp.topic}"，你更想从哪个角度切入？`,
      reason: '创作方向待确认',
      options: top.possibleDirections.slice(0, 4),
    };
  }

  // If unknowns exist, ask about the highest-priority unknown
  const unknown = interp.unknowns[0];
  if (unknown) {
    return {
      text: `关于这个${ARTIFACT_LABELS[top.artifactType]}，你的${unknown}是什么？`,
      reason: `${unknown}是当前最大不确定性`,
      options: [],
    };
  }

  // Default
  return {
    text: '能再详细描述一下你的想法吗？',
    reason: '需要更多信息',
    options: [],
  };
}
