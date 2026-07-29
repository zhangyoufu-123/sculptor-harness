import type { PCSState, StructureSection } from '@/pcs/types';

/** Virtual reader profile generated from Audience layer */
export interface ReaderProfile {
  name: string;
  background: string;
  knowledge: string;
  motivation: string;
  concerns: string;
}

/** A point on the reading path timeline */
export interface ReadingMoment {
  time_sec: number;
  section: string;
  reaction: string;
}

/** A friction point detected during simulated reading */
export interface FrictionPoint {
  position: string;
  type: 'terminology' | 'logic_gap' | 'pacing' | 'tone_mismatch' | 'missing_context';
  description: string;
}

/** Complete reader simulation result */
export interface ReaderSimulation {
  reader_profile: ReaderProfile;
  reading_path: ReadingMoment[];
  friction_points: FrictionPoint[];
  summary: string;
  suggestions: string[];
}

/** Aggregate results across all virtual readers */
export interface SimulationReport {
  project_id: string;
  readers: ReaderSimulation[];
  common_frictions: FrictionPoint[];
  unique_frictions: FrictionPoint[];
  generated_at: string;
}

/**
 * Generate virtual reader profiles from the Audience layer.
 * Creates 3-5 readers with different perspectives based on audience_type and knowledge_level.
 */
export function generateReaderProfiles(state: PCSState): ReaderProfile[] {
  const audienceType = state.audience.audience_type.value;
  const knowledgeLevel = state.audience.knowledge_level.value;
  const painPoints = state.audience.pain_points.value;

  const baseProfiles: ReaderProfile[] = [
    {
      name: '王总',
      background: '45岁，传统行业CEO，关注ROI',
      knowledge: knowledgeLevel,
      motivation: '寻找降本增效的方案',
      concerns: painPoints[0] || '技术是否成熟',
    },
    {
      name: '李教授',
      background: '38岁，高校副教授，关注学术严谨性',
      knowledge: 'expert',
      motivation: '评估论文引用价值',
      concerns: '数据来源是否可靠',
    },
    {
      name: '小张',
      background: '28岁，创业公司产品经理，时间紧迫',
      knowledge: 'intermediate',
      motivation: '快速获取可操作的建议',
      concerns: '5分钟内能否读完',
    },
    {
      name: '陈主任',
      background: '52岁，政府机构处长，关注政策合规',
      knowledge: knowledgeLevel,
      motivation: '为决策寻找依据',
      concerns: '是否符合政策方向',
    },
  ];

  return baseProfiles.slice(0, audienceType.includes('投资人') ? 4 : 3);
}

/**
 * V1: Rule-based reading simulation.
 * Scans content for common friction patterns without LLM.
 * V2: Upgrade to LLM-based deep reading simulation.
 */
export function simulateReading(
  sections: StructureSection[],
  reader: ReaderProfile,
): ReaderSimulation {
  const readingPath: ReadingMoment[] = [];
  const frictionPoints: FrictionPoint[] = [];

  let timeSec = 0;
  for (const section of sections) {
    if (!section.content_draft || section.content_draft.length === 0) continue;

    // Simulate reading time (~250 chars per 15 seconds)
    const readingTime = Math.max(10, Math.ceil(section.content_draft.length / 250) * 15);

    // V1: Simple friction detection
    const frictions = detectFrictions(section.content_draft, reader, section.title);
    frictionPoints.push(...frictions);

    const reaction =
      frictions.length > 0
        ? `阅读中遇到${frictions.length}处困惑`
        : `顺利理解${section.title}的内容`;

    readingPath.push({
      time_sec: timeSec,
      section: section.title,
      reaction,
    });

    timeSec += readingTime;
  }

  // Generate summary and suggestions
  const summary = generateSummary(readingPath, frictionPoints, reader);
  const suggestions = generateSuggestions(frictionPoints);

  return {
    reader_profile: reader,
    reading_path: readingPath,
    friction_points: frictionPoints,
    summary,
    suggestions,
  };
}

