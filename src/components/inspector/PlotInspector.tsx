/**
 * =============================================================================
 * PLOT INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for PlotNode — represents a narrative arc in the co-writing
 * canvas (main plot, subplot, relationship plot, etc.).
 *
 * FIELDS:
 * - Name (the plot's label)
 * - Plot Type (dropdown with 6 options + Custom)
 * - Description (textarea)
 * - Image (upload)
 *
 * Each field has an InfoTooltip explaining the storytelling concept.
 *
 * =============================================================================
 */

import React, { useState } from 'react';
import { Sparkles, FolderOpen } from 'lucide-react';
import type { PlotNode, PlotNodeData } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';
import MediaUploader from './MediaUploader';
import ImageGenerationOverlay from '@components/media/ImageGenerationOverlay';
import AssetPicker from '@components/media/AssetPicker';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Available plot type options.
 * Each maps to a tooltip explanation in STORY_TOOLTIPS.plotTypes.
 * "Custom" allows freeform naming for non-standard arc types.
 */
const PLOT_TYPE_OPTIONS = [
  'Main Plot',
  'Relationship Plot',
  'Antagonist Plot',
  'Character Development Plot',
  'Subplot',
  'Custom',
] as const;

// =============================================================================
// PROPS
// =============================================================================

interface PlotInspectorProps {
  node: PlotNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * PlotInspector — the right-panel detail view for plot nodes.
 *
 * WHY PLOT TYPES MATTER:
 * Different plot types serve different narrative functions. A "Main Plot"
 * drives the central conflict, while a "Relationship Plot" provides the
 * emotional core. Labeling plots by type helps writers think structurally
 * about how their story's threads interweave.
 */
export default function PlotInspector({ node }: PlotInspectorProps) {
  const updateNode = useProjectStore((s) => s.updateNode);

  /** State for the image generation overlay */
  const [imageGenOpen, setImageGenOpen] = useState(false);
  /** State for the asset picker modal */
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  /**
   * Helper to update any field on the PlotNode's data object.
   * Merges the update into the existing data to preserve sibling fields.
   */
  const updateData = (updates: Partial<PlotNodeData>) => {
    updateNode(node.id, { data: { ...node.data, ...updates } });
  };

  /**
   * Get the tooltip for the currently selected plot type.
   * Returns undefined if the type has no tooltip (e.g., when nothing is selected).
   */
  const currentPlotTypeTooltip =
    node.data.plotType && node.data.plotType !== 'Custom'
      ? STORY_TOOLTIPS.plotTypes[node.data.plotType as keyof typeof STORY_TOOLTIPS.plotTypes]
      : undefined;

  /**
   * Handle image upload for the plot node.
   */
  const handleImageChange = (_file: File | null, url: string | null) => {
    updateData({ image: url || undefined });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* ==================== NAME ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Plot Name
          <InfoTooltip content={STORY_TOOLTIPS.plotNode} />
        </label>
        <input
          type="text"
          value={node.data.name || ''}
          onChange={(e) => updateData({ name: e.target.value })}
          className="input"
          placeholder="e.g., The Quest for the Dragon Stone"
        />
      </div>

      {/* ==================== PLOT TYPE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Plot Type
          {currentPlotTypeTooltip && (
            <InfoTooltip content={currentPlotTypeTooltip} title={node.data.plotType} />
          )}
        </label>
        <select
          value={node.data.plotType || ''}
          onChange={(e) => updateData({ plotType: e.target.value })}
          className="input"
        >
          <option value="" disabled>
            Select a plot type...
          </option>
          {PLOT_TYPE_OPTIONS.map((pt) => (
            <option key={pt} value={pt}>
              {pt}
            </option>
          ))}
        </select>

        {/* Custom plot type text input — only shown when "Custom" is selected */}
        {node.data.plotType === 'Custom' && (
          <div className="mt-2">
            <label className="input-label text-xs">Custom Type Name</label>
            <input
              type="text"
              value={node.data.customPlotType || ''}
              onChange={(e) => updateData({ customPlotType: e.target.value })}
              className="input"
              placeholder="e.g., Political Intrigue, Mystery Thread"
            />
          </div>
        )}
      </div>

      {/* ==================== DESCRIPTION ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Description
          <InfoTooltip content="Describe the key events, turning points, and resolution of this plot arc. Think about how it connects to other plots and what themes it explores." />
        </label>
        <textarea
          value={node.data.description || ''}
          onChange={(e) => updateData({ description: e.target.value })}
          className="input min-h-[120px] resize-y"
          placeholder="Describe the arc of this plot — key events, turning points, and how it resolves..."
        />
      </div>

      {/* ==================== IMAGE ==================== */}
      <div>
        <label className="input-label">Plot Image</label>
        <MediaUploader
          type="image"
          label="Plot Image"
          value={node.data.image}
          onChange={handleImageChange}
          placeholder="Click to upload a mood / concept image"
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
        title="Generate Plot Image"
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
        title="Select Plot Image"
      />
    </div>
  );
}
