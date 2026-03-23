/**
 * =============================================================================
 * CHAT WINDOW COMPONENT
 * =============================================================================
 *
 * A near-fullscreen modal providing a chat interface between the user and an
 * AI assistant. Messages are routed through direct Gemini/OpenAI API calls
 * via the Vite dev server. The AI can read and modify the complete game state
 * via inline command blocks (agentic loop).
 *
 * =============================================================================
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  SendHorizontal,
  Trash2,
  Bot,
  User,
  Loader2,
  Wrench,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Modal } from '@/components/common';
import { Button } from '@/components/common';
import { useProjectStore } from '@/stores/useProjectStore';
import { useImageGenStore } from '@/stores/useImageGenStore';
import { generateId } from '@/utils/idGenerator';
import { sendChatMessage, resetAgentContext } from '@/services/aiChatService';
import type { ChatMessage } from '@/types';

// =============================================================================
// COMPONENT PROPS
// =============================================================================

interface ChatWindowProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /**
   * When true, the component renders its content directly (no Modal wrapper).
   * Used by the co-write editor to embed the chat inside a sliding side panel
   * rather than a fullscreen modal overlay.
   */
  panelMode?: boolean;
}

// =============================================================================
// CONNECTION STATUS STATE
// =============================================================================

/**
 * Tracks whether the AI writer API is configured (has API key + model).
 * Checked from the writer settings in useImageGenStore.
 */
interface CliStatus {
  available: boolean;
  version: string;
  error: string | null;
  checked: boolean;
}

// =============================================================================
// CHAT WINDOW COMPONENT
// =============================================================================

