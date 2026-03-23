/**
 * =============================================================================
 * PLOT NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of a Plot Node in the co-writing canvas.
 *
 * PLOT NODES ARE:
 * - Narrative arcs that branch from the story root
 * - Amber/gold colored
 * - Typed by plot category (Main Plot, Relationship, Antagonist, etc.)
 * - Show a name, description, and optional image
 * - Have input handle at top (from story root) and output handle at bottom
 *
 * WHY THIS EXISTS:
 * Plots represent the major narrative arcs of a story (A-plot, B-plot,
 * character arcs, antagonist arcs). Each plot node groups related scenes
 * and gives the author a structural overview of their story's pacing.
 *
 * PLOT TYPE COLORING:
 * Different plot types get different badge colors so the author can
 * quickly distinguish Main Plot from Relationship from Antagonist arcs
 * at a glance when zoomed out on the canvas.
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText } from 'lucide-react';
import type { PlotNodeData } from '@/types';

/**
 * COLOR MAP for plot type badges.
 *
 * WHY A LOOKUP TABLE?
 * Each plot type has a distinct color to make the canvas scannable.
 * The map returns both background and text Tailwind classes. If a
 * plot type isn't in the map (or is 'Custom'), we fall back to gray.
 */
const PLOT_TYPE_COLORS: Record<string, string> = {
  'Main Plot': 'bg-amber-500/30 text-amber-200',
  'Relationship Plot': 'bg-pink-500/30 text-pink-200',
  'Antagonist Plot': 'bg-red-500/30 text-red-200',
  'Character Development Plot': 'bg-cyan-500/30 text-cyan-200',
  'Subplot': 'bg-slate-500/30 text-slate-200',
  'Custom': 'bg-gray-500/30 text-gray-200',
};

/**
 * PLOT NODE COMPONENT
 *
 * Renders a plot arc node with a typed badge, optional image, and
 * a short description. Uses the same memo pattern as SceneNode.
 */
function PlotNode({ data, selected }: NodeProps<PlotNodeData>) {
  const plotType = data.plotType || 'Custom';

  // If plotType is 'Custom' and the user specified a custom name, display that instead
  const displayType = plotType === 'Custom' && data.customPlotType
    ? data.customPlotType
    : plotType;

  // Look up the badge color class; fall back to the 'Custom' color
  const colorClass = PLOT_TYPE_COLORS[plotType] || PLOT_TYPE_COLORS['Custom'];

  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden shadow-lg w-[220px]
        ${selected ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-amber-600/50'}
        bg-gradient-to-b from-amber-950/90 to-amber-900/80
      `}
    >
      {/* Input handle at top — connects from story root or other plots */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-400 !border-amber-600"
      />

      {/* Header with plot type badge */}
      <div className="bg-amber-600/40 px-3 py-1.5 flex items-center gap-2">
        <FileText size={14} className="text-amber-300" />
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${colorClass}`}
        >
          {displayType}
        </span>
      </div>

      {/* Optional plot image thumbnail */}
      {data.image && (
        <div className="h-20 overflow-hidden">
          <img
            src={data.image}
            alt="Plot"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content — plot name and description preview */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-bold text-white truncate">
          {data.name || 'Unnamed Plot'}
        </h3>
        {data.description && (
          <p className="text-[10px] text-amber-200/70 line-clamp-3">{data.description}</p>
        )}
      </div>

      {/* Output handle at bottom — connects to child scenes or sub-plots */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-amber-400 !border-amber-600"
      />
    </div>
  );
}

// Memo to prevent unnecessary re-renders when parent state changes
export default memo(PlotNode);
