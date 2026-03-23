/**
 * =============================================================================
 * ENTITY MANAGER COMPONENT
 * =============================================================================
 *
 * Near-fullscreen modal for managing world-building entities.
 *
 * LAYOUT ORDER (right panel):
 *   Name → Media (image, voice*, music) → Summary → Description → Scene list → Delete
 *   (* voice clip only for characters)
 *
 * =============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  MapPin,
  Package,
  Lightbulb,
  Plus,
  Trash2,
  Search,
  Film,
  History,
  ChevronDown,
  ChevronRight,
  Sparkles,
  FolderOpen,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import type { EntityCategory, Entity, SceneNode, EntityStateChangeEvent } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import { Modal, ConfirmModal, Button } from '@components/common';
import { generateId } from '@/utils/idGenerator';
import MediaUploader from '@components/inspector/MediaUploader';
import { getAssetFingerprint } from '@/utils/assetFingerprint';
import { computeNodeDepths } from '@/utils/graphDepth';
import ProfileViewer from './ProfileViewer';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import TTSGenerationOverlay from '@components/media/TTSGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';

// =============================================================================
// DESCRIPTION TEMPLATES — schema-inspired heading prompts
// =============================================================================

const DESCRIPTION_TEMPLATES: Record<EntityCategory, string> = {
  character: `## Core Identity
Role, age, biography...

## Physical Appearance
General appearance, perceived age, attire, distinguishing features...

## Voice
Voice description (e.g., "A deep, weary baritone"), pitch, timbre, pacing...

## Demographics & History
Gender, cultural background, family structure, formative experiences...

## Psychology
Big Five traits (Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism), values, worldview, cognitive style...

## Emotional Profile
Overall emotional intelligence, general mood, key triggers, fears/phobias, coping mechanisms...

## Deep Beliefs
Beliefs about the world, about self, about others...

## Long-Term Goals
Life ambitions, career aspirations, driving motivations...

## Relationships
Key relationships, dynamics, rivalries, alliances...
`,

  location: `## Physical Description
Architecture, dimensions, terrain, flora/fauna, permanent features...

## Atmosphere
Default lighting, ambient sounds, mood, sensory baseline...

## History & Lore
Origin, significant past events, legends, narrative importance...

## Connections
Entry/exit points, neighboring locations, locked/hidden paths...

## Ownership & Access
Who controls this place, access rights, public or restricted...

## Plot Hooks
Potential quests, mysteries, or story events tied to this location...
`,

  object: `## Physical Description
Appearance, material, texture, weight, dimensions, craftsmanship...

## Properties
Durability, equippable (slot?), container (capacity?), damage/armor value...

## Use & Effects
What happens when used, activated, or consumed; required skills...

## History & Lore
Origin, previous owners, significance, legends...

## Plot Hooks
Quests or events triggered by finding or using this object...

## Tags
Searchable keywords (e.g., magical, heavy, sharp, consumable)...
`,

  concept: `## Concept Type
Faction, Rule, Effect, World Setting, World Event...

## Description
Foundational explanation, scale/influence level...

## Lore & Ideology
Core beliefs, goals, values, historical timeline, hierarchy...

## Mechanics & Logic
Trigger conditions, severity levels, duration, effects on stats, counters/mitigation...

## Meta & Tone
Genre, themes, mood keywords, writing style notes, inspirations...

## Relationships
Allied/rival/enemy factions, affected characters/locations...
`,
};

// =============================================================================
// CATEGORY CONFIGURATION
// =============================================================================

interface CategoryConfig {
  singularLabel: string;
  pluralLabel: string;
  icon: LucideIcon;
  summaryPlaceholder: string;
  emptyStateMessage: string;
  linkedField: 'linkedCharacters' | 'linkedLocations' | 'linkedObjects' | 'linkedConcepts';
  /** Whether this category supports a reference voice clip */
  hasVoice: boolean;
}

