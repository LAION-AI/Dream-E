/**
 * =============================================================================
 * SHOT INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for ShotNode — the most granular visual storytelling unit
 * in co-write mode. Each shot = one camera perspective / storyboard panel.
 *
 * FIELDS:
 * - Shot Title
 * - What Happens (description of action / events in the shot)
 * - Shot Caption (camera type, angle, movement, visible elements — the
 *   storyboard panel description. Think: "TRACKING SHOT — low angle,
 *   hero leaps rooftop gap, guards blurred in background.")
 * - Shot Image (upload / generate / asset picker)
 * - Voiceover Timeline (ordered multi-character dialogue entries,
 *   each with text + optional TTS audio)
 * - Background Music (search / upload, with "Continue from previous" toggle)
 *
 * WHY TWO TEXT FIELDS INSTEAD OF ONE?
 * Keeping "what happens" (the narrative event) separate from the "shot caption"
 * (the visual/technical description) mirrors professional storyboard practice.
 * The action description answers "WHAT happens?" — the caption answers
 * "WHAT CAN YOU SEE?" from the camera's perspective.
 *
 * =============================================================================
 */

import React, { useState, useRef } from 'react';
import {
  Sparkles, FolderOpen, Music, Search, Upload, Trash2, Volume2,
  Plus, ChevronUp, ChevronDown, Camera, Mic2,
} from 'lucide-react';
import EntityStatePatchSection from './EntityStatePatchSection';
import type { ShotNode, ShotNodeData, VoiceoverEntry } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import MediaUploader from './MediaUploader';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';
import MusicSearchOverlay from '@components/media/MusicSearchOverlay';
import TTSGenerationOverlay from '@components/media/TTSGenerationOverlay';
import { getBlobUrl } from '@/utils/blobCache';
import { generateId } from '@/utils/idGenerator';

// =============================================================================
// PROPS
// =============================================================================

interface ShotInspectorProps {
  node: ShotNode;
}

// =============================================================================
// VOICEOVER TIMELINE ENTRY SUB-COMPONENT
// =============================================================================

/**
 * VoiceoverTimelineEntry — renders a single voiceover entry row
 * inside the Voiceover Timeline section. Each entry has:
 * - Character name text input
 * - Dialogue text textarea
 * - Optional audio player (if TTS was generated or audio was uploaded)
 * - Generate TTS / Upload / Remove audio buttons
 * - Reorder (up/down) and delete controls
 */
interface VoiceoverEntryRowProps {
  entry: VoiceoverEntry;
  index: number;
  total: number;
  onUpdate: (id: string, updates: Partial<VoiceoverEntry>) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
}

