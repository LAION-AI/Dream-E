/**
 * =============================================================================
 * GAME STATE TYPE DEFINITIONS
 * =============================================================================
 *
 * This file defines types for runtime game state.
 *
 * WHAT IS GAME STATE?
 * Game state represents the current status of a playthrough:
 * - Which node the player is on
 * - Current values of all variables
 * - Items in inventory
 * - History of visited nodes
 * - Playtime
 *
 * Game state can be saved and loaded, allowing players to
 * continue their game later.
 *
 * =============================================================================
 */

import { VariableValue } from './variables';

/**
 * GAME STATE INTERFACE
 * Complete state of a game in progress.
 *
 * This object contains everything needed to restore
 * a player's exact position in the game.
 */
export interface GameState {
  /**
   * ID of the project this state belongs to.
   */
  projectId: string;

  /**
   * ID of the current node.
   * This is where the game will resume.
   */
  currentNodeId: string;

  /**
   * Current values of all variables.
   * Key: variable name, Value: current value
   */
  variables: Record<string, VariableValue>;

  /**
   * List of items in the player's inventory.
   * Array of item IDs (strings).
   */
  inventory: string[];

  /**
   * History of recently visited nodes.
   * Used for the "Back" feature (if enabled).
   * Limited to last N nodes for memory efficiency.
   */
  history: string[];

  /**
   * Flags/markers for game progress.
   * Used for tracking one-time events, achievements, etc.
   */
  flags: Record<string, boolean>;

  /**
   * When this state was created/saved.
   * Unix timestamp in milliseconds.
   */
  timestamp: number;

  /**
   * Total playtime in seconds.
   * Accumulated across all sessions.
   */
  playtime: number;

  /**
   * Random seed for reproducible random events.
   * Can be used to replay the same "random" outcomes.
   */
  randomSeed?: number;
}

/**
 * SAVE SLOT INTERFACE
 * A saved game slot with metadata.
 */
export interface SaveSlot {
  /**
   * Slot number (0 = auto-save, 1-N = manual saves).
   */
  id: number;

  /**
   * The actual game state.
   */
  gameState: GameState;

  /**
   * Screenshot thumbnail of the save.
   * Base64 encoded image for preview.
   */
  screenshot?: string;

  /**
   * When the save was created.
   * Unix timestamp in milliseconds.
   */
  savedAt: number;

  /**
   * Human-readable save name.
   * Auto-generated or user-provided.
   * Example: "Before the Dragon Fight"
   */
  name?: string;

  /**
   * Current scene title (for display).
   */
  sceneTitle?: string;
}

/**
 * GAME SESSION INTERFACE
 * Active game session with runtime data.
 *
 * This extends GameState with additional runtime-only data
 * that doesn't need to be saved.
 */
export interface GameSession extends GameState {
  /**
   * Whether the game is currently paused.
   */
  isPaused: boolean;

  /**
   * Whether the system menu is open.
   */
  isMenuOpen: boolean;

  /**
   * Whether text is currently being displayed (typewriter).
   */
  isTyping: boolean;

  /**
   * Whether audio is currently playing.
   */
  isAudioPlaying: boolean;

  /**
   * Session start time.
   */
  sessionStartTime: number;

  /**
   * Pending variable changes (for animations).
   */
  pendingChanges: VariableChangeAnimation[];
}

/**
 * VARIABLE CHANGE ANIMATION
 * Represents a variable change to be animated in the HUD.
 */
export interface VariableChangeAnimation {
  /** Unique ID for this animation */
  id: string;

  /** Variable name that changed */
  variableName: string;

  /** Amount of change (for display) */
  changeAmount: number;

  /** Whether the change was positive */
  isPositive: boolean;

  /** Position for floating text animation */
  position: { x: number; y: number };

  /** When this animation started */
  startTime: number;
}

/**
 * GAME EVENT TYPE
 * Types of events that can occur during gameplay.
 */
