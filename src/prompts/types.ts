// ---------------------------------------------------------------------------
// Sculptor V1 — Prompt Engineering Type Definitions
//
// This file defines the complete type system for the prompt templating engine.
// Every prompt template uses {{variable}} placeholders resolved against a
// PCS-derived variable map at render time.  The registry provides versioned
// lookup, validation, rendering, and token estimation.
//
// Design constraints:
//   - Templates are versioned with semantic versions so prompt changes are
//     auditable and rollback-safe.
//   - Variables use dot notation matching PCS field paths (e.g.
//     'intent.purpose') so resolvers can map directly into PCS state.
//   - The registry interface supports agent-scoped queries so each agent
//     can discover its own template inventory.
//   - Token estimation is approximate (character-based heuristic) and
//     suitable for budget gating, not billing precision.
// ---------------------------------------------------------------------------

import type { AgentId } from '@/agents/types';

// ===========================================================================
// 1. Prompt Template
// ===========================================================================

/**
 * A single prompt template with `{{variable}}` placeholders.
 *
 * Templates are versioned so that prompt improvements can be rolled out
 * without breaking in-flight writing sessions.  The `variables` array lists
 * every required dot-notation path; resolvers use this to fetch values from
 * PCS or user-provided maps before rendering.
 *
 * @example
 * ```ts
 * const template: PromptTemplate = {
 *   id: "scribe-generate",
 *   name: "Scribe Generate",
 *   version: "1.0.0",
 *   description: "Generate a section of prose from the architectural plan.",
 *   agentId: "scribe",
 *   template: "Write a {{tone}} paragraph about {{intent.purpose}}.",
 *   variables: ["tone", "intent.purpose"],
 *   maxTokens: 4096,
 *   systemPrompt: "You are a professional writer.",
 * };
 * ```
 */
export interface PromptTemplate {
  /** Unique identifier for this template (e.g. 'scribe-generate'). */
  id: string;

  /** Human-readable label displayed in the UI and logs. */
  name: string;

  /**
   * Semantic version string (e.g. '1.0.0').  Used by the registry to
   * resolve version-pinned lookups and support rollback.
   */
  version: string;

  /** Short description of the template's purpose and intended usage. */
  description: string;

  /**
   * The agent that owns this template.  Templates are scoped to a single
   * agent; cross-agent prompt composition uses {@link PromptFragment}.
   */
  agentId: AgentId;

  /** Raw prompt text with `{{variable}}` placeholders. */
  template: string;

  /**
   * Ordered list of required variable paths in dot notation.
   *
   * The engine uses these to discover which PCS fields (or user-supplied
   * overrides) must be provided before rendering.  Every path MUST be
   * resolvable at render time; missing paths cause a
   * {@link PromptRenderError}.
   */
  variables: string[];

  /**
   * Optional maximum token budget for the rendered prompt.
   *
   * When set, the engine SHOULD warn if {@link RenderedPrompt.tokenEstimate}
   * exceeds this value.  Does NOT truncate — truncation is a caller
   * responsibility.
   */
  maxTokens?: number;

  /**
   * Optional system-level instruction prepended before the rendered
   * template.  Useful for setting model behaviour (role, tone, constraints)
   * independently of the user-facing prompt.
   */
  systemPrompt?: string;
}

// ===========================================================================
// 2. Prompt Variable Definition
// ===========================================================================

/**
 * Describes how a single variable inside a template is resolved.
 *
 * Variables are identified by dot-notation paths that mirror PCS field
 * structure (e.g. `'intent.purpose'`).  The resolver uses these definitions
 * to validate inputs, apply defaults, and format values before substitution.
 */
export interface PromptVariable {
  /**
   * Dot-notation path into the PCS (or variable map).
   *
   * @example `"intent.purpose"`, `"structure.sections.0.heading"`
   */
  path: string;

  /** Human-readable explanation of what this variable represents. */
  description: string;

  /** Whether the variable MUST be provided at render time. */
  required: boolean;

  /**
   * Fallback value used when the path is not present in the variable map.
   * Ignored when `required` is `true`.
   */
  defaultValue?: string;

  /**
   * Optional formatter name referenced from the formatter registry.
   * When specified, the resolved value is passed through the named
   * {@link PromptFormatter} before substitution.
   */
  formatter?: string;
}

// ===========================================================================
// 3. Rendered Output
// ===========================================================================

/**
 * Output produced after a {@link PromptTemplate} has been resolved against
 * a variable map.
 *
 * The rendered prompt is the final text sent to the LLM.  Callers should
 * inspect `warnings` for non-fatal issues (e.g. token budget exceeded)
 * before dispatching.
 */
export interface RenderedPrompt {
  /** ID of the template that was rendered. */
  templateId: string;

  /** Version of the template used for rendering. */
  version: string;

  /** Fully rendered prompt string with all placeholders replaced. */
  prompt: string;

  /**
   * Resolved system prompt, if the template defines one.
   * `undefined` when the template has no `systemPrompt`.
   */
  systemPrompt?: string;

  /**
   * Full map of variable paths to their resolved values.
   * Useful for debugging and audit trails.
   */
  variableValues: Record<string, unknown>;

  /**
   * Approximate token count of the rendered prompt.
   *
   * Uses a character-based heuristic (characters / 4) suitable for budget
   * gating.  Not suitable for billing-precision token counting.
   */
  tokenEstimate: number;

  /** ISO-8601 timestamp of when rendering completed. */
  renderedAt: string;

