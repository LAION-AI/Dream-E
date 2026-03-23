/**
 * =============================================================================
 * OPEN WORLD MODE — Context Construction System
 * =============================================================================
 *
 * Builds the AI context for open-world mode scene generation.
 * Returns SEPARATE system prompt and user message so they map cleanly
 * to API message roles.
 *
 * PHILOSOPHY: Include EVERYTHING in full detail by default.
 * Only compress when the token budget (user-configurable, default 500K) is exceeded.
 * Compression order (last resort first → first resort last):
 *   1. Drop full profiles of entities NOT in the current scene
 *   2. Summarize the oldest story path scenes (keep recent ones full)
 *   3. Truncate entity descriptions (never profiles or state history)
 *
 * What is ALWAYS included at full fidelity regardless of budget:
 *   - All entity state change histories (verbatim, never truncated)
 *   - All player actions / user messages (every scene's choiceMade)
 *   - All entity profiles (key-value pairs, never truncated)
 *   - Project notes, variables, art style, writer instruction
 *   - Current scene in full + previous AI analysis
 *
 * =============================================================================
 */

import type { Project, Entity } from '@/types';
import type { GameSession } from '@/types';
import { useImageGenStore } from '@/stores/useImageGenStore';
import { computeShortestScenePath } from '@/utils/graphDepth';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Rough conversion: 1 token ≈ 4 characters */
const CHARS_PER_TOKEN = 4;

/** Absolute hard character limit (safety valve — ~1.5M tokens) */
const MAX_MESSAGE_CHARS = 6_000_000;

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// =============================================================================
// TYPES
// =============================================================================

export interface OpenWorldContext {
  /** The system prompt (from writer settings) */
  systemPrompt: string;
  /** The assembled user message with all context + instruction */
  userMessage: string;
  /** Estimated token count for the user message */
  estimatedTokens: number;
  /** Which entities had full profiles included */
  fullProfileEntityIds: string[];
  /** How many scenes were included in full vs summarized */
  pathStats: { full: number; summarized: number };
}

interface PathStep {
  nodeId: string;
  label: string;
  speakerName?: string;
  storyText: string;
  summary?: string;
  choiceMade?: string;
  entityStates?: Record<string, string>;
}

// =============================================================================
// STORY PATH BUILDER
// =============================================================================

/**
 * Build the story path from START NODE to CURRENT NODE using the graph structure.
 *
 * Uses BFS shortest path (computeShortestScenePath) from project.settings.startNodeId
 * to session.currentNodeId. This is backwards-compatible: even for games started
 * mid-graph or loaded from old saves, the path is recomputed from the graph edges.
 *
 * For each scene on the path, includes:
 *   - Full story text
 *   - Speaker name
 *   - The player action / choice that led to the NEXT scene (from playerAction field
 *     on the next node, or from the edge's choice label as fallback)
 *   - Scene summary (if available)
 */
