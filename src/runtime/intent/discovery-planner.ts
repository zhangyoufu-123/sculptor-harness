/**
 * Discovery Planner — Information Gain Algorithm
 *
 * Selects the NEXT question based on:
 * 1. Information Gain: how much does this question reduce uncertainty?
 * 2. Impact: how much does answering this affect the final output?
 * 3. User Comfort: how easy is this question to answer?
 *
 * Replaces: fixed question templates that ask the same things regardless of context.
 */

import type { IntentInterpretation } from './intent-interpreter';

export interface QuestionCandidate {
  text: string;
  /** Information gain (0-1): how much does this reduce uncertainty? */
  informationGain: number;
  /** Impact (0-1): how much does this affect the final output? */
  impact: number;
  /** User comfort (0-1): how easy is this to answer? */
  userComfort: number;
  /** Combined score */
  score: number;
  /** Options to present */
  options: string[];
  /** Which unknown this addresses */
  addresses: string;
}

/**
 * Generate and rank candidate questions based on the current interpretation.
 */
export function generateCandidateQuestions(interp: IntentInterpretation): QuestionCandidate[] {
  const candidates: QuestionCandidate[] = [];

  // Candidate: Core position/thesis (highest impact)
  candidates.push({
    text: `关于"${interp.topic}"，你的核心观点是什么？`,
    informationGain: 0.9,
    impact: 0.95,
    userComfort: 0.6,
    score: 0,
    options:
      interp.primaryArtifact.type === 'argumentative_essay'
        ? ['支持某个观点', '反驳常见误解', '提出新视角']
        : [],
    addresses: '核心观点',
  });

  // Candidate: Audience (high impact for most types)
  candidates.push({
    text: '这篇文章/作品主要给谁看？',
    informationGain: 0.7,
    impact: 0.75,
    userComfort: 0.9,
    score: 0,
    options: ['普通读者', '专业人士', '学生', '家长', '自己（不公开）'],
    addresses: '目标读者',
  });

  // Candidate: Purpose refinement
  candidates.push({
    text: '你希望读者读完后做什么？',
    informationGain: 0.6,
    impact: 0.7,
    userComfort: 0.7,
    score: 0,
    options: ['改变看法', '采取行动', '获得知识', '产生共鸣'],
    addresses: '创作目的',
  });

  // Candidate: Evidence/example needs
  candidates.push({
    text: `关于"${interp.topic}"，你有具体的例子或经历想分享吗？`,
    informationGain: 0.5,
    impact: 0.6,
    userComfort: 0.8,
    score: 0,
    options: ['有具体案例', '需要AI帮我想', '暂时没有'],
    addresses: '具体论据',
  });

  // Candidate: Tone/style
  candidates.push({
    text: '你希望这篇文章的语气是怎样的？',
    informationGain: 0.4,
    impact: 0.5,
    userComfort: 0.85,
    score: 0,
    options: ['理性分析', '感性共鸣', '幽默轻松', '严肃正式'],
    addresses: '语气风格',
  });

  // Calculate combined scores
  for (const c of candidates) {
    // Information Gain * Impact * User Comfort (with comfort bias)
    c.score = c.informationGain * 0.4 + c.impact * 0.4 + c.userComfort * 0.2;
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

/**
 * Select the single best question from candidates.
 */
export function selectBestQuestion(interp: IntentInterpretation): QuestionCandidate {
  const candidates = generateCandidateQuestions(interp);
  return candidates[0];
}

/**
 * Check if discovery is complete enough to proceed.
 */
export function isDiscoveryComplete(interp: IntentInterpretation, answeredCount: number): boolean {
  // If primary artifact confidence is high AND at least 3 questions answered
  if (interp.primaryArtifact.confidence > 0.7 && answeredCount >= 3) return true;
  // If answered 5+ questions regardless
  if (answeredCount >= 5) return true;
  return false;
}
