/**
 * =============================================================================
 * SYSTEM MENU COMPONENT
 * =============================================================================
 *
 * The in-game menu overlay for save/load, settings, and exiting.
 *
 * FEATURES:
 * - Save/Load game slots
 * - Volume controls
 * - Text speed settings
 * - Return to editor
 *
 * =============================================================================
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  X,
  Save,
  FolderOpen,
  Settings,
  Volume2,
  VolumeX,
  Home,
  LogOut,
} from 'lucide-react';
import { usePlayerStore } from '@stores/usePlayerStore';
import { Button } from '@components/common';

/**
 * SYSTEM MENU COMPONENT
 */
export default function SystemMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  // Detect co-writing mode from URL prefix for correct exit navigation.
  const isCowriteMode = location.pathname.startsWith('/cowrite');
  const {
    project,
    toggleMenu,
    preferences,
    updatePreferences,
    saveSlots,
    saveGame,
    loadGame,
  } = usePlayerStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<'game' | 'settings'>('game');

  // Close on escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toggleMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMenu]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={toggleMenu}
      />

      {/* Menu panel */}
      <div className="relative w-full max-w-lg bg-editor-surface rounded-xl shadow-2xl overflow-hidden animate-slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-editor-border">
          <h2 className="text-xl font-bold text-editor-text">
            {project?.info.title || 'Game Menu'}
          </h2>
          <button
            onClick={toggleMenu}
            className="p-2 rounded-lg hover:bg-editor-border text-editor-muted hover:text-editor-text"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-editor-border">
          <button
            onClick={() => setActiveTab('game')}
            className={`flex-1 py-3 font-medium transition-colors ${
              activeTab === 'game'
                ? 'text-editor-accent border-b-2 border-editor-accent'
                : 'text-editor-muted hover:text-editor-text'
            }`}
          >
            Game
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-editor-accent border-b-2 border-editor-accent'
                : 'text-editor-muted hover:text-editor-text'
            }`}
          >
            Settings
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'game' ? (
            <GameTab
              saveSlots={saveSlots}
              onSave={(slot) => saveGame(slot)}
              onLoad={(slot) => {
                loadGame(slot);
                toggleMenu();
              }}
              onExit={() => navigate(isCowriteMode ? '/cowrite' : '/game')}
            />
          ) : (
            <SettingsTab
              preferences={preferences}
              onUpdate={updatePreferences}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * GAME TAB
 */
interface GameTabProps {
  saveSlots: Array<{ id: number; savedAt: number; name?: string }>;
  onSave: (slot: number) => void;
  onLoad: (slot: any) => void;
  onExit: () => void;
}

function GameTab({ saveSlots, onSave, onLoad, onExit }: GameTabProps) {
  return (
    <div className="space-y-6">
      {/* Save/Load buttons */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="secondary"
          leftIcon={<Save size={18} />}
          onClick={() => onSave(1)}
          fullWidth
        >
          Save Game
        </Button>
        <Button
          variant="secondary"
          leftIcon={<FolderOpen size={18} />}
          onClick={() => {
            const slot = saveSlots[0];
            if (slot) {
              onLoad(slot as any);
            }
          }}
          fullWidth
          disabled={saveSlots.length === 0}
        >
          Load Game
        </Button>
      </div>

      {/* Save slots */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-editor-muted">Save Slots</h3>
        {[1, 2, 3].map((slotId) => {
          const slot = saveSlots.find((s) => s.id === slotId);
          return (
            <div
              key={slotId}
              className="flex items-center justify-between p-3 bg-editor-bg rounded-lg"
            >
              <div>
                <p className="text-editor-text font-medium">
                  Slot {slotId}
                </p>
                <p className="text-xs text-editor-muted">
                  {slot
                    ? new Date(slot.savedAt).toLocaleString()
                    : 'Empty'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onSave(slotId)}
                  className="px-3 py-1 text-sm bg-editor-accent/20 text-editor-accent rounded hover:bg-editor-accent/30"
                >
                  Save
                </button>
                {slot && (
                  <button
                    onClick={() => onLoad(slot as any)}
                    className="px-3 py-1 text-sm bg-editor-surface text-editor-text rounded hover:bg-editor-border"
                  >
                    Load
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Exit */}
      <div className="pt-4 border-t border-editor-border">
        <Button
          variant="ghost"
          leftIcon={<Home size={18} />}
          onClick={onExit}
          fullWidth
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
}

/**
 * SETTINGS TAB
 */
interface SettingsTabProps {
  preferences: {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    textSpeed: number;
  };
  onUpdate: (prefs: Partial<SettingsTabProps['preferences']>) => void;
}

function SettingsTab({ preferences, onUpdate }: SettingsTabProps) {
  return (
    <div className="space-y-6">
      {/* Volume controls */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-editor-muted">Audio</h3>

        <VolumeSlider
          label="Master Volume"
          value={preferences.masterVolume}
          onChange={(v) => onUpdate({ masterVolume: v })}
        />

        <VolumeSlider
          label="Music"
          value={preferences.musicVolume}
          onChange={(v) => onUpdate({ musicVolume: v })}
        />

        <VolumeSlider
          label="Sound Effects"
          value={preferences.sfxVolume}
          onChange={(v) => onUpdate({ sfxVolume: v })}
        />
      </div>

      {/* Text settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-editor-muted">Text</h3>

        {/* Instant text toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-editor-text">Show text instantly</span>
          <input
            type="checkbox"
            checked={preferences.textSpeed === 0}
            onChange={(e) =>
              onUpdate({ textSpeed: e.target.checked ? 0 : 30 })
            }
            className="w-4 h-4 accent-purple-500"
          />
        </label>

        {/* Speed slider — only visible when typewriter is enabled */}
        {preferences.textSpeed > 0 && (
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-editor-text">Typewriter Speed</span>
              <span className="text-editor-muted">
                {preferences.textSpeed} chars/sec
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              value={preferences.textSpeed}
              onChange={(e) =>
                onUpdate({ textSpeed: parseInt(e.target.value) })
              }
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * VOLUME SLIDER
 */
interface VolumeSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function VolumeSlider({ label, value, onChange }: VolumeSliderProps) {
  const isMuted = value === 0;

  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-editor-text">{label}</span>
        <button
          onClick={() => onChange(isMuted ? 0.5 : 0)}
          className="text-editor-muted hover:text-editor-text"
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
