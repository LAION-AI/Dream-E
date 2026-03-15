/**
 * =============================================================================
 * NOTES EDITOR COMPONENT
 * =============================================================================
 *
 * A near-fullscreen modal with a single large textarea for freeform project
 * notes. Uses local state while editing to avoid triggering React Flow re-syncs
 * that steal focus. Syncs to the store on blur and on close.
 *
 * Notes are stored in `project.notes` and auto-saved via the store.
 *
 * =============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/common';
import { useProjectStore } from '@/stores/useProjectStore';

// =============================================================================
// COMPONENT PROPS
// =============================================================================

interface NotesEditorProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the modal should close */
  onClose: () => void;
}

// =============================================================================
// NOTES EDITOR COMPONENT
// =============================================================================

export default function NotesEditor({ isOpen, onClose }: NotesEditorProps) {
  // Use targeted selectors to avoid re-rendering on unrelated store changes
  const currentProject = useProjectStore(s => s.currentProject);
  const updateNotes = useProjectStore(s => s.updateNotes);

  // Local state for editing — avoids store updates on every keystroke
  // which would trigger React Flow re-syncs and steal textarea focus.
  const [localNotes, setLocalNotes] = useState('');
  const dirtyRef = useRef(false);
  // Timestamp of the last local edit — used to avoid overwriting active
  // typing when the store updates (e.g., undo/redo while modal is open).
  const lastEditRef = useRef(0);
  // Ref that always holds the current localNotes value, so the auto-flush
  // interval callback can read the latest text without needing `localNotes`
  // in its dependency array (which would re-create the interval on every
  // keystroke — the B3 bug).
  const localNotesRef = useRef(localNotes);

  // The store's current notes value — extracted for dependency tracking.
  const storeNotes = currentProject?.notes || '';

  // Sync from store when modal opens OR when the store's notes value
  // changes externally (e.g., undo/redo). If the user has made local
  // edits within the last 2 seconds, skip the re-sync to avoid clobbering
  // their typing. When the modal opens fresh, always sync.
  useEffect(() => {
    if (isOpen) {
      const timeSinceEdit = Date.now() - lastEditRef.current;
      const userRecentlyTyped = dirtyRef.current && timeSinceEdit < 2000;

      if (!userRecentlyTyped) {
        setLocalNotes(storeNotes);
        localNotesRef.current = storeNotes;
        dirtyRef.current = false;
      }

      // DIAGNOSTIC: Notes sync tracker
      if ((window as any).__notesDiag) {
        console.log('[NotesDiag] Sync check. Store length:', storeNotes.length,
          'User recently typed:', userRecentlyTyped, 'Dirty:', dirtyRef.current);
      }
    }
  }, [isOpen, storeNotes]);

  // Flush local state to store — always reads from localNotesRef to get
  // the most current value, regardless of which render cycle we're in.
  const flush = () => {
    if (dirtyRef.current) {
      const currentText = localNotesRef.current;
      // DIAGNOSTIC: Notes sync tracker
      if ((window as any).__notesDiag) {
        console.log('[NotesDiag] Flushing local notes to store. Length:', currentText.length,
          'Store length:', (currentProject?.notes || '').length,
          'Changed:', currentText !== (currentProject?.notes || ''));
      }
      updateNotes(currentText);
      dirtyRef.current = false;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalNotes(val);
    localNotesRef.current = val;
    dirtyRef.current = true;
    lastEditRef.current = Date.now();
  };

  // Auto-flush every 3 seconds while dirty — prevents data loss from
  // timing issues (e.g., undo/redo triggered while modal is open, or
  // user navigates away without closing the modal properly).
  //
  // B3 FIX: Reads from localNotesRef instead of capturing `localNotes`
  // in the closure. This removes `localNotes` from the dependency array
  // so the interval is created ONCE per modal open, not re-created on
  // every keystroke (which was the bug — the 3s timer kept resetting).
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      if (dirtyRef.current) {
        if ((window as any).__notesDiag) {
          console.log('[NotesDiag] Auto-flush triggered (3s interval)');
        }
        updateNotes(localNotesRef.current);
        dirtyRef.current = false;
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isOpen, updateNotes]);

  const handleClose = () => {
    flush();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Project Notes" size="nearfull">
      <textarea
        value={localNotes}
        onChange={handleChange}
        onBlur={flush}
        className="input w-full min-h-[75vh] resize-none font-mono text-sm leading-relaxed"
        placeholder={
          'Write your project notes here...\n\n' +
          'Ideas for this space:\n' +
          '  • Plot outlines and story arcs\n' +
          '  • Character relationship maps\n' +
          '  • World-building rules and lore\n' +
          '  • Pacing and branching strategy\n' +
          '  • AI assistant configuration (API keys, instructions)\n' +
          '  • Anything you want to remember about this project'
        }
      />
    </Modal>
  );
}
