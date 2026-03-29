/**
 * =============================================================================
 * AI SETTINGS MODAL
 * =============================================================================
 *
 * Configuration panel for AI image generation and TTS.
 * Supports:
 *   - Black Forest Labs (BFL/FLUX)
 *   - OpenAI-compatible (/images/generations)
 *   - Google Gemini (image generation + TTS)
 *
 * Settings are persisted to localStorage via the useImageGenStore.
 *
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from '../common/Modal';
import { useImageGenStore, type ImageGenProvider, type WriterProvider, DEFAULT_WRITER_SYSTEM_PROMPT, DEFAULT_WRITER_INSTRUCTION } from '@/stores/useImageGenStore';

// =============================================================================
// MODEL PRESETS — editable, user can also type custom model names
// =============================================================================

/** BFL FLUX 2 model presets (no FLUX 1.x — user explicitly requested only FLUX 2) */
const BFL_MODEL_PRESETS = [
  { value: 'flux-2-pro-preview', label: 'FLUX 2 Pro Preview' },
  { value: 'flux-2-pro', label: 'FLUX 2 Pro' },
  { value: 'flux-2-max', label: 'FLUX 2 Max (up to 8 ref images)' },
  { value: 'flux-2-flex', label: 'FLUX 2 Flex (typography)' },
  { value: 'flux-2-klein-9b-preview', label: 'FLUX 2 Klein 9B Preview' },
  { value: 'flux-2-klein-9b', label: 'FLUX 2 Klein 9B' },
];

/** Google Gemini image model presets (Nano Banana family + Imagen) */
const GEMINI_MODEL_PRESETS = [
  { value: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2 (Gemini 3.1 Flash)' },
  { value: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro (Gemini 3 Pro)' },
  { value: 'gemini-2.0-flash-preview-image-generation', label: 'Gemini 2.0 Flash Image' },
  { value: 'imagen-3.0-generate-002', label: 'Imagen 3.0' },
];

/** OpenAI-compatible image model presets (includes HyprLab nano-banana models) */
const OPENAI_MODEL_PRESETS = [
  { value: 'nano-banana-2', label: 'Nano Banana 2 (HyprLab)' },
  { value: 'nano-banana-pro', label: 'Nano Banana Pro (HyprLab)' },
  { value: 'dall-e-3', label: 'DALL-E 3' },
  { value: 'dall-e-2', label: 'DALL-E 2' },
];

/**
 * Writer model presets per provider. These populate the combobox dropdown
 * so users can quickly pick a known-good model while still typing custom names.
 */
const GEMINI_WRITER_PRESETS = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'gemini-3.1-flash-preview', label: 'Gemini 3.1 Flash Preview' },
  { value: 'gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash Preview' },
  { value: 'gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro Preview' },
];