function buildStoryPath(project: Project, session: GameSession): PathStep[] {
  const startNodeId = project.settings?.startNodeId;
  const currentNodeId = session.currentNodeId;

  if (!startNodeId) {
    console.warn('[OpenWorld] No startNodeId set — falling back to session history');
    return buildStoryPathFromHistory(project, session);
  }

  // Compute shortest path from start to current using graph edges
  const scenePath = computeShortestScenePath(
    project.nodes,
    project.edges,
    startNodeId,
    currentNodeId
  );

  if (scenePath.length === 0) {
    // Target unreachable from start — fall back to session history
    // Log diagnostic info to help debug
    const totalNodes = project.nodes.length;
    const totalEdges = project.edges.length;
    const startExists = project.nodes.some(n => n.id === startNodeId);
    const targetExists = project.nodes.some(n => n.id === currentNodeId);
    const edgesFromStart = project.edges.filter(e => e.source === startNodeId).length;
    const edgesToTarget = project.edges.filter(e => e.target === currentNodeId).length;
    console.warn(
      `[OpenWorld] Current node ${currentNodeId} unreachable from start ${startNodeId} — using session history.\n` +
      `  Graph: ${totalNodes} nodes, ${totalEdges} edges.\n` +
      `  Start node exists: ${startExists} (${edgesFromStart} outgoing edges).\n` +
      `  Target node exists: ${targetExists} (${edgesToTarget} incoming edges).\n` +
      `  Session history: ${session.history.length} entries.`
    );
    return buildStoryPathFromHistory(project, session);
  }

  console.log(`[OpenWorld] Graph path: ${scenePath.length} scenes from start to current`);

  const steps: PathStep[] = [];
  for (let i = 0; i < scenePath.length; i++) {
    const nodeId = scenePath[i];
    const node = project.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'scene') continue;

    const data = node.data as Record<string, unknown>;
    const storyText = (data.storyText as string) || '';
    const speakerName = (data.speakerName as string) || undefined;
    const choices = (data.choices as { id: string; label: string }[]) || [];

    // Determine which choice / player action led to the next scene
    let choiceMade: string | undefined;
    if (i < scenePath.length - 1) {
      const nextNodeId = scenePath[i + 1];
      const nextNode = project.nodes.find((n) => n.id === nextNodeId);

      // Highest fidelity: use the playerAction stored on the NEXT node
      if (nextNode && nextNode.type === 'scene' && (nextNode.data as Record<string, unknown>)?.playerAction) {
        choiceMade = (nextNode.data as Record<string, unknown>).playerAction as string;
      } else {
        // Fallback: find the edge connecting these two nodes and use its choice label
        const edge = project.edges.find(
          (e) => e.source === nodeId && e.target === nextNodeId
        );
        if (edge?.sourceHandle) {
          const choice = choices.find((c) => c.id === edge.sourceHandle);
          choiceMade = choice?.label;
        }
        // Second fallback: look for any intermediate (non-scene) edge chain
        if (!choiceMade && !edge) {
          choiceMade = findChoiceThroughIntermediateNodes(project, nodeId, nextNodeId, choices);
        }
      }
    }

    const summary = (data.summary as string) || undefined;

    // Collect per-scene entity state notes (stored by updateEntityState on each scene)
    const rawEntityStates = data.entityStates as Record<string, string> | undefined;
    const entityStates = (rawEntityStates && Object.keys(rawEntityStates).length > 0)
      ? rawEntityStates
      : undefined;

    steps.push({
      nodeId,
      label: node.label || 'Unnamed Scene',
      speakerName,
      storyText,
      summary,
      choiceMade,
      entityStates,
    });
  }

  return steps;
}

/**
 * When two scene nodes are connected through intermediate non-scene nodes,
 * trace back from the source scene to find which choice was used.
 */
function findChoiceThroughIntermediateNodes(
  project: Project,
  sourceSceneId: string,
  targetSceneId: string,
  choices: { id: string; label: string }[]
): string | undefined {
  // Try each edge from the source scene
  const directEdges = project.edges.filter(e => e.source === sourceSceneId);
  for (const edge of directEdges) {
    // BFS from this edge's target to see if we reach targetSceneId
    const visited = new Set<string>();
    const queue = [edge.target];
    visited.add(edge.target);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === targetSceneId) {
        // Found it — return the choice label from this edge
        if (edge.sourceHandle) {
          const choice = choices.find(c => c.id === edge.sourceHandle);
          return choice?.label;
        }
        return undefined;
      }
      const curNode = project.nodes.find(n => n.id === cur);
      if (curNode?.type === 'scene') continue; // Don't traverse through other scenes
      const nextEdges = project.edges.filter(e => e.source === cur);
      for (const ne of nextEdges) {
        if (!visited.has(ne.target)) {
          visited.add(ne.target);
          queue.push(ne.target);
        }
      }
    }
  }
  return undefined;
}

/**
 * Fallback: build path from session.history when graph-based path fails.
 * Used when startNodeId is missing or target is unreachable.
 */
