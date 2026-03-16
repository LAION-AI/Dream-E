/**
 * =============================================================================
 * GAME STATE API — Core Command Handlers
 * =============================================================================
 *
 * 38 commands for complete control of the Dream-E game state.
 * Every handler validates inputs, includes helpful error suggestions,
 * and returns structured results.
 *
 * Architecture:
 *   handlers map  →  executeCommand(action, params)  →  {name, result JSON}
 *   validation helpers throw ValidationError with suggestion text
 *   exposed on window.storyAPI for browser console access
 *
 * =============================================================================
 */

import { useProjectStore } from '@/stores/useProjectStore';
import { generateId } from '@/utils/idGenerator';
import type { Project, StoryNode, Entity, Variable, StoryEdge } from '@/types';
import type { APIResult } from './gameStateAPI.types';
import { ValidationError } from './gameStateAPI.types';
import { COMMANDS } from './gameStateAPI.registry';
import { useImageGenStore } from '@/stores/useImageGenStore';
import { blobUrlToBase64 } from '@/utils/blobCache';

// =============================================================================
// TYPES
// =============================================================================

type StoreAPI = ReturnType<typeof useProjectStore.getState>;
type CommandHandler = (
  params: Record<string, unknown>,
  store: StoreAPI,
  project: Project
) => Promise<APIResult> | APIResult;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

function requireString(params: Record<string, unknown>, key: string): string {
  const val = params[key];
  if (typeof val !== 'string' || val.trim() === '') {
    throw new ValidationError(
      `Missing required parameter '${key}' (expected a non-empty string).`
    );
  }
  return val;
}

function assertScene(project: Project, sceneId: string): StoryNode {
  const node = project.nodes.find((n) => n.id === sceneId);
  if (!node) {
    const available = project.nodes
      .filter((n) => n.type === 'scene')
      .map((n) => `${n.id} ("${n.label}")`)
      .join(', ');
    throw new ValidationError(
      `Scene not found: ${sceneId}`,
      available ? `Available scenes: ${available}` : 'No scenes exist yet. Use create_scene first.'
    );
  }
  if (node.type !== 'scene') {
    throw new ValidationError(`Node ${sceneId} is a ${node.type}, not a scene.`);
  }
  return node;
}

function assertNode(project: Project, nodeId: string): StoryNode {
  const node = project.nodes.find((n) => n.id === nodeId);
  if (!node) {
    const available = project.nodes.map((n) => `${n.id} ("${n.label}")`).join(', ');
    throw new ValidationError(
      `Node not found: ${nodeId}`,
      available ? `Available nodes: ${available}` : 'No nodes exist.'
    );
  }
  return node;
}

function assertEntity(project: Project, entityId: string): Entity {
  const entity = (project.entities || []).find((e) => e.id === entityId);
  if (!entity) {
    const available = (project.entities || [])
      .map((e) => `${e.id} (${e.category}: "${e.name}")`)
      .join(', ');
    throw new ValidationError(
      `Entity not found: ${entityId}`,
      available ? `Available entities: ${available}` : 'No entities exist. Use create_entity first.'
    );
  }
  return entity;
}

function assertVariable(project: Project, varId: string): Variable {
  const v = (project.globalVariables || []).find((v) => v.id === varId);
  if (!v) {
    const available = (project.globalVariables || [])
      .map((v) => `${v.id} ("${v.name}")`)
      .join(', ');
    throw new ValidationError(
      `Variable not found: ${varId}`,
      available ? `Available variables: ${available}` : 'No variables exist. Use create_variable first.'
    );
  }
  return v;
}

function assertChoice(node: StoryNode, choiceId: string): { id: string; label: string } {
  const data = node.data as any;
  const choices = (data.choices || []) as { id: string; label: string }[];
  const choice = choices.find((c) => c.id === choiceId);
  if (!choice) {
    const available = choices.map((c) => `${c.id} ("${c.label}")`).join(', ');
    throw new ValidationError(
      `Choice not found: ${choiceId} in scene ${node.id}`,
      available ? `Available choices: ${available}` : 'Scene has no choices. Use add_choice first.'
    );
  }
  return choice;
}

const VALID_CATEGORIES = ['character', 'location', 'object', 'concept'];
const VALID_VAR_TYPES = ['integer', 'float', 'boolean', 'string', 'collection'];
const VALID_OPERATORS = ['>', '<', '=', '!=', '>=', '<=', 'contains'];
const VALID_THEMES = ['fantasy', 'cyberpunk', 'modern', 'custom'];

// =============================================================================
// COMMAND HANDLERS
// =============================================================================

// ─── SCENES ──────────────────────────────────────────────────────────

const handleCreateScene: CommandHandler = (params, store, project) => {
  const label = requireString(params, 'label');
  const storyText = requireString(params, 'storyText');
  const nodeId = generateId('node');
  const sceneCount = project.nodes.filter((n) => n.type === 'scene').length;
  const choices = ((params.choices as { label: string }[]) || []).map((c) => ({
    id: generateId('choice'),
    label: c.label,
  }));
  store.addNode({
    id: nodeId,
    type: 'scene',
    position: { x: 300 + sceneCount * 50, y: 200 + sceneCount * 50 },
    label,
    data: {
      storyText,
      speakerName: (params.speakerName as string) || undefined,
      choices,
      musicKeepPlaying: true,
      voiceoverAutoplay: true,
    },
  } as any);
  return { success: true, nodeId, choiceIds: choices.map((c) => c.id) };
};

const handleUpdateScene: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const node = assertScene(project, sceneId);
  const updates: Record<string, unknown> = {};
  const dataUpdates: Record<string, unknown> = {};
  if (params.label !== undefined) updates.label = params.label;
  if (params.storyText !== undefined) dataUpdates.storyText = params.storyText;
  if (params.speakerName !== undefined) dataUpdates.speakerName = params.speakerName;
  if (Object.keys(dataUpdates).length > 0) {
    updates.data = { ...(node.data as any), ...dataUpdates };
  }
  store.updateNode(sceneId, updates as any);
  return { success: true, sceneId };
};

const handleDeleteScene: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  assertScene(project, sceneId);
  const connectedEdges = project.edges.filter(
    (e) => e.source === sceneId || e.target === sceneId
  );
  for (const edge of connectedEdges) store.deleteEdge(edge.id);
  store.deleteNode(sceneId);
  return { success: true, sceneId, edgesRemoved: connectedEdges.length };
};

const handleAddChoice: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const label = requireString(params, 'label');
  const node = assertScene(project, sceneId);
  const choiceId = generateId('choice');
  const data = node.data as any;
  const choices = [...(data.choices || []), { id: choiceId, label }];
  store.updateNode(sceneId, { data: { ...data, choices } } as any);
  return { success: true, sceneId, choiceId };
};

const handleUpdateChoice: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const choiceId = requireString(params, 'choiceId');
  const label = requireString(params, 'label');
  const node = assertScene(project, sceneId);
  assertChoice(node, choiceId);
  const data = node.data as any;
  const choices = (data.choices || []).map((c: any) =>
    c.id === choiceId ? { ...c, label } : c
  );
  store.updateNode(sceneId, { data: { ...data, choices } } as any);
  return { success: true };
};

