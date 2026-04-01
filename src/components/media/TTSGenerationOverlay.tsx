/**
 * =============================================================================
 * TTS GENERATION OVERLAY
 * =============================================================================
 *
 * A reusable modal overlay for generating text-to-speech audio via the
 * Gemini TTS API. Can be opened from character inspectors, scene inspectors,
 * entity managers, etc.
 *
 * FEATURES:
 * - Text textarea (what to say)
 * - Voice instruction textarea (how to say it — narrator style direction)
 * - Voice selector dropdown with all Gemini 2.5 TTS voices
 * - Model selector
 * - Generate button with loading spinner
 * - Audio preview with playback controls
 * - "Use This Audio" / "Regenerate" buttons
 *
 * WHY A SEPARATE OVERLAY?
 * TTS generation is needed from multiple places — scene voiceovers, entity
 * reference voices, standalone audio clips. A shared overlay avoids duplicating
 * the TTS UI in every inspector component.
 *
 * =============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  Loader2,
  RefreshCw,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '@components/common/Modal';
import { useImageGenStore } from '@/stores/useImageGenStore';

// =============================================================================
// TYPES
// =============================================================================

export interface TTSGenerationOverlayProps {
  /** Whether the overlay is currently visible */
  isOpen: boolean;
  /** Callback to close the overlay */
  onClose: () => void;
  /** Called with the generated audio data URL when generation succeeds */
  onAudioGenerated: (dataUrl: string) => void;
  /** Optional initial text to convert to speech */
  initialText?: string;
  /** Optional title for the overlay header */
  title?: string;
}

// =============================================================================
// VOICE LIST
// =============================================================================

/**
 * All available Gemini 2.5 TTS voices.
 * These are the built-in voices supported by the gemini-2.5-flash-preview-tts
 * and gemini-2.5-pro-preview-tts models.
 */
const GEMINI_TTS_VOICES = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Gacrux',
  'Laomedeia',
  'Pulcherrima',
  'Sadachbia',
  'Sulafat',
  'Vindemiatrix',
  'Zubenelgenubi',
] as const;

/**
 * TTS model options. The flash preview is the default;
 * pro preview is higher quality but slower.
 */
