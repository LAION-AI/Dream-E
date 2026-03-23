/**
 * =============================================================================
 * PROJECT STATE STORE (ZUSTAND)
 * =============================================================================
 *
 * This file defines the main state management store for projects.
 *
 * WHAT IS ZUSTAND?
 * Zustand is a state management library for React. It's simpler than
 * Redux and doesn't require boilerplate code. It uses hooks to access
 * and modify state.
 *
 * HOW IT WORKS:
 * 1. Define state shape (interface)
 * 2. Create store with initial values and actions
 * 3. Use the hook in components to access state
 *
 * STATE VS. PROPS:
 * - Props: Data passed from parent to child components
 * - State: Data that lives in the store, accessible anywhere
 *
 * Use Zustand state for data that:
 * - Needs to be shared across many components
 * - Persists across navigation
 * - Triggers updates when changed
 *
 * =============================================================================
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import type {
  Project,
  StoryNode,
  StoryEdge,
  Variable,
  Position,
  Entity,
  EntityCategory,
  ChatMessage,
  AIConfig,
} from '@/types';
import * as projectsDB from '@/db/projectsDB';
import { generateId } from '@/utils/idGenerator';
import { revokeAllBlobUrls, collectAssetReplacements, getMemoryDiagnostics, cleanStaleBlobUrls, offloadAssetsInPlace } from '@/utils/blobCache';
import { clearThumbnailCache } from '@/utils/thumbnailCache';

/**
 * PROJECT STORE STATE INTERFACE
 * Defines the shape of the project state.
 */
interface ProjectState {
  // ==================== STATE PROPERTIES ====================

  /**
   * Currently loaded project.
   * null when no project is open.
   */
  currentProject: Project | null;

  /**
   * Whether there are unsaved changes.
   * true when project has been modified since last save.
   */
  isDirty: boolean;

  /**
   * Currently selected node ID.
   * null when no node is selected.
   */
  selectedNodeId: string | null;

  /**
   * Currently selected edge ID.
   * null when no edge is selected.
   */
  selectedEdgeId: string | null;

  /**
   * Loading state flag.
   * true ONLY when initially loading a project from the database.
   * NOT used during save operations (use isSaving instead).
   */
  isLoading: boolean;

  /**
   * Saving state flag.
   * true when saving the project to the database.
   * Separate from isLoading so saves don't trigger full-screen spinners.
   */
  isSaving: boolean;

  /**
   * Error message (if any operation failed).
   */
  error: string | null;

  /**
   * Undo history - past states.
   */
  history: Project[];

  /**
   * Current position in history.
   */
  historyIndex: number;

  // ==================== PROJECT OPERATIONS ====================

  /**
   * Loads a project from the database.
   * @param id - Project ID to load
   */
  loadProject: (id: string) => Promise<void>;

  /**
   * Saves the current project to the database.
   */
  saveProject: () => Promise<void>;

  /**
   * Saves the project then replaces in-memory base64 data URLs with blob URLs.
   * This moves multi-MB binary data from V8 heap to native blob storage.
   * Call after batch operations that add large assets (e.g., OW scene creation).
   */
  saveAndOffloadAssets: () => Promise<void>;

  /**
   * Closes the current project.
   */
  closeProject: () => void;

  /**
   * Updates project info (title, author, etc.).
   * @param info - Partial project info to update
   */
  updateProjectInfo: (info: Partial<Project['info']>) => void;

  // ==================== NODE OPERATIONS ====================

  /**
   * Adds a new node to the project.
   * @param node - The node to add
   */
  addNode: (node: StoryNode) => void;

  /**
   * Updates an existing node.
   * @param id - Node ID
   * @param updates - Partial node data to update
   */
  updateNode: (id: string, updates: Partial<StoryNode>) => void;

  /**
   * Deletes a node and its connected edges.
   * @param id - Node ID to delete
   */
  deleteNode: (id: string) => void;

  /**
   * Deletes multiple nodes and their connected edges in a single history entry.
   * @param ids - Array of node IDs to delete
   */
  deleteNodes: (ids: string[]) => void;

  /**
   * Moves a node to a new position.
   * @param id - Node ID
   * @param position - New position
   */
  moveNode: (id: string, position: Position) => void;

  /**
   * Selects a node.
   * @param id - Node ID to select (null to deselect)
   */
  selectNode: (id: string | null) => void;

  // ==================== EDGE OPERATIONS ====================

  /**
   * Adds a new edge (connection) between nodes.
   * @param edge - The edge to add
   */
  addEdge: (edge: StoryEdge) => void;

  /**
   * Deletes an edge.
   * @param id - Edge ID to delete
   */
  deleteEdge: (id: string) => void;