function VoiceoverEntryRow({
  entry, index, total, onUpdate, onMoveUp, onMoveDown, onRemove,
}: VoiceoverEntryRowProps) {
  // Local state for this entry's TTS overlay and file input ref
  const [ttsOpen, setTtsOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onUpdate(entry.id, { audioUrl: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="border border-rose-800/40 rounded-lg p-3 bg-rose-950/30 space-y-2">
      {/* Header row: index badge + character name + reorder + delete */}
      <div className="flex items-center gap-2">
        {/* Sequential badge */}
        <span className="text-[10px] font-bold bg-rose-700/50 text-rose-200 px-2 py-0.5 rounded-full min-w-[28px] text-center">
          {index + 1}
        </span>

        {/* Character name input */}
        <input
          type="text"
          value={entry.characterName}
          onChange={(e) => onUpdate(entry.id, { characterName: e.target.value })}
          placeholder="Character name..."
          className="input flex-1 text-xs py-1"
        />

        {/* Move up / down */}
        <button
          onClick={() => onMoveUp(entry.id)}
          disabled={index === 0}
          className="p-1 rounded hover:bg-rose-800/40 text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={() => onMoveDown(entry.id)}
          disabled={index === total - 1}
          className="p-1 rounded hover:bg-rose-800/40 text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ChevronDown size={14} />
        </button>

        {/* Remove entry */}
        <button
          onClick={() => onRemove(entry.id)}
          className="p-1 rounded hover:bg-red-800/40 text-red-400"
          title="Remove this voiceover entry"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Dialogue text */}
      <textarea
        value={entry.text}
        onChange={(e) => onUpdate(entry.id, { text: e.target.value })}
        placeholder="Spoken dialogue or narration text..."
        className="input text-xs min-h-[60px] resize-y w-full"
      />

      {/* Audio player + controls */}
      {entry.audioUrl ? (
        <div className="space-y-1">
          <audio
            src={getBlobUrl(entry.audioUrl)}
            controls
            className="w-full h-7"
          />
          <button
            onClick={() => onUpdate(entry.id, { audioUrl: undefined })}
            className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300"
          >
            <Trash2 size={10} /> Remove audio
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setTtsOpen(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 text-teal-400"
          >
            <Volume2 size={10} /> Generate TTS
          </button>
          <button
            onClick={() => uploadRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-editor-bg border border-editor-border hover:bg-editor-surface text-editor-text"
          >
            <Upload size={10} /> Upload Audio
          </button>
        </div>
      )}

      {/* Hidden file input for audio upload */}
      <input
        ref={uploadRef}
        type="file"
        accept="audio/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* TTS overlay for this entry */}
      <TTSGenerationOverlay
        isOpen={ttsOpen}
        onClose={() => setTtsOpen(false)}
        onAudioGenerated={(dataUrl) => {
          onUpdate(entry.id, { audioUrl: dataUrl });
          setTtsOpen(false);
        }}
        initialText={entry.text}
        title={`Generate TTS — ${entry.characterName || 'Character'}`}
      />
    </div>
  );
}

// =============================================================================
// MAIN SHOT INSPECTOR COMPONENT
// =============================================================================

/**
 * ShotInspector — the right-panel detail view for shot nodes.
 *
 * WHY SHOTS MATTER:
 * Shots are the atomic units of visual storytelling. Each shot defines a
 * specific camera setup, angle, and moment — think of a storyboard panel.
 * Having shot-level granularity lets writers and directors plan their visual
 * narrative beat-by-beat before production.
 *
 * The Voiceover Timeline lets multiple characters speak within a single shot,
 * with their lines playing in sequence — essential for dialogue scenes where
 * the camera holds on a single angle through an exchange.
 */
export default function ShotInspector({ node }: ShotInspectorProps) {
  const updateNode = useProjectStore((s) => s.updateNode);

  // Overlay / modal states
  const [imageGenOpen, setImageGenOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [musicSearchOpen, setMusicSearchOpen] = useState(false);

  // File input refs
  const musicFileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Helper to update any field on the ShotNode's data object.
   * Merges the update into the existing data to preserve sibling fields.
   */
  const updateData = (updates: Partial<ShotNodeData>) => {
    updateNode(node.id, { data: { ...node.data, ...updates } });
  };

  /** Handle image upload for the shot node. */
  const handleImageChange = (_file: File | null, url: string | null) => {
    updateData({ image: url || undefined });
  };

  /** Handle music file upload via the hidden file input. */
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

  // ── VOICEOVER TIMELINE HELPERS ──

  /** Get current timeline entries, defaulting to empty array. */
  const timeline = node.data.voiceoverTimeline ?? [];

  /** Add a new blank voiceover entry to the end of the timeline. */
  const addVoiceoverEntry = () => {
    const newEntry: VoiceoverEntry = {
      id: generateId('choice'), // reuse 'choice' prefix for sub-entry IDs
      characterName: '',
      text: '',
    };
    updateData({ voiceoverTimeline: [...timeline, newEntry] });
  };

  /** Update specific fields on an existing entry by ID. */
  const updateVoiceoverEntry = (id: string, updates: Partial<VoiceoverEntry>) => {
    updateData({
      voiceoverTimeline: timeline.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    });
  };

  /** Move an entry one position up (toward index 0 = plays first). */
  const moveEntryUp = (id: string) => {
    const idx = timeline.findIndex((e) => e.id === id);
    if (idx <= 0) return;
    const next = [...timeline];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    updateData({ voiceoverTimeline: next });
  };

  /** Move an entry one position down (toward the end = plays last). */
  const moveEntryDown = (id: string) => {
    const idx = timeline.findIndex((e) => e.id === id);
    if (idx < 0 || idx >= timeline.length - 1) return;
    const next = [...timeline];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    updateData({ voiceoverTimeline: next });
  };

  /** Remove an entry from the timeline entirely. */
  const removeVoiceoverEntry = (id: string) => {
    updateData({ voiceoverTimeline: timeline.filter((e) => e.id !== id) });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">

      {/* ==================== TITLE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Shot Title
          <InfoTooltip content="A short name for this shot. Examples: 'Wide — City skyline at dusk', 'CU — Hero draws sword'." />
        </label>
        <input
          type="text"
          value={node.data.title || ''}
          onChange={(e) => updateData({ title: e.target.value })}
          className="input"
          placeholder="e.g., Wide shot — rooftop at dusk"
        />
      </div>

      {/* ==================== WHAT HAPPENS ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          What Happens
          <InfoTooltip content="Describe the narrative action and events occurring during this shot. Answer: 'What is happening?' — not how the camera frames it. Example: 'The hero leaps the rooftop gap as guards open fire.'" />
        </label>
        <textarea
          value={node.data.whatHappens || ''}
          onChange={(e) => updateData({ whatHappens: e.target.value })}
          className="input min-h-[100px] resize-y"
          placeholder="What happens during this shot? Describe the action and events..."
        />
      </div>

      {/* ==================== SHOT CAPTION ==================== */}
      <div>
        {/* Info banner explaining the shot caption field */}
        <div className="flex items-start gap-2 mb-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-700/30">
          <Camera size={14} className="text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold text-rose-300 mb-0.5">Camera Perspective</p>
            <p className="text-[10px] text-rose-300/70 leading-relaxed">
              Each shot node = one camera setup. The caption below describes exactly
              what the camera <em>sees</em>: shot type (wide/medium/close-up),
              camera movement (tracking/dolly/handheld/static), lens feel,
              visible elements, and actions visible in frame.
            </p>
          </div>
        </div>

        <label className="input-label flex items-center gap-1">
          Shot Caption (What Is Visible)
          <InfoTooltip content="Describe the camera perspective, framing, movement, and everything visible in frame. Include: shot type (wide/MCU/CU/ECU), camera move (pan/tilt/dolly/tracking/handheld/static), lighting feel, and key visual elements. This is the storyboard panel caption." />
        </label>
        <textarea
          value={node.data.shotCaption || ''}
          onChange={(e) => updateData({ shotCaption: e.target.value })}
          className="input min-h-[110px] resize-y"
          placeholder="e.g., TRACKING SHOT — Low angle. Camera at knee height follows hero left-to-right. Hero silhouetted against orange-lit sky. Guards blurred in background. Shallow DoF, anamorphic lens."
        />
      </div>

      {/* ==================== IMAGE ==================== */}
      <div>
        <label className="input-label">Storyboard Frame</label>
        <MediaUploader
          type="image"
          label="Shot Image"
          value={node.data.image}
          onChange={handleImageChange}
          placeholder="Upload or generate a storyboard frame / concept image"
        />
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

      {/* ==================== VOICEOVER TIMELINE ==================== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="input-label flex items-center gap-1.5 mb-0">
            <Mic2 size={14} className="text-teal-400" />
            Voiceover Timeline
            <InfoTooltip content="Add one entry per character line. Entries play in order (top→bottom) when this shot is rendered. Different characters can speak back-to-back within a single camera shot." />
          </label>
          <button
            onClick={addVoiceoverEntry}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 transition-colors text-teal-400"
          >
            <Plus size={12} /> Add Line
          </button>
        </div>

        {timeline.length === 0 ? (
          <div className="text-center py-4 text-xs text-editor-muted border border-dashed border-editor-border/40 rounded-lg">
            <Mic2 size={20} className="mx-auto mb-1 text-editor-muted/50" />
            No voiceover lines yet.<br />
            Click <strong>Add Line</strong> to add a character's spoken line.
          </div>
        ) : (
          <div className="space-y-2">
            {timeline.map((entry, idx) => (
              <VoiceoverEntryRow
                key={entry.id}
                entry={entry}
                index={idx}
                total={timeline.length}
                onUpdate={updateVoiceoverEntry}
                onMoveUp={moveEntryUp}
                onMoveDown={moveEntryDown}
                onRemove={removeVoiceoverEntry}
              />
            ))}
          </div>
        )}
      </div>

      {/* ==================== BACKGROUND MUSIC ==================== */}
      <div>
        <label className="input-label flex items-center gap-2">
          <Music size={14} />
          Background Music
        </label>

        {/* Continue-from-previous toggle */}
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!node.data.musicContinueFromPrevious}
            onChange={(e) => updateData({ musicContinueFromPrevious: e.target.checked })}
            className="w-4 h-4 accent-rose-500 cursor-pointer"
          />
          <span className="text-xs text-editor-text">
            Continue music from previous shot
          </span>
          <InfoTooltip content="When enabled, the music from the preceding shot keeps playing into this shot without restarting. Uncheck to start fresh music for this shot." />
        </label>

        {node.data.backgroundMusic ? (
          <div className="mt-1 border border-editor-border rounded-lg p-3 bg-editor-bg/50">
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
          <p className="text-xs text-editor-muted italic">
            {node.data.musicContinueFromPrevious
              ? 'Music will continue from the previous shot.'
              : 'No background music set.'}
          </p>
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

      {/* ==================== ENTITY STATE CHANGES ==================== */}
      <EntityStatePatchSection
        entityStateChanges={node.data.entityStateChanges}
        scopeLabel="during this shot (micro-level changes visible within this camera frame)"
        onStateChangesChange={(v) => updateData({ entityStateChanges: v })}
      />

      {/* ==================== OVERLAYS ==================== */}

      <ImageGenerationOverlay
        isOpen={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onImageGenerated={(dataUrl) => updateData({ image: dataUrl })}
        title="Generate Shot Image"
      />

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

      <MusicSearchOverlay
        isOpen={musicSearchOpen}
        onClose={() => setMusicSearchOpen(false)}
        onSelect={(dataUrl) => updateData({ backgroundMusic: dataUrl })}
        title="Search Background Music"
      />
    </div>
  );
}
