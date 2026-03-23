/**
 * =============================================================================
 * CHARACTER NODE INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for CharacterNode on the Character Canvas.
 *
 * A CharacterNode is a lightweight wrapper that holds an `entityId` pointing
 * to a full Entity in the project's entity system. This inspector:
 *
 * 1. Looks up the entity by ID
 * 2. Displays the entity's name and description (editable)
 * 3. Delegates to ProfileViewer for the structured profile data
 *
 * WHY NOT DUPLICATE ENTITY DATA ON THE NODE?
 * Characters exist as entities in the project's world-building system.
 * The Character Canvas node is just a visual representation — all real
 * data lives on the entity. This avoids data drift where a character's
 * profile gets out of sync between the canvas and the entity system.
 *
 * =============================================================================
 */

import React from 'react';
import { User, AlertTriangle } from 'lucide-react';
import type { CharacterNode, Entity } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';
import ProfileViewer from '@components/entities/ProfileViewer';

// =============================================================================
// PROPS
// =============================================================================

interface CharacterNodeInspectorProps {
  node: CharacterNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * CharacterNodeInspector — the right-panel detail view for character nodes.
 *
 * Resolves the node's entityId into a full entity, then renders:
 * - A header with the character's name and description (editable)
 * - The full ProfileViewer for structured profile editing
 *
 * If the entity cannot be found (e.g., it was deleted), shows a warning.
 */
export default function CharacterNodeInspector({ node }: CharacterNodeInspectorProps) {
  const entities = useProjectStore((s) => s.currentProject?.entities || []);
  const updateEntity = useProjectStore((s) => s.updateEntity);

  /**
   * Look up the entity this character node points to.
   */
  const entity = entities.find((e) => e.id === node.data.entityId);

  // ==================== ENTITY NOT FOUND ====================
  if (!entity) {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-4">
        <div className="bg-error/10 border border-error/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-error flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-error">Entity Not Found</p>
            <p className="text-sm text-editor-muted mt-1">
              This character node references entity ID{' '}
              <code className="bg-editor-bg px-1 rounded text-xs">{node.data.entityId}</code>,
              but no matching entity exists in the project. It may have been deleted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==================== ENTITY FOUND ====================

  /**
   * Handle name changes — updates the entity directly.
   */
  const handleNameChange = (newName: string) => {
    updateEntity(entity.id, { name: newName });
  };

  /**
   * Handle description changes — updates the entity directly.
   */
  const handleDescriptionChange = (newDescription: string) => {
    updateEntity(entity.id, { description: newDescription });
  };

  /**
   * Handle profile changes — ProfileViewer gives us the entire updated profile.
   */
  const handleProfileChange = (newProfile: Record<string, unknown>) => {
    updateEntity(entity.id, { profile: newProfile });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* ==================== CHARACTER HEADER ==================== */}
      <div className="flex items-start gap-3">
        {/* Avatar / icon area */}
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
          {entity.referenceImage ? (
            <img
              src={entity.referenceImage}
              alt={entity.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <User size={20} className="text-accent" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <label className="input-label flex items-center gap-1">
            Character Name
            <InfoTooltip content={STORY_TOOLTIPS.characterNode} />
          </label>
        </div>
      </div>

      {/* ==================== NAME ==================== */}
      <div>
        <input
          type="text"
          value={entity.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="input"
          placeholder="Character name"
        />
      </div>

      {/* ==================== DESCRIPTION ==================== */}
      <div>
        <label className="input-label">Description</label>
        <textarea
          value={entity.description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          className="input min-h-[80px] resize-y"
          placeholder="Brief character description — traits, motivations, appearance..."
        />
      </div>

      {/* ==================== PROFILE ==================== */}
      <div>
        <label className="input-label mb-2">Profile</label>
        <ProfileViewer
          profile={entity.profile || null}
          onProfileChange={handleProfileChange}
        />
      </div>
    </div>
  );
}