  /**
   * Updates an existing edge's properties (e.g., data, style).
   * @param id - Edge ID
   * @param updates - Partial edge data to merge
   */
  updateEdge: (id: string, updates: Partial<StoryEdge>) => void;

  /**
   * Selects an edge.
   * @param id - Edge ID to select (null to deselect)
   */
  selectEdge: (id: string | null) => void;

  // ==================== VARIABLE OPERATIONS ====================

  /**
   * Adds a new variable to the project.
   * @param variable - The variable to add
   */
  addVariable: (variable: Variable) => void;

  /**
   * Updates an existing variable.
   * @param id - Variable ID
   * @param updates - Partial variable data to update
   */
  updateVariable: (id: string, updates: Partial<Variable>) => void;

  /**
   * Deletes a variable.
   * @param id - Variable ID to delete
   */
  deleteVariable: (id: string) => void;

  // ==================== ASSET NAMES ====================

  /**
   * Sets a user-friendly name for an asset.
   * @param fingerprint - The asset fingerprint (from getAssetFingerprint)
   * @param name - The user-given name (empty string to remove)
   */
  updateAssetName: (fingerprint: string, name: string) => void;

  // ==================== ENTITY OPERATIONS ====================

  /**
   * Adds a new entity to the project.
   * @param entity - The entity to add
   */
  addEntity: (entity: Entity) => void;

  /**
   * Updates an existing entity.
   * @param id - Entity ID
   * @param updates - Partial entity data to update
   */
  updateEntity: (id: string, updates: Partial<Entity>) => void;

  /**
   * Deletes an entity.
   * @param id - Entity ID to delete
   */
  deleteEntity: (id: string) => void;

  /**
   * Gets all entities of a specific category.
   * @param category - The category to filter by
   */
  getEntitiesByCategory: (category: EntityCategory) => Entity[];

  // ==================== NOTES OPERATIONS ====================

  /**
   * Updates the project's notes text.
   * @param notes - The full notes content
   */
  updateNotes: (notes: string) => void;

  // ==================== CHAT OPERATIONS ====================

  /**
   * Adds a chat message to the project.
   * @param message - The ChatMessage to add
   */
  addChatMessage: (message: ChatMessage) => void;

  /**
   * Clears all chat messages from the project.
   */
  clearChatMessages: () => void;

  /**
   * Updates the AI configuration for the current project.
   * @param config - Partial AIConfig to merge into the existing config
   */
  updateAIConfig: (config: Partial<AIConfig>) => void;

  /**
   * Updates a specific chat message (e.g. to append streaming text or mark as done).
   * @param id - The ChatMessage id
   * @param updates - Partial ChatMessage fields to merge
   */
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;

  // ==================== ENTITY STATE OPERATIONS ====================

  /**
   * Updates the situational attributes for an entity within a specific scene.
   * @param nodeId - The scene node ID
   * @param entityId - The entity ID
   * @param stateText - The freeform situational text (empty string removes entry)
   */
  updateEntityState: (nodeId: string, entityId: string, stateText: string) => void;

  // ==================== UNDO/REDO ====================

  /**
   * Undoes the last change.
   */
  undo: () => void;

  /**
   * Redoes the last undone change.
   */
  redo: () => void;

  /**
   * Whether undo is available.
   */
  canUndo: () => boolean;

  /**
   * Whether redo is available.
   */
  canRedo: () => boolean;

  // ==================== UTILITY ====================

  /**
   * Clears any error message.
   */
  clearError: () => void;

  /**
   * Gets a node by ID.
   * @param id - Node ID
   */
  getNode: (id: string) => StoryNode | undefined;

  /**
   * Gets an edge by ID.
   * @param id - Edge ID
   */
  getEdge: (id: string) => StoryEdge | undefined;
}

/**
 * MAXIMUM HISTORY LENGTH
 * Reduced from 50 to 20 to prevent memory issues with large projects.
 * Each history entry is a full deep copy including embedded assets.
 */
const MAX_HISTORY = 8;

/**
 * AUTO-SAVE DELAY (milliseconds)
 * How long to wait after changes before auto-saving.
 */
const AUTO_SAVE_DELAY = 2000;

/**
 * HISTORY DEBOUNCE DELAY (milliseconds)
 * How long to wait before creating a new history entry.
 * This prevents creating history entries on every keystroke.
 */
const HISTORY_DEBOUNCE_DELAY = 500;

// Debounce timers
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let historyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingHistoryState: Project | null = null;

/**
 * When true, recordHistory() is a no-op. Used during Open World scene
 * creation to batch multiple addNode/addEdge/updateNode calls without
 * triggering expensive JSON snapshots for each one.
 */
let suppressHistory = false;

/**
 * Temporarily suppress history recording. Call the returned function
 * to re-enable it. While suppressed, store mutations still work
 * (via Immer) but no undo snapshots are created.
 */