function buildStoryPathFromHistory(project: Project, session: GameSession): PathStep[] {
  const steps: PathStep[] = [];
  const history = [...session.history, session.currentNodeId];

  for (let i = 0; i < history.length; i++) {
    const nodeId = history[i];
    const node = project.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'scene') continue;

    const data = node.data as Record<string, unknown>;
    const storyText = (data.storyText as string) || '';
    const speakerName = (data.speakerName as string) || undefined;
    const choices = (data.choices as { id: string; label: string }[]) || [];

    let choiceMade: string | undefined;
    if (i < history.length - 1) {
      const nextNodeId = history[i + 1];
      const nextNode = project.nodes.find((n) => n.id === nextNodeId);

      if (nextNode && nextNode.type === 'scene' && (nextNode.data as Record<string, unknown>)?.playerAction) {
        choiceMade = (nextNode.data as Record<string, unknown>).playerAction as string;
      } else {
        const edge = project.edges.find(
          (e) => e.source === nodeId && e.target === nextNodeId
        );
        if (edge?.sourceHandle) {
          const choice = choices.find((c) => c.id === edge.sourceHandle);
          choiceMade = choice?.label;
        }
      }
    }

    const summary = (data.summary as string) || undefined;

    // Collect per-scene entity state notes
    const rawEntityStates = data.entityStates as Record<string, string> | undefined;
    const entityStates = (rawEntityStates && Object.keys(rawEntityStates).length > 0)
      ? rawEntityStates
      : undefined;

    steps.push({
      nodeId,
      label: node.label || 'Unnamed Scene',
      speakerName,
      storyText,
      summary,
      choiceMade,
      entityStates,
    });
  }

  return steps;
}

// =============================================================================
// ART STYLE DETECTION
// =============================================================================

function detectArtStyle(project: Project): string | null {
  const searchText = [
    project.notes || '',
    ...(project.entities || []).flatMap((e) => [
      e.description || '',
      e.summary || '',
      e.profile?.appearance as string || '',
      e.profile?.style as string || '',
    ]),
  ].join(' ').toLowerCase();

  if (/anime|manga|cel[- ]shad/i.test(searchText)) return 'anime/manga illustration style';
  if (/pixel\s*art/i.test(searchText)) return 'pixel art style';
  if (/watercolor/i.test(searchText)) return 'watercolor painting style';
  if (/oil\s*paint/i.test(searchText)) return 'oil painting style';
  if (/comic|cartoon/i.test(searchText)) return 'comic/cartoon illustration style';
  if (/photorealis/i.test(searchText)) return 'photorealistic style';
  if (/fantasy\s*art|digital\s*paint/i.test(searchText)) return 'digital fantasy art style';

  const hasRefImages = (project.entities || []).some((e) => e.referenceImage);
  if (hasRefImages) {
    return 'illustrated style matching the existing reference images in the project';
  }

  return null;
}

// =============================================================================
// ENTITY COLLECTOR
// =============================================================================

function categorizeEntities(
  project: Project,
  currentNodeId: string
): {
  currentSceneEntities: Entity[];
  otherEntities: Entity[];
} {
  const entities = project.entities || [];
  const currentNode = project.nodes.find((n) => n.id === currentNodeId);
  if (!currentNode) return { currentSceneEntities: [], otherEntities: entities };

  const data = currentNode.data as Record<string, unknown>;
  const linkedFields = [
    'linkedCharacters', 'linkedLocations', 'linkedObjects', 'linkedConcepts',
  ];
  const linkedIds = new Set<string>();
  for (const field of linkedFields) {
    const ids = (data[field] as string[]) || [];
    ids.forEach((id) => linkedIds.add(id));
  }

  const currentSceneEntities: Entity[] = [];
  const otherEntities: Entity[] = [];

  for (const entity of entities) {
    if (linkedIds.has(entity.id)) {
      currentSceneEntities.push(entity);
    } else {
      otherEntities.push(entity);
    }
  }

  return { currentSceneEntities, otherEntities };
}

// =============================================================================
// FORMATTERS
// =============================================================================

function formatEntitySummary(entity: Entity): string {
  const summary = entity.summary || entity.description?.slice(0, 150) || 'No description';
  // Flag entities missing a reference image so the writer LLM knows to
  // include them in generateEntityImages for visual consistency.
  const imageWarning = !entity.referenceImage
    ? ' [⚠ NO REFERENCE IMAGE — include in generateEntityImages]'
    : '';
  return `  [${entity.id}] ${entity.category}: ${entity.name} — ${summary}${imageWarning}`;
}

