/**
 * Conversation Memory — Sprint Fix P0
 *
 * Stores the full conversation history and extracts structured decisions.
 * The Decision Extractor scans messages for implicit decisions
 * (e.g., "not a hero, just a programmer" → protagonist_type = ordinary).
 */

// =========================================================================
// Types
// =========================================================================

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ExtractedDecision {
  id: string;
  /** What was decided */
  field: string;
  /** The extracted value */
  value: string;
  /** How confident we are (0-1) */
  confidence: number;
  /** Which messages support this decision */
  sourceMessageIds: string[];
  /** Whether the user has confirmed */
  confirmed: boolean;
  /** ISO timestamp */
  extractedAt: string;
}

// =========================================================================
// Decision Extraction Patterns (V1: keyword-based)
// =========================================================================

interface ExtractionPattern {
  field: string;
  patterns: RegExp[];
  extract: (match: RegExpMatchArray) => string;
}

const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  // Protagonist detection
  {
    field: 'protagonist',
    patterns: [
      /主角(?:是|为|不是)(.+?)(?:[，。！？]|$)/,
      /主人公(?:是|为|不是)(.+?)(?:[，。！？]|$)/,
      /他(?:是|不是)(?:一个|个)(.+?)(?:[，。！？]|$)/,
      /不是(.+?)，(?:而是|是)(.+?)(?:[，。！？]|$)/,
    ],
    extract: (m) => m[2] || m[1] || '',
  },
  // Conflict detection
  {
    field: 'core_conflict',
    patterns: [
      /冲突(?:是|在于|在)(.+?)(?:[，。！？]|$)/,
      /矛盾(?:是|在于)(.+?)(?:[，。！？]|$)/,
      /核心(?:是|在于)(.+?)(?:[，。！？]|$)/,
    ],
    extract: (m) => m[1] || '',
  },
  // AI nature
  {
    field: 'ai_nature',
    patterns: [
      /AI(?:是|像|作为)(.+?)(?:[，。！？]|$)/,
      /人工智能(?:是|像)(.+?)(?:[，。！？]|$)/,
      /失控|帮助|控制|觉醒|进化/,
    ],
    extract: (m) => m[1] || m[0] || '',
  },
  // Tone
  {
    field: 'tone',
    patterns: [/希望(?:是|写得|感觉)(.+?)(?:[，。！？]|$)/, /不要(?:太|过于)(.+?)(?:[，。！？]|$)/],
    extract: (m) => m[1] || '',
  },
];

// =========================================================================
// Conversation Memory Store
// =========================================================================

export class ConversationMemory {
  private messages: ConversationMessage[] = [];
  private decisions: ExtractedDecision[] = [];
  private counter = 0;

  /** Add a message and scan for decisions */
  addMessage(role: 'user' | 'assistant' | 'system', content: string): ConversationMessage {
    const msg: ConversationMessage = {
      id: `msg-${Date.now().toString(36)}-${this.counter++}`,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(msg);

    // Extract decisions from user messages
    if (role === 'user') {
      const extracted = this.extractDecisions(msg);
      this.decisions.push(...extracted);
    }

    return msg;
  }

  /** Scan a message for implicit decisions using keyword patterns */
  private extractDecisions(msg: ConversationMessage): ExtractedDecision[] {
    const results: ExtractedDecision[] = [];

    for (const pattern of EXTRACTION_PATTERNS) {
      for (const regex of pattern.patterns) {
        const match = msg.content.match(regex);
        if (match) {
          const value = pattern.extract(match).trim();
          if (value.length > 0 && value.length < 100) {
            results.push({
              id: `dec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              field: pattern.field,
              value,
              confidence: 0.6,
              sourceMessageIds: [msg.id],
              confirmed: false,
              extractedAt: new Date().toISOString(),
            });
            break; // One extraction per pattern per message
          }
        }
      }
    }

    return results;
  }

  /** Get all messages */
  getAllMessages(): ConversationMessage[] {
    return [...this.messages];
  }

  /** Get recent messages (last N) */
  getRecentMessages(count = 10): ConversationMessage[] {
    return this.messages.slice(-count);
  }

  /** Get all extracted decisions */
  getDecisions(): ExtractedDecision[] {
    return [...this.decisions];
  }

  /** Get unconfirmed decisions */
  getPendingDecisions(): ExtractedDecision[] {
    return this.decisions.filter((d) => !d.confirmed);
  }

  /** Confirm a decision */
  confirmDecision(decisionId: string): void {
    const d = this.decisions.find((dd) => dd.id === decisionId);
    if (d) d.confirmed = true;
  }

  /** Get conversation summary for context */
  getSummary(): string {
    const userMessages = this.messages.filter((m) => m.role === 'user');
    const decisions = this.getDecisions();

    let summary = `对话轮次: ${this.messages.length}`;
    summary += `\n用户发言: ${userMessages.length}`;
    summary += `\n提取决策: ${decisions.length} (${decisions.filter((d) => d.confirmed).length} 已确认)`;
    summary += `\n最新用户输入: "${userMessages[userMessages.length - 1]?.content.slice(0, 80) || '无'}"`;

    return summary;
  }

  /** Reset for new project */
  reset(): void {
    this.messages = [];
    this.decisions = [];
    this.counter = 0;
  }
}
