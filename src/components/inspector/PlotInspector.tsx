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

import React from 'react';
import type { PlotNode, PlotNodeData } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';
import MediaUploader from './MediaUploader';

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
      </div>
    </div>
  );
}