/**
 * Format an entity's full profile for inclusion in the context.
 * NEVER truncates profiles or state history — the LM needs all details.
 */
function formatEntityFull(entity: Entity): string {
  const lines = [
    `### ${entity.category.toUpperCase()}: ${entity.name} [${entity.id}]`,
  ];
  // Alert the writer LLM when an entity has no reference image.
  // The system will auto-generate one before the scene image, but the LLM
  // should also include a generateEntityImages entry with a detailed prompt
  // to get the best possible portrait.
  if (!entity.referenceImage) {
    lines.push('⚠ MISSING REFERENCE IMAGE: Include this entity in "generateEntityImages" with a detailed visual description prompt so a reference portrait can be generated.');
  }
  if (entity.summary) lines.push(`Summary: ${entity.summary}`);
  if (entity.description) lines.push(`Description: ${entity.description}`);
  if (entity.profile && Object.keys(entity.profile).length > 0) {
    lines.push('Profile:');
    for (const [key, value] of Object.entries(entity.profile)) {
      const valStr = typeof value === 'string' ? value : JSON.stringify(value);
      lines.push(`  ${key}: ${valStr}`);
    }
  }

  // Include the full State Change History — NO truncation.
  // The LM needs all details verbatim (magical effects, ideological shifts, relationship changes)
  // to maintain continuity and consistency across scenes.
  if (entity.stateHistory && entity.stateHistory.length > 0) {
    lines.push('\nState Change History (chronological — oldest first):');
    entity.stateHistory.forEach((event, i) => {
      const label = event.sceneLabel ? `"${event.sceneLabel}"` : `Scene ${event.sceneId}`;
      const action = event.playerAction ? ` (Player action: "${event.playerAction}")` : '';
      lines.push(`  Step ${i + 1} [${label}]${action}: ${event.sceneSummary}`);
      event.stateChanges.forEach(change => {
        lines.push(`    → ${change}`);
      });
    });
  }

  return lines.join('\n');
}

function formatVariables(session: GameSession): string {
  const entries = Object.entries(session.variables);
  if (entries.length === 0) return '  (no variables)';
  return entries.map(([name, val]) => `  ${name} = ${JSON.stringify(val)}`).join('\n');
}

/**
 * Format a story path step. Full mode includes complete story text + player action + entity states.
 * Compressed mode includes summary + player action (player action is NEVER dropped).
 *
 * @param entityNameMap - Map from entity ID to name, used to display readable entity state labels.
 *                        Pass an empty map if entity names are not available.
 */
function formatPathStep(
  step: PathStep, index: number, full: boolean, entityNameMap: Map<string, string>
): string {
  if (!full) {
    // Compressed mode — always include player action + entity state summary
    const choice = step.choiceMade ? ` → Player action: "${step.choiceMade}"` : '';
    let entityStateNote = '';
    if (step.entityStates && Object.keys(step.entityStates).length > 0) {
      const stateEntries = Object.entries(step.entityStates).map(([eid, state]) => {
        const name = entityNameMap.get(eid) || eid;
        return `${name}: ${state}`;
      });
      entityStateNote = ` | Entity states: ${stateEntries.join('; ')}`;
    }
    if (step.summary) {
      return `  ${index + 1}. [${step.label}] ${step.summary}${choice}${entityStateNote}`;
    }
    return `  ${index + 1}. [${step.label}]${choice}${entityStateNote}`;
  }
  // Full mode — complete scene text + entity states + player action
  const lines = [`--- Scene ${index + 1}: "${step.label}" ---`];
  if (step.speakerName) lines.push(`Speaker: ${step.speakerName}`);
  lines.push(step.storyText);

  // Per-scene entity state notes — these are the short annotations written by the AI
  // for each entity that changed state in this scene
  if (step.entityStates && Object.keys(step.entityStates).length > 0) {
    lines.push('[Entity State Changes in this scene]');
    for (const [eid, state] of Object.entries(step.entityStates)) {
      const name = entityNameMap.get(eid) || eid;
      lines.push(`  ${name} [${eid}]: ${state}`);
    }
  }

  if (step.choiceMade) lines.push(`>> PLAYER ACTION: "${step.choiceMade}"`);
  return lines.join('\n');
}

