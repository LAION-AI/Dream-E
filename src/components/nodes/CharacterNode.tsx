/**
 * =============================================================================
 * CHARACTER NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of a Character Node on the character canvas.
 *
 * CHARACTER NODES ARE:
 * - Linked to an Entity in the project's entity store
 * - Teal colored
 * - Display the character's reference image (or a placeholder icon)
 * - Show the character's name and summary
 * - Have handles on all four sides for relationship edge connections
 *
 * WHY THIS EXISTS:
 * The character canvas lets authors visually map out relationships between
 * characters. Each CharacterNode is a lightweight wrapper that reads its
 * data live from the Zustand project store via the entity's ID. This means
 * edits to the entity (name, image, summary) are immediately reflected on
 * the canvas without any manual synchronization.
 *
 * ENTITY BINDING:
 * The node's data only stores `entityId`. All display data (name, image,
 * summary) is derived from `useProjectStore` at render time. If the entity
 * is deleted, the node shows an "Entity not found" error state.
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useProjectStore } from '@/stores/useProjectStore';
import { User } from 'lucide-react';
import { getBlobUrl } from '@/utils/blobCache';
import type { CharacterNodeData } from '@/types';

/**
 * CHARACTER NODE COMPONENT
 *
 * Reads entity data live from the project store and renders a character
 * card with image, name, and summary. Handles on all four sides support
 * relationship edges connecting characters together.
 */
function CharacterNode({ data, selected }: NodeProps<CharacterNodeData>) {
  /**
   * LIVE ENTITY LOOKUP
   *
   * We select only the entity we need from the store. Zustand's selector
   * ensures this component only re-renders when THIS entity changes, not
   * when any unrelated part of the project store updates.
   */
  const entity = useProjectStore(
    (s) => s.currentProject?.entities?.find((e) => e.id === data.entityId)
  );

  /**
   * IMAGE URL RESOLUTION
   *
   * Entity reference images may be stored as base64 data URLs or blob URLs.
   * getBlobUrl() normalizes both to a lightweight blob URL, keeping the
   * binary data in native memory outside the V8 heap.
   */
  const imageUrl = entity?.referenceImage ? getBlobUrl(entity.referenceImage) : '';

  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden shadow-lg w-[180px]
        ${selected ? 'border-teal-400 ring-2 ring-teal-400/30' : 'border-teal-600/50'}
        bg-gradient-to-b from-teal-950/90 to-teal-900/80
      `}
    >
      {/* Handles on all four sides for relationship connections */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-2.5 !h-2.5 !bg-teal-400 !border-teal-600"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-2.5 !h-2.5 !bg-teal-400 !border-teal-600"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2.5 !h-2.5 !bg-teal-400 !border-teal-600"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2.5 !h-2.5 !bg-teal-400 !border-teal-600"
      />

      {/* Character portrait — uses blob URL for memory efficiency */}
      <div className="h-36 bg-teal-900/50 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={entity?.name || 'Character'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <User size={48} className="text-teal-700" />
        )}
      </div>

      {/* Character info — name and summary from the entity store */}
      <div className="p-2.5 space-y-0.5">
        <h3 className="text-sm font-bold text-white truncate">
          {entity?.name || 'Unknown Character'}
        </h3>
        {entity?.summary && (
          <p className="text-[10px] text-teal-200/70 line-clamp-2">{entity.summary}</p>
        )}
        {/* Error state: entity was deleted but the node still exists */}
        {!entity && (
          <p className="text-[10px] text-red-400">Entity not found</p>
        )}
      </div>
    </div>
  );
}

// Memo to prevent unnecessary re-renders when parent state changes
export default memo(CharacterNode);
