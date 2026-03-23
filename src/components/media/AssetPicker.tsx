/**
 * =============================================================================
 * ASSET PICKER COMPONENT
 * =============================================================================
 *
 * A simplified version of the AssetManager, designed for SELECTION only.
 * Shows all images (or audio) from the current project in a grid layout.
 * Clicking an item selects it and returns the URL to the caller.
 *
 * Used by:
 * - ImageGenerationOverlay (for adding reference images)
 * - Inspector components (for selecting existing images/audio from assets)
 *
 * WHY A SEPARATE COMPONENT?
 * The full AssetManager is a management tool (rename, delete, view usage).
 * This component is a quick picker — no editing, no deletion, just select.
 * Keeping it separate avoids bloating the AssetManager with selection mode
 * logic and keeps the picker lightweight and focused.
 *
 * =============================================================================
 */

import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Music, Mic, Search, FileQuestion } from 'lucide-react';
import { Modal } from '@components/common/Modal';
import { useProjectStore } from '@stores/useProjectStore';
import { getBlobUrl } from '@/utils/blobCache';
import { getAssetFingerprint } from '@/utils/assetFingerprint';
import type { SceneNode } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface AssetPickerProps {
  /** Whether the picker modal is open */
  isOpen: boolean;
  /** Called when the user closes the picker without selecting */
  onClose: () => void;
  /** Called with the asset URL when the user selects an asset */
  onSelect: (url: string) => void;
  /** Filter to show only certain asset types. Defaults to 'image'. */
  filterType?: 'image' | 'audio' | 'all';
  /** Optional title override */
  title?: string;
}

/**
 * Represents a single asset extracted from the project.
 * Simplified from AssetManager's Asset type — no editing/deletion fields.
 */
interface PickerAsset {
  /** Unique key for deduplication (fingerprint-based) */
  fingerprint: string;
  /** The asset URL (blob URL or data URL) */
  url: string;
  /** Asset type */
  type: 'image' | 'music' | 'voiceover';
  /** Human-readable label (asset name from manager, or default) */
  label: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AssetPicker({
  isOpen,
  onClose,
  onSelect,
  filterType = 'image',
  title,
}: AssetPickerProps) {
  const currentProject = useProjectStore((s) => s.currentProject);
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * Extract all assets from the project and deduplicate by fingerprint.
   * This mirrors the logic in AssetManager but is read-only.
   */
  const allAssets = useMemo(() => {
    if (!currentProject) return [];

    const assetMap = new Map<string, PickerAsset>();
    const names = currentProject.assetNames || {};

    /**
     * Helper: add an asset URL to the map if it's new.
     */
    const addAsset = (url: string, type: 'image' | 'music' | 'voiceover', sourceName: string) => {
      if (!url) return;
      const fp = getAssetFingerprint(url);
      if (!assetMap.has(fp)) {
        assetMap.set(fp, {
          fingerprint: fp,
          url,
          type,
          label: names[fp] || sourceName,
        });
      }
    };

    // Scan scene nodes for background images, music, and voiceover
    currentProject.nodes.forEach((node) => {
      if (node.type === 'scene') {
        const sceneNode = node as SceneNode;
        const nodeName = node.label || 'Unnamed Scene';
        if (sceneNode.data.backgroundImage) {
          addAsset(sceneNode.data.backgroundImage, 'image', `Scene: ${nodeName}`);
        }
        if (sceneNode.data.backgroundMusic) {
          addAsset(sceneNode.data.backgroundMusic, 'music', `Scene: ${nodeName}`);
        }
        if (sceneNode.data.voiceoverAudio) {
          addAsset(sceneNode.data.voiceoverAudio, 'voiceover', `Scene: ${nodeName}`);
        }
      }

      // Story root, plot, act nodes may have images
      if (node.type === 'storyRoot' && (node.data as any)?.image) {
        addAsset((node.data as any).image, 'image', `Story Root: ${node.label}`);
      }
      if (node.type === 'plot' && (node.data as any)?.image) {
        addAsset((node.data as any).image, 'image', `Plot: ${node.label}`);
      }
      if (node.type === 'act' && (node.data as any)?.image) {
        addAsset((node.data as any).image, 'image', `Act: ${node.label}`);
      }
    });

    // Scan entities for reference images, voices, and default music
    (currentProject.entities || []).forEach((entity) => {
      const eName = `${entity.name} (${entity.category})`;
      if (entity.referenceImage) {
        addAsset(entity.referenceImage, 'image', eName);
      }
      if (entity.referenceVoice) {
        addAsset(entity.referenceVoice, 'voiceover', eName);
      }
      if (entity.defaultMusic) {
        addAsset(entity.defaultMusic, 'music', eName);
      }
    });

    return Array.from(assetMap.values());
  }, [currentProject]);

  /**
   * Apply type filter + search query to the asset list.
   */
  const filteredAssets = useMemo(() => {
    let assets = allAssets;

    // Type filter
    if (filterType === 'image') {
      assets = assets.filter((a) => a.type === 'image');
    } else if (filterType === 'audio') {
      assets = assets.filter((a) => a.type === 'music' || a.type === 'voiceover');
    }
    // 'all' shows everything

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      assets = assets.filter((a) => a.label.toLowerCase().includes(q));
    }

    return assets;
  }, [allAssets, filterType, searchQuery]);

