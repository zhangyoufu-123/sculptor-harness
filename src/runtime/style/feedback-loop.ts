/**
 * Feedback Loop Controller — orchestrates the Critique → Retrain → Regenerate cycle.
 *
 * Flow:
 * 1. Generate text in target style
 * 2. Critic evaluates against target style (structured JSON)
 * 3. Parse critique into training signals
 * 4. Apply signals to correct the style vector
 * 5. Regenerate with updated vector
 * 6. Repeat until score meets threshold or max iterations
 */

/* eslint-disable no-console */
import { styleCriticAgent, type StructuredCritique } from '@/agents/cluster/style-critic-agent';
import { critiqueToSignals, applySignals } from './critique-parser';
import { styleVectorStore, type StyleSnapshot } from './style-vector-store';
import { formatStyleContext } from './style-predictor';
import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export interface LoopConfig {
  /** Target style definition */
  targetStyle: {
    name: string;
    characteristics: string[];
    knownTechniques: string[];
    samplePhrases: string[];
  };
  /** Generation prompt template */
  generationPrompt: {
    systemPrompt: string;
    userPrompt: string;
  };
  /** Stop criteria */
  stopCriteria: {
    /** Minimum acceptable score (0-100) */
    minScore: number;
    /** Maximum iterations */
    maxIterations: number;
    /** Score improvement threshold to continue (absolute) */
    minImprovement: number;
  };
  /** External feedback to incorporate (e.g., human critique) */
  externalFeedback?: string;
}

export interface LoopIteration {
  iteration: number;
  generatedText: string;
  critique: StructuredCritique;
  score: number;
  signalsApplied: number;
  vectorSnapshot: StyleSnapshot;
}

export interface LoopResult {
  iterations: LoopIteration[];
  finalText: string;
  finalScore: number;
  finalSnapshot: StyleSnapshot;
  converged: boolean;
  totalTime: number;
}

// ─── Feedback Loop ────────────────────────────────────────────

export async function runFeedbackLoop(config: LoopConfig): Promise<LoopResult> {
  const iterations: LoopIteration[] = [];
  const startTime = Date.now();
  let bestScore = 0;
  let bestText = '';

  console.log(`\n🔄 Starting feedback loop for: ${config.targetStyle.name}`);
  console.log(`   Max iterations: ${config.stopCriteria.maxIterations}`);
  console.log(`   Min score: ${config.stopCriteria.minScore}\n`);

  for (let i = 0; i < config.stopCriteria.maxIterations; i++) {
    console.log(`─── Iteration ${i + 1} ───`);

    // ═══ STEP 1: Generate ═══════════════════════════════════
    console.log('  📝 Generating...');
    const generatedText = await generateWithStyle(
      config.generationPrompt.systemPrompt,
      config.generationPrompt.userPrompt,
    );
    console.log(`     Generated ${generatedText.length} chars`);

    // ═══ STEP 2: Critique ═══════════════════════════════════
    console.log('  🔍 Critiquing...');
    const critique = await styleCriticAgent.critique(
      generatedText,
      config.targetStyle,
      config.externalFeedback, // Pass human critique if available
    );
    console.log(`     Score: ${critique.overallScore}/100`);

    // Track best
    if (critique.overallScore > bestScore) {
      bestScore = critique.overallScore;
      bestText = generatedText;
    }

    // Save iteration data
    const snapshot = styleVectorStore.getSnapshot();
    iterations.push({
      iteration: i + 1,
      generatedText,
      critique,
      score: critique.overallScore,
      signalsApplied: 0,
      vectorSnapshot: snapshot,
    });

    // ═══ STEP 3: Check convergence ══════════════════════════
    if (critique.overallScore >= config.stopCriteria.minScore && i > 0) {
      console.log(
        `  ✅ Score ${critique.overallScore} >= ${config.stopCriteria.minScore} — converged!\n`,
      );
      return buildResult(iterations, bestText, bestScore, true, startTime);
    }

    // Check if improvement is too small
    if (i > 0) {
      const prevScore = iterations[i - 1].score;
      const improvement = critique.overallScore - prevScore;
      if (improvement < config.stopCriteria.minImprovement) {
        console.log(
          `  ⚠️  Improvement ${improvement.toFixed(1)} < ${config.stopCriteria.minImprovement} — stopping\n`,
        );
        return buildResult(iterations, bestText, bestScore, false, startTime);
      }
    }

    // ═══ STEP 4: Retrain ═══════════════════════════════════
    if (critique.shouldRegenerate) {
      console.log('  🔄 Retraining vector...');
      const signals = critiqueToSignals(critique, generatedText);
      applySignals(signals);
      iterations[iterations.length - 1].signalsApplied = signals.length;
      console.log(`     Applied ${signals.length} training signals`);
    } else {
      console.log('  ⏭️  Critique suggests no regeneration needed');
    }
  }

  console.log(`  ⚠️  Reached max iterations (${config.stopCriteria.maxIterations})\n`);
  return buildResult(iterations, bestText, bestScore, false, startTime);
}

// ─── Helpers ──────────────────────────────────────────────────

async function generateWithStyle(systemPrompt: string, userPrompt: string): Promise<string> {
  const llm = getLLM();

  // Inject current style context into system prompt
  const styleContext = formatStyleContext();
  const enrichedSystem = styleContext
    ? `${systemPrompt}\n\n当前学习到的风格特征：\n${styleContext}`
    : systemPrompt;

  const response = await llm.completeWithRetry({
    systemPrompt: enrichedSystem,
    prompt: userPrompt,
    temperature: 0.7,
    maxTokens: 4000,
  });

  return response.text || '';
}

function buildResult(
  iterations: LoopIteration[],
  finalText: string,
  finalScore: number,
  converged: boolean,
  startTime: number,
): LoopResult {
  return {
    iterations,
    finalText,
    finalScore,
    finalSnapshot: styleVectorStore.getSnapshot(),
    converged,
    totalTime: Date.now() - startTime,
  };
}
