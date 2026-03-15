/**
 * =============================================================================
 * SCENE ENTITY OVERLAY COMPONENT
 * =============================================================================
 *
 * A modal that appears when clicking an entity chip in the scene inspector's
 * World tab. Shows entity details (name, image, summary) and an editable
 * textarea for situational attributes specific to this scene.
 *
 * Situational attributes describe the entity's state AT THE BEGINNING
 * of the scene — mood, condition, equipment, location within the scene, etc.
 * Changes that happen during the scene should be reflected in the next
 * scene where the entity appears.
 *
 * Uses the shared Modal component for consistent overlay behavior —
 * click-outside, Escape, backdrop dimming are all handled by Modal.
 *
 * =============================================================================
 */

import React from 'react';
import { Modal } from '@/components/common';
import { useProjectStore } from '@/stores/useProjectStore';
import { getBlobUrl } from '@/utils/blobCache';
import type { Entity } from '@/types';

// =============================================================================
// COMPONENT PROPS
// =============================================================================

interface SceneEntityOverlayProps {
  /** The entity to display */
  entity: Entity;
  /** The scene node ID (needed to store situational attributes per-scene) */
  nodeId: string;
  /** Current situational attributes text for this entity in this scene */
  entityState: string;
  /** Called when the overlay should close */
  onClose: () => void;
}

// =============================================================================
// SCENE ENTITY OVERLAY COMPONENT
// =============================================================================

export default function SceneEntityOverlay({
  entity,
  nodeId,
  entityState,
  onClose,
}: SceneEntityOverlayProps) {
  const { updateEntityState } = useProjectStore();

  return (
    <Modal isOpen={true} onClose={onClose} title={entity.name} size="lg">
      <div className="space-y-4">
        {/* Reference image and summary row */}
        {(entity.referenceImage || entity.summary) && (
          <div className="flex gap-3">
            {entity.referenceImage && (
              <img
                src={getBlobUrl(entity.referenceImage)}
                alt={entity.name}
                className="w-24 h-24 rounded object-cover flex-shrink-0"
              />
            )}
            {entity.summary && (
              <p className="text-xs text-editor-muted leading-relaxed line-clamp-5">
                {entity.summary}
              </p>
            )}
          </div>
        )}

        {/* Divider if there was image/summary above */}
        {(entity.referenceImage || entity.summary) && (
          <div className="border-t border-editor-border" />
        )}

        {/* Situational attributes textarea */}
        <div>
          <label className="block text-xs font-medium text-editor-text mb-1">
            Situational Attributes
          </label>
          <p className="text-xs text-editor-muted mb-2">
            Describe this entity's state at the <strong>beginning</strong> of this scene.
            Changes during the scene should be reflected in subsequent scenes.
          </p>
          <textarea
            value={entityState}
            onChange={(e) => updateEntityState(nodeId, entity.id, e.target.value)}
            className="input text-sm w-full min-h-[160px] resize-y"
            placeholder={getPlaceholder(entity.category)}
          />
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Returns a category-appropriate placeholder for the situational attributes
 * textarea, giving the user an idea of what to describe.
 */
function getPlaceholder(category: string): string {
  switch (category) {
    case 'character':
      return (
        'e.g., Wounded from the previous battle. Suspicious of the player. ' +
        'Carrying a hidden dagger. Emotional state: anxious but determined. ' +
        'Current goal: find an escape route.'
      );
    case 'location':
      return (
        'e.g., Night time, heavy rain. The tavern is mostly empty. ' +
        'A fire crackles in the hearth. The back door is locked. ' +
        'Ambient mood: tense and foreboding.'
      );
    case 'object':
      return (
        'e.g., The sword is glowing faintly — its enchantment is partially ' +
        'activated. Durability: 60%. Currently sheathed on the player\'s belt.'
      );
    case 'concept':
      return (
        'e.g., The faction\'s influence in this region is weakening. ' +
        'Magic levels are elevated due to the nearby rift. ' +
        'The curse is in its second stage of progression.'
      );
    default:
      return 'Describe this entity\'s current state in this scene...';
  }
}
