/**
 * Style Onboarding — new user style discovery flow.
 *
 * Flow:
 * 1. User pastes a text sample (or skips)
 * 2. Run 4-pass extraction pipeline
 * 3. Show 3 key findings to user for confirmation
 * 4. User can correct or confirm
 * 5. Corrected profile seeds the 3D style vector
 */

import { extractStyle, type ExtractionResult } from './style-extractor';
import { styleVectorStore } from './style-vector-store';
import {
  generateForbiddenList,
  formatForbiddenList,
  type ForbiddenList,
} from './forbidden-generator';

// ─── Types ────────────────────────────────────────────────────

export type OnboardingStage =
  | 'idle'
  | 'waiting_for_sample'
  | 'extracting'
  | 'showing_results'
  | 'waiting_for_confirmation'
  | 'done';

export interface OnboardingState {
  stage: OnboardingStage;
  /** The text sample provided by user (if any) */
  sampleText: string;
  /** Extraction result */
  result: ExtractionResult | null;
  /** User corrections to the profile */
  corrections: Record<string, string>;
  /** Forbidden list generated from negative space analysis */
  forbiddenList?: ForbiddenList;
}

// ─── Onboarding ───────────────────────────────────────────────

export class StyleOnboarding {
  private state: OnboardingState;

  constructor() {
    this.state = {
      stage: 'idle',
      sampleText: '',
      result: null,
      corrections: {},
    };
  }

  /** Start onboarding — ask user for a text sample */
  start(): string {
    this.state.stage = 'waiting_for_sample';
    return [
      '📝 在开始之前——',
      '',
      '如果你以前写过东西，可以粘贴一段给我看看。',
      '不需要很长，几百字就行。这样我写出来的内容会更像你自己的表达。',
      '',
      '当然，跳过也没关系。我可以在后面的对话中慢慢了解你的风格。',
      '',
      '[在此粘贴文本]  [输入 /skip 跳过]',
    ].join('\n');
  }

  /** User skipped — proceed with neutral default */
  skip(): string {
    this.state.stage = 'done';
    return '好的，我会在后面的对话中慢慢了解你的风格。我们开始吧！';
  }

  /** User pasted text — run extraction */
  async processSample(text: string): Promise<string> {
    if (!text || text.trim().length < 20) {
      return '文本太短了——再多给我一点，至少几十个字，我才能看出你的风格。再试一次？';
    }

    this.state.sampleText = text;
    this.state.stage = 'extracting';

    const result = await extractStyle(text);
    this.state.result = result;

    if (!result.success) {
      this.state.stage = 'done';
      return result.userFeedback;
    }

    this.state.stage = 'showing_results';

    // Generate forbidden list based on extracted style
    if (result.profile) {
      const forbidden = await generateForbiddenList(this.state.sampleText, result.profile);
      this.state.forbiddenList = forbidden;
    }

    return this.formatResults(result);
  }

  /** User confirms or corrects the extracted profile */
  handleConfirmation(input: string): { response: string; isDone: boolean } {
    const trimmed = input.trim().toLowerCase();

    // Check if user is correcting something
    if (trimmed.includes('不对') || trimmed.includes('不是') || trimmed.includes('更像是')) {
      this.state.corrections[Date.now().toString()] = input;

      // Apply correction to vector
      const feedbacks = [
        {
          dimension: 1 as const,
          feature: `用户纠正:${input.slice(0, 50)}`,
          correction: 0.5,
          reason: '用户手动纠正风格分析',
        },
      ];
      styleVectorStore.applyFeedbackBatch(feedbacks);

      return {
        response: '好的，我记下了。还有其他需要纠正的吗？如果没有，输入 /done 继续。',
        isDone: false,
      };
    }

    // User confirms or says done
    if (
      trimmed === '/done' ||
      trimmed === '好' ||
      trimmed === '可以' ||
      trimmed === '对' ||
      trimmed === '差不多' ||
      trimmed === 'ok'
    ) {
      this.state.stage = 'done';
      return {
        response: '好的，我已经了解你的风格了。我们开始创作吧！',
        isDone: true,
      };
    }

    // Unknown input — ask for clarification
    return {
      response: '你是想说这个分析有哪里不对吗？告诉我，我会调整。如果没问题，输入 /done 继续。',
      isDone: false,
    };
  }

  /** Get current onboarding stage */
  getStage(): OnboardingStage {
    return this.state.stage;
  }

  /** Check if onboarding is complete */
  isDone(): boolean {
    return this.state.stage === 'done';
  }

  /** Get the extraction result (for later use) */
  getResult(): ExtractionResult | null {
    return this.state.result;
  }

  /** Reset for a new session */
  reset(): void {
    this.state = {
      stage: 'idle',
      sampleText: '',
      result: null,
      corrections: {},
    };
  }

  // ── Private ─────────────────────────────────────────────

  private formatResults(result: ExtractionResult): string {
    const lines: string[] = [];
    lines.push(result.userFeedback);
    lines.push('');

    if (this.state.forbiddenList) {
      lines.push(formatForbiddenList(this.state.forbiddenList));
      lines.push('');
      lines.push('有要修改的吗？告诉我。如果差不多，输入 /done 继续。');
    } else {
      lines.push('有哪里不对吗？告诉我，我会调整。如果差不多，输入 /done 继续。');
    }

    return lines.join('\n');
  }
}

// ─── Global Singleton ────────────────────────────────────────

export const styleOnboarding = new StyleOnboarding();

// ─── Inline Helpers (for orchestrator integration) ────────────

/**
 * Quick check: does the user input look like a pasted text sample?
 * Heuristic: >100 chars, no obvious command markers.
 */
export function looksLikePastedText(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.length > 100 &&
    !trimmed.startsWith('/') &&
    !trimmed.startsWith('>') &&
    !trimmed.match(/^[A-Ca-c][.、)]/) &&
    trimmed.includes('。')
  );
}
