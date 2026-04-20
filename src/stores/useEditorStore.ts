/**
 * =============================================================================
 * EDITOR STATE STORE (ZUSTAND)
 * =============================================================================
 *
 * This file manages the state of the node editor canvas.
 *
 * WHAT STATE LIVES HERE?
 * - Viewport (pan/zoom position)
 * - Drag state (what's being dragged)
 * - UI panels (which panels are open)
 * - Editor preferences
 *
 * WHY SEPARATE FROM PROJECT STORE?
 * Editor state is UI-specific and doesn't need to be saved with the project.
 * Keeping it separate makes the code cleaner and more performant.
 *
 * =============================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Position } from '@/types';

/**
 * TOOL TYPE
 * The active tool in the editor.
 */
export type EditorTool =
  | 'select'    // Default: select and move nodes
  | 'pan'       // Pan the canvas
  | 'connect';  // Draw connections between nodes

/**
 * PANEL STATE
 * Which panels are currently visible.
 */
export interface PanelState {
  /** Left toolbar visibility */
  toolbar: boolean;
  /** Right inspector visibility */
  inspector: boolean;
  /** MiniMap visibility */
  minimap: boolean;
  /** Variable manager modal */
  variableManager: boolean;
  /** Asset manager modal */
  assetManager: boolean;
}

/**
 * VIEWPORT STATE
 * Current view position and zoom level.
 */
export interface ViewportState {
  /** X offset (pan position) */
  x: number;
  /** Y offset (pan position) */
  y: number;
  /** Zoom level (1 = 100%) */
  zoom: number;
}

/**
 * EDITOR PREFERENCES
 * User preferences for the editor.
 */
export interface EditorPreferences {
  /** Whether to show grid lines */
  showGrid: boolean;
  /** Whether to snap nodes to grid */
  snapToGrid: boolean;
  /** Grid size in pixels */
  gridSize: number;
  /** Whether to show node labels */
  showLabels: boolean;
  /** Whether edges should animate */
  animateEdges: boolean;
  /** Auto-save interval in seconds (0 = disabled) */
  autoSaveInterval: number;
}

/**
 * EDITOR STORE STATE INTERFACE
 */
interface EditorState {
  // ==================== VIEWPORT STATE ====================

  /** Current viewport position and zoom */
  viewport: ViewportState;

  /** Set viewport state */
  setViewport: (viewport: Partial<ViewportState>) => void;

  /** Reset viewport to default */
  resetViewport: () => void;

  /** Center viewport on a position */
  centerOn: (position: Position) => void;

  /** Zoom in */
  zoomIn: () => void;

  /** Zoom out */
  zoomOut: () => void;

  /** Fit all nodes in view */
  fitView: () => void;

  // ==================== TOOL STATE ====================

  /** Currently active tool */
  activeTool: EditorTool;

  /** Set active tool */
  setActiveTool: (tool: EditorTool) => void;

  // ==================== DRAG STATE ====================

  /** Item being dragged from toolbar */
  draggingNodeType: string | null;

  /** Set dragging state */
  setDraggingNodeType: (type: string | null) => void;

  // ==================== PANEL STATE ====================

  /** Panel visibility state */
  panels: PanelState;

  /** Toggle a panel */
  togglePanel: (panel: keyof PanelState) => void;

  /** Open a panel */
  openPanel: (panel: keyof PanelState) => void;

  /** Close a panel */
  closePanel: (panel: keyof PanelState) => void;

  // ==================== PREFERENCES ====================

  /** Editor preferences */
  preferences: EditorPreferences;

  /** Update preferences */
  updatePreferences: (prefs: Partial<EditorPreferences>) => void;

  // ==================== CLIPBOARD ====================

  /** Clipboard contents (for copy/paste) */
  clipboard: {
    nodes: unknown[];
    edges: unknown[];
  } | null;

  /** Copy nodes to clipboard */
  copyToClipboard: (nodes: unknown[], edges: unknown[]) => void;

  /** Clear clipboard */
  clearClipboard: () => void;

  // ==================== UI STATE ====================

  /** Whether context menu is open */
  contextMenuOpen: boolean;

  /** Context menu position */
  contextMenuPosition: Position | null;

  /** Open context menu */
  openContextMenu: (position: Position) => void;

  /** Close context menu */
  closeContextMenu: () => void;

  /** Last mouse position on canvas */
  lastMousePosition: Position;

  /** Update mouse position */
  setMousePosition: (position: Position) => void;

  // ==================== UPLOAD STATE ====================

  /** Number of pending file uploads */
  pendingUploads: number;

  /** Increment pending uploads */
  startUpload: () => void;

  /** Decrement pending uploads */
  finishUpload: () => void;

  /** Check if any uploads are pending */
  hasUploads: () => boolean;

  // ==================== FOCUS-ON-RETURN STATE ====================

  /**
   * Node ID to center the canvas on when the editor next mounts.
   * Set by AdventureEngine before navigating back to the editor, so
   * the user returns to the node they were last playing.
   * Cleared after the editor consumes it.
   */
  focusNodeId: string | null;

  /** Set the node ID to focus on when returning to editor */
  setFocusNodeId: (nodeId: string | null) => void;

  // ==================== DUAL CANVAS STATE (CO-WRITE MODE) ====================

  /**
   * Active canvas tab in co-write mode.
   *
   * 'story' — shows scene, choice, modifier, comment, storyRoot, and plot nodes
   * 'character' — shows character nodes and relationship edges
   *
   * In game mode this value is ignored (all node types are always shown).
   */
  activeCanvas: 'story' | 'character' | 'stateChange';

  /** Switch between the story, character, and state-change canvas tabs */
  setActiveCanvas: (canvas: 'story' | 'character' | 'stateChange') => void;

