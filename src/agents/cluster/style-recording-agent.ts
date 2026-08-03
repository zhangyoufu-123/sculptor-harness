/**
 * Style Recording Agent — observes user choices and optimizes the 3D style vector.
 *
 * Lifecycle:
 * - Activated when: user makes a choice (A/B/C), question is generated, writing starts
 * - Deactivated when: TTL expires or writing session ends
 * - Subscribes to: user_choice_made, question_generated, writing_session_started
 */

import { agentBus, type ClusterEvent, type AgentRole } from './agent-bus';
import { styleVectorStore } from '@/runtime/style/style-vector-store';
import { recordUserChoice, formatStyleContext } from '@/runtime/style/style-predictor';

const AGENT_ID: AgentRole = 'style_recorder';

// ─── Style Recording Agent ───────────────────────────────────

class StyleRecordingAgent {
  private lastPrediction: { options: string[]; probs: number[] } | null = null;

  constructor() {
    // Register with the bus
    agentBus.registerAgent(AGENT_ID, this);

    // Subscribe to relevant events
    agentBus.on('user_choice_made', this.onUserChoice.bind(this));
    agentBus.on('question_generated', this.onQuestionGenerated.bind(this));
    agentBus.on('writing_session_started', this.onWritingStarted.bind(this));

    console.log('[StyleRecordingAgent] Registered on Agent Bus');
  }

  /** Called when a question with options is generated */
  private onQuestionGenerated(event: ClusterEvent): void {
    if (!agentBus.isActive(AGENT_ID)) this.requestActivation('question generated');

    const { options } = event.payload as { options?: string[] };
    if (!options || options.length < 2) return;

    // Predict what the user will choose
    const probs = styleVectorStore.predictChoices(options);
    this.lastPrediction = { options, probs };

    // Write prediction to shared memory
    const mem = agentBus.getMemory();
    agentBus.updateMemory({
      ...mem,
      styleVectors: {
        ...mem.styleVectors,
        personalDataset: Array.from(styleVectorStore.getSnapshot().vector.personalDataset),
        writingDeviation: Array.from(styleVectorStore.getSnapshot().vector.writingDeviation),
      },
    });
  }

  /** Called when user makes a choice */
  private onUserChoice(event: ClusterEvent): void {
    if (!agentBus.isActive(AGENT_ID)) this.requestActivation('user choice made');

    const payload = event.payload as {
      question?: string;
      chosenIndex?: number;
      options?: string[];
    };

    if (payload.chosenIndex === undefined || !this.lastPrediction) return;

    // Record choice and update vector
    recordUserChoice(
      payload.question || '',
      this.lastPrediction.options,
      payload.chosenIndex,
      this.lastPrediction.probs,
    );

    // Get updated snapshot
    const snapshot = styleVectorStore.getSnapshot();

    // Emit style vector updated event
    agentBus.emit({
      type: 'style_vector_updated',
      source: AGENT_ID,
      payload: {
        snapshot,
        predictionError: 1 - (this.lastPrediction.probs[payload.chosenIndex] || 0),
        confidenceChange: 0, // Calculated internally
      },
      priority: 'medium',
    });

    this.lastPrediction = null;
  }

  /** Called when writing session starts */
  private onWritingStarted(_event: ClusterEvent): void {
    if (!agentBus.isActive(AGENT_ID)) {
      this.requestActivation('writing session started');
    }

    // Provide style context for writing
    const styleContext = formatStyleContext();
    agentBus.emit({
      type: 'style_vector_updated',
      source: AGENT_ID,
      payload: { styleContext },
      priority: 'high',
    });
  }

  /** Request this agent to be activated */
  private requestActivation(reason: string): void {
    agentBus.requestActivation({
      targetAgent: AGENT_ID,
      reason,
      priority: 'high',
      context: {},
      requestedBy: AGENT_ID,
      timestamp: Date.now(),
      ttl: 60000,
    });
  }
}

// ─── Global Singleton ────────────────────────────────────────

export const styleRecordingAgent = new StyleRecordingAgent();