const OPENAI_WRITER_PRESETS = [
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (HyprLab)' },
  { value: 'gemini-3-flash', label: 'Gemini 3 Flash (HyprLab)' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (HyprLab)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (HyprLab)' },
  { value: 'kimi-k2.5', label: 'Kimi K2.5 (HyprLab)' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

// =============================================================================
// COMPONENT
// =============================================================================

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const store = useImageGenStore();

  // Local form state — synced from store on open
  const [provider, setProvider] = useState<ImageGenProvider>(store.provider);
  const [apiKey, setApiKey] = useState(store.apiKey);
  const [model, setModel] = useState(store.model);
  const [endpoint, setEndpoint] = useState(store.endpoint);
  const [googleApiKey, setGoogleApiKey] = useState(store.googleApiKey);
  const [geminiImageModel, setGeminiImageModel] = useState(store.geminiImageModel);
  const [defaultImageStyle, setDefaultImageStyle] = useState(store.defaultImageStyle);
  const [ttsEnabled, setTtsEnabled] = useState(store.tts.enabled);
  const [ttsModel, setTtsModel] = useState(store.tts.model);
  const [ttsVoice, setTtsVoice] = useState(store.tts.voice);
  const [ttsInstruction, setTtsInstruction] = useState(store.tts.instruction);

  // ASR settings
  const [asrEnabled, setAsrEnabled] = useState(store.asr?.enabled ?? true);
  const [asrModel, setAsrModel] = useState(store.asr?.model || 'gemini-2.5-flash-lite');
  const [asrDeviceId, setAsrDeviceId] = useState(store.asr?.deviceId || '');

  // Microphone devices + test state
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micTestLevel, setMicTestLevel] = useState(0);    // 0–100 audio level
  const [micTesting, setMicTesting] = useState(false);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestAnalyserRef = useRef<AnalyserNode | null>(null);
  const micTestRafRef = useRef<number>(0);

  // Writer settings
  const [writerProvider, setWriterProvider] = useState<WriterProvider>(store.writer.provider);
  const [writerModel, setWriterModel] = useState(store.writer.model);
  const [writerEndpoint, setWriterEndpoint] = useState(store.writer.endpoint);
  const [writerApiKey, setWriterApiKey] = useState(store.writer.apiKey);
  const [writerSystemPrompt, setWriterSystemPrompt] = useState(store.writer.systemPrompt);
  const [writerInstruction, setWriterInstruction] = useState(store.writer.instruction);
  const [writerMaxContextTokens, setWriterMaxContextTokens] = useState(store.writer.maxContextTokens || 500_000);

  const [saved, setSaved] = useState(false);

  // Sync from store when modal opens
  useEffect(() => {
    if (isOpen) {
      setProvider(store.provider);
      setApiKey(store.apiKey);
      setModel(store.model);
      setEndpoint(store.endpoint);
      setGoogleApiKey(store.googleApiKey);
      setGeminiImageModel(store.geminiImageModel);
      setDefaultImageStyle(store.defaultImageStyle);
      setTtsEnabled(store.tts.enabled);
      setTtsModel(store.tts.model);
      setTtsVoice(store.tts.voice);
      setTtsInstruction(store.tts.instruction);
      setAsrEnabled(store.asr?.enabled ?? true);
      setAsrModel(store.asr?.model || 'gemini-2.5-flash-lite');
      setAsrDeviceId(store.asr?.deviceId || '');
      // Enumerate microphone devices
      enumerateMics();
      setWriterProvider(store.writer.provider);
      setWriterModel(store.writer.model);
      setWriterEndpoint(store.writer.endpoint);
      setWriterApiKey(store.writer.apiKey);
      setWriterSystemPrompt(store.writer.systemPrompt);
      setWriterInstruction(store.writer.instruction);
      setWriterMaxContextTokens(store.writer.maxContextTokens || 500_000);
      setSaved(false);
    }
  }, [isOpen]);

  // ── Microphone enumeration + test ──────────────────────────────

  /** Enumerate available audio input devices */
  const enumerateMics = useCallback(async () => {
    try {
      // Request permission first so labels are populated
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((t) => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      setMicDevices(audioInputs);
    } catch (err) {
      console.warn('[AISettings] Could not enumerate microphones:', err);
      setMicDevices([]);
    }
  }, []);

  /** Start microphone test — opens stream and shows live audio level */
  const startMicTest = useCallback(async () => {
    // Stop any existing test
    stopMicTest();

    try {
      const audioConstraints: MediaTrackConstraints = asrDeviceId
        ? { deviceId: { exact: asrDeviceId } }
        : {};

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: Object.keys(audioConstraints).length > 0 ? audioConstraints : true,
      });
      micTestStreamRef.current = stream;

      // Set up Web Audio analyser to read volume
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micTestAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Animation loop to read volume level
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        // Compute RMS-ish average of frequencies
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        // Normalize to 0–100 (typical speaking is 40-80 on this scale)
        setMicTestLevel(Math.min(100, Math.round((avg / 128) * 100)));
        micTestRafRef.current = requestAnimationFrame(tick);
      };
      micTestRafRef.current = requestAnimationFrame(tick);

      setMicTesting(true);
    } catch (err) {
      console.error('[AISettings] Mic test failed:', err);
    }
  }, [asrDeviceId]);

  /** Stop microphone test */
  const stopMicTest = useCallback(() => {
    if (micTestRafRef.current) {
      cancelAnimationFrame(micTestRafRef.current);
      micTestRafRef.current = 0;
    }
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach((t) => t.stop());
      micTestStreamRef.current = null;
    }
    micTestAnalyserRef.current = null;
    setMicTestLevel(0);
    setMicTesting(false);
  }, []);

  // Clean up mic test when modal closes
  useEffect(() => {
    if (!isOpen) stopMicTest();
  }, [isOpen, stopMicTest]);

  // Update defaults when provider changes
  const handleProviderChange = (p: ImageGenProvider) => {
    setProvider(p);
    if (p === 'bfl') {
      setEndpoint('https://api.bfl.ai/v1');
      setModel('flux-2-pro-preview');
    } else if (p === 'openai-compatible') {
      setEndpoint('https://api.openai.com/v1');
      setModel('dall-e-3');
    }
    // Gemini uses googleApiKey + geminiImageModel, no endpoint/model change needed
  };

  const handleSave = () => {
    store.updateSettings({ provider, apiKey, model, endpoint });
    store.setGoogleApiKey(googleApiKey);
    store.setGeminiImageModel(geminiImageModel);
    store.setDefaultImageStyle(defaultImageStyle);
    store.updateTTS({ enabled: ttsEnabled, model: ttsModel, voice: ttsVoice, instruction: ttsInstruction });
    store.updateASR({ enabled: asrEnabled, model: asrModel, deviceId: asrDeviceId });
    store.updateWriter({
      provider: writerProvider,
      model: writerModel,
      endpoint: writerEndpoint,
      apiKey: writerApiKey,
      systemPrompt: writerSystemPrompt,
      instruction: writerInstruction,
      maxContextTokens: writerMaxContextTokens,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleResetWriterPrompts = () => {
    setWriterSystemPrompt(DEFAULT_WRITER_SYSTEM_PROMPT);
    setWriterInstruction(DEFAULT_WRITER_INSTRUCTION);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Settings" size="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0' }}>

        {/* ── Google API Key (shared by Gemini image + TTS) ── */}
        <div>
          <label style={sectionTitleStyle}>Google AI API Key</label>
          <input
            type="password"
            value={googleApiKey}
            onChange={(e) => setGoogleApiKey(e.target.value)}
            placeholder="AIza..."
            style={inputStyle}
          />
          <p style={hintStyle}>
            Used for Gemini image generation and TTS. Get yours at aistudio.google.com
          </p>
        </div>

        <div style={dividerStyle} />

        {/* ── IMAGE GENERATION SECTION ── */}
        <label style={sectionTitleStyle}>Image Generation</label>

        {/* Provider Select — clear dropdown */}
        <div>
          <label style={labelStyle}>Provider</label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as ImageGenProvider)}
            style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
          >
            <option value="bfl">Black Forest Labs (FLUX)</option>
            <option value="gemini">Google Gemini (Nano Banana)</option>
            <option value="openai-compatible">OpenAI-Compatible</option>
          </select>
        </div>

        {/* Active provider indicator — always visible */}
        <div style={activeProviderStyle}>
          <span style={{ color: '#4ade80', marginRight: 6 }}>●</span>
          <span>
            Images will be generated using{' '}
            <strong style={{ color: '#e2e4ea' }}>
              {provider === 'bfl' ? 'Black Forest Labs' : provider === 'gemini' ? 'Google Gemini' : 'OpenAI-Compatible'}
            </strong>
            {' — '}
            <span style={{ fontFamily: "'Cascadia Code', monospace", color: '#6c8aff' }}>
              {provider === 'gemini' ? geminiImageModel : model}
            </span>
          </span>
        </div>

        {/* Model — editable combobox with presets per provider */}
        <div>
          <label style={labelStyle}>Model</label>
          <ModelComboBox
            value={provider === 'gemini' ? geminiImageModel : model}
            onChange={(val) => {
              if (provider === 'gemini') setGeminiImageModel(val);
              else setModel(val);
            }}
            options={
              provider === 'bfl' ? BFL_MODEL_PRESETS
                : provider === 'gemini' ? GEMINI_MODEL_PRESETS
                : OPENAI_MODEL_PRESETS
            }
            placeholder={
              provider === 'bfl' ? 'flux-2-pro-preview'
                : provider === 'gemini' ? 'gemini-3.1-flash-image-preview'
                : 'dall-e-3'
            }
          />
          <p style={hintStyle}>
            Select a preset or type a custom model name. The model determines quality, speed, and features.
          </p>
        </div>

        {/* Provider-specific fields (API key, endpoint) */}
        {provider === 'gemini' ? (
          <p style={hintStyle}>
            Uses your Google AI API Key above.
          </p>
        ) : (
          <>
            {/* BFL / OpenAI API Key */}
            <div>
              <label style={labelStyle}>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'bfl' ? 'bfl_...' : 'sk-...'}
                style={inputStyle}
              />
              <p style={hintStyle}>
                {provider === 'bfl'
                  ? 'Get your key at api.bfl.ai'
                  : 'Bearer token for the image generation API'
                }
              </p>
            </div>

            {/* Endpoint */}
            <div>
              <label style={labelStyle}>Endpoint</label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={provider === 'bfl' ? 'https://api.bfl.ai/v1' : 'https://api.openai.com/v1'}
                style={inputStyle}
              />
              <p style={hintStyle}>
                {provider === 'bfl'
                  ? 'Base URL — model name is appended as path segment'
                  : 'Base URL — /images/generations is appended'
                }
              </p>
            </div>
          </>
        )}

        {/* Default Image Style */}
        <div>
          <label style={labelStyle}>Default Image Style</label>
          <input
            type="text"
            value={defaultImageStyle}
            onChange={(e) => setDefaultImageStyle(e.target.value)}
            placeholder="e.g. anime style, cinematic photography, oil painting..."
            style={inputStyle}
          />
          <p style={hintStyle}>
            Appended to every image generation prompt. Sets the visual aesthetic for all generated images.
          </p>
        </div>

        <div style={dividerStyle} />

        {/* ── TTS SECTION ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={sectionTitleStyle}>Text-to-Speech (Gemini)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={(e) => setTtsEnabled(e.target.checked)}
                style={{ accentColor: '#6c8aff', width: 16, height: 16 }}
              />
              <span style={{ fontSize: '0.85em', color: ttsEnabled ? '#e2e4ea' : '#8b8fa4' }}>
                Enabled
              </span>
            </label>
          </div>
          <p style={{ ...hintStyle, marginTop: 4, marginBottom: 12 }}>
            Uses your Google AI API Key. Generates voiceover audio for scenes.
          </p>
        </div>

        {ttsEnabled && (
          <>
            <div>
              <label style={labelStyle}>TTS Model</label>
              <input
                type="text"
                value={ttsModel}
                onChange={(e) => setTtsModel(e.target.value)}
                placeholder="gemini-2.5-flash-preview-tts"
                style={inputStyle}
              />
              <p style={hintStyle}>
                Models: gemini-2.5-flash-preview-tts, gemini-2.5-pro-preview-tts
              </p>
            </div>

            <div>
              <label style={labelStyle}>Voice</label>
              <input
                type="text"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                placeholder="Zephyr"
                style={inputStyle}
              />
              <p style={hintStyle}>
                Voices: Zephyr, Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Perseus
              </p>
            </div>

            <div>
              <label style={labelStyle}>Narrator Instruction</label>
              <textarea
                value={ttsInstruction}
                onChange={(e) => setTtsInstruction(e.target.value)}
                placeholder="Read aloud in a very natural fluid audiobook narrator style, very genuine:"
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                rows={2}
              />
              <p style={hintStyle}>
                Instruction prefix sent before scene text. Defines narration style and tone.
              </p>
            </div>
          </>
        )}

        <div style={dividerStyle} />

        {/* ── ASR (Voice Input) SECTION ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={sectionTitleStyle}>Voice Input (ASR)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={asrEnabled}
                onChange={(e) => setAsrEnabled(e.target.checked)}
                style={{ accentColor: '#6c8aff', width: 16, height: 16 }}
              />
              <span style={{ fontSize: '0.85em', color: asrEnabled ? '#e2e4ea' : '#8b8fa4' }}>
                Enabled
              </span>
            </label>
          </div>
          <p style={{ ...hintStyle, marginTop: 4, marginBottom: 12 }}>
            Uses Gemini multimodal to transcribe voice to text in Open World mode. Uses your Google AI API Key.
          </p>
        </div>

        {asrEnabled && (
          <>
            <div>
              <label style={labelStyle}>ASR Model</label>
              <input
                type="text"
                value={asrModel}
                onChange={(e) => setAsrModel(e.target.value)}
                placeholder="gemini-2.5-flash-lite"
                style={inputStyle}
              />
              <p style={hintStyle}>
                Any Gemini model with multimodal audio input. Recommended: gemini-2.5-flash-lite (fast &amp; cheap)
              </p>
            </div>

            {/* Microphone Selection */}
            <div>
              <label style={labelStyle}>Microphone</label>
              <select
                value={asrDeviceId}
                onChange={(e) => {
                  setAsrDeviceId(e.target.value);
                  // Stop test if device changes — user should re-test
                  if (micTesting) stopMicTest();
                }}
                style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
              >
                <option value="">System Default</option>
                {micDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
                  </option>
                ))}
              </select>
              <p style={hintStyle}>
                {micDevices.length === 0
                  ? 'No microphones detected. Check browser permissions.'
                  : `${micDevices.length} microphone${micDevices.length > 1 ? 's' : ''} found`
                }
              </p>
            </div>

            {/* Microphone Test */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <button
                  onClick={micTesting ? stopMicTest : startMicTest}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 6,
                    border: micTesting ? '1px solid #ef4444' : '1px solid #6c8aff',
                    background: micTesting ? 'rgba(239, 68, 68, 0.1)' : 'rgba(108, 138, 255, 0.1)',
                    color: micTesting ? '#ef4444' : '#6c8aff',
                    fontWeight: 600,
                    fontSize: '0.82em',
                    cursor: 'pointer',
                  }}
                >
                  {micTesting ? 'Stop Test' : 'Test Microphone'}
                </button>
                {micTesting && (
                  <span style={{ fontSize: '0.82em', color: micTestLevel > 20 ? '#4ade80' : '#8b8fa4' }}>
                    {micTestLevel > 20 ? 'Receiving audio' : 'Speak now...'}
                  </span>
                )}
              </div>

              {/* Audio level bar */}
              {micTesting && (
                <div style={{
                  height: 8,
                  borderRadius: 4,
                  background: '#1a1d2e',
                  overflow: 'hidden',
                }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${micTestLevel}%`,
                      borderRadius: 4,
                      background: micTestLevel > 60
                        ? 'linear-gradient(90deg, #4ade80, #fbbf24)'
                        : micTestLevel > 20
                          ? '#4ade80'
                          : '#6b7280',
                      transition: 'width 0.1s ease-out',
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}

        <div style={dividerStyle} />

        {/* ── STORY WRITER SECTION ── */}
        <label style={sectionTitleStyle}>Story Writer (Open World)</label>
        <p style={{ ...hintStyle, marginTop: 0, marginBottom: 12 }}>
          External LLM used to generate scene text in Open World mode.
        </p>

        {/* Writer Provider */}
        <div style={{ display: 'flex', gap: 8 }}>
          <ProviderButton
            active={writerProvider === 'gemini'}
            onClick={() => {
              setWriterProvider('gemini');
              if (!writerModel || writerModel === 'gpt-4o') setWriterModel('gemini-3-flash-preview');
            }}
            label="Google Gemini"
            sub="AI Studio API"
          />
          <ProviderButton
            active={writerProvider === 'openai-compatible'}
            onClick={() => {
              setWriterProvider('openai-compatible');
              if (!writerModel || writerModel.startsWith('gemini')) setWriterModel('gpt-4o');
              if (!writerEndpoint) setWriterEndpoint('https://api.openai.com/v1');
            }}
            label="OpenAI-Compatible"
            sub="/chat/completions"
          />
        </div>

        {/* Writer Model — editable combobox with presets per provider */}
        <div>
          <label style={labelStyle}>Model</label>
          <ModelComboBox
            value={writerModel}
            onChange={setWriterModel}
            options={writerProvider === 'gemini' ? GEMINI_WRITER_PRESETS : OPENAI_WRITER_PRESETS}
            placeholder={writerProvider === 'gemini' ? 'gemini-3-flash-preview' : 'gpt-4o'}
          />
          <p style={hintStyle}>
            {writerProvider === 'gemini'
              ? 'Select a Gemini model or type a custom name'
              : 'Select a preset (incl. HyprLab models) or type a custom name'}
          </p>
        </div>

        {/* Max Context Tokens */}
        <div>
          <label style={labelStyle}>Max Context (tokens)</label>
          <input
            type="number"
            value={writerMaxContextTokens}
            onChange={(e) => setWriterMaxContextTokens(Math.max(10_000, parseInt(e.target.value) || 500_000))}
            min={10000}
            step={50000}
            style={inputStyle}
          />
          <p style={hintStyle}>
            Token budget for the assembled context. Everything is included in full detail until this limit is reached.
            Only then are older scenes compressed to summaries. Gemini supports up to ~1M tokens; 500K is a good default.
          </p>
        </div>

        {/* Writer API Key — only show for openai-compatible or when user wants a separate key */}
        {writerProvider === 'openai-compatible' ? (
          <>
            <div>
              <label style={labelStyle}>API Key</label>
              <input
                type="password"
                value={writerApiKey}
                onChange={(e) => setWriterApiKey(e.target.value)}
                placeholder="sk-..."
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Endpoint</label>
              <input
                type="text"
                value={writerEndpoint}
                onChange={(e) => setWriterEndpoint(e.target.value)}
                placeholder="https://api.openai.com/v1"
                style={inputStyle}
              />
              <p style={hintStyle}>
                Base URL for the /chat/completions endpoint
              </p>
            </div>
          </>
        ) : (
          <p style={hintStyle}>
            Uses your Google AI API Key above.{' '}
            {writerApiKey && <span style={{ color: '#6c8aff' }}>Override key is set.</span>}
          </p>
        )}

        {/* Writer System Prompt */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>System Prompt</label>
            <button
              onClick={handleResetWriterPrompts}
              style={{
                fontSize: '0.75em', color: '#8b8fa4', background: 'none', border: '1px solid #2d3148',
                borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
              }}
            >
              Reset to Default
            </button>
          </div>
          <textarea
            value={writerSystemPrompt}
            onChange={(e) => setWriterSystemPrompt(e.target.value)}
            style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: "'Cascadia Code', 'Fira Code', monospace", fontSize: '0.82em', lineHeight: '1.5' }}
            rows={6}
          />
          <p style={hintStyle}>
            Defines the narrator personality, writing style, output format, and rules.
          </p>
        </div>

        {/* Writer Instruction */}
        <div>
          <label style={labelStyle}>Continuation Instruction</label>
          <textarea
            value={writerInstruction}
            onChange={(e) => setWriterInstruction(e.target.value)}
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            rows={3}
          />
          <p style={hintStyle}>
            Inserted at the end of context, right after the player's action. Tells the model how to continue.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={handleSave} style={primaryBtnStyle}>
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * ProviderButton — still used for Writer provider selection where only 2 options exist.
 */
function ProviderButton({ active, onClick, label, sub }: {
  active: boolean; onClick: () => void; label: string; sub: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid',
        borderColor: active ? '#6c8aff' : '#2d3148',
        background: active ? 'rgba(108, 138, 255, 0.1)' : '#171923',
        color: active ? '#6c8aff' : '#8b8fa4',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '0.9em' }}>{label}</div>
      <div style={{ fontSize: '0.75em', opacity: 0.7, marginTop: 2 }}>{sub}</div>
    </button>
  );
}

/**
 * ModelComboBox — editable dropdown for model selection.
 * Shows preset options in a dropdown list, but the user can also type
 * a custom model name directly. Clicking the arrow or focusing the input
 * opens the dropdown; selecting a preset fills the input; clicking outside
 * closes it.
 */
function ModelComboBox({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          style={{
            ...inputStyle,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            flex: 1,
          }}
        />
        <button
          onClick={() => setOpen(!open)}
          type="button"
          style={{
            padding: '0 14px',
            background: '#171923',
            border: '1px solid #2d3148',
            borderLeft: 'none',
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
            color: open ? '#6c8aff' : '#8b8fa4',
            cursor: 'pointer',
            fontSize: '0.85em',
            transition: 'color 0.15s',
          }}
        >
          ▾
        </button>
      </div>

      {/* Dropdown list */}
      {open && options.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 100,
          background: '#171923',
          border: '1px solid #2d3148',
          borderRadius: 8,
          marginTop: 4,
          maxHeight: 220,
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'rgba(108, 138, 255, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected ? 'rgba(108, 138, 255, 0.15)' : 'transparent';
                }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(108, 138, 255, 0.15)' : 'transparent',
                  borderBottom: '1px solid rgba(45, 49, 72, 0.5)',
                }}
              >
                <div style={{
                  fontSize: '0.88em',
                  fontWeight: 500,
                  color: isSelected ? '#6c8aff' : '#e2e4ea',
                }}>
                  {opt.label}
                </div>
                <div style={{
                  fontSize: '0.75em',
                  color: '#8b8fa4',
                  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  marginTop: 2,
                }}>
                  {opt.value}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// INLINE STYLES
// =============================================================================

const sectionTitleStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.85em', fontWeight: 700, color: '#6c8aff',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8em', fontWeight: 600, color: '#8b8fa4',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  border: '1px solid #2d3148', background: '#0f1117', color: '#e2e4ea',
  fontSize: '0.92em', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  outline: 'none',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.78em', color: '#8b8fa4', marginTop: 4,
};

const dividerStyle: React.CSSProperties = {
  height: 1, background: '#2d3148', margin: '4px 0',
};

/** Green-tinted status bar showing which provider + model is currently active */
const activeProviderStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  background: 'rgba(74, 222, 128, 0.06)',
  border: '1px solid rgba(74, 222, 128, 0.2)',
  fontSize: '0.82em',
  color: '#8b8fa4',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, border: 'none',
  background: '#6c8aff', color: '#fff', fontWeight: 600,
  fontSize: '0.9em', cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, border: '1px solid #2d3148',
  background: 'transparent', color: '#8b8fa4', fontWeight: 500,
  fontSize: '0.9em', cursor: 'pointer',
};
