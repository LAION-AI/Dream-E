/**
 * =============================================================================
 * INFO TOOLTIP COMPONENT
 * =============================================================================
 *
 * A help-circle icon that, when clicked, shows a centered overlay with
 * educational content about a storytelling concept.
 *
 * WHY A CENTERED OVERLAY INSTEAD OF A RELATIVE POPOVER?
 * Relative popovers get clipped by panel borders, scroll containers, and
 * overflow:hidden ancestors. A portal-rendered centered overlay is always
 * fully visible and readable regardless of where the icon sits in the UI.
 *
 * USAGE:
 *   <label>Genre <InfoTooltip content={STORY_TOOLTIPS.genre} /></label>
 *   <label>Goal <InfoTooltip content={STORY_TOOLTIPS.protagonistGoal} title="Protagonist Goal" /></label>
 *
 * =============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

interface InfoTooltipProps {
  /** The tooltip body text — can be multiple sentences */
  content: string;
  /** Optional bold title displayed above the content */
  title?: string;
}

/**
 * InfoTooltip — a click-activated overlay with an educational explanation.
 *
 * Renders a small HelpCircle icon inline. Clicking it opens a centered
 * overlay rendered via React portal on document.body, ensuring it's never
 * clipped by parent containers. The overlay is dismissed by clicking the
 * backdrop, the close button, or pressing Escape.
 */
export default function InfoTooltip({ content, title }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <>
      {/* Trigger button — small help icon */}
      <button
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsOpen(!isOpen); }}
        className="text-editor-muted/50 hover:text-editor-accent transition-colors inline-flex items-center ml-1"
        title="Click for more info"
        type="button"
      >
        <HelpCircle size={14} />
      </button>

      {/* Centered overlay — rendered as a portal on document.body so it's
          never clipped by inspector panels, scroll containers, or overflow:hidden.
          Uses a semi-transparent backdrop for visual separation from the canvas. */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-8"
          onClick={() => setIsOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Content panel */}
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl bg-[#1a1d2e] border border-[#2d3148] shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between px-5 py-3 bg-[#1a1d2e] border-b border-[#2d3148] rounded-t-xl">
              <div className="flex items-center gap-2">
                <HelpCircle size={16} className="text-purple-400" />
                <span className="text-sm font-semibold text-[#e2e4ea]">
                  {title || 'Info'}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[#6b7094] hover:text-[#e2e4ea] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <p className="text-sm text-[#b0b4cc] leading-relaxed whitespace-pre-wrap">
                {content}
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
