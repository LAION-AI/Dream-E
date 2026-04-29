/**
 * =============================================================================
 * CO-WRITING LIFECYCLE ASSERTION SYSTEM
 * =============================================================================
 *
 * Pure-function module that inspects the current project state and returns a
 * structured assertion report. Injected into the co-writing agent's context
 * to enforce the lifecycle spec (CO_WRITING_LIFECYCLE.md).
 *
 * NO SIDE EFFECTS — takes Project data in, returns assertion results out.
 * Only runs when project.mode === 'cowrite'.
 *
 * =============================================================================
 */

import type {
  Project, Entity, StoryNode, StoryEdge,
  StoryRootNodeData, PlotNodeData, ActNodeData,
  CoWriteSceneData, ShotNodeData, RelationshipEdgeData,
} from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface AssertionResult {
  id: string;
  description: string;
  passed: boolean;
  severity: 'hard' | 'soft';
  suggestion?: string;
}

export interface PhaseReport {
  phase: string;
  assertions: AssertionResult[];
  passCount: number;
  failCount: number;
}

export interface LifecycleReport {
  currentPhase: string;
  reports: PhaseReport[];
  formattedContext: string;
}

// =============================================================================
// REQUIRED PROFILE FIELDS PER ENTITY CATEGORY
// =============================================================================

const REQUIRED_PROFILE_FIELDS: Record<string, string[]> = {
  character: [
    'summary', 'age', 'gender', 'ethnicity', 'appearance', 'personality',
    'ocean_profile', 'ruling_passion', 'contradiction', 'want_vs_need',
    'defining_fear', 'backstory', 'motivation', 'flaws', 'coping_strategy',
    'arc', 'visual_style_notes',
  ],
  location: [
    'summary', 'atmosphere', 'features', 'significance', 'visual_style',
    'connected_locations', 'inhabitants', 'history', 'current_state',
  ],
  object: [
    'summary', 'appearance', 'properties', 'history', 'significance',
    'current_owner', 'current_location', 'visual_style',
  ],
  concept: [
    'summary', 'rules', 'implications', 'examples', 'related_concepts',
    'visual_representation',
  ],
};

// =============================================================================
// HELPERS
// =============================================================================

/** Count words in a string */
function wordCount(text: string | undefined | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Find an entity by name (case-insensitive) */
function findEntityByName(entities: Entity[], name: string): Entity | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().trim();
  return entities.find(e => e.name.toLowerCase().trim() === lower);
}

/** Get missing mandatory profile fields for an entity */
export function getMissingProfileFields(entity: Entity): string[] {
  const required = REQUIRED_PROFILE_FIELDS[entity.category] || [];
  if (!entity.profile) return required;
  const profile = entity.profile as Record<string, unknown>;
  return required.filter(field => {
    const val = profile[field];
    if (val === undefined || val === null) return true;
    if (typeof val === 'string' && val.trim() === '') return true;
    return false;
  });
}

/** Check if entityStateChanges is a valid object (not a string, not null) */
function isValidEsc(esc: unknown): esc is Record<string, string> {
  return esc !== null && esc !== undefined && typeof esc === 'object' && !Array.isArray(esc);
}

/** Get entity IDs from entityStateChanges safely */
function getEscKeys(esc: unknown): string[] {
  if (!isValidEsc(esc)) return [];
  return Object.keys(esc);
}

/** Build an assertion result */
function assert(
  id: string,
  description: string,
  passed: boolean,
  severity: 'hard' | 'soft',
  suggestion?: string
): AssertionResult {
  return { id, description, passed, severity, suggestion: passed ? undefined : suggestion };
}

// =============================================================================
// PHASE DETECTION
// =============================================================================

type LifecyclePhase = 'story_root' | 'plots' | 'acts' | 'scenes' | 'shots';

function detectPhase(project: Project): LifecyclePhase {
  const nodes = project.nodes || [];
  const storyRoot = nodes.find(n => n.type === 'storyRoot');
  const plots = nodes.filter(n => n.type === 'plot');
  const acts = nodes.filter(n => n.type === 'act');
  const scenes = nodes.filter(n => n.type === 'cowriteScene');
  const shots = nodes.filter(n => n.type === 'shot');

  // Check deepest populated level
  if (shots.some(s => (s.data as ShotNodeData).description?.trim())) return 'shots';
  if (scenes.some(s => (s.data as CoWriteSceneData).description?.trim())) return 'scenes';
  if (acts.some(a => (a.data as ActNodeData).description?.trim())) return 'acts';
  if (plots.some(p => (p.data as PlotNodeData).description?.trim())) return 'plots';

  // Check if story root is substantially filled
  if (storyRoot) {
    const d = storyRoot.data as StoryRootNodeData;
    if (d.title && d.genre && d.summary && wordCount(d.summary) >= 50) {
      // Story root is substantially filled but no plots with descriptions yet
      if (plots.length > 0) return 'plots';
    }
  }

  return 'story_root';
}

