// ---------------------------------------------------------------------------
// Sculptor V1 — Prompt Registry Implementation
// ---------------------------------------------------------------------------

import type { AgentId } from '@/agents/types';
import { PromptRenderError } from './types';
import type {
  PromptTemplate,
  RenderedPrompt,
  IPromptRegistry,
  PromptVariable,
  PromptFragment,
} from './types';

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Compare two semver strings (e.g. "1.2.3").
 * Returns negative if a < b, positive if a > b, zero if equal.
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aNum = aParts[i] ?? 0;
    const bNum = bParts[i] ?? 0;
    if (aNum !== bNum) {
      return aNum - bNum;
    }
  }
  return 0;
}

// ===========================================================================
// PromptRegistry
// ===========================================================================

export class PromptRegistry implements IPromptRegistry {
  private templates: Map<string, PromptTemplate[]>;
  private fragments: Map<string, PromptFragment[]>;

  constructor() {
    this.templates = new Map();
    this.fragments = new Map();
  }

  // -------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------

  register(template: PromptTemplate): void {
    const versions = this.templates.get(template.id);
    if (versions) {
      const idx = versions.findIndex((t) => t.version === template.version);
      if (idx !== -1) {
        versions[idx] = template;
      } else {
        versions.push(template);
      }
      versions.sort((a, b) => compareVersions(a.version, b.version));
    } else {
      this.templates.set(template.id, [template]);
    }
  }

  registerFragment(fragment: PromptFragment): void {
    const versions = this.fragments.get(fragment.id);
    if (versions) {
      const idx = versions.findIndex((f) => f.version === fragment.version);
      if (idx !== -1) {
        versions[idx] = fragment;
      } else {
        versions.push(fragment);
      }
      versions.sort((a, b) => compareVersions(a.version, b.version));
    } else {
      this.fragments.set(fragment.id, [fragment]);
    }
  }

  // -------------------------------------------------------------------
  // Lookup
  // -------------------------------------------------------------------

  get(id: string, version?: string): PromptTemplate | undefined {
    const versions = this.templates.get(id);
    if (!versions || versions.length === 0) {
      return undefined;
    }
    if (version !== undefined) {
      return versions.find((t) => t.version === version);
    }
    // Latest = last in semver-sorted array
    return versions[versions.length - 1];
  }