const handleDeleteChoice: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const choiceId = requireString(params, 'choiceId');
  const node = assertScene(project, sceneId);
  assertChoice(node, choiceId);
  const data = node.data as any;
  const choices = (data.choices || []).filter((c: any) => c.id !== choiceId);
  store.updateNode(sceneId, { data: { ...data, choices } } as any);
  const edge = project.edges.find((e) => e.source === sceneId && e.sourceHandle === choiceId);
  if (edge) store.deleteEdge(edge.id);
  return { success: true, edgeRemoved: !!edge };
};

const handleSetChoiceCondition: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const choiceId = requireString(params, 'choiceId');
  const variableName = requireString(params, 'variableName');
  const operator = requireString(params, 'operator');
  if (!VALID_OPERATORS.includes(operator)) {
    throw new ValidationError(`Invalid operator: ${operator}`, `Valid: ${VALID_OPERATORS.join(', ')}`);
  }
  const node = assertScene(project, sceneId);
  assertChoice(node, choiceId);
  const data = node.data as any;
  const choices = (data.choices || []).map((c: any) => {
    if (c.id !== choiceId) return c;
    return {
      ...c,
      condition: { variableA: variableName, operator, valueB: params.value, useVariable: false },
      showWhenLocked: params.showWhenLocked ?? c.showWhenLocked,
      lockedTooltip: params.lockedTooltip ?? c.lockedTooltip,
    };
  });
  store.updateNode(sceneId, { data: { ...data, choices } } as any);
  return { success: true };
};

const handleRemoveChoiceCondition: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const choiceId = requireString(params, 'choiceId');
  const node = assertScene(project, sceneId);
  assertChoice(node, choiceId);
  const data = node.data as any;
  const choices = (data.choices || []).map((c: any) => {
    if (c.id !== choiceId) return c;
    const { condition, showWhenLocked, lockedTooltip, ...rest } = c;
    return rest;
  });
  store.updateNode(sceneId, { data: { ...data, choices } } as any);
  return { success: true };
};

// ─── CONNECTIONS ─────────────────────────────────────────────────────

const handleConnectNodes: CommandHandler = (params, store, project) => {
  const srcId = requireString(params, 'sourceId');
  const tgtId = requireString(params, 'targetId');
  let srcHandle = (params.sourceHandle as string) || undefined;

  assertNode(project, srcId);
  assertNode(project, tgtId);

  const srcNode = project.nodes.find((n) => n.id === srcId)!;
  if (srcNode.type === 'scene' && !srcHandle) {
    const choices = ((srcNode.data as any).choices as { id: string }[]) || [];
    const usedHandles = new Set(project.edges.filter((e) => e.source === srcId).map((e) => e.sourceHandle));
    const freeChoice = choices.find((c) => !usedHandles.has(c.id));
    if (freeChoice) {
      srcHandle = freeChoice.id;
    } else if (choices.length > 0) {
      throw new ValidationError(
        'All choices are already connected.',
        'Use disconnect_nodes or reconnect_edge to change existing connections, or add_choice to create a new choice.'
      );
    }
  }

  const dup = project.edges.find((e) => e.source === srcId && e.sourceHandle === srcHandle);
  if (dup) {
    throw new ValidationError(
      `Already connected: edge ${dup.id} goes from ${srcId}[${srcHandle}] → ${dup.target}.`,
      'Use reconnect_edge to change the target, or disconnect_nodes to remove.'
    );
  }

  const edgeId = generateId('edge');
  store.addEdge({ id: edgeId, source: srcId, target: tgtId, sourceHandle: srcHandle } as any);
  return { success: true, edgeId, sourceHandle: srcHandle };
};

const handleDisconnectNodes: CommandHandler = (params, store, project) => {
  let edge: StoryEdge | undefined;
  if (params.edgeId) {
    edge = project.edges.find((e) => e.id === params.edgeId);
  } else if (params.sourceId) {
    const srcId = params.sourceId as string;
    const srcHandle = params.sourceHandle as string | undefined;
    edge = srcHandle
      ? project.edges.find((e) => e.source === srcId && e.sourceHandle === srcHandle)
      : project.edges.find((e) => e.source === srcId);
  }
  if (!edge) {
    const available = project.edges.map((e) =>
      `${e.id}: ${e.source}[${e.sourceHandle || 'default'}] → ${e.target}`
    ).join('; ');
    throw new ValidationError(
      'Edge not found.',
      available ? `Available edges: ${available}` : 'No edges exist.'
    );
  }
  store.deleteEdge(edge.id);
  return { success: true, removedEdgeId: edge.id };
};

const handleReconnectEdge: CommandHandler = (params, store, project) => {
  const srcId = requireString(params, 'sourceId');
  const newTarget = requireString(params, 'newTargetId');
  const srcHandle = (params.sourceHandle as string) || undefined;

  assertNode(project, newTarget);

  let existing: StoryEdge | undefined;
  if (srcHandle) {
    existing = project.edges.find((e) => e.source === srcId && e.sourceHandle === srcHandle);
  } else {
    existing = project.edges.find((e) => e.source === srcId);
  }

  if (existing) store.deleteEdge(existing.id);

  const edgeId = generateId('edge');
  const finalHandle = srcHandle || existing?.sourceHandle;
  store.addEdge({ id: edgeId, source: srcId, target: newTarget, sourceHandle: finalHandle } as any);
  return { success: true, oldEdgeId: existing?.id || null, newEdgeId: edgeId, sourceHandle: finalHandle };
};

// ─── ENTITIES ────────────────────────────────────────────────────────

const handleCreateEntity: CommandHandler = (params, store) => {
  const category = requireString(params, 'category');
  if (!VALID_CATEGORIES.includes(category)) {
    throw new ValidationError(`Invalid category: ${category}`, `Valid: ${VALID_CATEGORIES.join(', ')}`);
  }
  const name = requireString(params, 'name');
  const description = requireString(params, 'description');
  const entityId = generateId('entity');
  const now = Date.now();
  const profile = (params.profile && typeof params.profile === 'object' && !Array.isArray(params.profile))
    ? params.profile as Record<string, unknown>
    : undefined;
  store.addEntity({
    id: entityId, category: category as any, name, description,
    summary: (params.summary as string) || undefined,
    profile,
    createdAt: now, updatedAt: now,
  });
  return { success: true, entityId };
};

const handleUpdateEntity: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  assertEntity(project, entityId);
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.summary !== undefined) updates.summary = params.summary;
  if (params.category !== undefined) {
    if (!VALID_CATEGORIES.includes(params.category as string)) {
      throw new ValidationError(`Invalid category: ${params.category}`, `Valid: ${VALID_CATEGORIES.join(', ')}`);
    }
    updates.category = params.category;
  }
  store.updateEntity(entityId, updates as any);
  return { success: true, entityId };
};

