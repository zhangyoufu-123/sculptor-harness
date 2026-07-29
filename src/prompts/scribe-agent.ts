import type { PromptTemplate } from './types';

export const SCRIBE_GENERATE_PROMPT: PromptTemplate = {
  id: 'scribe-generate',
  name: 'Scribe Generate',
  version: '1.0.0',
  description:
    'Generate prose content for a specific section following the architectural plan and creative constraints.',
  agentId: 'scribe',
  systemPrompt: '你是一个专业写作者。根据提供的大纲计划和创作约束，为指定章节生成内容。',
  template: `请根据以下完整创作上下文，为指定章节生成内容。

## 创作意图
- **写作目的**：{{intent_purpose}}
- **核心信息**：{{intent_core_message}}

## 读者信息
{{audience_context}}

## 语气要求
{{tone_description}}

## 必须避免
{{avoid_list}}

## 当前章节要求
- **章节目标**：{{node_goal}}
- **章节功能**：{{node_function}}
- **预估字数**：{{estimated_length}}

## 上下文衔接
### 前一章节
{{previous_context}}

### 后一章节
{{next_context}}

## 必须覆盖的主题
{{required_topics}}

## 风格参考
{{style_reference}}

## 格式参考
{{format_reference}}

## 写作要求

1. 严格围绕章节目标展开，不要偏离。
2. 遵循语气要求和读者背景，确保内容对目标受众合适。
3. 绝对不要使用"必须避免"列表中列出的任何表达方式或内容。
4. 确保内容与前后章节自然衔接。
5. 使用 {{style_reference}} 所指定的风格进行写作。
6. 确保覆盖所有必须主题。

请直接输出章节正文内容，不要包含章节标题或其他元信息。`,
  variables: [
    'intent_purpose',
    'intent_core_message',
    'audience_context',
    'tone_description',
    'avoid_list',
    'node_goal',
    'node_function',
    'estimated_length',
    'previous_context',
    'next_context',
    'required_topics',
    'style_reference',
    'format_reference',
  ],
  maxTokens: 16384,
};

export const SCRIBE_REVISE_PROMPT: PromptTemplate = {
  id: 'scribe-revise',
  name: 'Scribe Revise',
  version: '1.0.0',
  description:
    'Revise existing text based on a specific operation: condense, expand, retone, or rewrite.',
  agentId: 'scribe',
  systemPrompt: '你是一个专业编辑。根据用户的修改指令，对指定文本进行修改。',
  template: `请对以下文本执行修改操作。

## 操作类型
{{operation}}

操作说明：
- **condense**：压缩文本，保持核心意思，减少冗余。
- **expand**：扩展文本，增加细节和深度，但不改变原意。
- **retone**：调整语气，使其符合指定的语气要求。
- **rewrite**：完全重写，保留核心信息但改变表达方式。

## 原始文本
"""
{{original_text}}
"""

## 修改指令
{{instruction}}

## 语气要求
{{tone_description}}

## 必须避免
{{avoid_list}}

## 输出要求

请直接输出修改后的文本，不要包含任何解释或元信息。
如果是 rewrite 操作，确保核心信息不变。
如果是 retone 操作，确保符合指定的语气要求。
绝对不要使用"必须避免"列表中列出的任何表达方式或内容。`,
  variables: ['operation', 'original_text', 'instruction', 'tone_description', 'avoid_list'],
  maxTokens: 8192,
};

export const SCRIBE_CHECK_PROMPT: PromptTemplate = {
  id: 'scribe-check',
  name: 'Scribe Check',
  version: '1.0.0',
  description:
    'Review generated content for consistency with creative constraints including core message alignment, tone compliance, and avoid-list violations.',
  agentId: 'scribe',
  systemPrompt: '你是一个一致性审查专家。检查文本是否与创作约束一致。',
  template: `请审查以下文本是否与创作约束一致。

## 待审查文本
"""
{{content}}
"""

## 核心信息
{{intent_core_message}}

## 语气要求
{{tone_description}}

## 必须避免
{{avoid_list}}

## 必须覆盖的主题
{{required_topics}}

## 审查维度

1. **核心信息对齐**：文本是否准确传达了核心信息？
2. **语气合规**：文本语气是否符合要求？
3. **避免列表合规**：文本是否包含任何应避免的内容？
4. **主题覆盖**：所有必须主题是否都已覆盖？
5. **知识准确性**：是否存在事实错误或知识盲区？

返回格式：
\`\`\`json
{
  "overall_score": 0.0,
  "checks": {
    "core_message_alignment": {
      "passed": true,
      "score": 0.0,
      "issues": ["说明"]
    },
    "tone_compliance": {
      "passed": true,
      "score": 0.0,
      "issues": ["说明"]
    },
    "avoid_list_compliance": {
      "passed": true,
      "score": 0.0,
      "violations": ["具体违规内容"]
    },
    "topic_coverage": {
      "passed": true,
      "covered": ["已覆盖主题"],
      "missing": ["缺失主题"]
    },
    "knowledge_gaps": {
      "passed": true,
      "gaps": ["知识盲区或事实存疑的内容"]
    }
  },
  "recommendations": ["改进建议"]
}
\`\`\`

只返回 JSON，不要包含其他说明文字。`,
  variables: [
    'content',
    'intent_core_message',
    'tone_description',
    'avoid_list',
    'required_topics',
  ],
  maxTokens: 8192,
};