// =============================================================================
// STORY ROOT ASSERTIONS (Pre-Plot Gate)
// =============================================================================

function checkStoryRootAssertions(project: Project): PhaseReport {
  const assertions: AssertionResult[] = [];
  const nodes = project.nodes || [];
  const entities = project.entities || [];
  const storyRoot = nodes.find(n => n.type === 'storyRoot');

  if (!storyRoot) {
    assertions.push(assert('sr_exists', 'Story Root node exists', false, 'hard', 'Create a co-write project'));
    return buildReport('Story Root', assertions);
  }

  const d = storyRoot.data as StoryRootNodeData;

  // Basic fields
  assertions.push(assert('sr_title', 'Story Root has title', !!d.title?.trim(), 'hard', 'Set the title with update_story_root'));
  assertions.push(assert('sr_genre', 'Story Root has genre', !!d.genre?.trim(), 'hard', 'Set the genre with update_story_root'));
  assertions.push(assert('sr_audience', 'Story Root has target audience', !!d.targetAudience?.trim(), 'soft', 'Set targetAudience with update_story_root'));
  assertions.push(assert('sr_punchline', 'Story Root has punchline/logline', !!d.punchline?.trim(), 'soft', 'Set punchline with update_story_root'));
  assertions.push(assert('sr_mc_name', 'Main character has name', !!d.mainCharacter?.name?.trim(), 'hard', 'Set mainCharacter with update_story_root'));
  assertions.push(assert('sr_mc_role', 'Main character has role', !!d.mainCharacter?.role?.trim(), 'hard', 'Set mainCharacter role'));
  assertions.push(assert('sr_ant_name', 'Antagonist has name', !!d.antagonist?.name?.trim(), 'hard', 'Set antagonist with update_story_root'));
  assertions.push(assert('sr_ant_role', 'Antagonist has role', !!d.antagonist?.role?.trim(), 'hard', 'Set antagonist role'));
  assertions.push(assert('sr_supporting', 'At least 1 supporting character', (d.supportingCharacters?.length || 0) >= 1, 'soft', 'Add supportingCharacters'));
  assertions.push(assert('sr_goal', 'Protagonist goal is defined', !!d.protagonistGoal?.trim(), 'hard', 'Set protagonistGoal'));
  assertions.push(assert('sr_summary', 'Summary is at least 100 words', wordCount(d.summary) >= 100, 'soft', 'Write a more detailed summary (currently ' + wordCount(d.summary) + ' words)'));
  assertions.push(assert('sr_image', 'Story Root has image', !!d.image, 'soft', 'Generate story root image with generate_node_image'));

  // Protagonist entity checks
  const mcName = d.mainCharacter?.name?.trim() || '';
  const mcEntity = findEntityByName(entities, mcName);
  assertions.push(assert('sr_mc_entity', `Protagonist "${mcName}" exists in world database`, !!mcEntity, 'hard', `Create entity "${mcName}" with create_entity`));
  if (mcEntity) {
    const missing = getMissingProfileFields(mcEntity);
    assertions.push(assert('sr_mc_profile', `Protagonist "${mcName}" has complete profile`, missing.length === 0, 'soft',
      missing.length > 0 ? `Missing profile fields: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}` : undefined));
    assertions.push(assert('sr_mc_image', `Protagonist "${mcName}" has reference image`, !!mcEntity.referenceImage, 'soft', 'Generate with generate_entity_image'));
  }

  // Antagonist entity checks
  const antName = d.antagonist?.name?.trim() || '';
  const antEntity = findEntityByName(entities, antName);
  assertions.push(assert('sr_ant_entity', `Antagonist "${antName}" exists in world database`, !!antEntity, 'hard', `Create entity "${antName}" with create_entity`));
  if (antEntity) {
    const missing = getMissingProfileFields(antEntity);
    assertions.push(assert('sr_ant_profile', `Antagonist "${antName}" has complete profile`, missing.length === 0, 'soft',
      missing.length > 0 ? `Missing profile fields: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}` : undefined));
    assertions.push(assert('sr_ant_image', `Antagonist "${antName}" has reference image`, !!antEntity.referenceImage, 'soft', 'Generate with generate_entity_image'));
  }

  // Supporting characters in world DB
  const supportingChars = d.supportingCharacters || [];
  for (const sc of supportingChars.slice(0, 5)) { // cap at 5 to keep context manageable
    const ent = findEntityByName(entities, sc.name);
    assertions.push(assert(`sr_sc_${sc.name}`, `Supporting character "${sc.name}" exists in world database`, !!ent, 'soft', `Create entity "${sc.name}" with create_entity`));
  }

  // Location entity exists
  const hasLocation = entities.some(e => e.category === 'location');
  assertions.push(assert('sr_location', 'At least 1 location entity defined', hasLocation, 'soft', 'Create a location entity for a key story setting'));

  // Entity state changes
  const esc = d.entityStateChanges;
  if (mcEntity) {
    const hasEntry = isValidEsc(esc) && mcEntity.id in (esc as object);
    assertions.push(assert('sr_esc_mc', `entityStateChanges has protagonist entry`, hasEntry, 'soft', 'Add entity state changes for protagonist in update_story_root'));
  }
  if (antEntity) {
    const hasEntry = isValidEsc(esc) && antEntity.id in (esc as object);
    assertions.push(assert('sr_esc_ant', `entityStateChanges has antagonist entry`, hasEntry, 'soft', 'Add entity state changes for antagonist in update_story_root'));
  }

  // Validate all ESC keys are valid entity IDs
  const escKeys = getEscKeys(esc);
  if (escKeys.length > 0) {
    const entityIds = new Set(entities.map(e => e.id));
    const invalid = escKeys.filter(k => !entityIds.has(k));
    assertions.push(assert('sr_esc_valid', 'All entityStateChanges keys are valid entity IDs', invalid.length === 0, 'hard',
      invalid.length > 0 ? `Invalid entity IDs: ${invalid.join(', ')}` : undefined));
  }

  return buildReport('Story Root', assertions);
}

