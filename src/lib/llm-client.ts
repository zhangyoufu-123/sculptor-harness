// ============================================================
// llm-client.ts — Unified LLM call wrapper for Sculptor agents
// ============================================================
//
// V2: Auto-detects mode — real DeepSeek API when DEEPSEEK_API_KEY
// is set in the environment, falls back to deterministic mock
// otherwise.  The retry, timeout, token estimation, and error
// handling machinery works identically in both modes.
// ============================================================

// ---- Interfaces ----

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string; // default: 'gpt-4o' (mock) / 'deepseek-chat' (real)
  temperature?: number; // default: 0.7
  maxTokens?: number; // default: 4096
  responseFormat?: 'text' | 'json';
  timeout?: number; // default: 30 000 ms
}

export interface LLMResponse {
  text: string;
  json?: unknown; // parsed JSON when responseFormat === 'json'
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number; // ms
  model: string;
}

export interface RetryConfig {
  maxRetries: number; // default: 3
  baseDelay: number; // default: 1 000 ms
  maxDelay: number; // default: 30 000 ms
}

// ---- Error types ----

export class LLMTimeoutError extends Error {
  timeout: number;

  constructor(timeout: number) {
    super(`LLM request timed out after ${timeout}ms`);
    this.name = 'LLMTimeoutError';
    this.timeout = timeout;
  }
}

export class LLMFormatError extends Error {
  rawResponse: string;

  constructor(message: string, rawResponse: string) {
    super(message);
    this.name = 'LLMFormatError';
    this.rawResponse = rawResponse;
  }
}

export class LLMRateLimitError extends Error {
  retryAfter: number;

