/**
 * =============================================================================
 * ACT NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of an Act Node in the co-writing story canvas.
 *
 * ACT NODES ARE:
 * - Structural markers that represent acts in the story (e.g., Act 1, 2, 3)
 * - Blue/indigo colored to distinguish them from plot arcs (amber)
 * - Show the act number badge, name, and a description preview
 * - Have input handle at top and output handle at bottom
 *
 * WHY THIS EXISTS:
 * The three-act (or multi-act) structure is a fundamental organizing principle
 * in storytelling. Act nodes let writers visually map which plot events belong
 * to which act, creating a clear structural overview of story pacing.
 * Connecting an Act to a Plot via a relationship edge defines what parts
 * of that plot unfold during that act.
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import type { ActNodeData } from '@/types';

/**
 * ACT NODE COMPONENT
 *
 * Renders an act node with a numbered badge, name, and description.
 * Uses blue/indigo theming for acts and teal theming for episodes.
 * The isEpisode flag on the node data controls which variant is displayed.
 */
function ActNode({ data, selected }: NodeProps<ActNodeData>) {
  /**
   * Determine whether this node represents an episode (TV/series structure)
   * or a traditional act (screenplay/novel structure). This affects the
   * color scheme, badge label, and fallback name.
   */
  const isEpisode = !!(data as any).isEpisode;

  // Color classes change based on act vs episode to provide visual distinction
  const borderSelected = isEpisode ? 'border-teal-400 ring-2 ring-teal-400/30' : 'border-indigo-400 ring-2 ring-indigo-400/30';
  const borderDefault = isEpisode ? 'border-teal-600/50' : 'border-indigo-600/50';
  const bgGradient = isEpisode ? 'from-teal-950/90 to-teal-900/80' : 'from-indigo-950/90 to-indigo-900/80';
  const headerBg = isEpisode ? 'bg-teal-600/40' : 'bg-indigo-600/40';
  const iconColor = isEpisode ? 'text-teal-300' : 'text-indigo-300';
  const badgeColor = isEpisode ? 'text-teal-200' : 'text-indigo-200';
  const descColor = isEpisode ? 'text-teal-200/70' : 'text-indigo-200/70';
  const handleBg = isEpisode ? '!bg-teal-400' : '!bg-indigo-400';
  const handleBorder = isEpisode ? '!border-teal-600' : '!border-indigo-600';

  const badgeLabel = isEpisode ? 'Episode' : 'Act';
  const fallbackName = isEpisode ? 'Unnamed Episode' : 'Unnamed Act';

  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden shadow-lg w-[220px]
        ${selected ? borderSelected : borderDefault}
        bg-gradient-to-b ${bgGradient}
      `}
    >
      {/* Input handle at top — connects from story root or plot nodes */}
      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 ${handleBg} ${handleBorder}`}
      />

      {/* Header with act/episode number badge */}
      <div className={`${headerBg} px-3 py-1.5 flex items-center gap-2`}>
        <Layers size={14} className={iconColor} />
        <span className={`text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
          {badgeLabel} {data.actNumber || '?'}
        </span>
      </div>

      {/* Image thumbnail (if one has been generated or uploaded) */}
      {data.image && (
        <div className="h-20 overflow-hidden">
          <img src={data.image} alt={badgeLabel} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      {/* Content — act/episode name and description preview */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-bold text-white truncate">
          {data.name || fallbackName}
        </h3>
        {data.description && (
          <p className={`text-[10px] ${descColor} line-clamp-3`}>{data.description}</p>
        )}
      </div>

      {/* Output handle at bottom — connects to plot nodes or scenes */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={`!w-3 !h-3 ${handleBg} ${handleBorder}`}
      />
    </div>
  );
}

// Memo to prevent unnecessary re-renders when parent state changes
export default memo(ActNode);
