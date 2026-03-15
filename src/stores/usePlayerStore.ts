/**
 * =============================================================================
 * PLAYER STATE STORE (ZUSTAND)
 * =============================================================================
 *
 * This file manages the state of the game player/runtime.
 *
 * WHAT STATE LIVES HERE?
 * - Current game session (where player is, variable values)
 * - Player preferences (volume, text speed)
 * - UI state (menus, dialogs)
 *
 * RUNTIME vs. EDIT TIME:
 * - Edit time: Designing the game in the editor
 * - Runtime: Playing the game
 *
 * This store is for RUNTIME state only.
 *
 * =============================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  GameSession,
  SaveSlot,
  SceneDisplayData,
  VariableChangeAnimation,
  VariableValue,
} from '@/types';
import type { Project } from '@/types';
// revokeAllBlobUrls removed from endGame — see endGame() comment for why
// import kept commented as documentation breadcrumb
import { clearThumbnailCache } from '@/utils/thumbnailCache';
import { clearOwContextStore } from '@/utils/owContextStore';

/**
 * PLAYER PREFERENCES
 * User preferences for playing games.
 */
export interface PlayerPreferences {
  /** Master volume (0-1) */
  masterVolume: number;
  /** Music volume (0-1) */
  musicVolume: number;
  /** SFX volume (0-1) */
  sfxVolume: number;
  /** Voice volume (0-1) */
  voiceVolume: number;
  /** Text speed (characters per second, 0 = instant) */
  textSpeed: number;
  /** Whether to auto-play TTS */
  autoTTS: boolean;
  /** Selected TTS voice */
  ttsVoice: string;
}

/**
 * PLAYER STORE STATE INTERFACE
 */
interface PlayerState {
  // ==================== GAME STATE ====================

  /** Currently loaded project (for playing) */
  project: Project | null;

  /** Current game session */
  session: GameSession | null;

  /** Current scene data to display */
  currentScene: SceneDisplayData | null;

  /** Whether game is in loading state */
  isLoading: boolean;

  /** Error message (if any) */
  error: string | null;

  /** Whether open world mode is active */
  openWorldMode: boolean;

  // ==================== UI STATE ====================

  /** Whether system menu is open */
  isMenuOpen: boolean;

  /** Whether save/load dialog is open */
  isSaveLoadOpen: boolean;

  /** Whether settings dialog is open */
  isSettingsOpen: boolean;

  /** Whether text is currently typing */
  isTyping: boolean;

  /** Pending variable change animations */
  pendingAnimations: VariableChangeAnimation[];

  // ==================== PREFERENCES ====================

  /** Player preferences */
  preferences: PlayerPreferences;

  // ==================== SAVE SLOTS ====================

  /** Available save slots */
  saveSlots: SaveSlot[];

  // ==================== ACTIONS ====================

  /** Start a new game */
  startGame: (project: Project) => void;

  /** Start a new game from a specific node with default variable values */
  startGameFromNode: (project: Project, nodeId: string) => void;

  /** Continue from a specific node using the latest autosave variable state */
  continueFromNode: (project: Project, nodeId: string) => void;

  /** Auto-save current session to the special autosave slot (slot 0) */
  autosave: () => Promise<void>;

  /** Load a saved game */
  loadGame: (saveSlot: SaveSlot) => void;

  /** Save current game */
  saveGame: (slotId: number, name?: string) => Promise<void>;

  /** End the current game */
  endGame: () => void;

  /** Process player choice */
  makeChoice: (choiceId: string) => void;

  /** Update current scene */
  setCurrentScene: (scene: SceneDisplayData | null) => void;

  /** Toggle menu */
  toggleMenu: () => void;

  /** Close all dialogs */
  closeAllDialogs: () => void;

  /** Open save/load dialog */
  openSaveLoad: () => void;

  /** Open settings dialog */
  openSettings: () => void;

  /** Update preferences */
  updatePreferences: (prefs: Partial<PlayerPreferences>) => void;

  /** Set typing state */
  setTyping: (isTyping: boolean) => void;

  /** Add variable change animation */
  addAnimation: (animation: VariableChangeAnimation) => void;

  /** Remove animation */
  removeAnimation: (id: string) => void;

  /** Update variable value */
  updateVariable: (name: string, value: unknown) => void;

  /** Add item to inventory */
  addToInventory: (itemId: string) => void;

  /** Remove item from inventory */
  removeFromInventory: (itemId: string) => void;

  /** Set error */
  setError: (error: string | null) => void;

  /** Set current node ID (for tracking game progress) */
  setCurrentNodeId: (nodeId: string) => void;

  /** Enable/disable open world mode */
  setOpenWorldMode: (enabled: boolean) => void;
}

/**
 * DEFAULT PLAYER PREFERENCES
 */
const DEFAULT_PREFERENCES: PlayerPreferences = {
  masterVolume: 1,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  voiceVolume: 1,
  textSpeed: 30,
  autoTTS: false,
  ttsVoice: '',
};

/**
 * CREATE PLAYER STORE
 */
