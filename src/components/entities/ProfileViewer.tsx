/**
 * =============================================================================
 * PROFILE VIEWER — Editable JSON profile displayed as a formatted card
 * =============================================================================
 *
 * Displays structured entity profile data as a human-readable card layout.
 * All leaf values (strings, numbers, booleans) are click-to-edit inline.
 * Array items can be edited, added, or removed.
 * Changes are saved immediately via the onProfileChange callback.
 *
 * - Top-level keys become collapsible section headings
 * - Strings render as editable text (click to edit)
 * - Arrays render as editable bullet lists
 * - Nested objects render as labeled key-value pairs
 *
 * =============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, BookOpen, Plus, Trash2, PlusCircle } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface ProfileViewerProps {
  profile: Record<string, unknown> | null | undefined;
  /** Called with the updated profile whenever the user edits a value */
  onProfileChange?: (profile: Record<string, unknown>) => void;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Format a key like "speechStyle" or "magic_properties" into "Speech Style" */
function formatKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deep-set a value in a nested object using a path array.
 * Returns a new top-level object (shallow clones along the path).
 */
function deepSet(
  obj: Record<string, unknown>,
  path: (string | number)[],
  value: unknown
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const result = { ...obj };
  let current: any = result;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (Array.isArray(current[key])) {
      current[key] = [...current[key]];
    } else if (typeof current[key] === 'object' && current[key] !== null) {
      current[key] = { ...current[key] };
    }
    current = current[key];
  }

  const lastKey = path[path.length - 1];
  current[lastKey] = value;
  return result;
}

/**
 * Deep-delete an array item or object key at the given path.
 */
function deepDelete(
  obj: Record<string, unknown>,
  path: (string | number)[]
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const result = { ...obj };
  let current: any = result;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (Array.isArray(current[key])) {
      current[key] = [...current[key]];
    } else if (typeof current[key] === 'object' && current[key] !== null) {
      current[key] = { ...current[key] };
    }
    current = current[key];
  }

  const lastKey = path[path.length - 1];
  if (Array.isArray(current)) {
    current.splice(lastKey as number, 1);
  } else {
    delete current[lastKey];
  }
  return result;
}

/**
 * Deep-push a value onto an array at the given path.
 */
function deepPush(
  obj: Record<string, unknown>,
  path: (string | number)[],
  value: unknown
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const result = { ...obj };
  let current: any = result;

  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (Array.isArray(current[key])) {
      current[key] = [...current[key]];
    } else if (typeof current[key] === 'object' && current[key] !== null) {
      current[key] = { ...current[key] };
    }
    current = current[key];
  }

  if (Array.isArray(current)) {
    current.push(value);
  }
  return result;
}

// =============================================================================
// INLINE EDIT COMPONENT
// =============================================================================

/**
 * A value that shows as text but becomes an input on click.
 * Auto-saves on blur or Enter.
 */
