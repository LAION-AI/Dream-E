/**
 * =============================================================================
 * PROJECT TYPE DEFINITIONS
 * =============================================================================
 *
 * This file defines types for Dream-E projects.
 *
 * WHAT IS A PROJECT?
 * A project is a complete game/story that contains:
 * - Metadata (title, author, description)
 * - All nodes (scenes, choices, modifiers)
 * - All connections between nodes
 * - Global variables
 * - Settings (theme, audio, etc.)
 *
 * Projects are saved to IndexedDB and can be exported as ZIP files.
 *
 * =============================================================================
 */

import { StoryNode, StoryEdge } from './nodes';
import { Variable } from './variables';
import { ThemeId, ThemeConfig } from './themes';

/**
 * PROJECT INFO INTERFACE
 * Metadata about the project.
 *
 * This information is shown in the dashboard
 * and included in exported games.
 */
export interface ProjectInfo {
  /**
   * Title of the project/game.
   * Displayed on project cards and in the player.
   */
  title: string;

  /**
   * Author name.
   * Credited in the game and exports.
   */
  author: string;

  /**
   * Optional longer description.
   * Can include genre, summary, etc.
   */
  description?: string;

  /**
   * Cover image for the project.
   * Shown as thumbnail in dashboard.
   * Can be a URL, blob URL, or asset ID.
   */
  coverImage?: string;

  /**
   * Which theme the game uses.
   */
  theme: ThemeId;

  /**
   * When the project was created.
   * Unix timestamp in milliseconds.
   */
  createdAt: number;

  /**
   * When the project was last modified.
   * Unix timestamp in milliseconds.
   */
  updatedAt: number;

  /**
   * Version number for the project.
   * Useful for tracking changes.
   */
  version?: string;

  /**
   * Tags for categorization.
   * Example: ["fantasy", "rpg", "puzzle"]
   */
  tags?: string[];
}

/**
 * AUDIO SETTINGS INTERFACE
 * Settings for the game's audio.
 */
export interface AudioSettings {
  /** Master volume (0-1) */
  masterVolume: number;

  /** Background music volume (0-1) */
  musicVolume: number;

  /** Sound effects volume (0-1) */
  sfxVolume: number;

  /** Voice/narration volume (0-1) */
  voiceVolume: number;

  /** Whether music is muted */
  musicMuted: boolean;

  /** Whether SFX are muted */
  sfxMuted: boolean;

  /** Whether voice is muted */
  voiceMuted: boolean;
}

/**
 * TEXT SETTINGS INTERFACE
 * Settings for text display.
 */
export interface TextSettings {
  /**
   * Speed of typewriter effect (characters per second).
   * 0 means instant (no typewriter effect).
   */
  typewriterSpeed: number;

  /**
   * Whether to enable text-to-speech.
   */
  ttsEnabled: boolean;

  /**
   * Voice ID for text-to-speech.
   * Uses browser's speechSynthesis API.
   */
  ttsVoice?: string;

  /**
   * TTS speech rate (0.5-2).
   */
  ttsRate: number;

  /**
   * Font size multiplier (0.5-2).
   */
  fontScale: number;
}

/**
 * PROJECT SETTINGS INTERFACE
 * All configurable settings for a project.
 */
export interface ProjectSettings {
  /** Theme configuration */
  theme: ThemeConfig;

  /** Audio settings */
  audio: AudioSettings;

  /** Text display settings */
  text: TextSettings;

  /**
   * ID of the starting node.
   * This is where the game begins.
   */
  startNodeId: string;

  /**
   * Whether to show the HUD in the player.
   */
  showHUD: boolean;

  /**
   * Whether to show the inventory.
   */
  showInventory: boolean;

  /**
   * Number of save slots available.
   */
  saveSlots: number;

  /**
   * Whether auto-save is enabled.
   */
  autoSave: boolean;

  /**
   * Auto-save interval in seconds.
   */
  autoSaveInterval: number;
}

/**
 * ENTITY CATEGORY TYPE
 * The four categories of story entities that can be defined in the World menu.
 */
export type EntityCategory = 'character' | 'location' | 'object' | 'concept';

/**
 * ENTITY INTERFACE
 * A named story entity — character, location, object, or game concept.
 *
 * All four entity categories share the same fields. The storyteller uses
 * these to define world-building details: character profiles, location
 * descriptions, object properties, magic systems, factions, rules, etc.
 *
 * Each entity can optionally have:
 * - A reference image (visual reference for the storyteller)
 * - A default music track that auto-plays when the entity is encountered
 *   in-game (e.g., a tavern always plays its tavern music unless overridden)
 * - Fade-in/fade-out settings for the default music
 */
