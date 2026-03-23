/**
 * =============================================================================
 * GAME STATE API — Context / State Snapshot Builder
 * =============================================================================
 *
 * Builds a human-readable snapshot of the current game state that is sent
 * with every message to the AI agent. Includes scene IDs, choice IDs,
 * connection targets, entity info, variables, and edge IDs — everything
 * the agent needs to reference existing items.
 *
 * For co-write mode projects, also includes the story root, plots, acts,
 * character nodes, and relationship edges so the AI can see the full
 * narrative structure.
 *
 * =============================================================================
 */

import { useProjectStore } from '@/stores/useProjectStore';
import type {
  Project, StoryNode, Entity, Variable,
  StoryRootNodeData, PlotNodeData, ActNodeData,
  RelationshipEdgeData,
} from '@/types';

/**
 * Build a formatted text snapshot of the current project state.
 * Sent with every message so the agent always has up-to-date IDs.
 */
export function getGameContext(): string {
  const project = useProjectStore.getState().currentProject as Project | null;
  if (!project) return '[No project open]';

  const scenes = project.nodes.filter((n: StoryNode) => n.type === 'scene');
  const entities = project.entities || [];
  const variables = project.globalVariables || [];
  const edges = project.edges || [];
  const startNodeId = project.settings?.startNodeId || '';

  // Scene lines: ID, label, start marker, text preview, choices with connections
  const sceneLines = scenes.flatMap((s: StoryNode) => {
    const data = s.data as Record<string, unknown>;
    const text = ((data.storyText as string) || '').slice(0, 120);
    const choices = (data.choices as { id: string; label: string }[]) || [];
    const isStart = s.id === startNodeId;
    const hasImg = data.backgroundImage ? ' [img]' : '';
    const hasMusic = data.backgroundMusic ? ' [music]' : '';
    const hasVo = data.voiceoverAudio ? ' [vo]' : '';
    const media = `${hasImg}${hasMusic}${hasVo}`;

    const lines = [`  [${s.id}] "${s.label}"${isStart ? ' ★START' : ''}${media} — ${text}`];
    for (const c of choices) {
      const edge = edges.find((e) => e.source === s.id && e.sourceHandle === c.id);
      const conn = edge ? ` → ${edge.target} (edge: ${edge.id})` : ' (unconnected)';
      lines.push(`    choice [${c.id}] "${c.label}"${conn}`);
    }
    return lines;
  });

  // Entity lines: ID, category, name, image indicator, profile keys, summary preview
  const entityLines = entities.flatMap((e: Entity) => {
    const img = e.referenceImage ? ' [img]' : '';
    const profile = (e as any).profile as Record<string, unknown> | undefined;
    const profileInfo = profile ? ` [profile: ${Object.keys(profile).join(', ')}]` : '';
    const summary = e.summary ? ` — ${e.summary.slice(0, 60)}` : '';
    return [`  [${e.id}] ${e.category}: ${e.name}${img}${profileInfo}${summary}`];
  });

  // Variable lines: ID, name, type, default value
  const varLines = variables.map((v: Variable) =>
    `  [${v.id}] ${v.name} (${v.type}) = ${JSON.stringify(v.defaultValue)}`
  );

  // Edge lines: ID, source[handle] → target
  const edgeLines = edges.map((e) =>
    `  [${e.id}] ${e.source}${e.sourceHandle ? `[${e.sourceHandle}]` : ''} → ${e.target}`
  );

  const sections = [
    `Project: "${project.info.title}"`,
    `Mode: ${project.mode || 'game'}`,
    `Start Node: ${startNodeId || '(not set)'}`,
    '',
    `Scenes (${scenes.length}):`,
    ...(sceneLines.length > 0 ? sceneLines : ['  (none)']),
    '',
    `Entities (${entities.length}):`,
    ...(entityLines.length > 0 ? entityLines : ['  (none)']),
    '',
    `Variables (${variables.length}):`,
    ...(varLines.length > 0 ? varLines : ['  (none)']),
    '',
    `Edges (${edges.length}):`,
    ...(edgeLines.length > 0 ? edgeLines : ['  (none)']),
  ];

  // ─── CO-WRITE STRUCTURE ──────────────────────────────────────────────
  // When the project is in co-write mode, append the narrative structure
  // (story root, plots, acts, character nodes, relationships) so the AI
  // agent always sees the full co-writing context.
  if (project.mode === 'cowrite') {
    sections.push('', ...buildCowriteContext(project));
  }

  return sections.join('\n');
}