export function suppressHistoryRecording(): () => void {
  suppressHistory = true;
  return () => { suppressHistory = false; };
}

/**
 * Cancel any pending auto-save timer. Call this when transitioning to
 * play mode so that a debounced auto-save doesn't trigger rehydrateForSave()
 * (which calls structuredClone) while the player is loading — that clone
 * can spike V8 heap by 50-200 MB and push past the OOM threshold.
 */
export function cancelPendingAutoSave(): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    console.log('[ProjectStore] Cancelled pending auto-save (play mode transition)');
  }
  if (historyDebounceTimer) {
    clearTimeout(historyDebounceTimer);
    historyDebounceTimer = null;
    pendingHistoryState = null;
  }
}

/**
 * CREATE PROJECT STORE
 * Zustand store for project state management.
 *
 * The `immer` middleware allows us to write "mutating" code
 * that actually creates immutable updates. This makes the
 * code cleaner and less error-prone.
 *
 * WITHOUT IMMER:
 * state.nodes = [...state.nodes, newNode]; // Must create new array
 *
 * WITH IMMER:
 * state.nodes.push(newNode); // Looks like mutation, but creates new state
 */
export const useProjectStore = create<ProjectState>()(
  immer((set, get) => ({
    // ==================== INITIAL STATE ====================

    currentProject: null,
    isDirty: false,
    selectedNodeId: null,
    selectedEdgeId: null,
    isLoading: false,
    isSaving: false,
    error: null,
    history: [],
    historyIndex: -1,

    // ==================== PROJECT OPERATIONS ====================

    loadProject: async (id: string) => {
      // Set loading state
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        // Load from database
        const project = await projectsDB.getProject(id);

        if (!project) {
          throw new Error('Project not found');
        }

        // ── Backwards-compatibility migration ──
        // Ensure all optional fields are explicitly present on the object.
        // JSON.stringify drops `undefined` properties, so if an older project
        // never had these fields, they'd vanish during history snapshots and
        // saves, potentially losing data added after load.
        if (project.entities == null) project.entities = [];
        if (project.notes == null) project.notes = '';
        if (project.assetNames == null) project.assetNames = {};
        if (project.chatMessages == null) project.chatMessages = [];
        if (project.globalVariables == null) project.globalVariables = [];
        if (project.nodes == null) project.nodes = [];
        if (project.edges == null) project.edges = [];

        // Clean stale blob URLs from previous sessions.
        // Blob URLs don't survive page reloads, so any blob URL string in
        // IndexedDB data is dead. Remove them before they propagate further.
        cleanStaleBlobUrls(project);

        // ── OOM FIX: Convert base64 → blob URLs IN PLACE before setting state ──
        // The project from IndexedDB has ALL assets as multi-MB base64 strings.
        // If we set state first, then clone for history, the memory triples:
        //   100MB (state) + 100MB (structuredClone) + 100MB (blob conversion)
        // By converting BEFORE state is set, each base64 string is replaced
        // with a ~50 byte blob URL and can be GC'd immediately. After this,
        // the project object is tiny and all cloning/state-setting is cheap.
        const offloaded = offloadAssetsInPlace(project);
        if (offloaded > 0) {
          console.log(`[ProjectStore] Pre-load offload: ${offloaded} assets → native blobs (before state set)`);
        }

        // Update state — project now has blob URLs (tiny) instead of base64 (huge).
        // snapshotProjectLean + structuredClone is cheap because blob URLs are ~50 bytes.
        set((state) => {
          state.currentProject = project;
          state.isLoading = false;
          state.isDirty = false;
          state.selectedNodeId = null;
          state.selectedEdgeId = null;
          // Reset history for new project (lean snapshot — no binary assets)
          state.history = [snapshotProjectLean(project)];
          state.historyIndex = 0;
        });

        console.log('[ProjectStore] Project loaded:', project.info.title);

        const diag = getMemoryDiagnostics(get().currentProject);
        console.log('[ProjectStore] Post-load memory:', {
          jsHeapMB: diag.jsHeapUsed ? Math.round(diag.jsHeapUsed / 1024 / 1024) : 'N/A',
          blobStore: diag.blobStoreEntries,
          base64Remaining: diag.projectAssetStats?.totalBase64Bytes ?? 0,
        });
      } catch (error) {
        set((state) => {
          state.isLoading = false;
          state.error = error instanceof Error ? error.message : 'Failed to load project';
        });
        console.error('[ProjectStore] Failed to load project:', error);
      }
    },

    saveProject: async () => {
      const { currentProject } = get();

      if (!currentProject) {
        console.warn('[ProjectStore] No project to save');
        return;
      }

      // Use isSaving (not isLoading) so the editor UI stays mounted
      set((state) => {
        state.isSaving = true;
      });

      try {
        // Save to database
        await projectsDB.saveProject(currentProject);

        set((state) => {
          state.isSaving = false;
          state.isDirty = false;
        });

        console.log('[ProjectStore] Project saved:', currentProject.info.title);
      } catch (error) {
        set((state) => {
          state.isSaving = false;
          state.error = error instanceof Error ? error.message : 'Failed to save project';
        });
        console.error('[ProjectStore] Failed to save project:', error);
      }
    },

    saveAndOffloadAssets: async () => {
      const { currentProject, saveProject: doSave } = get();
      if (!currentProject) return;

      // Step 1: Save full project to IndexedDB (rehydrates blob URLs → base64)
      await doSave();

      // Step 2: Collect base64 → blob URL replacements (creates Blobs in native memory)
      // This runs OUTSIDE Immer so getBlobUrl() can do its work freely.
      const replacements = collectAssetReplacements(currentProject);
      if (replacements.length === 0) return;

      // Step 3: Apply replacements inside Immer (suppressed from undo history)
      // After this, in-memory nodes hold blob URLs (~50 bytes) instead of
      // multi-MB base64 strings. The binary data lives in native blob storage.
      const unsuppress = suppressHistoryRecording();
      set((state) => {
        if (!state.currentProject) return;
        for (const { type, id, field, blobUrl } of replacements) {
          if (type === 'node') {
            const node = state.currentProject.nodes.find((n) => n.id === id);
            if (node && node.type === 'scene') {
              (node.data as Record<string, unknown>)[field] = blobUrl;
            }
          } else {
            const entity = state.currentProject.entities?.find((e) => e.id === id);
            if (entity) {
              (entity as Record<string, unknown>)[field] = blobUrl;
            }
          }
        }
      });
      unsuppress();

      // Log memory improvement
      const diag = getMemoryDiagnostics(get().currentProject);
      console.log(`[ProjectStore] Asset offload: ${replacements.length} assets moved to native blob storage.`, {
        remainingBase64Bytes: diag.projectAssetStats?.totalBase64Bytes ?? 0,
        blobUrlCount: diag.projectAssetStats?.totalBlobUrlCount ?? 0,
        jsHeapMB: diag.jsHeapUsed ? Math.round(diag.jsHeapUsed / 1024 / 1024) : 'N/A',
      });
    },

    closeProject: () => {
      // Revoke all cached blob URLs to free native blob storage
      revokeAllBlobUrls();
      // Clear thumbnail cache to free downsampled image blob URLs
      clearThumbnailCache();

      set((state) => {
        state.currentProject = null;
        state.isDirty = false;
        state.selectedNodeId = null;
        state.selectedEdgeId = null;
        state.history = [];
        state.historyIndex = -1;
      });

      console.log('[ProjectStore] Project closed');
    },

    updateProjectInfo: (info) => {
      set((state) => {
        if (state.currentProject) {
          Object.assign(state.currentProject.info, info);
          state.isDirty = true;
        }
      });
    },

    // ==================== NODE OPERATIONS ====================

    addNode: (node) => {
      set((state) => {
        if (state.currentProject) {
          // Record history immediately (structural change)
          recordHistory(state, true);

          // Add the node
          state.currentProject.nodes.push(node);
          state.isDirty = true;

          console.log('[ProjectStore] Node added:', node.id, node.type);
        }
      });
      // Schedule auto-save
      scheduleAutoSave();
    },

    updateNode: (id, updates) => {
      set((state) => {
        if (state.currentProject) {
          const index = state.currentProject.nodes.findIndex((n) => n.id === id);

          if (index !== -1) {
            // Record history with debouncing (for text changes)
            recordHistory(state, false);

            // Apply updates
            Object.assign(state.currentProject.nodes[index], updates);
            state.isDirty = true;
          }
        }
      });
      // Schedule auto-save
      scheduleAutoSave();
    },

    deleteNode: (id) => {
      set((state) => {
        if (state.currentProject) {
          // Record history immediately (structural change)
          recordHistory(state, true);

          // Remove the node
          state.currentProject.nodes = state.currentProject.nodes.filter(
            (n) => n.id !== id
          );

          // Remove connected edges
          state.currentProject.edges = state.currentProject.edges.filter(
            (e) => e.source !== id && e.target !== id
          );

          // Clear selection if this node was selected
          if (state.selectedNodeId === id) {
            state.selectedNodeId = null;
          }

          state.isDirty = true;

          console.log('[ProjectStore] Node deleted:', id);
        }
      });
      // Schedule auto-save
      scheduleAutoSave();
    },

    deleteNodes: (ids) => {
      if (ids.length === 0) return;
      set((state) => {
        if (state.currentProject) {
          // Record history once for the entire batch (structural change)
          recordHistory(state, true);

          const idSet = new Set(ids);

          // Remove all matching nodes
          state.currentProject.nodes = state.currentProject.nodes.filter(
            (n) => !idSet.has(n.id)
          );

          // Remove all edges connected to any of the deleted nodes
          state.currentProject.edges = state.currentProject.edges.filter(
            (e) => !idSet.has(e.source) && !idSet.has(e.target)
          );

          // Clear selection if a deleted node was selected
          if (state.selectedNodeId && idSet.has(state.selectedNodeId)) {
            state.selectedNodeId = null;
          }

          state.isDirty = true;
          console.log(`[ProjectStore] Batch deleted ${ids.length} nodes`);
        }
      });
      scheduleAutoSave();
    },

    moveNode: (id, position) => {
      set((state) => {
        if (state.currentProject) {
          const node = state.currentProject.nodes.find((n) => n.id === id);

          if (node) {
            node.position = position;
            state.isDirty = true;
            // Note: Don't record history for every move (too many states)
          }
        }
      });
    },

    selectNode: (id) => {
      set((state) => {
        state.selectedNodeId = id;
        // Deselect edge when selecting node
        if (id) {
          state.selectedEdgeId = null;
        }
      });
    },

    // ==================== EDGE OPERATIONS ====================

    addEdge: (edge) => {
      set((state) => {
        if (state.currentProject) {
          // Check for duplicate edge
          const exists = state.currentProject.edges.some(
            (e) =>
              e.source === edge.source &&
              e.sourceHandle === edge.sourceHandle &&
              e.target === edge.target
          );

          if (!exists) {
            // Record history immediately (structural change)
            recordHistory(state, true);

            state.currentProject.edges.push(edge);
            state.isDirty = true;

            console.log('[ProjectStore] Edge added:', edge.id);
          }
        }
      });
      // Schedule auto-save
      scheduleAutoSave();
    },

    deleteEdge: (id) => {
      set((state) => {
        if (state.currentProject) {
          // Record history immediately (structural change)
          recordHistory(state, true);

          state.currentProject.edges = state.currentProject.edges.filter(
            (e) => e.id !== id
          );

          // Clear selection if this edge was selected
          if (state.selectedEdgeId === id) {
            state.selectedEdgeId = null;
          }

          state.isDirty = true;

          console.log('[ProjectStore] Edge deleted:', id);
        }
      });
      // Schedule auto-save
      scheduleAutoSave();
    },

    updateEdge: (id, updates) => {
      set((state) => {
        if (state.currentProject) {
          const index = state.currentProject.edges.findIndex((e) => e.id === id);
          if (index !== -1) {
            // Record history with debouncing (for text changes in edge data)
            recordHistory(state, false);
            Object.assign(state.currentProject.edges[index], updates);
            state.isDirty = true;
          }
        }
      });
      // Schedule auto-save
      scheduleAutoSave();
    },

    selectEdge: (id) => {
      set((state) => {
        state.selectedEdgeId = id;
        // Deselect node when selecting edge
        if (id) {
          state.selectedNodeId = null;
        }
      });
    },

    // ==================== VARIABLE OPERATIONS ====================

    addVariable: (variable) => {
      set((state) => {
        if (state.currentProject) {
          recordHistory(state, true);
          state.currentProject.globalVariables.push(variable);
          state.isDirty = true;

          console.log('[ProjectStore] Variable added:', variable.name);
        }
      });
      scheduleAutoSave();
    },

    updateVariable: (id, updates) => {
      set((state) => {
        if (state.currentProject) {
          const index = state.currentProject.globalVariables.findIndex(
            (v) => v.id === id
          );

          if (index !== -1) {
            recordHistory(state, false); // Debounced for text changes
            Object.assign(state.currentProject.globalVariables[index], updates);
            state.isDirty = true;
          }
        }
      });
      scheduleAutoSave();
    },

    deleteVariable: (id) => {
      set((state) => {
        if (state.currentProject) {
          recordHistory(state, true); // Immediate for deletion
          state.currentProject.globalVariables =
            state.currentProject.globalVariables.filter((v) => v.id !== id);
          state.isDirty = true;

          console.log('[ProjectStore] Variable deleted:', id);
        }
      });
      scheduleAutoSave();
    },

    // ==================== ASSET NAMES ====================

    updateAssetName: (fingerprint, name) => {
      set((state) => {
        if (state.currentProject) {
          // Initialize the assetNames map if it doesn't exist
          if (!state.currentProject.assetNames) {
            state.currentProject.assetNames = {};
          }

          if (name.trim()) {
            state.currentProject.assetNames[fingerprint] = name.trim();
          } else {
            // Empty name = remove the entry
            delete state.currentProject.assetNames[fingerprint];
          }
          state.isDirty = true;
        }
      });
      scheduleAutoSave();
    },

    // ==================== ENTITY OPERATIONS ====================

    addEntity: (entity) => {
      set((state) => {
        if (state.currentProject) {
          recordHistory(state, true);
          if (!state.currentProject.entities) {
            state.currentProject.entities = [];
          }
          state.currentProject.entities.push(entity);
          state.isDirty = true;
          console.log('[ProjectStore] Entity added:', entity.name, entity.category);
        }
      });
      scheduleAutoSave();
    },

    updateEntity: (id, updates) => {
      set((state) => {
        if (state.currentProject?.entities) {
          const index = state.currentProject.entities.findIndex((e) => e.id === id);
          if (index !== -1) {
            recordHistory(state, false); // Debounced for text changes
            Object.assign(state.currentProject.entities[index], updates);
            state.currentProject.entities[index].updatedAt = Date.now();
            state.isDirty = true;
          }
        }
      });
      scheduleAutoSave();
    },

    deleteEntity: (id) => {
      set((state) => {
        if (state.currentProject?.entities) {
          recordHistory(state, true); // Immediate for deletion
          state.currentProject.entities = state.currentProject.entities.filter(
            (e) => e.id !== id
          );
          state.isDirty = true;
          console.log('[ProjectStore] Entity deleted:', id);
        }
      });
      scheduleAutoSave();
    },

    getEntitiesByCategory: (category) => {
      const { currentProject } = get();
      return (currentProject?.entities || []).filter((e) => e.category === category);
    },

    // ==================== NOTES OPERATIONS ====================

    updateNotes: (notes) => {
      set((state) => {
        if (state.currentProject) {
          recordHistory(state, false); // Debounced — text changes
          state.currentProject.notes = notes;
          state.isDirty = true;
        }
      });
      scheduleAutoSave();
    },

    // ==================== CHAT OPERATIONS ====================

    addChatMessage: (message) => {
      set((state) => {
        if (state.currentProject) {
          // No history recording for chat messages — they are conversational
          // data, not story content, so undo/redo should not affect them.
          if (!state.currentProject.chatMessages) {
            state.currentProject.chatMessages = [];
          }
          state.currentProject.chatMessages.push(message);
          state.isDirty = true;
        }
      });
      scheduleAutoSave();
    },

    clearChatMessages: () => {
      set((state) => {
        if (state.currentProject) {
          state.currentProject.chatMessages = [];
          state.isDirty = true;
        }
      });
      scheduleAutoSave();
    },

    updateAIConfig: (config) => {
      set((state) => {
        if (state.currentProject) {
          // Merge into existing config or create a new one with defaults
          const existing = state.currentProject.aiConfig || {
            provider: 'gemini' as const,
            apiKey: '',
            model: 'gemini-3-flash-preview',
          };
          state.currentProject.aiConfig = { ...existing, ...config };
          state.isDirty = true;
        }
      });
      scheduleAutoSave();
    },

    updateChatMessage: (id, updates) => {
      set((state) => {
        if (state.currentProject?.chatMessages) {
          const index = state.currentProject.chatMessages.findIndex((m) => m.id === id);
          if (index !== -1) {
            Object.assign(state.currentProject.chatMessages[index], updates);
            // Only mark dirty for final updates, not every streaming token
            if (!updates.isStreaming) {
              state.isDirty = true;
            }
          }
        }
      });
      // Only schedule auto-save when streaming is done
      if (!updates.isStreaming) {
        scheduleAutoSave();
      }
    },

    // ==================== ENTITY STATE OPERATIONS ====================

    updateEntityState: (nodeId, entityId, stateText) => {
      set((state) => {
        if (state.currentProject) {
          const node = state.currentProject.nodes.find((n) => n.id === nodeId);
          if (node && node.type === 'scene') {
            recordHistory(state, false); // Debounced — text changes
            const sceneData = node.data as any;
            if (!sceneData.entityStates) {
              sceneData.entityStates = {};
            }
            if (stateText.trim()) {
              sceneData.entityStates[entityId] = stateText;
            } else {
              // Empty text removes the entry to keep data clean
              delete sceneData.entityStates[entityId];
            }
            state.isDirty = true;
          }
        }
      });
      scheduleAutoSave();
    },

    // ==================== UNDO/REDO ====================

    undo: () => {
      // Cancel any pending auto-save — without this, the debounced save
      // could fire AFTER undo and persist the reverted state, making the
      // user's pre-undo changes unrecoverable.
      cancelPendingAutoSave();

      set((state) => {
        if (state.historyIndex > 0 && state.currentProject) {
          // Deep-copy the lean snapshot and rehydrate binary assets from the live project.
          // structuredClone is faster than JSON roundtrip and handles more types.
          const liveProject = state.currentProject;
          state.historyIndex -= 1;
          const snapshot: Project = structuredClone(state.history[state.historyIndex]);
          state.currentProject = rehydrateAssets(snapshot, liveProject);
          state.isDirty = true;

          console.log('[ProjectStore] Undo, index:', state.historyIndex);
        }
      });
    },

    redo: () => {
      // Cancel any pending auto-save — same rationale as undo.
      cancelPendingAutoSave();

      set((state) => {
        if (
          state.historyIndex < state.history.length - 1 &&
          state.currentProject
        ) {
          // Deep-copy the lean snapshot and rehydrate binary assets from the live project.
          // structuredClone is faster than JSON roundtrip and handles more types.
          const liveProject = state.currentProject;
          state.historyIndex += 1;
          const snapshot: Project = structuredClone(state.history[state.historyIndex]);
          state.currentProject = rehydrateAssets(snapshot, liveProject);
          state.isDirty = true;

          console.log('[ProjectStore] Redo, index:', state.historyIndex);
        }
      });
    },

    canUndo: () => {
      const { historyIndex } = get();
      return historyIndex > 0;
    },

    canRedo: () => {
      const { historyIndex, history } = get();
      return historyIndex < history.length - 1;
    },

    // ==================== UTILITY ====================

    clearError: () => {
      set((state) => {
        state.error = null;
      });
    },

    getNode: (id: string) => {
      const { currentProject } = get();
      return currentProject?.nodes.find((n) => n.id === id);
    },

    getEdge: (id: string) => {
      const { currentProject } = get();
      return currentProject?.edges.find((e) => e.id === id);
    },
  }))
);