const handleDeleteEntity: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  const entity = assertEntity(project, entityId);
  const catMap: Record<string, string> = {
    character: 'linkedCharacters', location: 'linkedLocations',
    object: 'linkedObjects', concept: 'linkedConcepts',
  };
  const field = catMap[entity.category];
  let scenesUnlinked = 0;
  if (field) {
    for (const node of project.nodes) {
      const data = node.data as any;
      const linked: string[] = data[field] || [];
      if (linked.includes(entityId)) {
        store.updateNode(node.id, { data: { ...data, [field]: linked.filter((id: string) => id !== entityId) } } as any);
        scenesUnlinked++;
      }
    }
  }
  store.deleteEntity(entityId);
  return { success: true, entityId, scenesUnlinked };
};

const handleLinkEntityToScene: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const entityId = requireString(params, 'entityId');
  const node = assertScene(project, sceneId);
  const entity = assertEntity(project, entityId);
  const catMap: Record<string, string> = {
    character: 'linkedCharacters', location: 'linkedLocations',
    object: 'linkedObjects', concept: 'linkedConcepts',
  };
  const field = catMap[entity.category];
  const data = node.data as any;
  const existing: string[] = data[field] || [];
  if (existing.includes(entityId)) {
    return { success: true, alreadyLinked: true };
  }
  store.updateNode(sceneId, { data: { ...data, [field]: [...existing, entityId] } } as any);
  return { success: true, alreadyLinked: false };
};

const handleUnlinkEntityFromScene: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const entityId = requireString(params, 'entityId');
  const node = assertScene(project, sceneId);
  const entity = assertEntity(project, entityId);
  const catMap: Record<string, string> = {
    character: 'linkedCharacters', location: 'linkedLocations',
    object: 'linkedObjects', concept: 'linkedConcepts',
  };
  const field = catMap[entity.category];
  const data = node.data as any;
  const existing: string[] = data[field] || [];
  store.updateNode(sceneId, { data: { ...data, [field]: existing.filter((id: string) => id !== entityId) } } as any);
  return { success: true };
};

const handleUpdateEntityState: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const entityId = requireString(params, 'entityId');
  const stateText = requireString(params, 'stateText');
  assertScene(project, sceneId);
  assertEntity(project, entityId);
  store.updateEntityState(sceneId, entityId, stateText);
  return { success: true };
};

// ─── ENTITY PROFILE (Structured JSON + Patch) ───────────────────────

/**
 * Set or fully replace the structured profile dictionary on an entity.
 * Profile is a flexible JSON object — the agent defines the keys.
 */
const handleSetEntityProfile: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  assertEntity(project, entityId);
  const profile = params.profile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new ValidationError('profile must be a JSON object (dictionary).');
  }
  store.updateEntity(entityId, { profile: profile as Record<string, unknown> } as any);
  return { success: true, entityId };
};

/**
 * Get the full profile dictionary of an entity.
 */
const handleGetEntityProfile: CommandHandler = (params, _store, project) => {
  const entityId = requireString(params, 'entityId');
  const entity = assertEntity(project, entityId);
  return {
    success: true,
    entityId,
    name: entity.name,
    category: entity.category,
    profile: (entity as any).profile || {},
  };
};

/**
 * Apply JSON Patch operations (RFC 6902 subset) to an entity's profile.
 * Supported ops: "add", "replace", "remove".
 * Path format: "/key" or "/key/subkey" (slash-separated).
 *
 * Example operations:
 *   [
 *     {"op": "replace", "path": "/appearance", "value": "Tall warrior with a scar"},
 *     {"op": "add", "path": "/relationships/entity_xyz", "value": "sworn enemy"},
 *     {"op": "remove", "path": "/inventory/2"}
 *   ]
 */
const handlePatchEntityProfile: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  const entity = assertEntity(project, entityId);
  const operations = params.operations;

  if (!Array.isArray(operations) || operations.length === 0) {
    throw new ValidationError(
      'operations must be a non-empty array of patch operations.',
      'Format: [{"op": "add"|"replace"|"remove", "path": "/key", "value": ...}]'
    );
  }

  // Deep clone the existing profile so we can mutate safely
  const profile: Record<string, unknown> = JSON.parse(
    JSON.stringify((entity as any).profile || {})
  );

  const VALID_OPS = ['add', 'replace', 'remove'];
  const applied: string[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i] as { op: string; path: string; value?: unknown };
    if (!op.op || !op.path) {
      throw new ValidationError(
        `Operation [${i}]: missing "op" or "path".`,
        'Each operation needs: {"op": "add"|"replace"|"remove", "path": "/key"}'
      );
    }
    if (!VALID_OPS.includes(op.op)) {
      throw new ValidationError(
        `Operation [${i}]: invalid op "${op.op}".`,
        `Valid ops: ${VALID_OPS.join(', ')}`
      );
    }

    // Parse the path: "/foo/bar/baz" → ["foo", "bar", "baz"]
    const pathParts = op.path.replace(/^\//, '').split('/');
    if (pathParts.length === 0 || pathParts[0] === '') {
      throw new ValidationError(`Operation [${i}]: invalid path "${op.path}".`);
    }

    // Navigate to the parent of the target
    let target: any = profile;
    for (let j = 0; j < pathParts.length - 1; j++) {
      const key = pathParts[j];
      if (target[key] === undefined || target[key] === null) {
        if (op.op === 'remove') break; // parent doesn't exist, nothing to remove
        // Auto-create intermediate objects for add/replace
        target[key] = {};
      }
      target = target[key];
      if (typeof target !== 'object') {
        throw new ValidationError(
          `Operation [${i}]: path segment "${key}" is not an object, cannot traverse.`
        );
      }
    }

    const finalKey = pathParts[pathParts.length - 1];

    if (op.op === 'add' || op.op === 'replace') {
      if (op.value === undefined) {
        throw new ValidationError(`Operation [${i}]: "add"/"replace" requires a "value".`);
      }
      if (Array.isArray(target)) {
        const idx = parseInt(finalKey, 10);
        if (op.op === 'add') {
          target.splice(isNaN(idx) ? target.length : idx, 0, op.value);
        } else {
          if (isNaN(idx) || idx < 0 || idx >= target.length) {
            throw new ValidationError(`Operation [${i}]: array index ${finalKey} out of bounds.`);
          }
          target[idx] = op.value;
        }
      } else {
        target[finalKey] = op.value;
      }
      applied.push(`${op.op} ${op.path}`);
    } else if (op.op === 'remove') {
      if (Array.isArray(target)) {
        const idx = parseInt(finalKey, 10);
        if (!isNaN(idx) && idx >= 0 && idx < target.length) {
          target.splice(idx, 1);
        }
      } else if (typeof target === 'object' && target !== null) {
        delete target[finalKey];
      }
      applied.push(`remove ${op.path}`);
    }
  }

  store.updateEntity(entityId, { profile } as any);
  return { success: true, entityId, applied, profileKeys: Object.keys(profile) };
};