// =============================================================================
// MAIN CONTEXT BUILDER
// =============================================================================

/**
 * Build the complete AI context for an open-world mode generation.
 *
 * Strategy: include EVERYTHING in full by default. Only compress when
 * the user-configurable token budget (writer.maxContextTokens) is exceeded.
 *
 * Returns SEPARATE systemPrompt and userMessage so they can be sent
 * as proper role messages to Gemini / OpenAI APIs.
 */
export function buildOpenWorldContext(
  project: Project,
  session: GameSession,
  userAction: string
): OpenWorldContext {
  const writerSettings = useImageGenStore.getState().writer;
  const systemPrompt = writerSettings.systemPrompt;

  // User-configurable token budget (default 500K)
  const maxTokens = writerSettings.maxContextTokens || 500_000;

  const { currentSceneEntities, otherEntities } = categorizeEntities(
    project, session.currentNodeId
  );
  const allEntities = [...currentSceneEntities, ...otherEntities];
  const path = buildStoryPath(project, session);

  // Build entity name lookup for readable labels in the story timeline
  const entityNameMap = new Map<string, string>();
  for (const entity of (project.entities || [])) {
    entityNameMap.set(entity.id, entity.name);
  }

  // ── Phase 1: Build ALL sections at full fidelity ──────────────────
  // We build everything first, then check if we're over budget.

  const sections: { label: string; text: string; order: number; compressible: boolean }[] = [];

  // Project notes (ALWAYS — never compressed)
  const notes = project.notes || '';
  if (notes.trim()) {
    sections.push({
      label: 'notes',
      text: `[STORY DESIGNER NOTES]\n${notes}`,
      order: 0,
      compressible: false,
    });
  }

  // Entity summaries — ALL entities always included (compact overview)
  if (allEntities.length > 0) {
    sections.push({
      label: 'entity_summaries',
      text: `[ALL ENTITY SUMMARIES] (${allEntities.length} total)\n${
        allEntities.map(formatEntitySummary).join('\n')
      }`,
      order: 1,
      compressible: false,
    });
  }

  // Variables (ALWAYS)
  sections.push({
    label: 'variables',
    text: `[CURRENT VARIABLES]\n${formatVariables(session)}`,
    order: 2,
    compressible: false,
  });

  // Art style
  const settings = useImageGenStore.getState();
  const userImageStyle = settings.defaultImageStyle?.trim();
  const detectedStyle = detectArtStyle(project);
  const artStyle = userImageStyle || detectedStyle;
  if (artStyle) {
    sections.push({
      label: 'art_style',
      text: `[ART STYLE — MANDATORY]\n${artStyle}\n\nALL imagePrompt values MUST specify this exact style. Do NOT use a different art style. This is non-negotiable.`,
      order: 3,
      compressible: false,
    });
  }

  // Full profiles for ALL entities (current-scene entities first, then others)
  const fullProfileEntityIds: string[] = [];
  for (const entity of currentSceneEntities) {
    const text = formatEntityFull(entity);
    sections.push({
      label: `entity_full_${entity.id}`,
      text: `[DETAILED ENTITY — CURRENTLY IN SCENE]\n${text}`,
      order: 5,
      compressible: false, // Current-scene entities are never dropped
    });
    fullProfileEntityIds.push(entity.id);
  }
  for (const entity of otherEntities) {
    const text = formatEntityFull(entity);
    sections.push({
      label: `entity_full_${entity.id}`,
      text: `[DETAILED ENTITY]\n${text}`,
      order: 6,
      compressible: true, // Other entities can be dropped if over budget
    });
    fullProfileEntityIds.push(entity.id);
  }

  // Story path / timeline — ALL scenes in FULL detail
  let fullCount = path.length;
  let summaryCount = 0;
  if (path.length > 0) {
    const fullPathText = path.map((s, i) => formatPathStep(s, i, true, entityNameMap)).join('\n\n');
    sections.push({
      label: 'story_path',
      text: `[STORY TIMELINE] (${path.length} scenes visited)\n${fullPathText}`,
      order: 10,
      compressible: true, // Can be compressed (old scenes → summaries) if over budget
    });
  }

  // Current scene (ALWAYS — placed after timeline for recency)
  const currentNode = project.nodes.find((n) => n.id === session.currentNodeId);
  if (currentNode) {
    const data = currentNode.data as Record<string, unknown>;
    let sceneText = `[CURRENT SCENE: "${currentNode.label || 'Unnamed'}"]\n`;
    if (data.speakerName) sceneText += `Speaker: ${data.speakerName}\n`;
    sceneText += (data.storyText as string) || 'No content';

    // Entity states at current scene
    const entityStates = data.entityStates as Record<string, string> | undefined;
    if (entityStates && Object.keys(entityStates).length > 0) {
      sceneText += '\n\n[Entity States in this scene]';
      for (const [eid, state] of Object.entries(entityStates)) {
        const entity = (project.entities || []).find(e => e.id === eid);
        const name = entity ? entity.name : eid;
        sceneText += `\n  ${name} [${eid}]: ${state}`;
      }
    }

    // Linked entities
    const linkedFields = ['linkedCharacters', 'linkedLocations', 'linkedObjects', 'linkedConcepts'] as const;
    const linkedInScene: string[] = [];
    for (const field of linkedFields) {
      const ids = (data[field] as string[]) || [];
      linkedInScene.push(...ids);
    }
    if (linkedInScene.length > 0) {
      sceneText += '\n\n[Entities present in this scene]';
      for (const eid of linkedInScene) {
        const entity = (project.entities || []).find(e => e.id === eid);
        if (entity) sceneText += `\n  ${entity.name} [${eid}] (${entity.category})`;
      }
    }

    sections.push({
      label: 'current_scene',
      text: sceneText,
      order: 20,
      compressible: false,
    });
  }

  // Floating goals from previous scene — carry these forward
  if (currentNode) {
    const prevDataFG = currentNode.data as Record<string, unknown>;
    const prevAiResponseFG = prevDataFG.aiResponse as string | undefined;
    if (prevAiResponseFG) {
      try {
        const prevParsedFG = JSON.parse(prevAiResponseFG);
        if (prevParsedFG.floatingGoals && Array.isArray(prevParsedFG.floatingGoals) && prevParsedFG.floatingGoals.length > 0) {
          sections.push({
            label: 'floating_goals',
            text: `[ACTIVE FLOATING GOALS — carry forward, update, or resolve these]\n${prevParsedFG.floatingGoals.map((g: string, i: number) => `  ${i + 1}. ${g}`).join('\n')}`,
            order: 84,
            compressible: false,
          });
        }
      } catch { /* skip if not parseable */ }
    }
  }

  // Previous scene's AI analysis
  if (currentNode) {
    const prevData = currentNode.data as Record<string, unknown>;
    const prevAiResponse = prevData.aiResponse as string | undefined;
    if (prevAiResponse) {
      try {
        const prevParsed = JSON.parse(prevAiResponse);
        const analysisFields = [
          'playerGoalHypothesis', 'sceneIntentHypothesis',
          'lastSatisfactionEstimate', 'engagementStrategy',
          'narrativeTensionAnalysis', 'plannedStateChanges', 'floatingGoals',
        ];
        const analysisLines: string[] = [];
        for (const field of analysisFields) {
          if (prevParsed[field]) {
            analysisLines.push(`  ${field}: ${prevParsed[field]}`);
          }
        }
        if (analysisLines.length > 0) {
          sections.push({
            label: 'previous_analysis',
            text: `[PREVIOUS SCENE AI ANALYSIS]\nYour analysis from the last scene (build on and refine these hypotheses):\n${analysisLines.join('\n')}`,
            order: 85,
            compressible: false,
          });
        }
      } catch {
        // skip if not parseable
      }
    }
  }

  // Player action (ALWAYS)
  sections.push({
    label: 'user_action',
    text: `[PLAYER ACTION]\nThe player wants to: ${userAction}`,
    order: 90,
    compressible: false,
  });

  // Writer instruction (ALWAYS — at the very end)
  const instruction = writerSettings.instruction;
  if (instruction.trim()) {
    sections.push({
      label: 'instruction',
      text: `[INSTRUCTION]\n${instruction}`,
      order: 91,
      compressible: false,
    });
  }

  // ── Phase 2: Check budget and compress if needed ──────────────────

  const totalTokens = sections.reduce((sum, s) => sum + estimateTokens(s.text), 0);

  if (totalTokens > maxTokens) {
    console.log(`[OpenWorld] Over budget: ~${totalTokens} tokens > ${maxTokens} limit. Compressing...`);

    // Compression step 1: Drop full profiles of entities NOT in the current scene
    let saved = 0;
    const otherEntitySections = sections.filter(s => s.compressible && s.label.startsWith('entity_full_'));
    for (const sec of otherEntitySections) {
      const secTokens = estimateTokens(sec.text);
      const idx = sections.indexOf(sec);
      if (idx >= 0) {
        sections.splice(idx, 1);
        saved += secTokens;
        // Remove from fullProfileEntityIds
        const eid = sec.label.replace('entity_full_', '');
        const pidx = fullProfileEntityIds.indexOf(eid);
        if (pidx >= 0) fullProfileEntityIds.splice(pidx, 1);
      }
      if (totalTokens - saved <= maxTokens) break;
    }

    if (saved > 0) {
      console.log(`[OpenWorld] Dropped ${otherEntitySections.length - sections.filter(s => s.label.startsWith('entity_full_') && s.compressible).length} non-scene entity profiles, saved ~${saved} tokens`);
    }

    // Compression step 2: If still over budget, compress old story path scenes
    const currentTotal = sections.reduce((sum, s) => sum + estimateTokens(s.text), 0);
    if (currentTotal > maxTokens && path.length > 0) {
      const pathIdx = sections.findIndex(s => s.label === 'story_path');
      if (pathIdx >= 0) {
        // Start by keeping all scenes full, then progressively compress oldest ones
        // Always keep at least the last 5 scenes in full (or all if <= 5)
        const minFullScenes = Math.min(path.length, 5);
        let keepFull = path.length;

        // Binary-search-ish: find the right number of full scenes
        while (keepFull > minFullScenes) {
          keepFull = Math.max(minFullScenes, Math.floor(keepFull * 0.7));
          const sumCount = path.length - keepFull;

          const compressedPart = path.slice(0, sumCount).map((s, i) => formatPathStep(s, i, false, entityNameMap)).join('\n');
          const fullPart = path.slice(sumCount).map((s, i) => formatPathStep(s, sumCount + i, true, entityNameMap)).join('\n\n');
          const newPathText = sumCount > 0
            ? `[Earlier scenes — compressed (player actions preserved)]\n${compressedPart}\n\n[Recent scenes — full detail]\n${fullPart}`
            : fullPart;

          sections[pathIdx].text = `[STORY TIMELINE] (${path.length} scenes visited)\n${newPathText}`;

          const newTotal = sections.reduce((sum, s) => sum + estimateTokens(s.text), 0);
          fullCount = keepFull;
          summaryCount = sumCount;

          if (newTotal <= maxTokens) break;
        }

        console.log(`[OpenWorld] Compressed story path: ${summaryCount} summarized + ${fullCount} full scenes`);
      }
    }
  }

  // ── Phase 3: Assemble final user message ──────────────────────────

  // Sort by order field
  sections.sort((a, b) => a.order - b.order);

  let userMessage = sections.map((s) => s.text).join('\n\n');

  // Safety limit
  if (userMessage.length > MAX_MESSAGE_CHARS) {
    console.warn(`[OpenWorld] User message too long (${userMessage.length} chars), truncating`);
    userMessage = userMessage.slice(0, MAX_MESSAGE_CHARS) + '\n\n[Context truncated for length]';
  }

  const estimatedTokensFinal = estimateTokens(userMessage);

  console.log(
    `[OpenWorld] Context: ~${estimatedTokensFinal} tokens / ${maxTokens} budget, ` +
    `${fullProfileEntityIds.length}/${allEntities.length} full entity profiles, ` +
    `${fullCount} full + ${summaryCount} summarized scenes`
  );

  return {
    systemPrompt,
    userMessage,
    estimatedTokens: estimatedTokensFinal,
    fullProfileEntityIds,
    pathStats: { full: fullCount, summarized: summaryCount },
  };
}
