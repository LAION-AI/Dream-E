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
 * 3. Shows predefined profile fields (Age, Gender, Appearance, etc.)
 * 4. Provides a Reference Voice section for uploading voice clips
 * 5. Delegates to ProfileViewer for additional free-form profile data
 *
 * WHY NOT DUPLICATE ENTITY DATA ON THE NODE?
 * Characters exist as entities in the project's world-building system.
 * The Character Canvas node is just a visual representation — all real
 * data lives on the entity. This avoids data drift where a character's
 * profile gets out of sync between the canvas and the entity system.
 *
 * =============================================================================
 */

import React, { useRef, useState } from 'react';
import { User, AlertTriangle, Volume2, Upload, Trash2, Sparkles, FolderOpen } from 'lucide-react';
import type { CharacterNode, Entity } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';
import ProfileViewer from '@components/entities/ProfileViewer';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import TTSGenerationOverlay from '@components/media/TTSGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * CHARACTER TYPE OPTIONS
 * Predefined character archetypes from narrative theory.
 * The "Custom" option allows freeform entry for non-standard types.
 */
const CHARACTER_TYPE_OPTIONS = [
  'Protagonist',
  'Antagonist',
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
  'Anti-hero',
  'Foil',
  'Custom',
] as const;

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
 * - Predefined profile fields (age, gender, appearance, etc.)
 * - Reference voice upload section
 * - The full ProfileViewer for additional free-form profile editing
 *
 * If the entity cannot be found (e.g., it was deleted), shows a warning.
 */
