/**
 * =============================================================================
 * START MENU COMPONENT
 * =============================================================================
 *
 * The initial landing page for Dream-E. Presents the user with two mode choices:
 *
 * 1. **Game Mode** — Create interactive fiction and text-adventure RPGs with
 *    branching narratives, Open World mode, entity systems, and gameplay.
 *
 * 2. **Co-Writing Mode** — Collaborate with AI to write stories, novels, and
 *    screenplays using the visual canvas to organize scenes and characters.
 *
 * Each mode navigates to a separate Dashboard view that filters projects by mode.
 *
 * LAYOUT:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                                                             │
 * │                   [Logo]  Dream-E                           │
 * │                 Interactive Story Engine                     │
 * │                                                             │
 * │         ┌──────────────┐   ┌──────────────┐                 │
 * │         │  Game Mode   │   │ Co-Writing   │                 │
 * │         │              │   │    Mode      │                 │
 * │         └──────────────┘   └──────────────┘                 │
 * │                                                             │
 * └─────────────────────────────────────────────────────────────┘
 *
 * =============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, PenTool, BookOpen } from 'lucide-react';

/**
 * START MENU COMPONENT
 *
 * Renders a centered screen with the Dream-E logo and two large mode-selection
 * cards. Clicking a card navigates to the corresponding Dashboard filtered by
 * that mode's projects.
 *
 * WHY A SEPARATE START MENU?
 * Previously, the root route "/" went directly to the Dashboard showing all
 * projects. With the addition of Co-Writing mode, we need a way for users to
 * choose which mode they want to work in. This screen provides a clear entry
 * point and visual separation between the two workflows.
 */
export default function StartMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-editor-bg flex flex-col items-center justify-center p-8">
      {/* ==================== LOGO ==================== */}
      {/* The logo section provides immediate brand recognition and context.
          Uses the same BookOpen icon and color scheme as the Dashboard sidebar. */}
      <div className="flex items-center gap-4 mb-12">
        <div className="w-16 h-16 rounded-2xl bg-editor-accent flex items-center justify-center">
          <BookOpen className="w-10 h-10 text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-editor-text">Dream-E</h1>
          <p className="text-editor-muted text-sm">Interactive Story Engine</p>
        </div>
      </div>

      {/* ==================== MODE SELECTION CARDS ==================== */}
      {/* Two cards side-by-side on desktop, stacked on mobile.
          Each card has a hover effect with a gradient overlay and icon highlight. */}
      <div className="flex flex-col sm:flex-row gap-6 max-w-3xl w-full">
        {/* Game Mode Card */}
        <button
          onClick={() => navigate('/game')}
          className="flex-1 group relative rounded-2xl bg-editor-surface border-2 border-editor-border hover:border-purple-500 transition-all p-8 text-left overflow-hidden"
        >
          {/* Gradient overlay that fades in on hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="w-14 h-14 rounded-xl bg-purple-600/20 flex items-center justify-center mb-4 group-hover:bg-purple-600/30 transition-colors">
              <Gamepad2 className="w-7 h-7 text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-editor-text mb-2">Game Mode</h2>
            <p className="text-editor-muted text-sm leading-relaxed">
              Create interactive fiction and text-adventure RPGs with branching narratives,
              AI-powered Open World mode, entity systems, and immersive gameplay.
            </p>
          </div>
        </button>

        {/* Co-Writing Mode Card */}
        <button
          onClick={() => navigate('/cowrite')}
          className="flex-1 group relative rounded-2xl bg-editor-surface border-2 border-editor-border hover:border-emerald-500 transition-all p-8 text-left overflow-hidden"
        >
          {/* Gradient overlay that fades in on hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 to-teal-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="w-14 h-14 rounded-xl bg-emerald-600/20 flex items-center justify-center mb-4 group-hover:bg-emerald-600/30 transition-colors">
              <PenTool className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-editor-text mb-2">Co-Writing Mode</h2>
            <p className="text-editor-muted text-sm leading-relaxed">
              Collaborate with AI to write stories, novels, and screenplays. Use the visual
              canvas to organize scenes, characters, and plot threads.
            </p>
          </div>
        </button>
      </div>

      {/* ==================== FOOTER ==================== */}
      <p className="text-editor-muted/50 text-xs mt-12">
        Dream-E &mdash; Visual Novel Engine
      </p>
    </div>
  );
}
