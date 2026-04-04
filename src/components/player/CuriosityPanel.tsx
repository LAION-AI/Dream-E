/**
 * =============================================================================
 * CURIOSITY PANEL — "Curiosity Corner"
 * =============================================================================
 *
 * A fullscreen overlay that displays fun facts / curiosity tidbits generated
 * by the Open World AI for the current scene. Each fact has a category, title,
 * and descriptive text. Facts are shown as cards in a responsive grid.
 *
 * The panel animates in from the right (slide-in) and can be dismissed with
 * the X button or Escape key. Rendered via createPortal to document.body so
 * it sits above all other UI layers.
 *
 * DESIGN:
 * - Dark translucent backdrop (bg-black/85 backdrop-blur)
 * - Header with Lightbulb icon + "Curiosity Corner" title + close X
 * - Grid of fact cards, each with colored category badge
 * - Category-based accent colors for visual distinction
 * - Serif font for fact text to give a "storybook" feel
 *
 * =============================================================================
 */

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, X } from 'lucide-react';

// --- Types ---

/** A single curiosity fact produced by the Open World AI */
export interface CuriosityFact {
  title: string;
  fact: string;
  category: string;
}

interface CuriosityPanelProps {
  /** Array of curiosity facts to display */
  facts: CuriosityFact[];
  /** Called when the user closes the panel (X button or Escape key) */
  onClose: () => void;
}

// --- Category color mapping ---
// Maps category strings to Tailwind-friendly color tokens.
// Unknown categories fall back to a neutral gray.
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  history:    { bg: 'bg-amber-500/20',  text: 'text-amber-300',  border: 'border-amber-500/30' },
  science:    { bg: 'bg-blue-500/20',   text: 'text-blue-300',   border: 'border-blue-500/30' },
  culture:    { bg: 'bg-purple-500/20',  text: 'text-purple-300',  border: 'border-purple-500/30' },
  psychology: { bg: 'bg-pink-500/20',   text: 'text-pink-300',   border: 'border-pink-500/30' },
  nature:     { bg: 'bg-green-500/20',  text: 'text-green-300',  border: 'border-green-500/30' },
  technology: { bg: 'bg-cyan-500/20',   text: 'text-cyan-300',   border: 'border-cyan-500/30' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-500/20', text: 'text-gray-300', border: 'border-gray-500/30' };

/**
 * Returns color classes for a given category string.
 * Performs case-insensitive lookup against known categories.
 */
function getCategoryColor(category: string) {
  const key = category.toLowerCase().trim();
  return CATEGORY_COLORS[key] || DEFAULT_COLOR;
}

// --- Component ---

export default function CuriosityPanel({ facts, onClose }: CuriosityPanelProps) {
  // Controls the slide-in animation — starts offscreen (right), transitions to 0
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Trigger the slide-in animation on mount
  useEffect(() => {
    // Use requestAnimationFrame to ensure the initial transform is applied
    // before we transition to the final position.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  // Escape key handler — close the panel on Escape press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // The portal content — a fullscreen overlay with slide-in panel
  const content = (
    <div
      className="fixed inset-0 z-[9999] flex justify-end"
      onClick={(e) => {
        // Close when clicking the backdrop (not the panel itself)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dark translucent backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Sliding panel from the right */}
      <div
        ref={panelRef}
        className="relative w-full max-w-3xl h-full overflow-y-auto transition-transform duration-500 ease-out"
        style={{
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          background: 'linear-gradient(135deg, rgba(30, 20, 10, 0.97) 0%, rgba(20, 15, 8, 0.98) 100%)',
          borderLeft: '1px solid rgba(245, 158, 11, 0.2)',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{ background: 'rgba(30, 20, 10, 0.95)', borderBottom: '1px solid rgba(245, 158, 11, 0.15)' }}
        >
          <div className="flex items-center gap-3">
            <Lightbulb size={24} style={{ color: '#f59e0b' }} />
            <h2 className="text-xl font-bold text-amber-100">Curiosity Corner</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Fact display — single large card centered in the panel */}
        <div className="p-6 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
          {facts.length === 0 ? (
            <p className="text-white/40 text-center italic mt-12">
              No curiosity facts for this scene yet.
            </p>
          ) : (
            /* Show only the first fact in a large, immersive layout */
            (() => {
              const fact = facts[0];
              const colors = getCategoryColor(fact.category);
              return (
                <div
                  className="w-full max-w-2xl rounded-2xl p-10 border relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(145deg, rgba(50, 35, 15, 0.8) 0%, rgba(30, 20, 8, 0.9) 100%)',
                    borderColor: 'rgba(245, 158, 11, 0.18)',
                  }}
                >
                  {/* Subtle decorative glow behind the card */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'radial-gradient(ellipse at 50% 0%, rgba(245, 158, 11, 0.06) 0%, transparent 70%)',
                    }}
                  />

                  <div className="relative z-10">
                    {/* Category badge */}
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-6 ${colors.bg} ${colors.text} border ${colors.border}`}
                    >
                      {fact.category}
                    </span>

                    {/* Title — large and prominent */}
                    <h3 className="text-2xl md:text-3xl font-bold text-amber-100 mb-5 leading-snug">
                      {fact.title}
                    </h3>

                    {/* Decorative divider */}
                    <div className="w-16 h-0.5 bg-amber-500/30 mb-6" />

                    {/* Fact text — large serif font for readability and storybook feel */}
                    <p
                      className="text-lg md:text-xl text-white/75 leading-relaxed"
                      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                    >
                      {fact.fact}
                    </p>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