export interface EntityStateChangeEvent {
  /** The scene node ID where this change occurred */
  sceneId: string;
  /** Human-readable scene label (e.g. "The Dragon's Lair") */
  sceneLabel?: string;
  /** Brief summary of what happened in the scene */
  sceneSummary: string;
  /** Unix timestamp (ms) when this change was recorded — used for temporal ordering */
  timestamp?: number;
  /** The player action that triggered this scene (if any) */
  playerAction?: string;
  /** Specific state changes — should be detailed for important changes (magical effects, ideological shifts, etc.)
   *  and brief for minor details. The LM reads these verbatim. */
  stateChanges: string[];
}

export interface Entity {
  /** Unique identifier. Format: "entity_{uuid}" */
  id: string;

  /** Which category this entity belongs to */
  category: EntityCategory;

  /** Display name (e.g., "Captain Blackbeard", "Haunted Forest") */
  name: string;

  /** Freeform description — character traits, location atmosphere, object properties, rules, etc. */
  description: string;

  /**
   * Structured profile data as a JSON dictionary.
   * Allows selective updates via JSON Patch without rewriting everything.
   *
   * CHARACTER example: { appearance, personality, background, relationships, abilities, ... }
   * LOCATION example: { atmosphere, inhabitants, features, dangers, ... }
   * OBJECT example: { appearance, properties, uses, history, ... }
   * CONCEPT example: { definition, rules, implications, examples, ... }
   *
   * Keys are flexible — the agent defines whatever makes sense for the entity.
   * Values can be strings, arrays, numbers, booleans, or nested objects.
   */
  profile?: Record<string, unknown>;

  /**
   * History of persistent state changes (magical effects, injuries, relationship shifts, etc.).
   * Each entry represents a scene where this entity was changed, with a list of the specific changes.
   */
  stateHistory?: EntityStateChangeEvent[];

  /** Brief 100-200 word summary that captures the essence of this entity.
   *  Used as a quick reference when the full description isn't needed. */
  summary?: string;

  /** Optional reference image as a base64 data URL */
  referenceImage?: string;

  /** Optional reference voice clip as a base64 data URL (characters only).
   *  Used as a voice identity reference for TTS generation. */
  referenceVoice?: string;

  /** Optional default music track as a base64 data URL.
   *  Auto-plays when this entity is encountered unless overridden per-scene. */
  defaultMusic?: string;

  /** Fade-in duration in ms for the default music (default 1000) */
  musicFadeIn?: number;

  /** Fade-out duration in ms for the default music (default 1000) */
  musicFadeOut?: number;

  /** When this entity was created (Unix timestamp ms) */
  createdAt: number;

  /** When this entity was last modified (Unix timestamp ms) */
  updatedAt: number;
}

/**
 * AI CONFIGURATION INTERFACE
 * Stores the user's AI provider settings (API key, model, etc.).
 * Persisted with the project so each project can have its own config.
 */
export interface AIConfig {
  /** Which AI provider to use */
  provider: 'anthropic' | 'openai-compatible' | 'gemini';

  /** API key for the chosen provider */
  apiKey: string;

  /** Model identifier (e.g. "gemini-3-flash-preview", "gpt-4o") */
  model: string;

  /** Optional custom endpoint for OpenAI-compatible providers */
  endpoint?: string;
}

/**
 * CHAT MESSAGE INTERFACE
 * A single message in the project's chat history.
 * Messages can come from the user or an AI assistant.
 */
export interface ChatMessage {
  /** Unique identifier. Format: "chat_{uuid}" */
  id: string;

  /** Who sent the message: the user or an AI assistant */
  role: 'user' | 'assistant';

  /** The text content of the message */
  content: string;

  /** When the message was sent (Unix timestamp ms) */
  timestamp: number;

  /** Whether this message is currently being streamed from the AI */
  isStreaming?: boolean;

  /** Tool calls the AI made during this message (for display as badges) */
  toolCalls?: { name: string; result: string }[];
}

/**
 * PROJECT INTERFACE
 * A complete Dream-E project.
 *
 * This is the main data structure that contains everything
 * needed to edit and play a story.
 */
export interface Project {
  /**
   * Unique identifier for this project.
   * Format: UUID
   */
  id: string;

  /**
   * Project mode.
   * 'game' = interactive fiction / text-adventure RPG (default).
   * 'cowrite' = collaborative AI writing mode for stories, novels, screenplays.
   * Optional for backwards compatibility — existing projects without this field
   * are treated as 'game' mode projects.
   */
  mode?: 'game' | 'cowrite';

  /**
   * Project metadata.
   */
  info: ProjectInfo;

  /**
   * All global variables defined for this project.
   */
  globalVariables: Variable[];

  /**
   * All nodes in the story.
   * This includes scenes, choices, modifiers, and comments.
   */
  nodes: StoryNode[];

  /**
   * All connections between nodes.
   */
  edges: StoryEdge[];

  /**
   * Project settings.
   */
  settings: ProjectSettings;

