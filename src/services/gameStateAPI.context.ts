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
 * =============================================================================
 */

import { useProjectStore } from '@/stores/useProjectStore';
import type { Project, StoryNode, Entity, Variable } from '@/types';

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

  return [
    `Project: "${project.info.title}"`,
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
  ].join('\n');
}