const CATEGORY_CONFIG: Record<EntityCategory, CategoryConfig> = {
  character: {
    singularLabel: 'Character',
    pluralLabel: 'Characters',
    icon: Users,
    summaryPlaceholder:
      'Brief 100-200 word summary: how they look, what drives them, their role in the story, key traits, stereotype...',
    emptyStateMessage:
      'No characters defined yet. Add your first character to start building your cast.',
    linkedField: 'linkedCharacters',
    hasVoice: true,
  },
  location: {
    singularLabel: 'Location',
    pluralLabel: 'Locations',
    icon: MapPin,
    summaryPlaceholder:
      'Brief 100-200 word summary: what makes this place unique, its feel, key features, who goes there...',
    emptyStateMessage:
      'No locations defined yet. Add your first location to build your world.',
    linkedField: 'linkedLocations',
    hasVoice: false,
  },
  object: {
    singularLabel: 'Object',
    pluralLabel: 'Objects',
    icon: Package,
    summaryPlaceholder:
      'Brief 100-200 word summary: what it is, what it does, why it matters...',
    emptyStateMessage:
      'No objects defined yet. Add your first object to enrich your story.',
    linkedField: 'linkedObjects',
    hasVoice: false,
  },
  concept: {
    singularLabel: 'Game Concept',
    pluralLabel: 'Game Concepts',
    icon: Lightbulb,
    summaryPlaceholder:
      'Brief 100-200 word summary: the core idea, key rules, how it affects gameplay or story...',
    emptyStateMessage:
      'No concepts defined yet. Add magic systems, factions, political parties, rules, or lore here.',
    linkedField: 'linkedConcepts',
    hasVoice: false,
  },
};

// =============================================================================
// STATE CHANGE HISTORY SUB-COMPONENT
// =============================================================================

/**
 * Displays a temporal log of all state changes for an entity.
 * Each entry shows: step number → scene name → player action → list of changes.
 * Important changes (magical effects, deep shifts) are shown in full detail;
 * minor ones are brief. All entries are in chronological order.
 */
