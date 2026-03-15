/**
 * =============================================================================
 * OPEN WORLD INPUT — Free-form player action input
 * =============================================================================
 *
 * Text box displayed below the dialog/choice area in Open World mode.
 * The player types what they want to do, and the AI generates a continuation.
 *
 * Features:
 *   - Text input with Send button
 *   - Mic button for voice input (ASR via Gemini multimodal)
 *   - Notes button to edit project notes in-game
 *
 * =============================================================================
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Mic, MicOff, StickyNote } from 'lucide-react';
import { useImageGenStore } from '@/stores/useImageGenStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { Modal } from '@components/common';

// =============================================================================
// TYPES
// =============================================================================

interface OpenWorldInputProps {
  onSubmit: (action: string) => void;
  disabled: boolean;
  placeholder?: string;
}

/** Recording states for the mic button */
type RecordingState = 'idle' | 'recording' | 'transcribing';

// =============================================================================
// COMPONENT
// =============================================================================

export default function OpenWorldInput({ onSubmit, disabled, placeholder }: OpenWorldInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Mic / ASR state ──
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Notes modal state ──
  const [showNotes, setShowNotes] = useState(false);
  const notes = useProjectStore((s) => s.currentProject?.notes || '');
  const updateNotes = useProjectStore((s) => s.updateNotes);

  // Auto-focus when enabled
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Voice Input (ASR) ─────────────────────────────────────────

  /**
   * Start recording audio from the microphone.
   * Uses MediaRecorder API with webm/opus codec.
   * Respects the selected device ID from ASR settings.
   */
  const startRecording = useCallback(async () => {
    try {
      const settings = useImageGenStore.getState();
      const deviceId = settings.asr?.deviceId || '';

      // Build audio constraints — use specific device if configured
      const audio: boolean | MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : true;

      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      streamRef.current = stream;

      // Prefer webm/opus, fall back to whatever the browser supports
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Build blob and send to transcription endpoint
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 100) {
          console.warn('[ASR] Recording too short or empty, skipping transcription');
          setRecordingState('idle');
          return;
        }
        transcribeAudio(blob, mimeType);
      };

      // Use timeslice to collect data periodically (more reliable than waiting for stop)
      recorder.start(500);
      setRecordingState('recording');
    } catch (err) {
      console.error('[ASR] Failed to start recording:', err);
      setRecordingState('idle');
    }
  }, []);

  /**
   * Stop recording and trigger transcription.
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Stop the microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecordingState('transcribing');
  }, []);

  /**
   * Convert a Blob to a base64 string using FileReader (reliable for large blobs).
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Strip the "data:audio/webm;base64," prefix to get raw base64
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Send recorded audio to the server for transcription via Gemini.
   */
  const transcribeAudio = async (blob: Blob, mimeType: string) => {
    try {
      const settings = useImageGenStore.getState();
      const googleApiKey = settings.googleApiKey;
      const model = settings.asr?.model || 'gemini-2.5-flash-lite';

      console.log(`[ASR] Sending ${(blob.size / 1024).toFixed(1)}KB audio (${mimeType}) to ${model}`);

      // Convert blob to base64 via FileReader (reliable for large blobs)
      const base64 = await blobToBase64(blob);

      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioData: base64,
          mimeType: mimeType.split(';')[0], // strip codecs param
          googleApiKey,
          model,
        }),
      });

      const data = await response.json();
      if (data.error) {
        console.error('[ASR] Transcription error:', data.error);
      } else if (data.noSpeech) {
        console.log('[ASR] No speech detected in recording');
      } else if (data.transcript) {
        console.log(`[ASR] Transcribed: "${data.transcript.slice(0, 80)}..."`);
        // Append transcript to existing text (with space separator)
        setText((prev) => {
          const separator = prev.trim() ? ' ' : '';
          return prev + separator + data.transcript;
        });
      } else {
        console.warn('[ASR] Empty response from server');
      }
    } catch (err) {
      console.error('[ASR] Transcription request failed:', err);
    } finally {
      setRecordingState('idle');
    }
  };

  /**
   * Toggle recording on/off.
   */
  const handleMicClick = () => {
    if (disabled) return;
    if (recordingState === 'recording') {
      stopRecording();
    } else if (recordingState === 'idle') {
      startRecording();
    }
    // If 'transcribing', do nothing (wait for result)
  };

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="relative">
      <div className="flex items-end gap-2 bg-black/40 backdrop-blur-sm rounded-lg border border-white/10 p-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder || 'What do you want to do? (Shift+Enter for new line)'}
          className="flex-1 bg-transparent text-white/90 text-sm placeholder-white/30 resize-none outline-none min-h-[40px] max-h-[120px] py-1.5 px-2"
          rows={1}
          style={{
            height: 'auto',
            minHeight: '40px',
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 120) + 'px';
          }}
        />

        {/* Action buttons container */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Notes button */}
          <button
            onClick={() => setShowNotes(true)}
            disabled={disabled}
            className={`
              p-2 rounded-lg transition-all
              ${disabled
                ? 'text-white/20 cursor-not-allowed'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }
            `}
            title="Project Notes"
          >
            <StickyNote size={18} />
          </button>

          {/* Mic button */}
          <button
            onClick={handleMicClick}
            disabled={disabled || recordingState === 'transcribing'}
            className={`
              p-2 rounded-lg transition-all
              ${recordingState === 'recording'
                ? 'text-red-400 bg-red-500/20 animate-pulse shadow-lg shadow-red-500/20'
                : recordingState === 'transcribing'
                  ? 'text-amber-400 cursor-wait'
                  : disabled
                    ? 'text-white/20 cursor-not-allowed'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }
            `}
            title={
              recordingState === 'recording'
                ? 'Stop recording'
                : recordingState === 'transcribing'
                  ? 'Transcribing...'
                  : 'Voice input'
            }
          >
            {recordingState === 'transcribing' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : recordingState === 'recording' ? (
              <MicOff size={18} />
            ) : (
              <Mic size={18} />
            )}
          </button>

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
            className={`
              p-2 rounded-lg transition-all
              ${disabled
                ? 'text-white/20 cursor-not-allowed'
                : text.trim()
                  ? 'text-white bg-purple-600/80 hover:bg-purple-500/80 shadow-lg shadow-purple-500/20'
                  : 'text-white/30 hover:text-white/50'
              }
            `}
            title="Send (Enter)"
          >
            {disabled ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>

      {/* Recording indicator bar */}
      {recordingState === 'recording' && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 via-red-400 to-red-500 rounded-full animate-pulse" />
      )}

      <p className="text-[10px] text-white/20 mt-1 text-center">
        Open World Mode — describe what you want to do
      </p>

      {/* ── Notes Modal ── */}
      <Modal isOpen={showNotes} onClose={() => setShowNotes(false)} title="Project Notes" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: '0.82em', color: '#8b8fa4' }}>
            Notes are included in the AI context for every scene generation.
            Add world-building details, character backstories, or gameplay instructions.
          </p>
          <textarea
            value={notes}
            onChange={(e) => updateNotes(e.target.value)}
            placeholder="Add notes, instructions, world-building details..."
            style={{
              width: '100%',
              minHeight: 300,
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #2d3148',
              background: '#0f1117',
              color: '#e2e4ea',
              fontSize: '0.92em',
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              lineHeight: '1.6',
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowNotes(false)}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#6c8aff',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.9em',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
