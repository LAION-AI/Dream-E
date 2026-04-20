/**
 * =============================================================================
 * ENTITY STATE CHANGES SECTION
 * =============================================================================
 *
 * Reusable inspector section for every co-writing node type.
 *
 * Each entity that changes during this story segment gets a colored card
 * with a freeform text area. Authors describe physical, emotional,
 * psychological, social, medical, goal, and intention changes — plus
 * the rationale for each change.
 *
 * SUGGESTED ENTITIES (new):
 * Callers can pass `suggestedEntityIds` — entity IDs already linked to
 * the node (e.g. scene participants). These appear as one-click chips
 * so the user can instantly add state-change entries for them without
 * going through the full entity picker.
 *
 * =============================================================================
 */

import React, { useState, useMemo } from 'react';
import { Users, Plus, Trash2, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { useProjectStore } from '@stores/useProjectStore';
import InfoTooltip from '@components/common/InfoTooltip';

// =============================================================================
// COLOR PALETTE — one distinct color per entity slot (cycling)
// =============================================================================

const ENTITY_COLORS = [
  { border: 'border-blue-500/50',   bg: 'bg-blue-900/20',   header: 'text-blue-300',   badge: 'bg-blue-900/40 text-blue-300' },
  { border: 'border-green-500/50',  bg: 'bg-green-900/20',  header: 'text-green-300',  badge: 'bg-green-900/40 text-green-300' },
  { border: 'border-orange-500/50', bg: 'bg-orange-900/20', header: 'text-orange-300', badge: 'bg-orange-900/40 text-orange-300' },
  { border: 'border-rose-500/50',   bg: 'bg-rose-900/20',   header: 'text-rose-300',   badge: 'bg-rose-900/40 text-rose-300' },
  { border: 'border-purple-500/50', bg: 'bg-purple-900/20', header: 'text-purple-300', badge: 'bg-purple-900/40 text-purple-300' },
  { border: 'border-teal-500/50',   bg: 'bg-teal-900/20',   header: 'text-teal-300',   badge: 'bg-teal-900/40 text-teal-300' },
  { border: 'border-yellow-500/50', bg: 'bg-yellow-900/20', header: 'text-yellow-300', badge: 'bg-yellow-900/40 text-yellow-300' },
  { border: 'border-pink-500/50',   bg: 'bg-pink-900/20',   header: 'text-pink-300',   badge: 'bg-pink-900/40 text-pink-300' },
];

// =============================================================================
// PROPS
// =============================================================================

export interface EntityStatePatchSectionProps {
  /** Dictionary: entity ID → change description for this time step */
  entityStateChanges?: Record<string, string>;
  /** Label for the scope — e.g. "during this scene" */
  scopeLabel?: string;
  /**
   * Entity IDs already linked to this node (e.g. scene participants).
   * Shown as one-click chips so the user can quickly add them without
   * navigating the full entity picker. These come from the world model.
   */
  suggestedEntityIds?: string[];
  /** Callback when the dictionary changes */
  onStateChangesChange: (value: Record<string, string>) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function EntityStatePatchSection({
  entityStateChanges,
  scopeLabel = 'during this story segment',
  suggestedEntityIds,
  onStateChangesChange,
}: EntityStatePatchSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [addingEntity, setAddingEntity] = useState(false);
  const [pickerValue, setPickerValue] = useState('');

  // Access the world database to look up entity names
  const currentProject = useProjectStore(s => s.currentProject);

  /** All entities in a flat list for name lookup and picker */
  const allEntities = useMemo(() => currentProject?.entities ?? [], [currentProject?.entities]);

  /** Map entity ID → entity name for fast lookup */
  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    allEntities.forEach(e => map.set(e.id, e.name));
    return map;
  }, [allEntities]);

  // Guard against the field being stored as a string (old/corrupt format).
  // If it's not a plain object, treat as empty so the UI doesn't show
  // character indices (Object.keys("string") → ["0","1","2",...]).
  const changes: Record<string, string> = (
    entityStateChanges && typeof entityStateChanges === 'object' && !Array.isArray(entityStateChanges)
      ? entityStateChanges
      : {}
  );
  const entityIds = Object.keys(changes);

  /**
   * Suggested entity IDs from the scene that are NOT yet in the state-changes
   * dict — shown as quick-add chips.
   */
  const unaddedSuggestions = useMemo(() => {
    if (!suggestedEntityIds?.length) return [];
    const inDict = new Set(entityIds);
    return suggestedEntityIds.filter(id => !inDict.has(id));
  }, [suggestedEntityIds, entityIds]);

  /** Entities not yet in the dictionary — available to add via picker */
  const availableEntities = useMemo(
    () => allEntities.filter(e => !entityIds.includes(e.id)),
    [allEntities, entityIds]
  );

  const handleUpdate = (entityId: string, value: string) => {
    onStateChangesChange({ ...changes, [entityId]: value });
  };

  const handleRemove = (entityId: string) => {
    const next = { ...changes };
    delete next[entityId];
    onStateChangesChange(next);
  };

  /** Add an entity (from chip or picker) with an empty description */
  const handleAddEntity = (entityId: string) => {
    if (!entityId || entityId in changes) return;
    onStateChangesChange({ ...changes, [entityId]: '' });
    setPickerValue('');
    setAddingEntity(false);
  };

  return (
    <div className="border-t border-editor-border/50 pt-5 space-y-3">
      {/* ── SECTION HEADING ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        {expanded
          ? <ChevronDown  size={14} className="text-violet-400 flex-shrink-0" />
          : <ChevronRight size={14} className="text-violet-400 flex-shrink-0" />}
        <Users size={14} className="text-violet-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-violet-300">Entity State Changes</span>
        {entityIds.length > 0 && (
          <span className="ml-auto text-[10px] bg-violet-900/60 text-violet-300 px-1.5 py-0.5 rounded-full">
            {entityIds.length} {entityIds.length === 1 ? 'entity' : 'entities'}
          </span>
        )}
        <InfoTooltip content={`Record how each entity changes ${scopeLabel}. Describe physical, emotional, psychological, social, medical, goal, and intention changes — with the rationale for each. The AI co-writer populates this automatically.`} />
      </button>

      {expanded && (
        <div className="space-y-3">

          {/* ── QUICK-ADD CHIPS (scene-linked entities not yet tracked) ── */}
          {unaddedSuggestions.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-violet-400/70">
                <Zap size={10} />
                <span>Entities in this scene — click to track their changes:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unaddedSuggestions.map(id => {
                  const name = entityNameMap.get(id);
                  if (!name) return null; // entity was deleted from world model
                  return (
                    <button
                      key={id}
                      onClick={() => handleAddEntity(id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-violet-900/30 border border-violet-500/30 text-violet-300 hover:bg-violet-900/60 hover:border-violet-500/60 transition-colors"
                    >
                      <Plus size={10} />
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ENTITY ENTRIES (colored cards) ── */}
          {entityIds.length === 0 && unaddedSuggestions.length === 0 && (
            <p className="text-xs text-editor-muted italic pl-1">
              No entity changes recorded yet. Add entities below or ask the AI co-writer to fill this in.
            </p>
          )}

          {entityIds.map((entityId, index) => {
            const color = ENTITY_COLORS[index % ENTITY_COLORS.length];
            const name = entityNameMap.get(entityId) || entityId;
            const ent  = allEntities.find(e => e.id === entityId);

            return (
              <div
                key={entityId}
                className={`rounded-lg border ${color.border} ${color.bg} overflow-hidden`}
              >
                {/* Entity header */}
                <div className={`flex items-center justify-between px-3 py-2 border-b ${color.border}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-semibold truncate ${color.header}`}>{name}</span>
                    {ent && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${color.badge} opacity-80 flex-shrink-0`}>
                        {ent.category}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(entityId)}
                    className="text-editor-muted hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                    title="Remove entry"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Change description textarea */}
                <textarea
                  value={changes[entityId] || ''}
                  onChange={(e) => handleUpdate(entityId, e.target.value)}
                  className="w-full bg-transparent px-3 py-2 text-xs text-editor-text leading-relaxed outline-none resize-y min-h-[80px] placeholder-editor-muted/40"
                  placeholder={`Describe all changes to "${name}" ${scopeLabel}:\nPhysical, injuries, appearance, emotional state, mood, beliefs, goals, intentions, relationships, social status, medical condition...\nInclude WHY and HOW each change occurred.`}
                />
              </div>
            );
          })}

          {/* ── ADD VIA PICKER ── */}
          {addingEntity ? (
            <div className="flex items-center gap-2">
              <select
                value={pickerValue}
                onChange={e => setPickerValue(e.target.value)}
                className="flex-1 text-xs bg-editor-surface border border-editor-border rounded px-2 py-1.5 text-editor-text outline-none"
                autoFocus
              >
                <option value="">— select entity —</option>
                {availableEntities.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.category})</option>
                ))}
              </select>
              <button
                onClick={() => handleAddEntity(pickerValue)}
                disabled={!pickerValue}
                className="text-xs px-2 py-1.5 rounded bg-violet-600/20 border border-violet-500/40 text-violet-300 hover:bg-violet-600/30 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => { setAddingEntity(false); setPickerValue(''); }}
                className="text-xs px-2 py-1.5 rounded bg-editor-bg border border-editor-border text-editor-muted hover:text-editor-text transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingEntity(true)}
              className="flex items-center gap-1.5 text-xs text-violet-400/70 hover:text-violet-300 transition-colors pl-1"
            >
              <Plus size={13} />
              Add other entity
            </button>
          )}

          <p className="text-[10px] text-editor-muted pl-1">
            Changes are linked to the World Database by entity ID. The AI co-writer populates these automatically.
          </p>
        </div>
      )}
    </div>
  );
}
