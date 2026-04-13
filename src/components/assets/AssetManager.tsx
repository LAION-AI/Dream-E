/**
 * =============================================================================
 * ASSET MANAGER COMPONENT
 * =============================================================================
 *
 * A modal for viewing and managing media assets in the project.
 *
 * FEATURES:
 * - View all images, music, and voiceover files used in the project
 * - Give each asset a unique user-friendly name/identifier
 * - Delete unused assets
 * - See which nodes are using each asset
 * - Filter by category (All, Images, Music, Voiceover)
 *
 * =============================================================================
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Trash2,
  Image as ImageIcon,
  Music,
  Mic,
  AlertTriangle,
  FileQuestion,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { useProjectStore } from '@stores/useProjectStore';
import { Button, Modal } from '@components/common';
import { getAssetFingerprint } from '@/utils/assetFingerprint';
import { getBlobUrl } from '@/utils/blobCache';
import type { SceneNode, StoryNode } from '@/types';

/**
 * ASSET MANAGER PROPS
 */
interface AssetManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ASSET TYPE — represents a single media file used in the project
 */
interface Asset {
  id: string;
  type: 'image' | 'music' | 'voiceover';
  url: string;
  fingerprint: string;
  name: string;
  usedInNodes: { nodeId: string; nodeName: string }[];
}

/**
 * ASSET MANAGER COMPONENT
 */