export default function ChatWindow({ isOpen, onClose, panelMode = false }: ChatWindowProps) {
  // Use targeted selectors to avoid re-rendering on unrelated store changes
  const currentProject = useProjectStore(s => s.currentProject);
  const addChatMessage = useProjectStore(s => s.addChatMessage);
  const updateChatMessage = useProjectStore(s => s.updateChatMessage);
  const clearChatMessages = useProjectStore(s => s.clearChatMessages);

  const messages = currentProject?.chatMessages || [];

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');

  /** Whether the AI writer API is configured (has API key + model) */
  const [cliStatus, setCliStatus] = useState<CliStatus>({
    available: false,
    version: '',
    error: null,
    checked: false,
  });

  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const streamingTextRef = useRef('');
  const streamingMsgIdRef = useRef<string | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Check if writer API is configured when the chat opens
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const settings = useImageGenStore.getState();
    const writer = settings.writer;
    // For gemini provider, the shared googleApiKey can be used
    const apiKey = writer.provider === 'gemini'
      ? (writer.apiKey || settings.googleApiKey)
      : writer.apiKey;

    if (apiKey && writer.model) {
      setCliStatus({
        available: true,
        version: `${writer.provider} — ${writer.model}`,
        error: null,
        checked: true,
      });
    } else {
      setCliStatus({
        available: false,
        version: '',
        error: 'No API key configured. Set it in AI Settings (gear icon).',
        checked: true,
      });
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Auto-scroll to bottom when new messages arrive
  // ---------------------------------------------------------------------------
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // ---------------------------------------------------------------------------
  // Focus the textarea when the modal opens
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current();
      if (updateIntervalRef.current) clearInterval(updateIntervalRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Send message handler — routes through /api/chat → Gemini/OpenAI API
  // ---------------------------------------------------------------------------
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing) return;

    if (!cliStatus.available) {
      setStatusText(cliStatus.error || 'No API key configured. Set it in AI Settings.');
      return;
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: generateId('chat'),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    addChatMessage(userMsg);
    setInput('');

    // Create a placeholder assistant message for streaming
    const assistantMsgId = generateId('chat');
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      toolCalls: [],
    };
    addChatMessage(assistantMsg);

    // Set up streaming state
    setIsProcessing(true);
    setStatusText('AI is thinking...');
    streamingTextRef.current = '';
    streamingMsgIdRef.current = assistantMsgId;

    // Periodic store updates to avoid calling updateChatMessage on every chunk
    let lastUpdatedText = '';
    updateIntervalRef.current = setInterval(() => {
      if (
        streamingMsgIdRef.current &&
        streamingTextRef.current !== lastUpdatedText
      ) {
        lastUpdatedText = streamingTextRef.current;
        updateChatMessage(streamingMsgIdRef.current, {
          content: streamingTextRef.current,
          isStreaming: true,
        });
      }
    }, 150);

    // Send just the user's text — the persistent agent keeps its own history
    const abortFn = sendChatMessage(
      trimmed,
      // onTextDelta
      (text) => {
        streamingTextRef.current += text;
      },
      // onToolCallStart
      (toolName) => {
        setStatusText(`Executing: ${toolName}...`);
      },
      // onComplete
      (fullText, toolCalls) => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }
        if (streamingMsgIdRef.current) {
          updateChatMessage(streamingMsgIdRef.current, {
            content: fullText,
            isStreaming: false,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          });
        }
        streamingMsgIdRef.current = null;
        streamingTextRef.current = '';
        setIsProcessing(false);
        setStatusText('');
      },
      // onError
      (errorMsg) => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }
        const errorText = streamingTextRef.current
          ? `${streamingTextRef.current}\n\n[Error: ${errorMsg}]`
          : `Error: ${errorMsg}`;

        if (streamingMsgIdRef.current) {
          updateChatMessage(streamingMsgIdRef.current, {
            content: errorText,
            isStreaming: false,
          });
        }
        streamingMsgIdRef.current = null;
        streamingTextRef.current = '';
        setIsProcessing(false);
        setStatusText('');
      }
    );

    abortRef.current = abortFn;
  }, [input, isProcessing, cliStatus, addChatMessage, updateChatMessage]);

  // ---------------------------------------------------------------------------
  // Keyboard handler: Enter sends, Shift+Enter inserts newline
  // ---------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const isConnected = cliStatus.checked && cliStatus.available;
  const isChecking = !cliStatus.checked;

  // ---------------------------------------------------------------------------
  // Shared chat content — used in both modal mode and panel mode
  // ---------------------------------------------------------------------------

  /**
   * The inner chat UI (connection bar, messages, input area).
   * Extracted so it can be rendered inside either a Modal wrapper (game mode)
   * or directly inside the co-write sliding panel.
   *
   * In panel mode the outer container is the full-height panel div managed
   * by the parent (Editor.tsx), so we use h-full. In modal mode the content
   * has a fixed 78vh height and negative margins to fill the Modal chrome.
   */
  const chatContent = (
    <div
      className={`flex flex-col ${panelMode ? 'h-full' : '-mx-6 -mb-4 -mt-4'}`}
      style={panelMode ? undefined : { height: '78vh' }}
    >

      {/* ==================== CONNECTION STATUS BAR ==================== */}
      {cliStatus.checked && (
        <div className={`px-6 py-2 text-xs flex items-center gap-2 border-b flex-shrink-0 ${
          isConnected
            ? 'border-editor-border/50 bg-green-500/5 text-green-400'
            : 'border-editor-border bg-red-500/5 text-red-400'
        }`}>
          {isConnected ? (
            <>
              <Wifi size={14} />
              AI Writer: {cliStatus.version}
            </>
          ) : (
            <>
              <WifiOff size={14} />
              {cliStatus.error}
            </>
          )}
        </div>
      )}

      {/* ==================== MESSAGE HISTORY ==================== */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-editor-muted">
            <Bot size={48} className="mb-4 opacity-40" />
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm mt-1 text-center max-w-md">
              {isChecking
                ? 'Checking AI connection...'
                : isConnected
                  ? 'Start a conversation with the AI assistant. It can read and modify your game — create scenes, characters, variables, and more.'
                  : 'Configure your AI writer in AI Settings (gear icon). Set a provider, API key, and model.'}
            </p>
          </div>
        ) : (
          messages.map((msg: ChatMessage) => (
            <ChatBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={scrollAnchorRef} />
      </div>

      {/* ==================== STATUS BAR ==================== */}
      {statusText && (
        <div className="px-6 py-1.5 text-xs text-editor-muted flex items-center gap-2 border-t border-editor-border/50 flex-shrink-0">
          <Loader2 size={12} className="animate-spin" />
          {statusText}
        </div>
      )}

      {/* ==================== INPUT AREA ==================== */}
      <div className="border-t border-editor-border px-6 py-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="input flex-1 resize-none text-sm"
            style={{ minHeight: '60px', maxHeight: '120px' }}
            placeholder={
              isConnected
                ? 'Type a message... (Enter to send, Shift+Enter for newline)'
                : isChecking
                  ? 'Checking connection...'
                  : 'AI not configured — open AI Settings (gear icon)'
            }
            rows={3}
            disabled={isProcessing || !isConnected}
          />
          <div className="flex flex-col gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={!input.trim() || isProcessing || !isConnected}
              title="Send message"
            >
              {isProcessing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <SendHorizontal size={18} />
              )}
            </Button>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      'Clear all chat messages? This cannot be undone.'
                    )
                  ) {
                    clearChatMessages();
                    resetAgentContext();
                  }
                }}
                title="Clear chat history"
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // PANEL MODE: render the content directly (no Modal wrapper).
  // The parent provides the sliding drawer container.
  // ---------------------------------------------------------------------------
  if (panelMode) {
    return chatContent;
  }

  // ---------------------------------------------------------------------------
  // MODAL MODE: wrap in the standard near-fullscreen Modal.
  // ---------------------------------------------------------------------------
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Chat" size="nearfull">
      {chatContent}
    </Modal>
  );
}

// =============================================================================
// CHAT BUBBLE SUB-COMPONENT
// =============================================================================

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-4 py-2.5 ${
          isUser
            ? 'bg-accent/20 text-editor-text'
            : 'bg-editor-surface border border-editor-border text-editor-text'
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {isUser ? (
            <User size={12} className="text-accent" />
          ) : (
            <Bot size={12} className="text-editor-muted" />
          )}
          <span className="text-xs font-medium text-editor-muted">
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-editor-muted ml-auto">{time}</span>
        </div>

        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-editor-accent/70 ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-editor-border/50">
            {message.toolCalls.map((tc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-editor-accent/10 text-editor-accent border border-editor-accent/20"
                title={tc.result}
              >
                <Wrench size={10} />
                {formatToolCallLabel(tc.name, tc.result)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatToolCallLabel(name: string, result: string): string {
  try {
    const parsed = JSON.parse(result);
    if (parsed.success) {
      switch (name) {
        case 'create_scene': return 'Created scene';
        case 'update_scene': return 'Updated scene';
        case 'create_entity': return 'Created entity';
        case 'update_entity': return 'Updated entity';
        case 'link_entity_to_scene': return 'Linked entity';
        case 'update_entity_state': return 'Set entity state';
        case 'connect_nodes': return 'Connected nodes';
        case 'create_variable': return 'Created variable';
        case 'update_variable': return 'Updated variable';
      }
    }
  } catch {
    // fall through
  }
  return name.replace(/_/g, ' ');
}