// ─── VARIABLES ───────────────────────────────────────────────────────

const handleCreateVariable: CommandHandler = (params, store, project) => {
  const name = requireString(params, 'name');
  const type = requireString(params, 'type');
  if (!VALID_VAR_TYPES.includes(type)) {
    throw new ValidationError(`Invalid type: ${type}`, `Valid: ${VALID_VAR_TYPES.join(', ')}`);
  }
  // Check name uniqueness
  const existing = (project.globalVariables || []).find((v) => v.name === name);
  if (existing) {
    throw new ValidationError(
      `Variable "${name}" already exists (${existing.id}).`,
      'Use update_variable to change it, or choose a different name.'
    );
  }
  const defaults: Record<string, unknown> = {
    integer: 0, float: 0.0, boolean: false, string: '', collection: [],
  };
  const varId = generateId('var');
  store.addVariable({
    id: varId, name, type: type as any,
    defaultValue: params.defaultValue ?? defaults[type] ?? 0,
    description: (params.description as string) || '',
  } as any);
  return { success: true, variableId: varId };
};

const handleUpdateVariable: CommandHandler = (params, store, project) => {
  const varId = requireString(params, 'variableId');
  assertVariable(project, varId);
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.defaultValue !== undefined) updates.defaultValue = params.defaultValue;
  if (params.description !== undefined) updates.description = params.description;
  store.updateVariable(varId, updates as any);
  return { success: true };
};

const handleDeleteVariable: CommandHandler = (params, store, project) => {
  const varId = requireString(params, 'variableId');
  assertVariable(project, varId);
  store.deleteVariable(varId);
  return { success: true, variableId: varId };
};

// ─── MEDIA ───────────────────────────────────────────────────────────

/** Get current image gen settings to include in API requests */
function getImageGenSettings() {
  const s = useImageGenStore.getState();
  return {
    provider: s.provider, apiKey: s.apiKey, model: s.model, endpoint: s.endpoint,
    googleApiKey: s.googleApiKey, geminiImageModel: s.geminiImageModel,
  };
}

/**
 * Collect reference images from entities linked to a scene.
 * Used by Gemini image gen for visual consistency (character portraits, location art).
 */
/**
 * Collects reference images from entities linked to a scene.
 * Resolves blob URLs back to base64 data URLs (after memory optimization,
 * entity.referenceImage may be a blob URL instead of a data URL).
 */
async function getSceneReferenceImages(project: Project, sceneId: string): Promise<string[]> {
  const images: string[] = [];
  const node = project.nodes.find(n => n.id === sceneId);
  if (!node) return images;
  const d = node.data as any;
  const linkedIds = [
    ...((d.linkedCharacters as string[]) || []),
    ...((d.linkedLocations as string[]) || []),
    ...((d.linkedObjects as string[]) || []),
    ...((d.linkedConcepts as string[]) || []),
  ];
  for (const eid of linkedIds) {
    const entity = project.entities?.find(e => e.id === eid);
    if (entity?.referenceImage) {
      if (entity.referenceImage.startsWith('data:')) {
        images.push(entity.referenceImage);
      } else if (entity.referenceImage.startsWith('blob:')) {
        const base64 = await blobUrlToBase64(entity.referenceImage);
        if (base64) images.push(base64);
      }
    }
  }
  return images;
}

const handleGenerateSceneImage: CommandHandler = async (params, _store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const rawPrompt = requireString(params, 'prompt');
  assertScene(project, sceneId);

  // Append user's default image style from AI Settings
  const styleTag = useImageGenStore.getState().defaultImageStyle?.trim();
  const prompt = styleTag ? `${rawPrompt}. Style: ${styleTag}` : rawPrompt;

  // For Gemini, include entity reference images for visual consistency
  const settings = getImageGenSettings();
  const referenceImages = settings.provider === 'gemini'
    ? await getSceneReferenceImages(project, sceneId)
    : [];

  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt, width: (params.width as number) || 1280, height: (params.height as number) || 720,
      ...settings, referenceImages,
    }),
  });
  const data = await res.json();
  if (data.error) throw new ValidationError(data.error);
  // Re-fetch store after async wait (state may have changed)
  const freshStore = useProjectStore.getState();
  const freshNode = freshStore.currentProject?.nodes.find((n) => n.id === sceneId);
  if (freshNode) {
    freshStore.updateNode(sceneId, { data: { ...(freshNode.data as any), backgroundImage: data.dataUrl } } as any);
  }
  return { success: true, sceneId, message: 'Image generated and set as scene background' };
};

const handleGenerateEntityImage: CommandHandler = async (params, _store, project) => {
  const entityId = requireString(params, 'entityId');
  const rawPrompt = requireString(params, 'prompt');
  assertEntity(project, entityId);

  const styleTag = useImageGenStore.getState().defaultImageStyle?.trim();
  const prompt = styleTag ? `${rawPrompt}. Style: ${styleTag}` : rawPrompt;

  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt, width: (params.width as number) || 512, height: (params.height as number) || 512,
      ...getImageGenSettings(),
    }),
  });
  const data = await res.json();
  if (data.error) throw new ValidationError(data.error);
  const freshStore = useProjectStore.getState();
  freshStore.updateEntity(entityId, { referenceImage: data.dataUrl } as any);
  return { success: true, entityId, message: 'Image generated and set as entity reference image' };
};

const handleSetSceneImage: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const imageUrl = requireString(params, 'imageUrl');
  const node = assertScene(project, sceneId);
  store.updateNode(sceneId, { data: { ...(node.data as any), backgroundImage: imageUrl } } as any);
  return { success: true, sceneId };
};

const handleRemoveSceneImage: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const node = assertScene(project, sceneId);
  const data = node.data as any;
  const hadImage = !!data.backgroundImage;
  store.updateNode(sceneId, { data: { ...data, backgroundImage: undefined } } as any);
  return { success: true, sceneId, hadImage };
};

const handleSetEntityImage: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  const imageUrl = requireString(params, 'imageUrl');
  assertEntity(project, entityId);
  store.updateEntity(entityId, { referenceImage: imageUrl } as any);
  return { success: true, entityId };
};

const handleRemoveEntityImage: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  const entity = assertEntity(project, entityId);
  const hadImage = !!entity.referenceImage;
  store.updateEntity(entityId, { referenceImage: undefined } as any);
  return { success: true, entityId, hadImage };
};

const handleSetSceneMusic: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const musicUrl = requireString(params, 'musicUrl');
  const node = assertScene(project, sceneId);
  const data = node.data as any;
  store.updateNode(sceneId, { data: {
    ...data,
    backgroundMusic: musicUrl,
    musicKeepPlaying: params.keepPlaying !== undefined ? !!params.keepPlaying : data.musicKeepPlaying,
  } } as any);
  return { success: true, sceneId };
};

const handleRemoveSceneMusic: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const node = assertScene(project, sceneId);
  const data = node.data as any;
  const hadMusic = !!data.backgroundMusic;
  store.updateNode(sceneId, { data: { ...data, backgroundMusic: undefined, musicKeepPlaying: false } } as any);
  return { success: true, sceneId, hadMusic };
};

