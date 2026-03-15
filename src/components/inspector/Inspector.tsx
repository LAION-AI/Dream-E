/**
 * =============================================================================
 * INSPECTOR COMPONENT (SCREEN C)
 * =============================================================================
 *
 * The right sidebar panel for editing node properties.
 *
 * FEATURES:
 * - Context-sensitive: shows different content based on selected node type
 * - Glassmorphism design (semi-transparent with blur)
 * - Tabs for different property categories
 *
 * NODE-SPECIFIC INSPECTORS:
 * - Scene: Media / Content / Outputs tabs
 * - Choice: Condition configuration
 * - Modifier: Math / Set / Random modes
 * - Comment: Text and color
 *
 * =============================================================================
 */

import React from 'react';
import { X } from 'lucide-react';
import { useProjectStore } from '@stores/useProjectStore';
import { useEditorStore } from '@stores/useEditorStore';
import { IconButton } from '@components/common';
import SceneInspector from './SceneInspector';
import ChoiceInspector from './ChoiceInspector';
import ModifierInspector from './ModifierInspector';
import CommentInspector from './CommentInspector';

/**
 * INSPECTOR COMPONENT
 * Container for node-specific inspector panels.
 */
export default function Inspector() {
  // Use targeted selectors to avoid re-rendering on unrelated store changes
  const selectedNodeId = useProjectStore(s => s.selectedNodeId);
  const getNode = useProjectStore(s => s.getNode);
  const selectNode = useProjectStore(s => s.selectNode);
  const { closePanel } = useEditorStore();

  // Get the selected node data
  const selectedNode = selectedNodeId ? getNode(selectedNodeId) : null;

  // If no node selected, don't render
  if (!selectedNode) {
    return null;
  }

  // Determine which inspector to show based on node type
  const renderInspector = () => {
    switch (selectedNode.type) {
      case 'scene':
        return <SceneInspector node={selectedNode} />;
      case 'choice':
        return <ChoiceInspector node={selectedNode} />;
      case 'modifier':
        return <ModifierInspector node={selectedNode} />;
      case 'comment':
        return <CommentInspector node={selectedNode} />;
      default:
        return (
          <div className="p-4 text-editor-muted">
            Unknown node type
          </div>
        );
    }
  };

  // Get title based on node type
  const getTitle = () => {
    switch (selectedNode.type) {
      case 'scene':
        return 'Scene Node';
      case 'choice':
        return 'Choice Node';
      case 'modifier':
        return 'Modifier Node';
      case 'comment':
        return 'Comment';
      default:
        return 'Inspector';
    }
  };

  // Get color accent based on node type
  const getAccentColor = () => {
    switch (selectedNode.type) {
      case 'scene':
        return 'border-node-scene';
      case 'choice':
        return 'border-node-choice';
      case 'modifier':
        return 'border-node-modifier';
      case 'comment':
        return 'border-node-comment';
      default:
        return 'border-editor-border';
    }
  };

  return (
    <aside
      className={`
        w-inspector min-w-[380px] max-w-[600px]
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
        <IconButton
          icon={<X size={18} />}
          label="Close inspector"
          variant="ghost"
          size="sm"
          onClick={() => selectNode(null)}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {renderInspector()}
      </div>
    </aside>
  );
}
