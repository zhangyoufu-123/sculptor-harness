// ---------------------------------------------------------------------------
// Sculptor V1 — Intake Agent (Phase 0: initializing)
//
// Parses the user's raw idea input into structured PCS fields via LLM with
// a rule-based fallback for resilience.
// ---------------------------------------------------------------------------

import { BaseAgent } from './types';
import { createAgentResponse, startTimer } from './base-agent';
import type { AgentRequest, AgentResponse, IPCSAccessor, ProposalMutation } from './types';
import { LLMClient } from '@/lib/llm-client';
import { INTAKE_PARSE_PROMPT } from '@/prompts/intake-agent';

// ---------------------------------------------------------------------------
// Shared LLM client instance
// ---------------------------------------------------------------------------

const llmClient = new LLMClient();

// ---------------------------------------------------------------------------
// Intake parse result shape (matches INTAKE_PARSE_PROMPT output)
// ---------------------------------------------------------------------------

interface IntakeParseResult {
  purpose: { value: string; confidence: number };
  core_message: { value: string; confidence: number };
  audience_type: { value: string; confidence: number };
  format: { value: string; confidence: number };
  platform: { value: string; confidence: number };
  tone: { value: string; confidence: number };
}

// ---------------------------------------------------------------------------
// Rule-based fallback parser
//
// Detects keywords in raw text corresponding to purpose, platform, content
// type, and audience. Used when the LLM call fails or returns no usable data.
// ---------------------------------------------------------------------------

const PURPOSE_KEYWORDS: Record<string, string> = {
  说服: '说服',
  persuade: '说服',
  告知: '告知',
  inform: '告知',
  娱乐: '娱乐',
  entertain: '娱乐',
  启发: '启发',
  inspire: '启发',
  分享: '分享',
  share: '分享',
  分析: '分析',
  analyze: '分析',
};

const PLATFORM_KEYWORDS: Record<string, string> = {
  公众号: '微信公众号',
  微信: '微信',
  wechat: '微信',
  知乎: '知乎',
  zhihu: '知乎',
  小红书: '小红书',
  medium: 'Medium',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
  邮件: '邮件',
  email: '邮件',
};

const TYPE_KEYWORDS: Record<string, string> = {
  文章: '文章',
  article: '文章',
  帖子: '社交媒体帖子',
  post: '社交媒体帖子',
  论文: '学术论文',
  paper: '学术论文',
  报告: '报告',
  report: '报告',
  脚本: '脚本',
  script: '脚本',
  教程: '教程',
  tutorial: '教程',
};

const AUDIENCE_KEYWORDS: Record<string, string> = {
  专家: '行业专家',
  expert: '行业专家',
  大众: '普通大众',
  general: '普通大众',
  学生: '学生',
  student: '学生',
  开发者: '开发者',
  developer: '开发者',
  管理者: '管理者',
  manager: '管理者',
};

function matchKeyword(
  text: string,
  dict: Record<string, string>,
): { value: string; confidence: number } {
  const lowerText = text.toLowerCase();
  for (const [key, val] of Object.entries(dict)) {
    if (lowerText.includes(key)) {
      return { value: val, confidence: 0.6 };
    }
  }
  return { value: '', confidence: 0.0 };
}

function ruleBasedParse(rawInput: string): IntakeParseResult {
  return {
    purpose: matchKeyword(rawInput, PURPOSE_KEYWORDS),
    core_message: { value: rawInput.slice(0, 200), confidence: 0.3 },
    audience_type: matchKeyword(rawInput, AUDIENCE_KEYWORDS),
    format: matchKeyword(rawInput, TYPE_KEYWORDS),
    platform: matchKeyword(rawInput, PLATFORM_KEYWORDS),
    tone: { value: '', confidence: 0.0 },
  };
}

// ---------------------------------------------------------------------------
// Build ProposalMutation[] from parsed result
//
// Every mutation uses confidence < 1.0 (assumed) and trigger "manual"
// because this is first-pass user-intent capture.
// ---------------------------------------------------------------------------

function buildMutations(parsed: IntakeParseResult): ProposalMutation[] {
  const mutations: ProposalMutation[] = [];
  const reason = 'Extracted from user input by Intake Agent (V1)';

  const addMutation = (fieldPath: string, value: string, confidence: number): void => {
    if (value.length > 0) {
      mutations.push({
        fieldPath,
        proposedValue: value,
        reason,
        trigger: 'manual',
        confidence: Math.min(confidence, 0.99),
      });
    }
  };

  addMutation('intent.purpose', parsed.purpose.value, parsed.purpose.confidence);
  addMutation('intent.core_message', parsed.core_message.value, parsed.core_message.confidence);
  addMutation(
    'audience.audience_type',
    parsed.audience_type.value,
    parsed.audience_type.confidence,
  );
  addMutation('constraint.type', parsed.format.value, parsed.format.confidence);
  addMutation('constraint.platform', parsed.platform.value, parsed.platform.confidence);

  return mutations;
}

// ---------------------------------------------------------------------------
// IntakeAgent
// ---------------------------------------------------------------------------

export class IntakeAgent extends BaseAgent {
  constructor(pcs: IPCSAccessor) {
    super('intake', pcs);
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const stop = startTimer();
    const action = request.action;

    switch (action) {
      case 'parse': {
        const rawInput =
          typeof request.payload === 'string' ? request.payload : String(request.payload ?? '');

        let parsedResult: IntakeParseResult | null = null;
        let llmCalls = 0;
        let tokensUsed = 0;

        // Attempt LLM-based parsing
        try {
          const systemPrompt = INTAKE_PARSE_PROMPT.systemPrompt ?? '';
          const prompt = INTAKE_PARSE_PROMPT.template.replace('{{user_idea}}', rawInput);

          const response = await llmClient.complete({
            prompt,
            systemPrompt,
            responseFormat: 'json',
            maxTokens: INTAKE_PARSE_PROMPT.maxTokens,
          });

          llmCalls = 1;
          tokensUsed = response.usage.totalTokens;

          if (response.json && typeof response.json === 'object') {
            const json = response.json as Record<string, unknown>;
            parsedResult = {
              purpose: asFieldResult(json['purpose']),
              core_message: asFieldResult(json['core_message']),
              audience_type: asFieldResult(json['audience_type']),
              format: asFieldResult(json['format']),
              platform: asFieldResult(json['platform']),
              tone: asFieldResult(json['tone']),
            };
          }
        } catch {
          // LLM failed — fall through to rule-based parsing
        }

        // Fallback
        if (!parsedResult) {
          parsedResult = ruleBasedParse(rawInput);
        }

        const mutations = buildMutations(parsedResult);
        const latency = stop();

        return createAgentResponse('intake', action, {
          result: {
            parsed: parsedResult,
            method: llmCalls > 0 ? 'llm' : 'rule-based',
          },
          pcsMutations: mutations,
          nextActions: ['clarify'],
          latency,
          llmCalls,
          tokensUsed,
        });
      }

      default:
        return createAgentResponse('intake', action, {
          result: { error: `Unknown action: ${action}` },
          latency: stop(),
        });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asFieldResult(raw: unknown): { value: string; confidence: number } {
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const value = typeof obj['value'] === 'string' ? obj['value'] : '';
    const confidence = typeof obj['confidence'] === 'number' ? obj['confidence'] : 0;
    return { value, confidence: clamp(confidence) };
  }
  return { value: '', confidence: 0 };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
