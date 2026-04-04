/**
 * =============================================================================
 * CHARACTER LENS PANEL — "Character Lens"
 * =============================================================================
 *
 * A fullscreen overlay that displays the AI-generated mind states of characters
 * present in the current Open World scene. Uses a two-screen design:
 *
 * SCREEN 1 — Character Gallery (default):
 *   - Responsive grid of large character images + names
 *   - No mind state text — clean photo-gallery style
 *   - Click any character to open their detail view
 *
 * SCREEN 2 — Character Detail (after clicking):
 *   - Large character image on the left
 *   - Mind state fields (feeling, thinkingSituation, thinkingOthers, theoryOfMind)
 *     displayed with bigger fonts on the right
 *   - All fields are editable (click to edit, blur to save)
 *   - Edited fields show a small "edited" badge
 *   - "Back" button to return to gallery view
 *
 * Rendered via createPortal to document.body so it sits above all other UI.
 * Dismissible via the X button, Escape key, or clicking the backdrop.
 *
 * =============================================================================
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X, Heart, Brain, Users, User, ArrowLeft } from 'lucide-react';
import { getBlobUrl } from '@/utils/blobCache';

// --- Types ---

/** The four dimensions of a character's mental state */
export interface MindState {
  feeling: string;
  thinkingSituation: string;
  thinkingOthers: string;
  theoryOfMind: string;
}

/** Minimal entity info needed for display */
interface EntityInfo {
  id: string;
  name: string;
  category: string;
  referenceImage?: string;
  summary?: string;
}

interface CharacterLensPanelProps {
  /** Map of entity ID -> mind state object */
  mindStates: Record<string, MindState>;
  /** All project entities (we filter to those with mind states) */
  entities: EntityInfo[];
  /** Called when the user closes the panel */
  onClose: () => void;
  /** Called when the user edits a mind state field */
  onMindStateChange: (entityId: string, field: keyof MindState, value: string) => void;
}

