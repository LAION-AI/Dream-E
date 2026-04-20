/**
 * =============================================================================
 * STORY ROOT INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for the StoryRootNode — the central node of a co-writing
 * project that holds the story's high-level blueprint.
 *
 * FIELDS:
 * - Title, Genre, Target Audience, Punchline (logline)
 * - Main Character (name + role)
 * - Antagonist (name + role)
 * - Supporting Characters (dynamic list with archetype dropdown)
 * - Protagonist Goal
 * - Summary (300-500 words) with word counter
 * - Image (upload)
 *
 * Every field has an InfoTooltip that teaches the user about the storytelling
 * concept behind it — turning the inspector into an embedded writing coach.
 *
 * =============================================================================
 */

import React, { useMemo, useState, useRef } from 'react';
import { Plus, X, Upload, Sparkles, FolderOpen, Music, Search, Trash2, Volume2 } from 'lucide-react';
import type { StoryRootNode, StoryRootNodeData } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';
import MediaUploader from './MediaUploader';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';
import MusicSearchOverlay from '@components/media/MusicSearchOverlay';
import TTSGenerationOverlay from '@components/media/TTSGenerationOverlay';
import { getBlobUrl } from '@/utils/blobCache';
import EntityStatePatchSection from './EntityStatePatchSection';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * All available character archetypes for the supporting characters dropdown.
 * "Custom" allows a freeform archetype name.
 */
const ARCHETYPE_OPTIONS = [
  'Sidekick',
  'Mentor',
  'Love Interest',
  'Rival',
  'Comic Relief',
  'Guardian',
  'Herald',
  'Trickster',
  'Shapeshifter',
  'Threshold Guardian',
  'Custom',
] as const;

// =============================================================================
// PROPS
// =============================================================================

