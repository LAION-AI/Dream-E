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
 * Uses blue/indigo theming to differentiate from amber plot nodes.
 */
function ActNode({ data, selected }: NodeProps<ActNodeData>) {
  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden shadow-lg w-[220px]
        ${selected ? 'border-indigo-400 ring-2 ring-indigo-400/30' : 'border-indigo-600/50'}
        bg-gradient-to-b from-indigo-950/90 to-indigo-900/80
      `}
    >
      {/* Input handle at top — connects from story root or plot nodes */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-indigo-400 !border-indigo-600"
      />

      {/* Header with act number badge */}
      <div className="bg-indigo-600/40 px-3 py-1.5 flex items-center gap-2">
        <Layers size={14} className="text-indigo-300" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">
          Act {data.actNumber || '?'}
        </span>
      </div>

      {/* Image thumbnail (if one has been generated or uploaded) */}
      {data.image && (
        <div className="h-20 overflow-hidden">
          <img src={data.image} alt="Act" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      {/* Content — act name and description preview */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-bold text-white truncate">
          {data.name || 'Unnamed Act'}
        </h3>
        {data.description && (
          <p className="text-[10px] text-indigo-200/70 line-clamp-3">{data.description}</p>
        )}
      </div>

      {/* Output handle at bottom — connects to plot nodes or scenes */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-indigo-400 !border-indigo-600"
      />
    </div>
  );
}

// Memo to prevent unnecessary re-renders when parent state changes
export default memo(ActNode);
