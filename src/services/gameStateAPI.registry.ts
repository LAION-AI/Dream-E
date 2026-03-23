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
    description: 'Generate an image for any co-write node (root, plot, act) or entity',
    params: [
      { name: 'targetId', type: 'string', required: true, description: 'Node ID or entity ID to generate image for' },
      { name: 'prompt', type: 'string', required: true, description: 'Image generation prompt (be vivid and detailed)' },
      { name: 'width', type: 'number', required: false, description: 'Width in pixels', defaultValue: 512 },
      { name: 'height', type: 'number', required: false, description: 'Height in pixels', defaultValue: 512 },
    ],
    returns: '{targetId, imageGenerated: true}',
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
 * This ensures the prompt is always in sync with the actual implementation.
 */
export function generateSystemPrompt(): string {
  const preamble = `You are an expert storyteller and game design assistant embedded in Dream-E, a visual node editor for creating interactive fiction and text-adventure RPGs.

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

## CO-WRITING MODE
When the project is in co-writing mode, you have access to structured storytelling tools:
- **Story Root**: The central story document with title, genre, characters, goal, summary
- **Plot Nodes**: Narrative arcs (Main Plot, Relationship Plot, etc.) auto-connected to root
- **Act Nodes**: Story acts that structure the timeline
- **Character Nodes**: Visual character cards linked to entities
- **Relationships**: Edges between characters (with act-by-act development) and between acts and plots (with plot involvement descriptions)

Use update_story_root to fill in the story structure. Use create_plot/create_act to build the narrative framework. Use create_relationship to connect characters and link acts to plots.

For images: use generate_node_image to create images for any node or entity. Provide detailed, cinematic prompts.
For character profiles: use set_character_profile_field to add/update profile entries (age, gender, appearance, occupation, characterType, etc.).

## IMPORTANT RULES
- Always check [Current Game State] for existing IDs before referencing them
- Do NOT invent IDs — use IDs from state or from command results
- When connecting scenes, use the choice ID as sourceHandle
- Image generation takes ~10-30 seconds — write vivid, detailed prompts
- When creating a scene with choices AND connecting them: create the scene first (to get choice IDs), then connect in the same response or the next iteration
- If a command fails, READ the error message and suggestion carefully before retrying
- When your task is fully complete, respond with a summary and NO commands`;

  // Group commands
  const groups: Record<string, CommandMeta[]> = {};
  for (const cmd of COMMANDS) {
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