  /**
   * Entity ID to pre-select when opening the State Change Canvas.
   * Set this before switching to 'stateChange' canvas to deep-link
   * from the entity manager.
   */
  stateChangeEntityId: string | null;
  setStateChangeEntityId: (id: string | null) => void;
}

/**
 * DEFAULT VIEWPORT
 */
const DEFAULT_VIEWPORT: ViewportState = {
  x: 0,
  y: 0,
  zoom: 1,
};

/**
 * DEFAULT PANEL STATE
 */
const DEFAULT_PANELS: PanelState = {
  toolbar: true,
  inspector: true,
  minimap: true,
  variableManager: false,
  assetManager: false,
};

/**
 * DEFAULT PREFERENCES
 */
const DEFAULT_PREFERENCES: EditorPreferences = {
  showGrid: true,
  snapToGrid: true,
  gridSize: 20,
  showLabels: true,
  animateEdges: true,
  autoSaveInterval: 30,
};

/**
 * ZOOM LIMITS
 */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

/**
 * CREATE EDITOR STORE
 *
 * Uses `persist` middleware to save preferences to localStorage.
 * Only preferences are persisted, not transient UI state.
 */
export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      // ==================== INITIAL STATE ====================

      viewport: DEFAULT_VIEWPORT,
      activeTool: 'select',
      draggingNodeType: null,
      panels: DEFAULT_PANELS,
      preferences: DEFAULT_PREFERENCES,
      clipboard: null,
      contextMenuOpen: false,
      contextMenuPosition: null,
      lastMousePosition: { x: 0, y: 0 },
      pendingUploads: 0,
      focusNodeId: null,
      activeCanvas: 'story',
      stateChangeEntityId: null,

      // ==================== VIEWPORT ACTIONS ====================

      setViewport: (viewport) => {
        set((state) => ({
          viewport: { ...state.viewport, ...viewport },
        }));
      },

      resetViewport: () => {
        set({ viewport: DEFAULT_VIEWPORT });
      },

      centerOn: (position) => {
        // This would need the canvas dimensions to properly center
        // For now, just set the position directly
        set((state) => ({
          viewport: {
            ...state.viewport,
            x: -position.x + 400, // Approximate center offset
            y: -position.y + 300,
          },
        }));
      },

      zoomIn: () => {
        set((state) => ({
          viewport: {
            ...state.viewport,
            zoom: Math.min(state.viewport.zoom + ZOOM_STEP, MAX_ZOOM),
          },
        }));
      },

      zoomOut: () => {
        set((state) => ({
          viewport: {
            ...state.viewport,
            zoom: Math.max(state.viewport.zoom - ZOOM_STEP, MIN_ZOOM),
          },
        }));
      },

      fitView: () => {
        // This would need access to all node positions
        // Placeholder for now
        set({ viewport: DEFAULT_VIEWPORT });
      },

      // ==================== TOOL ACTIONS ====================

      setActiveTool: (tool) => {
        set({ activeTool: tool });
        console.log('[EditorStore] Active tool:', tool);
      },

      // ==================== DRAG ACTIONS ====================

      setDraggingNodeType: (type) => {
        set({ draggingNodeType: type });
      },

      // ==================== PANEL ACTIONS ====================

      togglePanel: (panel) => {
        set((state) => ({
          panels: {
            ...state.panels,
            [panel]: !state.panels[panel],
          },
        }));
      },

      openPanel: (panel) => {
        set((state) => ({
          panels: {
            ...state.panels,
            [panel]: true,
          },
        }));
      },

      closePanel: (panel) => {
        set((state) => ({
          panels: {
            ...state.panels,
            [panel]: false,
          },
        }));
      },

      // ==================== PREFERENCE ACTIONS ====================

      updatePreferences: (prefs) => {
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        }));
      },

      // ==================== CLIPBOARD ACTIONS ====================

      copyToClipboard: (nodes, edges) => {
        set({ clipboard: { nodes, edges } });
        console.log('[EditorStore] Copied to clipboard:', nodes.length, 'nodes');
      },

      clearClipboard: () => {
        set({ clipboard: null });
      },

      // ==================== UI ACTIONS ====================

      openContextMenu: (position) => {
        set({
          contextMenuOpen: true,
          contextMenuPosition: position,
        });
      },

      closeContextMenu: () => {
        set({
          contextMenuOpen: false,
          contextMenuPosition: null,
        });
      },

      setMousePosition: (position) => {
        set({ lastMousePosition: position });
      },

      // ==================== UPLOAD ACTIONS ====================

      startUpload: () => {
        set((state) => ({ pendingUploads: state.pendingUploads + 1 }));
      },

      finishUpload: () => {
        set((state) => ({ pendingUploads: Math.max(0, state.pendingUploads - 1) }));
      },

      hasUploads: () => {
        return get().pendingUploads > 0;
      },

      // ==================== FOCUS-ON-RETURN ACTIONS ====================

      setFocusNodeId: (nodeId) => {
        set({ focusNodeId: nodeId });
      },

      // ==================== DUAL CANVAS ACTIONS ====================

      setActiveCanvas: (canvas) => {
        set({ activeCanvas: canvas });
      },

      setStateChangeEntityId: (id) => {
        set({ stateChangeEntityId: id });
      },
    }),
    {
      // Persist configuration
      name: 'storyweaver-editor',
      // Only persist preferences, not transient state
      partialize: (state) => ({
        preferences: state.preferences,
        panels: {
          toolbar: state.panels.toolbar,
          inspector: state.panels.inspector,
          minimap: state.panels.minimap,
        },
      }),
    }
  )
);
