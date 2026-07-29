import type { PromptTemplate } from './types';

export const ARCHITECT_STRUCTURE_PROMPT: PromptTemplate = {
  id: 'architect-structure',
  name: 'Architect Structure',
  version: '1.0.0',
  description:
    'Design a document outline with sections, each having a goal, function, and hardness constraint.',
  agentId: 'architect',
  systemPrompt: '你是一个文章结构设计师。根据创作意图和读者需求，设计文章的大纲结构。',
  template: `请根据以下信息设计文章大纲结构。

## 创作意图
{{intent_summary}}

## 受众分析
{{audience_summary}}

## 创作约束
{{constraint_summary}}

## 格式类型
{{format_type}}

## 语气要求
{{tone_description}}

## 读者背景
{{audience_context}}

## 结构设计要求

1. 每个章节必须包含以下属性：
   - **goal**：该章节的写作目标，必须与核心信息（core_message）对齐。
   - **function**：该章节在整体结构中的作用（开场、论证、转折、总结等）。
   - **hardness**：结构灵活性（"hard" 表示不可省略/不可调序，"soft" 表示可调整）。

2. 整体结构必须完整覆盖 intent_summary 中的 core_message。

3. 章节之间应有自然的逻辑递进关系。

返回格式：
\`\`\`json
{
  "structure": [
    {
      "id": "section-1",
      "title": "章节标题",
      "goal": "该章节的写作目标",
      "function": "开场 | 论证 | 转折 | 过渡 | 总结 | ...",
      "hardness": "hard | soft",
      "estimated_length": "字数估算",
      "key_points": ["要点1", "要点2"]
    }
  ],
  "overall_flow": "整体逻辑递进说明"
}
\`\`\`

只返回 JSON，不要包含其他说明文字。`,
  variables: [
    'intent_summary',
    'audience_summary',
    'constraint_summary',
    'format_type',
    'tone_description',
    'audience_context',
  ],
  maxTokens: 8192,
};

export const ARCHITECT_ALIGNMENT_PROMPT: PromptTemplate = {
  id: 'architect-alignment',
  name: 'Architect Alignment',
  version: '1.0.0',
  description:
    "Verify that the generated structure fully covers the creative intent by checking each node's goal against the core message.",
  agentId: 'architect',
  systemPrompt: '你是一个结构审核专家。检查生成的大纲是否完整覆盖了创作意图。',
  template: `请审核以下文章大纲是否完整覆盖了创作意图。

## 大纲结构
{{structure_summary}}

## 创作意图
{{intent_summary}}

## 审核要求

对每个章节节点逐一检查：
1. 该节点的 **goal** 是否直接服务于 core_message？
2. 是否存在意图覆盖的盲区（core_message 中有未被任何节点覆盖的部分）？
3. 是否存在冗余节点（对 core_message 无贡献的章节）？

返回格式：
\`\`\`json
{
  "overall_alignment": 0.0,
  "node_checks": [
    {
      "node_id": "section-id",
      "aligned": true,
      "reason": "说明"
    }
  ],
  "coverage_gaps": ["未被覆盖的意图点"],
  "redundant_nodes": ["冗余节点 ID 及其说明"],
  "recommendations": ["改进建议"]
}
\`\`\`

只返回 JSON，不要包含其他说明文字。`,
  variables: ['structure_summary', 'intent_summary'],
  maxTokens: 4096,
};
