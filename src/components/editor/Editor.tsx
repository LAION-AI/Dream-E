/**
 * =============================================================================
 * EDITOR COMPONENT (SCREEN B)
 * =============================================================================
 *
 * The main node editor canvas where users design their stories.
 *
 * FEATURES:
 * - Infinite canvas with pan and zoom
 * - Drag nodes from toolbar
 * - Connect nodes with edges
 * - Inspector panel for editing node details
 * - Variable manager
 * - Play/Test button
 *
 * LAYOUT:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ ← Back    Project Title        Variables  Play  Assets     │
 * ├────┬────────────────────────────────────────────────┬───────┤
 * │    │                                                │       │
 * │ T  │                                                │  I    │
 * │ O  │           Canvas (React Flow)                  │  N    │
 * │ O  │                                                │  S    │
 * │ L  │                                                │  P    │
 * │ B  │                                                │  E    │
 * │ A  │                                    ┌─────────┐ │  C    │
 * │ R  │                                    │ MiniMap │ │  T    │
 * │    │                                    └─────────┘ │  O    │
 * │    │                                                │  R    │
 * └────┴────────────────────────────────────────────────┴───────┘
 *
 * =============================================================================
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  Play,
  Save,
  Download,
  Upload,
  Settings,
  Database,
  Image as ImageIcon,
  Undo2,
  Redo2,
  HelpCircle,
  BookOpen,
  Users,
  MapPin,
  Package,
  Lightbulb,
  LayoutGrid,
  MessageCircle,
  StickyNote,
  Trash2,
  Sparkles,
  X,
} from 'lucide-react';
import { useProjectStore } from '@stores/useProjectStore';
import { useEditorStore } from '@stores/useEditorStore';
import { Button, Modal } from '@components/common';
import { generateId } from '@/utils/idGenerator';
import type { StoryNode, StoryEdge, SceneNode, ChoiceNode, ModifierNode, EntityCategory } from '@/types';

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { current } from 'immer';
import * as projectsDB from '@/db/projectsDB';
import { groupNodesByDepth } from '@/utils/graphDepth';
import { rehydrateForSave } from '@/utils/blobCache';

// Import modals
import VariableManager from '../variables/VariableManager';
import AssetManager from '../assets/AssetManager';
import HelpModal from './HelpModal';
import EntityManager from '../entities/EntityManager';
import NotesEditor from '../notes/NotesEditor';
import { AISettingsModal } from '../settings/AISettingsModal';
import ChatWindow from '../chat/ChatWindow';

// Import custom node components
import SceneNodeComponent from '../nodes/SceneNode';
import ChoiceNodeComponent from '../nodes/ChoiceNode';
import ModifierNodeComponent from '../nodes/ModifierNode';
import CommentNodeComponent from '../nodes/CommentNode';
import StoryRootNodeComponent from '../nodes/StoryRootNode';
import PlotNodeComponent from '../nodes/PlotNode';
import CharacterNodeComponent from '../nodes/CharacterNode';
import ActNodeComponent from '../nodes/ActNode';

// Import custom edge components
import RelationshipEdge from '../edges/RelationshipEdge';

// Import toolbar, inspector, and canvas tab bar
import Toolbar from './Toolbar';
import Inspector from '../inspector/Inspector';
import CanvasTabBar from './CanvasTabBar';

/**
 * NODE TYPES REGISTRY
 * Maps node type strings to React components.
 * React Flow uses this to render the correct component for each node.
 *
 * Includes both game-mode nodes (scene, choice, modifier, comment) and
 * co-write-mode nodes (storyRoot, plot, character). All types are registered
 * unconditionally — canvas filtering in co-write mode controls which nodes
 * are visible on each tab without needing to swap the registry.
 */
const nodeTypes: NodeTypes = {
  scene: SceneNodeComponent,
  choice: ChoiceNodeComponent,
  modifier: ModifierNodeComponent,
  comment: CommentNodeComponent,
  storyRoot: StoryRootNodeComponent,
  plot: PlotNodeComponent,
  character: CharacterNodeComponent,
  act: ActNodeComponent,
};

/**
 * NODE TYPE SETS FOR DUAL-CANVAS FILTERING (CO-WRITE MODE)
 *
 * These Sets are module-level constants so the sync effect can reference
 * them without allocating new objects on every render cycle.
 *
 * Story Canvas includes the "standard" game nodes (scene, choice, modifier,
 * comment) PLUS the co-write-only structural nodes (storyRoot, plot).
 *
 * Character Canvas only includes character nodes. Relationship edges between
 * characters are handled by the edge filtering logic (both endpoints must
 * be in the visible node set).
 */
const STORY_NODE_TYPES = new Set(['scene', 'comment', 'storyRoot', 'plot', 'act']);
const CHARACTER_NODE_TYPES = new Set(['character']);

/**
 * EDITOR WRAPPER
 * Provides ReactFlowProvider context so the inner component can use useReactFlow().
 */
export default function Editor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}

/**
 * EDITOR COMPONENT (INNER)
 * Main node editor interface. Wrapped in ReactFlowProvider by the outer component.
 */
