/**
 * =============================================================================
 * CANVAS TAB BAR — THREE-CANVAS SWITCHER (CO-WRITE MODE)
 * =============================================================================
 *
 * A horizontal tab bar rendered above the canvas in co-write mode.
 *
 * THREE TABS:
 * - "Story Canvas"        — narrative structure (scenes, acts, plots, etc.)
 * - "Character Canvas"    — character web / relationship mapping
 * - "State Change Canvas" — entity state timeline (how entities evolve over time)
 *
 * =============================================================================
 */

import React from 'react';
import { BookOpen, Users, GitBranch } from 'lucide-react';

interface CanvasTabBarProps {
  activeCanvas: 'story' | 'character' | 'stateChange';
  onCanvasChange: (canvas: 'story' | 'character' | 'stateChange') => void;
}

export default function CanvasTabBar({ activeCanvas, onCanvasChange }: CanvasTabBarProps) {
  const tabs: { id: 'story' | 'character' | 'stateChange'; label: string; icon: React.ReactNode }[] = [
    { id: 'story',       label: 'Story Canvas',        icon: <BookOpen size={14} /> },
    { id: 'character',   label: 'Character Canvas',     icon: <Users size={14} /> },
    { id: 'stateChange', label: 'State Change Canvas',  icon: <GitBranch size={14} /> },
  ];

  return (
    <div className="flex items-center gap-1 bg-editor-surface border-b border-editor-border px-4 py-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onCanvasChange(tab.id)}
          className={`
            flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-sm font-medium transition-colors
            ${activeCanvas === tab.id
              ? 'bg-editor-bg text-editor-text border border-b-0 border-editor-border'
              : 'text-editor-muted hover:text-editor-text'
            }
          `}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