export type GameEventType =
  | 'scene_enter'      // Entered a new scene
  | 'choice_made'      // Player made a choice
  | 'variable_changed' // A variable was modified
  | 'item_acquired'    // Item added to inventory
  | 'item_removed'     // Item removed from inventory
  | 'flag_set'         // A flag was set
  | 'audio_started'    // Audio began playing
  | 'audio_stopped'    // Audio stopped
  | 'game_saved'       // Game was saved
  | 'game_loaded';     // Game was loaded

/**
 * GAME EVENT INTERFACE
 * A logged event during gameplay.
 *
 * Events can be used for:
 * - Analytics
 * - Debugging
 * - Achievement tracking
 * - Replay systems
 */
export interface GameEvent {
  /** Event type */
  type: GameEventType;

  /** When the event occurred */
  timestamp: number;

  /** Associated node ID (if applicable) */
  nodeId?: string;

  /** Additional event data */
  data?: Record<string, unknown>;
}

/**
 * GAME RESULT TYPE
 * Possible outcomes when processing a node.
 */
export type GameResult =
  | { type: 'wait'; nodeId: string }       // Wait for player input
  | { type: 'continue'; nextNodeId: string } // Continue to next node
  | { type: 'end' }                          // Game over (no more nodes)
  | { type: 'error'; message: string };      // Error occurred

/**
 * PLAYER CHOICE INTERFACE
 * A choice available to the player.
 */
export interface PlayerChoice {
  /** Choice ID (matches SceneChoice.id) */
  id: string;

  /** Display text */
  label: string;

  /** Optional icon */
  icon?: string;

  /** Whether this choice is available */
  isAvailable: boolean;

  /** Why the choice is locked (if applicable) */
  lockedReason?: string;

  /** ID of the node this choice leads to */
  targetNodeId?: string;
}

/**
 * SCENE DISPLAY DATA
 * Data needed to render the current scene.
 */
export interface SceneDisplayData {
  /** Node ID of this scene */
  nodeId: string;

  /** Background image URL */
  backgroundImage?: string;

  /** Speaker name (if any) */
  speakerName?: string;

  /** Story text to display */
  storyText: string;

  /** Available choices */
  choices: PlayerChoice[];

  /** Background music to play */
  backgroundMusic?: string;

  /** Whether to keep playing previous music */
  musicKeepPlaying: boolean;

  /** Voiceover audio URL */
  voiceover?: string;

  /** Whether voiceover should auto-play */
  voiceoverAutoplay: boolean;
}

/**
 * DEFAULT GAME STATE
 * Factory function to create an initial game state.
 *
 * @param projectId - The project ID
 * @param startNodeId - The starting node ID
 * @param initialVariables - Initial variable values
 * @returns A fresh game state
 */
export function createInitialGameState(
  projectId: string,
  startNodeId: string,
  initialVariables: Record<string, VariableValue>
): GameState {
  return {
    projectId,
    currentNodeId: startNodeId,
    variables: { ...initialVariables },
    inventory: [],
    history: [],
    flags: {},
    timestamp: Date.now(),
    playtime: 0,
  };
}

/**
 * CREATE GAME SESSION
 * Factory function to create an active game session.
 *
 * @param gameState - The base game state
 * @returns An active game session
 */
export function createGameSession(gameState: GameState): GameSession {
  return {
    ...gameState,
    isPaused: false,
    isMenuOpen: false,
    isTyping: false,
    isAudioPlaying: false,
    sessionStartTime: Date.now(),
    pendingChanges: [],
  };
}

/**
 * VALIDATE GAME STATE
 * Validates that a game state object has required fields.
 *
 * @param state - The state to validate
 * @returns Whether the state is valid
 */
export function isValidGameState(state: unknown): state is GameState {
  if (!state || typeof state !== 'object') {
    return false;
  }

  const s = state as Record<string, unknown>;

  return (
    typeof s.projectId === 'string' &&
    typeof s.currentNodeId === 'string' &&
    typeof s.variables === 'object' &&
    Array.isArray(s.inventory) &&
    Array.isArray(s.history) &&
    typeof s.timestamp === 'number' &&
    typeof s.playtime === 'number'
  );
}
