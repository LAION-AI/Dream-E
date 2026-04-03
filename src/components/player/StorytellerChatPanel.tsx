/**
 * =============================================================================
 * STORYTELLER CHAT PANEL — "The Storyteller"
 * =============================================================================
 *
 * A slide-in side panel (40vw width, not fullscreen) that provides a chat
 * interface with "The Storyteller" — an AI persona that can answer questions
 * about the game world, lore, characters, and story. Think of it as a
 * friendly DM/narrator you can chat with during Open World play.
 *
 * The panel streams responses via SSE, showing a blinking cursor during
 * generation. Message history is maintained for the session.
 *
 * DESIGN:
 * - Slides in from the right (40vw width like co-write chat)
 * - Dark panel with warm brown accent colors
 * - User messages: right-aligned, warm brown background
 * - Storyteller messages: left-aligned, darker background, book icon avatar
 * - Timestamps below each message
 * - Textarea input + send button at the bottom
 * - Keyboard: Escape to close, Enter to send (Shift+Enter for newline)
 * - Rendered via createPortal to document.body
 *
 * =============================================================================
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, X, Send } from 'lucide-react';

// --- Types ---

/** A single message in the storyteller chat */
export interface StorytellerMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface StorytellerChatPanelProps {
  /** Message history for the session */
  messages: StorytellerMessage[];
  /** Called when the user sends a new message */
  onSendMessage: (text: string) => void;
  /** Called when the user closes the panel */
  onClose: () => void;
  /** Whether the AI is currently generating a response */
  isGenerating: boolean;
  /** Partial text being streamed from the AI */
  streamingText: string;
}

// --- Helpers ---

/**
 * Format a timestamp into a short human-readable time string.
 * Shows "just now" for messages less than 60 seconds old.
 */
function formatTime(ts: number): string {
  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);
  if (diffSec < 60) return 'just now';
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// --- Component ---

export default function StorytellerChatPanel({
  messages,
  onSendMessage,
  onClose,
  isGenerating,
  streamingText,
}: StorytellerChatPanelProps) {
  // Slide-in animation
  const [visible, setVisible] = useState(false);
  // Input text
  const [inputText, setInputText] = useState('');
  // Refs for auto-scroll and input focus
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Trigger slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-scroll to the bottom when new messages arrive or streaming text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  // Focus the input on mount
  useEffect(() => {
    if (visible) {
      textareaRef.current?.focus();
    }
  }, [visible]);

  /**
   * Send the current input text as a user message.
   * Clears the input and calls the parent handler.
   */
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isGenerating) return;
    onSendMessage(text);
    setInputText('');
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputText, isGenerating, onSendMessage]);

  /**
   * Handle keydown in the input textarea.
   * Enter sends the message; Shift+Enter inserts a newline.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  /**
   * Auto-resize the textarea as the user types.
   * Grows up to a max height, then scrolls internally.
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  };

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Semi-transparent backdrop (lighter than fullscreen panels) */}
      <div
        className="absolute inset-0 bg-black/60 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Chat panel — 40vw width like the co-write chat */}
      <div
        className="relative h-full flex flex-col transition-transform duration-500 ease-out"
        style={{
          width: '40vw',
          minWidth: '380px',
          maxWidth: '650px',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          background: 'linear-gradient(180deg, rgba(30, 20, 12, 0.98) 0%, rgba(20, 14, 8, 0.99) 100%)',
          borderLeft: '1px solid rgba(180, 83, 9, 0.25)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{
            borderBottom: '1px solid rgba(180, 83, 9, 0.15)',
            background: 'rgba(30, 20, 12, 0.95)',
          }}
        >
          <div className="flex items-center gap-3">
            <BookOpen size={22} style={{ color: '#b45309' }} />
            <h2 className="text-lg font-bold text-amber-100">The Storyteller</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message list — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Empty state */}
          {messages.length === 0 && !streamingText && (
            <div className="text-center mt-12 space-y-3">
              <BookOpen size={40} className="mx-auto text-amber-900/50" />
              <p className="text-white/30 text-sm italic">
                Ask the Storyteller anything about the world, lore, characters, or story...
              </p>
            </div>
          )}

          {/* Rendered messages */}
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {/* Streaming text (assistant response being generated) */}
          {isGenerating && (
            <div className="flex gap-3 items-start">
              {/* Storyteller avatar */}
              <div className="w-8 h-8 rounded-full bg-amber-900/40 flex items-center justify-center flex-shrink-0 mt-1">
                <BookOpen size={14} className="text-amber-400/70" />
              </div>
              <div
                className="max-w-[85%] rounded-xl px-4 py-3"
                style={{
                  background: 'rgba(40, 28, 15, 0.8)',
                  border: '1px solid rgba(180, 83, 9, 0.12)',
                }}
              >
                <p
                  className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {streamingText || '...'}
                  {/* Blinking cursor */}
                  <span className="inline-block w-0.5 h-4 bg-amber-400/70 ml-0.5 animate-pulse" />
                </p>
              </div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area at bottom */}
        <div
          className="flex-shrink-0 px-5 py-4"
          style={{
            borderTop: '1px solid rgba(180, 83, 9, 0.15)',
            background: 'rgba(25, 18, 10, 0.95)',
          }}
        >
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              className="flex-1 text-sm text-white/90 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:border-amber-600/40 placeholder-white/25"
              style={{ minHeight: '42px', maxHeight: '150px' }}
              placeholder="Ask the Storyteller..."
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isGenerating}
              className="p-2.5 rounded-xl transition-all disabled:opacity-30"
              style={{
                background: 'rgba(180, 83, 9, 0.3)',
                border: '1px solid rgba(180, 83, 9, 0.4)',
              }}
              title="Send message"
            >
              <Send size={18} style={{ color: '#b45309' }} />
            </button>
          </div>
          <p className="text-[10px] text-white/20 mt-1.5 text-center">
            Enter to send, Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// --- Message bubble sub-component ---

/**
 * Renders a single chat message, styled differently for user vs. assistant.
 * User messages are right-aligned with warm brown background.
 * Assistant messages are left-aligned with a book icon avatar.
 */
function MessageBubble({ message }: { message: StorytellerMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar — only for assistant */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-amber-900/40 flex items-center justify-center flex-shrink-0 mt-1">
          <BookOpen size={14} className="text-amber-400/70" />
        </div>
      )}

      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {/* Message bubble */}
        <div
          className="rounded-xl px-4 py-3 inline-block text-left"
          style={
            isUser
              ? {
                  background: 'rgba(120, 70, 30, 0.5)',
                  border: '1px solid rgba(180, 120, 60, 0.2)',
                }
              : {
                  background: 'rgba(40, 28, 15, 0.8)',
                  border: '1px solid rgba(180, 83, 9, 0.12)',
                }
          }
        >
          <p
            className={`text-sm leading-relaxed whitespace-pre-wrap ${
              isUser ? 'text-amber-100' : 'text-white/70'
            }`}
            style={!isUser ? { fontFamily: 'Georgia, "Times New Roman", serif' } : undefined}
          >
            {message.content}
          </p>
        </div>

        {/* Timestamp */}
        <p className="text-[10px] text-white/20 mt-1 px-1">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