const handleSetSceneVoiceover: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const audioUrl = requireString(params, 'audioUrl');
  const node = assertScene(project, sceneId);
  const data = node.data as any;
  store.updateNode(sceneId, { data: {
    ...data,
    voiceoverAudio: audioUrl,
    voiceoverAutoplay: params.autoplay !== undefined ? !!params.autoplay : data.voiceoverAutoplay,
  } } as any);
  return { success: true, sceneId };
};

const handleRemoveSceneVoiceover: CommandHandler = (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const node = assertScene(project, sceneId);
  const data = node.data as any;
  const hadVoiceover = !!data.voiceoverAudio;
  store.updateNode(sceneId, { data: { ...data, voiceoverAudio: undefined, voiceoverAutoplay: false } } as any);
  return { success: true, sceneId, hadVoiceover };
};

// ─── ENTITY MEDIA ────────────────────────────────────────────────────

const handleSetEntityVoice: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  assertEntity(project, entityId);
  const voiceUrl = requireString(params, 'voiceUrl');
  store.updateEntity(entityId, { referenceVoice: voiceUrl } as any);
  return { success: true, entityId };
};

const handleRemoveEntityVoice: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  const entity = assertEntity(project, entityId);
  const hadVoice = !!entity.referenceVoice;
  store.updateEntity(entityId, { referenceVoice: undefined } as any);
  return { success: true, entityId, hadVoice };
};

const handleSetEntityMusic: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  assertEntity(project, entityId);
  const musicUrl = requireString(params, 'musicUrl');
  const updates: Record<string, unknown> = { defaultMusic: musicUrl };
  if (params.fadeIn !== undefined) updates.musicFadeIn = params.fadeIn as number;
  if (params.fadeOut !== undefined) updates.musicFadeOut = params.fadeOut as number;
  store.updateEntity(entityId, updates as any);
  return { success: true, entityId };
};

const handleRemoveEntityMusic: CommandHandler = (params, store, project) => {
  const entityId = requireString(params, 'entityId');
  const entity = assertEntity(project, entityId);
  const hadMusic = !!entity.defaultMusic;
  store.updateEntity(entityId, {
    defaultMusic: undefined, musicFadeIn: undefined, musicFadeOut: undefined,
  } as any);
  return { success: true, entityId, hadMusic };
};

// ─── MODIFIER NODES ──────────────────────────────────────────────────

const VALID_MODIFIER_MODES = ['math', 'set', 'random'];
const VALID_MATH_OPS = ['add', 'subtract', 'multiply', 'divide'];

const handleCreateModifier: CommandHandler = (params, store, project) => {
  const label = requireString(params, 'label');
  const mode = requireString(params, 'mode');
  if (!VALID_MODIFIER_MODES.includes(mode)) {
    throw new ValidationError(`Invalid mode: ${mode}`, `Valid: ${VALID_MODIFIER_MODES.join(', ')}`);
  }
  const targetVariable = requireString(params, 'targetVariable');
  const nodeId = generateId('node');
  const nodeCount = project.nodes.length;
  const data: Record<string, unknown> = { mode, targetVariable };
  if (mode === 'math') {
    if (params.mathOperation && !VALID_MATH_OPS.includes(params.mathOperation as string)) {
      throw new ValidationError(`Invalid mathOperation: ${params.mathOperation}`, `Valid: ${VALID_MATH_OPS.join(', ')}`);
    }
    data.mathOperation = params.mathOperation || 'add';
    data.mathValue = params.mathValue ?? 0;
    data.mathValueIsVariable = !!params.mathValueIsVariable;
  } else if (mode === 'set') {
    data.setValue = params.setValue ?? '';
    data.setValueIsVariable = !!params.setValueIsVariable;
  } else if (mode === 'random') {
    data.randomMin = (params.randomMin as number) ?? 1;
    data.randomMax = (params.randomMax as number) ?? 100;
  }
  store.addNode({
    id: nodeId, type: 'modifier',
    position: { x: 400 + nodeCount * 40, y: 300 + nodeCount * 40 },
    label, data,
  } as any);
  return { success: true, nodeId };
};

const handleUpdateModifier: CommandHandler = (params, store, project) => {
  const modifierId = requireString(params, 'modifierId');
  const node = project.nodes.find((n) => n.id === modifierId);
  if (!node || node.type !== 'modifier') {
    throw new ValidationError(`Modifier not found: ${modifierId}`);
  }
  const updates: Record<string, unknown> = {};
  const dataUpdates: Record<string, unknown> = {};
  if (params.label !== undefined) updates.label = params.label;
  if (params.mode !== undefined) {
    if (!VALID_MODIFIER_MODES.includes(params.mode as string)) {
      throw new ValidationError(`Invalid mode: ${params.mode}`, `Valid: ${VALID_MODIFIER_MODES.join(', ')}`);
    }
    dataUpdates.mode = params.mode;
  }
  if (params.targetVariable !== undefined) dataUpdates.targetVariable = params.targetVariable;
  if (params.mathOperation !== undefined) dataUpdates.mathOperation = params.mathOperation;
  if (params.mathValue !== undefined) dataUpdates.mathValue = params.mathValue;
  if (params.mathValueIsVariable !== undefined) dataUpdates.mathValueIsVariable = params.mathValueIsVariable;
  if (params.setValue !== undefined) dataUpdates.setValue = params.setValue;
  if (params.setValueIsVariable !== undefined) dataUpdates.setValueIsVariable = params.setValueIsVariable;
  if (params.randomMin !== undefined) dataUpdates.randomMin = params.randomMin;
  if (params.randomMax !== undefined) dataUpdates.randomMax = params.randomMax;
  if (Object.keys(dataUpdates).length > 0) {
    updates.data = { ...(node.data as any), ...dataUpdates };
  }
  store.updateNode(modifierId, updates as any);
  return { success: true, modifierId };
};

const handleDeleteModifier: CommandHandler = (params, store, project) => {
  const modifierId = requireString(params, 'modifierId');
  const node = project.nodes.find((n) => n.id === modifierId);
  if (!node || node.type !== 'modifier') {
    throw new ValidationError(`Modifier not found: ${modifierId}`);
  }
  const connectedEdges = project.edges.filter(
    (e) => e.source === modifierId || e.target === modifierId
  );
  for (const edge of connectedEdges) store.deleteEdge(edge.id);
  store.deleteNode(modifierId);
  return { success: true, modifierId, edgesRemoved: connectedEdges.length };
};

// ─── BRANCH (CHOICE) NODES ──────────────────────────────────────────

