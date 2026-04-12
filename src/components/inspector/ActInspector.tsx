/**
 * =============================================================================
 * ACT INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for ActNode — represents a structural act in the story
 * (e.g., Act 1: The Setup, Act 2: Confrontation, Act 3: Resolution).
 *
 * FIELDS:
 * - Act Number (number input)
 * - Name (text input — the act's label)
 * - Description (textarea — what happens in this act)
 *
 * Each field has an InfoTooltip explaining the storytelling concept.
 *
 * =============================================================================
 */

import React, { useState, useRef } from 'react';
import { Sparkles, FolderOpen, Music, Search, Upload, Trash2, Volume2 } from 'lucide-react';
import type { ActNode, ActNodeData } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';
import MediaUploader from './MediaUploader';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';
import MusicSearchOverlay from '@components/media/MusicSearchOverlay';
import TTSGenerationOverlay from '@components/media/TTSGenerationOverlay';
import { getBlobUrl } from '@/utils/blobCache';

// =============================================================================
// PROPS
// =============================================================================

interface ActInspectorProps {
  node: ActNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * ActInspector — the right-panel detail view for act nodes.
 *
 * WHY ACTS MATTER:
 * The act structure provides a macro-level pacing framework for the story.
 * In a classical three-act structure: Act 1 establishes the world and conflict,
 * Act 2 escalates through complications and a midpoint shift, and Act 3
 * drives toward the climax and resolution. Authors can use more acts
 * (e.g., five-act structure) for more granular pacing control.
 */
export default function ActInspector({ node }: ActInspectorProps) {
  const updateNode = useProjectStore((s) => s.updateNode);

  /**
   * Determine whether this node represents an episode (TV/series structure)
   * or a traditional act. This changes the labels throughout the inspector
   * to use episode-appropriate terminology (e.g., "Cliffhanger" instead of
   * "Turning Point").
   */
  const isEpisode = !!(node.data as any).isEpisode;

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
   * Helper to update any field on the ActNode's data object.
   * Merges the update into the existing data to preserve sibling fields.
   */
  const updateData = (updates: Partial<ActNodeData>) => {
    updateNode(node.id, { data: { ...node.data, ...updates } });
  };

  /**
   * Handle image upload for the act node.
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
   * Handle voiceover TTS generation callback.
   */
  const handleVoiceoverGenerated = (dataUrl: string) => {
    updateData({ voiceoverAudio: dataUrl } as any);
  };

  /**
   * Handle voiceover audio file upload.
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
      {/* ==================== ACT / EPISODE NUMBER ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          {isEpisode ? 'Episode Number' : 'Act Number'}
          <InfoTooltip content={isEpisode
            ? "The sequential number of this episode (1, 2, 3, etc.). Episodes are numbered in the order they air or are read."
            : "The sequential number of this act (1, 2, 3, etc.). Acts are typically numbered in chronological order. The most common structure is three acts, but you can use as many as your story needs."
          } />
        </label>
        <input
          type="number"
          min={1}
          value={node.data.actNumber ?? ''}
          onChange={(e) => updateData({ actNumber: parseInt(e.target.value, 10) || 1 })}
          className="input"
          placeholder="1"
        />
      </div>

      {/* ==================== NAME ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          {isEpisode ? 'Episode Name' : 'Act Name'}
          <InfoTooltip content={isEpisode
            ? 'A descriptive name for this episode that captures its hook or central event. Examples: "The Pilot", "Betrayal", "The Reckoning".'
            : (STORY_TOOLTIPS.act || 'A descriptive name for this act that captures its narrative purpose. Examples: "The Ordinary World", "Rising Stakes", "The Final Battle".')
          } />
        </label>
        <input
          type="text"
          value={node.data.name || ''}
          onChange={(e) => updateData({ name: e.target.value })}
          className="input"
          placeholder={isEpisode ? 'e.g., The Pilot, Betrayal, The Reckoning' : 'e.g., The Setup, Rising Action, The Climax'}
        />
      </div>

      {/* ==================== DESCRIPTION ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Description
          <InfoTooltip content="Describe the major events, emotional beats, and turning points that occur in this act. What is the audience supposed to feel? How does the story advance?" />
        </label>
        <textarea
          value={node.data.description || ''}
          onChange={(e) => updateData({ description: e.target.value })}
          className="input min-h-[150px] resize-y"
          placeholder="Describe what happens in this act — key events, emotional beats, and how it connects to the overall story..."
        />
      </div>

      {/* ==================== TURNING POINT / CLIFFHANGER ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          {isEpisode ? 'Episode Cliffhanger / Turning Point' : 'Turning Point'}
          <InfoTooltip
            content={isEpisode
              ? 'The cliffhanger or turning point at the end of this episode. What revelation, danger, or unresolved question makes the audience desperate to watch the next episode?'
              : STORY_TOOLTIPS.turningPoint
            }
            title={isEpisode ? 'Cliffhanger' : 'Turning Point'}
          />
        </label>
        <textarea
          value={node.data.turningPoint || ''}
          onChange={(e) => updateData({ turningPoint: e.target.value })}
          className="input min-h-[100px] resize-y"
          placeholder={isEpisode
            ? "The cliffhanger at the end of this episode — the unresolved question or shocking revelation that hooks the audience for the next episode..."
            : "The pivotal event at the end of this act that changes the story's direction and propels it into the next act..."
          }
        />
      </div>

      {/* ==================== IMAGE ==================== */}
      <div>
        <label className="input-label">Act Image</label>
        <MediaUploader
          type="image"
          label="Act Image"
          value={node.data.image}
          onChange={handleImageChange}
          placeholder="Click to upload a mood / concept image for this act"
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

      {/* Image Generation Overlay */}
      <ImageGenerationOverlay
        isOpen={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onImageGenerated={(dataUrl) => updateData({ image: dataUrl })}
        title="Generate Act Image"
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
        title="Select Act Image"
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
        initialText={node.data.description || node.data.name || ''}
        title="Generate Voiceover"
      />
    </div>
  );
}