// =============================================================================
// PLOT ASSERTIONS (Pre-Act Gate)
// =============================================================================

function checkPlotAssertions(project: Project): PhaseReport {
  const assertions: AssertionResult[] = [];
  const nodes = project.nodes || [];
  const entities = project.entities || [];
  const plots = nodes.filter(n => n.type === 'plot');

  if (plots.length === 0) {
    assertions.push(assert('plots_exist', 'At least 1 plot node exists', false, 'hard', 'Create plots with create_plot'));
    return buildReport('Plots', assertions);
  }

  const entityIds = new Set(entities.map(e => e.id));

  for (const plot of plots) {
    const d = plot.data as PlotNodeData;
    const label = d.name || plot.id;

    assertions.push(assert(`plot_name_${plot.id}`, `Plot "${label}" has name and plotType`, !!(d.name?.trim() && d.plotType?.trim()), 'hard', 'Set name and plotType with update_plot'));
    assertions.push(assert(`plot_desc_${plot.id}`, `Plot "${label}" description ≥ 100 words`, wordCount(d.description) >= 100, 'soft',
      `Currently ${wordCount(d.description)} words — expand the description`));
    assertions.push(assert(`plot_img_${plot.id}`, `Plot "${label}" has image`, !!d.image, 'soft', `Generate image with generate_node_image targeting ${plot.id}`));

    // Entity state changes
    const escKeys = getEscKeys(d.entityStateChanges);
    assertions.push(assert(`plot_esc_${plot.id}`, `Plot "${label}" has entityStateChanges`, escKeys.length > 0, 'soft', 'Add entity state changes with update_plot'));

    // Validate ESC keys
    if (escKeys.length > 0) {
      const invalid = escKeys.filter(k => !entityIds.has(k));
      if (invalid.length > 0) {
        assertions.push(assert(`plot_esc_valid_${plot.id}`, `Plot "${label}" entityStateChanges keys are valid`, false, 'hard', `Invalid entity IDs: ${invalid.join(', ')}`));
      }
    }

    // Check referenced entities have profiles and images
    for (const eid of escKeys.slice(0, 3)) { // cap per plot to keep output lean
      const ent = entities.find(e => e.id === eid);
      if (ent) {
        const missing = getMissingProfileFields(ent);
        if (missing.length > 0) {
          assertions.push(assert(`plot_ent_profile_${eid}`, `Entity "${ent.name}" has complete profile`, false, 'soft', `Missing: ${missing.slice(0, 4).join(', ')}`));
        }
        if (!ent.referenceImage) {
          assertions.push(assert(`plot_ent_img_${eid}`, `Entity "${ent.name}" has reference image`, false, 'soft', 'Generate with generate_entity_image'));
        }
      }
    }
  }

  return buildReport('Plots', assertions);
}

