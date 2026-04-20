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
 * - "What happens" preview (2-line clamp) — shows the action description
 * - Shot caption preview if no whatHappens (fallback to description for older nodes)
 * - Voiceover count badge (if timeline entries exist)
 * - 2 inputs (top, left) + 2 outputs (bottom, right) for sequencing
 *
 * Horizontal connections: right→left chains shots in storyboard order.
 * Shots can span across scenes: last shot of scene N → first shot of scene N+1.
 */
function ShotNode({ data, selected }: NodeProps<ShotNodeData>) {
  // Backwards-compat: older nodes may have description but not whatHappens
  const previewText = data.whatHappens || data.description || '';
  const voiceoverCount = data.voiceoverTimeline?.length ?? 0;

  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden shadow-lg w-[210px]
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

      {/* Input handle at left — previous shot in sequence */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-3 !h-3 !bg-rose-400 !border-rose-600"
      />

      {/* Header with SHOT badge + voiceover count */}
      <div className="bg-rose-600/40 px-3 py-1.5 flex items-center gap-2">
        <Camera size={14} className="text-rose-300" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-200">
          Shot
        </span>
        {/* Show how many voiceover timeline entries this shot has */}
        {voiceoverCount > 0 && (
          <span className="ml-auto text-[9px] bg-rose-800/60 text-rose-300 px-1.5 py-0.5 rounded-full">
            🎙 {voiceoverCount}
          </span>
        )}
        {/* Music carry-over indicator */}
        {data.musicContinueFromPrevious && (
          <span className="text-[9px] text-rose-400" title="Music continues from previous shot">♫</span>
        )}
      </div>

      {/* Image thumbnail (storyboard frame) */}
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

      {/* Content — title and action preview */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-bold text-white truncate">
          {data.title || 'Untitled Shot'}
        </h3>
        {previewText && (
          <p className="text-[10px] text-rose-200/70 line-clamp-2">
            {previewText}
          </p>
        )}
        {/* Show abbreviated shot caption if there's space */}
        {data.shotCaption && !previewText && (
          <p className="text-[10px] text-rose-300/50 line-clamp-1 italic">
            {data.shotCaption}
          </p>
        )}
      </div>

      {/* Output handle at bottom — children or next layer node */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-3 !h-3 !bg-rose-400 !border-rose-600"
      />

      {/* Output handle at right — next shot in horizontal sequence */}
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
