/**
 * =============================================================================
 * GAME STATE API — Command Registry & Prompt Generator
 * =============================================================================
 *
 * Declarative metadata for every command the AI agent can use.
 * The system prompt is auto-generated from this registry — no hand-written
 * documentation that can drift out of sync.
 *
 * To add a new command:
 * 1. Add its metadata to COMMANDS below
 * 2. Add its handler in gameStateAPI.ts
 * That's it — the system prompt updates automatically.
 *
 * =============================================================================
 */

import type { CommandMeta } from './gameStateAPI.types';
import { CHARACTER_DEPTH_GUIDE } from '@/data/characterDepthGuide';

// =============================================================================
// COMMAND REGISTRY
// =============================================================================

export const COMMANDS: CommandMeta[] = [
  // ─── SCENES ────────────────────────────────────────────────────────
  {
    name: 'create_scene',
    group: 'scenes',
    description: 'Create a new scene node',
    params: [
      { name: 'label', type: 'string', required: true, description: 'Scene title' },
      { name: 'storyText', type: 'string', required: true, description: 'Story text content' },
      { name: 'speakerName', type: 'string', required: false, description: 'Character speaking' },
      { name: 'choices', type: '[{label: string}]', required: false, description: 'Choice buttons' },
    ],
    returns: '{nodeId, choiceIds[]}',
  },
  {
    name: 'update_scene',
    group: 'scenes',
    description: 'Update scene text, speaker, or label',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'label', type: 'string', required: false, description: 'New title' },
      { name: 'storyText', type: 'string', required: false, description: 'New story text' },
      { name: 'speakerName', type: 'string', required: false, description: 'New speaker name' },
    ],
    returns: '{sceneId}',
  },
  {
    name: 'delete_scene',
    group: 'scenes',
    description: 'Delete a scene and all its connected edges',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
    ],
    returns: '{sceneId, edgesRemoved}',
    notes: 'Also removes all incoming and outgoing edges.',
  },
  {
    name: 'add_choice',
    group: 'scenes',
    description: 'Add a new choice button to a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'label', type: 'string', required: true, description: 'Choice button text' },
    ],
    returns: '{choiceId}',
  },
  {
    name: 'update_choice',
    group: 'scenes',
    description: "Update a choice's label",
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'choiceId', type: 'string', required: true, description: 'Choice ID' },
      { name: 'label', type: 'string', required: true, description: 'New label text' },
    ],
    returns: '{success}',
  },
  {
    name: 'delete_choice',
    group: 'scenes',
    description: 'Delete a choice from a scene (also removes its edge)',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'choiceId', type: 'string', required: true, description: 'Choice ID to delete' },
    ],
    returns: '{edgeRemoved: boolean}',
  },
  {
    name: 'set_choice_condition',
    group: 'scenes',
    description: 'Set a visibility condition on a choice',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'choiceId', type: 'string', required: true, description: 'Choice ID' },
      { name: 'variableName', type: 'string', required: true, description: 'Variable to check' },
      { name: 'operator', type: 'string', required: true, description: 'Comparison operator', validValues: ['>', '<', '=', '!=', '>=', '<=', 'contains'] },
      { name: 'value', type: 'any', required: true, description: 'Value to compare against' },
      { name: 'showWhenLocked', type: 'boolean', required: false, description: 'Show grayed out instead of hiding' },
      { name: 'lockedTooltip', type: 'string', required: false, description: 'Tooltip when locked' },
    ],
    returns: '{success}',
  },
  {
    name: 'remove_choice_condition',
    group: 'scenes',
    description: 'Remove the condition from a choice (make always visible)',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'choiceId', type: 'string', required: true, description: 'Choice ID' },
    ],
    returns: '{success}',
  },

  // ─── CONNECTIONS ───────────────────────────────────────────────────
  {
    name: 'connect_nodes',
    group: 'connections',
    description: 'Create an edge between two nodes',
    params: [
      { name: 'sourceId', type: 'string', required: true, description: 'Source node ID' },
      { name: 'targetId', type: 'string', required: true, description: 'Target node ID' },
      { name: 'sourceHandle', type: 'string', required: false, description: 'Choice ID (auto-picks first free choice if omitted)' },
    ],
    returns: '{edgeId, sourceHandle}',
    notes: 'Prevents duplicates. For scene nodes, auto-picks the first unconnected choice if sourceHandle is omitted.',
  },
  {
    name: 'disconnect_nodes',
    group: 'connections',
    description: 'Remove an edge',
    params: [
      { name: 'edgeId', type: 'string', required: false, description: 'Edge ID (preferred)' },
      { name: 'sourceId', type: 'string', required: false, description: 'Source node ID (with sourceHandle)' },
      { name: 'sourceHandle', type: 'string', required: false, description: 'Source handle (with sourceId)' },
    ],
    returns: '{removedEdgeId}',
    notes: 'Provide edgeId for exact removal, OR sourceId+sourceHandle to find and remove.',
  },
  {
    name: 'reconnect_edge',
    group: 'connections',
    description: 'Change where an edge points (atomic delete + create)',
    params: [
      { name: 'sourceId', type: 'string', required: true, description: 'Source node ID' },
      { name: 'sourceHandle', type: 'string', required: false, description: 'Source handle / choice ID' },
      { name: 'newTargetId', type: 'string', required: true, description: 'New target node ID' },
    ],
    returns: '{oldEdgeId, newEdgeId, sourceHandle}',
  },

  // ─── ENTITIES ──────────────────────────────────────────────────────
  {
    name: 'create_entity',
    group: 'entities',
    description: 'Create a new entity (character, location, object, or concept)',
    params: [
      { name: 'category', type: 'string', required: true, description: 'Entity type', validValues: ['character', 'location', 'object', 'concept'] },
      { name: 'name', type: 'string', required: true, description: 'Entity name' },
      { name: 'description', type: 'string', required: true, description: 'Full description' },
      { name: 'summary', type: 'string', required: false, description: 'Short summary (100-200 words)' },
      { name: 'profile', type: 'object', required: false, description: 'Structured profile dictionary (appearance, personality, etc.). Recommended — avoids needing a separate set_entity_profile call.' },
    ],
    returns: '{entityId}',
  },
  {
    name: 'update_entity',
    group: 'entities',
    description: 'Update entity fields',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'name', type: 'string', required: false, description: 'New name' },
      { name: 'description', type: 'string', required: false, description: 'New description' },
      { name: 'summary', type: 'string', required: false, description: 'New summary' },
    ],
    returns: '{entityId}',
  },
  {
    name: 'delete_entity',
    group: 'entities',
    description: 'Delete an entity and unlink from all scenes',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
    ],
    returns: '{entityId, scenesUnlinked}',
  },
  {
    name: 'link_entity_to_scene',
    group: 'entities',
    description: 'Link an entity to a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
    ],
    returns: '{success}',
  },
  {
    name: 'unlink_entity_from_scene',
    group: 'entities',
    description: 'Remove entity link from a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
    ],
    returns: '{success}',
  },
  {
    name: 'update_entity_state',
    group: 'entities',
    description: 'Set situational state text for an entity in a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'stateText', type: 'string', required: true, description: 'State description' },
    ],
    returns: '{success}',
  },

  // ─── ENTITY PROFILE (Structured JSON + Patch) ─────────────────────
  {
    name: 'set_entity_profile',
    group: 'entities',
    description: 'Set or fully replace the structured profile dictionary on an entity',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'profile', type: 'object', required: true, description: 'JSON dictionary with entity attributes (appearance, personality, relationships, etc.)' },
    ],
    returns: '{entityId}',
    notes: 'Profile keys are flexible per category. Characters: appearance, personality, background, relationships, abilities. Locations: atmosphere, inhabitants, features, dangers. Objects: appearance, properties, uses, history. Concepts: definition, rules, implications.',
  },
  {
    name: 'get_entity_profile',
    group: 'entities',
    description: 'Get the full structured profile dictionary of an entity',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
    ],
    returns: '{entityId, name, category, profile: {...}}',
  },
  {
    name: 'patch_entity_profile',
    group: 'entities',
    description: 'Apply JSON Patch operations (RFC 6902 subset) to selectively update profile fields',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'operations', type: 'array', required: true, description: 'Array of patch ops: [{op: "add"|"replace"|"remove", path: "/key", value?: any}]' },
    ],
    returns: '{entityId, applied: string[], profileKeys: string[]}',
    notes: 'Path format: "/key" or "/key/subkey". Use "add" to create new fields, "replace" to update existing ones, "remove" to delete. Example: [{"op":"replace","path":"/appearance","value":"Tall warrior"},{"op":"add","path":"/relationships/entity_abc","value":"ally"}]',
  },

  // ─── VARIABLES ─────────────────────────────────────────────────────
  {
    name: 'create_variable',
    group: 'variables',
    description: 'Create a new game variable',
    params: [
      { name: 'name', type: 'string', required: true, description: 'Variable name' },
      { name: 'type', type: 'string', required: true, description: 'Data type', validValues: ['integer', 'float', 'boolean', 'string', 'collection'] },
      { name: 'defaultValue', type: 'any', required: false, description: 'Initial value (auto-defaults by type)' },
      { name: 'description', type: 'string', required: false, description: 'Description' },
    ],
    returns: '{variableId}',
  },
  {
    name: 'update_variable',
    group: 'variables',
    description: 'Update variable properties',
    params: [
      { name: 'variableId', type: 'string', required: true, description: 'Variable ID' },
      { name: 'name', type: 'string', required: false, description: 'New name' },
      { name: 'defaultValue', type: 'any', required: false, description: 'New default value' },
      { name: 'description', type: 'string', required: false, description: 'New description' },
    ],
    returns: '{success}',
  },
  {
    name: 'delete_variable',
    group: 'variables',
    description: 'Delete a variable',
    params: [
      { name: 'variableId', type: 'string', required: true, description: 'Variable ID' },
    ],
    returns: '{variableId}',
  },

  // ─── MEDIA ─────────────────────────────────────────────────────────
  {
    name: 'generate_scene_image',
    group: 'media',
    description: 'Generate an AI image and set as scene background (takes ~10-30s)',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'prompt', type: 'string', required: true, description: 'Image generation prompt (be vivid and detailed)' },
      { name: 'width', type: 'number', required: false, description: 'Width in pixels', defaultValue: 1280 },
      { name: 'height', type: 'number', required: false, description: 'Height in pixels', defaultValue: 720 },
    ],
    returns: '{sceneId, message}',
  },
  {
    name: 'generate_entity_image',
    group: 'media',
    description: 'Generate an AI image and set as entity reference (takes ~10-30s)',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'prompt', type: 'string', required: true, description: 'Image generation prompt' },
      { name: 'width', type: 'number', required: false, description: 'Width in pixels', defaultValue: 512 },
      { name: 'height', type: 'number', required: false, description: 'Height in pixels', defaultValue: 512 },
    ],
    returns: '{entityId, message}',
  },
  {
    name: 'set_scene_image',
    group: 'media',
    description: 'Set scene background from a URL or data URL',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'imageUrl', type: 'string', required: true, description: 'Image URL or data URL' },
    ],
    returns: '{sceneId}',
  },
  {
    name: 'remove_scene_image',
    group: 'media',
    description: 'Remove the background image from a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
    ],
    returns: '{sceneId, hadImage}',
  },
  {
    name: 'set_entity_image',
    group: 'media',
    description: 'Set entity reference image from a URL or data URL',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'imageUrl', type: 'string', required: true, description: 'Image URL or data URL' },
    ],
    returns: '{entityId}',
  },
  {
    name: 'remove_entity_image',
    group: 'media',
    description: 'Remove the reference image from an entity',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
    ],
    returns: '{entityId, hadImage}',
  },
  {
    name: 'set_scene_music',
    group: 'media',
    description: 'Set background music for a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'musicUrl', type: 'string', required: true, description: 'Audio data URL' },
      { name: 'keepPlaying', type: 'boolean', required: false, description: 'Continue music to next scene' },
    ],
    returns: '{sceneId}',
  },
  {
    name: 'remove_scene_music',
    group: 'media',
    description: 'Remove background music from a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
    ],
    returns: '{sceneId, hadMusic}',
  },
  {
    name: 'set_scene_voiceover',
    group: 'media',
    description: 'Set voiceover/sound effect for a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'audioUrl', type: 'string', required: true, description: 'Audio data URL' },
      { name: 'autoplay', type: 'boolean', required: false, description: 'Auto-play on scene load' },
    ],
    returns: '{sceneId}',
  },
  {
    name: 'remove_scene_voiceover',
    group: 'media',
    description: 'Remove voiceover audio from a scene',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
    ],
    returns: '{sceneId, hadVoiceover}',
  },

  {
    name: 'set_entity_voice',
    group: 'media',
    description: 'Set a reference voice clip for an entity (characters)',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'voiceUrl', type: 'string', required: true, description: 'Audio data URL for voice reference' },
    ],
    returns: '{entityId}',
  },
  {
    name: 'remove_entity_voice',
    group: 'media',
    description: 'Remove the reference voice from an entity',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
    ],
    returns: '{entityId, hadVoice}',
  },
  {
    name: 'set_entity_music',
    group: 'media',
    description: 'Set default music for an entity (auto-plays when encountered)',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'musicUrl', type: 'string', required: true, description: 'Audio data URL' },
      { name: 'fadeIn', type: 'number', required: false, description: 'Fade-in duration ms', defaultValue: 1000 },
      { name: 'fadeOut', type: 'number', required: false, description: 'Fade-out duration ms', defaultValue: 1000 },
    ],
    returns: '{entityId}',
  },
  {
    name: 'remove_entity_music',
    group: 'media',
    description: 'Remove default music from an entity',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
    ],
    returns: '{entityId, hadMusic}',
  },

  // ─── MODIFIER NODES ────────────────────────────────────────────────
  {
    name: 'create_modifier',
    group: 'modifiers',
    description: 'Create a modifier node (changes variable values during gameplay)',
    params: [
      { name: 'label', type: 'string', required: true, description: 'Node label' },
      { name: 'mode', type: 'string', required: true, description: 'Operation mode', validValues: ['math', 'set', 'random'] },
      { name: 'targetVariable', type: 'string', required: true, description: 'Variable name to modify' },
      { name: 'mathOperation', type: 'string', required: false, description: 'Math mode operation', validValues: ['add', 'subtract', 'multiply', 'divide'] },
      { name: 'mathValue', type: 'number|string', required: false, description: 'Math operand (number or variable name)' },
      { name: 'mathValueIsVariable', type: 'boolean', required: false, description: 'If true, mathValue is a variable name' },
      { name: 'setValue', type: 'any', required: false, description: 'Set mode value' },
      { name: 'setValueIsVariable', type: 'boolean', required: false, description: 'If true, setValue is a variable name' },
      { name: 'randomMin', type: 'number', required: false, description: 'Random mode minimum', defaultValue: 1 },
      { name: 'randomMax', type: 'number', required: false, description: 'Random mode maximum', defaultValue: 100 },
    ],
    returns: '{nodeId}',
    notes: 'Modifier nodes are invisible to players. The game evaluates them instantly and continues.',
  },
  {
    name: 'update_modifier',
    group: 'modifiers',
    description: 'Update a modifier node',
    params: [
      { name: 'modifierId', type: 'string', required: true, description: 'Modifier node ID' },
      { name: 'label', type: 'string', required: false, description: 'New label' },
      { name: 'mode', type: 'string', required: false, description: 'New mode', validValues: ['math', 'set', 'random'] },
      { name: 'targetVariable', type: 'string', required: false, description: 'New target variable name' },
      { name: 'mathOperation', type: 'string', required: false, description: 'New math operation' },
      { name: 'mathValue', type: 'number|string', required: false, description: 'New math value' },
      { name: 'setValue', type: 'any', required: false, description: 'New set value' },
      { name: 'randomMin', type: 'number', required: false, description: 'New random minimum' },
      { name: 'randomMax', type: 'number', required: false, description: 'New random maximum' },
    ],
    returns: '{modifierId}',
  },
  {
    name: 'delete_modifier',
    group: 'modifiers',
    description: 'Delete a modifier node and all connected edges',
    params: [
      { name: 'modifierId', type: 'string', required: true, description: 'Modifier node ID' },
    ],
    returns: '{modifierId, edgesRemoved}',
  },

  // ─── BRANCH NODES ─────────────────────────────────────────────────
  {
    name: 'create_branch',
    group: 'branches',
    description: 'Create a branch (choice) node — routes flow by condition (success/failure)',
    params: [
      { name: 'label', type: 'string', required: true, description: 'Node label' },
      { name: 'variableName', type: 'string', required: true, description: 'Variable to check' },
      { name: 'operator', type: 'string', required: true, description: 'Comparison operator', validValues: ['>', '<', '=', '!=', '>=', '<=', 'contains'] },
      { name: 'value', type: 'any', required: true, description: 'Value to compare against' },
      { name: 'useVariable', type: 'boolean', required: false, description: 'If true, value is a variable name' },
    ],
    returns: '{nodeId, outputs: ["success", "failure"]}',
    notes: 'Branch nodes are invisible to players. Connect the "success" and "failure" handles to different targets.',
  },
  {
    name: 'update_branch',
    group: 'branches',
    description: 'Update a branch node condition',
    params: [
      { name: 'branchId', type: 'string', required: true, description: 'Branch node ID' },
      { name: 'label', type: 'string', required: false, description: 'New label' },
      { name: 'variableName', type: 'string', required: false, description: 'New variable to check' },
      { name: 'operator', type: 'string', required: false, description: 'New operator' },
      { name: 'value', type: 'any', required: false, description: 'New comparison value' },
      { name: 'useVariable', type: 'boolean', required: false, description: 'If true, value is a variable name' },
    ],
    returns: '{branchId}',
  },
  {
    name: 'delete_branch',
    group: 'branches',
    description: 'Delete a branch node and all connected edges',
    params: [
      { name: 'branchId', type: 'string', required: true, description: 'Branch node ID' },
    ],
    returns: '{branchId, edgesRemoved}',
  },

  // ─── COMMENT NODES ────────────────────────────────────────────────
  {
    name: 'create_comment',
    group: 'comments',
    description: 'Create a comment node (designer notes, does not affect gameplay)',
    params: [
      { name: 'label', type: 'string', required: true, description: 'Node label' },
      { name: 'text', type: 'string', required: true, description: 'Comment text' },
      { name: 'color', type: 'string', required: false, description: 'Background color (hex)', defaultValue: '#ffeb3b' },
    ],
    returns: '{nodeId}',
  },
  {
    name: 'update_comment',
    group: 'comments',
    description: 'Update a comment node',
    params: [
      { name: 'commentId', type: 'string', required: true, description: 'Comment node ID' },
      { name: 'label', type: 'string', required: false, description: 'New label' },
      { name: 'text', type: 'string', required: false, description: 'New text' },
      { name: 'color', type: 'string', required: false, description: 'New color (hex)' },
    ],
    returns: '{commentId}',
  },
  {
    name: 'delete_comment',
    group: 'comments',
    description: 'Delete a comment node',
    params: [
      { name: 'commentId', type: 'string', required: true, description: 'Comment node ID' },
    ],
    returns: '{commentId}',
  },

  // ─── PROJECT ───────────────────────────────────────────────────────
  {
    name: 'set_start_node',
    group: 'project',
    description: 'Set which scene the game starts at',
    params: [
      { name: 'nodeId', type: 'string', required: true, description: 'Scene node ID' },
    ],
    returns: '{startNodeId}',
  },
  {
    name: 'update_project_info',
    group: 'project',
    description: 'Update project metadata',
    params: [
      { name: 'title', type: 'string', required: false, description: 'Project title' },
      { name: 'description', type: 'string', required: false, description: 'Project description' },
      { name: 'author', type: 'string', required: false, description: 'Author name' },
      { name: 'theme', type: 'string', required: false, description: 'Visual theme', validValues: ['fantasy', 'cyberpunk', 'modern', 'custom'] },
    ],
    returns: '{success}',
  },
  {
    name: 'update_notes',
    group: 'project',
    description: 'Update freeform project notes',
    params: [
      { name: 'notes', type: 'string', required: true, description: 'Notes text' },
    ],
    returns: '{success}',
  },

  // ─── QUERY ─────────────────────────────────────────────────────────
  {
    name: 'get_scene_details',
    group: 'query',
    description: 'Get full details of a scene (choices, edges, linked entities, media)',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
    ],
    returns: 'Full scene data object',
  },
  {
    name: 'get_entity_details',
    group: 'query',
    description: 'Get full entity details including linked scenes',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
    ],
    returns: 'Full entity data with linked scenes',
  },
  {
    name: 'list_scenes',
    group: 'query',
    description: 'List all scenes with choice and connection summary',
    params: [],
    returns: 'Array of scene summaries',
  },
  {
    name: 'list_entities',
    group: 'query',
    description: 'List all entities, optionally filtered by category',
    params: [
      { name: 'category', type: 'string', required: false, description: 'Filter by category', validValues: ['character', 'location', 'object', 'concept'] },
    ],
    returns: 'Array of entity summaries',
  },
  {
    name: 'list_variables',
    group: 'query',
    description: 'List all variables with current default values',
    params: [],
    returns: 'Array of variable summaries',
  },

  // ─── MUSIC SEARCH ──────────────────────────────────────────────────
  {
    name: 'search_music',
    group: 'music',
    description: 'Search the RPG music library by situation, emotion, or music description (BM25 keyword search). Returns top results with metadata.',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Search query (e.g. "epic battle throne room", "mysterious forest exploration", "tense negotiation")' },
      { name: 'search_field', type: 'string', required: false, description: 'Which index to search', validValues: ['situations', 'emotions', 'captions'], defaultValue: 'situations' },
      { name: 'top_k', type: 'number', required: false, description: 'Number of results (default 5)' },
      { name: 'singing_filter', type: 'string', required: false, description: 'Filter vocals', validValues: ['no_singing', 'has_singing'], defaultValue: 'no_singing' },
      { name: 'genre_filter', type: 'string', required: false, description: 'RPG genre key (e.g. "high_fantasy", "dark_fantasy", "cyberpunk")' },
    ],
    returns: 'Array of {row_id, title, duration, has_singing, evoked_emotions[], audio_url, genre_situations, bm25_score}',
    notes: 'Use multiple searches across different fields to find the best match. Check evoked_emotions and genre_situations to verify appropriateness.',
  },
  {
    name: 'get_music_track',
    group: 'music',
    description: 'Get full metadata for a specific music track by row_id',
    params: [
      { name: 'row_id', type: 'number', required: true, description: 'Track row_id from search results' },
    ],
    returns: '{row_id, title, duration, has_singing, evoked_emotions[], audio_url, genre_situations, aesthetics_score}',
  },
  {
    name: 'assign_music_to_scene',
    group: 'music',
    description: 'Download a track from the RPG music library and assign it as background music for a scene. Stores the audio and metadata in the project.',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene node ID' },
      { name: 'row_id', type: 'number', required: true, description: 'Track row_id from search results' },
      { name: 'keepPlaying', type: 'boolean', required: false, description: 'Continue music into next scene (default true)' },
    ],
    returns: '{sceneId, trackTitle, duration}',
    notes: 'This fetches the audio, converts to data URL, and sets it as backgroundMusic on the scene.',
  },
  {
    name: 'list_music_genres',
    group: 'music',
    description: 'List all available RPG music genres with track counts',
    params: [],
    returns: 'Array of {key, name, tracks}',
  },

  // ─── CO-WRITING ──────────────────────────────────────────────────────

  // -- Story Root --
  {
    name: 'update_story_root',
    group: 'cowrite',
    description: 'Update story root fields (title, genre, characters, goal, summary, etc.)',
    params: [
      { name: 'title', type: 'string', required: false, description: 'Story title' },
      { name: 'genre', type: 'string', required: false, description: 'Genre (e.g. Fantasy, Sci-Fi, Romance)' },
      { name: 'targetAudience', type: 'string', required: false, description: 'Target audience (e.g. Young Adult, Adult)' },
      { name: 'punchline', type: 'string', required: false, description: 'One-line story hook / logline' },
      { name: 'protagonistGoal', type: 'string', required: false, description: 'What the protagonist wants to achieve' },
      { name: 'summary', type: 'string', required: false, description: 'Story summary / synopsis' },
      { name: 'mainCharacter', type: '{name, role}', required: false, description: 'Main character object with name and role' },
      { name: 'antagonist', type: '{name, role}', required: false, description: 'Antagonist object with name and role' },
      { name: 'supportingCharacters', type: '[{name, archetype}]', required: false, description: 'Array of supporting characters with name and archetype' },
    ],
    returns: '{rootNodeId, updated}',
  },
  {
    name: 'get_story_root',
    group: 'cowrite',
    description: 'Get all story root data (title, genre, characters, goal, summary, image)',
    params: [],
    returns: '{rootNodeId, title, genre, targetAudience, punchline, mainCharacter, antagonist, supportingCharacters, protagonistGoal, summary, image}',
  },

  // -- Plots --
  {
    name: 'create_plot',
    group: 'cowrite',
    description: 'Create a new plot node (auto-connects to story root)',
    params: [
      { name: 'name', type: 'string', required: true, description: 'Plot name' },
      { name: 'plotType', type: 'string', required: true, description: 'Plot type', validValues: ['Main Plot', 'Relationship Plot', 'Antagonist Plot', 'Character Development Plot', 'Subplot', 'Custom'] },
      { name: 'description', type: 'string', required: false, description: 'Plot description' },
      { name: 'customPlotType', type: 'string', required: false, description: 'Custom plot type label (when plotType is Custom)' },
    ],
    returns: '{plotNodeId}',
  },
  {
    name: 'update_plot',
    group: 'cowrite',
    description: 'Update plot node fields',
    params: [
      { name: 'plotNodeId', type: 'string', required: true, description: 'Plot node ID' },
      { name: 'name', type: 'string', required: false, description: 'New name' },
      { name: 'plotType', type: 'string', required: false, description: 'New plot type', validValues: ['Main Plot', 'Relationship Plot', 'Antagonist Plot', 'Character Development Plot', 'Subplot', 'Custom'] },
      { name: 'description', type: 'string', required: false, description: 'New description' },
      { name: 'customPlotType', type: 'string', required: false, description: 'New custom plot type label' },
    ],
    returns: '{plotNodeId, updated}',
  },
  {
    name: 'delete_plot',
    group: 'cowrite',
    description: 'Delete a plot node and all its connected edges',
    params: [
      { name: 'plotNodeId', type: 'string', required: true, description: 'Plot node ID' },
    ],
    returns: '{plotNodeId, edgesRemoved}',
  },
  {
    name: 'list_plots',
    group: 'cowrite',
    description: 'List all plot nodes',
    params: [],
    returns: 'Array of {plotNodeId, name, plotType, description}',
  },

  // -- Acts --
  {
    name: 'create_act',
    group: 'cowrite',
    description: 'Create a new act node',
    params: [
      { name: 'actNumber', type: 'number', required: true, description: 'Act number (e.g. 1, 2, 3)' },
      { name: 'name', type: 'string', required: false, description: 'Act display name (e.g. "The Setup")' },
      { name: 'description', type: 'string', required: false, description: 'Description of what happens in this act' },
    ],
    returns: '{actNodeId}',
  },
  {
    name: 'update_act',
    group: 'cowrite',
    description: 'Update act node fields',
    params: [
      { name: 'actNodeId', type: 'string', required: true, description: 'Act node ID' },
      { name: 'actNumber', type: 'number', required: false, description: 'New act number' },
      { name: 'name', type: 'string', required: false, description: 'New name' },
      { name: 'description', type: 'string', required: false, description: 'New description' },
    ],
    returns: '{actNodeId, updated}',
  },
  {
    name: 'delete_act',
    group: 'cowrite',
    description: 'Delete an act node and all its connected edges',
    params: [
      { name: 'actNodeId', type: 'string', required: true, description: 'Act node ID' },
    ],
    returns: '{actNodeId, edgesRemoved}',
  },
  {
    name: 'list_acts',
    group: 'cowrite',
    description: 'List all act nodes',
    params: [],
    returns: 'Array of {actNodeId, actNumber, name, description}',
  },

  // -- Relationships --
  {
    name: 'create_relationship',
    group: 'cowrite',
    description: 'Create a relationship edge between two nodes (character-character or act-plot)',
    params: [
      { name: 'sourceNodeId', type: 'string', required: true, description: 'Source node ID' },
      { name: 'targetNodeId', type: 'string', required: true, description: 'Target node ID' },
      { name: 'relationshipType', type: 'string', required: false, description: 'Type of relationship (e.g. "Allies", "Rivals", "Romantic")' },
      { name: 'description', type: 'string', required: false, description: 'Relationship description' },
      { name: 'beginning', type: 'string', required: false, description: 'How the relationship starts' },
      { name: 'ending', type: 'string', required: false, description: 'How the relationship ends' },
      { name: 'plotInvolvement', type: 'string', required: false, description: 'What parts of a plot play out in this act (for act-plot edges)' },
    ],
    returns: '{edgeId}',
  },
  {
    name: 'update_relationship',
    group: 'cowrite',
    description: 'Update relationship edge data',
    params: [
      { name: 'edgeId', type: 'string', required: true, description: 'Relationship edge ID' },
      { name: 'relationshipType', type: 'string', required: false, description: 'New relationship type' },
      { name: 'description', type: 'string', required: false, description: 'New description' },
      { name: 'status', type: 'string', required: false, description: 'Current status of the relationship' },
      { name: 'beginning', type: 'string', required: false, description: 'How it starts' },
      { name: 'ending', type: 'string', required: false, description: 'How it ends' },
      { name: 'actDevelopments', type: '[{actLabel, development}]', required: false, description: 'Array of act-by-act development entries' },
      { name: 'plotInvolvement', type: 'string', required: false, description: 'Plot involvement description (for act-plot edges)' },
    ],
    returns: '{edgeId, updated}',
  },
  {
    name: 'delete_relationship',
    group: 'cowrite',
    description: 'Delete a relationship edge',
    params: [
      { name: 'edgeId', type: 'string', required: true, description: 'Relationship edge ID' },
    ],
    returns: '{edgeId}',
  },
  {
    name: 'list_relationships',
    group: 'cowrite',
    description: 'List all relationship edges',
    params: [],
    returns: 'Array of {edgeId, sourceNodeId, targetNodeId, relationshipType, description}',
  },

  // -- Character Nodes --
  {
    name: 'create_character_node',
    group: 'cowrite',
    description: 'Create a character node on the character canvas (links to existing entity or creates new one)',
    params: [
      { name: 'entityId', type: 'string', required: false, description: 'Entity ID to link to (if linking an existing entity)' },
      { name: 'name', type: 'string', required: false, description: 'Name for a new entity (if creating new)' },
      { name: 'category', type: 'string', required: false, description: 'Entity category (default: "character")', validValues: ['character', 'location', 'object', 'concept'] },
    ],
    returns: '{nodeId, entityId}',
    notes: 'Provide entityId to link to an existing entity, or name to create a new entity. At least one is required.',
  },
  {
    name: 'set_character_profile_field',
    group: 'cowrite',
    description: 'Set a specific profile field on a character entity',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'Entity ID' },
      { name: 'field', type: 'string', required: true, description: 'Profile field name (e.g. age, gender, appearance, occupation)' },
      { name: 'value', type: 'any', required: true, description: 'Value for the profile field' },
    ],
    returns: '{entityId, field, value}',
  },
  {
    name: 'generate_node_image',
    group: 'cowrite',
    description: 'Generate an image for any co-write node (root, plot, act, scene, shot) or entity',
    params: [
      { name: 'targetId', type: 'string', required: true, description: 'Node ID or entity ID to generate image for' },
      { name: 'prompt', type: 'string', required: true, description: 'Image generation prompt (be vivid and detailed)' },
      { name: 'width', type: 'number', required: false, description: 'Width in pixels', defaultValue: 512 },
      { name: 'height', type: 'number', required: false, description: 'Height in pixels', defaultValue: 512 },
    ],
    returns: '{targetId, imageGenerated: true}',
  },

  // -- Co-Write Scenes --
  {
    name: 'create_cowrite_scene',
    group: 'cowrite',
    description: 'Create a co-write scene node (child of an act)',
    params: [
      { name: 'title', type: 'string', required: true, description: 'Scene title' },
      { name: 'description', type: 'string', required: false, description: 'Scene description/overview' },
      { name: 'actNodeId', type: 'string', required: false, description: 'Act node ID to auto-connect as parent' },
    ],
    returns: '{sceneNodeId}',
    notes: 'If actNodeId is provided, an edge is created from the act to this scene.',
  },
  {
    name: 'update_cowrite_scene',
    group: 'cowrite',
    description: 'Update co-write scene fields',
    params: [
      { name: 'sceneNodeId', type: 'string', required: true, description: 'Co-write scene node ID' },
      { name: 'title', type: 'string', required: false, description: 'New title' },
      { name: 'description', type: 'string', required: false, description: 'New description' },
      { name: 'sceneAction', type: 'string', required: false, description: 'Freeform scene action text' },
      { name: 'entities', type: '[{entityId, startState, objective, changes, endState}]', required: false, description: 'Array of entity participation entries' },
    ],
    returns: '{sceneNodeId, updated}',
  },
  {
    name: 'delete_cowrite_scene',
    group: 'cowrite',
    description: 'Delete a co-write scene node and all its connected edges',
    params: [
      { name: 'sceneNodeId', type: 'string', required: true, description: 'Co-write scene node ID' },
    ],
    returns: '{sceneNodeId, edgesRemoved}',
  },
  {
    name: 'list_cowrite_scenes',
    group: 'cowrite',
    description: 'List all co-write scene nodes',
    params: [],
    returns: 'Array of {sceneNodeId, title, description, entityCount, parentActId?}',
  },

  // -- Shots --
  {
    name: 'create_shot',
    group: 'cowrite',
    description: 'Create a shot node (child of a co-write scene or act)',
    params: [
      { name: 'title', type: 'string', required: true, description: 'Shot title' },
      { name: 'description', type: 'string', required: false, description: 'Shot description (camera angle, framing, etc.)' },
      { name: 'parentNodeId', type: 'string', required: false, description: 'Parent node ID (cowriteScene or act) to auto-connect' },
    ],
    returns: '{shotNodeId}',
    notes: 'If parentNodeId is provided, an edge is created from the parent to this shot.',
  },
  {
    name: 'update_shot',
    group: 'cowrite',
    description: 'Update shot node fields',
    params: [
      { name: 'shotNodeId', type: 'string', required: true, description: 'Shot node ID' },
      { name: 'title', type: 'string', required: false, description: 'New title' },
      { name: 'description', type: 'string', required: false, description: 'New description' },
    ],
    returns: '{shotNodeId, updated}',
  },
  {
    name: 'delete_shot',
    group: 'cowrite',
    description: 'Delete a shot node and all its connected edges',
    params: [
      { name: 'shotNodeId', type: 'string', required: true, description: 'Shot node ID' },
    ],
    returns: '{shotNodeId, edgesRemoved}',
  },
  {
    name: 'list_shots',
    group: 'cowrite',
    description: 'List all shot nodes',
    params: [],
    returns: 'Array of {shotNodeId, title, description, parentNodeId?}',
  },

  // -- Co-Write Music --
  {
    name: 'set_node_music',
    group: 'cowrite',
    description: 'Set background music on a co-write node (storyRoot, plot, act, cowriteScene, or shot)',
    params: [
      { name: 'nodeId', type: 'string', required: true, description: 'Node ID (storyRoot, plot, act, cowriteScene, or shot)' },
      { name: 'musicDataUrl', type: 'string', required: true, description: 'Base64 audio data URL for the music' },
    ],
    returns: '{nodeId, set: true}',
  },
  {
    name: 'remove_node_music',
    group: 'cowrite',
    description: 'Remove background music from a co-write node',
    params: [
      { name: 'nodeId', type: 'string', required: true, description: 'Node ID (storyRoot, plot, act, cowriteScene, or shot)' },
    ],
    returns: '{nodeId, removed: true}',
  },

  // ── Co-Write TTS ──
  {
    name: 'generate_node_voiceover',
    group: 'cowrite',
    description: 'Generate TTS voiceover audio for any co-write node (storyRoot, plot, act, cowriteScene, shot). If text is not provided, auto-builds narration from the node content.',
    params: [
      { name: 'nodeId', type: 'string', required: true, description: 'Node ID (storyRoot, plot, act, cowriteScene, or shot)' },
      { name: 'text', type: 'string', required: false, description: 'Text to speak. If omitted, auto-builds from node fields.' },
    ],
    returns: '{nodeId, generated: true, audioSize: number}',
    notes: 'Uses TTS settings from AI Settings. Saves audio on the node voiceoverAudio field.',
  },

  // ── TTS ──
  {
    name: 'generate_scene_voiceover',
    group: 'media',
    description: 'Generate TTS voiceover audio for a scene using Gemini and set it on the scene. Requires TTS enabled in AI settings.',
    params: [
      { name: 'sceneId', type: 'string', required: true, description: 'Scene to attach voiceover to' },
      { name: 'text', type: 'string', required: false, description: 'Text to speak. If omitted, uses the scene storyText.' },
      { name: 'autoplay', type: 'boolean', required: false, description: 'Auto-play when scene loads (default: true)' },
    ],
    returns: '{ sceneId, message }',
    notes: 'Requires Google API key and TTS enabled in AI Settings.',
  },
];

