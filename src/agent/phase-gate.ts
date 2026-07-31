/**
 * PhaseGate — hard constraint: COLLECTING → ORGANIZING → DRAFTING
 *
 * In COLLECTING phase, the LLM can ONLY ask questions, NOT generate content.
 * This prevents the AI from inventing characters/plots instead of excavating user material.
 *
 * Pattern from: octomind-tap "Never Invent" contract + Luke Bechtel interview-first
 */

export type WritingPhase = 'COLLECTING' | 'ORGANIZING' | 'DRAFTING' | 'REVISING' | 'COMPLETE';

export interface PhaseGateState {
  phase: WritingPhase;
  /** Number of user-provided material items collected */
  materialCount: number;
  /** Minimum material required before leaving COLLECTING */
  minMaterialRequired: number;
  /** Has the user explicitly confirmed to move to next phase? */
  userConfirmed: boolean;
  /** Reason for current phase (shown to user) */
  statusMessage: string;
}

/**
 * Create a fresh PhaseGate in COLLECTING mode.
 */
export function createPhaseGate(minMaterial = 3): PhaseGateState {
  return {
    phase: 'COLLECTING',
    materialCount: 0,
    minMaterialRequired: minMaterial,
    userConfirmed: false,
    statusMessage: `正在收集素材... (需要至少${minMaterial}个具体细节)`,
  };
}

/**
 * Check if an action is allowed in the current phase.
 * Returns the reason if blocked, null if allowed.
 */
export function canAct(gate: PhaseGateState, action: string): string | null {
  if (gate.phase === 'COLLECTING') {
    // In COLLECTING, ONLY allow questions and recording — NO generation
    if (action === 'generate' || action === 'startGeneration') {
      return '还在收集素材阶段。请先分享更多具体细节。';
    }
    if (action === 'generate_outline') {
      return '素材不足，无法生成大纲。请继续分享你的想法。';
    }
  }

  if (gate.phase === 'ORGANIZING') {
    // In ORGANIZING, allow outline but NOT full content generation
    if (action === 'startGeneration' || action === 'generate_all') {
      return '大纲已生成。请确认大纲后再开始写作。';
    }
  }

  if (gate.phase === 'DRAFTING' || gate.phase === 'COMPLETE') {
    return null; // All actions allowed in drafting phase
  }

  // DRAFTING: everything allowed
  return null; // allowed
}

/**
 * Record a user-provided material item.
 */
export function recordMaterial(gate: PhaseGateState, _detail: string): void {
  gate.materialCount++;
  gate.statusMessage = `素材收集: ${gate.materialCount}/${gate.minMaterialRequired}`;

  // Auto-advance to ORGANIZING when enough material collected
  if (gate.materialCount >= gate.minMaterialRequired && gate.phase === 'COLLECTING') {
    gate.phase = 'ORGANIZING';
    gate.statusMessage = '素材充足！输入 /outline 生成大纲，或继续分享更多细节。';
  }
}

/**
 * Advance to next phase with user confirmation.
 */
export function advancePhase(gate: PhaseGateState): void {
  gate.userConfirmed = true;
  if (gate.phase === 'COLLECTING' && gate.materialCount >= gate.minMaterialRequired) {
    gate.phase = 'ORGANIZING';
    gate.statusMessage = '进入组织阶段。生成大纲中...';
  } else if (gate.phase === 'ORGANIZING') {
    gate.phase = 'DRAFTING';
    gate.statusMessage = '开始写作！输入 /gen 生成内容。';
  } else if (gate.phase === 'DRAFTING') {
    gate.phase = 'COMPLETE';
    gate.statusMessage = '全部完成！输入 /polish 打磨或 /done 结束。';
  }
}

/**
 * Force skip to DRAFTING (user override).
 */
export function skipToDrafting(gate: PhaseGateState): void {
  gate.phase = 'DRAFTING';
  gate.statusMessage = '已跳过素材收集，直接进入写作。';
}

/**
 * Get a user-friendly phase display.
 */
export function getPhaseDisplay(gate: PhaseGateState): string {
  const icons: Record<WritingPhase, string> = {
    COLLECTING: '🔍 素材收集',
    ORGANIZING: '📋 组织大纲',
    DRAFTING: '✍️ 写作中',
    REVISING: '🔧 修改中',
    COMPLETE: '✅ 完成',
  };
  return `${icons[gate.phase]} | ${gate.statusMessage}`;
}
