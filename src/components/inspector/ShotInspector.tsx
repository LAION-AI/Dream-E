/**
 * =============================================================================
 * SHOT INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for ShotNode — the most granular visual storytelling unit
 * in co-write mode. Represents a single camera shot or visual moment.
 *
 * FIELDS:
 * - Title (text input — the shot's label)
 * - Description (textarea — camera angle, framing, action described)
 * - Image (MediaUploader + Generate + Select from Assets)
 * - Background Music (search + upload)
 * - Voiceover (generate TTS + upload)
 *
 * Follows the same pattern as ActInspector and CoWriteSceneInspector.
 *
 * =============================================================================
 */

import React, { useState, useRef } from 'react';
import { Sparkles, FolderOpen, Music, Search, Upload, Trash2, Volume2 } from 'lucide-react';
import type { ShotNode, ShotNodeData } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import MediaUploader from './MediaUploader';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';
import MusicSearchOverlay from '@components/media/MusicSearchOverlay';
import TTSGenerationOverlay from '@components/media/TTSGenerationOverlay';
import { getBlobUrl } from '@/utils/blobCache';

// =============================================================================
// PROPS
// =============================================================================

interface ShotInspectorProps {
  node: ShotNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * ShotInspector — the right-panel detail view for shot nodes.
 *
 * WHY SHOTS MATTER:
 * Shots are the atomic units of visual storytelling. Each shot defines a
 * specific camera setup, angle, and moment — think of a storyboard panel.
 * Having shot-level granularity lets writers and directors plan their visual
 * narrative beat-by-beat before production.
 */
export default function ShotInspector({ node }: ShotInspectorProps) {
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
   * Helper to update any field on the ShotNode's data object.
   * Merges the update into the existing data to preserve sibling fields.
   */
  const updateData = (updates: Partial<ShotNodeData>) => {
    updateNode(node.id, { data: { ...node.data, ...updates } });
  };

  /**
   * Handle image upload for the shot node.
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
    updateData({ voiceoverAudio: dataUrl });
  };

  /**
   * Handle voiceover audio file upload.
   */
  const handleVoiceoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => updateData({ voiceoverAudio: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* ==================== TITLE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Shot Title
          <InfoTooltip content="A short, descriptive name for this shot that captures the key visual moment. Examples: 'Wide shot - City skyline', 'Close-up - Hero draws sword'." />
        </label>
        <input
          type="text"
          value={node.data.title || ''}
          onChange={(e) => updateData({ title: e.target.value })}
          className="input"
          placeholder="e.g., Wide shot - City skyline at dusk"
        />
      </div>

      {/* ==================== DESCRIPTION ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Description
          <InfoTooltip content="Describe the camera angle, framing, movement, lighting, action happening in frame, and the emotional intent. Think of this as a storyboard panel description." />
        </label>
        <textarea
          value={node.data.description || ''}
          onChange={(e) => updateData({ description: e.target.value })}
          className="input min-h-[150px] resize-y"
          placeholder="Describe the shot — camera angle, framing, action, lighting, emotional tone..."
        />
      </div>

      {/* ==================== IMAGE ==================== */}
      <div>
        <label className="input-label">Shot Image</label>
        <MediaUploader
          type="image"
          label="Shot Image"
          value={node.data.image}
          onChange={handleImageChange}
          placeholder="Click to upload a reference / concept image for this shot"
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
        {node.data.voiceoverAudio ? (
          <div className="mt-2 border border-editor-border rounded-lg p-3 bg-editor-bg/50">
            <audio
              src={getBlobUrl(node.data.voiceoverAudio)}
              controls
              className="w-full h-8 mb-2"
            />
            <button
              onClick={() => updateData({ voiceoverAudio: undefined })}
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
        title="Generate Shot Image"
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
        title="Select Shot Image"
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
        initialText={node.data.description || node.data.title || ''}
        title="Generate Shot Voiceover"
      />
    </div>
  );
}
