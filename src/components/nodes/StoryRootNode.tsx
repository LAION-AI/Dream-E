/**
 * =============================================================================
 * STORY ROOT NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of a Story Root Node in the co-writing canvas.
 *
 * STORY ROOT NODES ARE:
 * - The central starting point of a co-writing project
 * - Purple colored
 * - Show the story title, genre, punchline, and main character
 * - Optionally display a cover/concept image thumbnail
 * - Have a single output handle at the bottom (connects to plot nodes)
 *
 * WHY THIS EXISTS:
 * The Story Root holds the high-level story metadata (title, genre, target
 * audience, premise). It acts as the "trunk" from which plot arcs branch out.
 * On the canvas it gives the author an at-a-glance overview of the project.
 *
 * MEMORY:
 * - Uses LazyNodeImage pattern from SceneNode for the optional cover image
 *   so that the full-resolution bitmap is never decoded on the canvas.
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { BookOpen } from 'lucide-react';
import type { StoryRootNodeData } from '@/types';

/**
 * STORY ROOT NODE COMPONENT
 *
 * Renders the story root with title, genre, punchline, and an optional
 * cover image. Uses the same memo pattern as SceneNode and CommentNode.
 */
function StoryRootNode({ data, selected }: NodeProps<StoryRootNodeData>) {
  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden shadow-lg w-[260px]
        ${selected ? 'border-purple-400 ring-2 ring-purple-400/30' : 'border-purple-600/50'}
        bg-gradient-to-b from-purple-950/90 to-purple-900/80
      `}
    >
      {/* Header badge — identifies this as the story root */}
      <div className="bg-purple-600/40 px-3 py-1.5 flex items-center gap-2">
        <BookOpen size={14} className="text-purple-300" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-200">
          Story Root
        </span>
      </div>

      {/* Optional cover/concept image thumbnail */}
      {data.image && (
        <div className="h-24 overflow-hidden">
          <img
            src={data.image}
            alt="Story cover"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content preview — shows title, genre, punchline, and lead character */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-bold text-white truncate">
          {data.title || 'Untitled Story'}
        </h3>
        {data.genre && (
          <p className="text-[10px] text-purple-300 truncate">{data.genre}</p>
        )}
        {data.punchline && (
          <p className="text-[10px] text-purple-200/70 line-clamp-2">{data.punchline}</p>
        )}
        {data.mainCharacter?.name && (
          <p className="text-[10px] text-purple-300/60 truncate">
            Lead: {data.mainCharacter.name}
          </p>
        )}
      </div>

      {/* Output handle at bottom — connects to plot nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-400 !border-purple-600"
      />
    </div>
  );
}

// Memo to prevent unnecessary re-renders when parent state changes
export default memo(StoryRootNode);
