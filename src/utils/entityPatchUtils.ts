/**
 * =============================================================================
 * ENTITY PATCH UTILITIES
 * =============================================================================
 *
 * Utilities for ordering co-writing nodes chronologically and filtering them
 * by hierarchy level. Used by the State Change Canvas to build its timeline.
 *
 * Previously this file also contained RFC 6902 JSON Patch application logic,
 * but that has been removed now that entity state changes are stored as
 * freeform text descriptions rather than structured patch operations.
 *
 * =============================================================================
 */

import type { StoryNode, StoryEdge } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A node's position in the co-write story hierarchy, used for the timeline.
 */
export type CowriteNodeLevel = 'story' | 'plot' | 'act' | 'scene' | 'shot';

/** Maps each co-write node level to the node type string(s) it includes. */
export const LEVEL_TO_NODE_TYPES: Record<CowriteNodeLevel, string[]> = {
  story: ['storyRoot'],
  plot: ['plot'],
  act: ['act'],
  scene: ['cowriteScene'],
  shot: ['shot'],
};

/** Ordered hierarchy levels from most-coarse to most-granular. */
export const COWRITE_LEVELS: CowriteNodeLevel[] = ['story', 'plot', 'act', 'scene', 'shot'];

/** Human-readable label for each level. */
export const LEVEL_LABELS: Record<CowriteNodeLevel, string> = {
  story: 'Story',
  plot: 'Plot',
  act: 'Act / Episode',
  scene: 'Scene',
  shot: 'Shot',
};

/**
 * A timeline step entry — one node at a given level with its display label.
 */
export interface TimelineStep {
  nodeId: string;
  label: string;
  level: CowriteNodeLevel;
  /** BFS depth from StoryRoot (used for ordering) */
  bfsDepth: number;
}

// =============================================================================
// CO-WRITE NODE ORDERING
// =============================================================================

/**
 * Returns all co-write structural nodes (storyRoot, plot, act, cowriteScene, shot)
 * in approximate chronological order using BFS from the StoryRoot.
 *
 * The BFS traversal follows directed edges (source → target), which in
 * the co-write canvas models the story hierarchy:
 *   StoryRoot → Plot → Act → CoWriteScene → Shot (vertical)
 *   CoWriteScene ──→ CoWriteScene (horizontal, right→left)
 *   Shot ──→ Shot (horizontal, right→left)
 *
 * Nodes unreachable from StoryRoot (orphaned nodes) are appended at the end.
 *
 * @returns TimelineStep[] sorted chronologically, one entry per co-write node.
 */
export function getCowriteNodesInOrder(
  nodes: StoryNode[],
  edges: StoryEdge[]
): TimelineStep[] {
  // Find StoryRoot
  const storyRoot = nodes.find(n => n.type === 'storyRoot');
  const startId = storyRoot?.id;

  // Build adjacency list (following edge direction)
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  // Eligible node types for the timeline
  const eligibleTypes = new Set(['storyRoot', 'plot', 'act', 'cowriteScene', 'shot']);

  // BFS
  const visited = new Set<string>();
  const bfsOrder: { nodeId: string; depth: number }[] = [];
  const queue: { id: string; depth: number }[] = startId ? [{ id: startId, depth: 0 }] : [];

  if (startId) visited.add(startId);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const node = nodes.find(n => n.id === id);
    if (node && eligibleTypes.has(node.type)) {
      bfsOrder.push({ nodeId: id, depth });
    }
    for (const neighbor of (adjacency.get(id) ?? [])) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  // Append orphaned eligible nodes (not reachable from StoryRoot)
  for (const node of nodes) {
    if (eligibleTypes.has(node.type) && !visited.has(node.id)) {
      bfsOrder.push({ nodeId: node.id, depth: Infinity });
    }
  }

  // Determine label and level for each node
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const steps: TimelineStep[] = bfsOrder.map(({ nodeId, depth }) => {
    const node = nodeMap.get(nodeId);
    const level = node
      ? (Object.entries(LEVEL_TO_NODE_TYPES).find(([, types]) => types.includes(node.type))?.[0] as CowriteNodeLevel) ?? 'scene'
      : 'scene';
    const label = node?.label || nodeId;
    return { nodeId, label, level, bfsDepth: depth };
  });

  return steps;
}

/**
 * Filter a list of timeline steps to only include those at the given level.
 */
export function filterStepsByLevel(steps: TimelineStep[], level: CowriteNodeLevel): TimelineStep[] {
  return steps.filter(s => s.level === level);
}
