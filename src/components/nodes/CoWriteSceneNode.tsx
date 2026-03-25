/**
 * =============================================================================
 * CO-WRITE SCENE NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of a CoWriteScene node on the co-writing canvas.
 *
 * CO-WRITE SCENE NODES ARE:
 * - The basic unit of storytelling within the co-write canvas
 * - Green/emerald colored to distinguish from game-mode scenes (blue)
 * - Show the scene title, entity count, description preview, and image
 * - Have input handles at top and left (parent act, sibling previous scene)
 * - Have output handles at bottom and right (children, sibling next scene)
 *
 * WHY GREEN?
 * Game-mode scene nodes are blue. Using emerald/green for co-write scenes
 * gives an immediate visual signal that you're in a different mode —
 * planning/outlining rather than building interactive gameplay.
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Film, Users } from 'lucide-react';
import type { CoWriteSceneData } from '@/types';

/**
 * CoWriteSceneNode — renders a scene card on the co-write story canvas.
 *
 * Layout:
 * - Header badge: "SCENE" with Film icon (emerald)
 * - Title (truncated)
 * - Entity count badge (if any entities are linked)
 * - Description preview (2-line clamp)
 * - Image thumbnail (if available)
 * - 4 handles: top + left (inputs), bottom + right (outputs)
 */
function CoWriteSceneNode({ data, selected }: NodeProps<CoWriteSceneData>) {
  const entityCount = data.entities?.length ?? 0;

  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden shadow-lg w-[220px]
        ${selected ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-emerald-600/50'}
        bg-gradient-to-b from-emerald-950/90 to-emerald-900/80
      `}
    >
      {/* Input handle at top — parent from act node */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-3 !h-3 !bg-emerald-400 !border-emerald-600"
      />

      {/* Input handle at left — sibling from previous scene */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-3 !h-3 !bg-emerald-400 !border-emerald-600"
      />

      {/* Header with SCENE badge */}
      <div className="bg-emerald-600/40 px-3 py-1.5 flex items-center gap-2">
        <Film size={14} className="text-emerald-300" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
          Scene
        </span>
        {/* Entity count badge */}
        {entityCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-300/80 bg-emerald-800/50 px-1.5 py-0.5 rounded-full">
            <Users size={10} />
            {entityCount}
          </span>
        )}
      </div>

      {/* Image thumbnail (if one has been generated or uploaded) */}
      {data.image && (
        <div className="h-20 overflow-hidden">
          <img
            src={data.image}
            alt="Scene"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content — title and description preview */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-bold text-white truncate">
          {data.title || 'Untitled Scene'}
        </h3>
        {data.description && (
          <p className="text-[10px] text-emerald-200/70 line-clamp-2">
            {data.description}
          </p>
        )}
      </div>

      {/* Output handle at bottom — children nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-3 !h-3 !bg-emerald-400 !border-emerald-600"
      />

      {/* Output handle at right — sibling to next scene */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-3 !h-3 !bg-emerald-400 !border-emerald-600"
      />
    </div>
  );
}

// Memo to prevent unnecessary re-renders when parent state changes
export default memo(CoWriteSceneNode);
