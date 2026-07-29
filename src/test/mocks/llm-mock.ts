// ============================================================
// llm-mock.ts — Deterministic LLM mock for testing
// ============================================================
//
// Implements the same `complete` signature as LLMClient but returns
// pre-registered responses. Tracks call counts. Supports timeout
// and format-error simulation via registered behaviours.
// ============================================================

import type { LLMRequest, LLMResponse } from '@/lib/llm-client';
import { LLMTimeoutError, LLMFormatError } from '@/lib/llm-client';

// ---------------------------------------------------------------------------
// Registered behaviour per prompt-name
// ---------------------------------------------------------------------------

type PromptBehaviour =
  | { kind: 'response'; response: string | object }
  | { kind: 'timeout'; timeoutMs: number }
  | { kind: 'format-error'; message: string; rawResponse: string };

// ---------------------------------------------------------------------------
// Token estimator (kept separate for reuse)
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// LLMMock
// ---------------------------------------------------------------------------

export class LLMMock {
  private behaviours: Map<string, PromptBehaviour> = new Map();
  private callLog: Map<string, number> = new Map();

  // ------------------------------------------------------------------
  // Registration API
  // ------------------------------------------------------------------

  /**
   * Register a prompt-name → response mapping.
   *
   * @param promptName - Key used to look up the response during `complete()`.
   * @param response   - A string (text mode) or object (JSON mode) to return.
   */
  registerResponse(promptName: string, response: string | object): void {
    this.behaviours.set(promptName, { kind: 'response', response });
  }

  /**
   * Register a prompt-name that should throw {@link LLMTimeoutError}.
   */
  simulateTimeout(promptName: string): void {
    this.behaviours.set(promptName, { kind: 'timeout', timeoutMs: 30_000 });
  }

  /**
   * Register a prompt-name that should throw {@link LLMFormatError}.
   */
  simulateFormatError(promptName: string): void {
    this.behaviours.set(promptName, {
      kind: 'format-error',
      message: `Simulated format error for "${promptName}"`,
      rawResponse: `{ invalid json for ${promptName} }`,
    });
  }

  // ------------------------------------------------------------------
  // Query API
  // ------------------------------------------------------------------

  /**
   * Whether the mock has been called at least once for `promptName`.
   */
  wasCalled(promptName: string): boolean {
    return (this.callLog.get(promptName) ?? 0) > 0;
  }

  /**
   * How many times `complete()` was invoked with a given prompt-name.
   */
  getCallCount(promptName: string): number {
    return this.callLog.get(promptName) ?? 0;
  }

  // ------------------------------------------------------------------
  // LLMClient-compatible complete()
  // ------------------------------------------------------------------

  /**
   * Drop-in replacement for {@link LLMClient.complete}.
   *
   * Matches the request against registered behaviours by examining the
   * first 100 characters of `request.prompt` and using that substring as
   * the prompt-name key. If no behaviour is registered, throws an error.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const promptName = this.extractPromptName(request.prompt);

    // Bump call count regardless of outcome
    this.callLog.set(promptName, (this.callLog.get(promptName) ?? 0) + 1);

    const behaviour = this.behaviours.get(promptName);
    if (!behaviour) {
      throw new Error(
        `LLMMock: no registered behaviour for prompt "${promptName}". ` +
          `Call registerResponse(), simulateTimeout(), or simulateFormatError() first.`,
      );
    }

    const model = request.model ?? 'gpt-4o';
    const responseFormat = request.responseFormat ?? 'text';

    switch (behaviour.kind) {
      case 'timeout':
        throw new LLMTimeoutError(behaviour.timeoutMs);

      case 'format-error':
        throw new LLMFormatError(behaviour.message, behaviour.rawResponse);

      case 'response': {
        const responseText =
          typeof behaviour.response === 'string'
            ? behaviour.response
            : JSON.stringify(behaviour.response);

        const promptTokens = estimateTokens(request.prompt);
        const completionTokens = estimateTokens(responseText);
        const latency = 5; // near-instant for tests

        const result: LLMResponse = {
          text: responseText,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
          latency,
          model,
        };

        if (responseFormat === 'json') {
          try {
            result.json = JSON.parse(responseText);
          } catch {
            throw new LLMFormatError(
              `LLMMock: response for "${promptName}" is not valid JSON`,
              responseText,
            );
          }
        }

        return result;
      }
    }
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /** Clear all registered behaviours and call logs. */
  reset(): void {
    this.behaviours.clear();
    this.callLog.clear();
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Extract a lookup key from the prompt string.
   *
   * Default strategy: use up to the first 100 chars as the key.  Tests
   * register behaviours using the same truncated substring.
   */
  private extractPromptName(prompt: string): string {
    return prompt.length > 100 ? prompt.slice(0, 100) : prompt;
  }
}
