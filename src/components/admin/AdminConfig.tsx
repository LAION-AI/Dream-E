/**
 * =============================================================================
 * ADMIN AI CONFIG COMPONENT
 * =============================================================================
 *
 * AI configuration management page at /admin/config. Allows admins to
 * configure server-side AI provider settings that apply to all users.
 *
 * TABS:
 * 1. Image Generation - Provider, model, API key, endpoint
 * 2. LLM/Writer      - Provider, model, API key, endpoint
 * 3. TTS             - Model, API key, voice selector
 * 4. Defaults        - Default image style and other shared settings
 *
 * CONFIG KEYS (sent to PUT /api/v2/ai/config):
 *   Image:    image_provider, image_model, image_api_key, image_endpoint, image_google_api_key
 *   LLM:      llm_provider, llm_model, llm_api_key, llm_endpoint
 *   TTS:      tts_model, tts_api_key, tts_voice
 *   Defaults: default_image_style
 *
 * Each tab has its own Save button that only sends the config keys
 * relevant to that tab. A "Test Connection" button is available to
 * verify API connectivity before saving.
 *
 * =============================================================================
 */

import { useEffect, useState } from 'react';
import {
  Image,
  MessageSquare,
  Volume2,
  Mic,
  Palette,
  Save,
  PlugZap,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  X,
} from 'lucide-react';
import { useAdminStore } from '@stores/useAdminStore';
import { authFetch } from '@services/authService';

// =============================================================================
// TYPES
// =============================================================================

/** Tab identifiers for the config page */
type ConfigTab = 'image' | 'llm' | 'tts' | 'asr' | 'defaults';

