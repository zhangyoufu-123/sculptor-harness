import type { PCSState, MissingItem } from '@/pcs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MissingInfoResult {
  newGaps: MissingItem[];
  resolvedGaps: string[]; // Topic names that were filled
  stillMissing: MissingItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple heuristic: detect whether `content` references a given topic by
 * checking for exact substring matches (case-insensitive).
 */
function contentCoversTopic(content: string, topic: string): boolean {
  if (topic.length === 0) return false;
  return content.toLowerCase().includes(topic.toLowerCase());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect knowledge gaps during writing (Phase 4).
 *
 * Triggered after AI generation or user edit of a node. For V1 this is a
 * rule-based detection that:
 *
 *   1. Identifies any `required_topics` associated with this `sectionId` that
 *      are not yet covered — these become `newGaps`.
 *   2. Checks which previously-missing topics are now covered by `content` —
 *      these become `resolvedGaps`.
 *   3. Returns any `MissingItem` entries still unresolved for this section
 *      as `stillMissing`.
 *
 * @param content   - The generated or edited text content for the node.
 * @param state     - The full PCS state.
 * @param sectionId - The structure section ID being evaluated.
 * @returns A result with newly discovered gaps, resolved topics, and
 *          persistent missing items.
 */
function detectMissingInfo(content: string, state: PCSState, sectionId: string): MissingInfoResult {
  const knowledge = state.knowledge;
  const currentMissing: MissingItem[] = knowledge.missing_information;
  const requiredTopics = knowledge.required_topics;

  const newGaps: MissingItem[] = [];
  const resolvedGaps: string[] = [];
  const gapTopicsSeen = new Set<string>();

  // ── Check required_topics for this section ──
  for (const rt of requiredTopics) {
    if (rt.section_id !== sectionId) continue;

    if (rt.covered) continue;

    if (contentCoversTopic(content, rt.topic)) {
      resolvedGaps.push(rt.topic);
      rt.covered = true; // mark as covered
    } else {
      // Not yet covered → new gap
      if (!gapTopicsSeen.has(rt.topic)) {
        gapTopicsSeen.add(rt.topic);
        newGaps.push({
          topic: rt.topic,
          reason: 'draft',
          priority: 'high',
          blocking: true,
          related_section: sectionId,
        });
      }
    }
  }

  // ── Still-missing items for this section ──
  const stillMissing = currentMissing.filter((m) => m.related_section === sectionId);

  return {
    newGaps,
    resolvedGaps,
    stillMissing,
  };
}

/**
 * Mark a topic as covered.
 *
 * Called when the user explicitly confirms that content covers a topic.
 * Matches by `topic` + `section_id` and sets `covered = true`.
 *
 * @param state     - The mutable PCS state.
 * @param topic     - The topic name to mark as covered.
 * @param sectionId - The structure section ID.
 */
function markTopicCovered(state: PCSState, topic: string, sectionId: string): void {
  const required = state.knowledge.required_topics;
  const topicEntry = required.find((t) => t.topic === topic && t.section_id === sectionId);
  if (topicEntry) {
    topicEntry.covered = true;
  }
}

export { detectMissingInfo, markTopicCovered };
export type { MissingInfoResult };
