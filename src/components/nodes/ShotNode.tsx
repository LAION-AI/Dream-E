/**
 * =============================================================================
 * SHOT NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of a Shot Node in the co-writing story canvas.
 *
 * SHOT NODES ARE:
 * - The most granular unit of visual storytelling (individual camera shots)
 * - Red/rose colored to distinguish them from co-write scenes (green)
 * - Show a "SHOT" badge with Camera icon, title, and image thumbnail
 * - Have input handle at top and output handles at bottom + right (sequencing)
 *
 * WHY RED/ROSE?
 * Shots are the atomic "action" unit — red conveys energy and immediacy,
 * and visually pops against the emerald co-write scenes and indigo acts.
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Camera } from 'lucide-react';
import type { ShotNodeData } from '@/types';

/**
 * ShotNode — renders a shot card on the co-write story canvas.
 *
 * Layout:
 * - Header badge: "SHOT" with Camera icon (rose)
 * - Title (truncated)
 * - Image thumbnail (if available)
 * - Description preview (2-line clamp)
 * - 2 inputs (top, left) + 2 outputs (bottom, right) for flexible sequencing
 */
function ShotNode({ data, selected }: NodeProps<ShotNodeData>) {
  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden shadow-lg w-[200px]
        ${selected ? 'border-rose-400 ring-2 ring-rose-400/30' : 'border-rose-600/50'}
        bg-gradient-to-b from-rose-950/90 to-rose-900/80
      `}
    >
      {/* Input handle at top — parent from scene or act node */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-3 !h-3 !bg-rose-400 !border-rose-600"
      />

      {/* Input handle at left — sibling from previous shot */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-3 !h-3 !bg-rose-400 !border-rose-600"
      />

      {/* Header with SHOT badge */}
      <div className="bg-rose-600/40 px-3 py-1.5 flex items-center gap-2">
        <Camera size={14} className="text-rose-300" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-200">
          Shot
        </span>
      </div>

      {/* Image thumbnail (if one has been generated or uploaded) */}
      {data.image && (
        <div className="h-20 overflow-hidden">
          <img
            src={data.image}
            alt="Shot"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content — title and description preview */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-bold text-white truncate">
          {data.title || 'Untitled Shot'}
        </h3>
        {data.description && (
          <p className="text-[10px] text-rose-200/70 line-clamp-2">
            {data.description}
          </p>
        )}
      </div>

      {/* Output handle at bottom — children or next node */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-3 !h-3 !bg-rose-400 !border-rose-600"
      />

      {/* Output handle at right — sibling to next shot */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-3 !h-3 !bg-rose-400 !border-rose-600"
      />
    </div>
  );
}

// Memo to prevent unnecessary re-renders when parent state changes
export default memo(ShotNode);