/** Tab metadata for rendering the tab bar */
interface TabConfig {
  id: ConfigTab;
  label: string;
  icon: typeof Image;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * TAB DEFINITIONS
 * Each tab maps to a section of AI configuration.
 */
const TABS: TabConfig[] = [
  { id: 'image', label: 'Image Generation', icon: Image },
  { id: 'llm', label: 'LLM / Writer', icon: MessageSquare },
  { id: 'tts', label: 'TTS', icon: Volume2 },
  { id: 'asr', label: 'ASR (Speech-to-Text)', icon: Mic },
  { id: 'defaults', label: 'Defaults', icon: Palette },
];

/**
 * IMAGE PROVIDER OPTIONS
 * Available image generation providers for the dropdown.
 */
const IMAGE_PROVIDERS = [
  { value: 'hyprlab', label: 'HyprLab (FLUX 2 / Nano Banana)' },
  { value: 'bfl', label: 'BFL (FLUX)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
];

/** Image model presets by provider — user can also type a custom model */
const IMAGE_MODEL_PRESETS: Record<string, string[]> = {
  hyprlab: ['flux-2-pro', 'flux-2-max', 'flux-2-flex', 'nano-banana-2', 'nano-banana-pro', 'dall-e-3'],
  bfl: ['flux-2-pro-preview', 'flux-2-pro', 'flux-2-max', 'flux-2-flex', 'flux-2-klein-9b'],
  gemini: ['gemini-2.0-flash-preview-image-generation', 'imagen-3.0-generate-002'],
  'openai-compatible': ['dall-e-3', 'dall-e-2', 'nano-banana-2', 'nano-banana-pro'],
};

/** Default endpoints by provider */
const IMAGE_ENDPOINT_DEFAULTS: Record<string, string> = {
  hyprlab: 'https://api.hyprlab.io/v1',
  bfl: 'https://api.bfl.ai/v1',
  gemini: '',
  'openai-compatible': 'https://api.openai.com/v1',
};

/**
 * LLM PROVIDER OPTIONS
 * Available LLM providers for the dropdown.
 */
const LLM_PROVIDERS = [
  { value: 'hyprlab', label: 'HyprLab (Gemini-compatible)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
];

/** LLM model presets by provider */
const LLM_MODEL_PRESETS: Record<string, string[]> = {
  hyprlab: ['gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gpt-4o', 'gpt-4o-mini'],
  gemini: ['gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
};

/** Default LLM endpoints by provider */
const LLM_ENDPOINT_DEFAULTS: Record<string, string> = {
  hyprlab: 'https://api.hyprlab.io/v1beta',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  'openai-compatible': 'https://api.openai.com/v1',
};

/**
 * TTS MODEL PRESETS
 */
const TTS_MODEL_PRESETS = [
  'gemini-3.1-flash-tts', 'gemini-2.5-flash-preview-tts',
];

/**
 * TTS VOICE OPTIONS
 * Available Gemini TTS voices.
 */
const TTS_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir',
  'Aoede', 'Leda', 'Orus', 'Perseus',
];

/**
 * ASR MODEL PRESETS
 */
const ASR_MODEL_PRESETS = ['whisper-1', 'gemini-2.5-flash-lite'];

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * AdminConfig
 *
 * Tabbed configuration panel for server-side AI settings.
 * Fetches the current config on mount and provides per-tab save functionality.
 */
export default function AdminConfig() {
  const {
    config,
    loadingConfig,
    fetchConfig,
    saveConfig,
    error,
    clearError,
  } = useAdminStore();

  /** Currently active tab */
  const [activeTab, setActiveTab] = useState<ConfigTab>('image');

  /** Local editable copy of config values (merged from server on fetch) */
  const [localConfig, setLocalConfig] = useState<Record<string, string>>({});

  /** Whether a save operation is in progress */
  const [isSaving, setIsSaving] = useState(false);

  /** Success message shown after a successful save */
  const [saveSuccess, setSaveSuccess] = useState(false);

  /** Test connection status: null (idle), 'testing', 'success', 'error' */
  const [testStatus, setTestStatus] = useState<null | 'testing' | 'success' | 'error'>(null);
  const [testMessage, setTestMessage] = useState('');

  /** Password visibility toggles (key = config field name) */
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  /**
   * INITIAL DATA FETCH
   * Load the current AI config from the server on mount.
   */
  useEffect(() => {
    fetchConfig();
  }, []);

  /**
   * SYNC LOCAL STATE WITH STORE
   * When the store config updates (after fetchConfig), copy it to local state.
   * This allows editing without immediately affecting the store.
   */
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  /**
   * UPDATE LOCAL CONFIG
   * Helper to update a single config key in local state.
   */
  function updateField(key: string, value: string) {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * TOGGLE PASSWORD VISIBILITY
   * Shows/hides a password field.
   */
  function togglePasswordVisibility(field: string) {
    setVisiblePasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  /**
   * GET CONFIG KEYS FOR TAB
   * Returns the list of config keys that belong to the currently active tab.
   * Only these keys are sent when saving.
   */
  function getTabKeys(tab: ConfigTab): string[] {
    switch (tab) {
      case 'image':
        return ['image_provider', 'image_model', 'image_api_key', 'image_endpoint', 'image_google_api_key'];
      case 'llm':
        return ['llm_provider', 'llm_model', 'llm_api_key', 'llm_endpoint'];
      case 'tts':
        return ['tts_model', 'tts_api_key', 'tts_voice', 'tts_endpoint'];
      case 'asr':
        return ['asr_model', 'asr_api_key', 'asr_endpoint'];
      case 'defaults':
        return ['default_image_style'];
      default:
        return [];
    }
  }

  /** When provider changes, auto-fill the default endpoint */
  function handleImageProviderChange(provider: string) {
    updateField('image_provider', provider);
    if (IMAGE_ENDPOINT_DEFAULTS[provider]) {
      updateField('image_endpoint', IMAGE_ENDPOINT_DEFAULTS[provider]);
    }
  }
  function handleLlmProviderChange(provider: string) {
    updateField('llm_provider', provider);
    if (LLM_ENDPOINT_DEFAULTS[provider]) {
      updateField('llm_endpoint', LLM_ENDPOINT_DEFAULTS[provider]);
    }
  }

  /**
   * HANDLE SAVE
   * Saves only the config keys relevant to the active tab.
   * Shows a brief success indicator on completion.
   */
  async function handleSave() {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const keys = getTabKeys(activeTab);
      const updates: Record<string, string> = {};
      for (const key of keys) {
        if (localConfig[key] !== undefined) {
          updates[key] = localConfig[key];
        }
      }
      await saveConfig(updates);
      setSaveSuccess(true);
      // Clear success indicator after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Error is already set in the store
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * HANDLE TEST CONNECTION
   * Calls the server's test endpoint to verify the configured provider
   * can be reached with the provided credentials.
   */
  async function handleTestConnection() {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const response = await authFetch('/api/v2/ai/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: activeTab,
          config: localConfig,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTestStatus('success');
        setTestMessage(data.message || 'Connection successful');
      } else {
        setTestStatus('error');
        setTestMessage(data.message || 'Connection test failed');
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Connection test failed');
    }
    // Clear test status after 5 seconds
    setTimeout(() => {
      setTestStatus(null);
      setTestMessage('');
    }, 5000);
  }

  return (
    <div className="p-8">
      {/* ==================== HEADER ==================== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Configuration</h1>
          <p className="text-gray-400 text-sm mt-1">
            Server-side AI provider settings for all users
          </p>
        </div>
        <button
          onClick={() => fetchConfig()}
          disabled={loadingConfig}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loadingConfig ? 'animate-spin' : ''} />
          Reload
        </button>
      </div>

      {/* ==================== ERROR BANNER ==================== */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
          <button onClick={clearError} className="ml-4 underline text-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* ==================== TAB BAR ==================== */}
      <div className="flex border-b border-gray-700 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setActiveTab(id);
              setTestStatus(null);
              setTestMessage('');
            }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* ==================== TAB CONTENT ==================== */}
      {loadingConfig && Object.keys(config).length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl">
          {/* Image Generation Tab */}
          {activeTab === 'image' && (
            <div className="space-y-5">
              {/* Provider Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Image Provider
                </label>
                <select
                  value={localConfig.image_provider || ''}
                  onChange={(e) => handleImageProviderChange(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select provider...</option>
                  {IMAGE_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Model — dropdown presets + free text */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Model
                </label>
                <input
                  type="text"
                  list="image-model-presets"
                  value={localConfig.image_model || ''}
                  onChange={(e) => updateField('image_model', e.target.value)}
                  placeholder="Select or type a model name..."
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <datalist id="image-model-presets">
                  {(IMAGE_MODEL_PRESETS[localConfig.image_provider] || []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              {/* API Key */}
              <PasswordField
                label="API Key"
                value={localConfig.image_api_key || ''}
                onChange={(val) => updateField('image_api_key', val)}
                placeholder="Your image generation API key"
                visible={!!visiblePasswords.image_api_key}
                onToggle={() => togglePasswordVisibility('image_api_key')}
              />

              {/* Google API Key (for Gemini provider) */}
              {localConfig.image_provider === 'gemini' && (
                <PasswordField
                  label="Google API Key"
                  value={localConfig.image_google_api_key || ''}
                  onChange={(val) => updateField('image_google_api_key', val)}
                  placeholder="Google AI Studio API key"
                  visible={!!visiblePasswords.image_google_api_key}
                  onToggle={() => togglePasswordVisibility('image_google_api_key')}
                />
              )}

              {/* Endpoint */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  API Endpoint
                </label>
                <input
                  type="text"
                  value={localConfig.image_endpoint || ''}
                  onChange={(e) => updateField('image_endpoint', e.target.value)}
                  placeholder="e.g., https://api.bfl.ai/v1"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* LLM / Writer Tab */}
          {activeTab === 'llm' && (
            <div className="space-y-5">
              {/* Provider Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  LLM Provider
                </label>
                <select
                  value={localConfig.llm_provider || ''}
                  onChange={(e) => handleLlmProviderChange(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select provider...</option>
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Model — dropdown presets + free text */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Model
                </label>
                <input
                  type="text"
                  list="llm-model-presets"
                  value={localConfig.llm_model || ''}
                  onChange={(e) => updateField('llm_model', e.target.value)}
                  placeholder="Select or type a model name..."
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <datalist id="llm-model-presets">
                  {(LLM_MODEL_PRESETS[localConfig.llm_provider] || []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              {/* API Key */}
              <PasswordField
                label="API Key"
                value={localConfig.llm_api_key || ''}
                onChange={(val) => updateField('llm_api_key', val)}
                placeholder="Your LLM API key"
                visible={!!visiblePasswords.llm_api_key}
                onToggle={() => togglePasswordVisibility('llm_api_key')}
              />

              {/* Endpoint */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  API Endpoint
                </label>
                <input
                  type="text"
                  value={localConfig.llm_endpoint || ''}
                  onChange={(e) => updateField('llm_endpoint', e.target.value)}
                  placeholder="e.g., https://generativelanguage.googleapis.com/v1beta"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* TTS Tab */}
          {activeTab === 'tts' && (
            <div className="space-y-5">
              {/* Model — dropdown presets + free text */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  TTS Model
                </label>
                <input
                  type="text"
                  list="tts-model-presets"
                  value={localConfig.tts_model || ''}
                  onChange={(e) => updateField('tts_model', e.target.value)}
                  placeholder="Select or type a model name..."
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <datalist id="tts-model-presets">
                  {TTS_MODEL_PRESETS.map((m) => <option key={m} value={m} />)}
                </datalist>
              </div>

              {/* TTS Endpoint */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  TTS Endpoint
                </label>
                <input
                  type="text"
                  value={localConfig.tts_endpoint || ''}
                  onChange={(e) => updateField('tts_endpoint', e.target.value)}
                  placeholder="e.g., https://api.hyprlab.io/v1beta (leave empty for Google default)"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* API Key */}
              <PasswordField
                label="API Key"
                value={localConfig.tts_api_key || ''}
                onChange={(val) => updateField('tts_api_key', val)}
                placeholder="API key for TTS (can share with LLM if same provider)"
                visible={!!visiblePasswords.tts_api_key}
                onToggle={() => togglePasswordVisibility('tts_api_key')}
              />

              {/* Voice Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Voice
                </label>
                <select
                  value={localConfig.tts_voice || ''}
                  onChange={(e) => updateField('tts_voice', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select voice...</option>
                  {TTS_VOICES.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ASR (Speech-to-Text) Tab */}
          {activeTab === 'asr' && (
            <div className="space-y-5">
              {/* ASR Model */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  ASR Model
                </label>
                <input
                  type="text"
                  list="asr-model-presets"
                  value={localConfig.asr_model || ''}
                  onChange={(e) => updateField('asr_model', e.target.value)}
                  placeholder="Select or type a model name..."
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <datalist id="asr-model-presets">
                  {ASR_MODEL_PRESETS.map((m) => <option key={m} value={m} />)}
                </datalist>
              </div>

              {/* ASR API Key */}
              <PasswordField
                label="API Key"
                value={localConfig.asr_api_key || ''}
                onChange={(val) => updateField('asr_api_key', val)}
                placeholder="API key for ASR (e.g., HyprLab key)"
                visible={!!visiblePasswords.asr_api_key}
                onToggle={() => togglePasswordVisibility('asr_api_key')}
              />

              {/* ASR Endpoint */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  ASR Endpoint
                </label>
                <input
                  type="text"
                  value={localConfig.asr_endpoint || ''}
                  onChange={(e) => updateField('asr_endpoint', e.target.value)}
                  placeholder="e.g., https://api.hyprlab.io/v1/audio/transcriptions"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <p className="text-xs text-gray-500">
                Whisper-compatible endpoint (multipart/form-data). Sends audio file + model parameter.
                HyprLab default: https://api.hyprlab.io/v1/audio/transcriptions
              </p>
            </div>
          )}

          {/* Defaults Tab */}
          {activeTab === 'defaults' && (
            <div className="space-y-5">
              {/* Default Image Style */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Default Image Style
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  This style description is appended to all image generation prompts.
                </p>
                <textarea
                  value={localConfig.default_image_style || ''}
                  onChange={(e) => updateField('default_image_style', e.target.value)}
                  placeholder="e.g., aesthetic blockbuster movie style movie still with hq color grading..."
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
                />
              </div>
            </div>
          )}

          {/* ==================== ACTION BUTTONS ==================== */}
          <div className="flex items-center gap-3 mt-8 pt-6 border-t border-gray-700">
            {/* Test Connection Button */}
            {activeTab !== 'defaults' && (
              <button
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {testStatus === 'testing' ? (
                  <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                ) : testStatus === 'success' ? (
                  <Check size={16} className="text-green-400" />
                ) : testStatus === 'error' ? (
                  <X size={16} className="text-red-400" />
                ) : (
                  <PlugZap size={16} />
                )}
                Test Connection
              </button>
            )}

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : saveSuccess ? (
                <Check size={16} />
              ) : (
                <Save size={16} />
              )}
              {saveSuccess ? 'Saved!' : 'Save'}
            </button>

            {/* Test Status Message */}
            {testMessage && (
              <span
                className={`text-sm ${
                  testStatus === 'success' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {testMessage}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PASSWORD FIELD COMPONENT
// =============================================================================

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
}

/**
 * PasswordField
 *
 * An input field with a show/hide toggle for sensitive values like API keys.
 * The toggle button sits inside the input field (to the right).
 */
function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  visible,
  onToggle,
}: PasswordFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-3 pr-10 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
          title={visible ? 'Hide' : 'Show'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