// =============================================================================
// ACT ASSERTIONS (Intra-Act / Pre-Scene Gate)
// =============================================================================

function checkActAssertions(project: Project, targetActId?: string): PhaseReport {
  const assertions: AssertionResult[] = [];
  const nodes = project.nodes || [];
  const edges = project.edges || [];
  const entities = project.entities || [];
  const plots = nodes.filter(n => n.type === 'plot');
  const acts = targetActId
    ? nodes.filter(n => n.id === targetActId && n.type === 'act')
    : nodes.filter(n => n.type === 'act');

  if (acts.length === 0) {
    assertions.push(assert('acts_exist', 'At least 1 act/episode node exists', false, 'hard', 'Create acts with create_act'));
    return buildReport('Acts/Episodes', assertions);
  }

  const entityIds = new Set(entities.map(e => e.id));

  for (const act of acts) {
    const d = act.data as ActNodeData;
    const label = d.name || `Act ${d.actNumber}`;

    assertions.push(assert(`act_name_${act.id}`, `"${label}" has name and description`, !!(d.name?.trim() && d.description?.trim()), 'hard', 'Set name and description with update_act'));
    assertions.push(assert(`act_desc_${act.id}`, `"${label}" description ≥ 100 words`, wordCount(d.description) >= 100, 'soft', `Currently ${wordCount(d.description)} words`));
    assertions.push(assert(`act_tp_${act.id}`, `"${label}" has turningPoint/cliffhanger`, !!d.turningPoint?.trim(), 'soft', 'Set turningPoint with update_act'));
    assertions.push(assert(`act_img_${act.id}`, `"${label}" has image`, !!d.image, 'soft', `Generate with generate_node_image targeting ${act.id}`));

    // Act-plot connections
    if (plots.length > 0) {
      const actEdges = edges.filter(e =>
        (e.source === act.id || e.target === act.id) &&
        (e.data as RelationshipEdgeData | undefined)?.plotInvolvement !== undefined
      );
      // Also check edges that connect act to plot by type
      const actPlotEdges = edges.filter(e =>
        ((e.source === act.id && plots.some(p => p.id === e.target)) ||
         (e.target === act.id && plots.some(p => p.id === e.source))) &&
        e.type === 'relationship'
      );
      const connectedPlotIds = new Set([...actEdges, ...actPlotEdges].flatMap(e => [e.source, e.target]).filter(id => plots.some(p => p.id === id)));
      const missingPlots = plots.filter(p => !connectedPlotIds.has(p.id));

      assertions.push(assert(`act_plots_${act.id}`, `"${label}" connected to all plots`, missingPlots.length === 0, 'soft',
        missingPlots.length > 0 ? `Missing connections to: ${missingPlots.map(p => (p.data as PlotNodeData).name).join(', ')}` : undefined));

      // Check plotInvolvement text
      const edgesWithoutInvolvement = actPlotEdges.filter(e => {
        const rd = e.data as RelationshipEdgeData | undefined;
        return !rd?.plotInvolvement?.trim();
      });
      if (actPlotEdges.length > 0 && edgesWithoutInvolvement.length > 0) {
        assertions.push(assert(`act_involvement_${act.id}`, `"${label}" act-plot edges have plotInvolvement`, false, 'soft', 'Update relationship edges with plotInvolvement text'));
      }
    }

    // Entity state changes
    const escKeys = getEscKeys(d.entityStateChanges);
    assertions.push(assert(`act_esc_${act.id}`, `"${label}" has entityStateChanges`, escKeys.length > 0, 'soft', 'Add entity state changes with update_act'));

    // Validate ESC keys
    if (escKeys.length > 0) {
      const invalid = escKeys.filter(k => !entityIds.has(k));
      if (invalid.length > 0) {
        assertions.push(assert(`act_esc_valid_${act.id}`, `"${label}" entityStateChanges keys valid`, false, 'hard', `Invalid IDs: ${invalid.join(', ')}`));
      }
    }
  }

  return buildReport('Acts/Episodes', assertions);
}