  /**
   * Non-fatal warnings encountered during rendering (e.g. missing optional
   * variables, token budget exceeded, deprecated template version).
   */
  warnings: string[];
}

// ===========================================================================
// 4. Prompt Registry Interface
// ===========================================================================

/**
 * Central registry for prompt templates.
 *
 * The registry supports versioned storage and retrieval so that prompt
 * improvements can ship without breaking in-flight sessions.  Templates are
 * indexed by `id` and optionally qualified by `version`; lookups without a
 * version return the latest registered version.
 *
 * Implementations MUST be thread-safe (or at least re-entrant) because
 * multiple agents may render prompts concurrently.
 */
export interface IPromptRegistry {
  /**
   * Register a template.  If a template with the same `id` and `version`
   * already exists, the implementation decides whether to replace or reject
   * (implementations should document their policy).
   */
  register(template: PromptTemplate): void;

  /**
   * Retrieve a template by ID.  When `version` is omitted the latest
   * registered version is returned.
   *
   * @returns The matching template, or `undefined` if not found.
   */
  get(id: string, version?: string): PromptTemplate | undefined;

  /**
   * Render a template by ID against the supplied variable map.
   *
   * Missing required variables cause a {@link PromptRenderError} to be
   * thrown.  Missing optional variables emit a warning but do not block
   * rendering.
   *
   * @param id        — Template identifier.
   * @param variables — Flat map of dot-notation paths to values.
   * @param version   — Optional version pin; latest if omitted.
   * @returns A fully rendered {@link RenderedPrompt}.
   * @throws {PromptRenderError} When required variables are missing.
   */
  render(id: string, variables: Record<string, unknown>, version?: string): RenderedPrompt;

  /**
   * List every registered template ID (deduplicated, unordered).
   */
  list(): string[];

  /**
   * Return every template registered for a given agent, ordered by
   * registration time (oldest first).
   */
  listByAgent(agentId: AgentId): PromptTemplate[];

  /**
   * Check whether a template can be rendered against the given variable map.
   *
   * @returns `{ valid: true, missing: [] }` when all required variables are
   *   present, otherwise `{ valid: false, missing: [...] }` with the list
   *   of missing paths.
   */
  validate(
    templateId: string,
    variables: Record<string, unknown>,
  ): { valid: boolean; missing: string[] };

  /**
   * Estimate the token count for a template rendered against the given
   * variable map.
   *
   * Uses the same character-based heuristic as
   * {@link RenderedPrompt.tokenEstimate}.  Returned value is an
   * approximation only.
   */
  estimateTokens(templateId: string, variables: Record<string, unknown>): number;
}

// ===========================================================================
// 5. Prompt Render Error
// ===========================================================================

/**
 * Thrown when {@link IPromptRegistry.render} encounters missing required
 * variables or an unknown template ID.
 *
 * Callers can inspect {@link missingVariables} to present precise feedback
 * to the user or to auto-retry after fetching the missing values.
 */
export class PromptRenderError extends Error {
  /** The template ID that failed to render. */
  templateId: string;

  /**
   * List of dot-notation paths that were required by the template but not
   * present in the supplied variable map.
   */
  missingVariables: string[];

  /**
   * @param templateId      — The template that could not be rendered.
   * @param missingVariables — Paths present in `template.variables` but
   *   absent from the supplied variable map.
   */
  constructor(templateId: string, missingVariables: string[]) {
    const message =
      `Prompt render failed for "${templateId}": ` +
      `missing required variables [${missingVariables.join(', ')}]`;
    super(message);
    this.name = 'PromptRenderError';
    this.templateId = templateId;
    this.missingVariables = missingVariables;

    // Restore prototype chain for instanceof checks when targeting ES5+.
    Object.setPrototypeOf(this, PromptRenderError.prototype);
  }
}

// ===========================================================================
// 6. Formatter Function Type
// ===========================================================================

/**
 * A function that transforms a resolved variable value into its final
 * string representation inside a rendered prompt.
 *
 * Formatters are registered by name and referenced from
 * {@link PromptVariable.formatter}.  Common examples include:
 *
 * - `"upper"`  — Uppercase the value.
 * - `"lower"`  — Lowercase the value.
 * - `"json"`   — JSON-serialise the value.
 * - `"bullet"` — Format an array as a bulleted list.
 *
 * @param value — The raw resolved value (string, number, object, etc.).
 * @returns The formatted string to substitute into the template.
 */
export type PromptFormatter = (value: unknown) => string;

// ===========================================================================
// 7. Prompt Fragment (Shared Composables)
// ===========================================================================

/**
 * A reusable, versioned snippet of prompt text that can be composed into
 * multiple {@link PromptTemplate} instances.
 *
 * Fragments reduce duplication across templates that share common
 * instructions (e.g. formatting rules, tone guidelines, output schemas).
 * They carry their own variable declarations so the renderer can resolve
 * fragment variables independently before splicing the rendered text into
 * the parent template.
 *
 * Fragment composition happens **before** final rendering: the parent
 * template's `{{#fragment}}` placeholder is replaced with the rendered
 * fragment text, and then the combined template is resolved against the
 * full variable map.
 */
export interface PromptFragment {
  /** Unique fragment identifier (e.g. 'tone-formal', 'schema-json'). */
  id: string;

  /** Semantic version of this fragment. */
  version: string;

  /** Raw fragment text with `{{variable}}` placeholders. */
  template: string;

  /** Dot-notation paths this fragment requires for resolution. */
  variables: string[];

  /** Human-readable description of what the fragment contributes. */
  description: string;
}