const handleCreateBranch: CommandHandler = (params, store, project) => {
  const label = requireString(params, 'label');
  const variableName = requireString(params, 'variableName');
  const operator = requireString(params, 'operator');
  if (!VALID_OPERATORS.includes(operator)) {
    throw new ValidationError(`Invalid operator: ${operator}`, `Valid: ${VALID_OPERATORS.join(', ')}`);
  }
  const nodeId = generateId('node');
  const nodeCount = project.nodes.length;
  store.addNode({
    id: nodeId, type: 'choice',
    position: { x: 400 + nodeCount * 40, y: 300 + nodeCount * 40 },
    label,
    data: {
      condition: {
        variableA: variableName, operator,
        valueB: params.value ?? 0,
        useVariable: !!params.useVariable,
      },
    },
  } as any);
  return { success: true, nodeId, outputs: ['success', 'failure'] };
};

const handleUpdateBranch: CommandHandler = (params, store, project) => {
  const branchId = requireString(params, 'branchId');
  const node = project.nodes.find((n) => n.id === branchId);
  if (!node || node.type !== 'choice') {
    throw new ValidationError(`Branch node not found: ${branchId}`);
  }
  const updates: Record<string, unknown> = {};
  if (params.label !== undefined) updates.label = params.label;
  const data = node.data as any;
  const condition = { ...data.condition };
  let condChanged = false;
  if (params.variableName !== undefined) { condition.variableA = params.variableName; condChanged = true; }
  if (params.operator !== undefined) {
    if (!VALID_OPERATORS.includes(params.operator as string)) {
      throw new ValidationError(`Invalid operator: ${params.operator}`, `Valid: ${VALID_OPERATORS.join(', ')}`);
    }
    condition.operator = params.operator; condChanged = true;
  }
  if (params.value !== undefined) { condition.valueB = params.value; condChanged = true; }
  if (params.useVariable !== undefined) { condition.useVariable = params.useVariable; condChanged = true; }
  if (condChanged) updates.data = { ...data, condition };
  store.updateNode(branchId, updates as any);
  return { success: true, branchId };
};

const handleDeleteBranch: CommandHandler = (params, store, project) => {
  const branchId = requireString(params, 'branchId');
  const node = project.nodes.find((n) => n.id === branchId);
  if (!node || node.type !== 'choice') {
    throw new ValidationError(`Branch node not found: ${branchId}`);
  }
  const connectedEdges = project.edges.filter(
    (e) => e.source === branchId || e.target === branchId
  );
  for (const edge of connectedEdges) store.deleteEdge(edge.id);
  store.deleteNode(branchId);
  return { success: true, branchId, edgesRemoved: connectedEdges.length };
};

// ─── COMMENT NODES ───────────────────────────────────────────────────

const handleCreateComment: CommandHandler = (params, store, project) => {
  const label = requireString(params, 'label');
  const text = requireString(params, 'text');
  const nodeId = generateId('node');
  const nodeCount = project.nodes.length;
  store.addNode({
    id: nodeId, type: 'comment',
    position: { x: 400 + nodeCount * 40, y: 300 + nodeCount * 40 },
    label,
    data: { text, color: (params.color as string) || '#ffeb3b' },
  } as any);
  return { success: true, nodeId };
};

const handleUpdateComment: CommandHandler = (params, store, project) => {
  const commentId = requireString(params, 'commentId');
  const node = project.nodes.find((n) => n.id === commentId);
  if (!node || node.type !== 'comment') {
    throw new ValidationError(`Comment node not found: ${commentId}`);
  }
  const updates: Record<string, unknown> = {};
  const dataUpdates: Record<string, unknown> = {};
  if (params.label !== undefined) updates.label = params.label;
  if (params.text !== undefined) dataUpdates.text = params.text;
  if (params.color !== undefined) dataUpdates.color = params.color;
  if (Object.keys(dataUpdates).length > 0) {
    updates.data = { ...(node.data as any), ...dataUpdates };
  }
  store.updateNode(commentId, updates as any);
  return { success: true, commentId };
};

const handleDeleteComment: CommandHandler = (params, store, project) => {
  const commentId = requireString(params, 'commentId');
  const node = project.nodes.find((n) => n.id === commentId);
  if (!node || node.type !== 'comment') {
    throw new ValidationError(`Comment node not found: ${commentId}`);
  }
  store.deleteNode(commentId);
  return { success: true, commentId };
};

// ─── PROJECT ─────────────────────────────────────────────────────────

const handleSetStartNode: CommandHandler = (params, store, project) => {
  const nodeId = requireString(params, 'nodeId');
  const node = assertNode(project, nodeId);
  if (node.type !== 'scene') {
    throw new ValidationError(`Node ${nodeId} is a ${node.type}. Start node must be a scene.`);
  }
  store.updateProjectInfo({ settings: { ...project.settings, startNodeId: nodeId } } as any);
  return { success: true, startNodeId: nodeId };
};

const handleUpdateProjectInfo: CommandHandler = (params, store) => {
  const info: Record<string, unknown> = {};
  if (params.title !== undefined) info.title = params.title;
  if (params.description !== undefined) info.description = params.description;
  if (params.author !== undefined) info.author = params.author;
  if (params.theme !== undefined) {
    if (!VALID_THEMES.includes(params.theme as string)) {
      throw new ValidationError(`Invalid theme: ${params.theme}`, `Valid: ${VALID_THEMES.join(', ')}`);
    }
    info.theme = params.theme;
  }
  store.updateProjectInfo(info as any);
  return { success: true };
};

const handleUpdateNotes: CommandHandler = (params, store) => {
  const notes = requireString(params, 'notes');
  store.updateNotes(notes);
  return { success: true };
};

// ─── QUERY ───────────────────────────────────────────────────────────

const handleGetSceneDetails: CommandHandler = (params, _store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const node = assertScene(project, sceneId);
  const data = node.data as any;
  const outEdges = project.edges.filter((e) => e.source === sceneId);
  const inEdges = project.edges.filter((e) => e.target === sceneId);
  return {
    success: true,
    id: node.id, label: node.label,
    storyText: data.storyText, speakerName: data.speakerName,
    choices: (data.choices || []).map((c: any) => {
      const edge = outEdges.find((e) => e.sourceHandle === c.id);
      return { id: c.id, label: c.label, connectedTo: edge?.target || null, edgeId: edge?.id || null };
    }),
    hasBackgroundImage: !!data.backgroundImage,
    hasBackgroundMusic: !!data.backgroundMusic,
    hasVoiceover: !!data.voiceoverAudio,
    linkedCharacters: data.linkedCharacters || [],
    linkedLocations: data.linkedLocations || [],
    linkedObjects: data.linkedObjects || [],
    linkedConcepts: data.linkedConcepts || [],
    incomingEdges: inEdges.map((e) => ({ edgeId: e.id, from: e.source, handle: e.sourceHandle })),
  };
};

const handleGetEntityDetails: CommandHandler = (params, _store, project) => {
  const entityId = requireString(params, 'entityId');
  const entity = assertEntity(project, entityId);
  const catMap: Record<string, string> = {
    character: 'linkedCharacters', location: 'linkedLocations',
    object: 'linkedObjects', concept: 'linkedConcepts',
  };
  const field = catMap[entity.category];
  const linkedScenes = project.nodes
    .filter((n) => {
      const data = n.data as any;
      return ((data[field] || []) as string[]).includes(entityId);
    })
    .map((n) => ({ nodeId: n.id, label: n.label }));
  return {
    success: true,
    ...entity,
    hasImage: !!entity.referenceImage,
    linkedScenes,
  };
};