export default function AssetManager({ isOpen, onClose }: AssetManagerProps) {
  const currentProject = useProjectStore(s => s.currentProject);
  const updateNode = useProjectStore(s => s.updateNode);
  const updateAssetName = useProjectStore(s => s.updateAssetName);
  const updateEntity = useProjectStore(s => s.updateEntity);

  // Tab state — separate categories for images, music, and voiceover
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'music' | 'voiceover'>('all');

  // Deletion confirmation
  const [deleteAsset, setDeleteAsset] = useState<Asset | null>(null);

  // Inline editing state: which asset fingerprint is being edited, and the draft value
  const [editingFingerprint, setEditingFingerprint] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  /**
   * Extract all assets from the project, attaching fingerprints and stored names
   */
  const assets = useMemo(() => {
    if (!currentProject) return [];

    const assetMap = new Map<string, Asset>();
    const names = currentProject.assetNames || {};

    currentProject.nodes.forEach((node) => {
      if (node.type === 'scene') {
        const sceneNode = node as SceneNode;
        const nodeInfo = { nodeId: node.id, nodeName: node.label || 'Unnamed Scene' };

        // Background image
        if (sceneNode.data.backgroundImage) {
          const url = sceneNode.data.backgroundImage;
          const fp = getAssetFingerprint(url);
          const existing = assetMap.get(fp);
          if (existing) {
            existing.usedInNodes.push(nodeInfo);
          } else {
            assetMap.set(fp, {
              id: `img-${assetMap.size}`,
              type: 'image',
              url,
              fingerprint: fp,
              name: names[fp] || '',
              usedInNodes: [nodeInfo],
            });
          }
        }

        // Background music
        if (sceneNode.data.backgroundMusic) {
          const url = sceneNode.data.backgroundMusic;
          const fp = getAssetFingerprint(url);
          const existing = assetMap.get(fp);
          if (existing) {
            existing.usedInNodes.push(nodeInfo);
          } else {
            assetMap.set(fp, {
              id: `music-${assetMap.size}`,
              type: 'music',
              url,
              fingerprint: fp,
              name: names[fp] || '',
              usedInNodes: [nodeInfo],
            });
          }
        }

        // Voiceover
        if (sceneNode.data.voiceoverAudio) {
          const url = sceneNode.data.voiceoverAudio;
          const fp = getAssetFingerprint(url);
          const existing = assetMap.get(fp);
          if (existing) {
            existing.usedInNodes.push(nodeInfo);
          } else {
            assetMap.set(fp, {
              id: `voice-${assetMap.size}`,
              type: 'voiceover',
              url,
              fingerprint: fp,
              name: names[fp] || '',
              usedInNodes: [nodeInfo],
            });
          }
        }
      }
    });

    // Scan co-write nodes (storyRoot, plot, act, cowriteScene, shot)
    // These use 'image', 'voiceoverAudio', 'backgroundMusic' fields.
    const COWRITE_TYPES = new Set(['storyRoot', 'plot', 'act', 'cowriteScene', 'shot']);
    currentProject.nodes.forEach((node) => {
      if (!COWRITE_TYPES.has(node.type)) return;
      const d = node.data as Record<string, unknown>;
      const nodeInfo = { nodeId: node.id, nodeName: node.label || (d.title as string) || (d.name as string) || node.type };

      // Helper to add an asset
      const addAsset = (url: string, type: 'image' | 'music' | 'voiceover') => {
        if (!url || typeof url !== 'string') return;
        const fp = getAssetFingerprint(url);
        const existing = assetMap.get(fp);
        if (existing) {
          existing.usedInNodes.push(nodeInfo);
        } else {
          assetMap.set(fp, {
            id: `${type}-${assetMap.size}`,
            type,
            url,
            fingerprint: fp,
            name: names[fp] || '',
            usedInNodes: [nodeInfo],
          });
        }
      };

      if (d.image) addAsset(d.image as string, 'image');
      if (d.backgroundImage) addAsset(d.backgroundImage as string, 'image');
      if (d.backgroundMusic) addAsset(d.backgroundMusic as string, 'music');
      if (d.voiceoverAudio) addAsset(d.voiceoverAudio as string, 'voiceover');
    });

    // Also scan entities for reference images and default music
    (currentProject.entities || []).forEach((entity) => {
      const entityInfo = {
        nodeId: entity.id,
        nodeName: `${entity.name} (${entity.category})`,
      };

      if (entity.referenceImage) {
        const url = entity.referenceImage;
        const fp = getAssetFingerprint(url);
        const existing = assetMap.get(fp);
        if (existing) {
          existing.usedInNodes.push(entityInfo);
        } else {
          assetMap.set(fp, {
            id: `img-${assetMap.size}`,
            type: 'image',
            url,
            fingerprint: fp,
            name: names[fp] || '',
            usedInNodes: [entityInfo],
          });
        }
      }

      if (entity.referenceVoice) {
        const url = entity.referenceVoice;
        const fp = getAssetFingerprint(url);
        const existing = assetMap.get(fp);
        if (existing) {
          existing.usedInNodes.push(entityInfo);
        } else {
          assetMap.set(fp, {
            id: `voice-${assetMap.size}`,
            type: 'voiceover',
            url,
            fingerprint: fp,
            name: names[fp] || '',
            usedInNodes: [entityInfo],
          });
        }
      }

      if (entity.defaultMusic) {
        const url = entity.defaultMusic;
        const fp = getAssetFingerprint(url);
        const existing = assetMap.get(fp);
        if (existing) {
          existing.usedInNodes.push(entityInfo);
        } else {
          assetMap.set(fp, {
            id: `music-${assetMap.size}`,
            type: 'music',
            url,
            fingerprint: fp,
            name: names[fp] || '',
            usedInNodes: [entityInfo],
          });
        }
      }
    });

    return Array.from(assetMap.values());
  }, [currentProject]);

  /**
   * All currently used names (for uniqueness validation)
   */
  const usedNames = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a) => {
      if (a.name) set.add(a.name.toLowerCase());
    });
    return set;
  }, [assets]);

  /**
   * Filter assets by the selected category tab
   */
  const filteredAssets = useMemo(() => {
    if (activeTab === 'all') return assets;
    if (activeTab === 'images') return assets.filter((a) => a.type === 'image');
    if (activeTab === 'music') return assets.filter((a) => a.type === 'music');
    return assets.filter((a) => a.type === 'voiceover');
  }, [assets, activeTab]);

  /**
   * Count by type
   */
  const counts = useMemo(() => ({
    all: assets.length,
    images: assets.filter((a) => a.type === 'image').length,
    music: assets.filter((a) => a.type === 'music').length,
    voiceover: assets.filter((a) => a.type === 'voiceover').length,
  }), [assets]);

  /**
   * Start editing an asset name
   */
  const startEditing = useCallback((asset: Asset) => {
    setEditingFingerprint(asset.fingerprint);
    setEditDraft(asset.name);
    setEditError(null);
  }, []);

  /**
   * Save the edited name (with uniqueness validation)
   */
  const saveEdit = useCallback(() => {
    if (!editingFingerprint) return;

    const trimmed = editDraft.trim();

    // Allow clearing the name
    if (!trimmed) {
      updateAssetName(editingFingerprint, '');
      setEditingFingerprint(null);
      setEditError(null);
      return;
    }

    // Check uniqueness: is another asset already using this name?
    const currentAsset = assets.find((a) => a.fingerprint === editingFingerprint);
    const currentName = currentAsset?.name?.toLowerCase() || '';
    if (trimmed.toLowerCase() !== currentName && usedNames.has(trimmed.toLowerCase())) {
      setEditError('This name is already used by another asset');
      return;
    }

    updateAssetName(editingFingerprint, trimmed);
    setEditingFingerprint(null);
    setEditError(null);
  }, [editingFingerprint, editDraft, assets, usedNames, updateAssetName]);

  /**
   * Cancel editing
   */
  const cancelEdit = useCallback(() => {
    setEditingFingerprint(null);
    setEditDraft('');
    setEditError(null);
  }, []);

  /**
   * Delete an asset from all nodes that use it
   */
  const handleDeleteAsset = (asset: Asset) => {
    if (!currentProject) return;

    asset.usedInNodes.forEach(({ nodeId }) => {
      const node = currentProject.nodes.find((n) => n.id === nodeId);
      if (node && node.type === 'scene') {
        const sceneNode = node as SceneNode;
        const updates: Partial<SceneNode['data']> = {};

        if (asset.type === 'image' && sceneNode.data.backgroundImage === asset.url) {
          updates.backgroundImage = undefined;
        }
        if (asset.type === 'music' && sceneNode.data.backgroundMusic === asset.url) {
          updates.backgroundMusic = undefined;
        }
        if (asset.type === 'voiceover' && sceneNode.data.voiceoverAudio === asset.url) {
          updates.voiceoverAudio = undefined;
        }

        if (Object.keys(updates).length > 0) {
          updateNode(nodeId, {
            data: { ...sceneNode.data, ...updates },
          } as Partial<StoryNode>);
        }
      }
    });

    // Also clear references from entities (reference images and default music)
    (currentProject.entities || []).forEach((entity) => {
      if (asset.type === 'image' && entity.referenceImage === asset.url) {
        updateEntity(entity.id, { referenceImage: undefined });
      }
      if (asset.type === 'voiceover' && entity.referenceVoice === asset.url) {
        updateEntity(entity.id, { referenceVoice: undefined });
      }
      if (asset.type === 'music' && entity.defaultMusic === asset.url) {
        updateEntity(entity.id, { defaultMusic: undefined });
      }
    });

    // Also remove the asset name entry
    if (asset.name) {
      updateAssetName(asset.fingerprint, '');
    }

    setDeleteAsset(null);
  };

  /**
   * Get icon for asset type
   */
  const getAssetIcon = (type: Asset['type']) => {
    switch (type) {
      case 'image':
        return <ImageIcon size={20} className="text-blue-400" />;
      case 'music':
        return <Music size={20} className="text-green-400" />;
      case 'voiceover':
        return <Mic size={20} className="text-purple-400" />;
    }
  };

  /**
   * Get default label for asset type (used when no name is set)
   */
  const getAssetLabel = (type: Asset['type']) => {
    switch (type) {
      case 'image':
        return 'Background Image';
      case 'music':
        return 'Background Music';
      case 'voiceover':
        return 'Voiceover';
    }
  };

  /**
   * Truncate URL for display
   */
  const truncateUrl = (url: string) => {
    if (url.startsWith('data:')) {
      const type = url.split(';')[0].split(':')[1];
      return `[Embedded ${type}]`;
    }
    if (url.length > 50) {
      return url.substring(0, 47) + '...';
    }
    return url;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Asset Manager"
      size="lg"
    >
      {/* Category tabs */}
      <div className="flex border-b border-editor-border mb-4">
        {([
          { key: 'all', label: 'All', count: counts.all, icon: null },
          { key: 'images', label: 'Images', count: counts.images, icon: <ImageIcon size={14} className="text-blue-400" /> },
          { key: 'music', label: 'Music', count: counts.music, icon: <Music size={14} className="text-green-400" /> },
          { key: 'voiceover', label: 'Voiceover', count: counts.voiceover, icon: <Mic size={14} className="text-purple-400" /> },
        ] as const).map(({ key, label, count, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === key
                ? 'text-editor-accent border-b-2 border-editor-accent'
                : 'text-editor-muted hover:text-editor-text'
            }`}
          >
            {icon}
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Asset list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredAssets.length === 0 ? (
          <div className="text-center py-12 text-editor-muted">
            <FileQuestion size={48} className="mx-auto mb-4 opacity-50" />
            <p className="mb-2">No assets found</p>
            <p className="text-sm">
              {activeTab === 'all'
                ? 'Add images, music, or voiceovers to your scenes'
                : activeTab === 'images'
                ? 'No background images in your project yet'
                : activeTab === 'music'
                ? 'No background music in your project yet'
                : 'No voiceover files in your project yet'}
            </p>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isEditing = editingFingerprint === asset.fingerprint;

            return (
              <div
                key={asset.fingerprint}
                className="flex items-start gap-3 p-3 bg-editor-surface rounded-lg border border-editor-border"
              >
                {/* Preview */}
                <div className="flex-shrink-0">
                  {asset.type === 'image' ? (
                    <img
                      src={getBlobUrl(asset.url)}
                      alt={asset.name || 'Asset preview'}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-editor-bg rounded-lg flex items-center justify-center">
                      {getAssetIcon(asset.type)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {/* Name row: either display or inline edit */}
                  {isEditing ? (
                    <div className="mb-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editDraft}
                          onChange={(e) => {
                            setEditDraft(e.target.value);
                            setEditError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          placeholder="Enter a unique name..."
                          className="flex-1 px-2 py-1 text-sm bg-editor-bg border border-editor-accent rounded text-editor-text focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={saveEdit}
                          className="p-1 rounded text-green-400 hover:bg-green-400/10"
                          title="Save name"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1 rounded text-editor-muted hover:bg-editor-border"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {editError && (
                        <p className="text-xs text-error mt-1">{editError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-1">
                      {getAssetIcon(asset.type)}
                      <span className="text-sm font-medium text-editor-text">
                        {asset.name || getAssetLabel(asset.type)}
                      </span>
                      {!asset.name && (
                        <span className="text-xs text-editor-muted italic">(unnamed)</span>
                      )}
                      <button
                        onClick={() => startEditing(asset)}
                        className="p-1 rounded text-editor-muted hover:text-editor-accent hover:bg-editor-accent/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ opacity: 1 }}
                        title="Edit name"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-editor-muted truncate mb-2">
                    {truncateUrl(asset.url)}
                  </p>
                  <p className="text-xs text-editor-muted">
                    Used in: {asset.usedInNodes.map((n) => n.nodeName).join(', ')}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => setDeleteAsset(asset)}
                  className="p-2 rounded-lg text-editor-muted hover:text-error hover:bg-error/10 flex-shrink-0"
                  title="Delete from all nodes"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Storage info */}
      {assets.length > 0 && (
        <div className="mt-4 pt-4 border-t border-editor-border">
          <p className="text-xs text-editor-muted">
            Click the pencil icon to give each asset a unique name.
            Names are saved with the project and help you identify assets across scenes.
          </p>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteAsset}
        onClose={() => setDeleteAsset(null)}
        title="Delete Asset"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-error/10 rounded-lg">
            <AlertTriangle className="text-error flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-editor-text font-medium">
                This will remove{deleteAsset?.name ? ` "${deleteAsset.name}"` : ' the asset'} from {deleteAsset?.usedInNodes.length} node(s):
              </p>
              <ul className="mt-2 text-sm text-editor-muted">
                {deleteAsset?.usedInNodes.map((n) => (
                  <li key={n.nodeId}>- {n.nodeName}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteAsset(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteAsset && handleDeleteAsset(deleteAsset)}
            >
              Delete Asset
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
