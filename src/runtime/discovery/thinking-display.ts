/**
 * Thinking Display — shows the AI's reasoning process in the terminal.
 *
 * Like DeepSeek's Chain of Thought, this makes the AI's decision-making
 * transparent to the user. Instead of silently deciding to excavate memories,
 * the user sees WHY the AI chose that path.
 */

import { LLMClient } from '@/lib/llm-client';
import { getGenreCorpus } from '@/runtime/rag/genre-store';

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

// Generate genre context dynamically from the corpus
function buildGenreContext(): string {
  const genres = getGenreCorpus();
  return genres
    .map(
      (g) =>
        `- ${g.name} (${g.category}): ${g.description.slice(0, 40)}... | 信号: ${g.keywords.slice(0, 3).join(', ')} | 区分: ${g.distinguishingFeatures[0]}`,
    )
    .join('\n');
}

const THINKING_PROMPT = `你是 Sculptor 创作助手的思考模块。分析当前对话状态，自主决定最优行动路径。

## 当前对话状态
{{state}}

## 可选行动路径

### 理解层
- reflect_consensus — 反射检测到的共识信号（用户的语言选择暗示了什么假设？验证它）
- explore_meaning — 探索核心意义（用户真正想表达什么？形成假设并验证）

### 素材层  
- excavate_memory — 挖掘个人记忆和感官细节
  适用: 故事/散文/回忆录/个人随笔 — 用户分享经历或感官印象时
  不适用: 论文/学术/技术文档/商业计划 — 这些不需要个人记忆

### 智识层
- discuss_intellectual — 讨论智识议题
  适用: 论文/哲学/学术/研究/商业分析/技术文档 — 用户讨论概念或论证时
  关键信号: "论文""研究""哲学""学术""分析""论证""观点""理论""商
  业""技术"

### 虚构层
- explore_fiction — 探索虚构创作
  适用: 小说/故事/剧本/诗歌 — 用户创造虚构世界时
  关键信号: "小说""故事""剧本""诗""人物""情节""世界观""架空""科幻
  ""奇幻"

### 教学层
- explore_teaching — 探索教学内容
  适用: 教程/课程/指南 — 用户要教别人东西时
  关键信号: "教程""教学""入门""指南""步骤""学会""掌握"

### 行动层
- generate_outline — 理解充分，可以生成大纲
- recover — 对话跑偏，需要回到正轨

## 文体参考（动态生成，仅作参考）
${buildGenreContext()}

## 必守规则
1. 以上文体分类仅供参考，不要机械匹配关键词
2. 优先根据用户的整体语义判断，而不是单个词
3. "议论文"≠"学术论文" — 议论文是观点文章
4. 不确定时优先 explore_meaning

输出JSON，思考步骤2-4个:

## JSON格式
{
  "steps": [
    {
      "topic": "类型识别",
      "thought": "用户提到...这暗示了...",
      "decision": "选择explore_fiction路径",
      "confidence": 0.9,
      "alternatives": ["explore_meaning"]
    }
  ],
  "action": "explore_fiction",
  "visible": true
}

必须包含steps数组(2-4个元素)和visible字段。`;

/**
 * Ask the LLM to think about what to do next.
 * Returns the thinking trace for display + the chosen action.
 */
export async function think(state: string, llmClient: LLMClient): Promise<ThinkingTrace> {
  try {
    const response = await llmClient.completeWithRetry({
      systemPrompt: THINKING_PROMPT.replace('{{state}}', state),
      prompt: `分析当前对话并自主决定下一步行动。请以JSON格式输出。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 800,
    });
    if (response.json) {
      const parsed = response.json as Partial<ThinkingTrace>;
      // Defensive: ensure required fields exist
      return {
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        action: parsed.action || 'reflect_consensus',
        visible: parsed.visible !== undefined ? parsed.visible : true,
      };
    }
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
  if (!trace.visible) return;

  console.log('\n  ┌─ 💭 AI 思考过程 ─────────────────────');
  if (trace.steps && trace.steps.length > 0) {
    for (const step of trace.steps) {
      console.log(`  │  ${step.topic}:`);
      console.log(`  │    → ${step.thought}`);
      if (step.alternatives.length > 0) {
        console.log(`  │    备选: ${step.alternatives.join(' | ')}`);
      }
      console.log(`  │    决定: ${step.decision} (${Math.round(step.confidence * 100)}%)`);
    }
  }
  console.log(`  │  最终行动: ${trace.action}`);
  console.log('  └────────────────────────────────────────\n');
}