const TTS_MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash TTS (fast)' },
  { value: 'gemini-2.5-pro-preview-tts', label: 'Gemini 2.5 Pro TTS (quality)' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function TTSGenerationOverlay({
  isOpen,
  onClose,
  onAudioGenerated,
  initialText = '',
  title = 'Generate Voice Audio',
}: TTSGenerationOverlayProps) {
  // ── Local state ────────────────────────────────────────────────────────

  /** The text to convert to speech */
  const [text, setText] = useState(initialText);

  /** Voice instruction — how the text should be spoken */
  const [voiceInstruction, setVoiceInstruction] = useState(
    'Read aloud in a very natural fluid audiobook narrator style, very genuine:'
  );

  /** Selected voice name */
  const [voice, setVoice] = useState('Zephyr');

  /** Selected TTS model */
  const [model, setModel] = useState('gemini-2.5-flash-preview-tts');

  /** Whether generation is in progress */
  const [isGenerating, setIsGenerating] = useState(false);

  /** Error message from the last generation attempt */
  const [error, setError] = useState<string | null>(null);

  /** The generated audio data URL */
  const [resultAudio, setResultAudio] = useState<string | null>(null);

  /** Reference to the audio player element for preview playback */
  const audioRef = useRef<HTMLAudioElement>(null);

  // ── Store values ───────────────────────────────────────────────────────

  const store = useImageGenStore();

  // ── Reset state when the modal opens ───────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      // Sync voice instruction and voice from store defaults
      setVoiceInstruction(store.tts.instruction || 'Read aloud in a very natural fluid audiobook narrator style, very genuine:');
      setVoice(store.tts.voice || 'Zephyr');
      setModel(store.tts.model || 'gemini-2.5-flash-preview-tts');
      setIsGenerating(false);
      setError(null);
      setResultAudio(null);
    }
  }, [isOpen, initialText, store.tts.instruction, store.tts.voice, store.tts.model]);

  // ── Generation ─────────────────────────────────────────────────────────

  /**
   * Sends the TTS generation request to the server endpoint.
   * The server calls the Gemini TTS API and returns a base64 audio data URL.
   */
  const handleGenerate = async () => {
    if (!text.trim()) {
      setError('Please enter some text to convert to speech.');
      return;
    }

    if (!store.googleApiKey && !store.apiKey) {
      setError('An API key is required for TTS. Set Google API Key or provider key in AI Settings.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResultAudio(null);

    try {
      const res = await fetch('/api/generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          googleApiKey: store.googleApiKey || '',
          hyprLabApiKey: store.apiKey || '',
          model,
          voice,
          instruction: voiceInstruction.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `TTS generation failed (${res.status})`);
      }

      const data = await res.json();
      if (!data.dataUrl) {
        throw new Error('No audio returned from the server.');
      }

      setResultAudio(data.dataUrl);
    } catch (err: any) {
      console.error('[TTSGenOverlay] Generation failed:', err);
      setError(err.message || 'TTS generation failed. Check your API settings.');
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * User accepts the generated audio — pass it back to the caller.
   */
  const handleUseAudio = () => {
    if (resultAudio) {
      onAudioGenerated(resultAudio);
      onClose();
    }
  };

  /**
   * User wants to try again — clear the result and re-generate.
   */
  const handleRegenerate = () => {
    setResultAudio(null);
    handleGenerate();
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── API Key status ── */}
        <div style={{
          padding: '8px 14px',
          borderRadius: 8,
          background: (store.googleApiKey || store.apiKey)
            ? 'rgba(74, 222, 128, 0.06)'
            : 'rgba(239, 68, 68, 0.06)',
          border: `1px solid ${(store.googleApiKey || store.apiKey)
            ? 'rgba(74, 222, 128, 0.2)'
            : 'rgba(239, 68, 68, 0.2)'}`,
          fontSize: '0.82em',
          color: '#8b8fa4',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ color: (store.googleApiKey || store.apiKey) ? '#4ade80' : '#ef4444' }}>●</span>
          <span>
            {store.googleApiKey
              ? <>Google API Key set. Using <strong style={{ color: '#e2e4ea' }}>{model}</strong></>
              : store.apiKey
                ? <>Using provider key (HyprLab). Model: <strong style={{ color: '#e2e4ea' }}>{model}</strong></>
                : <>API Key missing. Set Google API Key or provider key in AI Settings.</>
            }
          </span>
        </div>

        {/* ── Text Textarea ── */}
        <div>
          <label style={labelStyle}>Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter the text to convert to speech..."
            rows={4}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #2d3148',
              background: '#0f1117',
              color: '#e2e4ea',
              fontSize: '0.92em',
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 80,
              outline: 'none',
            }}
            disabled={isGenerating}
          />
        </div>

        {/* ── Voice Instruction Textarea ── */}
        <div>
          <label style={labelStyle}>Voice Instruction</label>
          <textarea
            value={voiceInstruction}
            onChange={(e) => setVoiceInstruction(e.target.value)}
            placeholder="e.g., Speak in a deep, gravelly voice with a slight British accent. Sound weary but determined."
            rows={2}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #2d3148',
              background: '#0f1117',
              color: '#e2e4ea',
              fontSize: '0.88em',
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 50,
              outline: 'none',
            }}
            disabled={isGenerating}
          />
          <p style={{ fontSize: '0.78em', color: '#8b8fa4', marginTop: 4 }}>
            Instruction prefix sent before the text. Controls narration style, emotion, and delivery.
          </p>
        </div>

        {/* ── Voice + Model Selectors (side by side) ── */}
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Voice Selector */}
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={isGenerating}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #2d3148',
                background: '#0f1117',
                color: '#e2e4ea',
                fontSize: '0.88em',
                cursor: 'pointer',
                appearance: 'auto',
                outline: 'none',
              }}
            >
              {GEMINI_TTS_VOICES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* Model Selector */}
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isGenerating}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #2d3148',
                background: '#0f1117',
                color: '#e2e4ea',
                fontSize: '0.88em',
                cursor: 'pointer',
                appearance: 'auto',
                outline: 'none',
              }}
            >
              {TTS_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Error Message ── */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '0.85em',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* ── Result Preview ── */}
        {resultAudio && (
          <div style={{
            borderRadius: 8,
            border: '1px solid #2d3148',
            padding: 12,
            background: '#171923',
          }}>
            <label style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>
              Generated Audio
            </label>
            <audio
              ref={audioRef}
              controls
              src={resultAudio}
              style={{
                width: '100%',
                height: 40,
                marginBottom: 12,
                filter: 'invert(1) hue-rotate(180deg)',
                opacity: 0.85,
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={handleRegenerate}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #2d3148',
                  background: 'transparent',
                  color: '#8b8fa4',
                  fontWeight: 500,
                  fontSize: '0.88em',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw size={14} />
                Regenerate
              </button>
              <button
                onClick={handleUseAudio}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#6c8aff',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.88em',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Check size={14} />
                Use This Audio
              </button>
            </div>
          </div>
        )}

        {/* ── Action Buttons (Generate / Cancel) ── */}
        {!resultAudio && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: '1px solid #2d3148',
                background: 'transparent',
                color: '#8b8fa4',
                fontWeight: 500,
                fontSize: '0.9em',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim() || (!store.googleApiKey && !store.apiKey)}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: (isGenerating || !text.trim() || (!store.googleApiKey && !store.apiKey)) ? '#6c8aff80' : '#6c8aff',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.9em',
                cursor: (isGenerating || !text.trim() || (!store.googleApiKey && !store.apiKey)) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Volume2 size={16} />
                  Generate
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// =============================================================================
// INLINE STYLES
// =============================================================================

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8em',
  fontWeight: 600,
  color: '#8b8fa4',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
};
