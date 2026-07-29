// ============================================================
// harness.config.ts — Global test harness configuration
// ============================================================
//
// Central configuration for all Sculptor tests. Controls LLM
// mode (mock/record/live), PCS defaults, and timeout budgets.
// ============================================================

export interface HarnessConfig {
  llm: {
    mode: 'mock' | 'record' | 'live';
    mockResponseDir: string;
  };
  pcs: {
    defaultProjectId: string;
    defaultUserId: string;
  };
  timeout: {
    unit: number;
    integration: number;
  };
}

export const harnessConfig: HarnessConfig = {
  llm: {
    mode: 'mock' as const,
    mockResponseDir: 'src/test/fixtures/llm-responses/',
  },
  pcs: {
    defaultProjectId: 'test-project-001',
    defaultUserId: 'test-user-001',
  },
  timeout: {
    unit: 5000,
    integration: 30000,
  },
};
