/**
 * =============================================================================
 * CANVAS TAB BAR — DUAL CANVAS SWITCHER (CO-WRITE MODE)
 * =============================================================================
 *
 * A horizontal tab bar rendered above the React Flow canvas in co-write mode.
 *
 * TWO TABS:
 * - "Story Canvas" — shows scene, choice, modifier, comment, storyRoot, and
 *   plot nodes. This is the narrative structure view.
 * - "Character Canvas" — shows character nodes with relationship edges.
 *   This is the character web / relationship-mapping view.
 *
 * WHY A SEPARATE COMPONENT?
 * Keeps the tab UI self-contained. Editor.tsx only needs to render
 * <CanvasTabBar /> conditionally in co-write mode and wire up the props.
 *
 * GAME MODE:
 * This component is never rendered in game mode — the Editor skips it
 * entirely, leaving the canvas layout unchanged.
 *
 * =============================================================================
 */

import React from 'react';
import { BookOpen, Users } from 'lucide-react';

/**
 * PROPS
 */
interface CanvasTabBarProps {
  /** Which canvas is currently active */
  activeCanvas: 'story' | 'character';
  /** Callback to switch canvases */
  onCanvasChange: (canvas: 'story' | 'character') => void;
}

/**
 * CANVAS TAB BAR COMPONENT
 *
 * Renders two browser-style tabs. The active tab has a solid background
 * that visually "connects" with the canvas below (no bottom border).
 * Inactive tabs are muted text with a hover effect.
 */
export default function CanvasTabBar({ activeCanvas, onCanvasChange }: CanvasTabBarProps) {
  return (
    <div className="flex items-center gap-1 bg-editor-surface border-b border-editor-border px-4 py-1">
      {/* Story Canvas tab */}
      <button
        onClick={() => onCanvasChange('story')}
        className={`
          flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-sm font-medium transition-colors
          ${activeCanvas === 'story'
            ? 'bg-editor-bg text-editor-text border border-b-0 border-editor-border'
            : 'text-editor-muted hover:text-editor-text'
          }
        `}
      >
        <BookOpen size={14} />
        Story Canvas
      </button>

      {/* Character Canvas tab */}
      <button
        onClick={() => onCanvasChange('character')}
        className={`
          flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-sm font-medium transition-colors
          ${activeCanvas === 'character'
            ? 'bg-editor-bg text-editor-text border border-b-0 border-editor-border'
            : 'text-editor-muted hover:text-editor-text'
          }
        `}
      >
        <Users size={14} />
        Character Canvas
      </button>
    </div>
  );
}