  /**
   * Derive the modal title based on filter type.
   */
  const modalTitle = title || (
    filterType === 'image'
      ? 'Select Image from Assets'
      : filterType === 'audio'
        ? 'Select Audio from Assets'
        : 'Select from Assets'
  );

  // Reset search when modal opens
  React.useEffect(() => {
    if (isOpen) setSearchQuery('');
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="lg"
    >
      {/* Search bar */}
      <div style={{ marginBottom: 12, position: 'relative' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#8b8fa4',
          }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search assets..."
          style={{
            width: '100%',
            padding: '8px 12px 8px 32px',
            borderRadius: 8,
            border: '1px solid #2d3148',
            background: '#0f1117',
            color: '#e2e4ea',
            fontSize: '0.88em',
            outline: 'none',
          }}
        />
      </div>

      {/* Asset grid */}
      {filteredAssets.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 0',
          color: '#8b8fa4',
        }}>
          <FileQuestion size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ marginBottom: 4, fontSize: '0.92em' }}>No assets found</p>
          <p style={{ fontSize: '0.82em' }}>
            {filterType === 'image'
              ? 'No images in your project yet.'
              : filterType === 'audio'
                ? 'No audio files in your project yet.'
                : 'No assets in your project yet.'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: filterType === 'image' ? 'repeat(auto-fill, minmax(120px, 1fr))' : '1fr',
          gap: 10,
          maxHeight: 400,
          overflowY: 'auto',
          padding: '4px 0',
        }}>
          {filteredAssets.map((asset) => {
            if (asset.type === 'image') {
              return (
                <button
                  key={asset.fingerprint}
                  onClick={() => onSelect(asset.url)}
                  style={{
                    border: '2px solid #2d3148',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#171923',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'border-color 0.15s',
                    textAlign: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#6c8aff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#2d3148';
                  }}
                  title={asset.label}
                >
                  <img
                    src={getBlobUrl(asset.url)}
                    alt={asset.label}
                    style={{
                      width: '100%',
                      height: 100,
                      objectFit: 'cover',
                    }}
                  />
                  <div style={{
                    padding: '4px 6px',
                    fontSize: '0.72em',
                    color: '#8b8fa4',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {asset.label}
                  </div>
                </button>
              );
            }

            // Audio assets — show as a list item with icon
            return (
              <button
                key={asset.fingerprint}
                onClick={() => onSelect(asset.url)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  border: '1px solid #2d3148',
                  borderRadius: 8,
                  background: '#171923',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                  width: '100%',
                  textAlign: 'left',
                  color: '#e2e4ea',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#6c8aff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#2d3148';
                }}
                title={asset.label}
              >
                {asset.type === 'music' ? (
                  <Music size={18} style={{ color: '#4ade80', flexShrink: 0 }} />
                ) : (
                  <Mic size={18} style={{ color: '#a78bfa', flexShrink: 0 }} />
                )}
                <span style={{
                  fontSize: '0.88em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {asset.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
