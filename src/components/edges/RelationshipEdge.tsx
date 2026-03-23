/**
 * =============================================================================
 * RELATIONSHIP EDGE COMPONENT
 * =============================================================================
 *
 * A custom React Flow edge for displaying relationships between characters.
 *
 * RELATIONSHIP EDGES ARE:
 * - Dashed pink/magenta bezier curves
 * - Display a label in the center showing the relationship type
 * - Used exclusively on the character canvas to connect CharacterNodes
 * - Store relationship metadata (type, description, status, history)
 *
 * WHY A CUSTOM EDGE?
 * The default React Flow edge is a plain solid line with no labels.
 * Relationships need:
 * - A dashed style to visually distinguish them from story flow edges
 * - A centered label showing the relationship type ("Rivals", "Siblings", etc.)
 * - A distinct pink color that contrasts with the teal character nodes
 * - Selected-state highlighting for editing in the inspector
 *
 * =============================================================================
 */

import React from 'react';
/**
 * IMPORT NOTE: @xyflow/react v12.10.1 ships without .d.ts files (see
 * gotcha #10 in MEMORY.md). BaseEdge, EdgeLabelRenderer, getBezierPath
 * and EdgeProps are exported at runtime but invisible to TypeScript.
 * We import the whole module as `any` and destructure what we need.
 */
import * as ReactFlowAll from '@xyflow/react';
import type { RelationshipEdgeData } from '@/types';

const { BaseEdge, EdgeLabelRenderer, getBezierPath } = ReactFlowAll as any;

/**
 * Props for the RelationshipEdge component.
 *
 * We define these manually rather than importing EdgeProps because
 * the @xyflow/react package lacks type declarations for edge utilities.
 */
interface RelationshipEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
  selected?: boolean;
  data?: RelationshipEdgeData;
}

/**
 * RELATIONSHIP EDGE COMPONENT
 *
 * Renders a dashed bezier curve with a floating label at the midpoint.
 * The label shows the relationship type (e.g. "Rivals", "Mentor/Mentee").
 * When selected, both the edge and label brighten for visual feedback.
 */
export default function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: RelationshipEdgeProps) {
  /**
   * BEZIER PATH CALCULATION
   *
   * getBezierPath computes the SVG path string for a smooth curve between
   * source and target, as well as the midpoint coordinates (labelX, labelY)
   * where we position the floating label.
   */
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Fall back to a generic label if no relationship type is set
  const label = data?.relationshipType || 'Relationship';

  return (
    <>
      {/* The actual edge line — dashed pink bezier curve */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#ec4899' : '#ec489980',
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: '8 4',
        }}
      />

      {/*
       * FLOATING LABEL
       *
       * EdgeLabelRenderer renders HTML elements on a layer above the SVG
       * canvas. We position the label at the bezier midpoint using CSS
       * transforms. pointerEvents: 'all' allows clicking the label to
       * select the edge.
       */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`
            px-2 py-0.5 rounded text-[10px] font-medium
            ${selected ? 'bg-pink-600 text-white' : 'bg-pink-900/80 text-pink-200'}
            border border-pink-500/30
          `}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
