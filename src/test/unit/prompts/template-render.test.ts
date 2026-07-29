// ============================================================
// template-render.test.ts — Unit tests for PromptRegistry
// ============================================================

import { describe, it, expect } from 'vitest';
import { PromptRegistry } from '@/prompts/registry';
import { PromptRenderError } from '@/prompts/types';
import type { PromptTemplate, PromptFragment } from '@/prompts/types';
import type { AgentId } from '@/agents/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal PromptTemplate for registration.
 * Callers override what they need.
 */
function makeTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: 'tpl',
    name: 'Test Template',
    version: '1.0.0',
    description: 'A test template',
    agentId: 'scribe' as AgentId,
    template: 'Hello {{name}}',
    variables: ['name'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PromptRegistry — template rendering', () => {
  // -----------------------------------------------------------------------
  // 1. Render with all variables filled
  // -----------------------------------------------------------------------

  it('renders templates with all required variables filled', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'full-render',
        template: 'Hello {{name}}, your purpose is {{purpose}}.',
        variables: ['name', 'purpose'],
        systemPrompt: 'You are a helpful assistant.',
      }),
    );

    const result = registry.render('full-render', {
      name: 'Alice',
      purpose: 'testing',
    });

    expect(result.prompt).toBe('Hello Alice, your purpose is testing.');
    expect(result.systemPrompt).toBe('You are a helpful assistant.');
    expect(result.templateId).toBe('full-render');
    expect(result.version).toBe('1.0.0');
    expect(result.variableValues).toEqual({
      name: 'Alice',
      purpose: 'testing',
    });
    expect(result.warnings).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 2. Throws PromptRenderError for missing required variables
  // -----------------------------------------------------------------------

  it('throws PromptRenderError for missing required variables', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'missing-req',
        template: '{{a}} and {{b}} and {{c}}',
        variables: ['a', 'b', 'c'],
      }),
    );

    // Only provide 'a' — 'b' and 'c' are missing.
    expect(() => registry.render('missing-req', { a: '1' })).toThrow(PromptRenderError);

    try {
      registry.render('missing-req', { a: '1' });
    } catch (error) {
      expect(error).toBeInstanceOf(PromptRenderError);
      if (error instanceof PromptRenderError) {
        expect(error.templateId).toBe('missing-req');
        expect(error.missingVariables).toContain('b');
        expect(error.missingVariables).toContain('c');
        expect(error.missingVariables).toHaveLength(2);
        expect(error.message).toContain('missing-req');
        expect(error.name).toBe('PromptRenderError');
      }
    }
  });

  // -----------------------------------------------------------------------
  // 3. Warnings for missing optional variables
  // -----------------------------------------------------------------------

  it('adds warnings for missing optional variables without throwing', () => {
    const registry = new PromptRegistry();

    // 'opt' appears in the template text but is NOT in the variables list,
    // so the engine treats it as optional.
    registry.register(
      makeTemplate({
        id: 'optional',
        template: 'Required: {{req}}. Optional: {{opt}}.',
        variables: ['req'],
      }),
    );

    const result = registry.render('optional', { req: 'present' });

    // Required variable is replaced; optional is resolved to empty string.
    expect(result.prompt).toBe('Required: present. Optional: .');
    // A warning should be emitted for the missing optional variable.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"opt"');
    expect(result.warnings[0]).toContain('optional');
  });

  // -----------------------------------------------------------------------
  // 4. Version selection — latest by default
  // -----------------------------------------------------------------------

  it('selects the latest semver when no version is specified', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'versioned',
        version: '1.0.0',
        template: 'V1: {{msg}}',
        variables: ['msg'],
      }),
    );
    registry.register(
      makeTemplate({
        id: 'versioned',
        version: '1.1.0',
        template: 'V1.1: {{msg}}',
        variables: ['msg'],
      }),
    );
    registry.register(
      makeTemplate({
        id: 'versioned',
        version: '2.0.0',
        template: 'V2: {{msg}}',
        variables: ['msg'],
      }),
    );

    const latest = registry.render('versioned', { msg: 'hello' });
    expect(latest.prompt).toBe('V2: hello');
    expect(latest.version).toBe('2.0.0');
  });

  it('resolves a specific version when version is pinned', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({ id: 'pinned', version: '1.0.0', template: 'V1: {{x}}', variables: ['x'] }),
    );
    registry.register(
      makeTemplate({ id: 'pinned', version: '2.0.0', template: 'V2: {{x}}', variables: ['x'] }),
    );

    const v1 = registry.render('pinned', { x: 'y' }, '1.0.0');
    expect(v1.prompt).toBe('V1: y');

    const v2 = registry.render('pinned', { x: 'y' }, '2.0.0');
    expect(v2.prompt).toBe('V2: y');
  });

  it('returns undefined when unknown template ID is requested', () => {
    const registry = new PromptRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 5. Token estimation — characters / 4
  // -----------------------------------------------------------------------

  it('estimates tokens using the characters / 4 heuristic', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'token',
        template: '12345678',
        variables: [],
      }),
    );

    const result = registry.render('token', {});
    // 8 characters / 4 = 2
    expect(result.tokenEstimate).toBe(2);

    // Direct estimateTokens helper
    const estimate = registry.estimateTokens('token', {});
    expect(estimate).toBe(2);
  });

  it('returns token estimate of 0 for unknown template', () => {
    const registry = new PromptRegistry();
    expect(registry.estimateTokens('ghost', {})).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 6. compose() combines fragments correctly
  // -----------------------------------------------------------------------

  it('compose concatenates fragment templates and unions variables', () => {
    const registry = new PromptRegistry();

    const greeting: PromptFragment = {
      id: 'greeting',
      version: '1.0.0',
      template: 'Hello {{name}}',
      variables: ['name'],
      description: 'Greeting fragment',
    };
    const body: PromptFragment = {
      id: 'body',
      version: '1.0.0',
      template: 'Your task: {{task}}',
      variables: ['task'],
      description: 'Body fragment',
    };

    registry.registerFragment(greeting);
    registry.registerFragment(body);

    const composed = registry.compose(
      'composed',
      'Composed',
      'A composed template',
      'scribe' as AgentId,
      ['greeting', 'body'],
    );

    // Templates concatenated with "\n\n"
    expect(composed.template).toBe('Hello {{name}}\n\nYour task: {{task}}');
    // Variables unioned (deduplicated)
    expect(composed.variables).toEqual(expect.arrayContaining(['name', 'task']));
    expect(composed.variables).toHaveLength(2);
    expect(composed.id).toBe('composed');
    expect(composed.agentId).toBe('scribe');
    expect(composed.version).toBe('1.0.0');
  });

  it('compose registers the composed template so it is renderable', () => {
    const registry = new PromptRegistry();

    registry.registerFragment({
      id: 'part',
      version: '1.0.0',
      template: 'Part: {{val}}',
      variables: ['val'],
      description: 'A fragment',
    });

    registry.compose('renderable', 'Renderable', 'desc', 'review' as AgentId, ['part']);

    const result = registry.render('renderable', { val: '42' });
    // "\n" literals become actual newlines during rendering
    expect(result.prompt).toBe('Part: 42');
  });

  it('compose throws when a fragment ID does not exist', () => {
    const registry = new PromptRegistry();

    expect(() => registry.compose('bad', 'Bad', 'desc', 'scribe' as AgentId, ['ghost'])).toThrow(
      PromptRenderError,
    );
  });

  // -----------------------------------------------------------------------
  // 7. list() and listByAgent()
  // -----------------------------------------------------------------------

  it('list returns unique template IDs', () => {
    const registry = new PromptRegistry();

    registry.register(makeTemplate({ id: 'alpha', agentId: 'scribe' as AgentId }));
    registry.register(makeTemplate({ id: 'beta', agentId: 'architect' as AgentId }));
    // Same ID, different version — still one entry in list()
    registry.register(
      makeTemplate({ id: 'alpha', version: '2.0.0', agentId: 'scribe' as AgentId }),
    );

    const ids = registry.list();
    expect(ids).toHaveLength(2);
    expect(ids).toContain('alpha');
    expect(ids).toContain('beta');
  });

  it('listByAgent filters templates by agent', () => {
    const registry = new PromptRegistry();

    registry.register(makeTemplate({ id: 's1', agentId: 'scribe' as AgentId }));
    registry.register(makeTemplate({ id: 's2', version: '2.0.0', agentId: 'scribe' as AgentId }));
    registry.register(makeTemplate({ id: 'a1', agentId: 'architect' as AgentId }));

    const scribeTemplates = registry.listByAgent('scribe' as AgentId);
    expect(scribeTemplates).toHaveLength(2);
    expect(scribeTemplates.map((t) => t.id)).toEqual(expect.arrayContaining(['s1', 's2']));

    const archTemplates = registry.listByAgent('architect' as AgentId);
    expect(archTemplates).toHaveLength(1);
    expect(archTemplates[0].id).toBe('a1');

    const empty = registry.listByAgent('review' as AgentId);
    expect(empty).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 8. validate()
  // -----------------------------------------------------------------------

  it('validate returns valid when all required variables are present', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'check',
        template: '{{a}} {{b}}',
        variables: ['a', 'b'],
      }),
    );

    const result = registry.validate('check', { a: 1, b: 2 });
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('validate returns invalid with missing paths', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'check',
        template: '{{a}} {{b}}',
        variables: ['a', 'b'],
      }),
    );

    const result = registry.validate('check', { a: 1 });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('b');
  });

  it('validate returns invalid for unknown template', () => {
    const registry = new PromptRegistry();
    const result = registry.validate('ghost', {});
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 9. Edge cases
  // -----------------------------------------------------------------------

  it('handles template with no variables', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'static',
        template: 'This template has no placeholders.',
        variables: [],
      }),
    );

    const result = registry.render('static', {});
    expect(result.prompt).toBe('This template has no placeholders.');
    expect(result.warnings).toEqual([]);
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it('handles duplicate variable resolution', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'repeat',
        template: '{{x}} and again {{x}}',
        variables: ['x'],
      }),
    );

    const result = registry.render('repeat', { x: 'hello' });
    expect(result.prompt).toBe('hello and again hello');
  });

  it('handles null as a missing required variable', () => {
    const registry = new PromptRegistry();

    registry.register(
      makeTemplate({
        id: 'nullable',
        template: '{{val}}',
        variables: ['val'],
      }),
    );

    // null is treated the same as undefined — missing
    expect(() => registry.render('nullable', { val: null })).toThrow(PromptRenderError);
  });
});
