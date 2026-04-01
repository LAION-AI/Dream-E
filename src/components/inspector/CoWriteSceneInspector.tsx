/**
 * =============================================================================
 * CO-WRITE SCENE INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for CoWriteSceneNode — the basic unit of storytelling
 * within the co-write canvas.
 *
 * FIELDS:
 * - Title (text input)
 * - Description (textarea — overview of what happens)
 * - Entities section (linked entities with per-entity fields)
 * - Scene Action (textarea — freeform what happens overall)
 * - Image (MediaUploader + Generate + Select from Assets)
 *
 * Each entity entry shows:
 * - Entity name (looked up from the entity store)
 * - Start State, Objective, Changes, End State (4 textareas)
 * - Remove button
 *
 * An "Add Entity" button opens a dropdown of all project entities.
 *
 * =============================================================================
 */

import React, { useState, useMemo, useRef } from 'react';
import { Sparkles, FolderOpen, Plus, Trash2, ChevronDown, Music, Search, Upload } from 'lucide-react';
import type { CoWriteSceneNode, CoWriteSceneData, CoWriteSceneEntity } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';
import MediaUploader from './MediaUploader';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';
import MusicSearchOverlay from '@components/media/MusicSearchOverlay';
import { getBlobUrl } from '@/utils/blobCache';

// =============================================================================
// PROPS
// =============================================================================

