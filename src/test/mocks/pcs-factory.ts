import type {
  PCSState,
  PCSPhase,
  PCSField,
  FieldStatus,
  FieldSource,
  IntentLayer,
  AudienceLayer,
  ConstraintLayer,
  KnowledgeLayer,
  StructureLayer,
  ExpressionLayer,
  StructureSection,
  RequiredTopic,
  MissingItem,
} from '@/pcs/types';

// ---------------------------------------------------------------------------
// Field builder
// ---------------------------------------------------------------------------

function field<T>(value: T, overrides?: Partial<PCSField<T>>): PCSField<T> {
  return {
    value,
    status: 'confirmed',
    source: 'user',
    confidence: 1,
    last_updated: new Date().toISOString(),
    proposal: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section builder
// ---------------------------------------------------------------------------

function section(id: string, overrides?: Partial<StructureSection>): StructureSection {
  return {
    id,
    title: id,
    goal: '',
    function: 'argument',
    hardness: 'soft',
    draft_state: 'empty',
    content_draft: '',
    pcs_status: 'confirmed',
    source: 'ai',
    confidence: 0.8,
    order: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RequiredTopic builder
// ---------------------------------------------------------------------------

function topic(name: string, overrides?: Partial<RequiredTopic>): RequiredTopic {
  return {
    topic: name,
    section_id: '',
    covered: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MissingItem builder
// ---------------------------------------------------------------------------

function missing(topicName: string, overrides?: Partial<MissingItem>): MissingItem {
  return {
    topic: topicName,
    reason: 'draft',
    priority: 'high',
    blocking: true,
    related_section: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PCSFactory
// ---------------------------------------------------------------------------

const DEFAULT_PROJECT_ID = 'test-project-001';

export class PCSFactory {
  /** Return an empty PCS with all fields at default (empty/assumed) values. */
  static createEmpty(): PCSState {
    const now = new Date().toISOString();
    return {
      id: 'pcs-empty',
      project_id: DEFAULT_PROJECT_ID,
      phase: 'initializing',
      created_at: now,
      updated_at: now,
      intent: {
        purpose: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        core_message: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        desired_impact: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        target_emotion: field('', { status: 'assumed', source: 'system', confidence: 0 }),
      },
      audience: {
        audience_type: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        knowledge_level: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        relationship: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        pain_points: field([], { status: 'assumed', source: 'system', confidence: 0 }),
      },
      constraint: {
        type: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        platform: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        format: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        length_min: field(0, { status: 'assumed', source: 'system', confidence: 0 }),
        length_max: field(0, { status: 'assumed', source: 'system', confidence: 0 }),
        deadline: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        custom_constraints: field([], { status: 'assumed', source: 'system', confidence: 0 }),
      },
      knowledge: {
        required_topics: [],
        known_topics: [],
        missing_information: [],
        sources: field([], { status: 'confirmed', source: 'user', confidence: 1 }),
      },
      structure: {
        sections: [],
      },
      expression: {
        tone: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        voice: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        avoid: field([], { status: 'assumed', source: 'system', confidence: 0 }),
        style_reference: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        format_reference: field('', { status: 'assumed', source: 'system', confidence: 0 }),
        thinking_reference: field('', { status: 'assumed', source: 'system', confidence: 0 }),
      },
    };
  }

  /** Return a fully confirmed PCS with realistic defaults. */
  static createConfirmed(): PCSState {
    const state = PCSFactory.createEmpty();
    state.id = 'pcs-confirmed';
    state.phase = 'structured';

    // Intent confirmed
    state.intent.purpose = field('说服读者采用可持续生活方式', { confidence: 1 });
    state.intent.core_message = field('可持续生活不仅有利于地球，也能提升个人幸福感', {
      confidence: 1,
    });
    state.intent.desired_impact = field('读者读完文章后愿意尝试至少一项可持续生活改变', {
      confidence: 1,
    });
    state.intent.target_emotion = field('希望与紧迫感并存', { confidence: 1 });

    // Audience confirmed
    state.audience.audience_type = field('普通大众', { confidence: 1 });
    state.audience.knowledge_level = field('初级', { confidence: 1 });
    state.audience.relationship = field('同伴', { confidence: 1 });
    state.audience.pain_points = field(['环保疲惫', '信息过载'], { confidence: 1 });

    // Constraint confirmed
    state.constraint.type = field('公众号文章', { confidence: 1 });
    state.constraint.platform = field('微信', { confidence: 1 });
    state.constraint.format = field('markdown', { confidence: 1 });
    state.constraint.length_min = field(1500, { confidence: 1 });
    state.constraint.length_max = field(3000, { confidence: 1 });
    state.constraint.deadline = field('2026-12-31', { confidence: 1 });
    state.constraint.custom_constraints = field(['不使用专业术语'], { confidence: 1 });

    // Knowledge layer
    state.knowledge.required_topics = [
      topic('气候变化的个人影响', { section_id: 's1' }),
      topic('可持续替代方案', { section_id: 's2' }),
      topic('心理健康关联', { section_id: 's3' }),
    ];
    state.knowledge.known_topics = ['气候变化基础'];
    state.knowledge.missing_information = [missing('最新碳排放数据', { related_section: 's1' })];

    // Structure confirmed
    state.structure.sections = [
      section('s1', {
        title: '引言',
        goal: '引入可持续生活话题，建立紧迫感',
        function: 'introduce',
        order: 0,
      }),
      section('s2', {
        title: '核心论点',
        goal: '论证可持续生活的个人益处',
        function: 'argument',
        order: 1,
      }),
      section('s3', { title: '总结', goal: '总结要点并呼吁行动', function: 'conclude', order: 2 }),
    ];

    // Expression confirmed
    state.expression.tone = field('分析型', { confidence: 1 });
    state.expression.voice = field('专家但平易近人', { confidence: 1 });
    state.expression.avoid = field(['AI生成', '过度承诺', '陈词滥调'], { confidence: 1 });
    state.expression.style_reference = field('经济学人', { confidence: 1 });
    state.expression.format_reference = field('公众号标准格式', { confidence: 1 });
    state.expression.thinking_reference = field('数据驱动分析', { confidence: 1 });

    return state;
  }

  /** Return a PCS with all fields assumed (partially filled but unconfirmed). */
  static createAssumed(): PCSState {
    const state = PCSFactory.createEmpty();
    state.id = 'pcs-assumed';
    state.phase = 'clarifying';

    state.intent.purpose = field('说服', { status: 'assumed', source: 'ai', confidence: 0.6 });
    state.intent.core_message = field('AI将改变教育', {
      status: 'assumed',
      source: 'ai',
      confidence: 0.5,
    });
    state.intent.desired_impact = field('', { status: 'assumed', source: 'system', confidence: 0 });
    state.intent.target_emotion = field('', { status: 'assumed', source: 'system', confidence: 0 });

    state.audience.audience_type = field('教育工作者', {
      status: 'assumed',
      source: 'ai',
      confidence: 0.7,
    });
    state.audience.knowledge_level = field('', {
      status: 'assumed',
      source: 'system',
      confidence: 0,
    });
    state.audience.relationship = field('', { status: 'assumed', source: 'system', confidence: 0 });
    state.audience.pain_points = field([], { status: 'assumed', source: 'system', confidence: 0 });

    return state;
  }

  /** Return a PCS with sections useful for node-level tests. */
  static createWithSections(sections: StructureSection[]): PCSState {
    const state = PCSFactory.createConfirmed();
    state.structure.sections = sections;
    state.knowledge.required_topics = [];
    state.knowledge.missing_information = [];
    return state;
  }

  // -----------------------------------------------------------------------
  // Layer overrides (returns a shallow-cloned state with the layer merged)
  // -----------------------------------------------------------------------

  static withExpression(state: PCSState, overrides: Partial<ExpressionLayer>): PCSState {
    return {
      ...state,
      expression: { ...state.expression, ...overrides },
    };
  }

  static withIntent(state: PCSState, overrides: Partial<IntentLayer>): PCSState {
    return {
      ...state,
      intent: { ...state.intent, ...overrides },
    };
  }

  static withConstraint(state: PCSState, overrides: Partial<ConstraintLayer>): PCSState {
    return {
      ...state,
      constraint: { ...state.constraint, ...overrides },
    };
  }

  static withKnowledge(state: PCSState, overrides: Partial<KnowledgeLayer>): PCSState {
    return {
      ...state,
      knowledge: { ...state.knowledge, ...overrides },
    };
  }

  static withAudience(state: PCSState, overrides: Partial<AudienceLayer>): PCSState {
    return {
      ...state,
      audience: { ...state.audience, ...overrides },
    };
  }

  static withStructure(state: PCSState, overrides: Partial<StructureLayer>): PCSState {
    return {
      ...state,
      structure: { ...state.structure, ...overrides },
    };
  }

  /** Create a single section node for quick tests. */
  static createSection(
    id: string,
    goal: string,
    func: StructureSection['function'] = 'argument',
    options?: {
      content_draft?: string;
      order?: number;
      draft_state?: StructureSection['draft_state'];
    },
  ): StructureSection {
    return section(id, {
      title: id,
      goal,
      function: func,
      order: options?.order ?? 0,
      content_draft: options?.content_draft ?? '',
      draft_state: options?.draft_state ?? 'empty',
    });
  }

  // -----------------------------------------------------------------------
  // Flexible builders for granular test scenarios
  // -----------------------------------------------------------------------

  /**
   * Create a PCSField with permissive overrides.
   *
   * Unlike `field()`, this accepts plain strings for enum-like properties
   * (status, source) so tests can write `{ status: 'assumed' }` without
   * explicit casts.
   */
  static makeField<T>(value: T, overrides?: Record<string, unknown>): PCSField<T> {
    return {
      value,
      status: (overrides?.status as FieldStatus) ?? 'confirmed',
      source: (overrides?.source as FieldSource) ?? 'user',
      confidence: (overrides?.confidence as number) ?? 1,
      last_updated: (overrides?.last_updated as string) ?? new Date().toISOString(),
      proposal:
        overrides?.proposal !== undefined ? (overrides.proposal as PCSField<T>['proposal']) : null,
    };
  }

  /**
   * Create a StructureSection with permissive overrides.
   *
   * Accepts plain strings for hardness, draft_state, pcs_status, etc.
   */
  static makeSection(overrides?: Record<string, unknown>): StructureSection {
    return {
      id: (overrides?.id as string) ?? `s-${Date.now()}`,
      title: (overrides?.title as string) ?? '',
      goal: (overrides?.goal as string) ?? '',
      function: (overrides?.function as StructureSection['function']) ?? 'argument',
      hardness: (overrides?.hardness as StructureSection['hardness']) ?? 'soft',
      draft_state: (overrides?.draft_state as StructureSection['draft_state']) ?? 'empty',
      content_draft: (overrides?.content_draft as string) ?? '',
      pcs_status: (overrides?.pcs_status as StructureSection['pcs_status']) ?? 'confirmed',
      source: (overrides?.source as StructureSection['source']) ?? 'user',
      confidence: (overrides?.confidence as number) ?? 1,
      order: (overrides?.order as number) ?? 0,
    };
  }

  /**
   * Create a confirmed PCSState in any phase, with optional overrides for
   * structure sections or individual layers.
   */
  static createState(overrides?: {
    phase?: PCSPhase;
    intent?: Partial<IntentLayer>;
    audience?: Partial<AudienceLayer>;
    constraint?: Partial<ConstraintLayer>;
    knowledge?: Partial<KnowledgeLayer>;
    structure?: Partial<StructureLayer>;
    expression?: Partial<ExpressionLayer>;
  }): PCSState {
    const state = PCSFactory.createConfirmed();
    if (overrides?.phase) {
      state.phase = overrides.phase;
    }
    if (overrides?.intent) {
      Object.assign(state.intent, overrides.intent);
    }
    if (overrides?.audience) {
      Object.assign(state.audience, overrides.audience);
    }
    if (overrides?.constraint) {
      Object.assign(state.constraint, overrides.constraint);
    }
    if (overrides?.knowledge) {
      Object.assign(state.knowledge, overrides.knowledge);
    }
    if (overrides?.structure) {
      Object.assign(state.structure, overrides.structure);
    }
    if (overrides?.expression) {
      Object.assign(state.expression, overrides.expression);
    }
    return state;
  }
}

// ===========================================================================
// Standalone exports — convenience aliases for direct imports
// ===========================================================================
//
// Tests can import these directly instead of going through PCSFactory.*.
// The class API remains the canonical source; these are thin wrappers
// for field/section builders, but createPCSState builds state directly.

/** Standalone alias for {@link PCSFactory.makeField}. */
export const makeField = PCSFactory.makeField;

/** Standalone alias for {@link PCSFactory.makeField} (preferred name). */
export const createMockField = PCSFactory.makeField;

/** Standalone alias for {@link PCSFactory.makeSection}. */
export const makeSection = PCSFactory.makeSection;

/** Standalone alias for {@link PCSFactory.makeSection} (preferred name). */
export const createSection = PCSFactory.makeSection;

// ---------------------------------------------------------------------------
// Per-layer override interfaces for createPCSState
// ---------------------------------------------------------------------------

export interface PCSStateOverrides {
  id?: string;
  project_id?: string;
  phase?: PCSPhase;
  created_at?: string;
  updated_at?: string;
  intent?: Partial<IntentLayer>;
  audience?: Partial<AudienceLayer>;
  constraint?: Partial<ConstraintLayer>;
  knowledge?: Partial<KnowledgeLayer>;
  structure?: Partial<StructureLayer>;
  expression?: Partial<ExpressionLayer>;
}

// ---------------------------------------------------------------------------
// createPCSState — standalone state builder
// ---------------------------------------------------------------------------

/**
 * Create a complete {@link PCSState} with deterministic English defaults.
 *
 * Call patterns (overloaded):
 *   createPCSState()                         → initializing, defaults
 *   createPCSState('clarifying')             → specific phase
 *   createPCSState({ phase: 'executing' })   → via overrides object
 *   createPCSState('executing', { ... })     → phase + overrides
 */
export function createPCSState(
  phaseOrOverrides?: PCSPhase | PCSStateOverrides,
  maybeOverrides?: PCSStateOverrides,
): PCSState {
  let phase: PCSPhase = 'initializing';
  let resolvedOverrides: PCSStateOverrides = {};

  if (typeof phaseOrOverrides === 'string') {
    phase = phaseOrOverrides as PCSPhase;
    if (maybeOverrides !== undefined) {
      resolvedOverrides = maybeOverrides;
    }
  } else if (phaseOrOverrides !== undefined) {
    if (typeof (phaseOrOverrides as PCSStateOverrides).phase === 'string') {
      phase = (phaseOrOverrides as PCSStateOverrides).phase as PCSPhase;
    }
    resolvedOverrides = phaseOrOverrides as PCSStateOverrides;
  }

  const ts = new Date().toISOString();

  return {
    id: resolvedOverrides.id ?? `pcs-standalone-${Date.now()}`,
    project_id: resolvedOverrides.project_id ?? 'test-project-001',
    phase,
    created_at: resolvedOverrides.created_at ?? ts,
    updated_at: resolvedOverrides.updated_at ?? ts,
    intent: {
      purpose: createMockField('inform'),
      core_message: createMockField('Test core message'),
      desired_impact: createMockField('Educate readers'),
      target_emotion: createMockField('curious'),
      ...resolvedOverrides.intent,
    } as IntentLayer,
    audience: {
      audience_type: createMockField('developers'),
      knowledge_level: createMockField('intermediate'),
      relationship: createMockField('peer'),
      pain_points: createMockField(['complexity']),
      ...resolvedOverrides.audience,
    } as AudienceLayer,
    constraint: {
      type: createMockField('blog post'),
      platform: createMockField('web'),
      format: createMockField('markdown'),
      length_min: createMockField(500),
      length_max: createMockField(2000),
      deadline: createMockField('2025-12-31'),
      custom_constraints: createMockField([] as string[]),
      ...resolvedOverrides.constraint,
    } as ConstraintLayer,
    knowledge: {
      required_topics: [],
      known_topics: [],
      missing_information: [],
      sources: createMockField([] as string[]),
      ...resolvedOverrides.knowledge,
    } as KnowledgeLayer,
    structure: {
      sections: [
        createSection({ order: 0 }),
        createSection({ order: 1 }),
        createSection({ order: 2 }),
      ],
      ...resolvedOverrides.structure,
    } as StructureLayer,
    expression: {
      tone: createMockField('analytical'),
      voice: createMockField('authoritative'),
      avoid: createMockField([] as string[]),
      style_reference: createMockField(''),
      format_reference: createMockField(''),
      thinking_reference: createMockField(''),
      ...resolvedOverrides.expression,
    } as ExpressionLayer,
  };
}