interface StoryRootInspectorProps {
  node: StoryRootNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * StoryRootInspector — the right-panel detail view for the story root node.
 *
 * WHY SO MANY FIELDS?
 * The story root captures the "DNA" of the narrative before a single scene
 * is written. Having this blueprint up front helps the AI (and the writer)
 * maintain consistency, and it feeds into the co-writing AI's system prompt
 * so it understands the story it's helping to tell.
 */
export default function StoryRootInspector({ node }: StoryRootInspectorProps) {
  const updateNode = useProjectStore((s) => s.updateNode);

  /** State for the image generation overlay */
  const [imageGenOpen, setImageGenOpen] = useState(false);
  /** State for the asset picker modal */
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  /** State for the music search overlay */
  const [musicSearchOpen, setMusicSearchOpen] = useState(false);
  /** State for the TTS generation overlay (voiceover) */
  const [ttsGenOpen, setTtsGenOpen] = useState(false);
  /** Hidden file input ref for manual music upload */
  const musicFileInputRef = useRef<HTMLInputElement>(null);
  /** Hidden file input ref for voiceover audio upload */
  const voiceoverFileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Helper to update any field on the StoryRootNode's data object.
   * Merges the update into the existing data to avoid clobbering sibling fields.
   */
  const updateData = (updates: Partial<StoryRootNodeData>) => {
    updateNode(node.id, { data: { ...node.data, ...updates } });
  };

  /**
   * Word count for the summary field.
   * Splits on whitespace, filtering out empty strings from leading/trailing spaces.
   */
  const summaryWordCount = useMemo(() => {
    const text = node.data.summary?.trim() || '';
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }, [node.data.summary]);

  /**
   * Color coding for the word counter:
   * - Red if under 100 (too short) or over 700 (too long)
   * - Yellow if between 100-299 or 501-700
   * - Green if in the sweet spot 300-500
   */
  const wordCountColor = useMemo(() => {
    if (summaryWordCount >= 300 && summaryWordCount <= 500) return 'text-green-400';
    if (summaryWordCount < 100 || summaryWordCount > 700) return 'text-red-400';
    return 'text-yellow-400';
  }, [summaryWordCount]);

  // ==================== SUPPORTING CHARACTERS HANDLERS ====================

  /**
   * Add a new blank supporting character to the list.
   */
  const addSupportingCharacter = () => {
    const current = node.data.supportingCharacters || [];
    updateData({
      supportingCharacters: [...current, { name: '', archetype: 'Sidekick' }],
    });
  };

  /**
   * Remove a supporting character by index.
   */
  const removeSupportingCharacter = (index: number) => {
    const current = [...(node.data.supportingCharacters || [])];
    current.splice(index, 1);
    updateData({ supportingCharacters: current });
  };

  /**
   * Update a single supporting character's fields.
   */
  const updateSupportingCharacter = (
    index: number,
    updates: Partial<{ name: string; archetype: string; customArchetype: string }>
  ) => {
    const current = [...(node.data.supportingCharacters || [])];
    current[index] = { ...current[index], ...updates };
    updateData({ supportingCharacters: current });
  };

  /**
   * Handle image upload for the story root node.
   */
  const handleImageChange = (_file: File | null, url: string | null) => {
    updateData({ image: url || undefined });
  };

  /**
   * Handle music file upload via the hidden file input.
   * Reads the file as a base64 data URL and stores it on the node.
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
   * Handle voiceover TTS generation callback.
   * Stores the generated audio data URL on the node's voiceoverAudio field.
   */
  const handleVoiceoverGenerated = (dataUrl: string) => {
    updateData({ voiceoverAudio: dataUrl } as any);
  };

  /**
   * Handle voiceover audio file upload via the hidden file input.
   */
  const handleVoiceoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => updateData({ voiceoverAudio: reader.result as string } as any);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* ==================== TITLE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Title
          <InfoTooltip content={STORY_TOOLTIPS.title} />
        </label>
        <input
          type="text"
          value={node.data.title || ''}
          onChange={(e) => updateData({ title: e.target.value })}
          className="input"
          placeholder="Your story's working title"
        />
      </div>

      {/* ==================== GENRE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Genre
          <InfoTooltip content={STORY_TOOLTIPS.genre} />
        </label>
        <input
          type="text"
          value={node.data.genre || ''}
          onChange={(e) => updateData({ genre: e.target.value })}
          className="input"
          placeholder="e.g., Fantasy, Sci-Fi, Romance, Thriller"
        />
      </div>

      {/* ==================== TARGET AUDIENCE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Target Audience
          <InfoTooltip content={STORY_TOOLTIPS.targetAudience} />
        </label>
        <input
          type="text"
          value={node.data.targetAudience || ''}
          onChange={(e) => updateData({ targetAudience: e.target.value })}
          className="input"
          placeholder="e.g., Young Adult, Adult, Middle Grade"
        />
      </div>

      {/* ==================== PUNCHLINE / LOGLINE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Punchline / Logline
          <InfoTooltip content={STORY_TOOLTIPS.punchline} />
        </label>
        <textarea
          value={node.data.punchline || ''}
          onChange={(e) => updateData({ punchline: e.target.value })}
          className="input min-h-[80px] resize-y"
          placeholder="Capture your entire story in 1-2 sentences..."
        />
      </div>

      {/* ==================== MAIN CHARACTER ==================== */}
      <div className="border border-editor-border rounded-lg p-3 space-y-3">
        <label className="input-label flex items-center gap-1 text-accent">
          Main Character (Protagonist)
          <InfoTooltip content={STORY_TOOLTIPS.mainCharacter} />
        </label>
        <div>
          <label className="input-label text-xs">Name</label>
          <input
            type="text"
            value={node.data.mainCharacter?.name || ''}
            onChange={(e) =>
              updateData({
                mainCharacter: {
                  ...node.data.mainCharacter,
                  name: e.target.value,
                  role: node.data.mainCharacter?.role || '',
                },
              })
            }
            className="input"
            placeholder="Character name"
          />
        </div>
        <div>
          <label className="input-label text-xs">Role / Description</label>
          <input
            type="text"
            value={node.data.mainCharacter?.role || ''}
            onChange={(e) =>
              updateData({
                mainCharacter: {
                  ...node.data.mainCharacter,
                  name: node.data.mainCharacter?.name || '',
                  role: e.target.value,
                },
              })
            }
            className="input"
            placeholder="Brief role description"
          />
        </div>
      </div>

      {/* ==================== ANTAGONIST ==================== */}
      <div className="border border-editor-border rounded-lg p-3 space-y-3">
        <label className="input-label flex items-center gap-1 text-accent">
          Antagonist
          <InfoTooltip content={STORY_TOOLTIPS.antagonist} />
        </label>
        <div>
          <label className="input-label text-xs">Name</label>
          <input
            type="text"
            value={node.data.antagonist?.name || ''}
            onChange={(e) =>
              updateData({
                antagonist: {
                  ...node.data.antagonist,
                  name: e.target.value,
                  role: node.data.antagonist?.role || '',
                },
              })
            }
            className="input"
            placeholder="Antagonist name"
          />
        </div>
        <div>
          <label className="input-label text-xs">Role / Description</label>
          <input
            type="text"
            value={node.data.antagonist?.role || ''}
            onChange={(e) =>
              updateData({
                antagonist: {
                  ...node.data.antagonist,
                  name: node.data.antagonist?.name || '',
                  role: e.target.value,
                },
              })
            }
            className="input"
            placeholder="Brief role description"
          />
        </div>
      </div>

      {/* ==================== SUPPORTING CHARACTERS ==================== */}
      <div className="border border-editor-border rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <label className="input-label flex items-center gap-1 text-accent">
            Supporting Characters
            <InfoTooltip content={STORY_TOOLTIPS.supportingCharacters} />
          </label>
          <button
            onClick={addSupportingCharacter}
            className="p-1 rounded hover:bg-editor-bg text-accent"
            title="Add supporting character"
          >
            <Plus size={16} />
          </button>
        </div>

        {(!node.data.supportingCharacters || node.data.supportingCharacters.length === 0) && (
          <p className="text-xs text-editor-muted italic">
            No supporting characters yet. Click + to add one.
          </p>
        )}

        {(node.data.supportingCharacters || []).map((char, index) => (
          <div
            key={index}
            className="bg-editor-bg/50 rounded-lg p-2 space-y-2 group"
          >
            <div className="flex items-center gap-2">
              {/* Character name */}
              <input
                type="text"
                value={char.name}
                onChange={(e) =>
                  updateSupportingCharacter(index, { name: e.target.value })
                }
                className="input flex-1"
                placeholder="Character name"
              />
              {/* Remove button */}
              <button
                onClick={() => removeSupportingCharacter(index)}
                className="p-1 rounded hover:bg-error/20 text-editor-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove character"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {/* Archetype dropdown */}
              <select
                value={char.archetype}
                onChange={(e) =>
                  updateSupportingCharacter(index, { archetype: e.target.value })
                }
                className="input flex-1"
              >
                {ARCHETYPE_OPTIONS.map((arch) => (
                  <option key={arch} value={arch}>
                    {arch}
                  </option>
                ))}
              </select>
              {/* Tooltip for the currently selected archetype */}
              {char.archetype && char.archetype !== 'Custom' && STORY_TOOLTIPS.archetypes[char.archetype as keyof typeof STORY_TOOLTIPS.archetypes] && (
                <InfoTooltip
                  content={STORY_TOOLTIPS.archetypes[char.archetype as keyof typeof STORY_TOOLTIPS.archetypes]}
                  title={char.archetype}
                />
              )}
            </div>
            {/* Custom archetype text input — only shown when "Custom" is selected */}
            {char.archetype === 'Custom' && (
              <input
                type="text"
                value={char.customArchetype || ''}
                onChange={(e) =>
                  updateSupportingCharacter(index, {
                    customArchetype: e.target.value,
                  })
                }
                className="input"
                placeholder="Custom archetype name"
              />
            )}
          </div>
        ))}
      </div>

      {/* ==================== PROTAGONIST GOAL ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Protagonist Goal
          <InfoTooltip content={STORY_TOOLTIPS.protagonistGoal} />
        </label>
        <input
          type="text"
          value={node.data.protagonistGoal || ''}
          onChange={(e) => updateData({ protagonistGoal: e.target.value })}
          className="input"
          placeholder="The one clear objective driving the story"
        />
      </div>

      {/* ==================== SUMMARY ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Summary
          <InfoTooltip content={STORY_TOOLTIPS.summary} />
        </label>
        <textarea
          value={node.data.summary || ''}
          onChange={(e) => updateData({ summary: e.target.value })}
          className="input min-h-[160px] resize-y"
          placeholder="A 300-500 word overview of the entire story from beginning to end, including the ending..."
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-editor-muted">
            Target: 300-500 words
          </p>
          <p className={`text-xs font-medium ${wordCountColor}`}>
            {summaryWordCount} word{summaryWordCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ==================== IMAGE ==================== */}
      <div>
        <label className="input-label">Story Image</label>
        <MediaUploader
          type="image"
          label="Story Image"
          value={node.data.image}
          onChange={handleImageChange}
          placeholder="Click to upload a cover / mood image"
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

      {/* ==================== VOICEOVER ==================== */}
      <div>
        <label className="input-label flex items-center gap-2">
          <Volume2 size={14} />
          Voiceover
        </label>
        {(node.data as any).voiceoverAudio ? (
          <div className="mt-2 border border-editor-border rounded-lg p-3 bg-editor-bg/50">
            <audio
              src={getBlobUrl((node.data as any).voiceoverAudio)}
              controls
              className="w-full h-8 mb-2"
            />
            <button
              onClick={() => updateData({ voiceoverAudio: undefined } as any)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors text-red-400"
            >
              <Trash2 size={12} />
              Remove Voiceover
            </button>
          </div>
        ) : (
          <p className="text-xs text-editor-muted mt-1 italic">No voiceover set.</p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setTtsGenOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 transition-colors text-teal-400"
          >
            <Volume2 size={12} />
            Generate TTS
          </button>
          <button
            onClick={() => voiceoverFileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
          >
            <Upload size={12} />
            Upload Audio
          </button>
        </div>
        <input
          ref={voiceoverFileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleVoiceoverUpload}
          className="hidden"
        />
      </div>

      {/* ==================== ENTITY STATE CHANGES ==================== */}
      <EntityStatePatchSection
        entityStateChanges={node.data.entityStateChanges}
        scopeLabel="across the entire story (from opening to resolution)"
        onStateChangesChange={(v) => updateData({ entityStateChanges: v })}
      />

      {/* Image Generation Overlay */}
      <ImageGenerationOverlay
        isOpen={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onImageGenerated={(dataUrl) => updateData({ image: dataUrl })}
        title="Generate Story Image"
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
        title="Select Story Image"
      />

      {/* Music Search Overlay */}
      <MusicSearchOverlay
        isOpen={musicSearchOpen}
        onClose={() => setMusicSearchOpen(false)}
        onSelect={(dataUrl) => updateData({ backgroundMusic: dataUrl })}
        title="Search Background Music"
      />

      {/* TTS Generation Overlay for voiceover */}
      <TTSGenerationOverlay
        isOpen={ttsGenOpen}
        onClose={() => setTtsGenOpen(false)}
        onAudioGenerated={handleVoiceoverGenerated}
        initialText={node.data.summary || node.data.punchline || ''}
        title="Generate Voiceover"
      />
    </div>
  );
}