// --- Mind state field metadata (icon, label, accent color) ---
// Used in the detail view to render each of the four mind-state dimensions
// with distinct visual styling so users can quickly scan at a glance.
const MIND_FIELDS: Array<{
  key: keyof MindState;
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  bgColor: string;
}> = [
  {
    key: 'feeling',
    label: 'Feeling',
    icon: <Heart size={16} />,
    accentColor: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
  },
  {
    key: 'thinkingSituation',
    label: 'Thinking about situation',
    icon: <Brain size={16} />,
    accentColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    key: 'thinkingOthers',
    label: 'Thinking about others',
    icon: <Users size={16} />,
    accentColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    key: 'theoryOfMind',
    label: 'Theory of mind',
    icon: <Eye size={16} />,
    accentColor: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
];

// --- Component ---

export default function CharacterLensPanel({
  mindStates,
  entities,
  onClose,
  onMindStateChange,
}: CharacterLensPanelProps) {
  // Scale-in animation state
  const [visible, setVisible] = useState(false);

  // Track which character is selected for the detail view (null = gallery view)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Track which fields have been manually edited (entity:field -> true)
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());

  // Trigger scale-in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  // Escape key handler — goes back to gallery if in detail view, otherwise closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedCharacterId) {
          setSelectedCharacterId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedCharacterId]);

  /**
   * Handle blur (save) on a mind state textarea.
   * Marks the field as edited and propagates the change up.
   */
  const handleFieldBlur = useCallback(
    (entityId: string, field: keyof MindState, value: string) => {
      onMindStateChange(entityId, field, value);
      setEditedFields((prev) => {
        const next = new Set(prev);
        next.add(`${entityId}:${field}`);
        return next;
      });
    },
    [onMindStateChange]
  );

  // Filter entities to only those that have mind states
  const charactersWithStates = entities.filter((e) => mindStates[e.id]);

  /**
   * Compute the number of grid columns based on character count.
   * Aims for a visually balanced gallery layout:
   * - 1 character:  1 column (fills center)
   * - 2-3 chars:    2 columns (large images)
   * - 4-5 chars:    3 columns
   * - 6-10 chars:   up to 4-5 columns
   */
  const gridColumns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(charactersWithStates.length))));

  // Resolve the selected entity and its mind state for the detail view
  const selectedEntity = selectedCharacterId
    ? charactersWithStates.find((e) => e.id === selectedCharacterId) || null
    : null;
  const selectedState = selectedCharacterId ? mindStates[selectedCharacterId] : null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={(e) => {
        // Close when clicking the backdrop (not the panel or its children)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop — semi-transparent dark with blur, covers entire screen */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Panel — centered, 85% of screen */}
      <div
        className="relative overflow-hidden rounded-2xl transition-all duration-500 ease-out flex flex-col"
        style={{
          width: '85vw',
          height: '85vh',
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          background: 'linear-gradient(135deg, rgba(25, 15, 10, 0.97) 0%, rgba(15, 10, 5, 0.98) 100%)',
          border: '1px solid rgba(249, 115, 22, 0.2)',
        }}
      >
        {/* Header — always visible, shows panel title and close button */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-4"
          style={{
            background: 'rgba(25, 15, 10, 0.95)',
            borderBottom: '1px solid rgba(249, 115, 22, 0.15)',
          }}
        >
          <div className="flex items-center gap-3">
            <Eye size={24} style={{ color: '#f97316' }} />
            <h2 className="text-xl font-bold text-orange-100">Character Lens</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body — switches between gallery and detail view */}
        <div className="flex-1 overflow-y-auto">
          {charactersWithStates.length === 0 ? (
            /* Empty state — no characters have mind states */
            <div className="flex items-center justify-center h-full">
              <p className="text-white/40 text-center italic text-lg">
                No character mind states available for this scene.
              </p>
            </div>
          ) : selectedEntity && selectedState ? (
            /* ========== SCREEN 2: Character Detail View ========== */
            <div className="flex flex-col h-full">
              {/* Back button — returns to gallery */}
              <div className="flex-shrink-0 px-6 pt-4 pb-2">
                <button
                  onClick={() => setSelectedCharacterId(null)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span className="text-sm font-medium">Back to Characters</span>
                </button>
              </div>

              {/* Detail content: image on left, mind state on right */}
              <div className="flex-1 flex flex-col lg:flex-row gap-8 px-6 pb-6 overflow-y-auto">
                {/* Left column: Large character image + name */}
                <div className="lg:w-1/3 flex-shrink-0 flex flex-col items-center lg:items-start">
                  <div
                    className="aspect-square w-full max-w-[400px] rounded-2xl overflow-hidden bg-white/5 flex items-center justify-center"
                    style={{ border: '1px solid rgba(249, 115, 22, 0.15)' }}
                  >
                    {selectedEntity.referenceImage ? (
                      <img
                        src={getBlobUrl(selectedEntity.referenceImage)}
                        alt={selectedEntity.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={80} className="text-white/20" />
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-orange-100 mt-4">
                    {selectedEntity.name}
                  </h2>
                  <span className="text-xs uppercase tracking-wider text-white/40 mt-1">
                    {selectedEntity.category}
                  </span>
                  {selectedEntity.summary && (
                    <p className="text-sm text-white/30 mt-2 leading-relaxed">
                      {selectedEntity.summary}
                    </p>
                  )}
                </div>

                {/* Right column: Mind state fields — bigger fonts, editable */}
                <div className="flex-1 space-y-4">
                  <h3 className="text-lg font-semibold text-white/50 mb-2">Mind State</h3>
                  {MIND_FIELDS.map(({ key, label, icon, accentColor, bgColor }) => {
                    const fieldKey = `${selectedEntity.id}:${key}`;
                    const isEdited = editedFields.has(fieldKey);

                    return (
                      <div key={key} className={`rounded-xl p-4 ${bgColor}`}>
                        {/* Field label with icon */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className={accentColor}>{icon}</span>
                          <span className={`text-sm font-semibold uppercase tracking-wide ${accentColor}`}>
                            {label}
                          </span>
                          {isEdited && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium ml-auto">
                              edited
                            </span>
                          )}
                        </div>

                        {/* Editable textarea — bigger font in detail view */}
                        <MindStateTextarea
                          value={selectedState[key] || ''}
                          onSave={(val) => handleFieldBlur(selectedEntity.id, key, val)}
                          large
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ========== SCREEN 1: Character Gallery View ========== */
            <div className="p-6 flex items-center justify-center min-h-full">
              <div
                className="grid gap-6 w-full"
                style={{
                  gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
                  maxWidth: gridColumns <= 2 ? '700px' : undefined,
                }}
              >
                {charactersWithStates.map((entity) => (
                  <button
                    key={entity.id}
                    onClick={() => setSelectedCharacterId(entity.id)}
                    className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-white/5 transition-colors group"
                  >
                    {/* Character image — large, filling most of the card */}
                    <div
                      className="aspect-square w-full rounded-xl overflow-hidden bg-white/5 flex items-center justify-center transition-transform group-hover:scale-[1.02]"
                      style={{ border: '1px solid rgba(249, 115, 22, 0.1)' }}
                    >
                      {entity.referenceImage ? (
                        <img
                          src={getBlobUrl(entity.referenceImage)}
                          alt={entity.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User size={48} className="text-white/20" />
                      )}
                    </div>
                    {/* Character name */}
                    <span className="text-base font-semibold text-orange-100 truncate max-w-full">
                      {entity.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// --- Inline editable textarea sub-component ---

/**
 * A click-to-edit textarea for mind state text.
 * Displays as static italic text; clicking activates edit mode.
 * Blurs to save the new value. Supports a "large" variant for the
 * detail view (bigger font size and min-height).
 */
function MindStateTextarea({
  value,
  onSave,
  large = false,
}: {
  value: string;
  onSave: (val: string) => void;
  /** When true, uses larger font and taller min-height for the detail view */
  large?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local value when prop changes (e.g., new scene loaded)
  useEffect(() => {
    if (!editing) setLocalValue(value);
  }, [value, editing]);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const textSizeClass = large ? 'text-base' : 'text-sm';

  if (!editing) {
    return (
      <p
        className={`${textSizeClass} text-white/60 leading-relaxed cursor-text min-h-[1.5em] italic`}
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {localValue || '(click to add)'}
      </p>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      className={`w-full ${textSizeClass} text-white/80 leading-relaxed bg-black/30 border border-white/10 rounded px-2 py-1.5 resize-y focus:outline-none focus:border-orange-500/40 italic`}
      style={{ fontFamily: 'Georgia, "Times New Roman", serif', minHeight: large ? '5em' : '4em' }}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (localValue !== value) {
          onSave(localValue);
        }
      }}
      onKeyDown={(e) => {
        // Ctrl/Cmd+Enter to save and exit
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}
