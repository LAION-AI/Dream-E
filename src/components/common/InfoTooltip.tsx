/**
 * =============================================================================
 * INFO TOOLTIP COMPONENT
 * =============================================================================
 *
 * A small help-circle icon that, when clicked, shows a popover with
 * educational content about a storytelling concept.
 *
 * WHY CLICK INSTEAD OF HOVER?
 * Hover tooltips disappear when the mouse moves, making long text hard to read.
 * Click-to-open popovers stay visible until the user explicitly dismisses them,
 * which is better for multi-sentence educational content.
 *
 * USAGE:
 *   <label>Genre <InfoTooltip content={STORY_TOOLTIPS.genre} /></label>
 *
 * =============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface InfoTooltipProps {
  /** The tooltip body text — can be multiple sentences */
  content: string;
  /** Optional bold title displayed above the content */
  title?: string;
}

/**
 * InfoTooltip — a click-activated popover with an educational explanation.
 *
 * Renders a small HelpCircle icon inline. Clicking it toggles a floating
 * popover positioned above the icon. The popover is dismissed by clicking
 * outside it or pressing Escape.
 *
 * Accessibility:
 * - Button has a descriptive title attribute
 * - Escape key closes the popover
 * - Click-outside closes the popover
 * - stopPropagation prevents parent form elements from reacting
 */
export default function InfoTooltip({ content, title }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /**
   * Effect: register global listeners when the popover is open.
   *
   * WHY GLOBAL LISTENERS?
   * We need to detect clicks outside the popover and Escape key presses
   * anywhere on the page, not just inside the component. The listeners
   * are cleaned up when the popover closes to avoid unnecessary event
   * processing.
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <span className="relative inline-flex items-center ml-1">
      {/* Trigger button — small help icon */}
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className="text-editor-muted/50 hover:text-editor-accent transition-colors"
        title="Click for more info"
        type="button"
      >
        <HelpCircle size={14} />
      </button>

      {/* Popover — positioned above the icon, centered horizontally */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-lg bg-editor-surface border border-editor-border shadow-xl text-xs text-editor-muted leading-relaxed"
        >
          {title && <p className="font-semibold text-editor-text mb-1">{title}</p>}
          <p className="whitespace-pre-wrap">{content}</p>
          {/* Arrow pointing down toward the icon */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-editor-surface border-r border-b border-editor-border rotate-45 -mt-1" />
        </div>
      )}
    </span>
  );
}
