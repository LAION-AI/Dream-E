/**
 * =============================================================================
 * CHOICE LIST COMPONENT
 * =============================================================================
 *
 * Displays available choices for the player to select.
 *
 * FEATURES:
 * - Choice buttons with hover effects
 * - Locked/disabled state for unavailable choices
 * - Lock icon and reason tooltip
 * - Themed styling
 *
 * =============================================================================
 */

import React from 'react';
import { Lock, ChevronRight } from 'lucide-react';
import type { PlayerChoice } from '@/types';

/**
 * CHOICE LIST PROPS
 */
interface ChoiceListProps {
  choices: PlayerChoice[];
  onSelect: (choiceId: string) => void;
}

/**
 * CHOICE LIST COMPONENT
 */
export default function ChoiceList({ choices, onSelect }: ChoiceListProps) {
  return (
    <div className="space-y-2">
      {choices.map((choice) => (
        <ChoiceButton
          key={choice.id}
          choice={choice}
          onSelect={() => onSelect(choice.id)}
        />
      ))}
    </div>
  );
}

/**
 * CHOICE BUTTON COMPONENT
 */
interface ChoiceButtonProps {
  choice: PlayerChoice;
  onSelect: () => void;
}

function ChoiceButton({ choice, onSelect }: ChoiceButtonProps) {
  const isLocked = !choice.isAvailable;

  return (
    <button
      onClick={isLocked ? undefined : onSelect}
      disabled={isLocked}
      className={`
        player-button
        w-full text-left
        flex items-center gap-3
        group
        ${isLocked ? 'locked opacity-60 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={isLocked ? choice.lockedReason : undefined}
    >
      {/* Icon or indicator */}
      <span
        className={`
          flex-shrink-0 w-6 h-6 rounded-full
          flex items-center justify-center
          transition-colors
          ${isLocked
            ? 'bg-gray-500/30'
            : 'bg-white/10 group-hover:bg-white/20'
          }
        `}
      >
        {isLocked ? (
          <Lock size={14} className="text-gray-400" />
        ) : choice.icon ? (
          <span className="text-sm">{getChoiceIcon(choice.icon)}</span>
        ) : (
          <ChevronRight
            size={16}
            className="text-white/70 group-hover:translate-x-0.5 transition-transform"
          />
        )}
      </span>

      {/* Label */}
      <span className="flex-1">{choice.label}</span>

      {/* Locked indicator */}
      {isLocked && choice.lockedReason && (
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{ backgroundColor: 'var(--player-bg)' }}
        >
          {choice.lockedReason}
        </span>
      )}
    </button>
  );
}

/**
 * GET CHOICE ICON
 * Maps icon names to emojis or returns the string as-is.
 */
function getChoiceIcon(iconName: string): string {
  const icons: Record<string, string> = {
    sword: '⚔️',
    shield: '🛡️',
    magic: '✨',
    talk: '💬',
    run: '🏃',
    look: '👁️',
    think: '💭',
    help: '❓',
    fight: '⚔️',
    flee: '🏃',
    examine: '🔍',
    use: '🖐️',
  };

  return icons[iconName.toLowerCase()] || iconName;
}
