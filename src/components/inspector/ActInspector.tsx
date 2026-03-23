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

import React, { useState } from 'react';
import { Sparkles, FolderOpen } from 'lucide-react';
import type { ActNode, ActNodeData } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';
import MediaUploader from './MediaUploader';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';

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

  /** State for the image generation overlay */
  const [imageGenOpen, setImageGenOpen] = useState(false);
  /** State for the asset picker modal */
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

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

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* ==================== ACT NUMBER ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Act Number
          <InfoTooltip content="The sequential number of this act (1, 2, 3, etc.). Acts are typically numbered in chronological order. The most common structure is three acts, but you can use as many as your story needs." />
        </label>
        <input
          type="number"
          min={1}
          value={node.data.actNumber || 1}
          onChange={(e) => updateData({ actNumber: parseInt(e.target.value, 10) || 1 })}
          className="input"
          placeholder="1"
        />
      </div>

      {/* ==================== NAME ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Act Name
          <InfoTooltip content={STORY_TOOLTIPS.act || 'A descriptive name for this act that captures its narrative purpose. Examples: "The Ordinary World", "Rising Stakes", "The Final Battle".'} />
        </label>
        <input
          type="text"
          value={node.data.name || ''}
          onChange={(e) => updateData({ name: e.target.value })}
          className="input"
          placeholder="e.g., The Setup, Rising Action, The Climax"
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

      {/* ==================== TURNING POINT ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Turning Point
          <InfoTooltip content={STORY_TOOLTIPS.turningPoint} title="Turning Point" />
        </label>
        <textarea
          value={node.data.turningPoint || ''}
          onChange={(e) => updateData({ turningPoint: e.target.value })}
          className="input min-h-[100px] resize-y"
          placeholder="The pivotal event at the end of this act that changes the story's direction and propels it into the next act..."
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
    </div>
  );
}