const handleListScenes: CommandHandler = (_params, _store, project) => {
  const scenes = project.nodes.filter((n) => n.type === 'scene');
  return {
    success: true,
    scenes: scenes.map((s) => {
      const data = s.data as any;
      const choices = (data.choices || []).map((c: any) => {
        const edge = project.edges.find((e) => e.source === s.id && e.sourceHandle === c.id);
        return { id: c.id, label: c.label, connectedTo: edge?.target || null };
      });
      return {
        id: s.id, label: s.label,
        choiceCount: choices.length,
        choices,
        hasImage: !!data.backgroundImage,
        hasMusic: !!data.backgroundMusic,
        isStart: s.id === project.settings?.startNodeId,
      };
    }),
  };
};

const handleListEntities: CommandHandler = (params, _store, project) => {
  let entities = project.entities || [];
  if (params.category) {
    if (!VALID_CATEGORIES.includes(params.category as string)) {
      throw new ValidationError(`Invalid category: ${params.category}`, `Valid: ${VALID_CATEGORIES.join(', ')}`);
    }
    entities = entities.filter((e) => e.category === params.category);
  }
  return {
    success: true,
    entities: entities.map((e) => ({
      id: e.id, category: e.category, name: e.name,
      hasImage: !!e.referenceImage, summary: e.summary?.slice(0, 100),
    })),
  };
};

const handleListVariables: CommandHandler = (_params, _store, project) => {
  return {
    success: true,
    variables: (project.globalVariables || []).map((v) => ({
      id: v.id, name: v.name, type: v.type,
      defaultValue: v.defaultValue, description: v.description,
    })),
  };
};

// =============================================================================
// MUSIC SEARCH HANDLERS
// =============================================================================

const MUSIC_API_BASE = '/api/music';