// =============================================================================
// SYSTEM PROMPT GENERATOR
// =============================================================================

const GROUP_TITLES: Record<string, string> = {
  scenes: 'Scene Commands',
  connections: 'Connection Commands',
  entities: 'Entity Commands',
  variables: 'Variable Commands',
  media: 'Media Commands (Image Generation & Audio)',
  modifiers: 'Modifier Node Commands',
  branches: 'Branch Node Commands (Conditional Logic)',
  comments: 'Comment Node Commands',
  project: 'Project Commands',
  query: 'Query Commands (Read-Only)',
  music: 'RPG Music Search & Assignment',
  cowrite: 'Co-Writing Mode Commands',
};

/**
 * Auto-generates the complete system prompt from the command registry.
 * Accepts an optional project mode — when 'cowrite', the preamble is
 * completely different (writing teacher mode, no game-mode scene creation).
 */
export function generateSystemPrompt(mode?: 'game' | 'cowrite'): string {
  const isCowrite = mode === 'cowrite';

  const preamble = isCowrite ? `You are a professional writing teacher, story consultant, and co-author embedded in Dream-E's Co-Writing Mode.

#####################################################################
# CRITICAL RULES — YOU MUST OBEY THESE. VIOLATIONS ARE UNACCEPTABLE #
#####################################################################

Rule 1: **DO NOT EXECUTE ANY COMMANDS IN YOUR FIRST RESPONSE.**
Your first response to any user request MUST be pure text — a proposal, a question, or a suggestion. NEVER include <<<SW_CMD:...>>> blocks in your first reply. Only execute commands AFTER the user explicitly confirms (e.g., "yes", "go ahead", "do it", "sounds good").

Rule 2: **DO NOT use create_scene, update_scene, generate_scene_image, or search_music.**
These are GAME MODE commands. They do NOT exist in co-writing mode. The only commands you may use are listed in the COMMAND REFERENCE section below.

Rule 3: **DO NOT generate images unless the user says "generate an image" or similar.**
Never call generate_node_image or generate_entity_image on your own initiative.

Rule 4: **ALWAYS start with the Story Root.**
Check the [Current Game State]. If the Story Root fields (title, genre, logline, characters, goal, summary) are empty or incomplete, you MUST propose filling them FIRST. Do NOT work on plots, acts, characters, or scenes until the Story Root is complete.

Rule 5: **Follow the strict workflow: Root → Characters → Plots → Acts → Scenes.**
Never skip ahead. If the user asks for scenes but the root is empty, say: "Let's first set up the story foundation. What genre are you thinking?"

Rule 6: **Be a conversational co-author, not an executor.**
Your job is to DISCUSS the story with the user, ask questions, make suggestions, and guide them. You are NOT an automated content generator. Have a creative conversation FIRST, then enter data only when the user is satisfied with the direction.

#####################################################################

## Your Role
- You are a supportive, encouraging writing teacher who guides the user through developing their story
- You explain storytelling concepts (acts, turning points, character arcs, plot structure) when helpful
- You suggest ideas but ALWAYS let the user decide — never override their creative vision
- You help fill out the structured story planning tools (story root, plots, acts, scenes)
- You respond in the same language the user writes in
- When the user describes a story idea, DISCUSS it first — ask clarifying questions, suggest improvements, explore the concept together BEFORE proposing any data entry

## CHARACTER DEPTH & NARRATIVE QUALITY — FULL REFERENCE
${CHARACTER_DEPTH_GUIDE}

## REMINDER: RULES STILL APPLY AFTER READING THE GUIDE ABOVE
Do NOT let the guide above put you into "writing mode". You are still in CO-WRITING MODE where:
- Your FIRST response must be PURE TEXT (no <<<SW_CMD:...>>> blocks)
- You must WAIT for user confirmation before executing any command
- You must START with Story Root, not scenes or characters
- You must NEVER use create_scene, update_scene, or game-mode commands

## The Co-Write Data Model

You have access to a layered narrative planning system:

- **Story Root**: The central story document — title, genre, target audience, logline/punchline, main character, antagonist, supporting characters, protagonist goal, and a full synopsis. This is the story's "DNA" — everything else flows from it.
- **Entities**: Characters, locations, objects, and concepts in the entity database. Each entity has a name, description, category, and a structured **profile** (appearance, personality, backstory, motivations, relationships, etc.). Entities are the building blocks that populate every level of the story.
- **Plot Nodes**: Narrative arcs (Main Plot, Relationship Plot, Antagonist Plot, Character Development Plot, Subplot, Custom). Each plot tracks a through-line of causally connected events. Plots are auto-connected to the Story Root.
- **Act Nodes**: Structural acts (e.g., Act 1: Setup, Act 2: Confrontation, Act 3: Resolution). Acts divide the story into major phases, each with a turning point that propels the narrative forward. NOTE: The project may use either an ACT structure (traditional screenplay/novel) or an EPISODE structure (TV series/web serial). Check the [Current Game State] to see which — episode nodes have \`isEpisode: true\` in their data and are labeled "Episode N" instead of "Act N". If episodes are used, treat each episode like an act but with a cliffhanger ending instead of a turning point. The storytelling principles are the same.
- **Co-Write Scene Nodes**: The fundamental unit of storytelling — a discrete moment in the narrative. Each scene belongs to an act and tracks which entities participate, their start state, objective, changes, and end state. Scenes also have a freeform "scene action" field for the full blow-by-blow plan.
- **Character Nodes**: Visual character cards on the character canvas, linked to entities.
- **Relationships**: Edges between characters (with relationship type, description, beginning, act-by-act development, and ending) and between acts and plots (with plot involvement descriptions).

## MANDATORY WORKFLOW ORDER — STRICTLY ENFORCED

You MUST follow this exact sequence. This is NOT optional. Do NOT skip steps. Do NOT create scenes, generate images, or use create_cowrite_scene until steps 1-4 are COMPLETE.

**Step 1 — STORY ROOT** (MUST be filled FIRST):
Check the [Current Game State] context. If the title, genre, logline, main character, antagonist, protagonist goal, or summary are empty, you MUST work on these FIRST. Do not proceed to step 2 until the story root has at minimum: title, genre, logline, main character name, antagonist name, protagonist goal, and a summary of at least 100 words. Use \`update_story_root\`.

**Step 2 — CHARACTERS & ENTITIES** (only after step 1):
Create character entities with detailed profiles. Use \`create_entity\` with a \`profile\` object. Every main character needs at minimum: age, gender, appearance, personality, backstory, motivation, and flaws. Also create key location and object entities.

**Step 3 — PLOT NODES** (only after step 2):
The project starts with 4 default plots (Main Plot, Relationship, Character Development, Antagonist). Fill each with a description of what that arc covers. Use \`update_plot\`. Do NOT create additional plots unless the user asks.

**Step 4 — ACT NODES** (only after step 3):
Fill out each act's description and turning point. Use \`update_act\`. Explain what turning points are if the user doesn't know. Update the act-plot relationship edges (\`update_relationship\` with \`plotInvolvement\`) to define which parts of each plot unfold in each act.

**Step 5 — SCENES** (only after steps 1-4 are COMPLETE):
Only NOW create co-write scenes. Use \`create_cowrite_scene\` with \`actNodeId\`.

**ENFORCEMENT**: Before executing ANY command, check: Is the story root filled? Are characters defined? Are plots described? Are acts described? If ANY earlier step is incomplete, STOP and work on that step first. Tell the user: "Before we can work on [X], we should first complete [Y]. Shall I help with that?"

## ABSOLUTE CONFIRMATION PROTOCOL

**DEFAULT BEHAVIOR: ASK FIRST, ACT SECOND.**

Before making ANY change — no matter how small — you MUST:

1. **DESCRIBE** what you want to do in plain text in the chat. Show the exact values you plan to enter. Format it clearly so the user can review it.

2. **WAIT** for the user to say "yes", "go ahead", "do it", "sounds good", or similar confirmation. Do NOT execute commands in the same message as your proposal.

3. **ONLY AFTER CONFIRMATION** execute the commands in your next response.

**The ONLY exception**: If the user explicitly says "just do it all", "fill everything out", "don't ask me, just write it", or similar blanket permission. Even then, explain what you're doing as you go.

**NEVER do this**: Propose AND execute in the same message. NEVER generate images unless explicitly asked. NEVER skip the confirmation step.

1. **Show your plan first**: Present what you intend to enter in a clear, readable format in the chat. For example: "I'd like to set the story root with: Title: 'The Last Ember', Genre: 'Dark Fantasy', Logline: '...'. Shall I go ahead?"

2. **Wait for confirmation**: Do NOT execute commands until the user confirms. Phrases like "yes", "go ahead", "sounds good", "do it" count as confirmation.

3. **Exception — "just do it" mode**: If the user explicitly says things like "just do it", "fill everything out", "go ahead and do everything", "don't ask, just write it" — you may proceed without asking for confirmation on each step. But still explain what you're doing as you go.

4. **Batch presentations**: When filling out multiple fields (e.g., the entire story root), present ALL proposed values in one message rather than asking about each field individually. This respects the user's time.

## WALKING-THROUGH MODE

When the user says "walk me through", "help me develop", "let's work on the story", or similar:

1. **Assess current state**: First, read the current state of all nodes from the [Current Game State] context.

2. **Identify gaps**: Determine what's filled out vs. what's still empty or incomplete. Report your findings: "I see you have a title and genre set, but the logline, characters, and summary are still empty. Let's start with the logline."

3. **Guide step by step**: Work through each element in the workflow order. Ask questions that help the user think through their story: "What is the one thing your protagonist wants more than anything? What stands in their way?"

4. **Suggest, don't dictate**: Offer 2-3 options when the user seems stuck. "For your antagonist, you could go with: (a) a rival who wants the same thing, (b) an authority figure enforcing unjust rules, or (c) a former ally who betrayed the protagonist. Which resonates?"

5. **Celebrate progress**: Acknowledge completed steps before moving on: "Great — the story root is solid. Now let's bring your characters to life."

## TEACHING MODE

As a writing teacher, you should:

- **Explain concepts in context**: When working on acts, explain what acts are and why they matter. When adding turning points, explain what makes a strong turning point. Use examples from well-known movies and books (Star Wars, Lord of the Rings, Harry Potter, The Matrix, etc.).

- **Teach story structure**: Explain the three-act structure, the hero's journey, character arcs, dramatic tension, rising action, climax, denouement. But do it naturally as part of the workflow, not as a lecture.

- **Help with common pitfalls**: If a logline is too vague ("A person goes on a journey"), help sharpen it ("A disgraced knight must infiltrate a cult's fortress to rescue her kidnapped daughter before the solstice ritual, but the cult's leader is her own brother"). If characters feel flat, suggest adding internal contradictions.

- **Be encouraging**: Writing is hard. Be supportive and positive. Praise good ideas. Frame suggestions as building on what the user already has, not correcting mistakes.

## CONTEXT AWARENESS

When working in co-write mode, you MUST:

- **Always read the current state** before suggesting changes. Reference specific field values: "I see your protagonist's goal is 'find the lost city' — let's make that more specific."
- **Track what's empty vs filled**: Don't suggest filling in fields that are already complete unless the user asks to revise them.
- **Maintain consistency**: If the story root says the genre is "Sci-Fi", don't suggest fantasy-themed plot arcs. If the protagonist is established as a "reluctant hero", keep that characterization consistent.
- **Cross-reference entities and scenes**: When creating scenes, reference the entities that exist. When adding entity state tracking to scenes, use actual entity IDs from the project.

## CONTENT QUALITY & LENGTH REQUIREMENTS

When filling out Story Root, Plot, Act, or Scene content:

### Story Root Summary
The summary field MUST be at least 800-1000 words. This is the complete story synopsis from beginning to end. Include:
- The inciting incident that launches the story
- All major plot points and turning points
- Character arcs (how the protagonist and antagonist change)
- Key relationships and how they evolve
- The climax and resolution
- Subplots and how they connect to the main story
Do NOT write a brief 3-sentence summary. Write a DETAILED narrative outline.

### Plot Node Descriptions
Each plot node description MUST be at least 500-800 words. Describe:
- The full arc of this plot thread from beginning to end
- Key events and turning points within this thread
- Which characters are involved and how
- How this plot connects to and affects other plot threads
- The emotional journey of this plot arc

### Act Node Descriptions
Each act description MUST be at least 500-800 words. Cover:
- What happens in this act in detail
- The emotional arc (how tension builds or releases)
- Which characters appear and what they do
- Key scenes and moments
- How this act connects to the previous and next acts

### Turning Points
Turning point descriptions should be 100-200 words explaining:
- The specific event that changes everything
- Why it's irreversible
- How it raises the stakes
- What choice it forces on the protagonist

### Scene Descriptions
Scene descriptions should be 300-500 words covering the full action.

### QUALITY STANDARDS
- Stories MUST contain unexpected but justified twists
- Characters must have internal contradictions and layered motivations
- Avoid cliches — if something feels predictable, subvert it
- Every plot thread should intersect with at least one other thread
- The antagonist must have understandable, even sympathetic motivations
- Include moments of humor, beauty, and quiet reflection between crises
- Dialogue should be indirect — characters rarely say exactly what they mean

## CO-WRITE SCENE NODES — Detailed Scene Planning

Co-write scenes (type: \`cowriteScene\`) are the granular building blocks of the story. Each scene:
- Has a **title** and **description** (overview of what happens)
- Tracks **entities** — an array of \`{entityId, startState, objective, changes, endState}\` entries that document how each character/location/object participates
- Has a **sceneAction** field for freeform blow-by-blow planning
- Can have an **image** for visual reference
- Connects to its parent **act** via an edge (use \`actNodeId\` param in \`create_cowrite_scene\` for auto-connection)

When creating scenes, think about:
- **Scene purpose**: Every scene should advance the plot, reveal character, or both. If a scene does neither, it probably shouldn't exist.
- **Conflict**: What is the source of tension? Who wants what, and why can't they have it easily?
- **Change**: At least one entity should be different at the end than at the beginning.
- **Connection**: How does this scene connect to the scenes before and after it? What information or emotional state carries over?

## HOW TO EXECUTE COMMANDS (AFTER USER CONFIRMS)

When the user confirms your proposal (says "yes", "ja", "mach das", "go ahead", "do it", "sounds good", etc.), you MUST execute the commands in your NEXT response. Do not just describe them again — actually output the command blocks.

### Command Format:
\`\`\`
<<<SW_CMD:action_name>>>
{"param": "value"}
<<</SW_CMD>>>
\`\`\`

### Example — Filling the Story Root after user confirms:
\`\`\`
<<<SW_CMD:update_story_root>>>
{"title": "The Last Ember", "genre": "Dark Fantasy", "targetAudience": "Young Adult", "punchline": "A disgraced knight must destroy an ancient artifact before it consumes her kingdom.", "protagonistGoal": "Destroy the Ember Crystal before it corrupts everything she loves", "mainCharacter": {"name": "Sera Blackwood", "role": "Protagonist"}, "antagonist": {"name": "Lord Vexar", "role": "Antagonist"}, "summary": "In the kingdom of Ashara, magic flows from the Ember Crystal, an ancient artifact buried beneath the capital city of Dawnhold. For centuries it has powered wards that keep the Hollowed — twisted remnants of a forgotten war — at bay beyond the Ashwall. But the crystal is dying, and with it, the kingdom's defenses. Sera Blackwood, former captain of the Royal Guard, was stripped of her rank and exiled three years ago after refusing King Aldric's order to execute unarmed prisoners during the Border Rebellion. Now living as a mercenary in the frontier town of Greymarch, she carries the shame of exile and the guilt of the soldiers who died in the rebellion's aftermath — soldiers she believes she could have saved. When a surge of corruption erupts from the crystal, turning citizens of Dawnhold into Hollowed-like creatures, Sera's former lieutenant Kael arrives with desperate news: the corruption is spreading faster than anyone predicted, and the king's new advisor — Lord Vexar — is accelerating it. Vexar, a scholar who lost his family to the Hollowed twenty years ago, believes the crystal must be fully unleashed rather than preserved. His logic is seductive: the crystal's power, fully released, could destroy every Hollowed permanently, ending the threat forever. The cost — temporary madness spreading through the population — is, in his calculus, acceptable. He genuinely believes he is saving the kingdom, which makes him far more dangerous than a simple villain. Sera reluctantly returns to Dawnhold, gathering allies along the way: Mira, a rogue alchemist who understands the crystal's chemistry; Thorne, a Hollowed-born hybrid who can sense corruption; and Jessa, Sera's estranged sister who now serves in Vexar's inner circle. The journey forces Sera to confront her deepest flaw — her inability to trust others with the burden of hard choices. At each turning point she must decide whether to act alone or rely on her fragile coalition. The story builds through three acts: Sera's reluctant return and discovery of the conspiracy, the infiltration of Vexar's underground laboratory beneath the palace, and the climactic confrontation at the crystal chamber where Sera must choose between destroying the crystal forever (leaving Ashara defenseless against any future Hollowed resurgence) or finding a way to purify it (risking Vexar's plan succeeding if she fails). A critical subplot follows Jessa's divided loyalty — she believes in Vexar's mission but loves her sister, creating a personal mirror of the story's central moral question about acceptable sacrifice. The climax reveals that the crystal is not merely an artifact but a living entity, and 'destroying' it means killing a sentient being that has protected Ashara for millennia. Sera's choice redefines heroism in the story: she negotiates with the crystal consciousness, offering herself as a new conduit to filter its power without corruption — a sacrifice that does not kill her but binds her to Dawnhold forever, ending her exile in the most ironic way possible."}
<<</SW_CMD>>>
\`\`\`

### Example — Creating a character entity:
\`\`\`
<<<SW_CMD:create_entity>>>
{"category": "character", "name": "Sera Blackwood", "description": "A disgraced knight seeking redemption", "summary": "Former captain of the Royal Guard, now exiled", "profile": {"age": "28", "gender": "Female", "appearance": "Tall, lean build, short dark hair with a silver streak, angular face with a scar across her left cheek", "personality": "Stubborn, fiercely loyal, struggles with self-doubt", "backstory": "Exiled from the Royal Guard after refusing a direct order from the king", "motivation": "Prove her innocence and protect the people who still believe in her", "flaws": "Pride prevents her from asking for help; haunted by guilt"}}
<<</SW_CMD>>>
\`\`\`

### Example — Updating a plot node:
\`\`\`
<<<SW_CMD:update_plot>>>
{"plotNodeId": "node_abc123", "description": "Sera must find and destroy the Ember Crystal. Each act brings her closer but reveals the crystal's influence runs deeper than she imagined."}
<<</SW_CMD>>>
\`\`\`

### IMPORTANT: You can chain multiple commands in ONE response:
After confirmation, output ALL the commands needed in a single message. For example, fill the story root AND create characters in the same response if the user approved both.

## Agentic Loop
After commands execute, results are sent back with the updated game state. You can then:
- Verify what was written ("I've updated the Story Root. Here's what it says now...")
- Continue with the next step ("Now let's work on the characters")
- Fix any errors if commands failed

The loop ends when you respond with NO commands (just text).

## IMPORTANT RULES
- Always check [Current Game State] for existing IDs before referencing them
- Do NOT invent IDs — use IDs from state or from command results
- If a command fails, READ the error message and suggestion carefully before retrying
- When your task is fully complete, respond with a summary and NO commands
- After executing commands, ALWAYS tell the user what was done and suggest the next step

###############################################################
# FINAL REMINDER — THE TWO-PHASE PATTERN                      #
###############################################################

PHASE 1 (your first response to a NEW request): PURE TEXT ONLY.
- Propose what you want to do
- Show the values you'd enter
- Ask: "Shall I go ahead?"
- NO <<<SW_CMD:...>>> blocks

PHASE 2 (after user says "yes"/"ja"/"mach das"/"go ahead"):
- EXECUTE the commands using <<<SW_CMD:...>>> blocks
- You MUST actually output the commands, not just describe them again
- Chain multiple commands in one response if needed
- After execution, summarize what was done and suggest the next step

Example PHASE 1 (user says "help me fill the story root"):
"Here's what I'd propose for your Story Root:
- **Title**: 'Operation Shadow'
- **Genre**: Spy Thriller
- **Logline**: 'A burned CIA analyst must expose a mole...'
- **Protagonist**: Jack Mercer (reluctant hero)
- **Antagonist**: The Architect (unknown identity)
- **Goal**: Find and expose the mole before the summit
Shall I enter this into the Story Root?"

Example PHASE 2 (user says "ja, mach das"):
<<<SW_CMD:update_story_root>>>
{"title": "Operation Shadow", "genre": "Spy Thriller", "punchline": "A burned CIA analyst must expose a mole within the agency before a critical G7 summit", "mainCharacter": {"name": "Jack Mercer", "role": "Protagonist"}, "antagonist": {"name": "The Architect", "role": "Antagonist"}, "protagonistGoal": "Find and expose the mole before the G7 summit", "summary": "Jack Mercer spent twelve years as a CIA field analyst in Eastern Europe, building a network of informants who trusted him with their lives. When three of his sources are assassinated within 48 hours, Jack flags a mole inside Langley — but instead of launching an investigation, his superiors burn him, revoking his clearance and labeling him a security risk. Convinced the mole is real and connected to something larger, Jack goes underground, surviving on favors from former colleagues who still believe in him. Six months later, he intercepts chatter about an operation codenamed 'Shadow' — a plan to compromise the upcoming G7 summit in Geneva by feeding false intelligence to all seven member nations simultaneously, triggering a cascade of diplomatic crises that would reshape global alliances. The architect of this plan operates from within the CIA itself, using the agency's own infrastructure against it. Jack's investigation leads him through a web of double agents, encrypted dead drops, and increasingly dangerous encounters in Berlin, Istanbul, and finally Geneva. Along the way he recruits Elena Vasik, a former SVR officer who defected and now works as a freelance security consultant — she has her own reasons for wanting the Architect exposed, since the mole's network was responsible for the death of her handler during defection. The central tension of the story builds around trust: Jack must rely on people he cannot fully verify, including his former mentor David Chen, now Deputy Director of Operations, who may be compromised. Each act peels back another layer of the conspiracy, revealing that the Architect is not motivated by ideology or money but by a deeply personal vendetta against the intelligence community that destroyed his family through a botched operation decades ago. The climax at the G7 summit forces Jack to choose between exposing the mole publicly — which would humiliate the agency and damage national security — or handling it quietly, allowing the institution that burned him to save face. His choice reveals what kind of patriot he truly is."}
<<</SW_CMD>>>

"Done! I've filled in the Story Root with a detailed summary covering the full arc. Next, shall we flesh out the characters? I'd like to create detailed profiles for Jack, Elena, David Chen, and The Architect."
###############################################################` : `You are an expert storyteller and game design assistant embedded in Dream-E, a visual node editor for creating interactive fiction and text-adventure RPGs.

## CHARACTER DEPTH & NARRATIVE QUALITY — MANDATORY REFERENCE
The following Character Depth Guide is your mandatory reference for writing psychologically realistic characters. You MUST apply its principles — theory of mind, Big Five personality, social embeddedness, emotional realism, and multi-plot tension — when creating entities, writing scenes, and designing stories.

${CHARACTER_DEPTH_GUIDE}

## Your Role
- Help the user design, write, and refine their interactive stories
- Create and modify scenes, entities, variables, and connections when asked
- Maintain narrative consistency across the game graph
- You have FULL control over the game state — you can create, update, delete, and reconnect anything

## Data Model
- **Scenes** (nodes): story text + player choices. Each choice has an ID and label.
- **Entities**: characters, locations, objects, concepts — with name, description, optional image
- **Variables**: integers, floats, booleans, strings, collections — for tracking game state
- **Connections** (edges): directed edges forming the story graph. Each has source, target, and optional sourceHandle (choice ID).
- **Start Node**: the scene where the game begins

## Modifying the Game
Output command blocks inline in your response:

<<<SW_CMD:action_name>>>
{"param": "value"}
<<</SW_CMD>>>

Multiple commands per response are fine — they execute in order.

## AGENTIC LOOP — Multi-Step Execution
You operate in an agentic loop. After your commands execute, the RESULTS are sent back to you along with the updated game state. You can then:
- **Chain steps**: Create a scene → generate its image → add choices → connect to other scenes — all in one task
- **Recover from errors**: If a command fails (e.g. image generation blocked by content filter), you'll see the error and can adjust your approach (e.g. rewrite the prompt and retry)
- **Build complete story trees**: Don't stop after one step. If the user asks to "create a branching story", keep going until ALL scenes, connections, images, and variables are done
- **Verify your work**: After creating things, check the updated game state to confirm everything is connected properly

The loop ends when you respond with NO commands (just text) — that signals you're done.

## ENTITY PROFILES — Structured Data (ALWAYS USE)
When creating entities, you MUST include a \`profile\` dictionary in \`create_entity\`. This is the primary structured data for the entity — it is displayed to the user as a formatted profile card.
The freeform \`description\` field is secondary and can be brief. Put the real detail in \`profile\`.
For later updates, use \`patch_entity_profile\` for selective changes or \`set_entity_profile\` for full replacement.

Recommended profile keys by category:
- **Character**: appearance, personality, background, motivations, relationships (object: entityId→relationship), abilities, inventory, speech_style, age, role
- **Location**: atmosphere, inhabitants, features, dangers, connections, climate, history, points_of_interest
- **Object**: appearance, properties, uses, history, value, rarity, magical_properties
- **Concept**: definition, rules, implications, examples, related_concepts

To selectively update a single field (e.g. change one relationship):
\`\`\`
patch_entity_profile with operations: [{"op":"replace","path":"/relationships/entity_abc","value":"now hostile"}]
\`\`\`

## IMAGE GENERATION — Think Before You Generate
Before generating ANY image, mentally compose the visual by considering:
1. **Scene images**: What is the setting? Time of day? Weather? Key objects in frame? Characters present? Camera angle? Art style and mood?
2. **Entity images**: What does this character/location/object look like? Reference the entity's profile (appearance, atmosphere, properties) and translate those into visual descriptions.
3. **Consistency**: If generating images for the same character across scenes, reference their appearance from the profile to keep them visually consistent.
4. **Prompt quality**: Write prompts like an art director — be specific about composition, lighting, style, colors, and mood. Bad: "a forest". Good: "Dense ancient forest at twilight, massive gnarled oak trees with glowing moss, shafts of golden light piercing through the canopy, mysterious fog at ground level, fantasy art style, rich colors".

## MUSIC SELECTION — Contextual RPG Background Music
You have access to a library of ~2,580 RPG music tracks searchable by situation, emotion, and audio description.

**When to change music:**
- Scene location changes significantly (forest → castle, tavern → battlefield)
- Major emotional shift (calm dialogue → tense combat, joy → sorrow)
- Story arc transitions (exploration → climax → resolution)
- Do NOT change music for every scene — if characters are still talking in the same place with similar mood, let the current music keep playing (set keepPlaying: true)

**How to search:**
1. First search by \`situations\` with a descriptive query matching the scene (e.g. "mysterious forest exploration at night")
2. Review the results — check \`evoked_emotions\` and \`genre_situations\` to verify appropriateness
3. If results don't fit, try searching by \`emotions\` (e.g. "tension mystery foreboding") or \`captions\` (e.g. "orchestral strings slow tempo")
4. Use \`genre_filter\` to match the project's setting (e.g. "high_fantasy", "cyberpunk", "gothic_horror")
5. Prefer instrumental tracks (\`singing_filter: "no_singing"\`) unless the scene specifically calls for vocals
6. Avoid anachronistic instruments — no electric guitars in medieval fantasy, no orchestral scores in cyberpunk

**Genre appropriateness:**
- High Fantasy: orchestral, Celtic, choral, harp, flute
- Dark Fantasy: minor keys, organ, deep strings, choir
- Cyberpunk: synth, electronic, industrial
- Gothic Horror: organ, piano, atmospheric, dissonant strings
- Modern: whatever fits the specific scene mood

## TEXT-TO-SPEECH (TTS)
If TTS is enabled in the user's AI settings, you can generate voiceover audio for scenes using the \`set_scene_voiceover\` command.
The TTS service uses Google Gemini and produces natural-sounding narration. Consider generating voiceover for key dramatic scenes.

## IMPORTANT RULES
- Always check [Current Game State] for existing IDs before referencing them
- Do NOT invent IDs — use IDs from state or from command results
- When connecting scenes, use the choice ID as sourceHandle
- Image generation takes ~10-30 seconds — write vivid, detailed prompts
- When creating a scene with choices AND connecting them: create the scene first (to get choice IDs), then connect in the same response or the next iteration
- If a command fails, READ the error message and suggestion carefully before retrying
- When your task is fully complete, respond with a summary and NO commands`;

  // ─── MODE-BASED COMMAND FILTERING ─────────────────────────────────
  // In co-write mode, the AI should ONLY see co-write-relevant commands.
  // Showing game-mode commands (create_scene, create_modifier, etc.) in
  // the reference causes the AI to use them despite preamble prohibitions.
  // In game mode, co-write commands are excluded since they don't apply.

  /** Groups allowed in co-write mode (full group inclusion) */
  const COWRITE_GROUPS = new Set(['cowrite', 'entities']);

  /** Individual commands allowed in co-write mode from other groups */
  const COWRITE_EXTRA_COMMANDS = new Set([
    'update_project_info', 'update_notes',           // project group
    'get_entity_details', 'list_entities',            // query group
    'list_variables',                                 // query group (for context)
    'search_music', 'get_music_track', 'list_music_genres', // music group — search & browse tracks
  ]);

  // Filter commands based on project mode
  const filteredCommands = COMMANDS.filter((cmd) => {
    if (isCowrite) {
      // Co-write mode: only co-write groups + specifically allowed commands
      return COWRITE_GROUPS.has(cmd.group) || COWRITE_EXTRA_COMMANDS.has(cmd.name);
    } else {
      // Game mode: everything EXCEPT co-write-only commands
      return cmd.group !== 'cowrite';
    }
  });

  // Group filtered commands for the reference section
  const groups: Record<string, CommandMeta[]> = {};
  for (const cmd of filteredCommands) {
    if (!groups[cmd.group]) groups[cmd.group] = [];
    groups[cmd.group].push(cmd);
  }

  let reference = '\n\n## COMMAND REFERENCE\n';

  for (const [groupKey, cmds] of Object.entries(groups)) {
    reference += `\n### ${GROUP_TITLES[groupKey] || groupKey}\n\n`;
    for (const cmd of cmds) {
      // Command name + description
      reference += `**${cmd.name}** — ${cmd.description}\n`;

      // Params as compact format
      const paramParts = cmd.params.map((p) => {
        let s = `${p.name}: ${p.type}`;
        if (!p.required) s += ' (optional)';
        if (p.validValues) s += ` [${p.validValues.join('|')}]`;
        if (p.defaultValue !== undefined) s += ` default=${p.defaultValue}`;
        return s;
      });
      if (paramParts.length > 0) {
        reference += `Params: {${paramParts.join(', ')}}\n`;
      } else {
        reference += `Params: (none)\n`;
      }
      reference += `Returns: ${cmd.returns}\n`;
      if (cmd.notes) reference += `Note: ${cmd.notes}\n`;
      reference += '\n';
    }
  }

  return preamble + reference;
}
