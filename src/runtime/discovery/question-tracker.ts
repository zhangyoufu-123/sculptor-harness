/**
 * Question Tracker — prevents repetitive questions and enables context-aware follow-ups.
 *
 * All discovery engines (consensus, socratic, clarification, thinking)
 * share this tracker to avoid asking the same thing twice and to ensure
 * each new question builds on previous answers.
 */

export interface AskedQuestion {
  /** What was asked */
  question: string;
  /** What category/field it addresses */
  category: string;
  /** When it was asked */
  askedAt: string;
  /** The user's answer (if any) */
  answer?: string;
  /** Which engine asked this */
  askedBy: 'consensus' | 'socratic' | 'clarification' | 'thinking' | 'perspective' | 'intent';
}

export interface QuestionContext {
  /** All previously asked questions */
  history: AskedQuestion[];
  /** The user's latest input */
  latestInput: string;
  /** The user's accumulated answers (key insights) */
  accumulatedAnswers: string[];
  /** What categories have been covered */
  coveredCategories: Set<string>;
  /** What we know so far (summary) */
  knownSummary: string;
}

/**
 * Shared question tracker — global singleton used by all discovery engines.
 */
export class QuestionTracker {
  private questions: AskedQuestion[] = [];

  /** Record a question that was asked */
  record(params: Omit<AskedQuestion, 'askedAt'>): void {
    this.questions.push({
      ...params,
      askedAt: new Date().toISOString(),
    });
    // Keep only last 20
    if (this.questions.length > 20) this.questions.shift();
  }

  /** Record a user's answer to a previously asked question */
  recordAnswer(questionText: string, answer: string): void {
    const q = this.questions.find((q) => q.question.includes(questionText.slice(0, 30)));
    if (q) q.answer = answer;
  }

  /** Check if a similar question has already been asked */
  hasBeenAsked(questionCategory: string): boolean {
    return this.questions.some((q) => q.category === questionCategory);
  }

  /** Check if a question has been asked AND answered */
  isResolved(questionCategory: string): boolean {
    return this.questions.some((q) => q.category === questionCategory && q.answer);
  }

  /** Get all unresolved questions */
  getUnresolved(): AskedQuestion[] {
    return this.questions.filter((q) => !q.answer);
  }

  /** Get the accumulated conversation context for LLM prompts */
  getContext(): QuestionContext {
    const accumulated = this.questions
      .filter((q) => q.answer)
      .map((q) => `Q: ${q.question.slice(0, 40)} → A: ${q.answer!.slice(0, 60)}`);

    const covered = new Set(this.questions.map((q) => q.category));

    return {
      history: [...this.questions],
      latestInput: '',
      accumulatedAnswers: accumulated,
      coveredCategories: covered,
      knownSummary: accumulated.join(' | '),
    };
  }

  /** Build a "what we already know" summary for prompt injection */
  buildKnownSummary(): string {
    const answered = this.questions.filter((q) => q.answer);
    if (answered.length === 0) return '尚未收集到任何信息。';

    return answered.map((q) => `- ${q.category}: ${q.answer!.slice(0, 80)}`).join('\n');
  }

  /** Build a "what NOT to ask again" list */
  buildAvoidList(): string[] {
    return Array.from(new Set(this.questions.map((q) => q.category)));
  }

  /** Reset for new session */
  reset(): void {
    this.questions = [];
  }
}

/** Global singleton */
export const questionTracker = new QuestionTracker();