/**
 * V1 rule-based friction detection.
 */
function detectFrictions(
  content: string,
  reader: ReaderProfile,
  sectionTitle: string,
): FrictionPoint[] {
  const frictions: FrictionPoint[] = [];

  // Terminology check: detect technical terms without explanation
  const techTerms = ['Transformer', 'LLM', 'RNN', '注意力机制', 'embedding'];
  for (const term of techTerms) {
    if (
      content.includes(term) &&
      !content.includes(`${term}是`) &&
      !content.includes(`${term}是指`)
    ) {
      frictions.push({
        position: `${sectionTitle}`,
        type: 'terminology',
        description: `${term}未做解释，${reader.knowledge === 'beginner' ? '初学者' : '部分读者'}可能不理解`,
      });
      break; // One terminology issue per section is enough
    }
  }

  // Logic gap: long sentences without transition words
  const sentences = content.split(/[。！？]/);
  let longSentences = 0;
  for (const s of sentences) {
    if (s.length > 80) longSentences++;
  }
  if (longSentences > 3) {
    frictions.push({
      position: `${sectionTitle}`,
      type: 'pacing',
      description: '长句过多，阅读节奏偏慢',
    });
  }

  // Missing context: first section has no background
  if (sectionTitle.includes('引言') && content.length < 100) {
    frictions.push({
      position: `${sectionTitle}`,
      type: 'missing_context',
      description: '引言段信息量不足，未能建立阅读预期',
    });
  }

  return frictions;
}

/**
 * Generate a one-sentence summary of the reading experience.
 */
function generateSummary(
  _path: ReadingMoment[],
  frictions: FrictionPoint[],
  reader: ReaderProfile,
): string {
  if (frictions.length === 0) {
    return `阅读流畅，${reader.name}基本理解了文章内容。`;
  }
  if (frictions.length <= 2) {
    return `整体阅读体验尚可，但${reader.name}在${frictions.map((f) => f.position).join('和')}处稍有停顿。`;
  }
  return `${reader.name}在阅读中遇到${frictions.length}处障碍，主要集中在${frictions[0].position}附近。`;
}

/**
 * Generate specific improvement suggestions.
 */
function generateSuggestions(frictions: FrictionPoint[]): string[] {
  const suggestions: string[] = [];

  const hasTerminology = frictions.some((f) => f.type === 'terminology');
  const hasPacing = frictions.some((f) => f.type === 'pacing');
  const hasContext = frictions.some((f) => f.type === 'missing_context');

  if (hasTerminology) suggestions.push('为专业术语增加简短解释或类比');
  if (hasPacing) suggestions.push('将过长的句子拆分为2-3个短句，改善阅读节奏');
  if (hasContext) suggestions.push('在开头增加背景铺垫，帮助读者建立心理预期');
  if (suggestions.length === 0) suggestions.push('当前内容无明显阅读障碍');

  return suggestions;
}

/**
 * Aggregate multiple reader simulations into a unified report.
 */
export function aggregateSimulations(
  projectId: string,
  simulations: ReaderSimulation[],
): SimulationReport {
  const allFrictions = simulations.flatMap((s) => s.friction_points);

  // Group frictions by position + type to find common patterns
  const grouped = new Map<string, { friction: FrictionPoint; count: number }>();
  for (const f of allFrictions) {
    const key = `${f.position}|${f.type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(key, { friction: f, count: 1 });
    }
  }

  const entries = Array.from(grouped.values());
  const commonFrictions = entries.filter((e) => e.count >= 2).map((e) => e.friction);
  const uniqueFrictions = entries.filter((e) => e.count === 1).map((e) => e.friction);

  return {
    project_id: projectId,
    readers: simulations,
    common_frictions: commonFrictions,
    unique_frictions: uniqueFrictions,
    generated_at: new Date().toISOString(),
  };
}