function EditorInner() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  // Detect if we're under the /cowrite route prefix to navigate back correctly.
  const isCowriteMode = location.pathname.startsWith('/cowrite');

  // ── R1 FIX: GRANULAR SELECTORS ──
  // Instead of selecting the entire project (which triggers re-render on ANY
  // mutation — notes, chat, entities, isDirty, etc.), select only the fields
  // the sync effect actually needs. Immer only creates new references for
  // fields that were mutated, so subscribing to `project.nodes` won't trigger
  // a re-render when only `project.notes` changed. For operations that need
  // the full project (save, export, focus), use getState() at call time.
  const projectNodes = useProjectStore(s => s.currentProject?.nodes);
  const projectEdges = useProjectStore(s => s.currentProject?.edges);
  const projectSettings = useProjectStore(s => s.currentProject?.settings);
  const projectTitle = useProjectStore(s => s.currentProject?.info?.title);
  const hasProject = useProjectStore(s => !!s.currentProject);
  const loadProject = useProjectStore(s => s.loadProject);
  const saveProject = useProjectStore(s => s.saveProject);
  const addNode = useProjectStore(s => s.addNode);
  const updateNode = useProjectStore(s => s.updateNode);
  const deleteNode = useProjectStore(s => s.deleteNode);
  const deleteNodes = useProjectStore(s => s.deleteNodes);
  const addProjectEdge = useProjectStore(s => s.addEdge);
  const deleteEdge = useProjectStore(s => s.deleteEdge);
  const moveNode = useProjectStore(s => s.moveNode);
  const selectNode = useProjectStore(s => s.selectNode);
  const selectedNodeId = useProjectStore(s => s.selectedNodeId);
  const selectedEdgeId = useProjectStore(s => s.selectedEdgeId);
  const selectEdge = useProjectStore(s => s.selectEdge);
  const isDirty = useProjectStore(s => s.isDirty);
  const isLoading = useProjectStore(s => s.isLoading);
  const isSaving = useProjectStore(s => s.isSaving);
  const error = useProjectStore(s => s.error);
  const undo = useProjectStore(s => s.undo);
  const redo = useProjectStore(s => s.redo);
  const canUndo = useProjectStore(s => s.canUndo);
  const canRedo = useProjectStore(s => s.canRedo);
  const addEntity = useProjectStore(s => s.addEntity);

  // Editor store — use individual selectors to avoid re-rendering the
  // entire Editor component when unrelated editor state changes.
  // A broad destructure subscribes to ALL fields, so even a grid-size
  // toggle would trigger a full re-render + React Flow sync.
  const panels = useEditorStore(s => s.panels);
  const togglePanel = useEditorStore(s => s.togglePanel);
  const preferences = useEditorStore(s => s.preferences);
  const pendingUploads = useEditorStore(s => s.pendingUploads);
  const activeCanvas = useEditorStore(s => s.activeCanvas);
  const setActiveCanvas = useEditorStore(s => s.setActiveCanvas);

  // Local state for React Flow
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Modal states
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isVariableManagerOpen, setIsVariableManagerOpen] = useState(false);
  const [isAssetManagerOpen, setIsAssetManagerOpen] = useState(false);
  const [isSaveAsOpen, setIsSaveAsOpen] = useState(false);
  const [saveAsFilename, setSaveAsFilename] = useState('');

  // World / Entity manager state
  const [isWorldMenuOpen, setIsWorldMenuOpen] = useState(false);
  const [activeEntityCategory, setActiveEntityCategory] = useState<EntityCategory | null>(null);
  const worldMenuRef = useRef<HTMLDivElement>(null);

  // Chat and Notes modal states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // React Flow programmatic viewport control
  const reactFlow = useReactFlow();

  // Clipboard states
  const [copiedNode, setCopiedNode] = useState<StoryNode | null>(null);
  const [copyCounter, setCopyCounter] = useState(0);

  // Multi-selection — derived from React Flow's node `selected` flags.
  // When selectionOnDrag is enabled, React Flow sets `selected: true` on
  // nodes inside the box-selection rectangle (or Shift+clicked).
  const selectedNodeIds = useMemo(
    () => nodes.filter((n) => n.selected).map((n) => n.id),
    [nodes]
  );

  /**
   * EDGE TYPES REGISTRY
   * Maps custom edge type strings to React components.
   * Currently only 'relationship' is custom; default edges use the
   * built-in React Flow renderer.
   */
  const edgeTypes = useMemo(() => ({
    relationship: RelationshipEdge,
  }), []);

  /**
   * NODE TYPE SETS FOR CANVAS FILTERING (CO-WRITE MODE)
   *
   * Story Canvas shows: scene, choice, modifier, comment, storyRoot, plot
   * Character Canvas shows: character
   *
   * These are defined as module-level constants (hoisted above for clarity)
   * so that the sync effect can reference them without creating new Set
   * objects on every render.
   */
  // (Sets defined as stable references — they never change)

  /**
   * HAS STORY ROOT — whether the project already contains a StoryRoot node.
   * Used by the Toolbar to conditionally show or hide the "Story Root" drag item
   * (only one StoryRoot is allowed per project).
   */
  const hasStoryRoot = projectNodes?.some(n => n.type === 'storyRoot') || false;

  /**
   * Load project on mount
   */
  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
    }
  }, [projectId, loadProject]);

  /**
   * Close the World dropdown when clicking outside of it
   */
  useEffect(() => {
    if (!isWorldMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (worldMenuRef.current && !worldMenuRef.current.contains(event.target as HTMLElement)) {
        setIsWorldMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isWorldMenuOpen]);

  // Track whether user is actively focused on a text input.
  // This ref is set/cleared synchronously via capture-phase listeners
  // so it's always accurate when the sync effect reads it.
  const isUserEditingRef = useRef(false);
  const [syncTrigger, setSyncTrigger] = useState(0);
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    };
    const handleFocus = (e: FocusEvent) => {
      if (isEditable(e.target)) isUserEditingRef.current = true;
    };
    const handleBlur = (e: FocusEvent) => {
      if (isEditable(e.target)) {
        isUserEditingRef.current = false;
        setSyncTrigger(c => c + 1);
      }
    };
    // Use capture phase so we get the event before React Flow can steal focus
    document.addEventListener('focusin', handleFocus, true);
    document.addEventListener('focusout', handleBlur, true);
    return () => {
      document.removeEventListener('focusin', handleFocus, true);
      document.removeEventListener('focusout', handleBlur, true);
    };
  }, []);

  /**
   * SYNC EFFECT 1: Project data → React Flow nodes/edges.
   *
   * Runs when the project's node/edge DATA changes or syncTrigger fires.
   * Does NOT depend on selectedNodeId/selectedEdgeId — selection styling
   * is handled by a separate lightweight effect below, avoiding a full
   * array rebuild when the user clicks a different node.
   *
   * IMPORTANT: When the user is actively typing in an inspector input/textarea,
   * calling setNodes() causes React Flow to re-render all nodes, which steals
   * focus from the input. We detect this and skip the sync — the data is already
   * saved in the store and will sync on the next non-typing update.
   */
  // Track the last synced node/edge references to skip redundant setNodes/setEdges calls
  // R4 FIX: Use a node list reference instead of an O(N) string fingerprint.
  // This avoids allocating a multi-KB string on every sync just to compare.
  const lastSyncedNodesListRef = useRef<Node[]>([]);
  const lastSyncedEdgesRef = useRef<string>('');

  /**
   * Cache of previously-built flowNode entries, keyed by node ID.
   * When a project node's data reference and label haven't changed,
   * we reuse the previous flowNode object so that React.memo in
   * SceneNode (and other node components) sees the same `data` reference
   * and skips its re-render. Without this, `{ ...node.data, label }`
   * creates a NEW object on every sync, defeating React.memo and
   * causing O(N²) work per sync cycle (N nodes × per-node work).
   */
  const prevFlowNodesRef = useRef<Map<string, Node>>(new Map());

  /** Memoized selected-edge style object — avoids creating a new object literal
   *  on every sync for the selected edge, which would defeat edge React.memo. */
  const selectedEdgeStyleRef = useRef({ stroke: '#ef4444', strokeWidth: 3 });

  /** RAF handle for debounced sync — batches multiple rapid store changes
   *  (drag, selection, undo) into a single sync per animation frame. */
  const syncRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (projectNodes && projectEdges) {
      // Skip sync while user is focused on a text input to prevent focus loss
      if (isUserEditingRef.current) {
        return;
      }

      // Cancel any already-queued sync — we'll schedule a fresh one.
      // This batches rapid store changes into a single sync per frame,
      // preventing O(N) syncs when multiple fields change at once
      // (e.g., node drag updates position AND triggers selection).
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current);
      }

      // R1 FIX: Capture the granular selector values instead of the full project.
      // This means this effect only fires when nodes/edges/selection actually change,
      // NOT when unrelated fields (notes, isDirty, entities, chat) change.
      const capturedNodesRaw = projectNodes;
      const capturedEdgesRaw = projectEdges;
      const selNodeId = selectedNodeId;
      const selEdgeId = selectedEdgeId;

      // ── DUAL-CANVAS FILTERING (CO-WRITE MODE) ──
      // In co-write mode, only show the node types belonging to the active
      // canvas tab. In game mode (visibleTypes === null), show everything.
      const visibleTypes = isCowriteMode
        ? (activeCanvas === 'story' ? STORY_NODE_TYPES : CHARACTER_NODE_TYPES)
        : null; // null = show all (game mode)

      const capturedNodes = visibleTypes
        ? capturedNodesRaw.filter(n => visibleTypes.has(n.type))
        : capturedNodesRaw;

      // Filter edges: only keep edges where BOTH source and target are visible.
      // This prevents dangling edges from appearing when the other endpoint's
      // node type is on a different canvas tab.
      const visibleNodeIds = visibleTypes
        ? new Set(capturedNodes.map(n => n.id))
        : null;

      const capturedEdges = visibleNodeIds
        ? capturedEdgesRaw.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
        : capturedEdgesRaw;

      syncRafRef.current = requestAnimationFrame(() => {
        syncRafRef.current = null;

      // DIAGNOSTIC: React Flow sync timer
      const syncStart = performance.now();

      // Convert StoryNodes to React Flow nodes, REUSING previous flowNode
      // entries when data hasn't changed. This preserves object identity
      // for React.memo comparisons in SceneNode/ChoiceNode/etc.
      const prevMap = prevFlowNodesRef.current;
      const nextMap = new Map<string, Node>();
      let nodesChanged = false;

      const flowNodes: Node[] = capturedNodes.map((node) => {
        const prev = prevMap.get(node.id);
        const isSelected = node.id === selNodeId;

        // Reuse previous entry if:
        //   1. Same data reference (Zustand/Immer only creates new refs on actual mutation)
        //   2. Same label
        //   3. Same position reference
        //   4. Same selection state
        if (
          prev &&
          prev.data.__srcData === node.data &&
          prev.data.label === node.label &&
          prev.position === node.position &&
          prev.selected === isSelected
        ) {
          nextMap.set(node.id, prev);
          return prev;
        }

        // Data or selection changed — create a new flowNode entry.
        // Attach __srcData as an internal marker so the next sync can
        // detect whether the project-level data reference changed.
        nodesChanged = true;
        const entry: Node = {
          id: node.id,
          type: node.type,
          position: node.position,
          data: { ...node.data, label: node.label, __srcData: node.data },
          selected: isSelected,
        };
        nextMap.set(node.id, entry);
        return entry;
      });

      // Also detect removals (node count changed or IDs differ)
      if (prevMap.size !== nextMap.size) nodesChanged = true;

      prevFlowNodesRef.current = nextMap;

      // Convert StoryEdges to React Flow edges.
      // Relationship edges (between CharacterNodes) need their `type` and
      // `data` passed through so React Flow renders the custom RelationshipEdge
      // component instead of the default edge renderer.
      const flowEdges: Edge[] = capturedEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle,
        animated: edge.animated,
        selected: edge.id === selEdgeId,
        style: edge.id === selEdgeId
          ? selectedEdgeStyleRef.current
          : edge.style,
        ...(edge.type ? { type: edge.type } : {}),
        ...(edge.data ? { data: edge.data } : {}),
      }));

      // R4 FIX: Replace O(N) string fingerprint with reference-based comparison.
      // The old approach built a multi-KB string via .map().join('|') on every
      // sync (potentially 30-60 times/second during drag). Instead, we check
      // if any node's position or selection reference changed using O(N)
      // reference comparisons (=== is O(1) per item, no string allocation).
      const prevList = lastSyncedNodesListRef.current;
      const posSelChanged = flowNodes.length !== prevList.length || flowNodes.some((n, i) => {
        const prev = prevList[i];
        return !prev || prev.position !== n.position || prev.selected !== n.selected || prev.id !== n.id;
      });

      if (posSelChanged || nodesChanged) {
        setNodes(flowNodes);
        lastSyncedNodesListRef.current = flowNodes;
      }

      // Edge fingerprint uses simple selection comparison (edges rarely change)
      const edgeFingerprint = flowEdges.map(e => `${e.id}:${(e as any).selected}`).join('|');
      if (edgeFingerprint !== lastSyncedEdgesRef.current) {
        setEdges(flowEdges);
        lastSyncedEdgesRef.current = edgeFingerprint;
      }

      // DIAGNOSTIC: Log sync times that exceed a single frame budget (16ms)
      const syncDuration = performance.now() - syncStart;
      if (syncDuration > 16) {
        console.warn(`[SyncDiag] React Flow sync took ${syncDuration.toFixed(1)}ms (>${16}ms frame budget). Nodes: ${flowNodes.length}, Edges: ${flowEdges.length}, dataChanged: ${nodesChanged}`);
      }
      if ((window as any).__renderDiag) {
        console.log(`[SyncDiag] React Flow sync: ${syncDuration.toFixed(1)}ms, ${flowNodes.length} nodes, ${flowEdges.length} edges, dataChanged: ${nodesChanged}`);
      }
      }); // end requestAnimationFrame callback

      // Cleanup: cancel the queued RAF if this effect re-fires before
      // the RAF callback runs (batching multiple rapid changes).
      return () => {
        if (syncRafRef.current !== null) {
          cancelAnimationFrame(syncRafRef.current);
          syncRafRef.current = null;
        }
      };
    }
  }, [projectNodes, projectEdges, selectedNodeId, selectedEdgeId, setNodes, setEdges, syncTrigger, activeCanvas, isCowriteMode]);

  /**
   * Find the scene node with the longest path from the start node.
   * Uses BFS to compute distances, returns the farthest scene node.
   * This is the "most recent" node in Open World mode.
   */
  const findDeepestSceneNode = useCallback((proj: { nodes: any[]; edges: any[]; settings: any } | null) => {
    if (!proj || proj.nodes.length === 0) return null;
    const startNodeId = proj.settings.startNodeId;
    if (!startNodeId) return null;

    // Build adjacency list from edges (source → targets)
    const adj = new Map<string, string[]>();
    for (const edge of proj.edges) {
      if (!adj.has(edge.source)) adj.set(edge.source, []);
      adj.get(edge.source)!.push(edge.target);
    }

    // BFS from start node to find the farthest scene node
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: startNodeId, depth: 0 }];
    visited.add(startNodeId);

    let deepestScene: { id: string; depth: number } | null = null;

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const node = proj.nodes.find(n => n.id === id);
      if (node && node.type === 'scene') {
        if (!deepestScene || depth > deepestScene.depth) {
          deepestScene = { id, depth };
        }
      }
      const neighbors = adj.get(id) || [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ id: next, depth: depth + 1 });
        }
      }
    }

    return deepestScene ? proj.nodes.find(n => n.id === deepestScene!.id) : null;
  }, []);

  /**
   * Focus on a specific node when returning from play mode or loading a project.
   * Priority:
   *   1. focusNodeId from editor store (set by AdventureEngine before navigating back)
   *   2. Deepest scene node (longest path from start — the "latest" OW scene)
   * Also selects the node in the inspector.
   */
  const focusConsumedRef = useRef(false);
  useEffect(() => {
    if (focusConsumedRef.current) return;
    if (!projectNodes || projectNodes.length === 0) return;

    const { focusNodeId, setFocusNodeId } = useEditorStore.getState();

    // Find the target node: explicit focusNodeId, or deepest scene as fallback
    let targetNode = focusNodeId
      ? projectNodes.find(n => n.id === focusNodeId)
      : null;

    if (!targetNode) {
      const proj = useProjectStore.getState().currentProject;
      targetNode = findDeepestSceneNode(proj) || null;
    }

    if (!targetNode) return;

    focusConsumedRef.current = true;
    const targetId = targetNode.id;
    setTimeout(() => {
      reactFlow.setCenter(
        targetNode!.position.x + 150,
        targetNode!.position.y + 80,
        { zoom: 0.85, duration: 400 }
      );
      selectNode(targetId);
      if (focusNodeId) setFocusNodeId(null);
    }, 300);
  }, [projectNodes, nodes, selectNode, reactFlow, findDeepestSceneNode]);

  /**
   * Handle new connection between nodes.
   *
   * CHARACTER-TO-CHARACTER CONNECTIONS:
   * When both endpoints are CharacterNodes (on the character canvas),
   * the edge is created as a 'relationship' type with metadata fields
   * for relationship type, description, status, and history. This uses
   * the RelationshipEdge custom renderer (dashed pink bezier + label).
   *
   * ALL OTHER CONNECTIONS:
   * Standard story flow edges with the default animated style.
   */
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        // Check if both source and target are character nodes
        const sourceNode = projectNodes?.find(n => n.id === connection.source);
        const targetNode = projectNodes?.find(n => n.id === connection.target);

        if (sourceNode?.type === 'character' && targetNode?.type === 'character') {
          // Create a relationship edge between characters
          const relationshipEdge: StoryEdge = {
            id: generateId('edge'),
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle || undefined,
            targetHandle: connection.targetHandle || 'top',
            type: 'relationship',
            data: {
              relationshipType: 'Relationship',
              description: '',
              status: 'Active',
              history: '',
            },
          };
          addProjectEdge(relationshipEdge);
          return; // Don't create default edge
        }

        // Act-to-Plot (or Plot-to-Act) connection: create a relationship edge
        // with plotInvolvement data so the author can describe what parts of
        // the plot unfold during this act.
        if (
          (sourceNode?.type === 'act' && targetNode?.type === 'plot') ||
          (sourceNode?.type === 'plot' && targetNode?.type === 'act')
        ) {
          const relationshipEdge: StoryEdge = {
            id: generateId('edge'),
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle || undefined,
            targetHandle: connection.targetHandle || undefined,
            type: 'relationship',
            data: {
              relationshipType: 'Act-Plot',
              description: '',
              status: '',
              history: '',
              plotInvolvement: '',
            },
          };
          addProjectEdge(relationshipEdge);
          return; // Don't create default edge
        }

        // Standard story flow edge
        const newEdge: StoryEdge = {
          id: generateId('edge'),
          source: connection.source,
          sourceHandle: connection.sourceHandle || undefined,
          target: connection.target,
          targetHandle: connection.targetHandle || 'input',
          animated: preferences.animateEdges,
        };

        addProjectEdge(newEdge);
      }
    },
    [addProjectEdge, preferences.animateEdges, projectNodes]
  );

  /**
   * Handle node click (select node)
   */
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
      selectEdge(null); // Clear edge selection when selecting a node
    },
    [selectNode, selectEdge]
  );

  /**
   * Handle edge click (select edge)
   */
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      selectEdge(edge.id); // Store-level selection so Inspector panel opens
      selectNode(null); // Deselect any node when selecting an edge
    },
    [selectNode, selectEdge]
  );

  /**
   * Handle canvas click (deselect)
   */
  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null); // Also clear edge selection
  }, [selectNode, selectEdge]);

  /**
   * Handle node drag stop (update position)
   */
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const storeNode = useProjectStore.getState().getNode(node.id);
      if (storeNode) {
        updateNode(node.id, { position: node.position });
      }
    },
    [updateNode]
  );

  /**
   * Handle drop from toolbar (create new node)
   */
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/dream-e-node');
      if (!nodeType) return;

      // Get drop position relative to canvas
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      // Create node based on type
      let newNode: StoryNode;

      switch (nodeType) {
        case 'scene':
          newNode = {
            id: generateId('node'),
            type: 'scene',
            position,
            label: 'New Scene',
            data: {
              storyText: 'Enter your story text here...',
              choices: [
                {
                  id: generateId('choice'),
                  label: 'Continue',
                },
              ],
              musicKeepPlaying: false,
              voiceoverAutoplay: false,
            },
          } as SceneNode;
          break;

        case 'choice':
          newNode = {
            id: generateId('node'),
            type: 'choice',
            position,
            label: 'New Choice',
            data: {
              condition: {
                variableA: '',
                operator: '>',
                valueB: 0,
                useVariable: false,
              },
            },
          } as ChoiceNode;
          break;

        case 'modifier':
          newNode = {
            id: generateId('node'),
            type: 'modifier',
            position,
            label: 'New Modifier',
            data: {
              mode: 'math',
              targetVariable: '',
              mathOperation: 'add',
              mathValue: 0,
            },
          } as ModifierNode;
          break;

        case 'comment':
          newNode = {
            id: generateId('node'),
            type: 'comment',
            position,
            label: 'Comment',
            data: {
              text: 'Add your notes here...',
              color: '#6b7280',
            },
          };
          break;

        // ── CO-WRITE MODE NODE TYPES ──

        case 'storyRoot':
          newNode = {
            id: generateId('node'),
            type: 'storyRoot',
            position,
            label: 'Story Root',
            data: {
              title: '',
              genre: '',
              targetAudience: '',
              punchline: '',
              mainCharacter: { name: '', role: 'Protagonist' },
              antagonist: { name: '', role: 'Antagonist' },
              supportingCharacters: [],
              protagonistGoal: '',
              summary: '',
            },
          };
          break;

        case 'plot': {
          newNode = {
            id: generateId('node'),
            type: 'plot',
            position,
            label: 'New Plot',
            data: {
              name: '',
              plotType: 'Main Plot',
              description: '',
            },
          };
          break;
        }

        case 'act':
          newNode = {
            id: generateId('node'),
            type: 'act',
            position,
            label: 'New Act',
            data: {
              actNumber: 1,
              name: '',
              description: '',
            },
          };
          break;

        case 'character': {
          // Create a new character entity in the project's entity store
          // and link the CharacterNode to it via entityId.
          const entityId = generateId('entity');
          addEntity({
            id: entityId,
            name: 'New Character',
            category: 'character',
            description: '',
            summary: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          newNode = {
            id: generateId('node'),
            type: 'character',
            position,
            label: 'New Character',
            data: { entityId },
          };
          break;
        }

        default:
          return;
      }

      addNode(newNode);

      // Auto-connect plot nodes to StoryRoot AFTER the node is added,
      // so that React Flow can find the target node when creating the edge.
      if (newNode.type === 'plot') {
        const storyRoot = projectNodes?.find(n => n.type === 'storyRoot');
        if (storyRoot) {
          addProjectEdge({
            id: generateId('edge'),
            source: storyRoot.id,
            target: newNode.id,
          });
        }
      }

      selectNode(newNode.id);
    },
    [addNode, selectNode, projectNodes, addProjectEdge, addEntity]
  );

  /**
   * Handle drag over (allow drop)
   */
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  /**
   * Delete the selected edge
   */
  const handleDeleteSelectedEdge = useCallback(() => {
    if (selectedEdgeId) {
      deleteEdge(selectedEdgeId);
      selectEdge(null);
    }
  }, [selectedEdgeId, deleteEdge, selectEdge]);

  /**
   * Delete the selected node.
   *
   * STORY ROOT PROTECTION:
   * The StoryRoot node is the structural anchor of a co-write project.
   * Deleting it would orphan all plot/scene connections, so we prevent
   * deletion entirely. The user must delete the project to remove it.
   */
  const handleDeleteSelectedNode = useCallback(() => {
    if (selectedNodeId) {
      // Prevent deletion of the StoryRoot node
      const nodeToDelete = projectNodes?.find(n => n.id === selectedNodeId);
      if (nodeToDelete?.type === 'storyRoot') {
        console.log('[Editor] Cannot delete StoryRoot node');
        return;
      }
      deleteNode(selectedNodeId);
    }
  }, [selectedNodeId, deleteNode, projectNodes]);

  /**
   * Delete all nodes in the current multi-selection.
   * Uses batch deleteNodes so it's a single undo step.
   * Excludes StoryRoot nodes from deletion.
   */
  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeIds.length > 0) {
      // Filter out any StoryRoot nodes from the deletion set
      const deletableIds = selectedNodeIds.filter(id => {
        const node = projectNodes?.find(n => n.id === id);
        return node?.type !== 'storyRoot';
      });
      if (deletableIds.length > 0) {
        deleteNodes(deletableIds);
      }
      // React Flow's node state will auto-update (selected nodes gone)
    }
  }, [selectedNodeIds, deleteNodes, projectNodes]);

  /**
   * Delete all descendants of the selected node (everything "after" it in the graph).
   * BFS from selectedNode's outgoing edges to collect all reachable nodes,
   * then batch-delete them (single undo step). Does NOT delete the selected node itself.
   */
  const handleDeleteAllAfter = useCallback(() => {
    const currentProject = useProjectStore.getState().currentProject;
    if (!selectedNodeId || !currentProject) return;

    // Build adjacency list (source → targets)
    const adj = new Map<string, string[]>();
    for (const edge of currentProject.edges) {
      if (!adj.has(edge.source)) adj.set(edge.source, []);
      adj.get(edge.source)!.push(edge.target);
    }

    // BFS from the selected node to find all descendants
    const visited = new Set<string>();
    const queue = adj.get(selectedNodeId) || [];
    for (const id of queue) visited.add(id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = adj.get(current) || [];
      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      }
    }

    // Don't include the selected node itself — only descendants
    visited.delete(selectedNodeId);

    if (visited.size === 0) return;

    deleteNodes(Array.from(visited));
  }, [selectedNodeId, deleteNodes]);

  /**
   * Cut the selected node (copy + delete)
   * This allows Ctrl+X to work like cut, so you can paste it back.
   * StoryRoot nodes cannot be cut (only copied).
   */
  const handleCutNode = useCallback(() => {
    if (selectedNodeId) {
      const proj = useProjectStore.getState().currentProject;
      const nodeToCopy = proj?.nodes.find((n) => n.id === selectedNodeId);
      if (nodeToCopy) {
        // Prevent cutting the StoryRoot node
        if (nodeToCopy.type === 'storyRoot') {
          console.log('[Editor] Cannot cut StoryRoot node');
          return;
        }
        // Copy to clipboard first — structuredClone avoids 2x memory
        // spike from intermediate JSON string (B5 fix)
        setCopiedNode(structuredClone(nodeToCopy));
        setCopyCounter(1);
        // Then delete
        deleteNode(selectedNodeId);
      }
    }
  }, [selectedNodeId, deleteNode]);

  /**
   * Copy the selected node to clipboard
   */
  const handleCopyNode = useCallback(() => {
    if (selectedNodeId) {
      const proj = useProjectStore.getState().currentProject;
      const nodeToCopy = proj?.nodes.find((n) => n.id === selectedNodeId);
      if (nodeToCopy) {
        // Store a deep copy — structuredClone avoids 2x memory spike (B5 fix)
        setCopiedNode(structuredClone(nodeToCopy));
        setCopyCounter(1); // Reset counter for new copy source
      }
    }
  }, [selectedNodeId]);

  /**
   * Paste the copied node at an offset position
   */
  const handlePasteNode = useCallback(() => {
    if (copiedNode) {
      // Create a new node with a unique ID and offset position
      const newNode: StoryNode = {
        ...structuredClone(copiedNode),
        id: generateId('node'),
        position: {
          x: copiedNode.position.x + 50 + (copyCounter * 20),
          y: copiedNode.position.y + 50 + (copyCounter * 20),
        },
        label: `${copiedNode.label} Copy ${copyCounter}`,
      };

      // For scene nodes, regenerate choice IDs to avoid duplicates
      if (newNode.type === 'scene' && newNode.data?.choices) {
        newNode.data.choices = newNode.data.choices.map((choice: { id: string; label: string }) => ({
          ...choice,
          id: generateId('choice'),
        }));
      }

      addNode(newNode);
      selectNode(newNode.id);
      setCopyCounter((c) => c + 1);
    }
  }, [copiedNode, copyCounter, addNode, selectNode]);

  /**
   * Auto-layout: arrange nodes in columns by BFS depth from start node.
   * Preserves all connections — only repositions nodes visually.
   */
  const handleAutoLayout = useCallback(() => {
    const currentProject = useProjectStore.getState().currentProject;
    if (!currentProject) return;
    const startNodeId = currentProject.settings.startNodeId;
    if (!startNodeId) return;

    const layers = groupNodesByDepth(
      currentProject.nodes,
      currentProject.edges,
      startNodeId
    );

    const COLUMN_GAP = 400;   // Horizontal spacing between depth layers
    const ROW_GAP = 250;      // Vertical spacing between nodes in a layer (enough for modifiers)
    const START_X = 100;
    const START_Y = 200;

    for (const layer of layers) {
      const col = layer.depth === Infinity ? layers.length : layer.depth;
      const x = START_X + col * COLUMN_GAP;

      // Center the layer vertically
      const totalHeight = (layer.nodeIds.length - 1) * ROW_GAP;
      const offsetY = START_Y - totalHeight / 2;

      layer.nodeIds.forEach((nodeId, rowIndex) => {
        const y = offsetY + rowIndex * ROW_GAP;
        moveNode(nodeId, { x, y });
      });
    }
  }, [moveNode]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // Check for modifier keys
      const isCtrl = event.ctrlKey || event.metaKey;

      if (isCtrl && event.key === 's') {
        // Save (always works, even in input fields)
        event.preventDefault();
        // Don't save if uploads are in progress
        if (useEditorStore.getState().pendingUploads > 0) {
          console.log('[Editor] Cannot save while uploads are pending');
          return;
        }
        saveProject();
      } else if (isCtrl && event.key === 'z' && !isTyping) {
        // Undo (only when not typing)
        event.preventDefault();
        if (canUndo()) undo();
      } else if (isCtrl && event.key === 'y' && !isTyping) {
        // Redo (only when not typing)
        event.preventDefault();
        if (canRedo()) redo();
      } else if (isCtrl && event.key === 'x' && !isTyping) {
        // Cut selected node or edge (Ctrl+X)
        event.preventDefault();
        if (selectedEdgeId) {
          handleDeleteSelectedEdge();
        } else if (selectedNodeId) {
          handleCutNode();
        }
      } else if (isCtrl && event.shiftKey && (event.key === 'C' || event.key === 'c')) {
        // Toggle Chat window (Ctrl+Shift+C) — always works, even in input fields
        event.preventDefault();
        setIsChatOpen((prev) => !prev);
      } else if (isCtrl && event.key === 'c' && !isTyping) {
        // Copy selected node (Ctrl+C)
        event.preventDefault();
        handleCopyNode();
      } else if (isCtrl && event.key === 'v' && !isTyping) {
        // Paste copied node (Ctrl+V)
        event.preventDefault();
        handlePasteNode();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !isTyping) {
        // Delete selected nodes/edges (only when not typing in an input)
        if (selectedNodeIds.length > 1) {
          // Multi-selection: batch delete all selected nodes
          handleDeleteSelected();
        } else if (selectedEdgeId) {
          handleDeleteSelectedEdge();
        } else if (selectedNodeId) {
          // Prevent deletion of StoryRoot via keyboard shortcut
          const nodeToDelete = useProjectStore.getState().currentProject?.nodes.find(n => n.id === selectedNodeId);
          if (nodeToDelete?.type === 'storyRoot') {
            console.log('[Editor] Cannot delete StoryRoot node');
          } else {
            deleteNode(selectedNodeId);
          }
        }
      } else if (event.key === 'Escape') {
        // Deselect (always works)
        selectNode(null);
        selectEdge(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedNodeIds, selectedEdgeId, saveProject, undo, redo, canUndo, canRedo, deleteNode, selectNode, selectEdge, handleDeleteSelectedEdge, handleDeleteSelected, handleCopyNode, handlePasteNode, handleCutNode]);

  /**
   * Handle Save As - export project as a file.
   * Uses the File System Access API (showSaveFilePicker) when available,
   * which lets the user choose the exact folder and filename in a native
   * OS save dialog. Falls back to the classic download approach for
   * browsers that don't support it (Firefox, Safari).
   */
  const handleSaveAs = async () => {
    const currentProject = useProjectStore.getState().currentProject;
    if (!currentProject) return;

    try {
      // Save to database first
      await saveProject();

      // Create a ZIP file with the project data
      const zip = new JSZip();

      // Unwrap Immer proxy and rehydrate any blob URLs back to base64.
      // After asset offloading, nodes may hold blob URLs instead of base64;
      // rehydrateForSave() converts them back for export portability.
      let plain: typeof currentProject;
      try {
        plain = current(currentProject);
      } catch {
        plain = currentProject;
      }
      const exportReady = await rehydrateForSave(plain);

      // Sanity-log what's being exported
      console.log('[Export] Project data:', {
        title: exportReady.info.title,
        nodes: exportReady.nodes.length,
        edges: exportReady.edges.length,
        entities: exportReady.entities?.length ?? 0,
        entitiesWithProfile: exportReady.entities?.filter(e => e.profile && Object.keys(e.profile).length > 0).length ?? 0,
        notesLength: exportReady.notes?.length ?? 0,
        variables: exportReady.globalVariables?.length ?? 0,
      });

      // Add project JSON
      const projectData = JSON.stringify(exportReady, null, 2);
      zip.file('project.json', projectData);

      // Generate the ZIP file
      const blob = await zip.generateAsync({ type: 'blob' });

      // Determine filename
      const filename = saveAsFilename.trim() || currentProject.info.title || 'project';
      const safeFilename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fullFilename = `${safeFilename}.dream-e.zip`;

      // Try the File System Access API first (Chrome/Edge) — gives a native
      // OS "Save As" dialog where the user can pick a folder
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fullFilename,
            types: [
              {
                description: 'Dream-E Project',
                accept: { 'application/zip': ['.zip'] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (pickerErr: any) {
          // User cancelled the picker — don't show an error
          if (pickerErr?.name === 'AbortError') {
            return;
          }
          // If the API failed for another reason, fall back to classic download
          console.warn('[Editor] File picker failed, falling back to download:', pickerErr);
          saveAs(blob, fullFilename);
        }
      } else {
        // Fallback: classic browser download (Firefox, Safari, older browsers)
        saveAs(blob, fullFilename);
      }

      // Close modal and reset
      setIsSaveAsOpen(false);
      setSaveAsFilename('');
    } catch (err) {
      console.error('[Editor] Failed to export project:', err);
      alert('Failed to export project. Please try again.');
    }
  };

  /**
   * Handle Import - load a project from a .dream-e.zip file.
   * Imports the project into the database and navigates to it.
   */
  const handleImportProject = async (file: File) => {
    try {
      setIsImporting(true);

      const project = await projectsDB.importProject(file);

      // Navigate to the imported project, preserving the mode prefix
      navigate(isCowriteMode ? `/cowrite/edit/${project.id}` : `/edit/${project.id}`);
    } catch (err) {
      console.error('[Editor] Failed to import project:', err);
      alert(
        err instanceof Error
          ? err.message
          : 'Failed to import project. Make sure this is a valid .dream-e.zip file.'
      );
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen bg-editor-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-editor-border border-t-editor-accent rounded-full animate-spin" />
          <p className="text-editor-muted">Loading project...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !hasProject) {
    return (
      <div className="h-screen bg-editor-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-error mb-4">
            {error || 'Project not found'}
          </h1>
          <Button onClick={() => navigate(isCowriteMode ? '/cowrite' : '/game')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-editor-bg flex flex-col overflow-hidden">
      {/* ==================== TOP BAR ==================== */}
      <header className="h-12 bg-editor-surface border-b border-editor-border flex items-center justify-between px-4 flex-shrink-0">
        {/* Left: Back button and title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(isCowriteMode ? '/cowrite' : '/game')}
            className="p-2 rounded hover:bg-editor-border text-editor-muted hover:text-editor-text"
            title="Back to Dashboard"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-editor-text">
              {projectTitle || 'Untitled'}
            </h1>
            {isSaving ? (
              <span className="text-xs text-editor-muted animate-pulse">Saving...</span>
            ) : isDirty ? (
              <span className="text-editor-muted text-sm" title="Unsaved changes">•</span>
            ) : (
              <span className="text-xs text-green-500">Saved</span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <button
            onClick={undo}
            disabled={!canUndo()}
            className="p-2 rounded hover:bg-editor-border text-editor-muted hover:text-editor-text disabled:opacity-50"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            className="p-2 rounded hover:bg-editor-border text-editor-muted hover:text-editor-text disabled:opacity-50"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={18} />
          </button>

          <div className="w-px h-6 bg-editor-border mx-2" />

          {/* Global Variables */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Database size={16} />}
            onClick={() => setIsVariableManagerOpen(true)}
          >
            Variables
          </Button>

          {/* Assets */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ImageIcon size={16} />}
            onClick={() => setIsAssetManagerOpen(true)}
          >
            Assets
          </Button>

          {/* World Building Dropdown */}
          <div className="relative" ref={worldMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<BookOpen size={16} />}
              onClick={() => setIsWorldMenuOpen(!isWorldMenuOpen)}
            >
              World
            </Button>
            {isWorldMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-editor-surface border border-editor-border rounded-lg shadow-xl z-50 py-1">
                {([
                  { category: 'character' as const, icon: Users, label: 'Characters' },
                  { category: 'location' as const, icon: MapPin, label: 'Locations' },
                  { category: 'object' as const, icon: Package, label: 'Objects' },
                  { category: 'concept' as const, icon: Lightbulb, label: 'Game Concepts' },
                ]).map(({ category, icon: ItemIcon, label }) => (
                  <button
                    key={category}
                    onClick={() => {
                      setActiveEntityCategory(category);
                      setIsWorldMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-editor-text hover:bg-editor-bg transition-colors"
                  >
                    <ItemIcon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chat */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<MessageCircle size={16} />}
            onClick={() => setIsChatOpen(true)}
            title="Open Chat (Ctrl+Shift+C)"
          >
            Chat
          </Button>

          {/* Notes */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<StickyNote size={16} />}
            onClick={() => setIsNotesOpen(true)}
          >
            Notes
          </Button>

          {/* AI Settings */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Settings size={16} />}
            onClick={() => setIsAISettingsOpen(true)}
          >
            AI
          </Button>

          {/* Help */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<HelpCircle size={16} />}
            onClick={() => setIsHelpOpen(true)}
          >
            Help
          </Button>

          <div className="w-px h-6 bg-editor-border mx-2" />

          {/* Save */}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Save size={16} />}
            disabled={pendingUploads > 0}
            onClick={saveProject}
          >
            {pendingUploads > 0 ? 'Uploading...' : 'Save'}
          </Button>

          {/* Save As (Export) */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download size={16} />}
            onClick={() => {
              setSaveAsFilename(projectTitle || '');
              setIsSaveAsOpen(true);
            }}
          >
            Export
          </Button>

          {/* Import from ZIP */}
          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportProject(file);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Upload size={16} />}
            disabled={isImporting}
            onClick={() => importInputRef.current?.click()}
          >
            {isImporting ? 'Importing...' : 'Import'}
          </Button>

          {/* Play from Start - Auto-saves before playing */}
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Play size={16} />}
            disabled={pendingUploads > 0}
            onClick={async () => {
              if (pendingUploads > 0) {
                console.log('[Editor] Cannot play while uploads are pending');
                return;
              }
              await saveProject();
              navigate(isCowriteMode ? `/cowrite/play/${projectId}` : `/play/${projectId}`);
            }}
          >
            {pendingUploads > 0 ? 'Uploading...' : 'Play from Start'}
          </Button>

          {/* Play Open World - Auto-saves then launches Open World mode */}
          <button
            disabled={pendingUploads > 0}
            onClick={async () => {
              if (pendingUploads > 0) {
                console.log('[Editor] Cannot play while uploads are pending');
                return;
              }
              await saveProject();
              navigate(isCowriteMode ? `/cowrite/play/${projectId}?openWorld=1` : `/play/${projectId}?openWorld=1`);
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-pink-500 hover:bg-pink-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={16} />
            Open World
          </button>
        </div>
      </header>

      {/* ==================== MAIN CONTENT ==================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* Toolbar */}
        {panels.toolbar && (
          <Toolbar
            selectedEdgeId={selectedEdgeId}
            hasSelectedNode={!!selectedNodeId}
            hasCopiedNode={!!copiedNode}
            selectedCount={selectedNodeIds.length}
            onDeleteEdge={handleDeleteSelectedEdge}
            onDeleteNode={handleDeleteSelectedNode}
            onDeleteSelected={handleDeleteSelected}
            onDeleteAllAfter={handleDeleteAllAfter}
            onCutNode={handleCutNode}
            onCopyNode={handleCopyNode}
            onPasteNode={handlePasteNode}
            isCowriteMode={isCowriteMode}
            activeCanvas={activeCanvas}
            hasStoryRoot={hasStoryRoot}
            onChatToggle={() => setIsChatOpen((prev) => !prev)}
            isChatOpen={isChatOpen}
          />
        )}

        {/* Canvas — with optional tab bar above in co-write mode */}
        <div className="flex-1 relative flex flex-col">
          {/* Canvas tab bar — only shown in co-write mode */}
          {isCowriteMode && (
            <CanvasTabBar
              activeCanvas={activeCanvas}
              onCanvasChange={setActiveCanvas}
            />
          )}

          {/* React Flow canvas container */}
          <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            {...{ edgeTypes } as any}
            fitView
            snapToGrid={preferences.snapToGrid}
            snapGrid={[preferences.gridSize, preferences.gridSize]}
            defaultEdgeOptions={{
              animated: preferences.animateEdges,
              style: { stroke: '#0ea5e9', strokeWidth: 2 },
            }}
            minZoom={0.05}
            maxZoom={4}
            proOptions={{ hideAttribution: true }}
            {...{
              // Box-select: left-click drag draws selection rectangle,
              // middle/right-click drag pans. Partial = node only needs to
              // partially intersect the rectangle to be selected.
              selectionOnDrag: true,
              selectionMode: 'partial',
              panOnDrag: [1, 2],
            } as any}
          >
            {/* Background grid */}
            {preferences.showGrid && (
              <Background
                variant={BackgroundVariant.Dots}
                gap={preferences.gridSize}
                size={1}
                color="#0f3460"
              />
            )}

            {/* Controls */}
            <Controls
              className="bg-editor-surface border border-editor-border rounded-lg"
              showInteractive={false}
            />

            {/* Bottom-left actions — auto-layout + batch delete */}
            <Panel position="bottom-left" className="ml-14 flex gap-2">
              <button
                onClick={handleAutoLayout}
                className="flex items-center gap-2 px-3 py-2 bg-editor-surface border border-editor-border rounded-lg text-sm text-editor-text hover:bg-editor-bg transition-colors shadow-md"
                title="Auto-layout: arrange nodes by distance from start node"
              >
                <LayoutGrid size={16} />
                Auto-Layout
              </button>

              {/* Delete Selected — visible when 2+ nodes are box-selected */}
              {selectedNodeIds.length > 1 && (
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-500 rounded-lg text-sm text-red-400 hover:bg-red-500/30 transition-colors shadow-md"
                  title={`Delete ${selectedNodeIds.length} selected nodes (Delete key)`}
                >
                  <Trash2 size={16} />
                  Delete Selected ({selectedNodeIds.length})
                </button>
              )}
            </Panel>

            {/* MiniMap */}
            {panels.minimap && (
              <MiniMap
                className="bg-editor-surface border border-editor-border rounded-lg"
                {...{ zoomable: true, pannable: true } as any}
                nodeColor={(node) => {
                  switch (node.type) {
                    case 'scene':
                      return '#3b82f6';
                    case 'choice':
                      return '#eab308';
                    case 'modifier':
                      return '#22c55e';
                    case 'comment':
                      return '#6b7280';
                    case 'storyRoot':
                      return '#a855f7'; // purple
                    case 'plot':
                      return '#f59e0b'; // amber
                    case 'character':
                      return '#14b8a6'; // teal
                    default:
                      return '#6b7280';
                  }
                }}
                maskColor="rgba(0, 0, 0, 0.8)"
              />
            )}
          </ReactFlow>
          </div>
        </div>

        {/* Inspector */}
        {panels.inspector && (selectedNodeId || selectedEdgeId) && (
          <Inspector />
        )}
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Variable Manager Modal */}
      <VariableManager
        isOpen={isVariableManagerOpen}
        onClose={() => setIsVariableManagerOpen(false)}
      />

      {/* Asset Manager Modal */}
      <AssetManager
        isOpen={isAssetManagerOpen}
        onClose={() => setIsAssetManagerOpen(false)}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      {/* Entity Manager Modal (shared for all categories) */}
      {activeEntityCategory && (
        <EntityManager
          isOpen={!!activeEntityCategory}
          onClose={() => setActiveEntityCategory(null)}
          category={activeEntityCategory}
        />
      )}

      {/* Chat Window — Modal in game mode, sliding left panel in co-write mode */}
      {isCowriteMode ? (
        /* CO-WRITE MODE: Sliding left-side panel (always mounted for CSS transition).
         *
         * The panel is 40vw wide, slides in from the left edge using CSS
         * transform. Keeping it mounted (not conditional) enables the
         * smooth translate-x animation on both open and close. When closed,
         * it is translated fully off-screen to the left (-translate-x-full)
         * and pointer-events are disabled so it doesn't intercept clicks.
         *
         * The ChatWindow is rendered in panelMode (no Modal wrapper) — it
         * fills the panel container directly. A close button and header are
         * provided by the panel div itself. */
        <div
          className={`
            fixed inset-y-0 left-0 w-[40vw] z-40
            bg-editor-surface border-r border-editor-border shadow-2xl
            transform transition-transform duration-300 ease-in-out
            ${isChatOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}
          `}
          style={{ minWidth: '380px', maxWidth: '600px' }}
        >
          {/* Panel header with title and close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border flex-shrink-0">
            <h3 className="text-sm font-semibold text-editor-text">AI Chat</h3>
            <button
              onClick={() => setIsChatOpen(false)}
              className="text-editor-muted hover:text-editor-text transition-colors p-1 rounded hover:bg-editor-bg"
              title="Close chat panel"
            >
              <X size={18} />
            </button>
          </div>

          {/* Chat content (panel mode — no Modal wrapper) */}
          <div className="h-[calc(100%-49px)] overflow-hidden">
            <ChatWindow
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              panelMode
            />
          </div>
        </div>
      ) : (
        /* GAME MODE: Standard near-fullscreen modal (unchanged) */
        <ChatWindow
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}

      {/* Notes Editor Modal */}
      <NotesEditor
        isOpen={isNotesOpen}
        onClose={() => setIsNotesOpen(false)}
      />

      {/* AI Settings Modal */}
      <AISettingsModal
        isOpen={isAISettingsOpen}
        onClose={() => setIsAISettingsOpen(false)}
      />

      {/* Save As Modal */}
      <Modal
        isOpen={isSaveAsOpen}
        onClose={() => setIsSaveAsOpen(false)}
        title="Save As"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">File Name</label>
            <input
              type="text"
              value={saveAsFilename}
              onChange={(e) => setSaveAsFilename(e.target.value)}
              className="input"
              placeholder="Enter file name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveAs();
                }
              }}
            />
            <p className="text-xs text-editor-muted mt-1">
              File will be saved as: {(saveAsFilename.trim() || 'project').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.dream-e.zip
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsSaveAsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveAs}>
              Save File
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