// =============================================================================
// SCENE ASSERTIONS
// =============================================================================

function checkSceneAssertions(project: Project, targetSceneId?: string): PhaseReport {
  const assertions: AssertionResult[] = [];
  const nodes = project.nodes || [];
  const edges = project.edges || [];
  const entities = project.entities || [];
  const plots = nodes.filter(n => n.type === 'plot');
  const acts = nodes.filter(n => n.type === 'act');
  const scenes = targetSceneId
    ? nodes.filter(n => n.id === targetSceneId && n.type === 'cowriteScene')
    : nodes.filter(n => n.type === 'cowriteScene');

  if (scenes.length === 0) {
    return buildReport('Scenes', []);
  }

  const entityIds = new Set(entities.map(e => e.id));

  for (const scene of scenes.slice(0, 10)) { // cap output for large projects
    const d = scene.data as CoWriteSceneData;
    const label = d.title || scene.id;

    assertions.push(assert(`scene_title_${scene.id}`, `Scene "${label}" has title and description`, !!(d.title?.trim() && d.description?.trim()), 'hard', 'Set title and description'));

    // Entity participation
    const entArray = d.entities || [];
    assertions.push(assert(`scene_ents_${scene.id}`, `Scene "${label}" has entity participation`, entArray.length > 0, 'soft', 'Add entities to the scene with update_cowrite_scene'));

    // Connected to parent act
    const parentActEdge = edges.find(e =>
      e.target === scene.id && acts.some(a => a.id === e.source)
    );
    assertions.push(assert(`scene_act_${scene.id}`, `Scene "${label}" connected to parent act`, !!parentActEdge, 'hard', 'Connect scene to its act'));

    // Connected to at least 1 plot
    const plotEdges = edges.filter(e =>
      ((e.source === scene.id && plots.some(p => p.id === e.target)) ||
       (e.target === scene.id && plots.some(p => p.id === e.source))) &&
      e.type === 'relationship'
    );
    assertions.push(assert(`scene_plot_${scene.id}`, `Scene "${label}" connected to at least 1 plot`, plotEdges.length > 0, 'hard', 'Create a relationship edge from scene to a plot node'));

    // Validate entity IDs in entities array
    const invalidEnts = entArray.filter(e => !entityIds.has(e.entityId));
    if (invalidEnts.length > 0) {
      assertions.push(assert(`scene_ent_valid_${scene.id}`, `Scene "${label}" entity IDs valid`, false, 'hard', `Invalid: ${invalidEnts.map(e => e.entityId).join(', ')}`));
    }

    // Entity state changes
    const escKeys = getEscKeys(d.entityStateChanges);
    if (entArray.length > 0 && escKeys.length === 0) {
      assertions.push(assert(`scene_esc_${scene.id}`, `Scene "${label}" has entityStateChanges`, false, 'soft', 'Add entity state changes for participating entities'));
    }
  }

  return buildReport('Scenes', assertions);
}

// =============================================================================
// ACT COMPLETION ASSERTIONS
// =============================================================================

function checkActCompletionAssertions(project: Project, actNodeId: string): PhaseReport {
  const assertions: AssertionResult[] = [];
  const nodes = project.nodes || [];
  const edges = project.edges || [];
  const plots = nodes.filter(n => n.type === 'plot');

  // Find scenes belonging to this act
  const childSceneIds = edges
    .filter(e => e.source === actNodeId && nodes.some(n => n.id === e.target && n.type === 'cowriteScene'))
    .map(e => e.target);
  const childScenes = nodes.filter(n => childSceneIds.includes(n.id));

  if (childScenes.length === 0) {
    assertions.push(assert('act_no_scenes', 'Act has scenes', false, 'soft', 'Create scenes for this act'));
    return buildReport('Act Completion', assertions);
  }

  // All scenes have title + description
  const incomplete = childScenes.filter(s => {
    const d = s.data as CoWriteSceneData;
    return !d.title?.trim() || !d.description?.trim();
  });
  assertions.push(assert('act_scenes_filled', 'All scenes have title + description', incomplete.length === 0, 'soft',
    incomplete.length > 0 ? `${incomplete.length} scene(s) need title/description` : undefined));

  // Every scene connected to at least 1 plot
  const scenesWithoutPlot = childScenes.filter(s => {
    const plotEdges = edges.filter(e =>
      ((e.source === s.id && plots.some(p => p.id === e.target)) ||
       (e.target === s.id && plots.some(p => p.id === e.source))) &&
      e.type === 'relationship'
    );
    return plotEdges.length === 0;
  });
  assertions.push(assert('act_scenes_plots', 'Every scene connected to at least 1 plot', scenesWithoutPlot.length === 0, 'hard',
    scenesWithoutPlot.length > 0 ? `${scenesWithoutPlot.length} scene(s) lack plot connections` : undefined));

  return buildReport('Act Completion', assertions);
}

