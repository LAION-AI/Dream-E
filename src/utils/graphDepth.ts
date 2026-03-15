/**
 * =============================================================================
 * GRAPH DEPTH UTILITY
 * =============================================================================
 *
 * Computes the shortest "scene distance" from the start node to every other
 * node in the story graph. Only scene nodes count as a step — modifier nodes,
 * choice nodes, and comment nodes are traversed but don't increment the depth.
 *
 * This means a path like Start → Modifier → Scene_1B has depth 1 (not 2),
 * because the modifier is transparent and only the scene counts.
 *
 * Uses 0-1 BFS (deque-based) for correct shortest paths with mixed 0/1 costs.
 *
 * =============================================================================
 */

import type { StoryNode, StoryEdge } from '@/types';

/**
 * Computes the scene-aware depth from startNodeId to every node.
 *
 * Only scene nodes increment the depth counter. Non-scene nodes (modifiers,
 * choice nodes, comments) are traversed at zero cost — they get the same
 * depth as the scene they were reached from.
 *
 * @param nodes - All nodes in the project
 * @param edges - All edges in the project
 * @param startNodeId - The ID of the starting scene
 * @returns A Map from node ID to its scene depth (0 for start, 1 for scenes
 *          reachable through one scene transition, etc.)
 */
export function computeNodeDepths(
  nodes: StoryNode[],
  edges: StoryEdge[],
  startNodeId: string
): Map<string, number> {
  const depths = new Map<string, number>();

  // Look up node type by ID (scene nodes cost 1 to enter, others cost 0)
  const nodeTypes = new Map<string, string>();
  for (const node of nodes) {
    nodeTypes.set(node.id, node.type);
  }

  // Build adjacency list: source → [target1, target2, ...]
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const neighbors = adjacency.get(edge.source) || [];
    neighbors.push(edge.target);
    adjacency.set(edge.source, neighbors);
  }

  // 0-1 BFS using a deque:
  // - Arriving at a scene node costs 1 (push to back)
  // - Arriving at a non-scene node costs 0 (push to front)
  // This guarantees shortest paths with mixed 0/1 edge weights.
  const deque: string[] = [startNodeId];
  depths.set(startNodeId, 0);

  while (deque.length > 0) {
    const current = deque.shift()!;
    const currentDepth = depths.get(current)!;
    const neighbors = adjacency.get(current) || [];

    for (const neighbor of neighbors) {
      const isScene = nodeTypes.get(neighbor) === 'scene';
      const newDepth = currentDepth + (isScene ? 1 : 0);

      if (!depths.has(neighbor) || newDepth < depths.get(neighbor)!) {
        depths.set(neighbor, newDepth);
        if (isScene) {
          deque.push(neighbor);     // Cost 1 → back of deque
        } else {
          deque.unshift(neighbor);  // Cost 0 → front of deque
        }
      }
    }
  }

  // Mark unreachable nodes with Infinity
  for (const node of nodes) {
    if (!depths.has(node.id)) {
      depths.set(node.id, Infinity);
    }
  }

  return depths;
}

/**
 * Computes the shortest path of SCENE nodes from startNodeId to targetNodeId.
 * Uses BFS on the directed edge graph. Non-scene nodes are traversed but
 * not included in the result (only scene-type nodes appear in the returned path).
 *
 * Returns an ordered array of scene node IDs from start to target (inclusive).
 * Returns an empty array if the target is unreachable from the start.
 *
 * This is used by the Open World context builder to reconstruct the full
 * story path even for games that were started mid-graph or loaded from saves.
 */
export function computeShortestScenePath(
  nodes: StoryNode[],
  edges: StoryEdge[],
  startNodeId: string,
  targetNodeId: string
): string[] {
  if (startNodeId === targetNodeId) return [startNodeId];

  const nodeTypes = new Map<string, string>();
  for (const node of nodes) {
    nodeTypes.set(node.id, node.type);
  }

  // Build adjacency list: source → [target1, target2, ...]
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const neighbors = adjacency.get(edge.source) || [];
    neighbors.push(edge.target);
    adjacency.set(edge.source, neighbors);
  }

  // BFS to find shortest path, tracking parent pointers
  const visited = new Set<string>();
  const parent = new Map<string, string>(); // child → parent
  const queue: string[] = [startNodeId];
  visited.add(startNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === targetNodeId) break;

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  // Target not reachable
  if (!visited.has(targetNodeId)) return [];

  // Reconstruct full path (including non-scene nodes)
  const fullPath: string[] = [];
  let cur = targetNodeId;
  while (cur !== undefined) {
    fullPath.unshift(cur);
    cur = parent.get(cur)!;
    if (cur === startNodeId) {
      fullPath.unshift(cur);
      break;
    }
  }

  // Filter to only scene nodes
  return fullPath.filter(id => nodeTypes.get(id) === 'scene');
}

/**
 * Groups nodes into layers by their scene depth from the start node.
 * Each layer contains all nodes at the same depth.
 *
 * @returns An array of layers sorted by depth. Unreachable nodes are last.
 */
export function groupNodesByDepth(
  nodes: StoryNode[],
  edges: StoryEdge[],
  startNodeId: string
): { depth: number; nodeIds: string[] }[] {
  const depths = computeNodeDepths(nodes, edges, startNodeId);

  // Group by depth
  const groups = new Map<number, string[]>();
  for (const [nodeId, depth] of depths) {
    const list = groups.get(depth) || [];
    list.push(nodeId);
    groups.set(depth, list);
  }

  // Sort by depth (finite first, then Infinity)
  const sorted = Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([depth, nodeIds]) => ({ depth, nodeIds }));

  return sorted;
}
