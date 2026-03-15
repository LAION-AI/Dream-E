/**
 * =============================================================================
 * SCENE INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for Scene Nodes with three tabs:
 * - Media: Background image, music, voiceover
 * - Content: Speaker name, story text
 * - Outputs: Choice buttons with conditions
 *
 * =============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  Image as ImageIcon,
  Music,
  Mic,
  Plus,
  Trash2,
  GripVertical,
  Lock,
  ChevronDown,
  ChevronRight,
  Users,
  MapPin,
  Package,
  Lightbulb,
  X,
  Play,
  SkipForward,
  Brain,
  Loader2,
  Flag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SceneNode, SceneChoice, EntityCategory, Entity } from '@/types';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectStore } from '@stores/useProjectStore';
import { usePlayerStore } from '@stores/usePlayerStore';
import { Tabs, TabPanel, Button, Modal } from '@components/common';
import { generateId } from '@/utils/idGenerator';
import { getAssetFingerprint } from '@/utils/assetFingerprint';
import MediaUploader from './MediaUploader';
import SceneEntityOverlay from './SceneEntityOverlay';
import { useImageGenStore } from '@stores/useImageGenStore';

/**
 * SCENE INSPECTOR PROPS
 */
interface SceneInspectorProps {
  node: SceneNode;
}

/**
 * SCENE INSPECTOR COMPONENT
 */
