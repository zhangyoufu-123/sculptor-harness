import { PromptFragment } from '../types';

export const avoidFormatterFragment: PromptFragment = {
  id: 'shared/avoid-formatter',
  version: '1.0.0',
  description: 'Formats the avoid list as explicit writing prohibitions',
  template: `## 必须避免
以下内容不得出现在写作中：
{{avoid_list}}`,
  variables: ['avoid_list'],
};
