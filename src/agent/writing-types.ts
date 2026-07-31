// =========================================================================
// Writing Agent — Type Definitions
// =========================================================================

import type { BeliefState } from '@/runtime/belief-revision';
import type { CreativeMemory } from '@/runtime/creative-memory';

// =========================================================================
// State Machine
// =========================================================================

export type WritingState =
  | 'WRITING_IDLE'
  | 'GENERATING'
  | 'AWAITING_CLARIFICATION'
  | 'PRESENTING'
  | 'USER_EDITING'
  | 'REVISING'
  | 'SECTION_COMPLETE'
  | 'NEXT_SECTION'
  | 'ALL_COMPLETE'
  | 'READER_SIMULATION'
  | 'FINAL_POLISH'
  | 'DONE'
  | 'MID_STREAM_EDIT';

// =========================================================================
// Core State
// =========================================================================

export interface WritingAgentState {
  sessionId: string;
  state: WritingState;
  belief: BeliefState;
  outline: OutlineSection[];
  creativeMemory: CreativeMemory;
  currentSectionIndex: number;
  totalSections: number;
  sectionDrafts: Map<number, SectionDraft>;
  currentDraft: SectionDraft | null;
  feedbackHistory: FeedbackRecord[];
  revisionHistory: RevisionRecord[];
  readerSimulationReport: ReaderSimulationReport | null;
  generationMetrics: GenerationMetrics;
}

// =========================================================================
// Outline Section (writing phase version)
// =========================================================================

export interface OutlineSection {
  title: string;
  goal: string;
  content?: string;
  status?: 'pending' | 'drafting' | 'done';
}

// =========================================================================
// Section Draft
// =========================================================================

export interface SectionDraft {
  sectionIndex: number;
  title: string;
  goal: string;
  versions: SectionVersion[];
  activeVersionIndex: number;
  acceptedVersionIndex: number | null;
  uncertainties: WritingUncertainty[];
  clarificationState: 'none' | 'asked' | 'answered' | 'dismissed';
  transitions: { fromPrevious: string | null; toNext: string | null };
  generatedAt: string | null;
  acceptedAt: string | null;
}

export interface SectionVersion {
  id: string;
  content: string;
  notes: string;
  assumptions: Assumption[];
  uncertainties: WritingUncertainty[];
  confidenceScores: ConfidenceScores;
  createdAt: string;
  parentId: string | null;
  revisionTrigger: string | null;
}

// =========================================================================
// Uncertainty
// =========================================================================

export type UncertaintyCategory =
  | 'character_detail'
  | 'data_fact'
  | 'sensory_detail'
  | 'technical_accuracy'
  | 'generic_placeholder'
  | 'transition_quality'
  | 'emotional_target'
  | 'audience_fit';

export interface WritingUncertainty {
  id: string;
  category: UncertaintyCategory;
  context: string;
  assumption: string;
  question: string;
  importance: number;
  suggestedAnswer: string;
  askedAt: string | null;
  answeredAt: string | null;
  userAnswer: string | null;
  resolved: boolean;
}

// =========================================================================
// Confidence
// =========================================================================

export interface ConfidenceScores {
  overall: number;
  factualAccuracy: number;
  styleAdherence: number;
  goalCoherence: number;
  transitionQuality: number;
  creativeConstraint: number;
  audienceFit: number;
}

export interface Assumption {
  field: string;
  value: string;
  rationale: string;
}

// =========================================================================
// Assembled Context (per-section input to LLM)
// =========================================================================

export interface AssembledContext {
  sectionAnchor: { title: string; goal: string };
  transitions: { fromPrevious: string | null; toNext: string | null };
  creativeDNA: string;
  beliefSnapshot: string;
  feedback: string;
  previousSections: string;
  difficultyHint: string | null;
}

// =========================================================================
// Feedback & Revision
// =========================================================================

export interface FeedbackRecord {
  timestamp: string;
  sectionIndex: number;
  versionId: string;
  category: 'accept' | 'reject' | 'edit' | 'conversational' | 'outline_change';
  userInput: string;
  impact: string;
  appliedToVersionId: string | null;
}

export interface RevisionRecord {
  id: string;
  sectionIndex: number;
  mode: 'direct_edit' | 'conversational_revision';
  directive: string;
  beforeVersionId: string;
  afterVersionId: string;
  diff: string;
  timestamp: string;
}

// =========================================================================
// Reader Simulation
// =========================================================================

export interface ReaderSimulationReport {
  simulatedAt: string;
  readerProfile: string;
  overallImpression: string;
  frictionPoints: FrictionPoint[];
  missingContext: MissingContextItem[];
  suggestions: PolishSuggestion[];
}

export interface FrictionPoint {
  location: string;
  sectionIndex: number;
  issue: string;
  severity: 'info' | 'warning' | 'critical';
  suggestion: string;
}

export interface MissingContextItem {
  sectionIndex: number;
  what: string;
  why: string;
}

export interface PolishSuggestion {
  id: string;
  priority: number;
  sectionIndices: number[];
  action: string;
  rationale: string;
  autoApply: boolean;
}

// =========================================================================
// Metrics
// =========================================================================

export interface GenerationMetrics {
  totalSections: number;
  sectionsGenerated: number;
  totalRevisions: number;
  clarificationsAsked: number;
  clarificationsAnswered: number;
  directEdits: number;
  conversationalRevisions: number;
  outlineChanges: number;
  totalRegenerations: number;
  startTime: string;
  lastActivityTime: string;
}