function StateChangeHistory({
  stateHistory,
  projectNodes,
}: {
  stateHistory: EntityStateChangeEvent[];
  projectNodes: Array<{ id: string; label?: string }>;
}) {
  const [expanded, setExpanded] = useState(true);

  // Look up scene label from project nodes (fallback to stored label or ID)
  const getSceneLabel = (event: EntityStateChangeEvent): string => {
    if (event.sceneLabel) return event.sceneLabel;
    const node = projectNodes.find(n => n.id === event.sceneId);
    return node?.label || event.sceneId;
  };

  return (
    <div>
      <button
        className="input-label flex items-center gap-2 cursor-pointer hover:text-accent transition-colors w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <History size={14} />
        State Change History ({stateHistory.length} event{stateHistory.length !== 1 ? 's' : ''})
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {stateHistory.map((event, index) => {
            const sceneLabel = getSceneLabel(event);
            const timeStr = event.timestamp
              ? new Date(event.timestamp).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })
              : undefined;

            return (
              <div
                key={`${event.sceneId}-${index}`}
                className="bg-editor-bg border border-editor-border rounded-lg p-3"
              >
                {/* Header: step number + scene name + timestamp */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded min-w-[2.5em] text-center">
                    #{index + 1}
                  </span>
                  <span className="text-sm font-medium text-editor-text truncate flex-1" title={sceneLabel}>
                    {sceneLabel}
                  </span>
                  {timeStr && (
                    <span className="text-[10px] text-editor-muted flex-shrink-0">
                      {timeStr}
                    </span>
                  )}
                </div>

                {/* Player action (if any) */}
                {event.playerAction && (
                  <div className="text-xs text-purple-400/80 mb-1.5 pl-1">
                    Player: "{event.playerAction}"
                  </div>
                )}

                {/* Scene summary */}
                <div className="text-xs text-editor-muted mb-2 pl-1 italic">
                  {event.sceneSummary}
                </div>

                {/* State changes — displayed in full detail */}
                <div className="space-y-1 pl-1">
                  {event.stateChanges.map((change, ci) => (
                    <div
                      key={ci}
                      className="text-xs text-editor-text flex gap-1.5"
                    >
                      <span className="text-accent/60 flex-shrink-0">→</span>
                      <span>{change}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

interface EntityManagerProps {
  isOpen: boolean;
  onClose: () => void;
  category: EntityCategory;
}

export default function EntityManager({ isOpen, onClose, category }: EntityManagerProps) {
  // Use targeted selectors to avoid re-rendering on unrelated store changes
  const addEntity = useProjectStore(s => s.addEntity);
  const updateEntity = useProjectStore(s => s.updateEntity);
  const deleteEntity = useProjectStore(s => s.deleteEntity);
  const getEntitiesByCategory = useProjectStore(s => s.getEntitiesByCategory);
  const currentProject = useProjectStore(s => s.currentProject);

  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Entity | null>(null);

  /** State for image generation overlay */
  const [imageGenOpen, setImageGenOpen] = useState(false);
  /** State for asset picker (images) */
  const [imageAssetPickerOpen, setImageAssetPickerOpen] = useState(false);
  /** State for TTS generation overlay (voice) */
  const [ttsGenOpen, setTtsGenOpen] = useState(false);
  /** State for asset picker (voice) */
  const [voiceAssetPickerOpen, setVoiceAssetPickerOpen] = useState(false);

  const entities = useMemo(() => getEntitiesByCategory(category), [
    getEntitiesByCategory,
    category,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    currentProject?.entities,
  ]);

  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entities;
    const q = searchQuery.toLowerCase();
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
    );
  }, [entities, searchQuery]);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === selectedEntityId) || null,
    [entities, selectedEntityId]
  );

  const assetNames = currentProject?.assetNames || {};

  // BFS depth from start node
  const nodeDepths = useMemo(() => {
    if (!currentProject) return new Map<string, number>();
    return computeNodeDepths(
      currentProject.nodes,
      currentProject.edges,
      currentProject.settings.startNodeId
    );
  }, [currentProject]);

  // Scenes linked to the selected entity, sorted by depth
  const linkedScenes = useMemo(() => {
    if (!selectedEntity || !currentProject) return [];
    const field = config.linkedField;
    return currentProject.nodes
      .filter((node) => {
        if (node.type !== 'scene') return false;
        const sceneData = (node as SceneNode).data;
        const linkedIds = sceneData[field] as string[] | undefined;
        return linkedIds?.includes(selectedEntity.id) ?? false;
      })
      .map((node) => ({
        id: node.id,
        name: node.label || 'Unnamed Scene',
        depth: nodeDepths.get(node.id) ?? Infinity,
      }))
      .sort((a, b) => a.depth - b.depth);
  }, [selectedEntity, currentProject, config.linkedField, nodeDepths]);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleAddEntity = () => {
    const now = Date.now();
    let counter = entities.length + 1;
    let defaultName = `${config.singularLabel} ${counter}`;
    const existingNames = new Set(entities.map((e) => e.name.toLowerCase()));
    while (existingNames.has(defaultName.toLowerCase())) {
      counter++;
      defaultName = `${config.singularLabel} ${counter}`;
    }

    const newEntity: Entity = {
      id: generateId('entity'),
      category,
      name: defaultName,
      description: DESCRIPTION_TEMPLATES[category],
      createdAt: now,
      updatedAt: now,
    };

    addEntity(newEntity);
    setSelectedEntityId(newEntity.id);
    setSearchQuery('');
  };

  const handleUpdateField = (updates: Partial<Entity>) => {
    if (selectedEntity) {
      updateEntity(selectedEntity.id, updates);
    }
  };

  const handleReferenceImageChange = (_file: File | null, url: string | null) => {
    handleUpdateField({ referenceImage: url || undefined });
  };

  const handleReferenceVoiceChange = (_file: File | null, url: string | null) => {
    handleUpdateField({ referenceVoice: url || undefined });
  };

  const handleDefaultMusicChange = (_file: File | null, url: string | null) => {
    handleUpdateField({ defaultMusic: url || undefined });
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      if (selectedEntityId === deleteTarget.id) {
        setSelectedEntityId(null);
      }
      deleteEntity(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const summaryWordCount = useMemo(() => {
    if (!selectedEntity?.summary) return 0;
    return selectedEntity.summary.trim().split(/\s+/).filter(Boolean).length;
  }, [selectedEntity?.summary]);

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`${config.pluralLabel} Manager`}
        size="nearfull"
      >
        <div className="flex h-[78vh] min-h-[500px]">
          {/* ============== LEFT PANEL: Entity List (fixed width) ============== */}
          <div className="w-60 flex-shrink-0 border-r border-editor-border flex flex-col">
            {/* Search bar */}
            <div className="p-3 border-b border-editor-border">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-editor-muted"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search...`}
                  className="input pl-8 text-sm"
                />
              </div>
            </div>

            {/* Entity list */}
            <div className="flex-1 overflow-y-auto">
              {filteredEntities.length === 0 ? (
                <div className="p-4 text-center text-sm text-editor-muted">
                  {searchQuery
                    ? `No matches for "${searchQuery}"`
                    : config.emptyStateMessage}
                </div>
              ) : (
                <div className="py-1">
                  {filteredEntities.map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => setSelectedEntityId(entity.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        entity.id === selectedEntityId
                          ? 'bg-accent/20 text-accent border-l-2 border-accent'
                          : 'text-editor-text hover:bg-editor-bg border-l-2 border-transparent'
                      }`}
                    >
                      <Icon size={14} className="flex-shrink-0 opacity-60" />
                      <span className="truncate">{entity.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Add button */}
            <div className="p-3 border-t border-editor-border">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus size={16} />}
                onClick={handleAddEntity}
                fullWidth
              >
                Add {config.singularLabel}
              </Button>
            </div>
          </div>

          {/* ============== RIGHT PANEL: Entity Detail ============== */}
          <div className="flex-1 overflow-y-auto">
            {selectedEntity ? (
              <div className="p-6 space-y-5">
                {/* 1. NAME */}
                <div>
                  <label className="input-label">Name</label>
                  <input
                    type="text"
                    value={selectedEntity.name}
                    onChange={(e) => handleUpdateField({ name: e.target.value })}
                    className="input text-lg font-semibold"
                    placeholder={`${config.singularLabel} name`}
                  />
                </div>

                {/* 2. MEDIA — Reference Image, Voice (characters only), Music */}
                <div className={`grid gap-5 ${config.hasVoice ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {/* Reference Image */}
                  <div>
                    <MediaUploader
                      type="image"
                      label="Reference Image"
                      value={selectedEntity.referenceImage}
                      onChange={handleReferenceImageChange}
                      placeholder="Upload visual reference"
                      assetName={
                        selectedEntity.referenceImage
                          ? assetNames[getAssetFingerprint(selectedEntity.referenceImage)] || undefined
                          : undefined
                      }
                    />
                    {/* Generate Image + Select from Assets buttons */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button
                        onClick={() => setImageGenOpen(true)}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-accent/10 border border-accent/30 hover:bg-accent/20 transition-colors text-accent"
                      >
                        <Sparkles size={10} />
                        Generate
                      </button>
                      <button
                        onClick={() => setImageAssetPickerOpen(true)}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
                      >
                        <FolderOpen size={10} />
                        Assets
                      </button>
                    </div>
                  </div>

                  {/* Reference Voice (characters only) */}
                  {config.hasVoice && (
                    <div>
                      <MediaUploader
                        type="audio"
                        label="Reference Voice"
                        value={selectedEntity.referenceVoice}
                        onChange={handleReferenceVoiceChange}
                        placeholder="Upload voice sample"
                        assetName={
                          selectedEntity.referenceVoice
                            ? assetNames[getAssetFingerprint(selectedEntity.referenceVoice)] || undefined
                            : undefined
                        }
                      />
                      <p className="text-xs text-editor-muted mt-1">
                        Voice identity clip for TTS reference.
                      </p>
                      {/* Generate Voice + Select from Assets buttons */}
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <button
                          onClick={() => setTtsGenOpen(true)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 transition-colors text-teal-400"
                        >
                          <Volume2 size={10} />
                          Generate
                        </button>
                        <button
                          onClick={() => setVoiceAssetPickerOpen(true)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
                        >
                          <FolderOpen size={10} />
                          Assets
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Default Music */}
                  <div>
                    <MediaUploader
                      type="audio"
                      label="Default Music"
                      value={selectedEntity.defaultMusic}
                      onChange={handleDefaultMusicChange}
                      placeholder="Upload default music"
                      assetName={
                        selectedEntity.defaultMusic
                          ? assetNames[getAssetFingerprint(selectedEntity.defaultMusic)] || undefined
                          : undefined
                      }
                    />
                    <p className="text-xs text-editor-muted mt-1">
                      Auto-plays when encountered, unless overridden.
                    </p>
                    {selectedEntity.defaultMusic && (
                      <div className="flex gap-4 mt-2">
                        <div className="flex-1">
                          <label className="input-label text-xs">Fade In (ms)</label>
                          <input
                            type="number"
                            value={selectedEntity.musicFadeIn ?? 1000}
                            onChange={(e) =>
                              handleUpdateField({
                                musicFadeIn: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="input text-sm"
                            min={0}
                            step={100}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="input-label text-xs">Fade Out (ms)</label>
                          <input
                            type="number"
                            value={selectedEntity.musicFadeOut ?? 1000}
                            onChange={(e) =>
                              handleUpdateField({
                                musicFadeOut: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="input text-sm"
                            min={0}
                            step={100}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. SUMMARY */}
                <div>
                  <label className="input-label">
                    Summary
                    <span className="ml-2 text-xs font-normal text-editor-muted">
                      ({summaryWordCount} / 200 words)
                    </span>
                  </label>
                  <textarea
                    value={selectedEntity.summary || ''}
                    onChange={(e) => handleUpdateField({ summary: e.target.value })}
                    className="input min-h-[100px] resize-y text-sm leading-relaxed"
                    placeholder={config.summaryPlaceholder}
                  />
                  <p className="text-xs text-editor-muted mt-1">
                    A brief essence — useful as a quick reference when not directly in focus.
                  </p>
                </div>

                {/* 4. PROFILE — Structured data displayed as formatted card */}
                <div>
                  <label className="input-label">Profile</label>
                  <ProfileViewer
                    profile={selectedEntity.profile}
                    onProfileChange={(newProfile) => handleUpdateField({ profile: newProfile } as any)}
                  />
                </div>

                {/* 4b. STATE CHANGE HISTORY — temporal log of all AI-driven state changes */}
                {selectedEntity.stateHistory && selectedEntity.stateHistory.length > 0 && (
                  <StateChangeHistory
                    stateHistory={selectedEntity.stateHistory}
                    projectNodes={currentProject?.nodes || []}
                  />
                )}

                {/* 5. DESCRIPTION — with schema-inspired heading template */}
                <div>
                  <label className="input-label">Description</label>
                  <textarea
                    value={selectedEntity.description}
                    onChange={(e) => handleUpdateField({ description: e.target.value })}
                    className="input min-h-[300px] resize-y text-sm leading-relaxed font-mono"
                    placeholder="Full detailed description..."
                  />
                  <p className="text-xs text-editor-muted mt-1">
                    Use the heading templates as a guide — fill in, remove, or add sections as needed.
                  </p>
                </div>

                {/* 6. SCENE APPEARANCES */}
                <div>
                  <label className="input-label flex items-center gap-2">
                    <Film size={14} />
                    Appears in Scenes ({linkedScenes.length})
                  </label>
                  {linkedScenes.length === 0 ? (
                    <div className="bg-editor-bg rounded-lg p-3 text-sm text-editor-muted">
                      Not linked to any scenes yet. Open a scene's inspector → "World" tab to add.
                    </div>
                  ) : (
                    <div className="bg-editor-bg rounded-lg p-3 flex flex-wrap gap-2">
                      {linkedScenes.map((scene) => (
                        <span
                          key={scene.id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-editor-surface border border-editor-border rounded text-xs text-editor-text"
                          title={scene.depth === Infinity ? 'Unreachable from start' : `${scene.depth} step${scene.depth !== 1 ? 's' : ''} from start`}
                        >
                          <span className="text-[10px] font-mono text-editor-muted min-w-[1.2em] text-center">
                            {scene.depth === Infinity ? '?' : scene.depth}
                          </span>
                          <Film size={10} className="opacity-50" />
                          {scene.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 7. DELETE */}
                <div className="pt-4 border-t border-editor-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 size={16} />}
                    onClick={() => setDeleteTarget(selectedEntity)}
                    className="text-error hover:bg-error/10"
                  >
                    Delete {config.singularLabel}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-editor-muted">
                <div className="text-center space-y-3">
                  <Icon size={48} className="mx-auto opacity-30" />
                  <p className="text-sm">
                    {entities.length === 0
                      ? config.emptyStateMessage
                      : `Select a ${config.singularLabel.toLowerCase()} from the list to view and edit its details.`}
                  </p>
                  {entities.length === 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Plus size={16} />}
                      onClick={handleAddEntity}
                    >
                      Add Your First {config.singularLabel}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete ${config.singularLabel}`}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

      {/* Image Generation Overlay for reference image */}
      <ImageGenerationOverlay
        isOpen={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onImageGenerated={(dataUrl) => {
          if (selectedEntity) {
            handleUpdateField({ referenceImage: dataUrl });
          }
        }}
        initialPrompt={selectedEntity ? `${config.singularLabel} reference portrait: ${selectedEntity.name}. ${selectedEntity.summary || ''}`.trim() : ''}
        title={selectedEntity ? `Generate Image — ${selectedEntity.name}` : 'Generate Image'}
      />

      {/* Asset Picker for reference image */}
      <AssetPicker
        isOpen={imageAssetPickerOpen}
        onClose={() => setImageAssetPickerOpen(false)}
        onSelect={(url) => {
          if (selectedEntity) {
            handleUpdateField({ referenceImage: url });
          }
          setImageAssetPickerOpen(false);
        }}
        filterType="image"
        title={selectedEntity ? `Select Image — ${selectedEntity.name}` : 'Select Image'}
      />

      {/* TTS Generation Overlay for reference voice (characters only) */}
      {config.hasVoice && (
        <TTSGenerationOverlay
          isOpen={ttsGenOpen}
          onClose={() => setTtsGenOpen(false)}
          onAudioGenerated={(dataUrl) => {
            if (selectedEntity) {
              handleUpdateField({ referenceVoice: dataUrl });
            }
          }}
          initialText={selectedEntity ? `Hello, my name is ${selectedEntity.name}.` : ''}
          title={selectedEntity ? `Generate Voice — ${selectedEntity.name}` : 'Generate Voice'}
        />
      )}

      {/* Asset Picker for reference voice (characters only) */}
      {config.hasVoice && (
        <AssetPicker
          isOpen={voiceAssetPickerOpen}
          onClose={() => setVoiceAssetPickerOpen(false)}
          onSelect={(url) => {
            if (selectedEntity) {
              handleUpdateField({ referenceVoice: url });
            }
            setVoiceAssetPickerOpen(false);
          }}
          filterType="audio"
          title={selectedEntity ? `Select Voice — ${selectedEntity.name}` : 'Select Voice'}
        />
      )}
    </>
  );
}