export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      // ==================== INITIAL STATE ====================

      project: null,
      session: null,
      currentScene: null,
      isLoading: false,
      error: null,
      openWorldMode: false,
      isMenuOpen: false,
      isSaveLoadOpen: false,
      isSettingsOpen: false,
      isTyping: false,
      pendingAnimations: [],
      preferences: DEFAULT_PREFERENCES,
      saveSlots: [],

      // ==================== ACTIONS ====================

      startGame: (project) => {
        console.log('[PlayerStore] Starting game:', project.info.title);

        // Initialize variables from defaults
        const variables: Record<string, VariableValue> = {};
        project.globalVariables.forEach((v) => {
          variables[v.name] = v.defaultValue;
        });

        // Create initial session
        const session: GameSession = {
          projectId: project.id,
          currentNodeId: project.settings.startNodeId || '',
          variables,
          inventory: [],
          history: [],
          flags: {},
          timestamp: Date.now(),
          playtime: 0,
          isPaused: false,
          isMenuOpen: false,
          isTyping: false,
          isAudioPlaying: false,
          sessionStartTime: Date.now(),
          pendingChanges: [],
        };

        set({
          project,
          session,
          isLoading: false,
          error: null,
        });
      },

      startGameFromNode: (project, nodeId) => {
        console.log('[PlayerStore] Starting game from node:', nodeId);

        // Initialize variables from defaults (fresh start)
        const variables: Record<string, VariableValue> = {};
        project.globalVariables.forEach((v) => {
          variables[v.name] = v.defaultValue;
        });

        const session: GameSession = {
          projectId: project.id,
          currentNodeId: nodeId,
          variables,
          inventory: [],
          history: [],
          flags: {},
          timestamp: Date.now(),
          playtime: 0,
          isPaused: false,
          isMenuOpen: false,
          isTyping: false,
          isAudioPlaying: false,
          sessionStartTime: Date.now(),
          pendingChanges: [],
        };

        set({
          project,
          session,
          isLoading: false,
          error: null,
        });
      },

      continueFromNode: (project, nodeId) => {
        console.log('[PlayerStore] Continuing from node:', nodeId);

        const { saveSlots } = get();
        // Look for autosave slot (id === 0)
        const autosave = saveSlots.find((s) => s.id === 0);

        // Use autosave variables if available AND same project, otherwise use defaults
        let variables: Record<string, VariableValue> = {};
        let inventory: string[] = [];
        let flags: Record<string, boolean> = {};
        let history: string[] = [];

        if (autosave && autosave.gameState.projectId === project.id) {
          const saved = autosave.gameState as unknown as GameSession;
          variables = { ...saved.variables };
          inventory = [...(saved.inventory || [])];
          flags = { ...(saved.flags || {}) };
          history = [...(saved.history || [])];
          console.log('[PlayerStore] Restored variables from autosave');
        } else {
          project.globalVariables.forEach((v) => {
            variables[v.name] = v.defaultValue;
          });
          console.log('[PlayerStore] No autosave found, using defaults');
        }

        const session: GameSession = {
          projectId: project.id,
          currentNodeId: nodeId,
          variables,
          inventory,
          history,
          flags,
          timestamp: Date.now(),
          playtime: autosave ? (autosave.gameState as any).playtime || 0 : 0,
          isPaused: false,
          isMenuOpen: false,
          isTyping: false,
          isAudioPlaying: false,
          sessionStartTime: Date.now(),
          pendingChanges: [],
        };

        set({
          project,
          session,
          isLoading: false,
          error: null,
        });
      },

      autosave: async () => {
        const { session, project, saveSlots } = get();
        if (!session || !project) return;

        console.log('[PlayerStore] Autosaving...');

        const saveSlot: SaveSlot = {
          id: 0,
          gameState: {
            projectId: session.projectId,
            currentNodeId: session.currentNodeId,
            variables: session.variables,
            inventory: session.inventory,
            history: session.history,
            flags: session.flags,
            timestamp: Date.now(),
            playtime: session.playtime,
          },
          savedAt: Date.now(),
          name: 'Autosave',
        };

        const newSlots = saveSlots.filter((s) => s.id !== 0);
        newSlots.push(saveSlot);
        newSlots.sort((a, b) => a.id - b.id);

        set({ saveSlots: newSlots });
      },

      loadGame: (saveSlot) => {
        console.log('[PlayerStore] Loading save:', saveSlot.id);

        const { project } = get();
        if (!project) {
          set({ error: 'No project loaded' });
          return;
        }

        // Create session from save
        const session: GameSession = {
          ...(saveSlot.gameState as unknown as GameSession),
          isPaused: false,
          isMenuOpen: false,
          isTyping: false,
          isAudioPlaying: false,
          sessionStartTime: Date.now(),
          pendingChanges: [],
        };

        set({
          session,
          isSaveLoadOpen: false,
        });
      },

      saveGame: async (slotId, name) => {
        const { session, project, saveSlots } = get();

        if (!session || !project) {
          console.warn('[PlayerStore] Cannot save: no active session');
          return;
        }

        console.log('[PlayerStore] Saving to slot:', slotId);

        // Create save slot
        const saveSlot: SaveSlot = {
          id: slotId,
          gameState: {
            projectId: session.projectId,
            currentNodeId: session.currentNodeId,
            variables: session.variables,
            inventory: session.inventory,
            history: session.history,
            flags: session.flags,
            timestamp: Date.now(),
            playtime: session.playtime,
          },
          savedAt: Date.now(),
          name: name || `Save ${slotId}`,
        };

        // Update save slots
        const newSlots = saveSlots.filter((s) => s.id !== slotId);
        newSlots.push(saveSlot);
        newSlots.sort((a, b) => a.id - b.id);

        set({
          saveSlots: newSlots,
          isSaveLoadOpen: false,
        });
      },

      endGame: () => {
        console.log('[PlayerStore] Ending game');

        // Clear thumbnail cache and OW context, but DO NOT revoke blob URLs.
        //
        // WHY NOT revokeAllBlobUrls()?
        // The editor's loadProject() will re-load from IndexedDB and call
        // collectAssetReplacements() to create fresh blob URLs. But if the
        // user has unsaved changes or if a save happens mid-eviction,
        // revoking blob URLs prevents rehydrateForSave() from converting
        // them back to base64, causing permanent data loss in IndexedDB.
        //
        // Instead, blob URLs from the play session will be orphaned (the
        // browser holds them until the tab is closed or they're explicitly
        // revoked). The editor's loadProject() creates new blob URLs from
        // the fresh base64 data in IndexedDB, so old ones are harmless.
        // Any accumulated blob memory is freed naturally on page navigation
        // or when the editor creates its own fresh blob URLs.
        clearThumbnailCache();
        clearOwContextStore();
        console.log('[PlayerStore] Cleaned up thumbnail cache and OW context store (blob URLs preserved for safe save)');

        set({
          project: null,
          session: null,
          currentScene: null,
          isMenuOpen: false,
        });
      },

      makeChoice: (choiceId) => {
        console.log('[PlayerStore] Choice made:', choiceId);

        // Choice handling is done by the game engine
        // This just logs the action
        set((state) => {
          if (state.session) {
            return {
              session: {
                ...state.session,
                history: [...state.session.history, state.session.currentNodeId],
              },
            };
          }
          return state;
        });
      },

      setCurrentScene: (scene) => {
        set({ currentScene: scene });
      },

      toggleMenu: () => {
        set((state) => ({
          isMenuOpen: !state.isMenuOpen,
          isSaveLoadOpen: false,
          isSettingsOpen: false,
        }));
      },

      closeAllDialogs: () => {
        set({
          isMenuOpen: false,
          isSaveLoadOpen: false,
          isSettingsOpen: false,
        });
      },

      openSaveLoad: () => {
        set({
          isSaveLoadOpen: true,
          isMenuOpen: false,
        });
      },

      openSettings: () => {
        set({
          isSettingsOpen: true,
          isMenuOpen: false,
        });
      },

      updatePreferences: (prefs) => {
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        }));
      },

      setTyping: (isTyping) => {
        set({ isTyping });
      },

      addAnimation: (animation) => {
        set((state) => ({
          pendingAnimations: [...state.pendingAnimations, animation],
        }));

        // Auto-remove after animation duration
        setTimeout(() => {
          get().removeAnimation(animation.id);
        }, 1500);
      },

      removeAnimation: (id) => {
        set((state) => ({
          pendingAnimations: state.pendingAnimations.filter((a) => a.id !== id),
        }));
      },

      updateVariable: (name, value) => {
        set((state) => {
          if (!state.session) return state;

          // Create a new variables object with proper typing
          const newVars = Object.assign(
            {},
            state.session.variables,
            { [name]: value }
          ) as Record<string, VariableValue>;

          return {
            ...state,
            session: {
              ...state.session,
              variables: newVars,
            } as GameSession,
          };
        });
      },

      addToInventory: (itemId) => {
        set((state) => {
          if (state.session && !state.session.inventory.includes(itemId)) {
            return {
              session: {
                ...state.session,
                inventory: [...state.session.inventory, itemId],
              },
            };
          }
          return state;
        });
      },

      removeFromInventory: (itemId) => {
        set((state) => {
          if (state.session) {
            return {
              session: {
                ...state.session,
                inventory: state.session.inventory.filter((id) => id !== itemId),
              },
            };
          }
          return state;
        });
      },

      setError: (error) => {
        set({ error });
      },

      setCurrentNodeId: (nodeId) => {
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              currentNodeId: nodeId,
            },
          };
        });
      },

      setOpenWorldMode: (enabled) => {
        set({ openWorldMode: enabled });
      },
    }),
    {
      name: 'storyweaver-player',
      // Only persist preferences and save slots
      partialize: (state) => ({
        preferences: state.preferences,
        saveSlots: state.saveSlots,
      }),
    }
  )
);
