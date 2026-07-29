interface AlgorithmResult<T> {
  success: boolean;
  data?: T;
  error?: {
    type: 'LLM_TIMEOUT' | 'LLM_FORMAT_ERROR' | 'LLM_RATE_LIMIT' | 'VALIDATION_ERROR' | 'UNKNOWN';
    message: string;
    fallbackUsed: boolean;
  };
  latency: number; // ms
  algorithmName: string;
}

interface AlgorithmConfig {
  name: string;
  timeout?: number; // Max execution time (ms)
  fallback?: <T>() => T; // Fallback function if main execution fails
  retryCount?: number; // Number of retries
}

interface ExecutionLogEntry {
  name: string;
  timestamp: string;
  latency: number;
  success: boolean;
  error?: string;
}

const MAX_LOG_SIZE = 1000;

// ---- Error classification helpers ----

type ErrorType = NonNullable<AlgorithmResult<unknown>['error']>['type'];

function classifyErrorMessage(message: string): ErrorType {
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'LLM_TIMEOUT';
  }
  if (
    lower.includes('format') ||
    lower.includes('parse') ||
    lower.includes('json') ||
    lower.includes('syntax')
  ) {
    return 'LLM_FORMAT_ERROR';
  }
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many')) {
    return 'LLM_RATE_LIMIT';
  }
  if (lower.includes('validation') || lower.includes('invalid')) {
    return 'VALIDATION_ERROR';
  }
  return 'UNKNOWN';
}

function classifyError(error: unknown): ErrorType {
  const message = error instanceof Error ? error.message : String(error);
  return classifyErrorMessage(message);
}

// ---- Utility ----

/**
 * Wraps a promise with a timeout. If the promise does not resolve within
 * `ms` milliseconds, it rejects with a descriptive timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Algorithm "${name}" timed out after ${ms}ms`)), ms);
    }),
  ]);
}

// ---- AlgorithmRunner ----

class AlgorithmRunner {
  private executionLog: ExecutionLogEntry[] = [];

  /**
   * Execute an algorithm function with full reliability wrapping:
   * - timeout enforcement
   * - retries
   * - fallback / degradation
   * - latency tracking
   * - structured error reporting
   *
   * Never throws — all errors are captured in the result envelope.
   */
  async run<T>(config: AlgorithmConfig, fn: () => Promise<T>): Promise<AlgorithmResult<T>> {
    const startTime = Date.now();
    const maxAttempts = (config.retryCount ?? 0) + 1;
    let lastError: unknown;

    // --- Try main execution with retries ---
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        let execution = fn();
        if (config.timeout !== undefined) {
          execution = withTimeout(execution, config.timeout, config.name);
        }
        const data = await execution;
        const latency = Date.now() - startTime;

        this.logExecution(config.name, latency, true);

        return {
          success: true,
          data,
          latency,
          algorithmName: config.name,
        };
      } catch (error) {
        lastError = error;
        // continue to next retry attempt
      }
    }

    // --- All retries exhausted — try fallback ---
    if (config.fallback) {
      try {
        const data = config.fallback<T>();
        const latency = Date.now() - startTime;

        this.logExecution(config.name, latency, true);

        return {
          success: true,
          data,
          latency,
          algorithmName: config.name,
        };
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }

    // --- Both main execution and fallback failed ---
    const latency = Date.now() - startTime;
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    const errorType = classifyError(lastError);
    const fallbackUsed = config.fallback !== undefined;

    this.logExecution(config.name, latency, false, errorMessage);

    return {
      success: false,
      error: {
        type: errorType,
        message: errorMessage,
        fallbackUsed,
      },
      latency,
      algorithmName: config.name,
    };
  }

  /**
   * Execute multiple algorithms concurrently and collect results.
   * Individual failures never stop other algorithms from completing.
   */
  async runAll(
    algorithms: Record<string, { config: AlgorithmConfig; fn: () => Promise<unknown> }>,
  ): Promise<Record<string, AlgorithmResult<unknown>>> {
    const entries = await Promise.all(
      Object.entries(algorithms).map(async ([key, { config, fn }]) => {
        const result = await this.run<unknown>(config, fn);
        return [key, result] as const;
      }),
    );

    return Object.fromEntries(entries) as Record<string, AlgorithmResult<unknown>>;
  }

  /**
   * Return aggregate execution statistics.
   */
  getStats(): {
    totalExecutions: number;
    successRate: number;
    averageLatency: number;
    failuresByType: Record<string, number>;
    recentExecutions: Array<{
      name: string;
      success: boolean;
      latency: number;
    }>;
  } {
    const log = this.executionLog;
    const totalExecutions = log.length;
    const successful = log.filter((e) => e.success).length;
    const successRate = totalExecutions > 0 ? successful / totalExecutions : 0;

    const averageLatency =
      totalExecutions > 0 ? log.reduce((sum, e) => sum + e.latency, 0) / totalExecutions : 0;

    // Aggregate failures by error type
    const failuresByType: Record<string, number> = {};
    for (const entry of log) {
      if (!entry.success && entry.error !== undefined) {
        const type = classifyErrorMessage(entry.error);
        failuresByType[type] = (failuresByType[type] ?? 0) + 1;
      }
    }

    // Last 10 executions
    const recentExecutions = log.slice(-10).map((e) => ({
      name: e.name,
      success: e.success,
      latency: e.latency,
    }));

    return {
      totalExecutions,
      successRate,
      averageLatency,
      failuresByType,
      recentExecutions,
    };
  }

  /**
   * Clear the internal execution log.
   */
  resetLog(): void {
    this.executionLog = [];
  }

  // ------- private helpers -------

  private logExecution(name: string, latency: number, success: boolean, error?: string): void {
    this.executionLog.push({
      name,
      timestamp: new Date().toISOString(),
      latency,
      success,
      error,
    });

    // FIFO eviction — keep at most MAX_LOG_SIZE entries
    while (this.executionLog.length > MAX_LOG_SIZE) {
      this.executionLog.shift();
    }
  }
}

// ---- Exports ----

export { AlgorithmRunner, withTimeout };
export type { AlgorithmResult, AlgorithmConfig };