  getFragment(id: string, version?: string): PromptFragment | undefined {
    const versions = this.fragments.get(id);
    if (!versions || versions.length === 0) {
      return undefined;
    }
    if (version !== undefined) {
      return versions.find((f) => f.version === version);
    }
    return versions[versions.length - 1];
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------

  render(id: string, variables: Record<string, unknown>, version?: string): RenderedPrompt {
    const template = this.get(id, version);
    if (!template) {
      throw new PromptRenderError(id, []);
    }
    return this.renderText(
      template.id,
      template.version,
      template.template,
      template.variables,
      template.systemPrompt,
      variables,
    );
  }

  /**
   * Render a fragment by ID.  Fragments have no system prompt so that
   * field is always `undefined` in the returned RenderedPrompt.
   */
  renderFragment(id: string, variables: Record<string, unknown>, version?: string): RenderedPrompt {
    const fragment = this.getFragment(id, version);
    if (!fragment) {
      throw new PromptRenderError(id, []);
    }
    return this.renderText(
      fragment.id,
      fragment.version,
      fragment.template,
      fragment.variables,
      undefined,
      variables,
    );
  }

  // -------------------------------------------------------------------
  // Listing
  // -------------------------------------------------------------------

  list(): string[] {
    return Array.from(this.templates.keys());
  }

  listByAgent(agentId: AgentId): PromptTemplate[] {
    const result: PromptTemplate[] = [];
    this.templates.forEach((versions) => {
      for (const template of versions) {
        if (template.agentId === agentId) {
          result.push(template);
        }
      }
    });
    return result;
  }

  // -------------------------------------------------------------------
  // Validation & token estimation
  // -------------------------------------------------------------------

  validate(
    templateId: string,
    variables: Record<string, unknown>,
  ): { valid: boolean; missing: string[] } {
    const template = this.get(templateId);
    if (!template) {
      return { valid: false, missing: [] };
    }

    const missing: string[] = [];
    for (const varPath of template.variables) {
      const value = variables[varPath];
      if (value === undefined || value === null) {
        missing.push(varPath);
      }
    }

    return { valid: missing.length === 0, missing };
  }

  estimateTokens(templateId: string, variables: Record<string, unknown>): number {
    try {
      const rendered = this.render(templateId, variables);
      return rendered.tokenEstimate;
    } catch {
      return 0;
    }
  }

  // -------------------------------------------------------------------
  // Composition
  // -------------------------------------------------------------------

  /**
   * Compose multiple {@link PromptFragment} instances into a single
   * {@link PromptTemplate}.  Fragment templates are concatenated with
   * `"\n\n"` and their variable lists are unioned (deduplicated).
   *
   * The composed template is automatically registered so it can be
   * rendered and listed like any other template.
   */
  compose(
    id: string,
    name: string,
    description: string,
    agentId: AgentId,
    fragmentIds: string[],
  ): PromptTemplate {
    const fragments = fragmentIds.map((fid) => {
      const f = this.getFragment(fid);
      if (!f) {
        throw new PromptRenderError(fid, []);
      }
      return f;
    });

    const combinedTemplate = fragments.map((f) => f.template).join('\n\n');

    // Union all variable paths (deduplicated, stable insertion order)
    const variableSet = new Set<string>();
    for (const fragment of fragments) {
      for (const v of fragment.variables) {
        variableSet.add(v);
      }
    }

    const template: PromptTemplate = {
      id,
      name,
      version: '1.0.0',
      description,
      agentId,
      template: combinedTemplate,
      variables: Array.from(variableSet),
    };

    this.register(template);
    return template;
  }

  // ===================================================================
  // Private helpers
  // ===================================================================

  /**
   * Core rendering engine used by both {@link render} and
   * {@link renderFragment}.
   *
   * 1. Discover every `{{placeholder}}` in the template text.
   * 2. Classify each as required (listed in `variableList`) or optional.
   * 3. Resolve values from the supplied variable map; collect warnings
   *    for missing optional variables and errors for missing required ones.
   * 4. Substitute resolved values back into the template.
   * 5. Replace literal `\n` sequences with actual newline characters.
   */
  private renderText(
    id: string,
    version: string,
    templateText: string,
    variableList: string[],
    systemPrompt: string | undefined,
    variables: Record<string, unknown>,
  ): RenderedPrompt {
    const warnings: string[] = [];
    const variableValues: Record<string, unknown> = {};
    const missing: string[] = [];

    // ---- 1. Discover all unique placeholders ----
    const placeholderRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    const seenVars = new Set<string>();
    let execResult: RegExpExecArray | null;

    while ((execResult = placeholderRegex.exec(templateText)) !== null) {
      seenVars.add(execResult[1]);
    }

    // ---- 2–3. Resolve each variable ----
    const resolved = new Map<string, string>();

    seenVars.forEach((varName) => {
      const isRequired = variableList.includes(varName);
      const value = variables[varName];

      if (value === undefined || value === null) {
        if (isRequired) {
          missing.push(varName);
        } else {
          warnings.push(`Optional variable "${varName}" not provided for template "${id}"`);
        }
        resolved.set(varName, '');
        variableValues[varName] = '';
      } else {
        resolved.set(varName, String(value));
        variableValues[varName] = value;
      }
    });

    if (missing.length > 0) {
      throw new PromptRenderError(id, missing);
    }

    // ---- 4. Substitute placeholders ----
    let prompt = templateText;
    resolved.forEach((replacement, varName) => {
      // Escape regex-special characters in the variable name
      const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      prompt = prompt.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, 'g'), replacement);
    });

    // ---- 5. Replace literal \n with actual newlines ----
    prompt = prompt.replace(/\\n/g, '\n');

    // ---- 6. Build result ----
    const tokenEstimate = Math.ceil(prompt.length / 4);
    const renderedAt = new Date().toISOString();

    // Demonstrate PromptVariable type usage (imported per spec)
    const _typeCheck: PromptVariable = {
      path: '_internal',
      description: 'internal type guard',
      required: false,
    };
    void _typeCheck;

    return {
      templateId: id,
      version,
      prompt,
      systemPrompt,
      variableValues,
      tokenEstimate,
      renderedAt,
      warnings,
    };
  }
}

// ===========================================================================
// Singleton
// ===========================================================================

export const promptRegistry = new PromptRegistry();

// ── Register discovery prompts ──
import {
  EMPATHY_ACK_PROMPT,
  FRAMEWORK_BUILDER_PROMPT,
  CONTEXT_QUESTIONER_PROMPT,
  STYLE_DIRECTION_PROMPT,
} from './discovery';

promptRegistry.register(EMPATHY_ACK_PROMPT);
promptRegistry.register(FRAMEWORK_BUILDER_PROMPT);
promptRegistry.register(CONTEXT_QUESTIONER_PROMPT);
promptRegistry.register(STYLE_DIRECTION_PROMPT);