// =============================================================================
// ASSET FIELDS TO STRIP FROM HISTORY SNAPSHOTS
// =============================================================================
//
// These fields contain multi-megabyte base64 data URLs. Storing them in every
// undo/redo snapshot would multiply memory usage by MAX_HISTORY (8x).
// Instead, we replace them with a short placeholder. On undo/redo, the current
// project's live asset data is preserved — undo only restores structural
// changes (nodes/edges/choices/text), not binary blobs.

/** Fields on SceneNode.data that hold large binary assets */
const SCENE_ASSET_FIELDS = ['backgroundImage', 'backgroundMusic', 'voiceoverAudio'] as const;

/** Fields on Entity that hold large binary assets */
const ENTITY_ASSET_FIELDS = ['referenceImage', 'referenceVoice', 'defaultMusic'] as const;

/**
 * Set of all field names that hold binary asset data.
 * Used by the JSON replacer to skip them during serialization.
 */
const ALL_ASSET_FIELD_NAMES = new Set<string>([
  ...SCENE_ASSET_FIELDS,
  ...ENTITY_ASSET_FIELDS,
]);

/**
 * Creates a lightweight deep copy of a project with all binary asset fields
 * replaced by a short placeholder string. This prevents undo history from
 * holding dozens of copies of multi-megabyte base64 strings.
 *
 * Uses structuredClone() for the deep copy (faster and more memory-efficient
 * than JSON.stringify/parse), then strips asset fields in-place on the clone.
 * Also strips chatMessages since they aren't undoable.
 */