  constructor(retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter}ms`);
    this.name = 'LLMRateLimitError';
    this.retryAfter = retryAfter;
  }
}

// ---- Private helpers ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Defaults ----

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT = 30_000;

const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1_000,
  maxDelay: 30_000,
};

// ---- LLMClient ----

export class LLMClient {
  private defaultModel: string;
  private retryConfig: RetryConfig;
  private mode: 'mock' | 'real';
  private apiKey?: string;
  private baseUrl: string;

  constructor(config?: { defaultModel?: string; retryConfig?: Partial<RetryConfig> }) {
    // Auto-detect mode: real when DEEPSEEK_API_KEY is set, mock otherwise.
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseUrl = process.env.DEEPSEEK_BASE_URL || DEEPSEEK_DEFAULT_BASE_URL;
    this.mode = this.apiKey ? 'real' : 'mock';

    // Default model: use env override in real mode, otherwise keep generic
    // default.  An explicit constructor argument always wins.
    if (this.mode === 'real' && !config?.defaultModel) {
      this.defaultModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    } else {
      this.defaultModel = config?.defaultModel ?? DEFAULT_MODEL;
    }

    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config?.retryConfig,
    };
  }

  // ---- Public API ----

  /**
   * Single-shot completion (no automatic retry).
   *
   * In real mode: POSTs to DeepSeek chat/completions endpoint.
   * In mock mode: returns a deterministic response derived from the prompt.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (this.mode === 'real') {
      return this.completeReal(request);
    }
    return this.completeMock(request);
  }

  /**
   * Completion with automatic exponential-backoff retry.
   *
   * LLMFormatError is **not** retried — a malformed response will not
   * repair itself on a subsequent attempt.
   *
   * LLMRateLimitError uses the `retryAfter` value returned by the
   * upstream API; all other errors use exponential backoff capped at
   * `maxDelay`.
   */
  async completeWithRetry(
    request: LLMRequest,
    retryConfig?: Partial<RetryConfig>,
  ): Promise<LLMResponse> {
    const config: RetryConfig = {
      ...this.retryConfig,
      ...retryConfig,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await this.complete(request);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Format errors are deterministic — do not retry.
        if (lastError instanceof LLMFormatError) {
          throw lastError;
        }

        // Exhausted all attempts.
        if (attempt === config.maxRetries) {
          break;
        }

        // Calculate backoff delay.
        let delay: number;
        if (lastError instanceof LLMRateLimitError) {
          delay = lastError.retryAfter;
        } else {
          delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
        }

        // eslint-disable-next-line no-console
        console.warn(
          `[LLMClient] Attempt ${attempt + 1}/${config.maxRetries} failed: ` +
            `${lastError.message}. Retrying in ${delay}ms…`,
        );

        await sleep(delay);
      }
    }

    // All retries exhausted.
    throw lastError!;
  }

  /**
   * Rough token-count estimate (≈4 characters per token).
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // ---- Private: Real API ----

  /**
   * Send a completion request to the DeepSeek (OpenAI-compatible) API.
   */
  private async completeReal(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const responseFormat = request.responseFormat ?? 'text';
    const timeout = request.timeout ?? DEFAULT_TIMEOUT;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Build messages array.
    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    // Build request body.
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    // DeepSeek requires response_format when JSON output is expected.
    if (responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // ---- Rate limit ----
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
        throw new LLMRateLimitError(retryAfterSec * 1000);
      }

      // ---- Generic HTTP error ----
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error ${response.status}: ${errorText.slice(0, 500)}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      const responseText: string = data.choices?.[0]?.message?.content ?? '';

      // ---- Token accounting ----
      let usage = {
        promptTokens: this.estimateTokens(request.prompt),
        completionTokens: this.estimateTokens(responseText),
        totalTokens: 0,
      };

      if (data.usage) {
        usage = {
          promptTokens: data.usage.prompt_tokens ?? usage.promptTokens,
          completionTokens: data.usage.completion_tokens ?? usage.completionTokens,
          totalTokens: data.usage.total_tokens ?? 0,
        };
      } else {
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
      }

      const result: LLMResponse = {
        text: responseText,
        usage,
        latency,
        model: data.model || model,
      };

      // ---- JSON parsing ----
      if (responseFormat === 'json') {
        try {
          result.json = JSON.parse(responseText);
        } catch {
          throw new LLMFormatError('Failed to parse JSON from LLM response', responseText);
        }
      }

      // ---- Request log ----
      // eslint-disable-next-line no-console
      console.log(
        `[LLMClient] model=${result.model} temp=${temperature} ` +
          `maxTok=${maxTokens} tokens=${result.usage.totalTokens} ` +
          `latency=${latency}ms`,
      );

      return result;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      // Re-throw our own typed errors.
      if (error instanceof LLMRateLimitError || error instanceof LLMFormatError) {
        throw error;
      }

      // AbortController timeout → LLMTimeoutError.
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMTimeoutError(timeout);
      }

      throw error;
    }
  }

  // ---- Private: Mock ----

  /**
   * Simulated completion for development / testing when no API key is set.
   */
  private async completeMock(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const responseFormat = request.responseFormat ?? 'text';
    const timeout = request.timeout ?? DEFAULT_TIMEOUT;

    // Simulate network latency (200–500 ms)
    const latency = 200 + Math.floor(Math.random() * 301);
    await sleep(Math.min(latency, timeout));

    // ---- Mock response generation ----
    const responseText = this.buildMockResponse(request.prompt, responseFormat);

    // ---- Token accounting ----
    const promptTokens = this.estimateTokens(request.prompt);
    const completionTokens = this.estimateTokens(responseText);

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

    // ---- JSON parsing ----
    if (responseFormat === 'json') {
      try {
        result.json = JSON.parse(responseText);
      } catch {
        throw new LLMFormatError('Failed to parse JSON from LLM response', responseText);
      }
    }

    // ---- Request log ----
    // eslint-disable-next-line no-console
    console.log(
      `[LLMClient] model=${model} temp=${temperature} maxTok=${maxTokens} ` +
        `tokens=${result.usage.totalTokens} latency=${latency}ms`,
    );

    return result;
  }

  /**
   * Build a deterministic mock response from the prompt.
   */
  private buildMockResponse(prompt: string, responseFormat: 'text' | 'json'): string {
    const truncated = prompt.length > 100 ? `${prompt.slice(0, 100)}…` : prompt;

    if (responseFormat === 'json') {
      return JSON.stringify({
        message: `Mock JSON response for: "${truncated}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return `Mock response to: "${truncated}"`;
  }
}
