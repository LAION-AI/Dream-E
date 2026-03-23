/**
 * =============================================================================
 * TOOLBAR COMPONENT
 * =============================================================================
 *
 * The left sidebar in the editor containing draggable node types.
 *
 * GAME MODE NODES:
 * - Scene Node (Blue) - Story content
 * - Choice Node (Yellow) - Branching logic
 * - Modifier Node (Green) - Variable operations
 * - Comment Box (Gray) - Designer notes
 *
 * CO-WRITE MODE — STORY CANVAS NODES:
 * - All game-mode nodes above, PLUS:
 * - Story Root (Purple) - High-level story metadata (max 1 per project)
 * - Plot Arc (Amber) - Narrative arcs branching from the story root
 *
 * CO-WRITE MODE — CHARACTER CANVAS NODES:
 * - Character (Teal) - Linked to an entity in the project store
 *
 * DRAG AND DROP:
 * Users drag nodes from here to the canvas to create them.
 *
 * =============================================================================
 */

import React from 'react';
import {
  Film,
  GitBranch,
  Calculator,
  MessageSquare,
  MessageCircle,
  Trash2,
  Copy,
  Scissors,
  Clipboard,
  ListX,
  BookOpen,
  FileText,
  User,
  Layers,
} from 'lucide-react';

/**
 * NODE TYPE DEFINITION
 * Metadata for each draggable node item in the toolbar.
 *
 * The `icon` field accepts any Lucide icon component. We use `any` for the
 * icon type because LucideIcon's ForwardRefExoticComponent type has complex
 * generic constraints that don't match a simple React.ComponentType — this
 * is a known Lucide React type quirk. The icons are only used inside JSX
 * as `<node.icon size={24} ... />` which is always safe.
 */
interface NodeTypeInfo {
  type: string;
  label: string;
  description: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * GAME MODE NODE TYPES
 * The base set of nodes available in every project mode.
 */
const gameNodeTypes: NodeTypeInfo[] = [
  {
    type: 'scene',
    label: 'Scene Node',
    description: 'Display story content',
    icon: Film,
    color: '#3b82f6',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500',
  },
  {
    type: 'choice',
    label: 'Choice Node',
    description: 'Branch based on condition',
    icon: GitBranch,
    color: '#eab308',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500',
  },
  {
    type: 'modifier',
    label: 'Modifier Node',
    description: 'Change variable values',
    icon: Calculator,
    color: '#22c55e',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500',
  },
  {
    type: 'comment',
    label: 'Comment Box',
    description: 'Add notes',
    icon: MessageSquare,
    color: '#6b7280',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500',
  },
];

/**
 * CO-WRITE STORY CANVAS EXTRA NODE TYPES
 * These are appended to the game node types when viewing the story canvas
 * in co-write mode.
 */
const cowriteStoryExtraTypes: NodeTypeInfo[] = [
  {
    type: 'storyRoot',
    label: 'Story Root',
    description: 'Central story metadata',
    icon: BookOpen,
    color: '#a855f7',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500',
  },
  {
    type: 'plot',
    label: 'Plot Arc',
    description: 'Narrative arc / subplot',
    icon: FileText,
    color: '#f59e0b',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500',
  },
  {
    type: 'act',
    label: 'Act',
    description: 'Story act (e.g., Act 1, 2, 3)',
    icon: Layers,
    color: '#6366f1',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500',
  },
];

/**
 * CO-WRITE CHARACTER CANVAS NODE TYPES
 * The only node type available when viewing the character canvas.
 */
const cowriteCharacterTypes: NodeTypeInfo[] = [
  {
    type: 'character',
    label: 'Character',
    description: 'Add a character to the web',
    icon: User,
    color: '#14b8a6',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500',
  },
];

/**
 * TOOLBAR PROPS
 */
interface ToolbarProps {
  /** ID of currently selected edge (if any) */
  selectedEdgeId?: string | null;
  /** Whether a node is currently selected */
  hasSelectedNode?: boolean;
  /** Whether there's a node in the clipboard */
  hasCopiedNode?: boolean;
  /** Number of nodes in multi-selection (box-drag or Shift+click) */
  selectedCount?: number;
  /** Callback to delete the selected edge */
  onDeleteEdge?: () => void;
  /** Callback to delete the selected node */
  onDeleteNode?: () => void;
  /** Callback to delete all multi-selected nodes */
  onDeleteSelected?: () => void;
  /** Callback to delete all descendants of the selected node */
  onDeleteAllAfter?: () => void;
  /** Callback to cut the selected node (copy + delete) */
  onCutNode?: () => void;
  /** Callback to copy the selected node */
  onCopyNode?: () => void;
  /** Callback to paste the copied node */
  onPasteNode?: () => void;

