/**
 * Hierarchical Outline — supports multi-level nesting for long-form works.
 * Structure: Part → Chapter → Section → Subsection → Scene (5 levels)
 *
 * Replaces the flat OutlineSection[] with a recursive tree structure.
 * Users can manually edit any level.
 */

import { LLMClient } from '@/lib/llm-client';

const getLLM = () => new LLMClient();

export interface OutlineNode {
  id: string;
  title: string;
  goal: string;
  level: number; // 0=Part, 1=Chapter, 2=Section, 3=Subsection, 4=Scene
  order: number;
  content?: string;
  status: 'pending' | 'drafting' | 'done';
  children: OutlineNode[];
  parentId: string | null;
  collapsed?: boolean;
  createdAt: string;
}

export interface HierarchicalOutline {
  root: OutlineNode | null;
  /** Flat list for sequential writing (depth-first traversal) */
  flatList: OutlineNode[];
  /** Metadata */
  maxDepth: number;
  totalNodes: number;
  updatedAt: string;
}

/**
 * Create an empty hierarchical outline.
 */
export function createHierarchicalOutline(): HierarchicalOutline {
  return {
    root: null,
    flatList: [],
    maxDepth: 0,
    totalNodes: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a hierarchical outline using LLM.
 * Depth is determined by the creative type and desired length.
 */
export async function generateHierarchicalOutline(params: {
  artifactType: string;
  topic: string;
  purpose: string;
  audience: string;
  tone: string;
  summary: string;
  desiredLength?: number; // words
  maxDepth?: number; // 1-4, default determined by type+length
}): Promise<HierarchicalOutline> {
  const depth =
    params.maxDepth || determineDepth(params.artifactType, params.desiredLength || 5000);

  const prompt = `你是大纲结构设计师。为以下作品生成层级大纲。

作品信息:
- 类型: ${params.artifactType}
- 主题: ${params.topic}
- 目的: ${params.purpose}
- 读者: ${params.audience}
- 语气: ${params.tone}
- 理解: ${params.summary}
- 目标深度: ${depth} 级 (0=Part, 1=Chapter, 2=Section, 3=Subsection, 4=Scene)

请生成JSON格式的大纲:
{
  "root": {
    "title": "根节点",
    "children": [
      {
        "title": "Part 1: xxx",
        "goal": "本部分目标",
        "level": 0,
        "children": [
          {
            "title": "Chapter 1: xxx",
            "goal": "本章目标",
            "level": 1,
            "children": [...]
          }
        ]
      }
    ]
  }
}

规则:
- 长篇小说: Part(0)→Chapter(1)→Section(2) 三级
- 中篇: Chapter(1)→Section(2) 两级
- 短篇/文章: 扁平 Section(2) 一级
- 每层2-6个子节点
- 标题简洁(2-8字)，目标一句话
- 长篇小说可到3-4层`;

  try {
    const response = await getLLM().completeWithRetry({
      systemPrompt: '你是大纲结构设计师。生成层级大纲。',
      prompt,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 3000,
    });

    if (response.json) {
      const data = response.json as { root: OutlineNode };
      return buildFromRoot(data.root);
    }
  } catch {
    /* fallback */
  }

  return buildFlatOutline(params.topic);
}

function determineDepth(type: string, length: number): number {
  if (type.includes('小说') || type.includes('novel')) {
    if (length > 50000) return 3; // Part→Chapter→Section
    if (length > 10000) return 2; // Chapter→Section
    return 1; // Section only
  }
  if (type.includes('教程') || type.includes('课程')) return 2;
  return 1;
}

function buildFromRoot(root: OutlineNode): HierarchicalOutline {
  const flatList = flattenTree(root, 0);
  let maxDepth = 0;
  for (const node of flatList) {
    if (node.level > maxDepth) maxDepth = node.level;
  }
  return {
    root,
    flatList,
    maxDepth,
    totalNodes: flatList.length,
    updatedAt: new Date().toISOString(),
  };
}

function buildFlatOutline(topic: string): HierarchicalOutline {
  const root: OutlineNode = {
    id: 'root',
    title: topic,
    goal: '作品根节点',
    level: 0,
    order: 0,
    children: [
      {
        id: 'intro',
        title: '引言',
        goal: '建立读者认知',
        level: 1,
        order: 0,
        children: [],
        parentId: 'root',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'body',
        title: '主体',
        goal: '展开论述',
        level: 1,
        order: 1,
        children: [],
        parentId: 'root',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'conclusion',
        title: '结论',
        goal: '总结收尾',
        level: 1,
        order: 2,
        children: [],
        parentId: 'root',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ],
    parentId: null,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  return buildFromRoot(root);
}

/** Flatten tree into ordered list for sequential writing */
export function flattenTree(node: OutlineNode, depth: number): OutlineNode[] {
  const list: OutlineNode[] = [];
  // Only add leaf nodes or nodes with content to the writing list
  if (node.children.length === 0) {
    list.push({ ...node, level: node.level });
  }
  for (const child of node.children) {
    list.push(...flattenTree(child, depth + 1));
  }
  return list;
}

/** Add a child node at any level */
export function addChildNode(parent: OutlineNode, title: string, goal: string): OutlineNode {
  const child: OutlineNode = {
    id: `node-${Date.now().toString(36)}`,
    title,
    goal,
    level: parent.level + 1,
    order: parent.children.length,
    children: [],
    parentId: parent.id,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  parent.children.push(child);
  return child;
}

/** Remove a node and its children */
export function removeNode(parent: OutlineNode, nodeId: string): boolean {
  const idx = parent.children.findIndex((c) => c.id === nodeId);
  if (idx >= 0) {
    parent.children.splice(idx, 1);
    return true;
  }
  for (const child of parent.children) {
    if (removeNode(child, nodeId)) return true;
  }
  return false;
}

/** Find a node by ID */
export function findNode(root: OutlineNode, nodeId: string): OutlineNode | null {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

/** Display hierarchical outline as indented text */
export function displayHierarchicalOutline(root: OutlineNode, indent = 0): string {
  const prefix = '  '.repeat(indent);
  const icon = root.status === 'done' ? '✅' : root.status === 'drafting' ? '✍️' : '  ';
  let output = `${prefix}${icon} ${root.title}`;
  if (root.goal && root.level > 0) output += ` — ${root.goal}`;
  output += '\n';
  for (const child of root.children) {
    output += displayHierarchicalOutline(child, indent + 1);
  }
  return output;
}

/** Check whether a hierarchical outline is appropriate for the given artifact type */
export function shouldUseHierarchical(artifactType: string): boolean {
  // Long-form types always use hierarchy
  if (artifactType.includes('小说') || artifactType.includes('长篇')) return true;
  // Prose/散文, tutorials, academic papers benefit from sub-sections
  if (
    artifactType.includes('散文') ||
    artifactType.includes('教程') ||
    artifactType.includes('论文') ||
    artifactType.includes('学术') ||
    artifactType.includes('课程') ||
    artifactType.includes('指南')
  )
    return true;
  return false;
}
