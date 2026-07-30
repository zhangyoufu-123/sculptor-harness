/**
 * Conversation Memory Layer — Sprint 2
 * Captures multi-turn discussions between user and AI.
 * Threads are scoped by topic so Context Runtime knows which history to read.
 */

// =========================================================================
// Thread Scope — what is this conversation about?
// =========================================================================

export type ConversationScope =
  | 'INTENT' // Discussing the project's creative intent
  | 'STRUCTURE' // Discussing the outline/structure
  | 'REVISION' // Discussing specific edits to content
  | 'KNOWLEDGE' // Discussing facts, sources, data
  | 'STYLE' // Discussing tone, voice, expression
  | 'PUBLISHING'; // Discussing export format, audience delivery

// =========================================================================
// Message — a single turn in the conversation
// =========================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Which entity this message relates to (node, intent field, etc.) */
  relatedEntity?: string;
  /** ISO timestamp */
  createdAt: string;
  /** If this message triggered a PCS change, the event IDs */
  triggeredEventIds?: string[];
}

// =========================================================================
// Conversation Thread — a scoped discussion
// =========================================================================

export interface ConversationThread {
  id: string;
  projectId: string;
  scope: ConversationScope;
  /** Which node this thread relates to (null for project-level threads) */
  relatedNodeId?: string;
  /** Messages in chronological order */
  messages: Message[];
  /** Whether this thread is still active */
  isActive: boolean;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// Decision Candidate — extracted from conversation
// =========================================================================

export type DecisionType =
  | 'intent_change'
  | 'audience_change'
  | 'structure_change'
  | 'style_change'
  | 'knowledge_add'
  | 'constraint_change';

export interface DecisionCandidate {
  id: string;
  conversationId: string;
  /** What kind of PCS change this represents */
  type: DecisionType;
  /** Which PCS field path would be affected */
  fieldPath: string;
  /** The old value (before this conversation) */
  oldValue: string;
  /** The proposed new value */
  newValue: string;
  /** Confidence that this is what the user wants (0-1) */
  confidence: number;
  /** Whether the user has confirmed this decision */
  status: 'pending' | 'confirmed' | 'rejected';
  /** Which message IDs support this decision */
  sourceMessageIds: string[];
  /** ISO timestamp */
  extractedAt: string;
}

// =========================================================================
// Decision Extractor — heuristic extraction of decisions from chat
// =========================================================================

/**
 * Scan recent messages for implicit decisions.
 * V1: keyword-based heuristic. V2: LLM-based semantic extraction.
 */
export function extractDecisions(messages: Message[], _projectId: string): DecisionCandidate[] {
  const candidates: DecisionCandidate[] = [];
  const recentMessages = messages.slice(-10); // Only scan last 10 messages

  // Merge all user messages for keyword scanning
  const userText = recentMessages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');

  // Intent change detection
  if (detectIntentChange(userText)) {
    candidates.push(
      createCandidate({
        conversationId: recentMessages[0]?.conversationId || '',
        type: 'intent_change',
        fieldPath: 'intent.purpose',
        oldValue: '',
        newValue: extractNewValue(userText),
        confidence: 0.6,
        sourceMessageIds: recentMessages.filter((m) => m.role === 'user').map((m) => m.id),
      }),
    );
  }

  // Audience change detection
  if (detectAudienceChange(userText)) {
    candidates.push(
      createCandidate({
        conversationId: recentMessages[0]?.conversationId || '',
        type: 'audience_change',
        fieldPath: 'audience.audience_type',
        oldValue: '',
        newValue: extractAudience(userText),
        confidence: 0.7,
        sourceMessageIds: recentMessages.filter((m) => m.role === 'user').map((m) => m.id),
      }),
    );
  }

  // Style change detection
  if (detectStyleChange(userText)) {
    candidates.push(
      createCandidate({
        conversationId: recentMessages[0]?.conversationId || '',
        type: 'style_change',
        fieldPath: 'expression.tone',
        oldValue: '',
        newValue: extractTone(userText),
        confidence: 0.55,
        sourceMessageIds: recentMessages.filter((m) => m.role === 'user').map((m) => m.id),
      }),
    );
  }

  return candidates;
}

// =========================================================================
// Heuristic detectors (V1: keyword-based)
// =========================================================================

function detectIntentChange(text: string): boolean {
  const intentPhrases = [
    '不是写',
    '其实是',
    '换个方向',
    '我想写',
    '改成',
    '重点是',
    '不是教育',
    '不写',
    '改变主题',
    '重新定义',
    '换个角度',
  ];
  return intentPhrases.some((p) => text.includes(p));
}

function detectAudienceChange(text: string): boolean {
  const audiencePhrases = [
    '写给',
    '读者是',
    '不是给',
    '受众',
    '面向',
    '不是企业',
    '普通读者',
    '专家',
    '学生',
    '投资人',
    '校长',
  ];
  return audiencePhrases.some((p) => text.includes(p));
}

function detectStyleChange(text: string): boolean {
  const stylePhrases = [
    '不要太',
    '语气',
    '风格',
    '通俗',
    '专业',
    '正式一点',
    '轻松',
    '不要商业',
    '人文',
    '不要太商业',
  ];
  return stylePhrases.some((p) => text.includes(p));
}

function extractNewValue(text: string): string {
  const match = text.match(/(?:想写|其实是|改成|重点是)(.+?)(?:[，。！？]|$)/);
  return match?.[1]?.trim() || '';
}

function extractAudience(text: string): string {
  const match = text.match(/(?:写给|读者是|受众|面向)(.+?)(?:[，。！？]|$)/);
  return match?.[1]?.trim() || '';
}

function extractTone(text: string): string {
  if (text.includes('通俗') || text.includes('轻松')) return '轻松科普型';
  if (text.includes('专业') || text.includes('正式')) return '专业分析型';
  if (text.includes('人文')) return '人文叙事型';
  return '';
}

function createCandidate(params: {
  conversationId: string;
  type: DecisionType;
  fieldPath: string;
  oldValue: string;
  newValue: string;
  confidence: number;
  sourceMessageIds: string[];
}): DecisionCandidate {
  return {
    id: `dec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    conversationId: params.conversationId,
    type: params.type,
    fieldPath: params.fieldPath,
    oldValue: params.oldValue,
    newValue: params.newValue,
    confidence: params.confidence,
    status: 'pending',
    sourceMessageIds: params.sourceMessageIds,
    extractedAt: new Date().toISOString(),
  };
}