export default function SceneInspector({ node }: SceneInspectorProps) {
  // Use targeted selectors to avoid re-rendering on unrelated store changes
  const updateNode = useProjectStore(s => s.updateNode);
  const saveProject = useProjectStore(s => s.saveProject);
  const currentProject = useProjectStore(s => s.currentProject);
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState('media');
  const [openWorldEnabled, setOpenWorldEnabled] = useState(false);
  const [showAiResponse, setShowAiResponse] = useState(false);
  const [aiResponseText, setAiResponseText] = useState('');
  const [ttsGenerating, setTtsGenerating] = useState(false);

  /**
   * Generate voiceover from the scene's story text using Gemini TTS.
   * Shows spinner while generating, then saves the audio to the node.
   */
  const handleGenerateVoiceover = async () => {
    const text = node.data.storyText?.trim();
    if (!text || text.length < 5) return;

    const settings = useImageGenStore.getState();
    if (!settings.googleApiKey) {
      alert('No Google API key configured. Set it in AI Settings.');
      return;
    }

    setTtsGenerating(true);
    try {
      const res = await fetch('/api/generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          googleApiKey: settings.googleApiKey,
          model: settings.tts.model || 'gemini-2.5-flash-preview-tts',
          voiceName: settings.tts.voice || 'Zephyr',
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.dataUrl) {
        updateData({ voiceoverAudio: data.dataUrl, voiceoverAutoplay: true });
      }
    } catch (err) {
      console.error('[SceneInspector] TTS generation failed:', err);
      alert(`Voiceover generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTtsGenerating(false);
    }
  };

  // Check if an autosave exists for the "Continue from here" button
  const hasAutosave = usePlayerStore((s) =>
    s.saveSlots.some((slot) => slot.id === 0 && slot.gameState.projectId === currentProject?.id)
  );

  // Look up user-assigned asset names for this node's media
  const assetNames = currentProject?.assetNames || {};
  const bgImageName = node.data.backgroundImage
    ? assetNames[getAssetFingerprint(node.data.backgroundImage)] || undefined
    : undefined;
  const bgMusicName = node.data.backgroundMusic
    ? assetNames[getAssetFingerprint(node.data.backgroundMusic)] || undefined
    : undefined;
  const voiceoverName = node.data.voiceoverAudio
    ? assetNames[getAssetFingerprint(node.data.voiceoverAudio)] || undefined
    : undefined;

  /**
   * Update node data helper
   */
  const updateData = (updates: Partial<SceneNode['data']>) => {
    updateNode(node.id, {
      data: { ...node.data, ...updates },
    });
  };

  /**
   * Update node label
   */
  const updateLabel = (label: string) => {
    updateNode(node.id, { label });
  };

  /**
   * Handle background image change
   */
  const handleBackgroundChange = (file: File | null, url: string | null) => {
    updateData({ backgroundImage: url || undefined });
  };

  /**
   * Handle background music change
   */
  const handleMusicChange = (file: File | null, url: string | null) => {
    updateData({ backgroundMusic: url || undefined });
  };

  /**
   * Handle voiceover change
   */
  const handleVoiceoverChange = (file: File | null, url: string | null) => {
    updateData({ voiceoverAudio: url || undefined });
  };

  /**
   * Add a new choice
   */
  const addChoice = () => {
    const newChoice: SceneChoice = {
      id: generateId('choice'),
      label: 'New Choice',
    };
    updateData({
      choices: [...node.data.choices, newChoice],
    });
  };

  /**
   * Update a choice
   */
  const updateChoice = (choiceId: string, updates: Partial<SceneChoice>) => {
    const choices = node.data.choices.map((c) =>
      c.id === choiceId ? { ...c, ...updates } : c
    );
    updateData({ choices });
  };

  /**
   * Delete a choice
   */
  const deleteChoice = (choiceId: string) => {
    const choices = node.data.choices.filter((c) => c.id !== choiceId);
    updateData({ choices });
  };

  // Tab definitions
  const tabs = [
    { id: 'media', label: 'Media' },
    { id: 'content', label: 'Content' },
    { id: 'outputs', label: 'Outputs' },
    { id: 'world', label: 'World' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Node label */}
      <div className="px-4 py-3 border-b border-editor-border">
        <label className="input-label">Node Label</label>
        <input
          type="text"
          value={node.label}
          onChange={(e) => updateLabel(e.target.value)}
          className="input"
          placeholder="Scene name"
        />
      </div>

      {/* Start Node indicator + Set as Start button */}
      <div className="px-4 py-2 border-b border-editor-border">
        {currentProject?.settings?.startNodeId === node.id ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <span className="text-green-400 font-medium">Start Node</span>
            <span className="text-editor-muted text-xs">(game begins here)</span>
          </div>
        ) : (
          <button
            className="flex items-center gap-2 text-sm text-editor-muted hover:text-green-400 transition-colors"
            onClick={() => {
              useProjectStore.setState((state) => {
                if (state.currentProject) {
                  state.currentProject.settings.startNodeId = node.id;
                }
              });
            }}
            title="Set this scene as the starting point of the game"
          >
            <Flag size={14} />
            <span>Set as Start Node</span>
          </button>
        )}
      </div>

      {/* Play from here buttons */}
      <div className="px-4 py-3 border-b border-editor-border space-y-2">
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Play size={14} />}
            className="flex-1"
            onClick={async () => {
              await saveProject();
              const ow = openWorldEnabled ? '&openWorld=1' : '';
              navigate(`/play/${projectId}?startNode=${node.id}&mode=fresh${ow}`);
            }}
          >
            Start Here
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<SkipForward size={14} />}
            className="flex-1"
            disabled={!hasAutosave}
            title={hasAutosave ? 'Jump to this scene with your saved variable state' : 'No autosave available — play the game first'}
            onClick={async () => {
              await saveProject();
              const ow = openWorldEnabled ? '&openWorld=1' : '';
              navigate(`/play/${projectId}?startNode=${node.id}&mode=continue${ow}`);
            }}
          >
            Continue Here
          </Button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-editor-muted hover:text-editor-text transition-colors">
          <input
            type="checkbox"
            checked={openWorldEnabled}
            onChange={(e) => setOpenWorldEnabled(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-editor-border accent-purple-500"
          />
          <span>Open World Mode</span>
          <span className="text-xs text-editor-muted/60">(free-form actions)</span>
        </label>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          variant="underline"
          size="sm"
          fullWidth
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* ==================== MEDIA TAB ==================== */}
        <TabPanel id="media" activeTab={activeTab}>
          <div className="space-y-6">
            {/* Background Image */}
            <MediaUploader
              type="image"
              label="Background Image"
              value={node.data.backgroundImage}
              onChange={handleBackgroundChange}
              placeholder="Click to upload background image"
              assetName={bgImageName}
            />

            {/* Background Music */}
            <div>
              <MediaUploader
                type="audio"
                label="Background Music"
                value={node.data.backgroundMusic}
                onChange={handleMusicChange}
                placeholder="Click to upload background music"
                assetName={bgMusicName}
              />
              <label className="flex items-center gap-2 mt-2 text-sm text-editor-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.data.musicKeepPlaying}
                  onChange={(e) => updateData({ musicKeepPlaying: e.target.checked })}
                  className="rounded border-editor-border bg-editor-surface"
                />
                Keep playing in next scene
              </label>
            </div>

            {/* Voiceover */}
            <div>
              <MediaUploader
                type="audio"
                label="Voiceover Audio"
                value={node.data.voiceoverAudio}
                onChange={handleVoiceoverChange}
                placeholder="Click to upload voiceover"
                assetName={voiceoverName}
              />
              {/* Generate Voiceover button — uses Gemini TTS */}
              {node.data.voiceoverAudio ? (
                <p className="text-xs text-editor-muted mt-2">
                  Voiceover attached. Remove it first to generate a new one.
                </p>
              ) : (
                <button
                  onClick={handleGenerateVoiceover}
                  disabled={ttsGenerating || !node.data.storyText?.trim()}
                  className="flex items-center gap-2 mt-2 px-3 py-1.5 text-sm rounded
                    bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {ttsGenerating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Mic size={14} />
                      Generate Voiceover
                    </>
                  )}
                </button>
              )}
              <label className="flex items-center gap-2 mt-2 text-sm text-editor-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={node.data.voiceoverAutoplay}
                  onChange={(e) => updateData({ voiceoverAutoplay: e.target.checked })}
                  className="rounded border-editor-border bg-editor-surface"
                />
                Auto-play on enter
              </label>
            </div>
          </div>
        </TabPanel>

        {/* ==================== CONTENT TAB ==================== */}
        <TabPanel id="content" activeTab={activeTab}>
          <div className="space-y-4">
            {/* Speaker Name */}
            <div>
              <label className="input-label">Speaker Name (Optional)</label>
              <input
                type="text"
                value={node.data.speakerName || ''}
                onChange={(e) => updateData({ speakerName: e.target.value })}
                className="input"
                placeholder="e.g., Narrator, Guard, ???"
              />
              <p className="text-xs text-editor-muted mt-1">
                Who is speaking? Leave empty for narration.
              </p>
            </div>

            {/* Story Text */}
            <div>
              <label className="input-label">Story Text</label>
              <textarea
                value={node.data.storyText}
                onChange={(e) => updateData({ storyText: e.target.value })}
                className="input min-h-[200px] resize-y"
                placeholder="Enter the story text that will be displayed to the player..."
              />
              <p className="text-xs text-editor-muted mt-1">
                This is what the player will read. Be descriptive!
              </p>
              <p className="text-xs text-editor-muted mt-1">
                <strong>Tip:</strong> Use <code className="bg-editor-bg px-1 rounded">{'{{variableName}}'}</code> to
                insert variable values (e.g., <code className="bg-editor-bg px-1 rounded">{'{{PlayerName}}'}</code>).
              </p>
            </div>

            {/* View AI Response — only shows for OW-generated scenes */}
            {(node.data as any).aiResponse && (
              <div className="pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Brain size={14} />}
                  onClick={() => {
                    try {
                      const parsed = JSON.parse((node.data as any).aiResponse);
                      setAiResponseText(JSON.stringify(parsed, null, 2));
                    } catch {
                      setAiResponseText((node.data as any).aiResponse);
                    }
                    setShowAiResponse(true);
                  }}
                  fullWidth
                >
                  View AI Response
                </Button>
              </div>
            )}

            {/* AI Response Modal */}
            <Modal
              isOpen={showAiResponse}
              onClose={() => setShowAiResponse(false)}
              title="AI Model Response"
              size="nearfull"
            >
              <div className="flex flex-col gap-3">
                <p className="text-xs text-editor-muted">
                  Complete JSON from the scene-writing model. Editable — changes are saved to the scene node.
                </p>
                <textarea
                  className="w-full font-mono text-xs bg-editor-bg text-editor-text p-3 rounded-lg border border-editor-border resize-y focus:outline-none focus:border-blue-500/50"
                  style={{ minHeight: '50vh' }}
                  value={aiResponseText}
                  onChange={(e) => setAiResponseText(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAiResponse(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      updateData({ aiResponse: aiResponseText } as any);
                      setShowAiResponse(false);
                    }}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </Modal>
          </div>
        </TabPanel>

        {/* ==================== OUTPUTS TAB ==================== */}
        <TabPanel id="outputs" activeTab={activeTab}>
          <div className="space-y-3">
            {/* Help text */}
            <div className="bg-editor-bg rounded-lg p-3 text-sm text-editor-muted">
              <p className="font-medium text-editor-text mb-1">💡 How Choices Work</p>
              <p>Each choice creates a connection point (blue dot) on the node.
              Drag from the dot to another node to connect them.</p>
            </div>

            {/* Add button */}
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={16} />}
              onClick={addChoice}
              fullWidth
            >
              Add Choice
            </Button>

            {/* Choices list */}
            {node.data.choices.length === 0 ? (
              <div className="text-center py-6 text-editor-muted">
                <p className="mb-2">No choices yet.</p>
                <p className="text-sm">Add choices to create branching paths in your story.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {node.data.choices.map((choice, index) => (
                  <ChoiceEditor
                    key={choice.id}
                    choice={choice}
                    index={index}
                    onUpdate={(updates) => updateChoice(choice.id, updates)}
                    onDelete={() => deleteChoice(choice.id)}
                  />
                ))}
              </div>
            )}

            {/* Tip about connecting */}
            {node.data.choices.length > 0 && (
              <div className="bg-editor-surface rounded-lg p-3 text-xs text-editor-muted border border-editor-border">
                <p><strong>Tip:</strong> Each choice above creates a blue dot on the right side of the node.
                Click and drag from that dot to another node's top dot to connect them.</p>
              </div>
            )}
          </div>
        </TabPanel>

        {/* ==================== WORLD TAB ==================== */}
        <TabPanel id="world" activeTab={activeTab}>
          <div className="space-y-4">
            <div className="bg-editor-bg rounded-lg p-3 text-sm text-editor-muted">
              <p className="font-medium text-editor-text mb-1">Link entities to this scene</p>
              <p>Tag characters, locations, objects, and concepts that appear in or are relevant to this scene — even if only mentioned indirectly.</p>
            </div>

            <EntityLinker
              category="character"
              icon={Users}
              label="Characters"
              linkedIds={node.data.linkedCharacters || []}
              onUpdate={(ids) => updateData({ linkedCharacters: ids })}
              nodeId={node.id}
              entityStates={node.data.entityStates || {}}
            />
            <EntityLinker
              category="location"
              icon={MapPin}
              label="Locations"
              linkedIds={node.data.linkedLocations || []}
              onUpdate={(ids) => updateData({ linkedLocations: ids })}
              nodeId={node.id}
              entityStates={node.data.entityStates || {}}
            />
            <EntityLinker
              category="object"
              icon={Package}
              label="Objects"
              linkedIds={node.data.linkedObjects || []}
              onUpdate={(ids) => updateData({ linkedObjects: ids })}
              nodeId={node.id}
              entityStates={node.data.entityStates || {}}
            />
            <EntityLinker
              category="concept"
              icon={Lightbulb}
              label="Concepts"
              linkedIds={node.data.linkedConcepts || []}
              onUpdate={(ids) => updateData({ linkedConcepts: ids })}
              nodeId={node.id}
              entityStates={node.data.entityStates || {}}
            />
          </div>
        </TabPanel>
      </div>
    </div>
  );
}

// =============================================================================
// ENTITY LINKER SUB-COMPONENT
// =============================================================================

/**
 * A small widget that lets the user pick entities of a specific category
 * to associate with the current scene. Shows linked entities as removable
 * chips, and a dropdown to add more.
 */
interface EntityLinkerProps {
  category: EntityCategory;
  icon: LucideIcon;
  label: string;
  linkedIds: string[];
  onUpdate: (ids: string[]) => void;
  /** The scene node ID — needed for per-scene entity state */
  nodeId: string;
  /** The scene's entityStates map (entity ID → situational text) */
  entityStates: Record<string, string>;
}

function EntityLinker({ category, icon: Icon, label, linkedIds, onUpdate, nodeId, entityStates }: EntityLinkerProps) {
  const getEntitiesByCategory = useProjectStore(s => s.getEntitiesByCategory);
  const [isAdding, setIsAdding] = useState(false);
  const [overlayEntityId, setOverlayEntityId] = useState<string | null>(null);

  // All entities of this category
  const allEntities = useMemo(
    () => getEntitiesByCategory(category),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getEntitiesByCategory, category, useProjectStore.getState().currentProject?.entities]
  );

  // Entities already linked
  const linkedEntities = useMemo(
    () => allEntities.filter((e) => linkedIds.includes(e.id)),
    [allEntities, linkedIds]
  );

  // Entities available to add (not yet linked)
  const availableEntities = useMemo(
    () => allEntities.filter((e) => !linkedIds.includes(e.id)),
    [allEntities, linkedIds]
  );

  const handleAdd = (entityId: string) => {
    onUpdate([...linkedIds, entityId]);
    // Keep dropdown open if there are more to add
    if (availableEntities.length <= 1) setIsAdding(false);
  };

  const handleRemove = (entityId: string) => {
    onUpdate(linkedIds.filter((id) => id !== entityId));
  };

  return (
    <div className="border border-editor-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-editor-surface">
        <div className="flex items-center gap-2 text-sm font-medium text-editor-text">
          <Icon size={14} />
          {label}
          {linkedIds.length > 0 && (
            <span className="text-xs text-editor-muted">({linkedIds.length})</span>
          )}
        </div>
        {availableEntities.length > 0 && (
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="p-1 rounded hover:bg-editor-bg text-accent"
            title={`Add ${label.toLowerCase()}`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Linked entity chips */}
      {linkedEntities.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1.5">
          {linkedEntities.map((entity) => (
            <span
              key={entity.id}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-accent/15 text-accent text-xs rounded-full"
            >
              {/* Amber dot if entity has situational attributes for this scene */}
              {entityStates[entity.id] && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Has situational attributes" />
              )}
              {/* Clickable entity name → opens situational overlay */}
              <button
                onClick={() => setOverlayEntityId(entity.id)}
                className="hover:underline cursor-pointer"
                title={`View ${entity.name} details for this scene`}
              >
                {entity.name}
              </button>
              <button
                onClick={() => handleRemove(entity.id)}
                className="p-0.5 rounded-full hover:bg-accent/30"
                title="Remove"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add dropdown */}
      {isAdding && availableEntities.length > 0 && (
        <div className="border-t border-editor-border max-h-32 overflow-y-auto">
          {availableEntities.map((entity) => (
            <button
              key={entity.id}
              onClick={() => handleAdd(entity.id)}
              className="w-full text-left px-3 py-1.5 text-sm text-editor-text hover:bg-editor-bg transition-colors"
            >
              {entity.name}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {linkedEntities.length === 0 && !isAdding && (
        <div className="px-3 py-2 text-xs text-editor-muted">
          {allEntities.length === 0
            ? `No ${label.toLowerCase()} defined yet. Use World menu to create some.`
            : `No ${label.toLowerCase()} linked. Click + to add.`}
        </div>
      )}

      {/* Scene entity overlay — shown when an entity chip is clicked */}
      {overlayEntityId && (() => {
        const entity = allEntities.find((e) => e.id === overlayEntityId);
        if (!entity) return null;
        return (
          <SceneEntityOverlay
            entity={entity}
            nodeId={nodeId}
            entityState={entityStates[entity.id] || ''}
            onClose={() => setOverlayEntityId(null)}
          />
        );
      })()}
    </div>
  );
}

/**
 * CHOICE EDITOR COMPONENT
 * Edits a single choice button.
 */
interface ChoiceEditorProps {
  choice: SceneChoice;
  index: number;
  onUpdate: (updates: Partial<SceneChoice>) => void;
  onDelete: () => void;
}

function ChoiceEditor({ choice, index, onUpdate, onDelete }: ChoiceEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-editor-surface border border-editor-border rounded-lg overflow-hidden">
      {/* Choice header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-editor-bg"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-editor-muted" />
        ) : (
          <ChevronRight size={14} className="text-editor-muted" />
        )}
        <span className="w-6 h-6 rounded bg-node-scene/20 text-node-scene text-xs flex items-center justify-center font-mono">
          {index + 1}
        </span>
        <input
          type="text"
          value={choice.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent text-sm text-editor-text focus:outline-none focus:bg-editor-bg px-2 py-1 rounded"
          placeholder={`Choice ${index + 1}`}
        />
        {choice.condition && (
          <Lock size={14} className="text-node-choice" />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded hover:bg-error/20 text-editor-muted hover:text-error"
          title="Delete choice"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 py-3 border-t border-editor-border space-y-3 bg-editor-bg/50">
          {/* Icon */}
          <div>
            <label className="input-label">Icon (Optional)</label>
            <input
              type="text"
              value={choice.icon || ''}
              onChange={(e) => onUpdate({ icon: e.target.value })}
              className="input"
              placeholder="e.g., ⚔️ 🛡️ 🔑 (emoji or text)"
            />
            <p className="text-xs text-editor-muted mt-1">
              Add an emoji or icon that appears before the choice text.
            </p>
          </div>

          {/* Connection hint */}
          <div className="bg-node-scene/10 rounded-lg p-3 text-xs">
            <p className="font-medium text-node-scene mb-1">🔗 Connect this choice</p>
            <p className="text-editor-muted">
              Look for the blue dot labeled "{index + 1}" on the right side of this node.
              Drag from that dot to another node to set where this choice leads.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
