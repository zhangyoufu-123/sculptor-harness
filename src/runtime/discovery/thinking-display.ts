/**
 * Thinking Display — shows the AI's reasoning process in the terminal.
 *
 * Like DeepSeek's Chain of Thought, this makes the AI's decision-making
 * transparent to the user. Instead of silently deciding to excavate memories,
 * the user sees WHY the AI chose that path.
 */

import { LLMClient } from '@/lib/llm-client';

export interface ThinkingStep {
  /** What the AI is thinking about */
  topic: string;
  /** The AI's reasoning */
  thought: string;
  /** What the AI decided */
  decision: string;
  /** Confidence in this decision (0-1) */
  confidence: number;
  /** Alternatives considered */
  alternatives: string[];
}

export interface ThinkingTrace {
  /** All thinking steps */
  steps: ThinkingStep[];
  /** Final decision / action */
  action: string;
  /** Whether to show this to the user */
  visible: boolean;
}

const THINKING_PROMPT = `你是 Sculptor 创作助手的思考模块。你的任务是分析当前对话状态，决定下一步最优行动。

## 当前对话状态
{{state}}

## 可能的行动
1. reflect_consensus — 反射检测到的共识信号，验证理解
2. explore_meaning — 探索核心意义和创作方向
3. excavate_memory — 挖掘个人记忆和感官细节（仅适用于故事/散文/回忆类创作）
4. discuss_intellectual — 讨论智识议题（适用于论文/哲学/学术讨论）
5. generate_outline — 生成大纲（准备充分时）
6. recover — 对话跑偏了，需要回到正轨

## 你的任务
先思考，再决定。输出JSON:
{
  "steps": [
    {
      "topic": "当前在思考什么",
      "thought": "推理过程",
      "decision": "初步判断",
      "confidence": 0.0-1.0,
      "alternatives": ["其他可能的方向"]
    }
  ],
  "action": "选择的行动名称",
  "visible": true
}

## 关键规则
- 如果用户在用"论文""研究""哲学""学术"等词讨论智识议题 → discuss_intellectual，绝不 excavate_memory
- 如果用户在分享个人经历、记忆、感官细节 → excavate_memory
- 如果用户表达困惑、说"不对""不理解" → recover
- 如果理解已经充分 → generate_outline
- 思考过程要简洁，2-4个步骤即可`;

/**
 * Ask the LLM to think about what to do next.
 * Returns the thinking trace for display + the chosen action.
 */
export async function think(state: string, llmClient: LLMClient): Promise<ThinkingTrace> {
  try {
    const response = await llmClient.completeWithRetry({
      systemPrompt: THINKING_PROMPT.replace('{{state}}', state),
      prompt: `请分析当前对话状态并决定下一步行动。\n\n请以JSON格式输出你的思考过程。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 800,
    });
    if (response.json) return response.json as ThinkingTrace;
  } catch {
    /* fallback */
  }

  return {
    steps: [
      {
        topic: '决策',
        thought: '使用默认路径',
        decision: '继续对话',
        confidence: 0.5,
        alternatives: [],
      },
    ],
    action: 'reflect_consensus',
    visible: true,
  };
}

/**
 * Display thinking steps in the terminal with nice formatting.
 */
export function displayThinking(trace: ThinkingTrace): void {
  if (!trace.visible || trace.steps.length === 0) return;

  console.log('\n  ┌─ 💭 AI 思考过程 ─────────────────────');
  for (const step of trace.steps) {
    console.log(`  │  ${step.topic}:`);
    console.log(`  │    → ${step.thought}`);
    if (step.alternatives.length > 0) {
      console.log(`  │    备选: ${step.alternatives.join(' | ')}`);
    }
    console.log(`  │    决定: ${step.decision} (${Math.round(step.confidence * 100)}%)`);
  }
  console.log(`  │  下一步: ${trace.action}`);
  console.log('  └────────────────────────────────────────\n');
}
