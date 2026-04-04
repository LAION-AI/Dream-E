/**
 * =============================================================================
 * CHARACTER LENS PANEL — "Character Lens"
 * =============================================================================
 *
 * A fullscreen overlay that displays the AI-generated mind states of characters
 * present in the current Open World scene. Each character card shows what the
 * character is feeling, thinking about the situation, thinking about others,
 * and their theory-of-mind (what they think others are thinking).
 *
 * All four mind-state fields are editable — the player can override the AI's
 * interpretation, and these overrides will be injected into the next scene's
 * context for the AI to consider. Edited fields show a small "edited" badge.
 *
 * DESIGN:
 * - Dark translucent backdrop
 * - Header with Eye icon + "Character Lens" title + close X
 * - Responsive grid of character cards (2-3 columns on desktop)
 * - Character image (or placeholder) + name + category badge
 * - Four labeled sections with colored accent icons
 * - Editable textareas with italic serif text
 * - Rendered via createPortal to document.body
 *
 * =============================================================================
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X, Heart, Brain, Users, User } from 'lucide-react';
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
    icon: <Heart size={14} />,
    accentColor: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
  },
  {
    key: 'thinkingSituation',
    label: 'Thinking about situation',
    icon: <Brain size={14} />,
    accentColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    key: 'thinkingOthers',
    label: 'Thinking about others',
    icon: <Users size={14} />,
    accentColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    key: 'theoryOfMind',
    label: 'Theory of mind',
    icon: <Eye size={14} />,
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
  // Slide-in animation state
  const [visible, setVisible] = useState(false);

  // Track which fields have been manually edited (entity:field → true)
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());

  // Trigger slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Panel — centered, 80% of screen */}
      <div
        className="relative overflow-y-auto rounded-2xl transition-all duration-500 ease-out"
        style={{
          width: '85vw',
          height: '85vh',
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          background: 'linear-gradient(135deg, rgba(25, 15, 10, 0.97) 0%, rgba(15, 10, 5, 0.98) 100%)',
          border: '1px solid rgba(249, 115, 22, 0.2)',
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
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

        {/* Character cards grid */}
        <div className="p-6">
          {charactersWithStates.length === 0 ? (
            <p className="text-white/40 text-center italic mt-12">
              No character mind states available for this scene.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {charactersWithStates.map((entity) => {
                const state = mindStates[entity.id];
                if (!state) return null;

                return (
                  <div
                    key={entity.id}
                    className="rounded-xl overflow-hidden border"
                    style={{
                      background: 'rgba(35, 25, 15, 0.7)',
                      borderColor: 'rgba(249, 115, 22, 0.12)',
                    }}
                  >
                    {/* Character header — large image + name + category */}
                    <div className="flex items-center gap-4 p-5 border-b"
                      style={{ borderColor: 'rgba(249, 115, 22, 0.1)' }}
                    >
                      {/* Character image — large and prominent */}
                      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-white/5 flex items-center justify-center">
                        {entity.referenceImage ? (
                          <img
                            src={getBlobUrl(entity.referenceImage)}
                            alt={entity.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User size={36} className="text-white/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-orange-100 truncate">
                          {entity.name}
                        </h3>
                        <span className="text-xs uppercase tracking-wider text-white/40">
                          {entity.category}
                        </span>
                        {entity.summary && (
                          <p className="text-sm text-white/30 mt-1 line-clamp-1">{entity.summary}</p>
                        )}
                      </div>
                    </div>

                    {/* Mind state fields */}
                    <div className="p-4 space-y-3">
                      {MIND_FIELDS.map(({ key, label, icon, accentColor, bgColor }) => {
                        const fieldKey = `${entity.id}:${key}`;
                        const isEdited = editedFields.has(fieldKey);

                        return (
                          <div key={key} className={`rounded-lg p-3 ${bgColor}`}>
                            {/* Field label with icon */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className={accentColor}>{icon}</span>
                              <span className={`text-xs font-semibold uppercase tracking-wide ${accentColor}`}>
                                {label}
                              </span>
                              {isEdited && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium ml-auto">
                                  edited
                                </span>
                              )}
                            </div>

                            {/* Editable textarea — italic serif text */}
                            <MindStateTextarea
                              value={state[key] || ''}
                              onSave={(val) => handleFieldBlur(entity.id, key, val)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
 * Blurs to save the new value.
 */
function MindStateTextarea({
  value,
  onSave,
}: {
  value: string;
  onSave: (val: string) => void;
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

  if (!editing) {
    return (
      <p
        className="text-sm text-white/60 leading-relaxed cursor-text min-h-[1.5em] italic"
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
      className="w-full text-sm text-white/80 leading-relaxed bg-black/30 border border-white/10 rounded px-2 py-1.5 resize-y focus:outline-none focus:border-orange-500/40 italic"
      style={{ fontFamily: 'Georgia, "Times New Roman", serif', minHeight: '4em' }}
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