function snapshotProjectLean(project: Project): Project {
  // Use Immer's current() to unwrap drafts into plain objects before
  // cloning. structuredClone on Immer draft proxies can fail.
  let plain: Project;
  try {
    plain = current(project);
  } catch {
    // If current() fails (e.g. called on a non-draft), use the object as-is
    plain = project;
  }

  // structuredClone is native and faster than JSON roundtrip.
  // With blob URLs (~50 bytes each) in place of base64, the clone is cheap.
  const clone = structuredClone(plain);

  // Strip asset fields, AI response data, and chat messages in-place on clone
  clone.chatMessages = [];

  for (const node of clone.nodes) {
    if (node.type === 'scene') {
      const data = node.data as Record<string, unknown>;
      // Strip large binary asset strings
      for (const field of SCENE_ASSET_FIELDS) {
        if (typeof data[field] === 'string' && (data[field] as string).length > 200) {
          data[field] = '__asset_stripped__';
        }
      }
      // Strip raw AI response and constructed context (large strings)
      delete data.aiResponse;
      delete data.constructedContext;
      delete data.constructedSystemPrompt;
    }
  }

  for (const entity of (clone.entities || [])) {
    const e = entity as unknown as Record<string, unknown>;
    for (const field of ENTITY_ASSET_FIELDS) {
      if (typeof e[field] === 'string' && (e[field] as string).length > 200) {
        e[field] = '__asset_stripped__';
      }
    }
  }

  return clone;
}