function InlineEdit({
  value,
  onChange,
  multiline = false,
  className = '',
  placeholder = 'Click to edit...',
}: {
  value: string;
  onChange: (newValue: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // Select all text for easy replacement
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) {
      onChange(draft);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    const style = 'w-full bg-editor-bg border border-accent/40 rounded px-2 py-1 text-sm text-editor-text outline-none focus:border-accent';
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
          className={`${style} min-h-[60px] resize-y`}
          rows={3}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={style}
      />
    );
  }

  // Display mode — clickable to edit
  const displayValue = value || placeholder;
  const isEmpty = !value;
  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:bg-accent/10 rounded px-1 -mx-1 transition-colors ${isEmpty ? 'text-editor-muted italic' : ''} ${className}`}
      title="Click to edit"
    >
      {displayValue}
    </span>
  );
}

// =============================================================================
// VALUE RENDERERS (editable)
// =============================================================================

/**
 * Render any value recursively with inline editing support.
 * path tracks the current position in the profile tree for updates.
 */
function RenderValue({
  value,
  path,
  depth,
  onUpdate,
  onDelete,
  onPush,
}: {
  value: unknown;
  path: (string | number)[];
  depth: number;
  onUpdate: (path: (string | number)[], newValue: unknown) => void;
  onDelete: (path: (string | number)[]) => void;
  onPush: (path: (string | number)[], newValue: unknown) => void;
}): React.ReactElement {
  if (value === null || value === undefined) {
    return (
      <InlineEdit
        value=""
        onChange={(v) => onUpdate(path, v)}
        placeholder="Not set — click to add"
      />
    );
  }

  if (typeof value === 'boolean') {
    return (
      <button
        onClick={() => onUpdate(path, !value)}
        className={`text-sm font-medium px-1 rounded hover:bg-accent/10 transition-colors cursor-pointer ${value ? 'text-green-400' : 'text-red-400'}`}
        title="Click to toggle"
      >
        {value ? 'Yes' : 'No'}
      </button>
    );
  }

  if (typeof value === 'number') {
    return (
      <InlineEdit
        value={String(value)}
        onChange={(v) => {
          const num = Number(v);
          onUpdate(path, isNaN(num) ? v : num);
        }}
        className="text-accent"
      />
    );
  }

  if (typeof value === 'string') {
    const isMultiline = value.includes('\n') || value.length > 200;
    return (
      <InlineEdit
        value={value}
        onChange={(v) => onUpdate(path, v)}
        multiline={isMultiline}
        className="text-sm text-editor-text"
      />
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-editor-muted italic text-sm">Empty list</span>
          <button
            onClick={() => onPush(path, '')}
            className="text-accent/60 hover:text-accent transition-colors"
            title="Add item"
          >
            <PlusCircle size={14} />
          </button>
        </div>
      );
    }
    // Simple string/number arrays — editable bullet list
    const isSimple = value.every((v) => typeof v === 'string' || typeof v === 'number');
    if (isSimple) {
      return (
        <div className="space-y-0.5 ml-1">
          {value.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-editor-text group">
              <span className="text-editor-muted mt-0.5 flex-shrink-0">&#8226;</span>
              <div className="flex-1">
                <InlineEdit
                  value={String(item)}
                  onChange={(v) => {
                    const newVal = typeof item === 'number' ? (isNaN(Number(v)) ? v : Number(v)) : v;
                    onUpdate([...path, i], newVal);
                  }}
                />
              </div>
              <button
                onClick={() => onDelete([...path, i])}
                className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                title="Remove item"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={() => onPush(path, '')}
            className="flex items-center gap-1 text-xs text-accent/50 hover:text-accent transition-colors mt-1"
          >
            <Plus size={12} /> Add item
          </button>
        </div>
      );
    }
    // Complex array items
    return (
      <div className="space-y-2 ml-1">
        {value.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-sm group">
            <span className="text-editor-muted flex-shrink-0 font-mono text-xs mt-0.5">{i + 1}.</span>
            <div className="flex-1">
              <RenderValue
                value={item}
                path={[...path, i]}
                depth={depth + 1}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onPush={onPush}
              />
            </div>
            <button
              onClick={() => onDelete([...path, i])}
              className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
              title="Remove item"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-editor-muted italic">Empty</span>;
    }
    return (
      <div className={`space-y-1.5 ${depth > 0 ? 'ml-2 pl-2 border-l border-editor-border/50' : ''}`}>
        {entries.map(([k, v]) => (
          <div key={k} className="text-sm group/field">
            <span className="font-medium text-editor-muted">{formatKey(k)}:</span>{' '}
            {typeof v === 'string' && !v.includes('\n') && v.length < 200 ? (
              <InlineEdit
                value={v}
                onChange={(newV) => onUpdate([...path, k], newV)}
                className="text-editor-text"
              />
            ) : (
              <div className="mt-0.5 ml-3">
                <RenderValue
                  value={v}
                  path={[...path, k]}
                  depth={depth + 1}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onPush={onPush}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <InlineEdit
      value={String(value)}
      onChange={(v) => onUpdate(path, v)}
    />
  );
}

// =============================================================================
// COLLAPSIBLE SECTION
// =============================================================================

function ProfileSection({
  label,
  value,
  onUpdate,
  onDelete,
  onPush,
}: {
  label: string;
  value: unknown;
  onUpdate: (path: (string | number)[], newValue: unknown) => void;
  onDelete: (path: (string | number)[]) => void;
  onPush: (path: (string | number)[], newValue: unknown) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <div className="border border-editor-border/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-editor-bg/50 hover:bg-editor-bg transition-colors text-left"
      >
        <Chevron size={14} className="text-editor-muted flex-shrink-0" />
        <span className="text-sm font-semibold text-accent">{formatKey(label)}</span>
      </button>
      {isOpen && (
        <div className="px-4 py-3">
          <RenderValue
            value={value}
            path={[label]}
            depth={0}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onPush={onPush}
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ADD FIELD COMPONENT
// =============================================================================

function AddFieldButton({ onAdd }: { onAdd: (key: string, value: string) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) inputRef.current.focus();
  }, [isAdding]);

  const commit = () => {
    const key = newKey.trim();
    if (key) {
      onAdd(key, '');
    }
    setNewKey('');
    setIsAdding(false);
  };

  if (isAdding) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <input
          ref={inputRef}
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setNewKey(''); setIsAdding(false); }
          }}
          onBlur={commit}
          placeholder="Field name (e.g. age, occupation)..."
          className="flex-1 bg-editor-bg border border-accent/40 rounded px-2 py-1 text-sm text-editor-text outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      className="flex items-center gap-1.5 text-xs text-accent/50 hover:text-accent transition-colors mt-2"
    >
      <PlusCircle size={14} /> Add profile field
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ProfileViewer({ profile, onProfileChange }: ProfileViewerProps) {
  const handleUpdate = (path: (string | number)[], newValue: unknown) => {
    if (!profile || !onProfileChange) return;
    const updated = deepSet(profile, path, newValue);
    onProfileChange(updated);
  };

  const handleDelete = (path: (string | number)[]) => {
    if (!profile || !onProfileChange) return;
    const updated = deepDelete(profile, path);
    onProfileChange(updated);
  };

  const handlePush = (path: (string | number)[], newValue: unknown) => {
    if (!profile || !onProfileChange) return;
    const updated = deepPush(profile, path, newValue);
    onProfileChange(updated);
  };

  const handleAddField = (key: string, value: string) => {
    if (!onProfileChange) return;
    const current = profile || {};
    onProfileChange({ ...current, [key]: value });
  };

  if (!profile || Object.keys(profile).length === 0) {
    return (
      <div>
        <div className="bg-editor-bg rounded-lg p-4 text-sm text-editor-muted flex items-center gap-2">
          <BookOpen size={16} className="opacity-50" />
          <span>No structured profile yet. The AI agent will populate this, or add fields manually below.</span>
        </div>
        {onProfileChange && <AddFieldButton onAdd={handleAddField} />}
      </div>
    );
  }

  const entries = Object.entries(profile);

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <ProfileSection
          key={key}
          label={key}
          value={value}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onPush={handlePush}
        />
      ))}
      {onProfileChange && <AddFieldButton onAdd={handleAddField} />}
    </div>
  );
}