/**
 * Build the co-write context lines showing story root, plots, acts,
 * character nodes, and relationship edges. Called only when the project
 * is in co-write mode.
 */
function buildCowriteContext(project: Project): string[] {
  const lines: string[] = [];
  const nodes = project.nodes;
  const edges = project.edges || [];
  const entities = project.entities || [];

  // ── Story Root ──
  const rootNode = nodes.find(n => n.type === 'storyRoot');
  lines.push('[CO-WRITING STRUCTURE]');
  if (rootNode) {
    const d = rootNode.data as StoryRootNodeData;
    const hasImg = d.image ? ' [img]' : '';
    lines.push(`Story Root: [${rootNode.id}]${hasImg}`);
    if (d.title) lines.push(`  Title: ${d.title}`);
    if (d.genre) lines.push(`  Genre: ${d.genre}`);
    if (d.targetAudience) lines.push(`  Target Audience: ${d.targetAudience}`);
    if (d.punchline) lines.push(`  Punchline: ${d.punchline}`);
    if (d.mainCharacter?.name) {
      lines.push(`  Main Character: ${d.mainCharacter.name} (${d.mainCharacter.role || 'protagonist'})`);
    }
    if (d.antagonist?.name) {
      lines.push(`  Antagonist: ${d.antagonist.name} (${d.antagonist.role || 'antagonist'})`);
    }
    if (d.supportingCharacters && d.supportingCharacters.length > 0) {
      const sc = d.supportingCharacters.map(c => `${c.name} (${c.archetype})`).join(', ');
      lines.push(`  Supporting Characters: ${sc}`);
    }
    if (d.protagonistGoal) lines.push(`  Protagonist Goal: ${d.protagonistGoal}`);
    if (d.summary) lines.push(`  Summary: ${d.summary.slice(0, 200)}${d.summary.length > 200 ? '...' : ''}`);
  } else {
    lines.push('Story Root: (none)');
  }

  // ── Plots ──
  const plotNodes = nodes.filter(n => n.type === 'plot');
  lines.push('');
  lines.push(`Plots (${plotNodes.length}):`);
  if (plotNodes.length > 0) {
    for (const p of plotNodes) {
      const d = p.data as PlotNodeData;
      const desc = d.description ? ` — ${d.description.slice(0, 100)}` : '';
      const hasImg = d.image ? ' [img]' : '';
      lines.push(`  [${p.id}] "${d.name}" (${d.plotType})${hasImg}${desc}`);
    }
  } else {
    lines.push('  (none)');
  }

  // ── Acts ──
  const actNodes = nodes
    .filter(n => n.type === 'act')
    .sort((a, b) => (a.data as ActNodeData).actNumber - (b.data as ActNodeData).actNumber);
  lines.push('');
  lines.push(`Acts (${actNodes.length}):`);
  if (actNodes.length > 0) {
    for (const a of actNodes) {
      const d = a.data as ActNodeData;
      const desc = d.description ? ` — ${d.description.slice(0, 100)}` : '';
      lines.push(`  [${a.id}] Act ${d.actNumber}: "${d.name}"${desc}`);
    }
  } else {
    lines.push('  (none)');
  }

  // ── Character Nodes ──
  const charNodes = nodes.filter(n => n.type === 'character');
  if (charNodes.length > 0) {
    lines.push('');
    lines.push(`Character Nodes (${charNodes.length}):`);
    for (const cn of charNodes) {
      const d = cn.data as { entityId: string };
      const ent = entities.find(e => e.id === d.entityId);
      const entName = ent ? ent.name : '(unlinked)';
      lines.push(`  [${cn.id}] → entity ${d.entityId} (${entName})`);
    }
  }

  // ── Relationships ──
  const relEdges = edges.filter(e =>
    e.type === 'relationship' || (e.data && (e.data as any).relationshipType !== undefined)
  );
  lines.push('');
  lines.push(`Relationships (${relEdges.length}):`);
  if (relEdges.length > 0) {
    for (const e of relEdges) {
      const d = (e.data as RelationshipEdgeData) || {};
      const type = d.relationshipType ? `"${d.relationshipType}"` : '(untyped)';
      const desc = d.description ? ` — ${d.description.slice(0, 80)}` : '';
      lines.push(`  [${e.id}] ${e.source} → ${e.target}: ${type}${desc}`);
    }
  } else {
    lines.push('  (none)');
  }

  return lines;
}