/**
 * When restoring a history snapshot, we need to re-attach the live asset data
 * from the current project, since the snapshot has them stripped.
 * This merges asset fields from `liveProject` back into `snapshot`.
 */
function rehydrateAssets(snapshot: Project, liveProject: Project): Project {
  // Build lookup maps for fast access
  const liveNodeMap = new Map(liveProject.nodes.map(n => [n.id, n]));
  const liveEntityMap = new Map((liveProject.entities || []).map(e => [e.id, e]));

  for (const node of snapshot.nodes) {
    if (node.type === 'scene') {
      const data = node.data as Record<string, unknown>;
      const liveNode = liveNodeMap.get(node.id);
      const liveData = liveNode?.data as Record<string, unknown> | undefined;
      for (const field of SCENE_ASSET_FIELDS) {
        if (data[field] === '__asset_stripped__' && liveData?.[field]) {
          data[field] = liveData[field];
        }
      }
    }
  }

  if (snapshot.entities) {
    for (const entity of snapshot.entities) {
      const e = entity as unknown as Record<string, unknown>;
      const liveEntity = liveEntityMap.get(entity.id);
      const le = liveEntity as unknown as Record<string, unknown> | undefined;
      for (const field of ENTITY_ASSET_FIELDS) {
        if (e[field] === '__asset_stripped__' && le?.[field]) {
          e[field] = le[field];
        }
      }
    }
  }

  // Restore chat messages from the live project
  snapshot.chatMessages = liveProject.chatMessages || [];

  return snapshot;
}

