import { PromptFragment } from '../types';

export const audienceContextFragment: PromptFragment = {
  id: 'shared/audience-context',
  version: '1.0.0',
  description: 'Provides audience context for the writer',
  template: `## 读者信息
- 读者类型：{{audience_type}}
- 知识水平：{{knowledge_level}}
- 作者与读者关系：{{relationship}}
- 读者痛点：{{pain_points}}
- 期望影响：{{desired_impact}}
- 目标情感：{{target_emotion}}`,
  variables: [
    'audience_type',
    'knowledge_level',
    'relationship',
    'pain_points',
    'desired_impact',
    'target_emotion',
  ],
};
