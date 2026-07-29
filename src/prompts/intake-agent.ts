import type { PromptTemplate } from './types';

export const INTAKE_PARSE_PROMPT: PromptTemplate = {
  id: 'intake-parse',
  name: 'Intake Parse',
  version: '1.0.0',
  description: 'Extract structured creative intent information from a raw user idea.',
  agentId: 'intake',
  systemPrompt: '你是一个创意项目分析师，负责从用户的初始想法中提取结构化信息。',
  template: `请分析以下用户想法，提取结构化信息并以 JSON 格式返回。

用户想法：
"""
{{user_idea}}
"""

请提取以下字段，并为每个字段提供置信度（0.0 – 1.0）：

- **purpose**：创作目的（告知、说服、娱乐、启发等）
- **core_message**：核心想传达的信息或主题
- **audience_type**：目标受众类型
- **format**：内容格式（文章、社交媒体帖子、视频脚本等）
- **platform**：发布平台
- **tone**：预期语气

返回格式：
\`\`\`json
{
  "purpose": { "value": "string", "confidence": 0.0 },
  "core_message": { "value": "string", "confidence": 0.0 },
  "audience_type": { "value": "string", "confidence": 0.0 },
  "format": { "value": "string", "confidence": 0.0 },
  "platform": { "value": "string", "confidence": 0.0 },
  "tone": { "value": "string", "confidence": 0.0 }
}
\`\`\`

对于无法从用户想法中确定的字段，将 value 设为 null，confidence 设为 0。
只返回 JSON，不要包含其他说明文字。`,
  variables: ['user_idea'],
  maxTokens: 4096,
};
