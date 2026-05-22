/**
 * =============================================================================
 * AI SETTINGS MODAL — Server-Managed Configuration View
 * =============================================================================
 *
 * Displays the current AI configuration (provider, model, voice) and the
 * user's daily quota usage. API keys are managed by the admin and never
 * shown to regular users.
 *
 * For admin users, includes a link to the admin panel where keys can be
 * configured.
 *
 * =============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { useNavigate } from 'react-router-dom';
import {
  Image,
  MessageSquare,
  Volume2,
  Shield,
  CheckCircle,
  XCircle,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import { authFetch } from '@services/authService';

// =============================================================================
// TYPES
// =============================================================================

interface ServerConfig {
  imageProvider: string;
  imageModel: string;
  imageEndpoint: string;
  llmProvider: string;
  llmModel: string;
  llmEndpoint: string;
  ttsModel: string;
  ttsVoice: string;
  defaultImageStyle: string;
  hasImageKey: boolean;
  hasLlmKey: boolean;
  hasTtsKey: boolean;
}

interface UserLimits {
  maxProjects: number;
  dailyLlmTokens: number;
  dailyImages: number;
  dailyTtsSeconds: number;
}

// =============================================================================
// PROVIDER DISPLAY NAMES
// =============================================================================

const PROVIDER_LABELS: Record<string, string> = {
  bfl: 'Black Forest Labs (FLUX)',
  gemini: 'Google Gemini',
  'openai-compatible': 'OpenAI-Compatible',
};

// =============================================================================
// COMPONENT
// =============================================================================

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [limits, setLimits] = useState<UserLimits | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch server config and user info when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [configRes, meRes] = await Promise.all([
          authFetch('/api/v2/ai/config'),
          authFetch('/api/v2/auth/me'),
        ]);

        if (!cancelled && configRes.ok) {
          setConfig(await configRes.json());
        }
        if (!cancelled && meRes.ok) {
          const meData = await meRes.json();
          setIsAdmin(!!meData.user?.is_admin);
          if (meData.user?.limits) {
            setLimits(meData.user.limits);
          }
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load AI configuration.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [isOpen]);

  // ---- Render helper: status badge ----
  const StatusBadge = ({ active, label }: { active: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
      active ? 'bg-green-900/50 text-green-400 border border-green-700/50' : 'bg-red-900/30 text-red-400 border border-red-700/50'
    }`}>
      {active ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  );

  // ---- Render helper: config row ----
  const ConfigRow = ({ label, value, fallback = 'Not configured' }: { label: string; value?: string; fallback?: string }) => (
    <div className="flex justify-between items-center py-2 border-b border-gray-700/50 last:border-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-gray-100 text-sm font-mono">{value || fallback}</span>
    </div>
  );

  // ---- Render helper: quota bar ----
  const QuotaBar = ({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) => {
    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-blue-500';
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{label}</span>
          <span className="text-gray-300">{used.toLocaleString()} / {limit.toLocaleString()} {unit}</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Configuration">
      <div className="space-y-6 p-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-red-400 text-center py-8">{error}</div>
        ) : config ? (
          <>
            {/* ==== Image Generation ==== */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Image size={18} className="text-blue-400" />
                <h3 className="text-white font-semibold text-sm">Image Generation</h3>
                <StatusBadge active={config.hasImageKey} label={config.hasImageKey ? 'Active' : 'No API Key'} />
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <ConfigRow label="Provider" value={PROVIDER_LABELS[config.imageProvider] || config.imageProvider} />
                <ConfigRow label="Model" value={config.imageModel} />
                {config.defaultImageStyle && (
                  <div className="pt-2 mt-2 border-t border-gray-700/50">
                    <span className="text-gray-500 text-xs">Default Style</span>
                    <p className="text-gray-300 text-xs mt-1 italic">{config.defaultImageStyle}</p>
                  </div>
                )}
              </div>
            </section>

            {/* ==== LLM / Writer ==== */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={18} className="text-purple-400" />
                <h3 className="text-white font-semibold text-sm">Story Writer (LLM)</h3>
                <StatusBadge active={config.hasLlmKey} label={config.hasLlmKey ? 'Active' : 'No API Key'} />
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <ConfigRow label="Provider" value={PROVIDER_LABELS[config.llmProvider] || config.llmProvider} />
                <ConfigRow label="Model" value={config.llmModel} />
              </div>
            </section>

            {/* ==== TTS ==== */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Volume2 size={18} className="text-green-400" />
                <h3 className="text-white font-semibold text-sm">Text-to-Speech</h3>
                <StatusBadge active={config.hasTtsKey} label={config.hasTtsKey ? 'Active' : 'No API Key'} />
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <ConfigRow label="Model" value={config.ttsModel} />
                <ConfigRow label="Voice" value={config.ttsVoice} />
              </div>
            </section>

            {/* ==== Daily Quota ==== */}
            {limits && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 size={18} className="text-yellow-400" />
                  <h3 className="text-white font-semibold text-sm">Your Daily Quota</h3>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <QuotaBar label="LLM Tokens" used={0} limit={limits.dailyLlmTokens} unit="tokens" />
                  <QuotaBar label="Image Generations" used={0} limit={limits.dailyImages} unit="images" />
                  <QuotaBar label="TTS Audio" used={0} limit={limits.dailyTtsSeconds} unit="sec" />
                  <p className="text-gray-500 text-xs mt-2">Quotas reset daily at midnight UTC.</p>
                </div>
              </section>
            )}

            {/* ==== Admin Link ==== */}
            {isAdmin && (
              <div className="border-t border-gray-700 pt-4">
                <button
                  onClick={() => { onClose(); navigate('/admin/config'); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Shield size={16} />
                  Open Admin Panel
                  <ExternalLink size={14} />
                </button>
                <p className="text-gray-500 text-xs text-center mt-2">
                  Configure API keys, models, and user limits in the admin panel.
                </p>
              </div>
            )}

            {/* ==== Info note for regular users ==== */}
            {!isAdmin && (
              <p className="text-gray-500 text-xs text-center border-t border-gray-700 pt-3">
                AI configuration is managed by your administrator. Contact them to change providers or increase quotas.
              </p>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
