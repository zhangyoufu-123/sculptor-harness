/**
 * Incremental Outline — grows during conversation, not batch-generated.
 *
 * Claude-style: each interaction fills in a new section of the outline.
 * The user sees the outline taking shape in real-time.
 * Questions target the next gap in the outline.
 */

import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export interface OutlineSection {
  title: string;
  goal: string;
  status: 'confirmed' | 'proposed' | 'empty';
  /** When this section was added */
  addedAt: string;
}

export interface IncrementalOutline {
  /** Sections filled so far */
  sections: OutlineSection[];
  /** What's still needed */
  gaps: string[];
  /** Overall completion (0-1) */
  completion: number;
  /** The single best question for the next gap */
  nextQuestion: string;
}

const INCREMENTAL_PROMPT = `你是大纲构建专家。当前大纲正在逐步建立中。

## 当前完整状态
{{state}}

## 你的任务
分析当前对话和大纲进度，决定下一步：

1. 如果当前讨论中出现了可以确定的章节 → 添加到大纲（confirmed）
2. 如果用户暗示了某个方向但还没确认 → 添加为 proposed
3. 识别大纲中的缺口
4. 提出一个针对最高优先级缺口的问题

输出JSON:
{
  "sections": [
    {"title": "已有章节", "goal": "本章节目标", "status": "confirmed|proposed", "addedAt": "ISO时间"}
  ],
  "gaps": ["缺失的章节或需要补充的方向"],
  "completion": 0.0-1.0,
  "nextQuestion": "针对最大缺口的问题"
}

## 规则
- 不要一次性填满所有章节——每次只添加1-2个
- 用户确认过的信息才能标记为 confirmed
- 缺口要具体："缺少反方观点章节" 比 "缺少内容" 好
- 问题应该自然融入对话，不是问卷式的`;

/**
 * Build the next increment of the outline based on conversation progress.
 * Returns the updated outline + the best next question.
 */
export async function buildOutlineIncrement(
  conversationSummary: string,
  existingSections: OutlineSection[],
  beliefSummary: string,
): Promise<IncrementalOutline> {
  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: INCREMENTAL_PROMPT.replace(
        '{{state}}',
        [
          `已有章节: ${existingSections.length > 0 ? existingSections.map((s) => `- ${s.title} [${s.status}]`).join('\n') : '(空)'}`,
          `当前理解: ${beliefSummary}`,
          `对话进展: ${conversationSummary}`,
        ].join('\n'),
      ),
      prompt: `请根据当前对话进展，决定是否添加新章节到大纲，并指出下一个要讨论的缺口。请以JSON格式输出。`,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 800,
    });
    if (response.json) return response.json as IncrementalOutline;
  } catch {
    /* fallback */
  }

  return {
    sections: existingSections,
    gaps: ['需要更多讨论来确定结构'],
    completion: Math.min(existingSections.length / 5, 0.8),
    nextQuestion: '关于这个主题，你还有其他想讨论的吗？',
  };
}

/**
 * Format the incremental outline for terminal display.
 */
export function displayIncrementalOutline(outline: IncrementalOutline): string {
  if (outline.sections.length === 0) return '';

  const lines = ['\n  📐 大纲进度'];
  outline.sections.forEach((s, i) => {
    const icon = s.status === 'confirmed' ? '✅' : '💡';
    lines.push(`  ${icon} ${i + 1}. ${s.title} — ${s.goal}`);
  });

  if (outline.gaps.length > 0) {
    lines.push(`  ⬜ 待讨论: ${outline.gaps.slice(0, 2).join(' | ')}`);
  }

  lines.push(`  完成度: ${Math.round(outline.completion * 100)}%`);
  return lines.join('\n');
}