// =============================================================================
// REPORT BUILDER AND FORMATTER
// =============================================================================

function buildReport(phase: string, assertions: AssertionResult[]): PhaseReport {
  return {
    phase,
    assertions,
    passCount: assertions.filter(a => a.passed).length,
    failCount: assertions.filter(a => !a.passed).length,
  };
}

function formatLifecycleContext(currentPhase: string, reports: PhaseReport[]): string {
  const allAssertions = reports.flatMap(r => r.assertions);
  const totalPass = allAssertions.filter(a => a.passed).length;
  const totalFail = allAssertions.filter(a => !a.passed).length;

  // If everything passes, just show a brief status
  if (totalFail === 0) {
    return `[LIFECYCLE CHECK — Phase: ${currentPhase}]\nStatus: All ${totalPass} assertions passed. Ready to proceed.`;
  }

  const lines: string[] = [];
  lines.push(`[LIFECYCLE CHECK — Phase: ${currentPhase}]`);
  lines.push(`Status: ${totalPass} of ${totalPass + totalFail} assertions passed`);
  lines.push('Missing:');

  // Show failures (hard first, then soft), capped at 20 to keep context lean
  const failures = allAssertions.filter(a => !a.passed);
  const sorted = [...failures.filter(a => a.severity === 'hard'), ...failures.filter(a => a.severity === 'soft')];

  for (const a of sorted.slice(0, 20)) {
    const sev = a.severity === 'hard' ? '[REQUIRED]' : '[recommended]';
    let line = `  ${sev} ${a.description}`;
    if (a.suggestion) line += ` — Suggestion: ${a.suggestion}`;
    lines.push(line);
  }

  if (sorted.length > 20) {
    lines.push(`  ... and ${sorted.length - 20} more`);
  }

  return lines.join('\n');
}

// =============================================================================
// PUBLIC API — Main Entry Point
// =============================================================================

/**
 * Run all relevant lifecycle assertions for the current project state.
 * Returns a structured report plus a formatted text block for agent context.
 *
 * Only runs for co-write mode projects. Returns empty report for game mode.
 */
export function runLifecycleChecks(project: Project, options?: {
  phase?: string;
  targetNodeId?: string;
}): LifecycleReport {
  // Safety: only for co-write projects
  if (project.mode !== 'cowrite') {
    return { currentPhase: 'N/A', reports: [], formattedContext: '' };
  }

  const currentPhase = detectPhase(project);
  const reports: PhaseReport[] = [];

  // If a specific phase was requested, only run that
  if (options?.phase && options.phase !== 'all') {
    switch (options.phase) {
      case 'story_root':
        reports.push(checkStoryRootAssertions(project));
        break;
      case 'plots':
        reports.push(checkPlotAssertions(project));
        break;
      case 'acts':
        reports.push(checkActAssertions(project, options.targetNodeId));
        break;
      case 'scenes':
        reports.push(checkSceneAssertions(project, options.targetNodeId));
        break;
      default:
        reports.push(checkStoryRootAssertions(project));
    }
  } else {
    // Run assertions relevant to current phase + one level below
    // (always run story root as baseline, plus the current phase's checks)
    reports.push(checkStoryRootAssertions(project));

    if (currentPhase === 'plots' || currentPhase === 'acts' || currentPhase === 'scenes' || currentPhase === 'shots') {
      reports.push(checkPlotAssertions(project));
    }
    if (currentPhase === 'acts' || currentPhase === 'scenes' || currentPhase === 'shots') {
      reports.push(checkActAssertions(project));
    }
    if (currentPhase === 'scenes' || currentPhase === 'shots') {
      reports.push(checkSceneAssertions(project));
    }
  }

  const formattedContext = formatLifecycleContext(currentPhase, reports);
  return { currentPhase, reports, formattedContext };
}

/**
 * Export individual check functions for the get_lifecycle_status command
 */
export {
  checkStoryRootAssertions,
  checkPlotAssertions,
  checkActAssertions,
  checkSceneAssertions,
  checkActCompletionAssertions,
  detectPhase,
};