/**
 * RECORD HISTORY HELPER
 * Adds current state to history before making a change.
 * Now with debouncing to prevent excessive memory usage from rapid changes.
 * Binary asset fields are stripped from snapshots to save memory.
 *
 * @param state - Current state (from immer)
 * @param immediate - If true, record immediately without debouncing
 */
function recordHistory(state: ProjectState, immediate: boolean = false): void {
  if (!state.currentProject) return;
  // Skip if history recording is suppressed (e.g. during OW scene creation)
  if (suppressHistory) return;

  // For immediate recording (deletions, structural changes), record now
  if (immediate) {
    commitHistory(state);
    return;
  }

  // For text changes, use debouncing - store the state to commit later
  // The actual commit happens after HISTORY_DEBOUNCE_DELAY
  if (!pendingHistoryState) {
    // First change in a series - capture the "before" state (lean — no binary assets)
    pendingHistoryState = snapshotProjectLean(state.currentProject);
  }

  // Clear existing timer and set a new one
  if (historyDebounceTimer) {
    clearTimeout(historyDebounceTimer);
  }

  historyDebounceTimer = setTimeout(() => {
    const currentState = useProjectStore.getState();
    if (pendingHistoryState && currentState.currentProject) {
      // Commit the pending history state
      useProjectStore.setState((s) => {
        // Remove any redo states
        s.history = s.history.slice(0, s.historyIndex + 1);
        // Add the "before" state
        s.history.push(pendingHistoryState!);
        // Trim if needed
        if (s.history.length > MAX_HISTORY) {
          s.history = s.history.slice(-MAX_HISTORY);
        }
        s.historyIndex = s.history.length - 1;
      });
      pendingHistoryState = null;
    }
    historyDebounceTimer = null;
  }, HISTORY_DEBOUNCE_DELAY);
}

