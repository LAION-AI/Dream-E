/**
 * =============================================================================
 * RELATIONSHIP EDGE COMPONENT
 * =============================================================================
 *
 * A custom React Flow edge for displaying relationships between nodes
 * in the co-writing canvas.
 *
 * TWO VISUAL MODES:
 * 1. Character-to-character (character canvas): dashed pink bezier with
 *    relationship type label (e.g. "Rivals", "Siblings")
 * 2. Act-to-Plot / Plot-to-Act (story canvas): solid colored bezier with
 *    the PLOT NAME as label. Each plot gets a unique bright color so you
 *    can visually trace which plot threads connect to which acts.
 *
 * =============================================================================
 */

import React, { useCallback, useMemo } from 'react';
import * as ReactFlowAll from '@xyflow/react';
import type { RelationshipEdgeData } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';

const { BaseEdge, EdgeLabelRenderer, getBezierPath } = ReactFlowAll as any;

/**
 * BRIGHT COLOR PALETTE FOR PLOT EDGES
 * Each plot node gets a unique color based on its index among all plot nodes.
 * Colors are chosen to be bright, distinct, and readable on dark backgrounds.
 */
const PLOT_COLORS = [
  '#f97316', // orange
  '#22d3ee', // cyan
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fb923c', // amber
  '#f472b6', // pink
  '#60a5fa', // blue
  '#facc15', // yellow
  '#c084fc', // purple
  '#4ade80', // green
  '#f87171', // red
  '#2dd4bf', // teal
];

/**
 * Deterministic color for a plot node based on its position among all
 * plot nodes in the project. This ensures the same plot always gets
 * the same color, even as nodes are added/removed.
 */
function getPlotColor(plotNodeId: string, allNodes: Array<{ id: string; type: string }>): string {
  const plotNodes = allNodes.filter(n => n.type === 'plot');
  const index = plotNodes.findIndex(n => n.id === plotNodeId);
  return PLOT_COLORS[(index >= 0 ? index : 0) % PLOT_COLORS.length];
}

interface RelationshipEdgeProps {
  id: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
  selected?: boolean;
  data?: RelationshipEdgeData;
}

export default function RelationshipEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: RelationshipEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  // Read the source and target nodes to determine edge mode (character vs act-plot)
  const sourceNode = useProjectStore(
    (s) => s.currentProject?.nodes.find(n => n.id === source)
  );
  const targetNode = useProjectStore(
    (s) => s.currentProject?.nodes.find(n => n.id === target)
  );
  const allNodes = useProjectStore(
    (s) => s.currentProject?.nodes || []
  );

  // Determine if this is an act-plot connection
  const isActPlot = useMemo(() => {
    if (!sourceNode || !targetNode) return false;
    return (sourceNode.type === 'act' && targetNode.type === 'plot') ||
           (sourceNode.type === 'plot' && targetNode.type === 'act');
  }, [sourceNode, targetNode]);

  // For act-plot edges: find the plot node and get its name + color
  const plotInfo = useMemo(() => {
    if (!isActPlot) return null;
    const plotNode = sourceNode?.type === 'plot' ? sourceNode : targetNode;
    if (!plotNode) return null;
    const plotData = plotNode.data as any;
    const name = plotData?.name || plotData?.plotType || 'Plot';
    const color = getPlotColor(plotNode.id, allNodes as any);
    return { name, color };
  }, [isActPlot, sourceNode, targetNode, allNodes]);

  // Choose label and colors based on edge mode
  const label = isActPlot && plotInfo
    ? plotInfo.name
    : (data?.relationshipType || 'Relationship');

  const edgeColor = isActPlot && plotInfo
    ? plotInfo.color
    : (selected ? '#ec4899' : '#ec489980');

  const edgeColorSelected = isActPlot && plotInfo
    ? plotInfo.color
    : '#ec4899';

  const labelBg = isActPlot && plotInfo
    ? `${plotInfo.color}20`
    : (selected ? undefined : undefined);

  const handleLabelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useProjectStore.getState();
    store.selectEdge(id);
    store.selectNode(null);
  }, [id]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? edgeColorSelected : edgeColor,
          strokeWidth: selected ? 3 : 2,
          // Act-plot edges are solid; character relationships are dashed
          strokeDasharray: isActPlot ? undefined : '8 4',
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            cursor: 'pointer',
            // For act-plot edges, use the plot's color as a subtle background
            ...(isActPlot && plotInfo ? {
              backgroundColor: `${plotInfo.color}25`,
              borderColor: `${plotInfo.color}60`,
              color: plotInfo.color,
            } : {}),
          }}
          className={`
            px-2 py-0.5 rounded text-[10px] font-medium border
            ${!isActPlot ? (
              selected ? 'bg-pink-600 text-white border-pink-500/30' : 'bg-pink-900/80 text-pink-200 border-pink-500/30'
            ) : ''}
          `}
          onClick={handleLabelClick}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
