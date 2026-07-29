import type { PromptTemplate } from './types';

export const REVIEW_CHECKLIST_PROMPT: PromptTemplate = {
  id: 'review-checklist',
  name: 'Review Checklist',
  version: '1.0.0',
  description:
    'Perform a multi-dimensional quality review of the completed work against the original creative intent and all accumulated constraints.',
  agentId: 'review',
  systemPrompt: '你是一个作品质量审查专家。对已完成的作品进行多维度检查。',
  template: `请对以下已完成作品进行多维度质量审查。

## 作品全文
"""
{{full_content}}
"""

## 创作意图
{{intent_summary}}

## 知识要求
{{knowledge_summary}}

## 创作约束
{{constraint_summary}}

## 表达要求
{{expression_summary}}

## 结构计划
{{structure_summary}}

## 审查维度

请从以下五个维度逐一审查：

### 1. 意图满足度（Intent Satisfaction）
- 作品是否实现了创作意图中的核心目标？
- 核心信息是否被准确且完整地传达？

### 2. 知识覆盖度（Knowledge Coverage）
- 所有必要的知识点是否都已包含？
- 知识内容是否准确、无事实错误？

### 3. 约束合规度（Constraint Compliance）
- 语气、风格、格式等创作约束是否全部满足？
- 字数、篇幅等量化约束是否达标？

### 4. 表达一致性（Expression Consistency）
- 全文的语气和风格是否统一？
- 术语使用是否前后一致？
- 是否存在逻辑矛盾或表达断裂？

### 5. 结构完整度（Structure Completeness）
- 章节结构是否按照计划完整实现？
- 各章节之间的逻辑衔接是否流畅？
- 全文是否有清晰的开头、主体和结尾？

返回格式：
\`\`\`json
{
  "overall_score": 0.0,
  "dimensions": [
    {
      "name": "intent_satisfaction",
      "label": "意图满足度",
      "score": 0.0,
      "passed": true,
      "issues": [
        {
          "severity": "critical | major | minor",
          "description": "具体问题描述",
          "location": "问题在全文中的大致位置或章节",
          "suggestion": "改进建议"
        }
      ]
    },
    {
      "name": "knowledge_coverage",
      "label": "知识覆盖度",
      "score": 0.0,
      "passed": true,
      "issues": []
    },
    {
      "name": "constraint_compliance",
      "label": "约束合规度",
      "score": 0.0,
      "passed": true,
      "issues": []
    },
    {
      "name": "expression_consistency",
      "label": "表达一致性",
      "score": 0.0,
      "passed": true,
      "issues": []
    },
    {
      "name": "structure_completeness",
      "label": "结构完整度",
      "score": 0.0,
      "passed": true,
      "issues": []
    }
  ],
  "summary": "整体质量评价",
  "approval": "approved | conditional | rejected",
  "conditional_requirements": ["满足条件后可通过的要求列表（仅当 approval 为 conditional 时）"]
}
\`\`\`

只返回 JSON，不要包含其他说明文字。`,
  variables: [
    'full_content',
    'intent_summary',
    'knowledge_summary',
    'constraint_summary',
    'expression_summary',
    'structure_summary',
  ],
  maxTokens: 8192,
};
