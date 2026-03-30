/**
 * =============================================================================
 * INSPECTOR COMPONENT (SCREEN C)
 * =============================================================================
 *
 * The right sidebar panel for editing node and edge properties.
 *
 * FEATURES:
 * - Context-sensitive: shows different content based on selected node/edge type
 * - Glassmorphism design (semi-transparent with blur)
 * - Tabs for different property categories
 * - Wider layout when in co-write mode (40vw vs 25vw)
 *
 * NODE-SPECIFIC INSPECTORS:
 * - Scene: Media / Content / Outputs tabs
 * - Choice: Condition configuration
 * - Modifier: Math / Set / Random modes
 * - Comment: Text and color
 * - StoryRoot: Title, genre, characters, summary — the story blueprint
 * - Plot: Plot arc name, type, description
 * - Character: Entity profile viewer/editor
 *
 * EDGE-SPECIFIC INSPECTORS:
 * - Relationship: Type, description, status, history (character canvas edges)
 *
 * =============================================================================
 */

import React from 'react';
import { X, Presentation } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProjectStore } from '@stores/useProjectStore';
import { useEditorStore } from '@stores/useEditorStore';
import { IconButton } from '@components/common';
import SceneInspector from './SceneInspector';
import ChoiceInspector from './ChoiceInspector';
import ModifierInspector from './ModifierInspector';
import CommentInspector from './CommentInspector';
import StoryRootInspector from './StoryRootInspector';
import PlotInspector from './PlotInspector';
import CharacterNodeInspector from './CharacterNodeInspector';
import ActInspector from './ActInspector';
import CoWriteSceneInspector from './CoWriteSceneInspector';
import RelationshipInspector from './RelationshipInspector';
import type { StoryRootNode, PlotNode, CharacterNode, ActNode, CoWriteSceneNode } from '@/types';

/**
 * INSPECTOR COMPONENT
 * Container for node-specific and edge-specific inspector panels.
 *
 * SELECTION PRIORITY:
 * 1. If a node is selected, show the node inspector.
 * 2. If an edge is selected (and no node), show the edge inspector.
 * 3. If nothing is selected, render nothing.
 *
 * This priority order matters because selecting a node automatically
 * deselects any edge (and vice versa) in the project store.
 */
/** Set of co-write node types that support the "Photo Story from here" action */
const PHOTO_STORY_NODE_TYPES = new Set(['storyRoot', 'plot', 'act', 'cowriteScene']);

