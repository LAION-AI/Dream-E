/**
 * =============================================================================
 * RELATIONSHIP INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for relationship edges on the Character Canvas and
 * Act-Plot connections on the Story Canvas.
 *
 * CONTEXT-SENSITIVE DISPLAY:
 * The inspector checks which node types the edge connects and renders
 * different fields accordingly:
 *
 * 1. CHARACTER-TO-CHARACTER: Relationship type, beginning state, dynamic
 *    act development entries, ending state, description, status, history.
 *
 * 2. ACT-TO-PLOT (or PLOT-TO-ACT): Plot involvement — what parts of the
 *    plot unfold during this act.
 *
 * 3. DEFAULT: Falls back to the generic relationship fields.
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
import { Plus, Trash2 } from 'lucide-react';
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
   * Resolve a node to its display name.
   * CharacterNode: looks up entity name from entityId.
   * PlotNode/ActNode: uses the node's data name or label.
   * Default: label or 'Unknown'.
   */
  const resolveNodeName = (node: ReturnType<typeof getNode>): string => {
    if (!node) return 'Unknown';
    if (node.type === 'character') {
      const entityId = (node.data as { entityId: string }).entityId;
      const entity = entities.find((e) => e.id === entityId);
      return entity?.name || node.label || 'Unknown';
    }
    if (node.type === 'act') {
      const actData = node.data as { actNumber: number; name: string };
      return actData.name || `Act ${actData.actNumber}`;
    }
    if (node.type === 'plot') {
      const plotData = node.data as { name: string };
      return plotData.name || node.label || 'Unknown Plot';
    }
    return node.label || 'Unknown';
  };

  const sourceName = resolveNodeName(sourceNode);
  const targetName = resolveNodeName(targetNode);

  /**
   * Determine the relationship context based on connected node types.
   */
  const isCharacterToCharacter =
    sourceNode?.type === 'character' && targetNode?.type === 'character';
  const isActPlot =
    (sourceNode?.type === 'act' && targetNode?.type === 'plot') ||
    (sourceNode?.type === 'plot' && targetNode?.type === 'act');

  // ==================== ACT-PLOT RELATIONSHIP ====================

  if (isActPlot) {
    const actNode = sourceNode?.type === 'act' ? sourceNode : targetNode;
    const plotNode = sourceNode?.type === 'plot' ? sourceNode : targetNode;
    const actName = resolveNodeName(actNode);
    const plotName = resolveNodeName(plotNode);

    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
        {/* Header */}
        <div className="bg-editor-bg rounded-lg p-3 text-center">
          <p className="text-sm text-editor-muted mb-1">Act-Plot Connection</p>
          <p className="text-base font-semibold text-editor-text">
            <span className="text-indigo-400">{actName}</span>
            <span className="text-editor-muted mx-2">&harr;</span>
            <span className="text-amber-400">{plotName}</span>
          </p>
        </div>

        {/* Plot Involvement */}
        <div>
          <label className="input-label flex items-center gap-1">
            Plot Involvement
            <InfoTooltip content={STORY_TOOLTIPS.actPlotRelationship || 'Describe what parts of this plot arc play out during this act. What key events, turning points, and developments from this plot happen here? How does the plot advance in this act?'} />
          </label>
          <textarea
            value={data.plotInvolvement || ''}
            onChange={(e) => updateData({ plotInvolvement: e.target.value })}
            className="input min-h-[200px] resize-y"
            placeholder="What parts of this plot play out in this act? Describe the key events, turning points, and developments..."
          />
        </div>
      </div>
    );
  }

  // ==================== CHARACTER-TO-CHARACTER RELATIONSHIP ====================

  if (isCharacterToCharacter) {
    /** Current act developments (or empty array) */
    const actDevelopments = data.actDevelopments || [];

    /** Add a new act development entry */
    const addActDevelopment = () => {
      const nextNum = actDevelopments.length + 1;
      updateData({
        actDevelopments: [
          ...actDevelopments,
          { actLabel: `Act ${nextNum}`, development: '' },
        ],
      });
    };

    /** Remove an act development entry by index */
    const removeActDevelopment = (index: number) => {
      const updated = actDevelopments.filter((_, i) => i !== index);
      updateData({ actDevelopments: updated });
    };

    /** Update a specific act development entry */
    const updateActDevelopment = (
      index: number,
      field: 'actLabel' | 'development',
      value: string
    ) => {
      const updated = actDevelopments.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry
      );
      updateData({ actDevelopments: updated });
    };

    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
        {/* Relationship Header */}
        <div className="bg-editor-bg rounded-lg p-3 text-center">
          <p className="text-sm text-editor-muted mb-1">Relationship between</p>
          <p className="text-base font-semibold text-editor-text">
            {sourceName}
            <span className="text-editor-muted mx-2">&harr;</span>
            {targetName}
          </p>
        </div>

        {/* Relationship Type */}
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

        {/* Beginning */}
        <div>
          <label className="input-label flex items-center gap-1">
            Beginning
            <InfoTooltip content={STORY_TOOLTIPS.relationshipBeginning || 'How is this relationship at the very start of the story? What is the status quo before events force it to change? This establishes the baseline the audience measures all future changes against.'} />
          </label>
          <textarea
            value={data.beginning || ''}
            onChange={(e) => updateData({ beginning: e.target.value })}
            className="input min-h-[80px] resize-y"
            placeholder="How is this relationship at the start of the story?"
          />
        </div>

        {/* Dynamic Act Development */}
        <div>
          <label className="input-label flex items-center gap-1 mb-2">
            Development Across Acts
            <InfoTooltip content={STORY_TOOLTIPS.actDevelopment || 'Track how this relationship evolves through each act of the story. Relationships should change — new information, betrayals, shared ordeals, and revelations all reshape how characters feel about each other.'} />
          </label>

          {actDevelopments.map((entry, index) => (
            <div
              key={index}
              className="mb-3 p-3 rounded-lg bg-editor-bg/50 border border-editor-border space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={entry.actLabel}
                  onChange={(e) =>
                    updateActDevelopment(index, 'actLabel', e.target.value)
                  }
                  className="input flex-1 text-sm"
                  placeholder="Act label (e.g., Act 1)"
                />
                <button
                  onClick={() => removeActDevelopment(index)}
                  className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-red-400"
                  title="Remove this act entry"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                value={entry.development}
                onChange={(e) =>
                  updateActDevelopment(index, 'development', e.target.value)
                }
                className="input min-h-[60px] resize-y text-sm"
                placeholder="How does this relationship change during this act?"
              />
            </div>
          ))}

          <button
            onClick={addActDevelopment}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-editor-bg border border-editor-border hover:bg-editor-surface transition-colors text-editor-text"
          >
            <Plus size={12} />
            Add Act Entry
          </button>
        </div>

        {/* Ending */}
        <div>
          <label className="input-label flex items-center gap-1">
            Ending
            <InfoTooltip content={STORY_TOOLTIPS.relationshipEnding || 'How is this relationship at the end of the story? Has it deepened, broken, reversed, or reached a new understanding? The ending should feel like a natural consequence of everything that happened.'} />
          </label>
          <textarea
            value={data.ending || ''}
            onChange={(e) => updateData({ ending: e.target.value })}
            className="input min-h-[80px] resize-y"
            placeholder="How is this relationship at the end of the story?"
          />
        </div>

        {/* Separator */}
        <div className="h-px bg-editor-border" />

        {/* Description (existing field, preserved) */}
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

        {/* Status (existing field, preserved) */}
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

        {/* History (existing field, preserved) */}
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

  // ==================== DEFAULT FALLBACK ====================
  // For any edge that's not character-to-character or act-to-plot,
  // show the original generic relationship fields.

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* Relationship Header */}
      <div className="bg-editor-bg rounded-lg p-3 text-center">
        <p className="text-sm text-editor-muted mb-1">Connection between</p>
        <p className="text-base font-semibold text-editor-text">
          {sourceName}
          <span className="text-editor-muted mx-2">&harr;</span>
          {targetName}
        </p>
      </div>

      {/* Relationship Type */}
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
      </div>

      {/* Description */}
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

      {/* Status */}
      <div>
        <label className="input-label flex items-center gap-1">
          Status
          <InfoTooltip content="The current state of the relationship at this point in the story." />
        </label>
        <input
          type="text"
          value={data.status || ''}
          onChange={(e) => updateData({ status: e.target.value })}
          className="input"
          placeholder="e.g., Active, Broken, Developing, Secret, Strained"
        />
      </div>

      {/* History */}
      <div>
        <label className="input-label flex items-center gap-1">
          History
          <InfoTooltip content="How has this relationship evolved over time? Key moments that defined or changed it." />
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
