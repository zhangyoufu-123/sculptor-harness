import { PromptFragment } from '../types';

export const styleReferenceFragment: PromptFragment = {
  id: 'shared/style-reference',
  version: '1.0.0',
  description: 'Provides style reference information for emulation',
  template: `## 风格参考
写作风格应参考：{{style_reference}}
如果提供了格式参考，请遵循：{{format_reference}}
思维模式参考：{{thinking_reference}}`,
  variables: ['style_reference', 'format_reference', 'thinking_reference'],
};