interface CoWriteSceneInspectorProps {
  node: CoWriteSceneNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * CoWriteSceneInspector — the right-panel detail view for co-write scene nodes.
 *
 * WHY SCENES MATTER:
 * Scenes are where storytelling happens. Each scene is a discrete moment
 * in the narrative — a change of location, a confrontation, a revelation.
 * By tracking which entities participate and how they transform, writers
 * maintain continuity and ensure character arcs progress naturally.
 */
export default function CoWriteSceneInspector({ node }: CoWriteSceneInspectorProps) {
  const updateNode = useProjectStore((s) => s.updateNode);
  const entities = useProjectStore((s) => s.currentProject?.entities || []);

  /** State for the image generation overlay */
  const [imageGenOpen, setImageGenOpen] = useState(false);
  /** State for the asset picker modal */
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  /** State for the entity-picker dropdown */
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  /** State for the music search overlay */
  const [musicSearchOpen, setMusicSearchOpen] = useState(false);
  /** Hidden file input ref for manual music upload */
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Helper to update any field on the CoWriteSceneNode's data object.
   * Merges the update into the existing data to preserve sibling fields.
   */
  const updateData = (updates: Partial<CoWriteSceneData>) => {
    updateNode(node.id, { data: { ...node.data, ...updates } });
  };

  /**
   * Update a specific entity entry in the entities array.
   * Creates a new array with the updated entry to trigger React re-render.
   */
  const updateEntity = (index: number, updates: Partial<CoWriteSceneEntity>) => {
    const newEntities = [...(node.data.entities || [])];
    newEntities[index] = { ...newEntities[index], ...updates };
    updateData({ entities: newEntities });
  };

  /**
   * Remove an entity from the scene's entities list by index.
   */
  const removeEntity = (index: number) => {
    const newEntities = (node.data.entities || []).filter((_, i) => i !== index);
    updateData({ entities: newEntities });
  };

  /**
   * Add an entity to the scene's entities list.
   * Initializes all fields to empty strings.
   */
  const addEntity = (entityId: string) => {
    const existing = (node.data.entities || []).find(e => e.entityId === entityId);
    if (existing) return; // Don't add duplicates
    const newEntities = [
      ...(node.data.entities || []),
      { entityId, startState: '', objective: '', changes: '', endState: '' },
    ];
    updateData({ entities: newEntities });
    setEntityPickerOpen(false);
  };

  /**
   * Handle image upload for the scene node.
   */
  const handleImageChange = (_file: File | null, url: string | null) => {
    updateData({ image: url || undefined });
  };

  /**
   * Handle music file upload via the hidden file input.
   */
  const handleMusicFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateData({ backgroundMusic: reader.result as string });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  /**
   * Compute which entities are NOT yet added to this scene,
   * so they can be shown in the "Add Entity" dropdown.
   */
  const availableEntities = useMemo(() => {
    const linkedIds = new Set((node.data.entities || []).map(e => e.entityId));
    return entities.filter(e => !linkedIds.has(e.id));
  }, [entities, node.data.entities]);

  /**
   * Look up an entity name by ID. Returns a fallback if the entity
   * has been deleted or is not found.
   */
  const getEntityName = (entityId: string): string => {
    const ent = entities.find(e => e.id === entityId);
    return ent ? ent.name : `(unknown: ${entityId.slice(0, 8)}...)`;
  };

  /**
   * Get the entity category for display (character, location, etc.)
   */
  const getEntityCategory = (entityId: string): string => {
    const ent = entities.find(e => e.id === entityId);
    return ent ? ent.category : 'unknown';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* ==================== TITLE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Title
          <InfoTooltip content={(STORY_TOOLTIPS as any).cowriteScene || 'A scene is the basic unit of storytelling. It represents a single continuous event — a conversation, a chase, a discovery. Good scenes have a clear beginning, a turning point, and an end that propels the story forward.'} />
        </label>
        <input
          type="text"
          value={node.data.title || ''}
          onChange={(e) => updateData({ title: e.target.value })}
          className="input"
          placeholder="e.g., The Confrontation at the Bridge"
        />
      </div>

      {/* ==================== DESCRIPTION ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Description
          <InfoTooltip content="An overview of what happens in this scene. This is the bird's-eye view — the key events, the emotional beat, and why this scene matters to the story. Think of it as a summary that another writer could read and understand the scene's purpose." />
        </label>
        <textarea
          value={node.data.description || ''}
          onChange={(e) => updateData({ description: e.target.value })}
          className="input min-h-[100px] resize-y"
          placeholder="Describe what happens in this scene — key events, emotional beats, and how it connects to the overall story..."
        />
      </div>

      {/* ==================== ENTITIES SECTION ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Entities
          <InfoTooltip content="Track which characters, locations, objects, and concepts are involved in this scene. For each entity, define how they enter the scene, what they want, how they change, and how they leave. This per-entity tracking is the foundation of continuity." />
        </label>

        {/* List of linked entities */}
        {(node.data.entities || []).length > 0 ? (
          <div className="space-y-4 mt-2">
            {(node.data.entities || []).map((ent, index) => (
              <div
                key={ent.entityId}
                className="border border-emerald-600/30 rounded-lg bg-emerald-950/30 p-3 space-y-3"
              >
                {/* Entity header with name and remove button */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-emerald-200">
                      {getEntityName(ent.entityId)}
                    </span>
                    <span className="ml-2 text-[10px] text-emerald-400/60 uppercase">
                      {getEntityCategory(ent.entityId)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeEntity(index)}
                    className="text-red-400/60 hover:text-red-400 transition-colors p-1"
                    title="Remove entity from this scene"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Start State */}
                <div>
                  <label className="text-[11px] text-emerald-300/70 flex items-center gap-1">
                    Start State
                    <InfoTooltip content={(STORY_TOOLTIPS as any).sceneStartState || 'Describe how each entity appears at the beginning of this scene. What is their emotional state? Physical condition? What do they know or believe? This establishes the baseline for measuring change.'} />
                  </label>
                  <textarea
                    value={ent.startState || ''}
                    onChange={(e) => updateEntity(index, { startState: e.target.value })}
                    className="input min-h-[60px] resize-y text-xs"
                    placeholder="How does this entity enter the scene?"
                  />
                </div>

                {/* Objective */}
                <div>
                  <label className="text-[11px] text-emerald-300/70 flex items-center gap-1">
                    Objective
                    <InfoTooltip content={(STORY_TOOLTIPS as any).sceneObjective || 'What does this entity want to achieve in this scene? Every entity in a scene should want something — even if it is just to maintain the status quo. Conflicting objectives between entities create dramatic tension.'} />
                  </label>
                  <textarea
                    value={ent.objective || ''}
                    onChange={(e) => updateEntity(index, { objective: e.target.value })}
                    className="input min-h-[60px] resize-y text-xs"
                    placeholder="What does this entity want in this scene?"
                  />
                </div>

                {/* Changes */}
                <div>
                  <label className="text-[11px] text-emerald-300/70 flex items-center gap-1">
                    Changes
                    <InfoTooltip content={(STORY_TOOLTIPS as any).sceneChanges || 'How does this entity transform during the scene? Do they learn something? Lose something? Make a choice? The best scenes change at least one entity in a meaningful way.'} />
                  </label>
                  <textarea
                    value={ent.changes || ''}
                    onChange={(e) => updateEntity(index, { changes: e.target.value })}
                    className="input min-h-[60px] resize-y text-xs"
                    placeholder="How does this entity change during the scene?"
                  />
                </div>

                {/* End State */}
                <div>
                  <label className="text-[11px] text-emerald-300/70 flex items-center gap-1">
                    End State
                    <InfoTooltip content={(STORY_TOOLTIPS as any).sceneEndState || 'How does this entity leave the scene? Compare this to the start state to see the arc. The end state of one scene often becomes the start state of the next scene where this entity appears.'} />
                  </label>
                  <textarea
                    value={ent.endState || ''}
                    onChange={(e) => updateEntity(index, { endState: e.target.value })}
                    className="input min-h-[60px] resize-y text-xs"
                    placeholder="How does this entity leave the scene?"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-editor-muted mt-1 italic">
            No entities linked to this scene yet.
          </p>
        )}

        {/* Add Entity button and dropdown */}
        <div className="relative mt-3">
          <button
            onClick={() => setEntityPickerOpen(!entityPickerOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors text-emerald-400"
          >
            <Plus size={12} />
            Add Entity
            <ChevronDown size={12} className={`transition-transform ${entityPickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Entity picker dropdown */}
          {entityPickerOpen && (
            <div className="absolute z-50 mt-1 left-0 w-64 max-h-48 overflow-y-auto rounded-lg bg-editor-surface border border-editor-border shadow-xl">
              {availableEntities.length > 0 ? (
                availableEntities.map(ent => (
                  <button
                    key={ent.id}
                    onClick={() => addEntity(ent.id)}
                    className="w-full text-left px-3 py-2 hover:bg-editor-bg transition-colors text-sm"
                  >
                    <span className="text-editor-text">{ent.name}</span>
                    <span className="ml-2 text-[10px] text-editor-muted uppercase">
                      {ent.category}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-editor-muted italic">
                  {entities.length === 0
                    ? 'No entities in project. Create some first.'
                    : 'All entities already linked to this scene.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================== SCENE ACTION ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Scene Action
          <InfoTooltip content={(STORY_TOOLTIPS as any).sceneAction || 'A freeform description of everything that happens in this scene — the dialogue beats, the action sequences, the revelations. This is where you write the actual scene plan, combining all entity threads into a unified narrative moment.'} />
        </label>
        <textarea
          value={node.data.sceneAction || ''}
          onChange={(e) => updateData({ sceneAction: e.target.value })}
          className="input min-h-[150px] resize-y"
          placeholder="Describe the full scene action — dialogue, events, revelations, and how all the entity threads weave together..."
        />
      </div>

      {/* ==================== IMAGE ==================== */}
      <div>
        <label className="input-label">Scene Image</label>
        <MediaUploader
          type="image"
          label="Scene Image"
          value={node.data.image}
          onChange={handleImageChange}
          placeholder="Click to upload a mood / concept image for this scene"
        />
        {/* Generate Image + Select from Assets buttons */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setImageGenOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent/10 border border-accent/30 hover:bg-accent/20 transition-colors text-accent"
          >
            <Sparkles size={12} />
            Generate Image
          </button>
          <button
            onClick={() => setAssetPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
          >
            <FolderOpen size={12} />
            Select from Assets
          </button>
        </div>
      </div>

      {/* ==================== BACKGROUND MUSIC ==================== */}
      <div>
        <label className="input-label flex items-center gap-2">
          <Music size={14} />
          Background Music
        </label>
        {node.data.backgroundMusic ? (
          <div className="mt-2 border border-editor-border rounded-lg p-3 bg-editor-bg/50">
            <audio
              src={getBlobUrl(node.data.backgroundMusic)}
              controls
              className="w-full h-8 mb-2"
            />
            <button
              onClick={() => updateData({ backgroundMusic: undefined })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors text-red-400"
            >
              <Trash2 size={12} />
              Remove Music
            </button>
          </div>
        ) : (
          <p className="text-xs text-editor-muted mt-1 italic">No background music set.</p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setMusicSearchOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent/10 border border-accent/30 hover:bg-accent/20 transition-colors text-accent"
          >
            <Search size={12} />
            Search Music
          </button>
          <button
            onClick={() => musicFileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
          >
            <Upload size={12} />
            Upload Music
          </button>
        </div>
        <input
          ref={musicFileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleMusicFileUpload}
          className="hidden"
        />
      </div>

      {/* Image Generation Overlay */}
      <ImageGenerationOverlay
        isOpen={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onImageGenerated={(dataUrl) => updateData({ image: dataUrl })}
        title="Generate Scene Image"
      />

      {/* Asset Picker for selecting existing images */}
      <AssetPicker
        isOpen={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onSelect={(url) => {
          updateData({ image: url });
          setAssetPickerOpen(false);
        }}
        filterType="image"
        title="Select Scene Image"
      />

      {/* Music Search Overlay */}
      <MusicSearchOverlay
        isOpen={musicSearchOpen}
        onClose={() => setMusicSearchOpen(false)}
        onSelect={(dataUrl) => updateData({ backgroundMusic: dataUrl })}
        title="Search Background Music"
      />
    </div>
  );
}
