/**
 * =============================================================================
 * DIALOG BOX COMPONENT
 * =============================================================================
 *
 * Displays story text with optional typewriter effect.
 *
 * FEATURES:
 * - Speaker name display
 * - Typewriter text animation
 * - Click to skip animation
 * - TTS toggle button (play/stop)
 * - Themed styling
 *
 * =============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';

/**
 * TTS playback state for the speaker icon.
 * - 'idle'      = no TTS active, show normal speaker icon
 * - 'loading'   = TTS chunks being generated, show spinner
 * - 'playing'   = audio is playing, show muted icon (click to stop)
 * - 'disabled'  = TTS not available (no API key, etc.)
 */
export type TTSState = 'idle' | 'loading' | 'playing' | 'disabled';

/**
 * DIALOG BOX PROPS
 */
interface DialogBoxProps {
  speakerName?: string;
  text: string;
  onComplete?: () => void;
  textSpeed?: number; // Characters per second (0 = instant)
  maxHeight?: number; // Max height in px — overflows become scrollable
  editable?: boolean; // When true, renders a textarea for inline editing
  onTextChange?: (newText: string) => void; // Called on every edit
  ttsState?: TTSState;         // Current TTS playback state
  onToggleTTS?: () => void;    // Called when user clicks the speaker icon
}

/**
 * DIALOG BOX COMPONENT
 */
export default function DialogBox({
  speakerName,
  text,
  onComplete,
  textSpeed = 30,
  maxHeight,
  editable = false,
  onTextChange,
  ttsState = 'idle',
  onToggleTTS,
}: DialogBoxProps) {
  // Displayed text state
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use ref for onComplete to avoid re-triggering the effect when callback changes
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Track the last processed text to avoid re-running effect on same text
  const lastTextRef = useRef<string | null>(null);

  /**
   * Typewriter effect
   */
  useEffect(() => {
    // Skip if text hasn't actually changed (prevents flickering)
    // But allow the effect to run on first mount (when lastTextRef is null)
    if (lastTextRef.current !== null && lastTextRef.current === text) {
      return;
    }
    lastTextRef.current = text;

    // Reset when text changes
    setDisplayedText('');
    setIsComplete(false);

    // If instant or no text, show immediately
    if (textSpeed === 0 || !text) {
      setDisplayedText(text);
      setIsComplete(true);
      onCompleteRef.current?.();
      return;
    }

    // Calculate delay between characters
    const delay = 1000 / textSpeed;
    let currentIndex = 0;

    // Start typewriter
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        // Complete
        clearInterval(interval);
        setIsComplete(true);
        onCompleteRef.current?.();
      }
    }, delay);

    // Cleanup - reset lastTextRef so React StrictMode double-invoke works correctly
    return () => {
      clearInterval(interval);
      lastTextRef.current = null;
    };
  }, [text, textSpeed]);

  // Auto-scroll to bottom as text grows during typewriter
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedText]);

  /**
   * Skip animation on click
   */
  const handleClick = useCallback(() => {
    if (!isComplete) {
      setDisplayedText(text);
      setIsComplete(true);
      onComplete?.();
    }
  }, [isComplete, text, onComplete]);

  /** TTS icon and styling based on current state */
  const renderTTSButton = () => {
    if (!onToggleTTS || ttsState === 'disabled') return null;

    let icon: React.ReactNode;
    let title: string;
    let extraClass = '';

    switch (ttsState) {
      case 'loading':
        icon = <Loader2 size={18} className="animate-spin" />;
        title = 'Generating speech... (click to cancel)';
        extraClass = 'text-amber-400/80';
        break;
      case 'playing':
        icon = <VolumeX size={18} />;
        title = 'Stop playback';
        extraClass = 'text-blue-400';
        break;
      case 'idle':
      default:
        icon = <Volume2 size={18} />;
        title = 'Play text-to-speech';
        extraClass = '';
        break;
    }

    return (
      <button
        className={`p-1 rounded hover:bg-white/10 transition-colors ${extraClass}`}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          onToggleTTS();
        }}
      >
        {icon}
      </button>
    );
  };

  return (
    <div
      className={`player-box p-6 flex flex-col ${editable ? 'cursor-text' : 'cursor-pointer'}`}
      onClick={editable ? undefined : handleClick}
      role={editable ? undefined : 'button'}
      aria-label={editable ? 'Editing scene text' : isComplete ? 'Text complete' : 'Click to skip animation'}
      style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined }}
    >
      {/* Speaker name — fixed at top */}
      {speakerName && (
        <div className="mb-3 flex-shrink-0">
          <span
            className="text-sm font-bold px-3 py-1 rounded"
            style={{
              backgroundColor: 'var(--player-primary)',
              color: 'var(--player-text)',
            }}
          >
            {speakerName}
          </span>
        </div>
      )}

      {/* Story text — scrollable when exceeding max height */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-[4em] scrollbar-thin"
        style={{ overscrollBehavior: 'contain' }}
        onClick={(e) => e.stopPropagation()}
      >
        {editable ? (
          <textarea
            className="w-full h-full text-lg leading-relaxed bg-transparent border-none outline-none resize-none scrollbar-thin"
            style={{
              color: 'var(--player-text)',
              fontFamily: 'var(--player-font-body, inherit)',
              minHeight: '8em',
            }}
            value={text}
            onChange={(e) => onTextChange?.(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="text-lg leading-relaxed whitespace-pre-wrap"
            style={{
              color: 'var(--player-text)',
              fontFamily: 'var(--player-font-body, inherit)',
            }}
            onClick={handleClick}
          >
            {displayedText}
            {/* Typewriter cursor */}
            {!isComplete && (
              <span className="inline-block w-0.5 h-5 ml-1 bg-current animate-pulse" />
            )}
          </div>
        )}
      </div>

      {/* Prompt when complete — fixed at bottom */}
      {speakerName && (
        <div className="flex items-center justify-between mt-4 text-sm flex-shrink-0" style={{ color: 'var(--player-text-muted)' }}>
          <span>What's your move?</span>
          {renderTTSButton()}
        </div>
      )}
    </div>
  );
}
