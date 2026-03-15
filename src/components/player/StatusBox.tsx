/**
 * =============================================================================
 * STATUS BOX — Open World Mode Agent Status Display
 * =============================================================================
 *
 * Transparent, minimizable status box in the bottom-right of the player.
 * Shows what the AI agent is currently doing during open-world generation.
 *
 * Minimized: small icon/indicator (expands on click)
 * Expanded: covers ~10% of screen, shows status log with phase indicators
 *
 * =============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import type { OpenWorldStatus } from '@/services/openWorldService';

interface StatusBoxProps {
  statuses: OpenWorldStatus[];
  isGenerating: boolean;
}

/** Phase icons and colors */
function phaseDisplay(phase: OpenWorldStatus['phase']): { icon: React.ReactElement; color: string } {
  switch (phase) {
    case 'building_context':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-blue-400' };
    case 'generating_text':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-purple-400' };
    case 'parsing_response':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-cyan-400' };
    case 'generating_entity_images':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-teal-400' };
    case 'generating_image':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-amber-400' };
    case 'searching_music':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-pink-400' };
    case 'creating_scene':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-green-400' };
    case 'ready':
      return { icon: <CheckCircle2 size={12} />, color: 'text-green-400' };
    case 'error':
      return { icon: <AlertCircle size={12} />, color: 'text-red-400' };
    default:
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-white/50' };
  }
}

export default function StatusBox({ statuses, isGenerating }: StatusBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-expand when generation starts
  useEffect(() => {
    if (isGenerating && statuses.length > 0) {
      setIsExpanded(true);
    }
  }, [isGenerating, statuses.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [statuses]);

  const lastStatus = statuses[statuses.length - 1];
  const isReady = lastStatus?.phase === 'ready';
  const hasError = lastStatus?.phase === 'error';

  if (statuses.length === 0 && !isGenerating) return null;

  // ── Minimized view ───────────────────────────────────────────────
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`
          fixed bottom-6 right-6 z-30
          flex items-center gap-2 px-3 py-2 rounded-lg
          bg-black/60 backdrop-blur-sm border
          ${isReady ? 'border-green-500/50' : hasError ? 'border-red-500/50' : 'border-white/10'}
          text-sm text-white/80 hover:bg-black/70 transition-all
          ${isReady ? 'animate-pulse shadow-lg shadow-green-500/20' : ''}
        `}
      >
        {isGenerating ? (
          <Loader2 size={14} className="animate-spin text-purple-400" />
        ) : isReady ? (
          <Sparkles size={14} className="text-green-400" />
        ) : hasError ? (
          <AlertCircle size={14} className="text-red-400" />
        ) : (
          <CheckCircle2 size={14} className="text-white/40" />
        )}
        <span className="max-w-[200px] truncate">
          {lastStatus?.detail || 'Agent idle'}
        </span>
        <ChevronUp size={12} className="text-white/40" />
      </button>
    );
  }

  // ── Expanded view ────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-30 w-80 max-h-[25vh] flex flex-col rounded-lg bg-black/70 backdrop-blur-md border border-white/10 shadow-xl">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(false)}
        className="flex items-center justify-between px-3 py-2 border-b border-white/10 hover:bg-white/5 transition-colors"
      >
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
          {isGenerating ? 'Agent Working...' : isReady ? 'Scene Ready' : 'Agent Status'}
        </span>
        <ChevronDown size={12} className="text-white/40" />
      </button>

      {/* Status log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {statuses.map((status, i) => {
          const { icon, color } = phaseDisplay(status.phase);
          return (
            <div key={i} className={`flex items-start gap-2 text-xs ${color}`}>
              <span className="mt-0.5 flex-shrink-0">{icon}</span>
              <span className="text-white/70">{status.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
