import type { PromptTemplate } from './types';
import type { AgentId } from '@/agents/types';

/**
 * Prompt for LLM-based reader simulation (V2 upgrade path).
 * V1: rule-based simulation in reader-simulator.ts.
 * This prompt template is ready for when we upgrade to LLM simulation.
 */
export const READER_SIMULATE_PROMPT: PromptTemplate = {
  id: 'reader-simulate',
  name: '读者模拟',
  version: '1.0.0',
  description: '模拟不同读者阅读文章时的体验路径和摩擦点',
  agentId: 'scribe' as AgentId,
  systemPrompt: `你是以下读者的模拟器。请完全代入这个读者的视角阅读文章。

读者信息：
- 姓名：{{reader_name}}
- 背景：{{reader_background}}
- 知识水平：{{reader_knowledge}}
- 阅读动机：{{reader_motivation}}
- 核心关切：{{reader_concerns}}

请按以下格式输出你的阅读体验（JSON）：

{
  "reading_path": [
    {"time_sec": 0, "section": "标题", "reaction": "你的第一反应"},
    {"time_sec": 15, "section": "第1段", "reaction": "读完这段的反应"}
  ],
  "friction_points": [
    {"position": "第2段第3句", "type": "terminology|logic_gap|pacing|tone_mismatch|missing_context", "description": "具体问题描述"}
  ],
  "summary": "一句话总结你读完后的感受",
  "suggestions": ["具体的改进建议"]
}`,
  template: `请代入以下读者的视角，阅读并评价这篇文章。

{{reader_profile}}

## 文章内容
{{full_text}}

请详细描述你的阅读体验路径，指出所有让你困惑、失去兴趣、或觉得不妥的地方。`,
  variables: [
    'reader_name',
    'reader_background',
    'reader_knowledge',
    'reader_motivation',
    'reader_concerns',
    'reader_profile',
    'full_text',
  ],
};