/**
 * COMMIT HISTORY IMMEDIATELY
 * Used for structural changes that should be immediately undoable.
 */
function commitHistory(state: ProjectState): void {
  if (!state.currentProject) return;

  // If there's a pending history state, commit it first
  if (pendingHistoryState) {
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(pendingHistoryState);
    pendingHistoryState = null;
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = null;
    }
  }

  // Remove any redo states (future history)
  state.history = state.history.slice(0, state.historyIndex + 1);

  // Add current state to history (lean snapshot — binary assets stripped)
  state.history.push(snapshotProjectLean(state.currentProject));

  // Trim history if too long
  if (state.history.length > MAX_HISTORY) {
    state.history = state.history.slice(-MAX_HISTORY);
  }

  // Update index
  state.historyIndex = state.history.length - 1;
}

/**
 * SCHEDULE AUTO-SAVE
 * Debounces auto-save to prevent saving on every keystroke.
 */
function scheduleAutoSave(): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(async () => {
    const state = useProjectStore.getState();
    if (state.currentProject && state.isDirty) {
      console.log('[ProjectStore] Auto-saving...');
      try {
        await state.saveProject();
      } catch (err) {
        // Auto-save errors must NOT propagate — an unhandled promise rejection
        // from a setTimeout crashes the page. The saveProject() function already
        // handles retries and falls back to server backup, so by the time it
        // throws, the data is either saved or backed up. Just log the warning.
        console.warn('[ProjectStore] Auto-save failed (data may be backed up to server):', err);
      }
    }
    autoSaveTimer = null;
  }, AUTO_SAVE_DELAY);
}