  // ── CO-WRITE MODE PROPS ──

  /** Whether the editor is in co-write mode */
  isCowriteMode?: boolean;
  /** Which canvas tab is active in co-write mode */
  activeCanvas?: 'story' | 'character';
  /** Whether the project already has a StoryRoot node (max 1 allowed) */
  hasStoryRoot?: boolean;

  // ── CHAT TOGGLE ──

  /** Callback to toggle the chat sliding panel open/closed */
  onChatToggle?: () => void;
  /** Whether the chat panel is currently open (for visual active indicator) */
  isChatOpen?: boolean;
}

/**
 * TOOLBAR COMPONENT
 *
 * Renders draggable node items based on the current mode and canvas tab.
 * In game mode, shows the four standard node types.
 * In co-write mode, the visible items depend on which canvas tab is active:
 * - Story Canvas: standard nodes + Story Root (if none exists) + Plot Arc
 * - Character Canvas: Character node only
 *
 * Action buttons (cut/copy/paste/delete) are always shown when relevant,
 * regardless of mode.
 */
export default function Toolbar({
  selectedEdgeId,
  hasSelectedNode,
  hasCopiedNode,
  selectedCount = 0,
  onDeleteEdge,
  onDeleteNode,
  onDeleteSelected,
  onDeleteAllAfter,
  onCutNode,
  onCopyNode,
  onPasteNode,
  isCowriteMode = false,
  activeCanvas = 'story',
  hasStoryRoot = false,
  onChatToggle,
  isChatOpen = false,
}: ToolbarProps) {
  /**
   * Handle drag start
   * Sets the node type data for the drop handler.
   */
  const onDragStart = (
    event: React.DragEvent,
    nodeType: string
  ) => {
    event.dataTransfer.setData('application/dream-e-node', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  /**
   * COMPUTE VISIBLE NODE TYPES
   *
   * Game mode: always show the four standard types.
   * Co-write Story Canvas: standard + story root (if not yet placed) + plot arc.
   * Co-write Character Canvas: character only.
   */
  let visibleNodeTypes: NodeTypeInfo[];

  if (!isCowriteMode) {
    // Game mode — unchanged from before
    visibleNodeTypes = gameNodeTypes;
  } else if (activeCanvas === 'character') {
    // Co-write character canvas — only character nodes
    visibleNodeTypes = cowriteCharacterTypes;
  } else {
    // Co-write story canvas — scene + comment + story extras (no choice/modifier).
    // Choice and modifier nodes are game-mode only; the story canvas focuses on
    // high-level narrative structure (scenes, plot arcs, acts, comments).
    const storyBaseTypes = gameNodeTypes.filter(
      n => n.type !== 'choice' && n.type !== 'modifier'
    );
    const extras = hasStoryRoot
      ? cowriteStoryExtraTypes.filter(n => n.type !== 'storyRoot')
      : cowriteStoryExtraTypes;
    visibleNodeTypes = [...storyBaseTypes, ...extras];
  }

  return (
    <aside className="w-toolbar bg-editor-surface border-r border-editor-border flex flex-col py-4 gap-2">
      {/* Title (hidden, for accessibility) */}
      <h2 className="sr-only">Node Toolbar</h2>

      {/* Node buttons */}
      {visibleNodeTypes.map((node) => (
        <div
          key={node.type}
          draggable
          onDragStart={(e) => onDragStart(e, node.type)}
          className="group relative mx-2"
        >
          {/* Node button */}
          <button
            className={`
              w-full aspect-square rounded-lg
              ${node.bgColor} border-2 ${node.borderColor}
              flex flex-col items-center justify-center
              cursor-grab active:cursor-grabbing
              hover:scale-105 transition-transform
            `}
            title={node.label}
          >
            <node.icon
              size={24}
              style={{ color: node.color }}
            />
          </button>

          {/* Tooltip */}
          <div className="
            absolute left-full top-1/2 -translate-y-1/2 ml-3
            opacity-0 group-hover:opacity-100
            pointer-events-none
            transition-opacity
            z-50
          ">
            <div className="bg-editor-surface border border-editor-border rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
              <p className="font-medium text-editor-text text-sm">
                {node.label}
              </p>
              <p className="text-xs text-editor-muted">
                {node.description}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Separator line */}
      <div className="h-px bg-editor-border mx-3 my-2" />

      {/* Action buttons */}
      <div className="flex flex-col gap-2 mx-2">
        {/* Cut Node button - shown when a node is selected */}
        {hasSelectedNode && (
          <button
            onClick={onCutNode}
            className="
              w-full aspect-square rounded-lg
              bg-orange-500/10 border-2 border-orange-500
              flex flex-col items-center justify-center
              hover:bg-orange-500/20 transition-colors
            "
            title="Cut Node (Ctrl+X)"
          >
            <Scissors size={24} className="text-orange-500" />
          </button>
        )}

        {/* Copy Node button - shown when a node is selected */}
        {hasSelectedNode && (
          <button
            onClick={onCopyNode}
            className="
              w-full aspect-square rounded-lg
              bg-blue-500/10 border-2 border-blue-500
              flex flex-col items-center justify-center
              hover:bg-blue-500/20 transition-colors
            "
            title="Copy Node (Ctrl+C)"
          >
            <Copy size={24} className="text-blue-500" />
          </button>
        )}

        {/* Paste Node button - shown when there's a copied node */}
        {hasCopiedNode && (
          <button
            onClick={onPasteNode}
            className="
              w-full aspect-square rounded-lg
              bg-green-500/10 border-2 border-green-500
              flex flex-col items-center justify-center
              hover:bg-green-500/20 transition-colors
            "
            title="Paste Node (Ctrl+V)"
          >
            <Clipboard size={24} className="text-green-500" />
          </button>
        )}

        {/* Delete Selected button - shown when multiple nodes are box-selected */}
        {selectedCount > 1 && (
          <button
            onClick={onDeleteSelected}
            className="
              w-full rounded-lg py-2
              bg-red-500/20 border-2 border-red-500
              flex flex-col items-center justify-center
              hover:bg-red-500/30 transition-colors
            "
            title={`Delete ${selectedCount} selected nodes (Delete key)`}
          >
            <Trash2 size={20} className="text-red-400" />
            <span className="text-[10px] text-red-400 mt-0.5">{selectedCount}</span>
          </button>
        )}

        {/* Delete Node button - shown when a single node is selected */}
        {hasSelectedNode && selectedCount <= 1 && (
          <button
            onClick={onDeleteNode}
            className="
              w-full aspect-square rounded-lg
              bg-red-500/10 border-2 border-red-500
              flex flex-col items-center justify-center
              hover:bg-red-500/20 transition-colors
            "
            title="Delete Node (Delete or Backspace)"
          >
            <Trash2 size={24} className="text-red-500" />
          </button>
        )}

        {/* Delete All After button - shown when a single node is selected */}
        {hasSelectedNode && selectedCount <= 1 && (
          <button
            onClick={onDeleteAllAfter}
            className="
              w-full aspect-square rounded-lg
              bg-orange-500/10 border-2 border-orange-500
              flex flex-col items-center justify-center
              hover:bg-orange-500/20 transition-colors
            "
            title="Delete all nodes after this one (all descendants)"
          >
            <ListX size={24} className="text-orange-500" />
          </button>
        )}

        {/* Delete Edge button - shown when an edge is selected */}
        {selectedEdgeId && (
          <button
            onClick={onDeleteEdge}
            className="
              w-full aspect-square rounded-lg
              bg-red-500/10 border-2 border-red-500
              flex flex-col items-center justify-center
              hover:bg-red-500/20 transition-colors
            "
            title="Delete Connection (Delete or Ctrl+X)"
          >
            <Trash2 size={24} className="text-red-500" />
          </button>
        )}
      </div>

      {/* Separator — pushes the chat button and help text to the bottom */}
      <div className="flex-1" />

      {/* Chat toggle button — shown in co-write mode so the author can open
       * the AI chat panel from the toolbar without reaching for Ctrl+Shift+C.
       * Highlighted when the chat panel is currently open. */}
      {isCowriteMode && onChatToggle && (
        <div className="mx-2">
          <button
            onClick={onChatToggle}
            className={`
              w-full aspect-square rounded-lg
              flex flex-col items-center justify-center
              transition-colors
              ${isChatOpen
                ? 'bg-accent/20 border-2 border-accent text-accent'
                : 'bg-editor-bg/50 border-2 border-editor-border text-editor-muted hover:text-editor-text hover:bg-editor-bg'}
            `}
            title="AI Chat (Ctrl+Shift+C)"
          >
            <MessageCircle size={24} />
          </button>
        </div>
      )}

      {/* Help text at bottom */}
      <div className="px-2 text-center">
        <p className="text-xs text-editor-muted">
          Drag to canvas
        </p>
      </div>
    </aside>
  );
}