export default function Inspector() {
  // Use targeted selectors to avoid re-rendering on unrelated store changes
  const selectedNodeId = useProjectStore(s => s.selectedNodeId);
  const selectedEdgeId = useProjectStore(s => s.selectedEdgeId);
  const getNode = useProjectStore(s => s.getNode);
  const getEdge = useProjectStore(s => s.getEdge);
  const selectNode = useProjectStore(s => s.selectNode);
  const selectEdge = useProjectStore(s => s.selectEdge);
  const { closePanel } = useEditorStore();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  /**
   * Detect co-write mode from the URL path.
   * In co-write mode, the inspector should be wider (40vw) to give
   * more room for the detailed story-building fields.
   */
  const location = useLocation();
  const isCowriteMode = location.pathname.startsWith('/cowrite');

  // Get the selected node data
  const selectedNode = selectedNodeId ? getNode(selectedNodeId) : null;

  // Get the selected edge data (only relevant if no node is selected)
  const selectedEdge = !selectedNode && selectedEdgeId ? getEdge(selectedEdgeId) : null;

  // If nothing selected, don't render
  if (!selectedNode && !selectedEdge) {
    return null;
  }

  // ==================== NODE INSPECTOR RENDERING ====================

  /**
   * Determine which inspector to show based on node type.
   * Each node type has its own specialized inspector component.
   */
  const renderNodeInspector = () => {
    if (!selectedNode) return null;

    switch (selectedNode.type) {
      case 'scene':
        return <SceneInspector node={selectedNode} />;
      case 'choice':
        return <ChoiceInspector node={selectedNode} />;
      case 'modifier':
        return <ModifierInspector node={selectedNode} />;
      case 'comment':
        return <CommentInspector node={selectedNode} />;
      case 'storyRoot':
        return <StoryRootInspector node={selectedNode as StoryRootNode} />;
      case 'plot':
        return <PlotInspector node={selectedNode as PlotNode} />;
      case 'character':
        return <CharacterNodeInspector node={selectedNode as CharacterNode} />;
      case 'act':
        return <ActInspector node={selectedNode as ActNode} />;
      case 'cowriteScene':
        return <CoWriteSceneInspector node={selectedNode as CoWriteSceneNode} />;
      default:
        return (
          <div className="p-4 text-editor-muted">
            Unknown node type
          </div>
        );
    }
  };

  /**
   * Determine which inspector to show for edges.
   * Currently only relationship edges (between character nodes) have inspectors.
   */
  const renderEdgeInspector = () => {
    if (!selectedEdge) return null;
    // Show the relationship inspector for any edge with relationship data,
    // or for any edge between character nodes.
    return <RelationshipInspector edge={selectedEdge} />;
  };

  // ==================== TITLE AND ACCENT HELPERS ====================

  /**
   * Get the inspector panel title based on the selected item.
   */
  const getTitle = (): string => {
    if (selectedNode) {
      switch (selectedNode.type) {
        case 'scene':
          return 'Scene Node';
        case 'choice':
          return 'Choice Node';
        case 'modifier':
          return 'Modifier Node';
        case 'comment':
          return 'Comment';
        case 'storyRoot':
          return 'Story Root';
        case 'plot':
          return 'Plot Arc';
        case 'character':
          return 'Character';
        case 'act':
          return 'Act';
        case 'cowriteScene':
          return 'Scene';
        default:
          return 'Inspector';
      }
    }
    if (selectedEdge) {
      return 'Relationship';
    }
    return 'Inspector';
  };

  /**
   * Get the color accent for the inspector border based on the selected item.
   * Co-writing node types get distinct accent colors to help distinguish them
   * visually from the main editor's node types.
   */
  const getAccentColor = (): string => {
    if (selectedNode) {
      switch (selectedNode.type) {
        case 'scene':
          return 'border-node-scene';
        case 'choice':
          return 'border-node-choice';
        case 'modifier':
          return 'border-node-modifier';
        case 'comment':
          return 'border-node-comment';
        case 'storyRoot':
          return 'border-purple-500';
        case 'plot':
          return 'border-amber-500';
        case 'character':
          return 'border-cyan-500';
        case 'act':
          return 'border-indigo-500';
        case 'cowriteScene':
          return 'border-emerald-500';
        default:
          return 'border-editor-border';
      }
    }
    if (selectedEdge) {
      return 'border-pink-500';
    }
    return 'border-editor-border';
  };

  // ==================== CLOSE HANDLER ====================

  /**
   * Close the inspector by deselecting whatever is selected.
   */
  const handleClose = () => {
    if (selectedNodeId) {
      selectNode(null);
    } else if (selectedEdgeId) {
      selectEdge(null);
    }
  };

  // ==================== RENDER ====================

  /**
   * Width classes:
   * - In co-write mode, use a wider panel (40vw) because story-building
   *   fields benefit from more horizontal space.
   * - In normal editor mode, use the standard inspector width (25vw).
   */
  const widthClasses = isCowriteMode
    ? 'w-[40vw] min-w-[420px] max-w-[800px]'
    : 'w-inspector min-w-[380px] max-w-[600px]';

  return (
    <aside
      className={`
        ${widthClasses}
        glass-panel
        border-l-2 ${getAccentColor()}
        flex flex-col
        animate-slide-in-right
        overflow-hidden
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border">
        <h3 className="font-semibold text-editor-text">
          {getTitle()}
        </h3>
        <div className="flex items-center gap-1">
          {/* Photo Story from here — only for co-write node types */}
          {isCowriteMode && selectedNode && PHOTO_STORY_NODE_TYPES.has(selectedNode.type) && projectId && (
            <button
              onClick={() => navigate(`/cowrite/story/${projectId}?startNode=${selectedNode.id}`)}
              className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded transition-colors"
              title="Photo Story from here"
            >
              <Presentation size={16} />
            </button>
          )}
          <IconButton
            icon={<X size={18} />}
            label="Close inspector"
            variant="ghost"
            size="sm"
            onClick={handleClose}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {selectedNode ? renderNodeInspector() : renderEdgeInspector()}
      </div>
    </aside>
  );
}