export default function CharacterNodeInspector({ node }: CharacterNodeInspectorProps) {
  const entities = useProjectStore((s) => s.currentProject?.entities || []);
  const updateEntity = useProjectStore((s) => s.updateEntity);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  /** State for image generation overlay (reference image) */
  const [imageGenOpen, setImageGenOpen] = useState(false);
  /** State for asset picker (reference image) */
  const [imageAssetPickerOpen, setImageAssetPickerOpen] = useState(false);
  /** State for TTS generation overlay (reference voice) */
  const [ttsGenOpen, setTtsGenOpen] = useState(false);
  /** State for asset picker (reference voice) */
  const [voiceAssetPickerOpen, setVoiceAssetPickerOpen] = useState(false);

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

  /**
   * Update a single predefined profile field.
   * Merges the field into the existing profile object.
   */
  const updateProfileField = (fieldName: string, value: unknown) => {
    updateEntity(entity.id, {
      profile: { ...(entity.profile || {}), [fieldName]: value },
    });
  };

  /**
   * Handle reference voice upload.
   * Reads the selected audio file as a base64 data URL and stores it
   * on the entity's referenceVoice field.
   */
  const handleVoiceUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateEntity(entity.id, { referenceVoice: dataUrl });
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be re-uploaded if needed
    event.target.value = '';
  };

  /**
   * Remove the reference voice from the entity.
   */
  const handleVoiceRemove = () => {
    updateEntity(entity.id, { referenceVoice: undefined });
  };

  // Convenience: current profile values
  const profile = entity.profile || {};

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

      {/* ==================== REFERENCE IMAGE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Reference Image
          <InfoTooltip content="A visual reference portrait for this character. Used by the AI image generator to maintain visual consistency across scenes. Can be uploaded, generated via AI, or selected from project assets." />
        </label>
        {entity.referenceImage && (
          <div className="mb-2">
            <img
              src={entity.referenceImage}
              alt={entity.name}
              className="w-full max-w-[200px] rounded-lg border border-editor-border"
            />
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setImageGenOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent/10 border border-accent/30 hover:bg-accent/20 transition-colors text-accent"
          >
            <Sparkles size={12} />
            Generate Image
          </button>
          <button
            onClick={() => setImageAssetPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
          >
            <FolderOpen size={12} />
            Select from Assets
          </button>
        </div>
      </div>

      {/* ==================== REFERENCE VOICE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Reference Voice
          <InfoTooltip content={STORY_TOOLTIPS.referenceVoice || 'Upload an audio clip of this character\'s voice. This reference is used by TTS to match the voice identity when generating voiceovers.'} />
        </label>

        {entity.referenceVoice ? (
          <div className="space-y-2">
            {/* Audio player for the existing voice clip */}
            <audio
              controls
              src={entity.referenceVoice}
              className="w-full h-8"
              style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.85 }}
            />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => voiceInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
              >
                <Upload size={12} />
                Replace
              </button>
              <button
                onClick={() => setTtsGenOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 transition-colors text-teal-400"
              >
                <Volume2 size={12} />
                Generate Voice
              </button>
              <button
                onClick={() => setVoiceAssetPickerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
              >
                <FolderOpen size={12} />
                Select from Assets
              </button>
              <button
                onClick={handleVoiceRemove}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors text-red-400"
              >
                <Trash2 size={12} />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => voiceInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-editor-border hover:border-teal-500/50 hover:bg-teal-500/5 transition-colors text-editor-muted text-sm"
            >
              <Volume2 size={16} />
              Upload voice reference clip
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setTtsGenOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 transition-colors text-teal-400"
              >
                <Volume2 size={12} />
                Generate Voice
              </button>
              <button
                onClick={() => setVoiceAssetPickerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
              >
                <FolderOpen size={12} />
                Select from Assets
              </button>
            </div>
          </div>
        )}

        {/* Hidden file input for voice uploads */}
        <input
          ref={voiceInputRef}
          type="file"
          accept="audio/*"
          onChange={handleVoiceUpload}
          className="hidden"
        />
      </div>

      {/* ==================== SEPARATOR ==================== */}
      <div className="h-px bg-editor-border" />

      {/* ==================== PREDEFINED PROFILE FIELDS ==================== */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-editor-muted">
          Character Profile
        </h4>

        {/* Character Type dropdown */}
        <div>
          <label className="input-label flex items-center gap-1">
            Character Type
            <InfoTooltip content={STORY_TOOLTIPS.characterType || 'The narrative role this character serves in the story. Each archetype comes with audience expectations — a Mentor teaches, a Trickster disrupts, an Anti-hero walks the moral gray zone.'} />
          </label>
          <select
            value={(profile.characterType as string) || ''}
            onChange={(e) => updateProfileField('characterType', e.target.value)}
            className="input"
          >
            <option value="">Select a type...</option>
            {CHARACTER_TYPE_OPTIONS.map((ct) => (
              <option key={ct} value={ct}>
                {ct}
              </option>
            ))}
          </select>
        </div>

        {/* Age */}
        <div>
          <label className="input-label flex items-center gap-1">
            Age
            <InfoTooltip content="The character's age or age range. This affects their worldview, energy level, references, and how other characters interact with them." />
          </label>
          <input
            type="text"
            value={(profile.age as string) || ''}
            onChange={(e) => updateProfileField('age', e.target.value)}
            className="input"
            placeholder="e.g., 34, Late twenties, Ancient"
          />
        </div>

        {/* Gender */}
        <div>
          <label className="input-label flex items-center gap-1">
            Gender
            <InfoTooltip content="The character's gender identity. This informs pronoun usage, social dynamics, and can be relevant to the story's themes and setting." />
          </label>
          <input
            type="text"
            value={(profile.gender as string) || ''}
            onChange={(e) => updateProfileField('gender', e.target.value)}
            className="input"
            placeholder="e.g., Male, Female, Non-binary"
          />
        </div>

        {/* Appearance / Looks */}
        <div>
          <label className="input-label flex items-center gap-1">
            Appearance / Looks
            <InfoTooltip content="Physical description: height, build, hair, eyes, distinguishing features, typical clothing. The AI uses this for image generation prompts and scene descriptions." />
          </label>
          <textarea
            value={(profile.appearance as string) || ''}
            onChange={(e) => updateProfileField('appearance', e.target.value)}
            className="input min-h-[60px] resize-y"
            placeholder="Tall, scarred face, silver hair, always wears a dark cloak..."
          />
        </div>

        {/* Occupation */}
        <div>
          <label className="input-label flex items-center gap-1">
            Occupation
            <InfoTooltip content="What does this character do? Their profession or role in the story world. This shapes their skills, knowledge, social status, and daily routines." />
          </label>
          <input
            type="text"
            value={(profile.occupation as string) || ''}
            onChange={(e) => updateProfileField('occupation', e.target.value)}
            className="input"
            placeholder="e.g., Blacksmith, Court Spy, Starship Engineer"
          />
        </div>

        {/* Problem-solving strategies */}
        <div>
          <label className="input-label flex items-center gap-1">
            Problem-Solving Strategies
            <InfoTooltip content="How does this character approach problems? Do they fight, negotiate, trick, analyze, or avoid? This defines their agency in scenes and makes their actions feel consistent and believable." />
          </label>
          <textarea
            value={(profile.problemSolvingStrategies as string) || ''}
            onChange={(e) => updateProfileField('problemSolvingStrategies', e.target.value)}
            className="input min-h-[60px] resize-y"
            placeholder="Prefers diplomacy but resorts to cunning deception when cornered..."
          />
        </div>
      </div>

      {/* ==================== SEPARATOR ==================== */}
      <div className="h-px bg-editor-border" />

      {/* ==================== FREE-FORM PROFILE ==================== */}
      <div>
        <label className="input-label mb-2 flex items-center gap-1">
          Additional Profile Fields
          <InfoTooltip content="Free-form profile fields for any additional character details that don't fit the predefined fields above. Click any value to edit it inline." />
        </label>
        <ProfileViewer
          profile={entity.profile || null}
          onProfileChange={handleProfileChange}
        />
      </div>

      {/* ==================== OVERLAYS ==================== */}

      {/* Image Generation Overlay for reference image */}
      <ImageGenerationOverlay
        isOpen={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onImageGenerated={(dataUrl) => {
          updateEntity(entity.id, { referenceImage: dataUrl });
        }}
        initialPrompt={entity.name ? `Portrait of ${entity.name}. ${(profile.appearance as string) || ''}`.trim() : ''}
        title={`Generate Reference Image — ${entity.name}`}
      />

      {/* Asset Picker for reference image */}
      <AssetPicker
        isOpen={imageAssetPickerOpen}
        onClose={() => setImageAssetPickerOpen(false)}
        onSelect={(url) => {
          updateEntity(entity.id, { referenceImage: url });
          setImageAssetPickerOpen(false);
        }}
        filterType="image"
        title={`Select Reference Image — ${entity.name}`}
      />

      {/* TTS Generation Overlay for reference voice */}
      <TTSGenerationOverlay
        isOpen={ttsGenOpen}
        onClose={() => setTtsGenOpen(false)}
        onAudioGenerated={(dataUrl) => {
          updateEntity(entity.id, { referenceVoice: dataUrl });
        }}
        initialText={entity.name ? `Hello, my name is ${entity.name}.` : ''}
        title={`Generate Reference Voice — ${entity.name}`}
      />

      {/* Asset Picker for reference voice */}
      <AssetPicker
        isOpen={voiceAssetPickerOpen}
        onClose={() => setVoiceAssetPickerOpen(false)}
        onSelect={(url) => {
          updateEntity(entity.id, { referenceVoice: url });
          setVoiceAssetPickerOpen(false);
        }}
        filterType="audio"
        title={`Select Reference Voice — ${entity.name}`}
      />
    </div>
  );
}