  /**
   * User-defined names for media assets.
   * Maps an asset fingerprint (a short stable hash derived from the data URL)
   * to a user-given name. This lets users identify assets by friendly names
   * like "Forest Theme" or "Dragon Roar" instead of "[Embedded audio/mpeg]".
   */
  assetNames?: Record<string, string>;

  /**
   * All story entities defined for this project.
   * Includes characters, locations, objects, and game concepts.
   * Filtered by category when displayed in the UI.
   */
  entities?: Entity[];

  /**
   * Freeform project notes.
   * A single large text blob for the author's personal notes,
   * brainstorming, outlines, plot structure, or anything not
   * part of the story itself. Can also store API configuration
   * for the AI assistant.
   */
  notes?: string;

  /**
   * Chat message history.
   * Stores conversation between the user and the AI assistant.
   * Persisted with the project so context is not lost between sessions.
   */
  chatMessages?: ChatMessage[];

  /**
   * AI configuration.
   * Stores provider, API key, model, and optional endpoint.
   * Persisted per-project so different projects can use different configs.
   */
  aiConfig?: AIConfig;

  /**
   * Which canvas is currently active in co-writing mode.
   * 'story' = the plot/structure canvas (default)
   * 'character' = the character relationship canvas
   * Only meaningful when mode === 'cowrite'.
   */
  activeCanvas?: 'story' | 'character';
}

/**
 * PROJECT SUMMARY INTERFACE
 * A lightweight version of Project for listings.
 *
 * Used in the dashboard to avoid loading full project data
 * for every project in the list.
 */
export interface ProjectSummary {
  /** Project ID */
  id: string;

  /** Project title */
  title: string;

  /** Author name */
  author: string;

  /** Cover image URL */
  coverImage?: string;

  /** Last modified timestamp */
  updatedAt: number;

  /** Node count (for display) */
  nodeCount: number;

  /** Theme ID */
  theme: ThemeId;

  /**
   * Project mode ('game' or 'cowrite').
   * Optional for backwards compatibility — defaults to 'game' when absent.
   */
  mode?: 'game' | 'cowrite';
}

/**
 * PROJECT EXPORT FORMAT INTERFACE
 * Structure of exported project data.
 *
 * When a project is exported as a ZIP, this is the
 * structure of the project.json file inside.
 */
export interface ProjectExport {
  /** Format version for compatibility */
  formatVersion: string;

  /** Export timestamp */
  exportedAt: number;

  /** The full project data */
  project: Project;

  /**
   * Asset manifest.
   * Maps asset IDs to filenames in the ZIP.
   */
  assets: {
    id: string;
    filename: string;
    type: 'image' | 'audio';
    size: number;
  }[];
}

/**
 * CREATE PROJECT OPTIONS
 * Options when creating a new project.
 */
export interface CreateProjectOptions {
  /** Project title */
  title: string;

  /** Author name */
  author?: string;

  /** Description */
  description?: string;

  /** Theme to use */
  theme?: ThemeId;

  /** Whether to add starter nodes */
  addStarterContent?: boolean;

  /** Template to use (if any) */
  templateId?: string;

  /**
   * Project mode ('game' or 'cowrite').
   * Determines which dashboard this project appears in.
   * Defaults to 'game' if not specified.
   */
  mode?: 'game' | 'cowrite';

  /**
   * Co-write structure type.
   * Determines the template used when creating a co-write project:
   * - 'acts': Traditional screenplay/novel act structure (default)
   * - 'episodes': TV series / web serial episode structure
   * - 'blank': Only the Story Root node, no plots or acts
   */
  cowriteStructure?: 'acts' | 'episodes' | 'blank';

  /**
   * Number of acts or episodes to create.
   * Only used when cowriteStructure is 'acts' or 'episodes'.
   * Defaults to 3 for acts, 6 for episodes. Range: 1-12.
   */
  cowriteCount?: number;
}

/**
 * DEFAULT PROJECT SETTINGS
 * Factory function to create default settings.
 */
export function createDefaultSettings(): ProjectSettings {
  return {
    theme: {
      id: 'modern',
      customColors: {},
      customFonts: {},
      customAssets: {},
    },
    audio: {
      masterVolume: 1,
      musicVolume: 0.7,
      sfxVolume: 0.8,
      voiceVolume: 1,
      musicMuted: false,
      sfxMuted: false,
      voiceMuted: false,
    },
    text: {
      typewriterSpeed: 30,
      ttsEnabled: false,
      ttsRate: 1,
      fontScale: 1,
    },
    startNodeId: '',
    showHUD: true,
    showInventory: true,
    saveSlots: 3,
    autoSave: true,
    autoSaveInterval: 30,
  };
}

/**
 * DEFAULT PROJECT INFO
 * Factory function to create default project info.
 */
export function createDefaultProjectInfo(title: string): ProjectInfo {
  const now = Date.now();
  return {
    title,
    author: '',
    theme: 'modern',
    createdAt: now,
    updatedAt: now,
  };
}
