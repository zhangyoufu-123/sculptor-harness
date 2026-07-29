import { PromptFragment } from '../types';

export const toneDescriptionFragment: PromptFragment = {
  id: 'shared/tone-description',
  version: '1.0.0',
  description: 'Converts tone field into natural language writing instructions',
  template: `## 语气要求
请以{{tone}}的语气进行写作。
- 使用{{voice_persona}}的写作人格。
- 目标读者是{{audience_type}}，知识水平为{{knowledge_level}}。`,
  variables: ['tone', 'voice_persona', 'audience_type', 'knowledge_level'],
};
