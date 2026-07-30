/**
 * Artifact Builder — Sprint 0.6 Discovery Runtime
 *
 * BMAD-style: every discovery step produces a persistent artifact.
 * These artifacts accumulate and form the Creation Contract.
 */

import type { CreativeType } from '@/runtime/creative-type-router';
import { CREATIVE_TYPE_LABELS } from '@/runtime/creative-type-router';
import type {
  ProjectClassification,
  ProjectMaturity,
  DiscoveryDimension,
} from './project-classifier';

// =========================================================================
// Discovery Artifact — evolves through the discovery process
// =========================================================================

export interface DiscoveryArtifact {
  /** What stage of discovery this represents */
  stage: 'idea' | 'discovery' | 'contract';
  /** The user's original idea */
  rawIdea: string;
  /** Classification result */
  classification: {
    type: CreativeType;
    confidence: number;
    maturity: ProjectMaturity;
  };
  /** Accumulated discovered facts */
  discovered: Record<string, string>;
  /** What's still unknown */
  unknowns: DiscoveryDimension[];
  /** Conversation history summary */
  conversationSummary: string;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// Builder
// =========================================================================

export class ArtifactBuilder {
  private artifacts: DiscoveryArtifact[] = [];

  /** Create the initial idea artifact */
  createIdeaArtifact(idea: string, classification: ProjectClassification): DiscoveryArtifact {
    const typeLabel = CREATIVE_TYPE_LABELS[classification.creativeType];

    const artifact: DiscoveryArtifact = {
      stage: 'idea',
      rawIdea: idea,
      classification: {
        type: classification.creativeType,
        confidence: classification.confidence,
        maturity: classification.maturity,
      },
      discovered: {},
      unknowns: classification.unknowns,
      conversationSummary: `[${typeLabel.emoji} ${typeLabel.label}] ${classification.summary}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  /** Update artifact as discovery progresses */
  updateDiscovery(
    artifact: DiscoveryArtifact,
    newFacts: Record<string, string>,
    remainingUnknowns: DiscoveryDimension[],
  ): DiscoveryArtifact {
    artifact.stage = 'discovery';
    artifact.discovered = { ...artifact.discovered, ...newFacts };
    artifact.unknowns = remainingUnknowns;
    artifact.updatedAt = new Date().toISOString();

    // Update conversation summary
    const facts = Object.entries(artifact.discovered)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    artifact.conversationSummary = [
      `发现阶段 — 已明确 ${Object.keys(artifact.discovered).length} 项`,
      facts,
      remainingUnknowns.length > 0 ? `\n待探索: ${remainingUnknowns.join('、')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return artifact;
  }

  /** Finalize into a Creation Contract */
  finalizeContract(artifact: DiscoveryArtifact): DiscoveryArtifact {
    artifact.stage = 'contract';
    artifact.updatedAt = new Date().toISOString();

    const typeLabel = CREATIVE_TYPE_LABELS[artifact.classification.type];

    artifact.conversationSummary = [
      `创作契约 — ${typeLabel.emoji} ${typeLabel.label}`,
      `\n核心定义:`,
      ...Object.entries(artifact.discovered).map(([k, v]) => `  ${k}: ${v}`),
      `\n已确认进入下一阶段: Blueprint`,
    ].join('\n');

    return artifact;
  }

  /** Get the latest artifact */
  getLatest(): DiscoveryArtifact | undefined {
    return this.artifacts[this.artifacts.length - 1];
  }

  /** Export all artifacts as Markdown */
  exportMarkdown(): string {
    return this.artifacts
      .map((a) => {
        const header =
          a.stage === 'idea'
            ? '# 初始想法'
            : a.stage === 'discovery'
              ? '## 发现过程'
              : '## 创作契约';
        return `${header}\n\n${a.conversationSummary}\n`;
      })
      .join('\n---\n\n');
  }

  /** Reset */
  reset(): void {
    this.artifacts = [];
  }
}

/** Global singleton */
export const artifactBuilder = new ArtifactBuilder();
