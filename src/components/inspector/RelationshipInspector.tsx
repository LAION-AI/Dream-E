/**
 * =============================================================================
 * RELATIONSHIP INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for relationship edges on the Character Canvas.
 * Shown when a user clicks on an edge connecting two character nodes.
 *
 * FIELDS:
 * - Relationship Type (e.g., Romantic, Rivalry, Mentor-Student, Siblings)
 * - Description (textarea — the nature of the relationship)
 * - Status (e.g., Active, Broken, Developing, Secret)
 * - History (textarea — how the relationship has evolved)
 *
 * WHY RELATIONSHIP EDGES HAVE DATA:
 * In most story graphs, edges are just arrows. But in the Character Canvas,
 * relationships ARE the story. Two characters being "siblings" vs "rivals"
 * fundamentally changes every scene they share. By attaching structured data
 * to edges, we give the AI (and the writer) rich context about character
 * dynamics without cluttering individual character profiles.
 *
 * =============================================================================
 */

import React from 'react';
import type { StoryEdge, RelationshipEdgeData } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';
import { STORY_TOOLTIPS } from '@/data/storyTooltips';

// =============================================================================
// PROPS
// =============================================================================

interface RelationshipInspectorProps {
  /** The selected edge containing relationship data */
  edge: StoryEdge;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * RelationshipInspector — the right-panel detail view for relationship edges.
 *
 * Unlike node inspectors that receive a node prop, this inspector receives
 * the edge and uses `updateEdge` on the project store to persist changes.
 * Edge data is stored on `edge.data` as a `RelationshipEdgeData` object.
 */
export default function RelationshipInspector({ edge }: RelationshipInspectorProps) {
  const updateEdge = useProjectStore((s) => s.updateEdge);

  /**
   * Safely extract relationship data from the edge.
   * If the edge has no data yet, we initialize with empty defaults.
   */
  const data: RelationshipEdgeData = edge.data || {
    relationshipType: '',
    description: '',
    status: '',
    history: '',
  };

  /**
   * Helper to update a field on the edge's relationship data.
   * Merges the update into the existing data, then writes the whole
   * edge update through the store.
   */
  const updateData = (updates: Partial<RelationshipEdgeData>) => {
    updateEdge(edge.id, {
      data: { ...data, ...updates },
    });
  };

  /**
   * Look up character names from the source and target nodes
   * so we can display a meaningful header like "Alice <-> Bob".
   */
  const getNode = useProjectStore((s) => s.getNode);
  const entities = useProjectStore((s) => s.currentProject?.entities || []);

  const sourceNode = getNode(edge.source);
  const targetNode = getNode(edge.target);

  /**
   * Resolve a character node to its entity name.
   * CharacterNode.data.entityId points to an entity in the project's entity list.
   */
  const resolveCharacterName = (node: ReturnType<typeof getNode>): string => {
    if (!node) return 'Unknown';
    if (node.type === 'character') {
      const entityId = (node.data as { entityId: string }).entityId;
      const entity = entities.find((e) => e.id === entityId);
      return entity?.name || node.label || 'Unknown';
    }
    return node.label || 'Unknown';
  };

  const sourceName = resolveCharacterName(sourceNode);
  const targetName = resolveCharacterName(targetNode);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* ==================== RELATIONSHIP HEADER ==================== */}
      <div className="bg-editor-bg rounded-lg p-3 text-center">
        <p className="text-sm text-editor-muted mb-1">Relationship between</p>
        <p className="text-base font-semibold text-editor-text">
          {sourceName}
          <span className="text-editor-muted mx-2">&harr;</span>
          {targetName}
        </p>
      </div>

      {/* ==================== RELATIONSHIP TYPE ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Relationship Type
          <InfoTooltip content={STORY_TOOLTIPS.relationship} />
        </label>
        <input
          type="text"
          value={data.relationshipType || ''}
          onChange={(e) => updateData({ relationshipType: e.target.value })}
          className="input"
          placeholder="e.g., Romantic, Rivalry, Mentor-Student, Siblings"
        />
        <p className="text-xs text-editor-muted mt-1">
          The fundamental nature of how these two characters relate.
        </p>
      </div>

      {/* ==================== DESCRIPTION ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Description
          <InfoTooltip content="Describe the relationship dynamics — what do they want from each other? What tensions exist? What makes this relationship interesting for the story?" />
        </label>
        <textarea
          value={data.description || ''}
          onChange={(e) => updateData({ description: e.target.value })}
          className="input min-h-[80px] resize-y"
          placeholder="Describe the dynamics of this relationship..."
        />
      </div>

      {/* ==================== STATUS ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          Status
          <InfoTooltip content="The current state of the relationship at this point in the story. Relationships should evolve — a status of 'Developing' early on might become 'Strained' after a betrayal." />
        </label>
        <input
          type="text"
          value={data.status || ''}
          onChange={(e) => updateData({ status: e.target.value })}
          className="input"
          placeholder="e.g., Active, Broken, Developing, Secret, Strained"
        />
      </div>

      {/* ==================== HISTORY ==================== */}
      <div>
        <label className="input-label flex items-center gap-1">
          History
          <InfoTooltip content="How has this relationship evolved over time? Key moments that defined or changed it. Backstory that informs their current dynamic. This gives the AI rich context for writing scenes where these characters interact." />
        </label>
        <textarea
          value={data.history || ''}
          onChange={(e) => updateData({ history: e.target.value })}
          className="input min-h-[80px] resize-y"
          placeholder="Key moments and backstory that shaped this relationship..."
        />
      </div>
    </div>
  );
}
