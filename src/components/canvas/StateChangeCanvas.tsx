/**
 * =============================================================================
 * STATE CHANGE CANVAS
 * =============================================================================
 *
 * A full-area canvas (not a modal) that shows a horizontal timeline of how
 * a selected entity evolves across the story's co-writing nodes.
 *
 * Rendered as the third canvas tab alongside Story Canvas and Character Canvas.
 * Entity and level are selected via dropdowns in the top bar.
 *
 * Opening from the Entity Manager pre-selects the entity via the editor store's
 * `stateChangeEntityId` field.
 *
 * =============================================================================
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Users, GitBranch, Film, Clapperboard, BookOpen, Layers } from 'lucide-react';
import { useProjectStore } from '@stores/useProjectStore';
import { useEditorStore } from '@stores/useEditorStore';
import {
  getCowriteNodesInOrder,
  filterStepsByLevel,
  COWRITE_LEVELS,
  LEVEL_LABELS,
  type CowriteNodeLevel,
} from '@/utils/entityPatchUtils';

// =============================================================================
// LEVEL ICONS
// =============================================================================

const LEVEL_ICONS: Record<CowriteNodeLevel, React.ReactNode> = {
  story: <BookOpen size={13} />,
  plot:  <GitBranch size={13} />,
  act:   <Layers size={13} />,
  scene: <Film size={13} />,
  shot:  <Clapperboard size={13} />,
};

// =============================================================================
// TIMELINE CARD — one node in the timeline
// =============================================================================

interface TimelineCardProps {
  label: string;
  level: CowriteNodeLevel;
  changeText: string | undefined;
  entityName: string;
  cardWidth: number;
  index: number;
}

function TimelineCard({ label, level, changeText, entityName, cardWidth, index }: TimelineCardProps) {
  const hasChanges = !!(changeText?.trim());

  return (
    <div
      className={`
        flex-shrink-0 flex flex-col rounded-xl border-2 overflow-hidden
        ${hasChanges
          ? 'border-violet-500/60 bg-violet-900/20'
          : 'border-editor-border/40 bg-editor-surface/30'}
      `}
      style={{ width: cardWidth, minWidth: cardWidth }}
    >
      {/* Header */}
      <div className={`
        px-3 py-2 flex items-start gap-2 border-b flex-shrink-0
        ${hasChanges ? 'border-violet-500/40 bg-violet-900/30' : 'border-editor-border/30 bg-editor-surface/40'}
      `}>
        <span className={`
          text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5
          ${hasChanges ? 'bg-violet-800/60 text-violet-200' : 'bg-editor-bg/60 text-editor-muted'}
        `}>
          #{index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold truncate ${hasChanges ? 'text-violet-100' : 'text-editor-muted'}`}>
            {label || 'Unnamed'}
          </div>
          <div className={`text-[10px] flex items-center gap-1 mt-0.5 ${hasChanges ? 'text-violet-300/70' : 'text-editor-muted/50'}`}>
            {LEVEL_ICONS[level]}
            {LEVEL_LABELS[level]}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-3 py-3 overflow-y-auto">
        {hasChanges ? (
          <p className="text-xs text-editor-text leading-relaxed whitespace-pre-wrap">{changeText}</p>
        ) : (
          <p className="text-[11px] text-editor-muted/60 italic">
            No changes recorded for <span className="not-italic text-editor-muted/80">{entityName}</span> in this {LEVEL_LABELS[level].toLowerCase()}.
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function StateChangeCanvas() {
  const currentProject = useProjectStore(s => s.currentProject);

  // Read the pre-selected entity from the editor store (set by EntityManager)
  const storeEntityId     = useEditorStore(s => s.stateChangeEntityId);
  const setStoreEntityId  = useEditorStore(s => s.setStateChangeEntityId);

  const [selectedEntityId, setSelectedEntityId] = useState<string>(storeEntityId || '');
  const [selectedLevel,    setSelectedLevel]    = useState<CowriteNodeLevel>('scene');
  const [zoom,             setZoom]             = useState(1.0);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * When EntityManager navigates here with a pre-selected entity,
   * sync the local state and clear the store value so re-opens
   * don't keep re-selecting the same entity.
   */
  useEffect(() => {
    if (storeEntityId) {
      setSelectedEntityId(storeEntityId);
      setStoreEntityId(null);
    }
  }, [storeEntityId, setStoreEntityId]);

  // All entities for the dropdown
  const allEntities = useMemo(() => currentProject?.entities ?? [], [currentProject?.entities]);

  // Selected entity object
  const selectedEntity = useMemo(
    () => allEntities.find(e => e.id === selectedEntityId),
    [allEntities, selectedEntityId]
  );

  // All co-write nodes in BFS order
  const allSteps = useMemo(() => {
    if (!currentProject) return [];
    return getCowriteNodesInOrder(currentProject.nodes, currentProject.edges);
  }, [currentProject]);

  // Filtered to the selected level
  const levelSteps = useMemo(
    () => filterStepsByLevel(allSteps, selectedLevel),
    [allSteps, selectedLevel]
  );

  // Node lookup map for O(1) access
  const nodesById = useMemo(
    () => new Map((currentProject?.nodes ?? []).map(n => [n.id, n])),
    [currentProject?.nodes]
  );

  // How many level steps have data for the selected entity
  const stepsWithChanges = useMemo(() => {
    if (!selectedEntityId) return 0;
    return levelSteps.filter(s => {
      const changes = (nodesById.get(s.nodeId)?.data as any)?.entityStateChanges as Record<string, string> | undefined;
      return changes?.[selectedEntityId]?.trim();
    }).length;
  }, [levelSteps, nodesById, selectedEntityId]);

  const cardWidth = Math.round(260 * zoom);

  const handleZoomIn  = useCallback(() => setZoom(z => Math.min(3.0, +(z + 0.2).toFixed(1))), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1))), []);

  // Redirect vertical mouse-wheel to horizontal scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-editor-bg">

      {/* ── TOP BAR ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-editor-border bg-editor-surface flex-shrink-0 flex-wrap gap-y-2">

        {/* Entity selector */}
        <div className="flex items-center gap-2">
          <Users size={14} className="text-violet-400 flex-shrink-0" />
          <label className="text-xs text-editor-muted flex-shrink-0">Entity:</label>
          <select
            value={selectedEntityId}
            onChange={e => setSelectedEntityId(e.target.value)}
            className="text-xs bg-editor-bg border border-editor-border rounded px-2 py-1 text-editor-text outline-none max-w-[220px]"
          >
            <option value="">— select entity —</option>
            {allEntities.map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.category})</option>
            ))}
          </select>
        </div>

        <div className="w-px h-4 bg-editor-border" />

        {/* Level selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-editor-muted flex-shrink-0">Level:</label>
          <select
            value={selectedLevel}
            onChange={e => setSelectedLevel(e.target.value as CowriteNodeLevel)}
            className="text-xs bg-editor-bg border border-editor-border rounded px-2 py-1 text-editor-text outline-none"
          >
            {COWRITE_LEVELS.map(level => (
              <option key={level} value={level}>{LEVEL_LABELS[level]}</option>
            ))}
          </select>
        </div>

        <div className="w-px h-4 bg-editor-border" />

        {/* Stats */}
        <span className="text-[11px] text-editor-muted">
          {levelSteps.length} {LEVEL_LABELS[selectedLevel].toLowerCase()} node{levelSteps.length !== 1 ? 's' : ''}
          {selectedEntityId && levelSteps.length > 0 && (
            <> · <span className={stepsWithChanges > 0 ? 'text-violet-400' : ''}>{stepsWithChanges} with changes</span></>
          )}
        </span>

        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={handleZoomOut} className="p-1 rounded hover:bg-editor-surface text-editor-muted hover:text-editor-text" title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-editor-muted w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="p-1 rounded hover:bg-editor-surface text-editor-muted hover:text-editor-text" title="Zoom in">
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {/* ── TIMELINE AREA ── */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex-1 overflow-x-auto overflow-y-hidden p-4"
      >
        {/* No entity selected */}
        {!selectedEntityId && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3 text-editor-muted">
              <Users size={48} className="mx-auto opacity-20" />
              <p className="text-sm">Select an entity above to view its state change timeline.</p>
              <p className="text-xs opacity-50">You can also open this view from the Entity Manager → State Change Timeline button.</p>
            </div>
          </div>
        )}

        {/* Entity selected, no nodes at this level */}
        {selectedEntityId && levelSteps.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2 text-editor-muted">
              <p className="text-sm">No {LEVEL_LABELS[selectedLevel]} nodes found in this project.</p>
              <p className="text-xs opacity-60">Try a different level, or add co-writing structure nodes to the Story Canvas.</p>
            </div>
          </div>
        )}

        {/* Timeline cards */}
        {selectedEntityId && levelSteps.length > 0 && (
          <div
            className="flex items-stretch gap-3"
            style={{ minWidth: 'max-content', height: 'calc(100% - 0px)' }}
          >
            {levelSteps.map((step, index) => {
              const node = nodesById.get(step.nodeId);
              const entityChanges = (node?.data as any)?.entityStateChanges as Record<string, string> | undefined;
              return (
                <TimelineCard
                  key={step.nodeId}
                  label={step.label}
                  level={step.level}
                  changeText={entityChanges?.[selectedEntityId]}
                  entityName={selectedEntity?.name ?? selectedEntityId}
                  cardWidth={cardWidth}
                  index={index}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── STATUS BAR ── */}
      <div className="px-4 py-1.5 border-t border-editor-border bg-editor-surface/50 flex items-center gap-4 flex-shrink-0">
        <span className="text-[10px] text-editor-muted">
          Scroll horizontally to navigate the timeline · Mouse wheel scrolls · Zoom to resize cards
        </span>
        {selectedEntity && (
          <span className="text-[10px] text-violet-400 ml-auto">
            {selectedEntity.name} · {selectedEntity.category}
          </span>
        )}
      </div>
    </div>
  );
}
