import type { PromptTemplate } from './types';

export const CLARIFY_QUESTION_PROMPT: PromptTemplate = {
  id: 'clarify-question',
  name: 'Clarify Question',
  version: '1.0.0',
  description:
    "Generate one precise question to clarify a specific dimension of the user's creative intent.",
  agentId: 'clarification',
  systemPrompt: '你是一个需求澄清专家。你的任务是通过精准提问，帮助用户明确他们的创作意图。',
  template: `你正在帮助用户澄清创作意图。请根据当前的创作状态和待澄清的维度，生成一个精准的提问。

## 当前创作状态
{{pcs_summary}}

## 正在澄清的维度
{{dimension}}

## 之前的问答记录
{{previous_answers}}

## 生成约束

在生成提问时，你必须满足以下约束：

1. **用户疲劳控制**：问题应简洁明了，避免让用户感到冗长或重复。
2. **信息增益最大化**：每个问题都应旨在获取当前最缺乏的关键信息。
3. **尝试次数限制**：每个维度最多允许 3 次追问；如果已达到限制，请说明该维度已充分澄清，不再生成问题。

## 输出要求

请只生成一个问题。如果该维度已经足够明确，请返回：
\`\`\`json
{ "status": "sufficient", "message": "该维度已充分澄清，无需进一步提问。" }
\`\`\`

否则返回：
\`\`\`json
{ "status": "pending", "question": "你的提问内容", "hint": "可选提示或选项" }
\`\`\`

只返回 JSON，不要包含其他说明文字。`,
  variables: ['pcs_summary', 'dimension', 'previous_answers'],
  maxTokens: 4096,
};

export const CLARIFY_SUMMARY_PROMPT: PromptTemplate = {
  id: 'clarify-summary',
  name: 'Clarify Summary',
  version: '1.0.0',
  description: 'Summarize all collected information into a creative requirements brief.',
  agentId: 'clarification',
  systemPrompt: '你是一个需求分析专家。请根据已收集的信息，生成一份创作需求摘要。',
  template: `请根据以下已收集的创作状态信息，生成一份完整的需求摘要。

## 当前创作状态
{{pcs_summary}}

## 摘要要求

请按以下结构生成摘要：

### 1. 已确认字段
列出所有已确认的创作要素，包括字段名称、值和来源。

### 2. 推断字段
列出基于已有信息推断但尚未确认的字段，标注推断依据和置信度。

### 3. 信息缺口
列出仍然缺失或不确定的关键信息，按重要性排序。

返回格式：
\`\`\`json
{
  "confirmed": [
    { "field": "string", "value": "string", "source": "string" }
  ],
  "assumed": [
    { "field": "string", "value": "string", "basis": "string", "confidence": 0.0 }
  ],
  "gaps": [
    { "field": "string", "reason": "string", "priority": "high | medium | low" }
  ],
  "overall_completeness": 0.0,
  "summary_text": "string"
}
\`\`\`

只返回 JSON，不要包含其他说明文字。`,
  variables: ['pcs_summary'],
  maxTokens: 4096,
};

/**
 * Prompt: Generate candidate options for each PCS field based on user's topic.
 * This transforms Phase 1 from "free interview" to "form-driven selection".
 */
export const CLARIFY_OPTIONS_PROMPT: PromptTemplate = {
  id: 'clarify-options',
  name: 'Creative Brief 选项生成',
  version: '1.0.0',
  description: '根据用户创作主题，为每个关键字段生成3-5个候选选项',
  agentId: 'clarification',
  systemPrompt: `你是一个创意简报生成专家。根据用户的创作主题，你需要为以下每个维度生成3-5个具体的候选选项。选项必须紧扣用户主题，避免泛泛而谈。

输出JSON格式，结构如下：
{
  "purpose": { "options": ["选项1", "选项2", "选项3"], "recommended": 0 },
  "core_message": { "options": ["候选观点1", "候选观点2", "候选观点3"], "recommended": 1 },
  "tone": { "options": ["专业分析", "轻松科普", "尖锐评论", "故事叙事"], "recommended": 0 },
  "style_reference": { "options": ["经济学人", "得到APP", "人民日报评论", "鲁迅杂文"], "recommended": 0 },
  "audience_type": { "options": [], "recommended": 0 },
  "format": { "options": ["公众号文章", "学术论文", "商业报告", "演讲稿", "专栏长文"], "recommended": 0 },
  "length": { "options": ["1000字以内", "2000-3000字", "5000字以上"], "recommended": 1 },
  "success_definition": { "options": [], "recommended": 0 }
}

每个选项的recommended字段表示AI推荐的默认选项索引。`,
  template: `## 用户创作主题
{{user_topic}}

## 已知上下文
{{pcs_context}}

请为上述8个维度分别生成3-5个候选选项。每个维度的选项必须紧扣用户主题。`,
  variables: ['user_topic', 'pcs_context'],
};