const handleSearchMusic: CommandHandler = async (params) => {
  const query = requireString(params, 'query');
  const search_field = (params.search_field as string) || 'situations';
  const top_k = (params.top_k as number) || 5;
  const singing_filter = (params.singing_filter as string) ?? 'no_singing';
  const genre_filter = (params.genre_filter as string) || undefined;

  try {
    const res = await fetch(`${MUSIC_API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, search_field, top_k, singing_filter, genre_filter }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { success: false, error: err.error || `Music search failed: ${res.status}` };
    }
    const data = await res.json();
    // Return results with condensed genre_situations (just genre key → situations array,
    // skip the genre_name to save tokens). This helps the agent pick the best match.
    return {
      success: true,
      query,
      search_field,
      total_results: data.total_results,
      results: data.results.map((r: Record<string, unknown>) => {
        // Condense genre_situations: { genre_key: [situation1, situation2, ...] }
        const gs = r.genre_situations as Record<string, { situations: string[] }> | undefined;
        const condensedSituations: Record<string, string[]> = {};
        if (gs) {
          for (const [key, val] of Object.entries(gs)) {
            condensedSituations[key] = val.situations;
          }
        }
        return {
          row_id: r.row_id,
          title: r.title,
          bm25_score: Math.round((r.bm25_score as number) * 100) / 100,
          evoked_emotions: r.evoked_emotions,
          has_singing: r.has_singing,
          genre_situations: condensedSituations,
        };
      }),
      hint: 'Use assign_music_to_scene with a row_id from these results to set music on a scene.',
    };
  } catch (err) {
    return {
      success: false,
      error: 'RPG Music server not reachable.',
      suggestion: 'Start it with: python rpg-music-server/bm25_server.py',
    };
  }
};

const handleGetMusicTrack: CommandHandler = async (params) => {
  const row_id = params.row_id as number;
  if (row_id === undefined || row_id === null) {
    return { success: false, error: 'Missing required param: row_id' };
  }

  try {
    const res = await fetch(`${MUSIC_API_BASE}/track/${row_id}`);
    if (!res.ok) {
      return { success: false, error: `Track ${row_id} not found` };
    }
    const data = await res.json();
    return { success: true, ...data };
  } catch {
    return {
      success: false,
      error: 'RPG Music server not reachable.',
      suggestion: 'Start it with: python rpg-music-server/bm25_server.py',
    };
  }
};

const handleAssignMusicToScene: CommandHandler = async (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const row_id = params.row_id as number;
  const keepPlaying = params.keepPlaying !== false; // default true

  assertScene(project, sceneId);

  if (row_id === undefined || row_id === null) {
    return { success: false, error: 'Missing required param: row_id' };
  }

  // Fetch track metadata from the music server
  let trackMeta: Record<string, unknown>;
  try {
    const metaRes = await fetch(`${MUSIC_API_BASE}/track/${row_id}`);
    if (!metaRes.ok) {
      return { success: false, error: `Track ${row_id} not found` };
    }
    trackMeta = await metaRes.json();
  } catch {
    return {
      success: false,
      error: 'RPG Music server not reachable.',
      suggestion: 'Start it with: python rpg-music-server/bm25_server.py',
    };
  }

  const audioUrl = trackMeta.audio_url as string;
  if (!audioUrl) {
    return { success: false, error: `Track ${row_id} has no audio URL` };
  }

  // Fetch the audio and convert to data URL
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return { success: false, error: `Failed to fetch audio from ${audioUrl}: HTTP ${audioRes.status}` };
    }

    const blob = await audioRes.blob();
    const arrayBuffer = await blob.arrayBuffer();
    // Convert to base64 in chunks to avoid O(n²) string concatenation crash on large files
    const bytes = new Uint8Array(arrayBuffer);
    const CHUNK = 8192;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(chunks.join(''));
    const mimeType = blob.type || 'audio/mpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Set the music on the scene — build a fresh data object to avoid
    // mutating the Immer-frozen project state (which throws TypeError).
    const node = project.nodes.find((n) => n.id === sceneId)!;
    const data = node.data as Record<string, unknown>;

    store.updateNode(sceneId, { data: {
      ...data,
      backgroundMusic: dataUrl,
      musicKeepPlaying: keepPlaying,
      musicMetadata: {
        row_id,
        title: trackMeta.title,
        duration: trackMeta.duration,
        has_singing: trackMeta.has_singing,
        evoked_emotions: trackMeta.evoked_emotions,
        source: trackMeta.source,
        genre_situations: trackMeta.genre_situations,
      },
    } } as any);

    return {
      success: true,
      sceneId,
      trackTitle: trackMeta.title,
      duration: trackMeta.duration,
      keepPlaying,
      emotions: trackMeta.evoked_emotions,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: `Failed to download audio: ${msg}` };
  }
};

const handleListMusicGenres: CommandHandler = async () => {
  try {
    const res = await fetch(`${MUSIC_API_BASE}/genres`);
    if (!res.ok) {
      return { success: false, error: `Music genres request failed: ${res.status}` };
    }
    const data = await res.json();
    return { success: true, genres: data };
  } catch {
    return {
      success: false,
      error: 'RPG Music server not reachable.',
      suggestion: 'Start it with: python rpg-music-server/bm25_server.py',
    };
  }
};

// =============================================================================
// TTS (TEXT-TO-SPEECH)
// =============================================================================

const handleGenerateSceneVoiceover: CommandHandler = async (params, store, project) => {
  const sceneId = requireString(params, 'sceneId');
  const node = assertScene(project, sceneId);
  const autoplay = params.autoplay !== false; // default true

  // Get TTS settings
  const settings = useImageGenStore.getState();
  if (!settings.tts.enabled) {
    return { success: false, error: 'TTS is not enabled.', suggestion: 'Enable TTS in AI Settings (gear icon in toolbar).' };
  }
  if (!settings.googleApiKey) {
    return { success: false, error: 'Google API key not set.', suggestion: 'Set your Google AI API key in AI Settings.' };
  }

  // Use provided text or fall back to scene storyText
  const text = (params.text as string) || (node.data as any).storyText || '';
  if (!text.trim()) {
    return { success: false, error: 'No text to speak — scene has no storyText and no text param provided.' };
  }

  try {
    const res = await fetch('/api/generate-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        googleApiKey: settings.googleApiKey,
        model: settings.tts.model,
        voice: settings.tts.voice,
        instruction: settings.tts.instruction,
      }),
    });

    const data = await res.json();
    if (data.error) throw new ValidationError(data.error);

    // Set voiceover on the scene
    const freshStore = useProjectStore.getState();
    const freshNode = freshStore.currentProject?.nodes.find(n => n.id === sceneId);
    if (freshNode) {
      freshStore.updateNode(sceneId, {
        data: { ...(freshNode.data as any), voiceoverAudio: data.dataUrl, voiceoverAutoplay: autoplay },
      } as any);
    }

    return { success: true, sceneId, message: 'Voiceover generated and set on scene' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: `TTS generation failed: ${msg}` };
  }
};

// =============================================================================
// HANDLER MAP
// =============================================================================

const handlers: Record<string, CommandHandler> = {
  // Scenes
  create_scene: handleCreateScene,
  update_scene: handleUpdateScene,
  delete_scene: handleDeleteScene,
  add_choice: handleAddChoice,
  update_choice: handleUpdateChoice,
  delete_choice: handleDeleteChoice,
  set_choice_condition: handleSetChoiceCondition,
  remove_choice_condition: handleRemoveChoiceCondition,
  // Connections
  connect_nodes: handleConnectNodes,
  disconnect_nodes: handleDisconnectNodes,
  reconnect_edge: handleReconnectEdge,
  // Entities
  create_entity: handleCreateEntity,
  update_entity: handleUpdateEntity,
  delete_entity: handleDeleteEntity,
  link_entity_to_scene: handleLinkEntityToScene,
  unlink_entity_from_scene: handleUnlinkEntityFromScene,
  update_entity_state: handleUpdateEntityState,
  set_entity_profile: handleSetEntityProfile,
  get_entity_profile: handleGetEntityProfile,
  patch_entity_profile: handlePatchEntityProfile,
  // Variables
  create_variable: handleCreateVariable,
  update_variable: handleUpdateVariable,
  delete_variable: handleDeleteVariable,
  // Media
  generate_scene_image: handleGenerateSceneImage,
  generate_entity_image: handleGenerateEntityImage,
  set_scene_image: handleSetSceneImage,
  remove_scene_image: handleRemoveSceneImage,
  set_entity_image: handleSetEntityImage,
  remove_entity_image: handleRemoveEntityImage,
  set_scene_music: handleSetSceneMusic,
  remove_scene_music: handleRemoveSceneMusic,
  set_scene_voiceover: handleSetSceneVoiceover,
  remove_scene_voiceover: handleRemoveSceneVoiceover,
  set_entity_voice: handleSetEntityVoice,
  remove_entity_voice: handleRemoveEntityVoice,
  set_entity_music: handleSetEntityMusic,
  remove_entity_music: handleRemoveEntityMusic,
  // Modifiers
  create_modifier: handleCreateModifier,
  update_modifier: handleUpdateModifier,
  delete_modifier: handleDeleteModifier,
  // Branches
  create_branch: handleCreateBranch,
  update_branch: handleUpdateBranch,
  delete_branch: handleDeleteBranch,
  // Comments
  create_comment: handleCreateComment,
  update_comment: handleUpdateComment,
  delete_comment: handleDeleteComment,
  // Project
  set_start_node: handleSetStartNode,
  update_project_info: handleUpdateProjectInfo,
  update_notes: handleUpdateNotes,
  // Query
  get_scene_details: handleGetSceneDetails,
  get_entity_details: handleGetEntityDetails,
  list_scenes: handleListScenes,
  list_entities: handleListEntities,
  list_variables: handleListVariables,
  // TTS
  generate_scene_voiceover: handleGenerateSceneVoiceover,
  // Music
  search_music: handleSearchMusic,
  get_music_track: handleGetMusicTrack,
  assign_music_to_scene: handleAssignMusicToScene,
  list_music_genres: handleListMusicGenres,
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Execute a command by name. Called by aiChatService for each parsed
 * <<<SW_CMD>>> block. Returns {name, result} where result is a JSON string.
 */
export async function executeCommand(
  action: string,
  params: Record<string, unknown>
): Promise<{ name: string; result: string }> {
  const store = useProjectStore.getState();
  const project = store.currentProject as Project | null;

  if (!project) {
    return { name: action, result: JSON.stringify({
      success: false, error: 'No project open.',
      suggestion: 'Open a project from the Dashboard first.',
    }) };
  }

  const handler = handlers[action];
  if (!handler) {
    return { name: action, result: JSON.stringify({
      success: false,
      error: `Unknown command: ${action}`,
      suggestion: `Available commands: ${Object.keys(handlers).join(', ')}`,
    }) };
  }

  try {
    const result = await handler(params, store, project);
    return { name: action, result: JSON.stringify(result) };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { name: action, result: JSON.stringify({
        success: false, error: err.message, suggestion: err.suggestion,
      }) };
    }
    return { name: action, result: JSON.stringify({
      success: false, error: err instanceof Error ? err.message : 'Internal error',
    }) };
  }
}

/**
 * Get command registry metadata (for prompt generation and help).
 */
export function getCommandRegistry() {
  return COMMANDS;
}

// =============================================================================
// WINDOW.STORYAPI — Browser console access
// =============================================================================

if (typeof window !== 'undefined') {
  const api: Record<string, (params?: Record<string, unknown>) => Promise<unknown>> = {};
  for (const name of Object.keys(handlers)) {
    api[name] = async (params = {}) => {
      const result = await executeCommand(name, params);
      return JSON.parse(result.result);
    };
  }
  (window as any).storyAPI = api;
}
