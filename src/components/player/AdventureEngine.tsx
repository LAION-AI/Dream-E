/**
 * =============================================================================
 * ADVENTURE ENGINE COMPONENT (SCREEN E)
 * =============================================================================
 *
 * The game runtime that plays Dream-E games.
 *
 * FEATURES:
 * - Fullscreen background images with Ken Burns effect
 * - HUD with stats (HP, MP, etc.) and inventory
 * - Dialog box with typewriter effect
 * - Choice buttons with conditions
 * - System menu (Save/Load/Settings)
 * - Theme support (Fantasy, Cyberpunk, Modern)
 *
 * LAYOUT:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  ┌──────────┐                              ┌──────────┐    │
 * │  │ HP: 85/100│                             │ ┌──┬──┬──┐│    │
 * │  │ MP: 40/50 │          BACKGROUND         │ │  │  │  ││    │
 * │  │ Stamina   │          IMAGE              │ │ Inventory│    │
 * │  └──────────┘                              │ └──┴──┴──┘│    │
 * │                                            └──────────┘    │
 * │                                                            │
 * │  ┌────────────────────────────┐  ┌───────────────────────┐ │
 * │  │                            │  │ ▸ Choice 1            │ │
 * │  │  Story text appears here   │  │ ▸ Choice 2            │ │
 * │  │  with typewriter effect    │  │ ▸ Choice 3 🔒         │ │
 * │  └────────────────────────────┘  └───────────────────────┘ │
 * └─────────────────────────────────────────────────────────────┘
 *
 * =============================================================================
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Undo2, Settings, Volume2, VolumeX, ChevronDown, ChevronUp, GripHorizontal, GripVertical, MoveVertical, Pencil, Brain, FileText, Lightbulb, Eye, BookOpen } from 'lucide-react';
import { Howl } from 'howler';
import { usePlayerStore } from '@stores/usePlayerStore';
import { useProjectStore, suppressHistoryRecording, cancelPendingAutoSave } from '@stores/useProjectStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useImageGenStore } from '@stores/useImageGenStore';
import { streamTTS, TTSPlayer } from '@/services/ttsService';
import * as projectsDB from '@/db/projectsDB';
import type { Project, SceneNode, StoryNode, StoryEdge, ModifierNode, SceneDisplayData, PlayerChoice, Entity } from '@/types';
import HUD from './HUD';
import DialogBox from './DialogBox';
import ChoiceList from './ChoiceList';
import SystemMenu from './SystemMenu';
import OpenWorldInput from './OpenWorldInput';
import CuriosityPanel from './CuriosityPanel';
import CharacterLensPanel from './CharacterLensPanel';
import StorytellerChatPanel from './StorytellerChatPanel';
import StatusBox from './StatusBox';
import { Modal } from '@components/common';
import { generateOpenWorldScene, type OpenWorldStatus, type OpenWorldResult } from '@/services/openWorldService';
import { generateId } from '@/utils/idGenerator';
import { getBlobUrl, evictBlobsExcept, revokeStaleEvictions, collectAssetReplacements, cleanStaleBlobUrls, blobUrlToBase64 } from '@/utils/blobCache';
import { clearThumbnailCache } from '@/utils/thumbnailCache';
import { setOwContext, getOwContext, clearOwContextStore } from '@/utils/owContextStore';

/**
 * ADVENTURE ENGINE COMPONENT
 * Main game runtime.
 */
export default function AdventureEngine() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Detect if we're under the /cowrite route prefix for correct back-navigation.
  const isCowriteMode = location.pathname.startsWith('/cowrite');

  // Query params for "Start from here" / "Continue from here"
  const startNodeParam = searchParams.get('startNode');
  const modeParam = searchParams.get('mode'); // 'fresh' | 'continue'
  const openWorldParam = searchParams.get('openWorld') === '1';

  // Player store — split into targeted selectors to avoid re-rendering
  // the entire game engine when unrelated state changes (e.g., menu toggle
  // shouldn't trigger a full scene re-render with image/audio recalculation).
  // Group 1: Frequently-changing state (triggers re-render on scene change)
  const project = usePlayerStore(s => s.project);
  const session = usePlayerStore(s => s.session);
  const currentScene = usePlayerStore(s => s.currentScene);
  const isMenuOpen = usePlayerStore(s => s.isMenuOpen);
  const isTyping = usePlayerStore(s => s.isTyping);
  const openWorldMode = usePlayerStore(s => s.openWorldMode);
  const preferences = usePlayerStore(s => s.preferences);
  // Group 2: Stable action references (don't change between renders)
  const startGame = usePlayerStore(s => s.startGame);
  const startGameFromNode = usePlayerStore(s => s.startGameFromNode);
  const continueFromNode = usePlayerStore(s => s.continueFromNode);
  const autosave = usePlayerStore(s => s.autosave);
  const makeChoice = usePlayerStore(s => s.makeChoice);
  const setCurrentScene = usePlayerStore(s => s.setCurrentScene);
  const setCurrentNodeId = usePlayerStore(s => s.setCurrentNodeId);
  const updateVariable = usePlayerStore(s => s.updateVariable);
  const toggleMenu = usePlayerStore(s => s.toggleMenu);
  const setTyping = usePlayerStore(s => s.setTyping);
  const setOpenWorldMode = usePlayerStore(s => s.setOpenWorldMode);

  // Local state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog box UI state
  const [dialogCollapsed, setDialogCollapsed] = useState(false);
  const [dialogOffsetX, setDialogOffsetX] = useState(0);
  const [dialogWidth, setDialogWidth] = useState(1500);
  const [dialogMaxHeight, setDialogMaxHeight] = useState(() => Math.round(window.innerHeight * 0.45));
  const [dialogEditing, setDialogEditing] = useState(false);
  const dialogDragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const dialogResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const dialogHeightRef = useRef<{ startY: number; startHeight: number } | null>(null);
  // Stores cleanup functions for active drag operations so they can be
  // removed on unmount even if the user is mid-drag when navigating away.
  const activeDragCleanupRef = useRef<Array<() => void>>([]);

  // Open World state
  const [owStatuses, setOwStatuses] = useState<OpenWorldStatus[]>([]);
  const [owGenerating, setOwGenerating] = useState(false);
  const [owPendingResult, setOwPendingResult] = useState<OpenWorldResult | null>(null);
  const [owStreamText, setOwStreamText] = useState('');
  const owAbortRef = useRef<(() => void) | null>(null);
  // Stores the custom action text typed by the player (for creating a choice output on the node).
  // If the player clicked an existing choice, owExistingChoiceRef stores its ID so we reuse it.
  const owCustomActionRef = useRef<string | null>(null);
  const owExistingChoiceRef = useRef<string | null>(null);
  // User-uploaded images attached to the current OW action (for reference image assignment)
  const owUserImagesRef = useRef<Array<{ base64: string; label: string }> | undefined>(undefined);
  // Pre-created node info: node + edge are created when AI result arrives (before button click).
  // The "Continue to Next Scene" button just transitions to this pre-created node.
  const owPendingNodeRef = useRef<{ nodeId: string; sourceChoiceId: string } | null>(null);
  const [showAiDebug, setShowAiDebug] = useState(false);
  const [aiDebugText, setAiDebugText] = useState('');
  const [showContextViewer, setShowContextViewer] = useState(false);
  const [contextViewerText, setContextViewerText] = useState('');
  const [contextViewerTab, setContextViewerTab] = useState<'user' | 'system'>('user');

  // --- Side panel states (Open World feature panels) ---
  const [showCuriosity, setShowCuriosity] = useState(false);
  const [showCharacterLens, setShowCharacterLens] = useState(false);
  const [showStorytellerChat, setShowStorytellerChat] = useState(false);
  const [curiosityFacts, setCuriosityFacts] = useState<any[]>([]);
  const [characterMindStates, setCharacterMindStates] = useState<Record<string, any>>({});
  const [storytellerMessages, setStorytellerMessages] = useState<any[]>([]);
  const [storytellerGenerating, setStorytellerGenerating] = useState(false);
  const [storytellerStreamText, setStorytellerStreamText] = useState('');
  /** Tracks player overrides to character mind states, injected into next scene context */
  const mindStateOverridesRef = useRef<Record<string, Record<string, string>>>({});
  /** Abort function for an in-progress storyteller chat request */
  const storytellerAbortRef = useRef<(() => void) | null>(null);

  // Track recently visited scene node IDs for blob eviction.
  // We keep blob URLs for the current + last 4 scenes to avoid OOM during play.
  const visitedScenesRef = useRef<string[]>([]);
  const BLOB_RETAIN_COUNT = 5; // Keep blobs for this many recent scenes

  // Background image crossfade state — keep old image visible while new one loads/fades in
  const [prevImage, setPrevImage] = useState<string | undefined>(undefined);
  const [imageOpacity, setImageOpacity] = useState(1);
  const prevImageRef = useRef<string | undefined>(undefined);

  // Audio state - using refs to persist across renders
  const audioStateRef = useRef<{
    currentMusic: Howl | null;
    currentMusicUrl: string | null;
    nextMusic: Howl | null;
    voiceover: Howl | null;
    isFading: boolean;
  }>({
    currentMusic: null,
    currentMusicUrl: null,
    nextMusic: null,
    voiceover: null,
    isFading: false,
  });

  // DIAGNOSTIC: Audio instance registry — tracks all created Howl instances
  const audioRegistryRef = useRef<Set<Howl>>(new Set());
  // DIAGNOSTIC: Window event listener tracker — counts add/remove for leak detection
  const listenerCountRef = useRef<{ added: number; removed: number }>({ added: 0, removed: 0 });

  // Constants for audio transitions
  const FADE_DURATION = 2000; // 2 seconds crossfade
  const MAX_CONCURRENT_HOWLS = 4; // R3 FIX: Reduced from 6 — URL-based reuse makes fewer needed
  const FADE_SAFETY_TIMEOUT = FADE_DURATION + 3000; // R3 FIX: Force-stop if fade hangs

  // R3 FIX: URL-based Howl cache — reuse existing Howl instances for the same audio URL.
  // Prevents redundant PCM decoding (500KB-2MB per duplicate) when the same background
  // music plays across multiple scenes. Max 4 entries, cleaned up on unmount.
  const howlCacheRef = useRef<Map<string, Howl>>(new Map());

  /**
   * Safely check if a URL is valid (not a broken blob URL)
   */
  const isValidAudioUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    // Data URLs are always valid
    if (url.startsWith('data:')) return true;
    // Blob URLs from previous sessions are invalid
    if (url.startsWith('blob:')) {
      console.warn('[Audio] Blob URL detected - may be invalid from previous session');
      return true; // Try anyway, will fail gracefully
    }
    return true;
  };

  /**
   * Create a new Howl instance with proper settings
   */
  const createHowl = (url: string, loop: boolean, volume: number, onEnd?: () => void): Howl | null => {
    if (!isValidAudioUrl(url)) return null;

    try {
      // Convert data URLs to blob URLs to keep binary out of JS heap
      const audioUrl = getBlobUrl(url);

      // R3 FIX: Check URL-based cache first — reuse existing Howl instance
      // if it's still loaded. This avoids redundant PCM decoding.
      const cached = howlCacheRef.current.get(audioUrl);
      if (cached && cached.state() !== 'unloaded') {
        // Reset event handlers for the new use case
        cached.loop(loop);
        cached.volume(volume);
        if (onEnd) cached.on('end', onEnd);
        audioRegistryRef.current.add(cached);
        return cached;
      }

      const howl = new Howl({
        src: [audioUrl],
        loop,
        html5: true,
        format: ['mp3', 'wav', 'ogg', 'webm', 'mpeg'],
        volume,
        onend: onEnd,
        onloaderror: (id, err) => {
          console.error('[Audio] Load error:', err, 'URL:', url.substring(0, 50) + '...');
        },
        onplayerror: (id, err) => {
          console.error('[Audio] Play error:', err);
          // Try to recover by unlocking audio context
          howl.once('unlock', () => {
            howl.play();
          });
        },
      });
      // DIAGNOSTIC: Track all Howl instances
      audioRegistryRef.current.add(howl);

      // R3 FIX: Store in URL-based cache (bounded to MAX_CONCURRENT_HOWLS entries)
      howlCacheRef.current.set(audioUrl, howl);
      if (howlCacheRef.current.size > MAX_CONCURRENT_HOWLS) {
        // Evict the oldest cache entry
        const oldest = howlCacheRef.current.keys().next().value;
        if (oldest) howlCacheRef.current.delete(oldest);
      }

      // Enforce concurrent Howl limit — if too many instances exist
      // (e.g., rapid scene transitions creating new Howls before old
      // ones finish fading), force-unload the oldest ones to prevent
      // decoded PCM audio buffers from accumulating (~500KB-2MB each).
      if (audioRegistryRef.current.size > MAX_CONCURRENT_HOWLS) {
        const excess = audioRegistryRef.current.size - MAX_CONCURRENT_HOWLS;
        const entries = Array.from(audioRegistryRef.current);
        for (let i = 0; i < excess; i++) {
          const old = entries[i];
          // Don't unload the one we just created or the current active music
          if (old === howl || old === audioStateRef.current.currentMusic) continue;
          try { old.stop(); old.unload(); } catch {}
          audioRegistryRef.current.delete(old);
          console.log(`[Audio] Force-unloaded excess Howl instance (registry: ${audioRegistryRef.current.size})`);
        }
      }

      return howl;
    } catch (err) {
      console.error('[Audio] Failed to create Howl:', err);
      return null;
    }
  };

  /**
   * Fade out a Howl instance and optionally unload it
   */
  const fadeOutAndStop = (howl: Howl | null, unload: boolean = true): Promise<void> => {
    return new Promise((resolve) => {
      if (!howl) {
        resolve();
        return;
      }

      try {
        const currentVolume = howl.volume();
        if (currentVolume <= 0) {
          howl.stop();
          if (unload) {
            howl.unload();
            audioRegistryRef.current.delete(howl);
          }
          resolve();
          return;
        }

        howl.fade(currentVolume, 0, FADE_DURATION);
      } catch (err) {
        // If fade fails (e.g., already unloaded), force cleanup
        console.warn('[Audio] Fade error, forcing cleanup:', err);
        try { howl.stop(); } catch {}
        if (unload) {
          try { howl.unload(); } catch {}
          audioRegistryRef.current.delete(howl);
        }
        resolve();
        return;
      }

      // R3 FIX: Use FADE_SAFETY_TIMEOUT instead of FADE_DURATION to give
      // the fade a small buffer, but force-stop if it hangs. This prevents
      // Howl instances from sitting in a limbo state indefinitely if the
      // browser audio context is locked or the fade callback never fires.
      setTimeout(() => {
        try {
          howl.stop();
        } catch {}
        if (unload) {
          try { howl.unload(); } catch {}
          // Remove from audio registry on unload
          audioRegistryRef.current.delete(howl);
        }
        resolve();
      }, FADE_SAFETY_TIMEOUT);
    });
  };

  /**
   * Fade in a Howl instance
   */
  const fadeIn = (howl: Howl, targetVolume: number): void => {
    howl.volume(0);
    howl.play();
    howl.fade(0, targetVolume, FADE_DURATION);
  };

  /**
   * Handle background music changes with crossfade
   */
  const handleMusicChange = async (
    newMusicUrl: string | undefined,
    keepPlaying: boolean,
    targetVolume: number
  ) => {
    const state = audioStateRef.current;

    console.log('[Audio] Music change:', {
      newUrl: newMusicUrl ? newMusicUrl.substring(0, 50) + '...' : 'none',
      keepPlaying,
      currentUrl: state.currentMusicUrl ? state.currentMusicUrl.substring(0, 50) + '...' : 'none',
      isFading: state.isFading,
    });

    // Prevent overlapping transitions
    if (state.isFading) {
      console.log('[Audio] Already fading, skipping transition');
      return;
    }

    // Case 1: Same music URL - do nothing
    if (newMusicUrl && state.currentMusicUrl === newMusicUrl && state.currentMusic) {
      console.log('[Audio] Same music, continuing playback');
      return;
    }

    // Case 2: Keep playing current music (no new music or keepPlaying is true from PREVIOUS scene)
    // Note: keepPlaying means the PREVIOUS scene wanted its music to continue
    if (!newMusicUrl && keepPlaying && state.currentMusic) {
      console.log('[Audio] Keeping previous music playing');
      return;
    }

    // Case 3: No new music and not keeping - fade out current
    if (!newMusicUrl && !keepPlaying) {
      console.log('[Audio] No new music, fading out current');
      state.isFading = true;
      await fadeOutAndStop(state.currentMusic);
      state.currentMusic = null;
      state.currentMusicUrl = null;
      state.isFading = false;
      return;
    }

    // Case 4: New music - crossfade from current to new
    if (newMusicUrl && isValidAudioUrl(newMusicUrl)) {
      state.isFading = true;

      // Create new music instance
      const newMusic = createHowl(newMusicUrl, true, targetVolume);
      if (!newMusic) {
        console.error('[Audio] Failed to create new music instance');
        state.isFading = false;
        return;
      }

      // If there's current music, crossfade
      if (state.currentMusic) {
        console.log('[Audio] Crossfading to new music');
        // Start new music fading in
        fadeIn(newMusic, targetVolume);
        // Fade out old music
        await fadeOutAndStop(state.currentMusic);
      } else {
        console.log('[Audio] Starting new music (no previous)');
        fadeIn(newMusic, targetVolume);
      }

      state.currentMusic = newMusic;
      state.currentMusicUrl = newMusicUrl;
      state.isFading = false;
    }
  };

  /**
   * Handle voiceover playback
   */
  const handleVoiceover = (
    voiceoverUrl: string | undefined,
    autoplay: boolean,
    targetVolume: number
  ) => {
    const state = audioStateRef.current;

    // Stop any current voiceover
    if (state.voiceover) {
      state.voiceover.stop();
      state.voiceover.unload();
      state.voiceover = null;
    }

    // Start new voiceover if valid — but NOT if TTS streaming is already playing/loading.
    // TTS manages its own playback via TTSPlayer; once done it stores the final URL
    // on the scene with autoplay=false, so this block won't double-play.
    const ttsActive = ttsNodeRef.current !== null;
    if (voiceoverUrl && autoplay && !ttsActive && isValidAudioUrl(voiceoverUrl)) {
      console.log('[Audio] Starting voiceover');
      const voiceover = createHowl(voiceoverUrl, false, targetVolume);
      if (voiceover) {
        voiceover.play();
        state.voiceover = voiceover;
      }
    }
  };

  /**
   * Main effect for handling scene audio changes
   * Triggers on node change OR when audio URLs change (for replaced audio files)
   */
  useEffect(() => {
    if (!currentScene) return;

    console.log('[Audio] Scene audio update:', {
      nodeId: currentScene.nodeId,
      hasMusic: !!currentScene.backgroundMusic,
      keepPlaying: currentScene.musicKeepPlaying,
      hasVoiceover: !!currentScene.voiceover,
      voiceoverAutoplay: currentScene.voiceoverAutoplay,
    });

    const musicVolume = preferences.musicVolume * preferences.masterVolume;
    const voiceVolume = preferences.voiceVolume * preferences.masterVolume;

    // Handle music with crossfade
    handleMusicChange(
      currentScene.backgroundMusic,
      currentScene.musicKeepPlaying,
      musicVolume
    );

    // Handle voiceover
    handleVoiceover(
      currentScene.voiceover,
      currentScene.voiceoverAutoplay,
      voiceVolume
    );

    // Also depend on audio URLs so effect re-runs when audio files are replaced
  }, [currentScene?.nodeId, currentScene?.backgroundMusic, currentScene?.voiceover]);

  /**
   * Update volume when preferences change
   */
  useEffect(() => {
    const state = audioStateRef.current;
    const musicVolume = preferences.musicVolume * preferences.masterVolume;
    const voiceVolume = preferences.voiceVolume * preferences.masterVolume;

    if (state.currentMusic && !state.isFading) {
      state.currentMusic.volume(musicVolume);
    }
    if (state.voiceover) {
      state.voiceover.volume(voiceVolume);
    }
  }, [preferences.musicVolume, preferences.voiceVolume, preferences.masterVolume]);

  /**
   * Cleanup all audio on component unmount
   */
  useEffect(() => {
    return () => {
      const state = audioStateRef.current;
      console.log('[Audio] Cleanup on unmount');

      if (state.currentMusic) {
        state.currentMusic.stop();
        state.currentMusic.unload();
        state.currentMusic = null;
      }
      if (state.nextMusic) {
        state.nextMusic.stop();
        state.nextMusic.unload();
        state.nextMusic = null;
      }
      if (state.voiceover) {
        state.voiceover.stop();
        state.voiceover.unload();
        state.voiceover = null;
      }
      state.currentMusicUrl = null;
      state.isFading = false;

      // DIAGNOSTIC: Force-unload any orphaned Howl instances from the registry
      for (const howl of audioRegistryRef.current) {
        try { howl.stop(); howl.unload(); } catch {}
      }
      audioRegistryRef.current.clear();
      // R3 FIX: Clear URL-based Howl cache on unmount
      howlCacheRef.current.clear();

      // Release player-mode blob URLs and thumbnails on unmount.
      // This ensures memory is freed even if the user navigates away
      // without going through endGame() (e.g., browser back button).
      clearThumbnailCache();
      clearOwContextStore();
      console.log('[AdventureEngine] Cleared thumbnail cache and OW context store on unmount');
    };
  }, []);

  // DIAGNOSTIC: Expose audio and listener audit functions on window
  useEffect(() => {
    (window as any).__audioAudit = () => {
      const registry = audioRegistryRef.current;
      const state = audioStateRef.current;
      const result = {
        totalCreated: registry.size,
        currentMusic: state.currentMusic ? 'playing' : 'none',
        voiceover: state.voiceover ? 'playing' : 'none',
        isFading: state.isFading,
        orphanedInstances: registry.size - (state.currentMusic ? 1 : 0) - (state.voiceover ? 1 : 0),
      };
      console.log('[AudioAudit]', result);
      return result;
    };

    (window as any).__listenerAudit = () => {
      const counts = listenerCountRef.current;
      const result = {
        totalAdded: counts.added,
        totalRemoved: counts.removed,
        leaked: counts.added - counts.removed,
      };
      console.log('[ListenerAudit]', result);
      return result;
    };

    return () => {
      delete (window as any).__audioAudit;
      delete (window as any).__listenerAudit;
    };
  }, []);

  // ── R2 FIX: PERIODIC BLOB HARD-REVOCATION ────────────────────
  // During extended play sessions, soft-evicted blob URLs accumulate
  // native memory (the browser keeps the underlying blob data alive
  // until URL.revokeObjectURL() is called). The B4 fix only revokes
  // after an OW scene save — this timer ensures revocation also happens
  // during non-OW play or when OW saves fail silently.
  //
  // Every 30 seconds, we collect blob URLs for current + recent scenes
  // + all entities, then hard-revoke everything else.
  useEffect(() => {
    if (!session) return;

    const id = setInterval(() => {
      const proj = useProjectStore.getState().currentProject;
      if (!proj) return;

      const retainSet = new Set<string>();

      // Retain ALL scene blob URLs in the project — not just recent ones.
      // Hard-revoking blob URLs that are still referenced by project nodes
      // causes permanent image loss: rehydrateForSave() can't convert a
      // revoked blob URL back to base64, so it writes '' to IndexedDB.
      // Soft-eviction (removing from blobStore Map) is enough to reduce
      // JS heap usage; the native blob memory is manageable (~2MB/image).
      for (const node of proj.nodes) {
        if (node.type !== 'scene') continue;
        const data = node.data as Record<string, unknown>;
        for (const f of ['backgroundImage', 'backgroundMusic', 'voiceoverAudio']) {
          const v = data[f];
          if (typeof v === 'string' && v.startsWith('blob:')) retainSet.add(v);
        }
      }

      // Retain ALL entity assets (needed for image generation reference)
      for (const entity of (proj.entities || [])) {
        for (const f of ['referenceImage', 'referenceVoice', 'defaultMusic'] as const) {
          const v = (entity as any)[f];
          if (typeof v === 'string' && v.startsWith('blob:')) retainSet.add(v);
        }
      }

      const revoked = revokeStaleEvictions(retainSet);
      if (revoked > 0) {
        console.log(`[AdventureEngine] Periodic revocation: freed ${revoked} stale blob URLs`);
      }
    }, 30_000);

    return () => clearInterval(id);
    // Only re-create the interval when a session starts/ends (not on every scene change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!session]);

  // ── TTS State Management ──────────────────────────────────────
  // Tracks TTS generation + playback so we can:
  //   1. Start TTS as soon as OW text is ready (before scene transition)
  //   2. Show accurate speaker icon state (idle/loading/playing)
  //   3. Prevent double playback when voiceover URL lands on the scene
  const ttsPlayerRef = useRef<TTSPlayer | null>(null);
  const ttsHandleRef = useRef<{ cancel: () => void } | null>(null);
  const ttsNodeRef = useRef<string | null>(null);  // nodeId that TTS is generating for
  const [ttsState, setTtsState] = useState<'idle' | 'loading' | 'playing' | 'disabled'>('idle');

  /**
   * Start TTS for given text, targeting a specific scene node.
   * Can be called before the scene is even displayed (early-start from OW onComplete).
   */
  const startTTS = useCallback((text: string, targetNodeId: string) => {
    const settings = useImageGenStore.getState();
    if (!settings.tts.enabled || !settings.googleApiKey) return;
    if (!text || text.trim().length < 10) return;

    // Don't re-generate if already generating for this node
    if (ttsNodeRef.current === targetNodeId) return;

    // Cancel previous TTS
    ttsHandleRef.current?.cancel();
    ttsPlayerRef.current?.stop();

    ttsNodeRef.current = targetNodeId;
    setTtsState('loading');

    const voiceVolume = (preferences.voiceVolume ?? 1) * (preferences.masterVolume ?? 1);
    const player = new TTSPlayer(voiceVolume);
    ttsPlayerRef.current = player;

    console.log(`[TTS] Starting early TTS for node ${targetNodeId}`);

    const handle = streamTTS(
      text,
      // onChunkReady — enqueue for sequential playback
      (chunk) => {
        console.log(`[TTS] Chunk ${chunk.index} ready`);
        setTtsState('playing');
        player.enqueue(chunk.dataUrl);
      },
      // onAllDone — store final concatenated audio on the scene node
      (finalDataUrl) => {
        console.log(`[TTS] All chunks done, storing voiceover on ${targetNodeId}`);
        setTtsState('idle');
        ttsNodeRef.current = null;

        // Store on the project node (field is `voiceoverAudio` in SceneNode type)
        const projStore = useProjectStore.getState();
        const node = projStore.currentProject?.nodes.find(n => n.id === targetNodeId);
        if (node) {
          projStore.updateNode(targetNodeId, {
            data: { ...(node.data as any), voiceoverAudio: finalDataUrl, voiceoverAutoplay: true },
          } as any);
          console.log(`[TTS] Voiceover saved on node ${targetNodeId} (${Math.round(finalDataUrl.length / 1024)}KB)`);
        }
        // Update player store scene — set voiceover but DON'T autoplay now (chunks already played).
        // voiceoverAutoplay=true on the node means it will auto-play when RE-ENTERING this scene later.
        const playerScene = usePlayerStore.getState().currentScene;
        if (playerScene && playerScene.nodeId === targetNodeId) {
          usePlayerStore.getState().setCurrentScene({
            ...playerScene,
            voiceover: getBlobUrl(finalDataUrl),
            voiceoverAutoplay: false, // false for current session (already playing)
          });
        }
      },
    );

    ttsHandleRef.current = handle;
  }, [preferences.voiceVolume, preferences.masterVolume]);

  /** Stop any active TTS generation and playback */
  const stopTTS = useCallback(() => {
    ttsHandleRef.current?.cancel();
    ttsPlayerRef.current?.stop();
    ttsHandleRef.current = null;
    ttsPlayerRef.current = null;
    ttsNodeRef.current = null;
    setTtsState('idle');
  }, []);

  /**
   * Toggle TTS / voiceover for the current scene (unified mute/unmute).
   * Stops BOTH streaming TTS and pre-recorded voiceover when muting.
   */
  const handleToggleTTS = useCallback(() => {
    const audioState = audioStateRef.current;
    const voiceoverPlaying = audioState.voiceover && (audioState.voiceover as any).playing?.();

    if (ttsState === 'loading' || ttsState === 'playing' || voiceoverPlaying) {
      // Stop streaming TTS
      stopTTS();
      // Stop pre-recorded voiceover
      if (audioState.voiceover) {
        audioState.voiceover.stop();
        audioState.voiceover.unload();
        audioState.voiceover = null;
      }
    } else {
      // Start TTS for current scene
      if (currentScene) {
        // If scene already has a stored voiceover, play that directly
        if (currentScene.voiceover) {
          if (audioState.voiceover) {
            audioState.voiceover.stop();
            audioState.voiceover.unload();
          }
          const vol = (preferences.voiceVolume ?? 1) * (preferences.masterVolume ?? 1);
          const howl = createHowl(currentScene.voiceover, false, vol);
          if (howl) {
            howl.play();
            audioState.voiceover = howl;
            setTtsState('playing');
            howl.on('end', () => setTtsState('idle'));
          }
        } else {
          startTTS(currentScene.storyText, currentScene.nodeId);
        }
      }
    }
  }, [ttsState, currentScene, stopTTS, startTTS, preferences.voiceVolume, preferences.masterVolume]);

  // Auto-start TTS when entering a NEW scene that doesn't already have voiceover.
  // Skips scenes that already have a voiceover audio file attached.
  useEffect(() => {
    if (!currentScene) return;
    const settings = useImageGenStore.getState();
    if (!settings.tts.enabled || !settings.googleApiKey) return;
    // Skip if already has voiceover (will be handled by audio effect)
    if (currentScene.voiceover) return;
    // Skip if TTS is already running for this node (started early from OW)
    if (ttsNodeRef.current === currentScene.nodeId) return;
    // Skip if OW result is pending — we just stopped TTS in onComplete,
    // don't restart it for the old scene while the user sees "Continue to Next Scene".
    if (owPendingResult) return;

    startTTS(currentScene.storyText, currentScene.nodeId);
  }, [currentScene?.nodeId, startTTS]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      ttsHandleRef.current?.cancel();
      ttsPlayerRef.current?.stop();
    };
  }, []);

  // ── Background image crossfade ─────────────────────────────────
  // When the scene's background image changes, keep the old image visible
  // and crossfade to the new one over 1.5 seconds.
  useEffect(() => {
    const newImage = currentScene?.backgroundImage;
    const oldImage = prevImageRef.current;

    // Same image or initial load — no crossfade needed
    if (newImage === oldImage) return;

    if (oldImage && newImage) {
      // Crossfade: show old image at full opacity, fade new one in
      setPrevImage(oldImage);
      setImageOpacity(0);
      // Small delay to ensure the DOM has rendered the new image at opacity 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setImageOpacity(1);
        });
      });
      // Clear the old image after the 2s transition completes (+ 200ms buffer)
      const timer = setTimeout(() => {
        setPrevImage(undefined);
      }, 2200);
      prevImageRef.current = newImage;
      return () => clearTimeout(timer);
    } else if (newImage && !oldImage) {
      // First image or image appearing — fade in
      setImageOpacity(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setImageOpacity(1);
        });
      });
      prevImageRef.current = newImage;
    } else if (!newImage && oldImage) {
      // Image removed — keep showing old image (don't go blank)
      setPrevImage(oldImage);
      prevImageRef.current = undefined;
    }
  }, [currentScene?.backgroundImage]);

  // Track the last processed node to detect save game loads
  const lastProcessedNodeRef = useRef<string | null>(null);

  /**
   * Helper: log V8 heap usage for memory debugging.
   * Only works in Chrome/Edge (performance.memory API).
   */
  const logHeap = (label: string) => {
    const perf = performance as any;
    if (perf.memory) {
      const usedMB = Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
      const totalMB = Math.round(perf.memory.totalJSHeapSize / 1024 / 1024);
      const limitMB = Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024);
      console.log(`[HeapDiag] ${label}: ${usedMB}MB used / ${totalMB}MB total / ${limitMB}MB limit`);
    }
  };

  /**
   * Load project and start game.
   *
   * MEMORY OPTIMIZATION: Previously this loaded the project from IndexedDB
   * TWICE — once via getProject() and again via projStore.loadProject() —
   * creating 2-3 copies of all base64 images in V8 heap simultaneously.
   * With 50+ scenes × 1-3 MB per image = 300+ MB heap spike → OOM.
   *
   * Now: if the project store already has the project loaded (which it does
   * when coming from the editor), we reuse that reference. If not, we load
   * from IndexedDB ONCE and share the same object with both stores.
   */
  useEffect(() => {
    async function loadAndStart() {
      if (!projectId) {
        setError('No project ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        logHeap('Before project load');

        // ── Step 0: AGGRESSIVE MEMORY CLEANUP before loading ──────────
        // Cancel any pending auto-save — rehydrateForSave() calls
        // structuredClone which can spike memory during transition.
        cancelPendingAutoSave();

        // Clear editor-only caches that aren't needed during play.
        clearThumbnailCache();

        // Clear undo/redo history — not needed during play mode.
        useProjectStore.setState((state: any) => {
          state.history = [];
          state.historyIndex = -1;
        });

        logHeap('After clearing editor caches');

        // ── Step 1: Get the project, avoiding duplicate IndexedDB loads ──
        const projStore = useProjectStore.getState();
        let projectForPlayer: Project;

        if (projStore.currentProject && projStore.currentProject.id === projectId) {
          projectForPlayer = projStore.currentProject;
          console.log('[AdventureEngine] Reusing project from project store');
          logHeap('After reusing project store reference');
        } else {
          const loadedProject = await projectsDB.getProject(projectId);
          if (!loadedProject) {
            setError('Project not found');
            return;
          }
          logHeap('After getProject from IndexedDB');

          // Clean stale blob URLs from previous sessions before processing.
          cleanStaleBlobUrls(loadedProject);

          // Offload base64 assets to blob URLs BEFORE passing to stores.
          const replacements = collectAssetReplacements(loadedProject);
          if (replacements.length > 0) {
            for (const { type, id, field, blobUrl } of replacements) {
              if (type === 'node') {
                const node = loadedProject.nodes.find(n => n.id === id);
                if (node) (node.data as any)[field] = blobUrl;
              } else if (type === 'entity') {
                const entity = (loadedProject.entities || []).find(e => e.id === id);
                if (entity) (entity as any)[field] = blobUrl;
              }
            }
            console.log(`[AdventureEngine] Pre-offloaded ${replacements.length} assets`);
            logHeap('After pre-offloading assets');
          }

          projectForPlayer = loadedProject;
        }

        // ── Step 1b: Strip old constructedContext/constructedSystemPrompt ──
        // These strings grow O(N²) and can be 15-50 MB combined.
        // IMPORTANT: The project store uses Immer which freezes objects in dev
        // mode, so we must strip via an Immer setState (not direct delete).
        {
          let strippedCount = 0;
          let strippedBytes = 0;
          // Check if any nodes have old context strings
          for (const node of projectForPlayer.nodes) {
            if (node.type === 'scene') {
              const data = node.data as Record<string, unknown>;
              if (typeof data.constructedContext === 'string') {
                strippedBytes += (data.constructedContext as string).length;
                strippedCount++;
              }
              if (typeof data.constructedSystemPrompt === 'string') {
                strippedBytes += (data.constructedSystemPrompt as string).length;
              }
            }
          }
          if (strippedCount > 0) {
            // Use Immer-safe mutation through the project store
            const unsuppress = suppressHistoryRecording();
            useProjectStore.setState((state: any) => {
              if (!state.currentProject) return;
              for (const node of state.currentProject.nodes) {
                if (node.type === 'scene') {
                  delete node.data.constructedContext;
                  delete node.data.constructedSystemPrompt;
                }
              }
            });
            unsuppress();
            // Re-read the (now stripped) project
            projectForPlayer = useProjectStore.getState().currentProject || projectForPlayer;
            console.log(`[AdventureEngine] Stripped context from ${strippedCount} nodes (~${Math.round(strippedBytes / 1024)}KB)`);
            logHeap('After stripping old context strings');
          }
        }

        // ── Step 1c: AGGRESSIVE BLOB EVICTION ──
        // The blob store holds ALL scene images as native Blobs. With 50+
        // scenes × 2MB each, that's ~100 MB of native process memory on top
        // of the V8 heap. For play mode, we only need the start scene's
        // assets plus ALL entity reference images (used by the image
        // generation API for visual consistency). Everything else is safely
        // in IndexedDB and will be re-created if we return to the editor.
        {
          const startNodeId = startNodeParam || projectForPlayer.settings.startNodeId || '';
          const startNode = projectForPlayer.nodes.find(n => n.id === startNodeId);
          const retainSet = new Set<string>();

          // Keep the start scene's assets
          if (startNode && startNode.type === 'scene') {
            const data = startNode.data as Record<string, unknown>;
            for (const field of ['backgroundImage', 'backgroundMusic', 'voiceoverAudio']) {
              const val = data[field];
              if (typeof val === 'string' && val.startsWith('blob:')) {
                retainSet.add(val);
              }
            }
          }

          // Keep ALL entity reference images — these are needed throughout
          // the OW session for image generation (visual consistency via
          // Gemini reference images). Entity images are typically smaller
          // than scene backgrounds (~512×512 vs 1280×720).
          for (const entity of (projectForPlayer.entities || [])) {
            for (const field of ['referenceImage', 'referenceVoice', 'defaultMusic'] as const) {
              const val = (entity as any)[field];
              if (typeof val === 'string' && val.startsWith('blob:')) {
                retainSet.add(val);
              }
            }
          }

          const evicted = evictBlobsExcept(retainSet);
          if (evicted > 0) {
            console.log(`[AdventureEngine] Evicted ${evicted} non-essential blobs for play mode. Retained: ${retainSet.size} (incl. entity assets)`);
            logHeap('After aggressive blob eviction');
          }
        }

        // ── Step 2: Set up OW mode and project store ──
        if (openWorldParam) {
          setOpenWorldMode(true);
          if (!projStore.currentProject || projStore.currentProject.id !== projectId) {
            useProjectStore.setState((state: any) => {
              state.currentProject = projectForPlayer;
              state.isLoading = false;
              state.isDirty = false;
            });
            console.log('[AdventureEngine] Set project into project store');
          }
        }

        logHeap('Before startGame');

        // ── Step 3: Start the game ──
        // When explicit startNode/mode params are given, use those directly.
        // When entering Open World mode without explicit params, attempt to
        // resume from the most recent save for this project. This lets
        // players jump straight back into their adventure from the Dashboard.
        // ── Helper: find the scene node with the longest path from start ──
        // Used as a fallback for OW mode when the start node is invalid.
        // BFS from startNodeId, returns the farthest reachable scene node.
        const findDeepestScene = (proj: typeof projectForPlayer): string | null => {
          const startId = proj.settings?.startNodeId;
          if (!startId || !proj.nodes.some(n => n.id === startId)) {
            // startNodeId itself is invalid — just return the last scene node
            const scenes = proj.nodes.filter(n => n.type === 'scene');
            return scenes.length > 0 ? scenes[scenes.length - 1].id : null;
          }
          const adjacency = new Map<string, string[]>();
          for (const edge of proj.edges) {
            if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
            adjacency.get(edge.source)!.push(edge.target);
          }
          const visited = new Set<string>();
          const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
          visited.add(startId);
          let deepest: { id: string; depth: number } | null = null;
          while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            const node = proj.nodes.find(n => n.id === id);
            if (node?.type === 'scene' && (!deepest || depth > deepest.depth)) {
              deepest = { id, depth };
            }
            for (const next of adjacency.get(id) || []) {
              if (!visited.has(next)) { visited.add(next); queue.push({ id: next, depth: depth + 1 }); }
            }
          }
          return deepest?.id || null;
        };

        // ── Helper: resolve a valid scene node ID with robust fallback ──
        const resolveStartNode = (proj: typeof projectForPlayer, preferredId?: string): string | null => {
          // 1. Try the preferred ID
          if (preferredId && proj.nodes.some(n => n.id === preferredId)) return preferredId;
          // 2. Try project's startNodeId
          const settingsId = proj.settings?.startNodeId;
          if (settingsId && proj.nodes.some(n => n.id === settingsId)) return settingsId;
          // 3. Try the deepest scene (for OW mode — continue from farthest point)
          const deepest = findDeepestScene(proj);
          if (deepest) return deepest;
          // 4. Try first scene node
          const firstScene = proj.nodes.find(n => n.type === 'scene');
          if (firstScene) return firstScene.id;
          // 5. Any node at all
          return proj.nodes[0]?.id || null;
        };

        if (startNodeParam && modeParam === 'continue') {
          // Validate the explicit start node exists
          const validId = resolveStartNode(projectForPlayer, startNodeParam);
          if (validId) {
            continueFromNode(projectForPlayer, validId);
          } else {
            setError('No valid scene node found in this project');
            return;
          }
        } else if (startNodeParam && modeParam === 'fresh') {
          const validId = resolveStartNode(projectForPlayer, startNodeParam);
          if (validId) {
            startGameFromNode(projectForPlayer, validId);
          } else {
            setError('No valid scene node found in this project');
            return;
          }
        } else if (openWorldParam && !startNodeParam) {
          // OW mode: try auto-resume from save, then deepest scene, then start
          const { saveSlots } = usePlayerStore.getState();
          const projectSaves = saveSlots
            .filter(s => s.gameState.projectId === projectId)
            .sort((a, b) => b.savedAt - a.savedAt);

          if (projectSaves.length > 0) {
            const latestSave = projectSaves[0];
            const resumeNodeId = latestSave.gameState.currentNodeId;
            const validId = resolveStartNode(projectForPlayer, resumeNodeId);
            if (validId) {
              console.log(`[AdventureEngine] OW auto-resume: node ${validId}`);
              continueFromNode(projectForPlayer, validId);
            } else {
              setError('No valid scene node found in this project');
              return;
            }
          } else {
            // No saves — start from the deepest scene (longest path from start)
            const deepestId = findDeepestScene(projectForPlayer);
            const validId = resolveStartNode(projectForPlayer, deepestId || undefined);
            if (validId) {
              console.log(`[AdventureEngine] OW mode: starting from deepest scene ${validId}`);
              startGameFromNode(projectForPlayer, validId);
            } else {
              setError('No valid scene node found in this project');
              return;
            }
          }
        } else {
          startGame(projectForPlayer);
        }

        logHeap('After startGame');
      } catch (err) {
        console.error('[AdventureEngine] Failed to load project:', err);
        setError('Failed to load game');
      } finally {
        setIsLoading(false);
      }
    }

    loadAndStart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, startNodeParam, modeParam, openWorldParam]);

  /**
   * Process a node (the game loop)
   */
  const processNode = useCallback(
    (proj: Project, nodeId: string) => {
      console.log('[AdventureEngine] Processing node:', nodeId);

      // Find the node
      const node = proj.nodes.find((n) => n.id === nodeId);

      if (!node) {
        // Attempt recovery: find any valid scene node to jump to instead of crashing.
        // This handles corrupted startNodeIds from ZIP imports and old saves.
        console.warn(`[AdventureEngine] Node not found: "${nodeId}" — attempting recovery`);
        const fallbackScene = proj.nodes.find(n => n.type === 'scene');
        if (fallbackScene && fallbackScene.id !== nodeId) {
          console.log(`[AdventureEngine] Recovered: jumping to fallback scene "${fallbackScene.label}" (${fallbackScene.id})`);
          usePlayerStore.getState().setCurrentNodeId(fallbackScene.id);
          return; // The useEffect watching session.currentNodeId will re-trigger processNode
        }
        // No scene nodes at all — show error
        console.error('[AdventureEngine] No scene nodes found in project — cannot recover');
        setError('No scene nodes found in this project. Add a scene in the editor first.');
        return;
      }

      // Handle different node types
      switch (node.type) {
        case 'scene':
          // Scene node - display content and wait for input
          displayScene(proj, node as SceneNode);
          break;

        case 'modifier': {
          // Modifier node - apply variable changes and continue
          const modNode = node as ModifierNode;
          const { mode, targetVariable } = modNode.data;
          const currentSession = usePlayerStore.getState().session;

          if (currentSession && targetVariable) {
            const currentValue = currentSession.variables[targetVariable];
            let newValue: number | string | boolean = currentValue as number;

            console.log('[AdventureEngine] Applying modifier:', {
              mode,
              targetVariable,
              currentValue,
            });

            switch (mode) {
              case 'math': {
                // Math mode: perform arithmetic operations
                const { mathOperation, mathValue, mathValueIsVariable } = modNode.data;
                if (mathOperation !== undefined && mathValue !== undefined) {
                  // Get the operand value (from variable or literal)
                  let operand: number;
                  if (mathValueIsVariable && typeof mathValue === 'string') {
                    operand = (currentSession.variables[mathValue] as number) || 0;
                  } else {
                    operand = typeof mathValue === 'number' ? mathValue : parseFloat(String(mathValue)) || 0;
                  }

                  // Current value must be a number
                  const baseValue = typeof currentValue === 'number' ? currentValue : 0;

                  // Apply the operation
                  switch (mathOperation) {
                    case 'add':
                      newValue = baseValue + operand;
                      break;
                    case 'subtract':
                      newValue = baseValue - operand;
                      break;
                    case 'multiply':
                      newValue = baseValue * operand;
                      break;
                    case 'divide':
                      newValue = operand !== 0 ? baseValue / operand : baseValue;
                      break;
                  }
                  console.log('[AdventureEngine] Math:', { baseValue, mathOperation, operand, newValue });
                }
                break;
              }

              case 'set': {
                // Set mode: assign a value directly
                const { setValue, setValueIsVariable } = modNode.data;
                if (setValue !== undefined) {
                  if (setValueIsVariable && typeof setValue === 'string') {
                    // Get value from another variable
                    newValue = currentSession.variables[setValue] as number | string | boolean;
                  } else {
                    // Use the literal value
                    newValue = setValue;
                  }
                  console.log('[AdventureEngine] Set:', { setValue, newValue });
                }
                break;
              }

              case 'random': {
                // Random mode: generate a random number between min and max
                const { randomMin = 0, randomMax = 100 } = modNode.data;
                newValue = Math.floor(Math.random() * (randomMax - randomMin + 1)) + randomMin;
                console.log('[AdventureEngine] Random:', { randomMin, randomMax, newValue });
                break;
              }
            }

            // Apply the update to the store
            updateVariable(targetVariable, newValue);
            console.log('[AdventureEngine] Variable updated:', { targetVariable, newValue });
          }

          const modifierNext = findNextNode(proj, nodeId, 'default');
          if (modifierNext) {
            processNode(proj, modifierNext);
          }
          break;
        }

        case 'choice':
          // Choice node - evaluate condition and branch
          console.log('[AdventureEngine] Choice node, evaluating...');
          // For now, always take success path (full implementation would evaluate condition)
          const choiceNext = findNextNode(proj, nodeId, 'success');
          if (choiceNext) {
            processNode(proj, choiceNext);
          }
          break;

        default:
          console.warn('[AdventureEngine] Unknown node type:', node.type);
      }
    },
    [setCurrentScene, updateVariable]
  );

  /**
   * Process nodes when session.currentNodeId changes
   * This handles:
   * 1. Initial game start - when startGame sets the first node
   * 2. Save game loads - when loadGame restores a saved position
   *
   * By using an effect, we ensure React has committed the state updates
   * before we try to render the scene (fixes first node not rendering).
   */
  useEffect(() => {
    if (!project || !session) return;

    // Process node if it differs from what we last processed
    if (session.currentNodeId && session.currentNodeId !== lastProcessedNodeRef.current) {
      console.log('[AdventureEngine] Processing node:', session.currentNodeId);
      processNode(project, session.currentNodeId);
      lastProcessedNodeRef.current = session.currentNodeId;
    }
  }, [project, session?.currentNodeId, processNode]);

  /**
   * Interpolate variables in text
   * Replaces {{variableName}} with actual variable values
   *
   * Examples:
   * - "Hello {{playerName}}!" -> "Hello John!"
   * - "You have {{gold}} gold coins." -> "You have 50 gold coins."
   * - "{{customMessage}}" -> (entire content from string variable)
   */
  const interpolateVariables = (text: string): string => {
    if (!text) return text;

    const currentSession = usePlayerStore.getState().session;
    if (!currentSession) return text;

    // Replace all {{variableName}} patterns with actual values
    // Supports variable names with letters, numbers, underscores, and hyphens
    return text.replace(/\{\{([\w-]+)\}\}/g, (match, varName) => {
      const value = currentSession.variables[varName];
      if (value === undefined) {
        console.warn(`[AdventureEngine] Variable not found: ${varName}`);
        return match; // Keep original if variable not found
      }
      // Convert to string representation
      if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
      }
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    });
  };

  /**
   * Display a scene node
   */
  const displayScene = (proj: Project, node: SceneNode) => {
    // Interpolate variables in story text and speaker name
    const interpolatedStoryText = interpolateVariables(node.data.storyText);
    const interpolatedSpeakerName = node.data.speakerName
      ? interpolateVariables(node.data.speakerName)
      : undefined;

    // Build scene data — convert base64 data URLs to blob URLs to keep
    // multi-megabyte strings out of the JS heap. Only ~50 byte blob URL
    // pointers are stored in state; the binary data lives in browser-managed
    // native blob storage (outside V8, can be paged to disk).
    const sceneData: SceneDisplayData = {
      nodeId: node.id,
      backgroundImage: getBlobUrl(node.data.backgroundImage),
      speakerName: interpolatedSpeakerName,
      storyText: interpolatedStoryText,
      choices: node.data.choices.map((choice) => ({
        id: choice.id,
        label: interpolateVariables(choice.label), // Also interpolate choice labels
        icon: choice.icon,
        isAvailable: true, // Full implementation would check conditions
        targetNodeId: findNextNode(proj, node.id, choice.id) || undefined,
      })),
      backgroundMusic: getBlobUrl(node.data.backgroundMusic),
      musicKeepPlaying: node.data.musicKeepPlaying,
      voiceover: getBlobUrl(node.data.voiceoverAudio),
      voiceoverAutoplay: node.data.voiceoverAutoplay,
    };

    setCurrentScene(sceneData);

    // Track visited scenes for in-play blob eviction (P2a fix).
    // After each OW scene is saved, evictBlobsExcept() soft-evicts blobs
    // not in the last 3 visited scenes + entity assets. This is done in
    // the post-save block (see saveAndOffloadAssets section), not here.
    if (visitedScenesRef.current[visitedScenesRef.current.length - 1] !== node.id) {
      visitedScenesRef.current.push(node.id);
      // Keep only the last BLOB_RETAIN_COUNT scene IDs
      if (visitedScenesRef.current.length > BLOB_RETAIN_COUNT) {
        visitedScenesRef.current = visitedScenesRef.current.slice(-BLOB_RETAIN_COUNT);
      }
    }
  };

  /**
   * Find the next node based on edge.
   *
   * Matching strategy (in order of priority):
   * 1. Exact match: edge.sourceHandle === choiceId
   * 2. Fallback for generic edges: if the source is a scene with choices,
   *    match generic edges to choices by position index
   * 3. Last resort: any outgoing edge from this source
   */
  const findNextNode = (
    proj: Project,
    sourceId: string,
    handleId: string
  ): string | null => {
    // Always use the freshest project data — the player store's `project`
    // may be stale after OW scene creation. Fall back to the passed proj.
    const freshProj = useProjectStore.getState().currentProject || proj;

    // Priority 1: exact sourceHandle match (properly created edges)
    const exactEdge = freshProj.edges.find(
      (e) => e.source === sourceId && e.sourceHandle === handleId
    );
    if (exactEdge) return exactEdge.target;

    // Priority 2: for scenes with choices, match generic edges by choice index
    const srcNode = freshProj.nodes.find((n) => n.id === sourceId);
    if (srcNode && srcNode.type === 'scene') {
      const choices = ((srcNode.data as any).choices as { id: string }[]) || [];
      const choiceIndex = choices.findIndex((c) => c.id === handleId);
      if (choiceIndex >= 0) {
        // Find generic edges (no sourceHandle or 'default') from this source
        const genericEdges = freshProj.edges.filter(
          (e) =>
            e.source === sourceId &&
            (!e.sourceHandle || e.sourceHandle === 'default')
        );
        if (choiceIndex < genericEdges.length) {
          return genericEdges[choiceIndex].target;
        }
        // If only one generic edge, any choice can use it
        if (genericEdges.length === 1) {
          return genericEdges[0].target;
        }
      }
    }

    // Priority 3: any outgoing edge from this source (last resort)
    const anyEdge = freshProj.edges.find(
      (e) => e.source === sourceId && (!e.sourceHandle || e.sourceHandle === 'default')
    );
    if (anyEdge) return anyEdge.target;

    return null;
  };

  /**
   * Handle choice selection
   */
  const handleChoice = (choiceId: string) => {
    if (!project || !currentScene) return;
    setDialogEditing(false);

    console.log('[AdventureEngine] Choice selected:', choiceId);
    makeChoice(choiceId);

    // Always use the freshest project data (player store's may be stale after OW generation)
    const freshProject = useProjectStore.getState().currentProject || project;

    // In open world mode: if the choice has no connected node, auto-generate
    if (openWorldMode) {
      const nextNodeId = findNextNode(freshProject, currentScene.nodeId, choiceId);
      if (nextNodeId) {
        lastProcessedNodeRef.current = nextNodeId;
        setCurrentNodeId(nextNodeId);
        processNode(freshProject, nextNodeId);
      } else {
        // No connected node — use the choice label as the player's action.
        // Store the existing choice ID so handleAdvanceToOwScene uses it
        // as the sourceHandle instead of creating a duplicate choice.
        const choice = currentScene.choices.find((c) => c.id === choiceId);
        const actionText = choice?.label || 'Continue the story';
        owExistingChoiceRef.current = choiceId;
        console.log('[AdventureEngine] OW: auto-generating from choice:', actionText);
        handleOpenWorldAction(actionText);
      }
      return;
    }

    // Normal mode: find and process next node
    const nextNodeId = findNextNode(freshProject, currentScene.nodeId, choiceId);
    if (nextNodeId) {
      lastProcessedNodeRef.current = nextNodeId;
      setCurrentNodeId(nextNodeId);
      processNode(freshProject, nextNodeId);
    } else {
      console.log('[AdventureEngine] No next node, game may be ending');
    }
  };

  /**
   * Handle text typing complete
   */
  const handleTypingComplete = () => {
    setTyping(false);
  };

  /**
   * Dialog box drag handlers — allow horizontal repositioning
   */
  const handleDialogDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dialogDragRef.current = { startX: e.clientX, startOffset: dialogOffsetX };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dialogDragRef.current) return;
      const delta = ev.clientX - dialogDragRef.current.startX;
      setDialogOffsetX(dialogDragRef.current.startOffset + delta);
    };
    const cleanup = () => {
      dialogDragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      // Remove this cleanup from the active list
      activeDragCleanupRef.current = activeDragCleanupRef.current.filter(fn => fn !== cleanup);
      // DIAGNOSTIC: Track listener removals
      listenerCountRef.current.removed += 2;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
    // Register cleanup so unmount can remove listeners if mid-drag
    activeDragCleanupRef.current.push(cleanup);
    // DIAGNOSTIC: Track listener additions
    listenerCountRef.current.added += 2;
  };

  /**
   * Dialog box resize handler — drag right edge to change width
   */
  const handleDialogResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dialogResizeRef.current = { startX: e.clientX, startWidth: dialogWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dialogResizeRef.current) return;
      const delta = (ev.clientX - dialogResizeRef.current.startX) * 2; // *2 because centered
      const newWidth = Math.max(600, Math.min(2400, dialogResizeRef.current.startWidth + delta));
      setDialogWidth(newWidth);
    };
    const cleanup = () => {
      dialogResizeRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      activeDragCleanupRef.current = activeDragCleanupRef.current.filter(fn => fn !== cleanup);
      // DIAGNOSTIC: Track listener removals
      listenerCountRef.current.removed += 2;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
    activeDragCleanupRef.current.push(cleanup);
    // DIAGNOSTIC: Track listener additions
    listenerCountRef.current.added += 2;
  };

  /**
   * Dialog box height resize — drag up to increase, down to decrease
   */
  const handleDialogHeightStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dialogHeightRef.current = { startY: e.clientY, startHeight: dialogMaxHeight };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dialogHeightRef.current) return;
      const delta = dialogHeightRef.current.startY - ev.clientY;
      const newHeight = Math.max(150, Math.min(window.innerHeight * 0.85, dialogHeightRef.current.startHeight + delta));
      setDialogMaxHeight(Math.round(newHeight));
    };
    const cleanup = () => {
      dialogHeightRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      activeDragCleanupRef.current = activeDragCleanupRef.current.filter(fn => fn !== cleanup);
      // DIAGNOSTIC: Track listener removals
      listenerCountRef.current.removed += 2;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
    activeDragCleanupRef.current.push(cleanup);
    // DIAGNOSTIC: Track listener additions
    listenerCountRef.current.added += 2;
  };

  // Cleanup any active drag listeners on unmount — prevents listener leaks
  // when the component unmounts while the user is mid-drag.
  useEffect(() => {
    return () => {
      for (const cleanup of activeDragCleanupRef.current) {
        cleanup();
      }
      activeDragCleanupRef.current = [];
    };
  }, []);

  /**
   * Handle inline text edits from the dialog box.
   * Updates both the player store's current scene and the persisted project node
   * so edits survive navigation and feed into the AI context.
   */
  const handleSceneTextEdit = useCallback((newText: string) => {
    if (!currentScene) return;
    // Update player store scene (immediate display)
    setCurrentScene({ ...currentScene, storyText: newText });
    // Persist to project node so it's saved to DB and included in AI context
    const projStore = useProjectStore.getState();
    const node = projStore.currentProject?.nodes.find(n => n.id === currentScene.nodeId);
    if (node) {
      projStore.updateNode(currentScene.nodeId, {
        data: { ...node.data, storyText: newText },
      } as any);
    }
  }, [currentScene, setCurrentScene]);

  /**
   * PERSIST OW SCENE NODE
   * Creates a real scene node + edge in the project store immediately when
   * the AI result arrives. This ensures the node exists BEFORE the "Continue
   * to Next Scene" button appears, so clicking the button just transitions
   * to a node that is already saved.
   *
   * @param result - The AI-generated scene result
   * @param sourceNodeId - The node the player was on when they initiated the action
   * @returns { nodeId, sourceChoiceId } or null on failure
   */
  const persistOwSceneNode = (result: OpenWorldResult, sourceNodeId: string): { nodeId: string; sourceChoiceId: string } | null => {
    console.log('[AdventureEngine] persistOwSceneNode called, sourceNodeId:', sourceNodeId);
    // Suppress undo history during batch node+edge creation to avoid
    // multiple redundant snapshots (each addNode/updateNode/addEdge triggers one).
    const unsuppress = suppressHistoryRecording();
    try {
      const projStore = useProjectStore.getState();
      let proj = projStore.currentProject;
      console.log('[AdventureEngine] persistOwSceneNode: projStore has project?', !!proj, proj ? `(${proj.nodes.length} nodes)` : '');

      // If the project store doesn't have the project (e.g. OW mode toggled
      // inside play mode without the URL param), use the player store's copy
      // and set it directly (by reference) into the project store.
      // IMPORTANT: Do NOT deep clone (JSON.parse/stringify) — that duplicates
      // all multi-MB base64 assets and can trigger OOM.
      if (!proj) {
        const playerProj = usePlayerStore.getState().project;
        console.log('[AdventureEngine] persistOwSceneNode: player store has project?', !!playerProj);
        if (playerProj) {
          console.warn('[AdventureEngine] persistOwSceneNode: project store empty, syncing from player store');
          useProjectStore.setState((state) => {
            state.currentProject = playerProj;
            state.isDirty = true;
          });
          proj = useProjectStore.getState().currentProject;
          console.log('[AdventureEngine] persistOwSceneNode: after sync, proj?', !!proj);
        }
      }

      if (!proj) {
        const msg = 'No project in either store!';
        console.error('[AdventureEngine] persistOwSceneNode:', msg);
        return null;
      }

      const newNodeId = generateId('node');

      // Build SceneChoice objects with stable IDs
      const sceneChoices = (result.choices || []).map((label, i) => ({
        id: `choice_${newNodeId}_${i}`,
        label,
      }));

      // Position the new node to the right of the current one
      const currentNode = proj.nodes.find((n) => n.id === sourceNodeId);
      const baseX = currentNode?.position?.x ?? 400;
      const baseY = currentNode?.position?.y ?? 300;

      // ── Build entity link fields from presentEntityIds and entityLinks ──
      const linkedCharacters: string[] = [];
      const linkedLocations: string[] = [];
      const linkedObjects: string[] = [];
      const linkedConcepts: string[] = [];

      const allEntityLinks = new Set([
        ...(result.presentEntityIds || []),
        ...(result.entityLinks || []),
      ]);

      if (allEntityLinks.size > 0) {
        const entities = proj.entities || [];
        for (const eid of allEntityLinks) {
          const entity = entities.find((e) => e.id === eid);
          if (!entity) continue;
          switch (entity.category) {
            case 'character': linkedCharacters.push(eid); break;
            case 'location': linkedLocations.push(eid); break;
            case 'object': linkedObjects.push(eid); break;
            case 'concept': linkedConcepts.push(eid); break;
          }
        }
      }

      const newNode: StoryNode = {
        id: newNodeId,
        type: 'scene',
        position: { x: baseX + 350, y: baseY + Math.random() * 100 - 50 },
        label: result.speakerName !== 'Narrator'
          ? `${result.speakerName}: ${result.sceneText.slice(0, 30)}...`
          : result.sceneText.slice(0, 40) + '...',
        data: {
          storyText: result.sceneText,
          speakerName: result.speakerName || undefined,
          backgroundImage: result.imageDataUrl || undefined,
          backgroundMusic: result.musicDataUrl || undefined,
          summary: result.sceneSummary || undefined,
          choices: sceneChoices,
          musicKeepPlaying: true,
          voiceoverAutoplay: true,
          linkedCharacters,
          linkedLocations,
          linkedObjects,
          linkedConcepts,
          aiResponse: result.rawAiResponse || undefined,
          playerAction: result.playerAction || undefined,
          // NOTE: constructedContext and constructedSystemPrompt are NOT stored
          // on the node anymore. They are kept in the transient owContextStore
          // (capped at 5 entries) to prevent O(N²) memory growth. The debug
          // viewer reads from owContextStore instead.
        },
      };

      // ── Determine connection source choice ─────────────────────────
      const currentNodeData = currentNode?.data as SceneNode['data'] | undefined;
      let sourceChoiceId: string;

      if (owExistingChoiceRef.current) {
        // Case (a): player clicked an existing choice
        sourceChoiceId = owExistingChoiceRef.current;
      } else {
        // Case (b/c): player typed custom text
        // Deep-clone each choice object — the originals are frozen by Immer
        // and cannot be mutated (would throw "Cannot assign to read only property").
        const currentChoices = (currentNodeData?.choices || []).map(c => ({ ...c }));
        const customActionLabel = owCustomActionRef.current || 'Continue...';

        const unconnectedChoice = currentChoices.find((choice) => {
          return !proj.edges.some(
            (e) => e.source === sourceNodeId && e.sourceHandle === choice.id
          );
        });

        if (unconnectedChoice) {
          sourceChoiceId = unconnectedChoice.id;
          unconnectedChoice.label = customActionLabel;
        } else if (currentChoices.length > 0) {
          const lastChoice = currentChoices[currentChoices.length - 1];
          sourceChoiceId = lastChoice.id;
          lastChoice.label = customActionLabel;

          // Remove the old edge from this choice so we can reconnect it
          const oldEdge = proj.edges.find(
            (e) => e.source === sourceNodeId && e.sourceHandle === sourceChoiceId
          );
          if (oldEdge) {
            projStore.deleteEdge(oldEdge.id);
          }
        } else {
          sourceChoiceId = generateId('choice');
          currentChoices.push({ id: sourceChoiceId, label: customActionLabel });
        }

        // Persist the updated choices on the source node
        if (currentNode) {
          projStore.updateNode(sourceNodeId, {
            data: { ...(currentNodeData as any), choices: currentChoices },
          } as any);
        }
      }

      const newEdge: StoryEdge = {
        id: generateId('edge'),
        source: sourceNodeId,
        sourceHandle: sourceChoiceId,
        target: newNodeId,
        targetHandle: 'input',
      };

      // Add the new node and edge to the project store
      projStore.addNode(newNode);
      projStore.addEdge(newEdge);

      // Store context strings in transient store (NOT on the node) to prevent
      // O(N²) memory growth. Only the most recent 5 entries are kept.
      setOwContext(newNodeId, {
        rawAiResponse: result.rawAiResponse,
        constructedContext: result.constructedContext,
        constructedSystemPrompt: result.constructedSystemPrompt,
      });

      // Clear the action refs now that the node is persisted
      owCustomActionRef.current = null;
      owExistingChoiceRef.current = null;

      console.log(`[AdventureEngine] OW scene node persisted: ${newNodeId}, edge from ${sourceNodeId} via ${sourceChoiceId}`);
      logHeap('After persistOwSceneNode');
      unsuppress();
      return { nodeId: newNodeId, sourceChoiceId };
    } catch (err: any) {
      console.error('[AdventureEngine] persistOwSceneNode failed:', err?.message || err, err?.stack);
      unsuppress();
      return null;
    }
  };

  /**
   * Handle open world free-form action.
   * Sends the player's text to the AI, which generates a new scene continuation.
   */
  const handleOpenWorldAction = (userAction: string, attachedImages?: Array<{ base64: string; label: string }>) => {
    if (!project || !session) return;

    setOwGenerating(true);
    setOwStatuses([]);
    setOwStreamText('');
    setOwPendingResult(null);
    owPendingNodeRef.current = null;

    // Store user-uploaded images for this action (used in assignUploadedImages handling)
    owUserImagesRef.current = attachedImages;

    // Store the custom action text so persistOwSceneNode can create
    // a dedicated choice output on the current scene node for it.
    // Reset owExistingChoiceRef — handleChoice sets it BEFORE calling us,
    // but direct text input from OpenWorldInput should NOT reuse any old ref.
    owCustomActionRef.current = userAction;

    // Pass the current scene's image so the AI can decide to reuse it
    const currentImage = currentScene?.backgroundImage || undefined;

    // Capture the current node ID NOW so the async callbacks
    // reference the correct node — not whatever scene the player is on later.
    const sourceNodeId = session.currentNodeId;

    // IMPORTANT: Use the FRESH project from the project store, not the player store's
    // stale snapshot. OW scene nodes/edges are added to useProjectStore, so the player
    // store's copy is missing them. This caused the context builder's BFS to fail,
    // dropping from N scenes to 2 when the graph path couldn't be found.
    const freshProject = useProjectStore.getState().currentProject || project;

    const abort = generateOpenWorldScene(
      freshProject,
      session,
      userAction,
      // onStatus
      (status) => {
        setOwStatuses((prev) => [...prev, status]);
      },
      // onTextDelta — show streaming text
      (text) => {
        setOwStreamText((prev) => prev + text);
      },
      // onComplete — text is ready.
      // Create the scene node + edge IMMEDIATELY so it exists before the button.
      // TTS and display transition wait for user click.
      (result) => {
        setOwGenerating(false);

        // ── Stop any TTS/voiceover for the CURRENT scene ──
        // When the OW result arrives, the old scene's TTS shouldn't replay.
        stopTTS();
        const audioState = audioStateRef.current;
        if (audioState.voiceover) {
          audioState.voiceover.stop();
          audioState.voiceover.unload();
          audioState.voiceover = null;
        }

        // ── Create the node and edge NOW, before showing the button ──
        const nodeInfo = persistOwSceneNode(result, sourceNodeId);
        owPendingNodeRef.current = nodeInfo;

        // Store the result for display when user clicks "Continue"
        setOwPendingResult(result);

        // --- Extract side panel data from OW result (curiosity facts + mind states) ---
        // TODO: These fields (curiosityFacts, characterMindStates) are added by the
        // other agent's schema/prompt changes. Use `any` assertion until types are updated.
        if ((result as any).curiosityFacts) {
          setCuriosityFacts((result as any).curiosityFacts);
        }
        if ((result as any).characterMindStates) {
          setCharacterMindStates((result as any).characterMindStates);
        }

        // Apply variable changes immediately (these are game state changes, not display)
        if (result.variableChanges) {
          for (const [name, value] of Object.entries(result.variableChanges)) {
            updateVariable(name, value);
          }
        }

        if (nodeInfo) {
          console.log(`[AdventureEngine] OW scene ready — node ${nodeInfo.nodeId} pre-created, waiting for user click`);
        } else {
          console.error('[AdventureEngine] OW scene ready but node creation FAILED');
        }
      },
      // onError
      (errorMsg) => {
        setOwGenerating(false);
        console.error('[OpenWorld] Error:', errorMsg);
      },
      // onImageReady — image arrives in background after scene is already ready.
      (imageDataUrl) => {
        console.log('[AdventureEngine] OW background image ready');
        const unsuppressImg = suppressHistoryRecording();
        // Update the pending result
        setOwPendingResult((prev) =>
          prev ? { ...prev, imageDataUrl } : null
        );

        // Update the pre-created node if it exists and doesn't have an image yet
        const pendingNodeId = owPendingNodeRef.current?.nodeId;
        if (pendingNodeId) {
          const ps = useProjectStore.getState();
          const node = ps.currentProject?.nodes.find((n) => n.id === pendingNodeId);
          if (node && node.type === 'scene') {
            const sd = node.data as SceneNode['data'];
            if (!sd.backgroundImage) {
              ps.updateNode(pendingNodeId, {
                data: { ...sd, backgroundImage: imageDataUrl },
              } as Partial<SceneNode>);
            }
          }
        }

        // If the user already advanced and the new scene has no image, update it.
        const cur = usePlayerStore.getState().currentScene;
        if (cur && !cur.backgroundImage) {
          setCurrentScene({ ...cur, backgroundImage: getBlobUrl(imageDataUrl) });
          const ps2 = useProjectStore.getState();
          const node2 = ps2.currentProject?.nodes.find((n) => n.id === cur.nodeId);
          if (node2 && node2.type === 'scene') {
            const sd2 = node2.data as SceneNode['data'];
            if (!sd2.backgroundImage) {
              ps2.updateNode(cur.nodeId, {
                data: { ...sd2, backgroundImage: imageDataUrl },
              } as Partial<SceneNode>);
            }
          }
        }
        unsuppressImg();
      },
      // onMusicReady — music found from BM25 search, assign to current/pending scene
      (musicDataUrl, musicMeta) => {
        console.log(`[AdventureEngine] OW music ready: "${musicMeta.title}"`);
        const unsuppressMusic = suppressHistoryRecording();
        // Update the pending result with music
        setOwPendingResult((prev) =>
          prev ? { ...prev, musicDataUrl, musicMetadata: musicMeta } : null
        );

        // Update the pre-created node if it exists
        const pendingNodeId = owPendingNodeRef.current?.nodeId;
        if (pendingNodeId) {
          const ps = useProjectStore.getState();
          const node = ps.currentProject?.nodes.find((n) => n.id === pendingNodeId);
          if (node && node.type === 'scene') {
            const sd = node.data as Record<string, unknown>;
            if (!sd.backgroundMusic) {
              ps.updateNode(pendingNodeId, {
                data: { ...sd, backgroundMusic: musicDataUrl, musicKeepPlaying: true, musicMetadata: musicMeta },
              } as any);
            }
          }
        }

        // If the user already advanced, set music on the live scene
        const cur = usePlayerStore.getState().currentScene;
        if (cur && !cur.backgroundMusic) {
          setCurrentScene({ ...cur, backgroundMusic: getBlobUrl(musicDataUrl), musicKeepPlaying: true });
          const ps2 = useProjectStore.getState();
          const node2 = ps2.currentProject?.nodes.find((n) => n.id === cur.nodeId);
          if (node2 && node2.type === 'scene') {
            const sd2 = node2.data as Record<string, unknown>;
            if (!sd2.backgroundMusic) {
              ps2.updateNode(cur.nodeId, {
                data: { ...sd2, backgroundMusic: musicDataUrl, musicKeepPlaying: true, musicMetadata: musicMeta },
              } as any);
            }
          }
        }
        unsuppressMusic();
      },
      currentImage,
      // onEntityImageReady — called when a missing entity reference image is generated
      // during the pre-scene-image phase. Updates the entity in the project store so
      // the reference image is persisted and available for future scene generations.
      (entityId, imageDataUrl) => {
        console.log(`[AdventureEngine] Entity reference image ready: ${entityId}`);
        const unsuppressEntity = suppressHistoryRecording();
        useProjectStore.getState().updateEntity(entityId, { referenceImage: imageDataUrl });
        unsuppressEntity();
      },
      // userUploadedImages — images the player attached to their action input.
      // Passed through to the AI so it can see them and optionally assign them
      // to entities via assignUploadedImages.
      attachedImages
    );

    owAbortRef.current = abort;
  };

  // Ref to prevent double-click on "Continue to Next Scene"
  const owAdvancingRef = useRef(false);

  /**
   * Advance to the pre-created open-world scene.
   *
   * The scene node + edge were already created in onComplete (via persistOwSceneNode).
   * This handler just transitions the player to the existing node and starts
   * deferred work (entity creation, image gen, TTS).
   *
   * By separating creation (onComplete) from transition (button click), we
   * ensure the node always exists in the project even if this handler somehow fails.
   */
  const handleAdvanceToOwScene = () => {
    console.log('[AdventureEngine] handleAdvanceToOwScene CALLED');
    const nodeInfo = owPendingNodeRef.current;
    const result = owPendingResult;

    if (!result || !session) {
      console.warn('[AdventureEngine] handleAdvanceToOwScene: no result or session', { hasResult: !!result, hasSession: !!session });
      return;
    }

    // If the node wasn't pre-created (persistOwSceneNode failed), try creating it now
    // as a last resort.
    let newNodeId: string;
    let sourceChoiceId: string;

    if (nodeInfo) {
      newNodeId = nodeInfo.nodeId;
      sourceChoiceId = nodeInfo.sourceChoiceId;
      console.log('[AdventureEngine] Using pre-created node:', newNodeId);
    } else {
      console.warn('[AdventureEngine] handleAdvanceToOwScene: node was not pre-created, creating now as fallback');
      const fallbackInfo = persistOwSceneNode(result, session.currentNodeId);
      if (!fallbackInfo) {
        console.error('[AdventureEngine] handleAdvanceToOwScene: fallback node creation also failed!');
        return;
      }
      newNodeId = fallbackInfo.nodeId;
      sourceChoiceId = fallbackInfo.sourceChoiceId;
    }

    // Prevent double-click
    if (owAdvancingRef.current) {
      console.warn('[AdventureEngine] handleAdvanceToOwScene: blocked by owAdvancingRef');
      return;
    }
    owAdvancingRef.current = true;
    setDialogEditing(false);

    try {
      // ── Transition to the pre-created node ─────────────────────────
      // Update lastProcessedNodeRef BEFORE setCurrentNodeId so the
      // processNode useEffect doesn't redundantly re-process this node.
      lastProcessedNodeRef.current = newNodeId;
      makeChoice(sourceChoiceId);
      setCurrentNodeId(newNodeId);

      // Read the latest node data from the project store (may have been
      // updated by onImageReady / onMusicReady since creation).
      const freshProj = useProjectStore.getState().currentProject;
      const nodeData = freshProj?.nodes.find((n) => n.id === newNodeId)?.data as any;
      const sceneChoices = nodeData?.choices || [];

      // Build display data
      const displayChoices: PlayerChoice[] = sceneChoices.map((c: any) => ({
        id: c.id,
        label: c.label,
        isAvailable: true,
        isLocked: false,
      }));

      setCurrentScene({
        nodeId: newNodeId,
        speakerName: result.speakerName,
        storyText: result.sceneText,
        backgroundImage: getBlobUrl(nodeData?.backgroundImage || result.imageDataUrl),
        backgroundMusic: getBlobUrl(nodeData?.backgroundMusic || result.musicDataUrl),
        choices: displayChoices,
        musicKeepPlaying: true,
        voiceoverAutoplay: false,
      });

      // Clear pending state
      setOwPendingResult(null);
      setOwStreamText('');
      setOwStatuses([]);
      owPendingNodeRef.current = null;

      console.log(`[AdventureEngine] OW scene transition complete: ${newNodeId}`);
      logHeap('After OW scene transition');
    } catch (err: any) {
      console.error('[AdventureEngine] Error in handleAdvanceToOwScene:', err?.message || err, err?.stack);
      owAdvancingRef.current = false;
      return;
    }

    // ── Deferred heavy work ──────────────────────────────────────
    // Everything below runs asynchronously after the UI has updated,
    // so the scene transition feels instant.
    // Suppress history for all these batch updates to avoid memory bloat.
    setTimeout(async () => {
      const unsuppressDeferred = suppressHistoryRecording();
      try {
        const freshStore = useProjectStore.getState();
        const freshProject = freshStore.currentProject;
        if (!freshProject) { unsuppressDeferred(); return; }

        // --- Music metadata on node ---
        if (result.musicMetadata) {
          freshStore.updateNode(newNodeId, {
            data: {
              ...(freshProject.nodes.find(n => n.id === newNodeId)?.data as any),
              musicTrackId: result.musicMetadata.row_id,
              musicTrackTitle: result.musicMetadata.title,
            },
          } as any);
        }

        // --- Entity state updates (stateNote + profilePatch + stateChanges) ---
        if (result.entityUpdates) {
          for (const [entityId, upd] of Object.entries(result.entityUpdates)) {
            if (upd.stateNote) {
              freshStore.updateEntityState(newNodeId, entityId, upd.stateNote);
            }

            const entity = (freshProject.entities || []).find(e => e.id === entityId);
            if (!entity) continue;

            const updatePayload: any = {};

            if (upd.profilePatch && Object.keys(upd.profilePatch).length > 0) {
              updatePayload.profile = { ...(entity.profile || {}), ...upd.profilePatch };
            }

            if (upd.stateChanges && Array.isArray(upd.stateChanges) && upd.stateChanges.length > 0) {
              const currentHistory = entity.stateHistory || [];
              // Build a scene label from the new node's label (or construct one)
              const newNodeObj = freshProject.nodes.find(n => n.id === newNodeId);
              const sceneLabel = newNodeObj?.label || result.sceneText.slice(0, 40) + '...';
              updatePayload.stateHistory = [
                ...currentHistory,
                {
                  sceneId: newNodeId,
                  sceneLabel,
                  sceneSummary: result.sceneSummary || result.sceneText.slice(0, 150),
                  timestamp: Date.now(),
                  playerAction: result.playerAction || undefined,
                  stateChanges: upd.stateChanges,
                }
              ];
            }

            if (Object.keys(updatePayload).length > 0) {
              freshStore.updateEntity(entityId, updatePayload);
            }
          }
          console.log(`[AdventureEngine] Applied ${Object.keys(result.entityUpdates).length} entity updates`);
        }

        // --- Assign user-uploaded images to entities (Feature 4) ---
        // When the AI's response includes assignUploadedImages, map user-uploaded
        // images as entity reference images. The AI tells us which entity ID should
        // receive which uploaded image (by 0-based index).
        if (result.assignUploadedImages && owUserImagesRef.current && owUserImagesRef.current.length > 0) {
          const uploadedImgs = owUserImagesRef.current;
          for (const [entityId, imageIndex] of Object.entries(result.assignUploadedImages)) {
            if (typeof imageIndex === 'number' && imageIndex >= 0 && imageIndex < uploadedImgs.length) {
              const imgBase64 = uploadedImgs[imageIndex].base64;
              console.log(`[AdventureEngine] Assigning uploaded image #${imageIndex} ("${uploadedImgs[imageIndex].label}") to entity ${entityId}`);
              freshStore.updateEntity(entityId, { referenceImage: imgBase64 });
            } else {
              console.warn(`[AdventureEngine] assignUploadedImages: invalid index ${imageIndex} for entity ${entityId} (${uploadedImgs.length} images available)`);
            }
          }
          console.log(`[AdventureEngine] Assigned ${Object.keys(result.assignUploadedImages).length} uploaded images to entities`);
        }
        // Clear user images ref after processing
        owUserImagesRef.current = undefined;

        // --- Create new entities ---
        const newEntityIdMap: Record<string, string> = {}; // temp index → real ID
        if (result.newEntities && result.newEntities.length > 0) {
          for (const ne of result.newEntities) {
            const entityId = generateId('entity');
            const validCategory = ['character', 'location', 'object', 'concept'].includes(ne.category)
              ? ne.category as Entity['category']
              : 'object';
            freshStore.addEntity({
              id: entityId,
              category: validCategory,
              name: ne.name,
              description: ne.description || '',
              summary: ne.summary || '',
              profile: ne.profile || {},
            } as Entity);
            newEntityIdMap[ne.name] = entityId;
            // Auto-link to the new scene
            const cat = validCategory;
            const nd = freshStore.currentProject?.nodes.find(n => n.id === newNodeId)?.data as any;
            if (nd) {
              const linkField = cat === 'character' ? 'linkedCharacters'
                : cat === 'location' ? 'linkedLocations'
                : cat === 'object' ? 'linkedObjects'
                : 'linkedConcepts';
              const existing: string[] = nd[linkField] || [];
              if (!existing.includes(entityId)) {
                freshStore.updateNode(newNodeId, {
                  data: { ...nd, [linkField]: [...existing, entityId] },
                } as any);
              }
            }
            console.log(`[AdventureEngine] Created new entity: ${ne.name} (${entityId})`);
          }
        }

        // --- Remove entities ---
        if (result.removeEntities && result.removeEntities.length > 0) {
          for (const eid of result.removeEntities) {
            const exists = (freshStore.currentProject?.entities || []).find(e => e.id === eid);
            if (exists) {
              freshStore.deleteEntity(eid);
              console.log(`[AdventureEngine] Removed entity: ${eid}`);
            }
          }
        }

        // --- Create new variables ---
        if (result.newVariables && result.newVariables.length > 0) {
          for (const nv of result.newVariables) {
            const typeMap: Record<string, string> = { number: 'integer', int: 'integer', float: 'float', bool: 'boolean' };
            const mappedType = typeMap[nv.type] || nv.type;
            const validType = ['string', 'integer', 'float', 'boolean', 'collection'].includes(mappedType)
              ? mappedType as 'string' | 'integer' | 'float' | 'boolean' | 'collection'
              : 'string';
            const defaultVal = nv.defaultValue ?? (validType === 'integer' || validType === 'float' ? 0 : validType === 'boolean' ? false : '');
            freshStore.addVariable({
              id: generateId('var'),
              name: nv.name,
              type: validType,
              defaultValue: defaultVal,
              showInHUD: false,
              description: nv.description || '',
            } as any);
            console.log(`[AdventureEngine] Created new variable: ${nv.name}`);
          }
        }

        // --- Generate entity reference images ---
        // When new entities are introduced (or existing ones lack a reference image),
        // generate a 512x512 portrait using the scene's background image as a style
        // and context reference. This ensures the portrait matches the art style and
        // captures the entity as it appeared when first introduced. The scene image
        // is converted from blob URL back to base64 for the Gemini API's multimodal
        // input (referenceImages array). For non-Gemini providers, only text prompts
        // are used since they don't support reference images.
        const imageGenPromises: Promise<void>[] = [];
        const settings = useImageGenStore.getState();
        const hasImageKey = settings.provider === 'gemini' ? !!settings.googleApiKey : !!settings.apiKey;

        if (hasImageKey) {
          // Retrieve the scene background image as base64 for use as a reference.
          // This allows the image gen API to match the art style and visual context
          // of the scene where the entity was introduced.
          let sceneImageBase64: string | null = null;
          const sceneBackgroundUrl = usePlayerStore.getState().currentScene?.backgroundImage;
          if (sceneBackgroundUrl && settings.provider === 'gemini') {
            try {
              if (sceneBackgroundUrl.startsWith('data:')) {
                sceneImageBase64 = sceneBackgroundUrl;
              } else if (sceneBackgroundUrl.startsWith('blob:')) {
                sceneImageBase64 = await blobUrlToBase64(sceneBackgroundUrl);
              }
            } catch (err) {
              console.warn('[AdventureEngine] Could not get scene image as base64 for entity ref:', err);
            }
          }

          /**
           * Generate a reference image for a single entity.
           *
           * Uses the scene's background image as a style/context reference (Gemini only)
           * so the portrait matches the scene's art style and visual context. The prompt
           * explicitly describes which entity to focus on, ensuring the correct subject
           * is isolated from potentially multi-character scenes.
           */
          const genEntityImage = async (entityId: string, prompt: string) => {
            try {
              const styleTag = settings.defaultImageStyle?.trim();
              const fullPrompt = styleTag ? `${prompt}. Style: ${styleTag}` : prompt;

              // Build reference images array: include scene background if available
              // so the portrait matches the art style and visual context of the scene
              const referenceImages: string[] = [];
              if (sceneImageBase64) {
                referenceImages.push(sceneImageBase64);
              }

              const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: fullPrompt,
                  width: 512,
                  height: 512,
                  provider: settings.provider,
                  apiKey: settings.apiKey,
                  model: settings.model,
                  endpoint: settings.endpoint,
                  googleApiKey: settings.googleApiKey,
                  geminiImageModel: settings.geminiImageModel,
                  referenceImages,
                }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.imageUrl) {
                  useProjectStore.getState().updateEntity(entityId, { referenceImage: data.imageUrl });
                  console.log(`[AdventureEngine] Generated ref image for entity ${entityId} (with ${referenceImages.length} reference images)`);
                }
              }
            } catch (err) {
              console.warn(`[AdventureEngine] Failed to generate entity image for ${entityId}:`, err);
            }
          };

          // Process AI-requested entity images (from generateEntityImages field)
          if (result.generateEntityImages) {
            for (const [eid, prompt] of Object.entries(result.generateEntityImages)) {
              const realId = newEntityIdMap[eid] || eid;
              imageGenPromises.push(genEntityImage(realId, prompt));
            }
          }

          // Auto-generate for linked entities that lack reference images.
          // Covers characters, locations, objects, and concepts.
          const latestProj = useProjectStore.getState().currentProject;
          if (latestProj) {
            const sceneNode = latestProj.nodes.find(n => n.id === newNodeId);
            const sceneData = sceneNode?.data as any;
            if (sceneData) {
              const allLinked = [
                ...(sceneData.linkedCharacters || []),
                ...(sceneData.linkedLocations || []),
                ...(sceneData.linkedObjects || []),
                ...(sceneData.linkedConcepts || []),
              ];
              for (const eid of allLinked) {
                // Skip if already handled by generateEntityImages
                if (result.generateEntityImages && (eid in result.generateEntityImages)) continue;
                if (newEntityIdMap && Object.values(newEntityIdMap).includes(eid) &&
                    result.generateEntityImages && Object.keys(result.generateEntityImages).some(k => newEntityIdMap[k] === eid)) continue;

                const entity = (latestProj.entities || []).find(e => e.id === eid);
                if (entity && !entity.referenceImage) {
                  const profile = entity.profile || {};
                  const appearance = [
                    profile.appearance, profile.hair, profile.build, profile.clothing,
                    profile.age, profile.race, profile.species,
                  ].filter(Boolean).join(', ');

                  // Build a category-specific prompt that describes what to generate
                  let portraitPrompt: string;
                  if (entity.category === 'character') {
                    portraitPrompt = `Portrait of ${entity.name}. ${appearance || entity.description}. Detailed character portrait, centered composition, 512x512 pixels. Focus on this specific character — isolate them from the scene.`;
                  } else if (entity.category === 'location') {
                    portraitPrompt = `${entity.name}. ${entity.description}. Establishing shot, detailed environment, wide angle, 512x512 pixels.`;
                  } else if (entity.category === 'object') {
                    portraitPrompt = `${entity.name}. ${entity.description}. Detailed close-up of this object, centered composition, 512x512 pixels.`;
                  } else {
                    portraitPrompt = `Visual representation of "${entity.name}". ${entity.description}. Abstract or symbolic illustration, 512x512 pixels.`;
                  }
                  imageGenPromises.push(genEntityImage(eid, portraitPrompt));
                }
              }
            }
          }

          if (imageGenPromises.length > 0) {
            Promise.all(imageGenPromises).then(() => {
              console.log(`[AdventureEngine] All ${imageGenPromises.length} entity images generated`);
            }).catch(err => {
              console.warn('[AdventureEngine] Some entity image generations failed:', err);
            });
          }
        }

        // --- Start TTS for the new scene ---
        if (result.generateVoiceover !== false) {
          startTTS(result.sceneText, newNodeId);
        }

      } catch (err) {
        console.error('[AdventureEngine] Error in deferred OW work:', err);
      } finally {
        unsuppressDeferred();
        owAdvancingRef.current = false;

        // After all deferred work is done, save the project to IndexedDB
        // and offload base64 assets from V8 heap to native blob storage.
        // This prevents OOM crashes from accumulating multi-MB base64 strings.
        try {
          logHeap('Before saveAndOffloadAssets');
          await useProjectStore.getState().saveAndOffloadAssets();
          logHeap('After saveAndOffloadAssets');

          // ── PERIODIC IN-PLAY BLOB EVICTION ──
          // Now that saveAndOffloadAssets() has persisted all base64 data to
          // IndexedDB, we can safely soft-evict old blobs from native memory.
          // evictBlobsExcept() only removes from our Maps (doesn't revoke URLs),
          // so fetch(blobUrl) in rehydrateForSave() can still recover them.
          // This prevents OOM in 30+ scene OW sessions by keeping only the
          // current scene + last few scenes + all entity assets in blob storage.
          const proj = useProjectStore.getState().currentProject;
          if (proj) {
            const retainSet = new Set<string>();
            // Keep ALL project scene blob URLs — revoking any blob URL that
            // is still referenced by a node causes permanent data loss on
            // next save (rehydrateForSave can't recover revoked URLs).
            for (const node of proj.nodes) {
              if (node.type !== 'scene') continue;
              const d = node.data as Record<string, unknown>;
              for (const f of ['backgroundImage', 'backgroundMusic', 'voiceoverAudio']) {
                const v = d[f];
                if (typeof v === 'string' && v.startsWith('blob:')) retainSet.add(v);
              }
            }
            // Keep ALL entity assets (needed for image generation reference)
            for (const entity of (proj.entities || [])) {
              for (const f of ['referenceImage', 'referenceVoice', 'defaultMusic'] as const) {
                const v = (entity as any)[f];
                if (typeof v === 'string' && v.startsWith('blob:')) retainSet.add(v);
              }
            }
            // Also keep current player scene assets (may not be in project nodes yet)
            const cs = usePlayerStore.getState().currentScene;
            if (cs?.backgroundImage?.startsWith('blob:')) retainSet.add(cs.backgroundImage);
            if (cs?.backgroundMusic?.startsWith('blob:')) retainSet.add(cs.backgroundMusic);
            if (cs?.voiceover?.startsWith('blob:')) retainSet.add(cs.voiceover);
            const evicted = evictBlobsExcept(retainSet);
            if (evicted > 0) {
              logHeap(`After in-play blob eviction (evicted ${evicted}, retained ${retainSet.size})`);
            }

            // B4 FIX: Hard-revoke blob URLs that were soft-evicted.
            // Now that saveAndOffloadAssets() has confirmed the data is in
            // IndexedDB, we can safely call URL.revokeObjectURL() to free
            // native memory. Without this, soft-evicted blob URLs accumulate
            // indefinitely (~2MB per scene × 50 scenes = 100MB+ leak).
            const revoked = revokeStaleEvictions(retainSet);
            if (revoked > 0) {
              logHeap(`After hard-revoking ${revoked} stale blob URLs`);
            }
          }
        } catch (err) {
          console.warn('[AdventureEngine] Asset offload after OW scene failed:', err);
        }
      }
    }, 0);
  };

  /**
   * Handle a player edit to a character's mind state field.
   * Updates the local state immediately and tracks the override in a ref
   * so it can be injected into the next OW scene's context. This allows
   * the player to "correct" the AI's interpretation of what a character
   * is feeling or thinking, and have that correction influence the story.
   */
  const handleMindStateChange = useCallback((entityId: string, field: string, value: string) => {
    setCharacterMindStates(prev => ({
      ...prev,
      [entityId]: { ...prev[entityId], [field]: value },
    }));
    // Track override for context injection into next OW scene
    if (!mindStateOverridesRef.current[entityId]) mindStateOverridesRef.current[entityId] = {};
    mindStateOverridesRef.current[entityId][field] = value;
  }, []);

  /**
   * Handle sending a message to "The Storyteller" AI chat.
   * Streams the response via SSE from the /api/storyteller-chat endpoint,
   * using the same writer API settings as the scene writer. The storyteller
   * has access to game context (current scene, entities, etc.) but acts as
   * a friendly narrator/DM persona rather than the scene writer.
   */
  const handleStorytellerSend = useCallback(async (text: string) => {
    const userMsg = { role: 'user' as const, content: text, timestamp: Date.now() };
    setStorytellerMessages(prev => [...prev, userMsg]);
    setStorytellerGenerating(true);
    setStorytellerStreamText('');

    // Get writer settings for API call — reuse the scene writer config
    const settings = useImageGenStore.getState();
    const writer = settings.writer;
    const apiKey = writer.provider === 'gemini' ? (writer.apiKey || settings.googleApiKey) : writer.apiKey;

    // Build FULL game context for the storyteller — same as the OW writer sees
    const project = useProjectStore.getState().currentProject;
    const playerSession = usePlayerStore.getState().session;
    if (!project || !playerSession) return;

    // Use the same context builder as the OW writer so the Storyteller
    // has complete knowledge of the story, characters, and game state.
    // Import dynamically to avoid circular deps.
    let gameContext = '';
    try {
      const { getGameContext } = await import('@/services/gameStateAPI.context');
      gameContext = getGameContext();
    } catch {
      // Fallback if import fails
      gameContext = `Project: ${project.info.title}\nScene: ${playerSession.currentNodeId}`;
    }

    // Use the dedicated Storyteller system prompt
    const { STORYTELLER_CHAT_SYSTEM_PROMPT } = await import('@/stores/useImageGenStore');
    const systemPrompt = STORYTELLER_CHAT_SYSTEM_PROMPT;

    // Call the storyteller chat endpoint via SSE streaming.
    // The endpoint may not exist yet — the other agent may need to create it.
    // For robustness, fall back gracefully if the endpoint doesn't exist.
    const controller = new AbortController();
    storytellerAbortRef.current = () => controller.abort();

    fetch('/api/storyteller-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        systemPrompt,
        provider: writer.provider,
        model: writer.model,
        apiKey,
        endpoint: writer.endpoint,
        gameContext,
      }),
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) {
        // If the endpoint doesn't exist yet, show a friendly error
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Storyteller API error (${res.status}): ${errText}`);
      }
      // Stream SSE response
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'text') {
              fullText += parsed.text;
              setStorytellerStreamText(fullText);
            }
          } catch {
            // Ignore non-JSON SSE lines
          }
        }
      }

      const assistantMsg = { role: 'assistant' as const, content: fullText, timestamp: Date.now() };
      setStorytellerMessages(prev => [...prev, assistantMsg]);
      setStorytellerGenerating(false);
      setStorytellerStreamText('');
    }).catch(err => {
      if (err.name === 'AbortError') {
        console.log('[Storyteller] Chat aborted by user');
      } else {
        console.error('[Storyteller] Chat error:', err);
        // Add an error message so the user knows what happened
        const errorMsg = {
          role: 'assistant' as const,
          content: `(The Storyteller is unavailable right now. Error: ${err.message || 'Unknown error'}. The /api/storyteller-chat endpoint may need to be created.)`,
          timestamp: Date.now(),
        };
        setStorytellerMessages(prev => [...prev, errorMsg]);
      }
      setStorytellerGenerating(false);
      setStorytellerStreamText('');
    });
  }, []);

  /**
   * Go back to the previous scene without leaving play mode.
   * Uses session.history (array of previously visited node IDs).
   */
  const handleGoBackScene = useCallback(() => {
    if (!session || !project || session.history.length === 0) return;

    // Cancel any in-progress generation
    if (owAbortRef.current) owAbortRef.current();
    setOwGenerating(false);
    setOwPendingResult(null);
    owPendingNodeRef.current = null;
    setOwStreamText('');
    setOwStatuses([]);
    stopTTS();

    // Pop the last node from history
    const prevNodeId = session.history[session.history.length - 1];
    const newHistory = session.history.slice(0, -1);

    // Update session history (remove the last entry)
    usePlayerStore.setState((state) => ({
      session: state.session ? { ...state.session, history: newHistory, currentNodeId: prevNodeId } : state.session,
    }));

    // Re-process the previous node to display it
    const latestProject = useProjectStore.getState().currentProject || project;
    processNode(latestProject, prevNodeId);

    console.log(`[AdventureEngine] Went back to scene: ${prevNodeId}`);
  }, [session, project, processNode, stopTTS]);

  // Clean up open world abort on unmount
  useEffect(() => {
    return () => {
      if (owAbortRef.current) owAbortRef.current();
    };
  }, []);

  // Get theme class
  const themeClass = project
    ? `theme-${project.info.theme}`
    : 'theme-modern';

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-600 border-t-white rounded-full animate-spin" />
          <p className="text-white">Loading adventure...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !project || !currentScene) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-4">
            {error || 'Unable to start game'}
          </h1>
          <button
            onClick={() => navigate(isCowriteMode ? '/cowrite' : '/game')}
            className="px-6 py-3 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen relative overflow-hidden ${themeClass}`}>
      {/* Background Image with crossfade */}
      <div className="absolute inset-0 z-0">
        {/* Previous image layer — shown during crossfade or when new image is loading */}
        {(prevImage || (!currentScene.backgroundImage && prevImageRef.current)) && (
          <img
            src={getBlobUrl(prevImage || prevImageRef.current)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* Current image layer — fades in over 1.5s */}
        {currentScene.backgroundImage ? (
          <img
            src={getBlobUrl(currentScene.backgroundImage)}
            alt="Scene background"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: imageOpacity,
              transition: 'opacity 2s ease-in-out',
            }}
          />
        ) : !prevImage ? (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 to-gray-800" />
        ) : null}
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
      </div>

      {/* HUD Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <HUD
          variables={session?.variables || {}}
          variableDefinitions={project?.globalVariables || []}
        />
      </div>

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
        {/* Back to Editor button */}
        <button
          onClick={async () => {
            try {
              if (owAbortRef.current) owAbortRef.current();
              await autosave();
              // Save project with any new OW-generated nodes to DB
              if (openWorldMode) {
                const projStore = useProjectStore.getState();
                if (projStore.currentProject) {
                  await projStore.saveProject();
                }
              }
            } catch (err) {
              console.error('[AdventureEngine] Error during exit save:', err);
            }
            // Tell editor to center on the scene we were last viewing
            if (session?.currentNodeId) {
              useEditorStore.getState().setFocusNodeId(session.currentNodeId);
            }
            setOpenWorldMode(false);
            navigate(isCowriteMode ? `/cowrite/edit/${projectId}` : `/edit/${projectId}`);
          }}
          className="p-2 rounded-lg bg-black/30 hover:bg-black/50 text-white/70 hover:text-white transition-colors"
          title="Back to Editor (auto-saves progress)"
        >
          <ArrowLeft size={24} />
        </button>

        {/* Go Back to Previous Scene — only in OW mode with history */}
        {openWorldMode && session && session.history.length > 0 && !owGenerating && (
          <button
            onClick={handleGoBackScene}
            className="p-2 rounded-lg bg-black/30 hover:bg-black/50 text-white/70 hover:text-white transition-colors"
            title="Go back to previous scene"
          >
            <Undo2 size={24} />
          </button>
        )}
        </div>

        {/* Settings */}
        <button
          onClick={toggleMenu}
          className="p-2 rounded-lg bg-black/30 hover:bg-black/50 text-white/70 hover:text-white transition-colors"
          title="Menu"
        >
          <Settings size={24} />
        </button>
      </div>

      {/* Main Content (Dialog + Choices) */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 p-6"
        style={{ transform: `translateX(${dialogOffsetX}px)` }}
      >
        <div className="mx-auto space-y-4 relative" style={{ maxWidth: `${dialogWidth}px` }}>
          {/* Drag handle + collapse toggle — visible bar above dialog */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setDialogCollapsed((c) => !c)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors border border-white/10"
              title={dialogCollapsed ? 'Show dialog' : 'Hide dialog'}
            >
              {dialogCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span className="text-xs">{dialogCollapsed ? 'Show' : 'Hide'}</span>
            </button>
            <div
              onMouseDown={handleDialogDragStart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white/50 hover:text-white/80 cursor-grab active:cursor-grabbing transition-colors border border-white/10"
              title="Drag left/right to reposition"
            >
              <GripHorizontal size={14} />
              <span className="text-xs">Drag</span>
            </div>
            <div
              onMouseDown={handleDialogResizeStart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white/50 hover:text-white/80 cursor-ew-resize transition-colors border border-white/10"
              title="Drag to resize width"
            >
              <GripVertical size={14} />
              <span className="text-xs">Width</span>
            </div>
            <div
              onMouseDown={handleDialogHeightStart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white/50 hover:text-white/80 cursor-ns-resize transition-colors border border-white/10"
              title="Drag up/down to resize height"
            >
              <MoveVertical size={14} />
              <span className="text-xs">Height</span>
            </div>
            {openWorldMode && (
              <button
                onClick={() => setDialogEditing(e => !e)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors border ${
                  dialogEditing
                    ? 'bg-amber-600/60 text-white border-amber-400/40'
                    : 'bg-black/50 hover:bg-black/70 text-white/50 hover:text-white/80 border-white/10'
                }`}
                title={dialogEditing ? 'Stop editing' : 'Edit scene text'}
              >
                <Pencil size={14} />
                <span className="text-xs">{dialogEditing ? 'Editing' : 'Edit'}</span>
              </button>
            )}
            {(dialogOffsetX !== 0 || dialogWidth !== 1500 || dialogMaxHeight !== Math.round(window.innerHeight * 0.45)) && (
              <button
                onClick={() => { setDialogOffsetX(0); setDialogWidth(1500); setDialogMaxHeight(Math.round(window.innerHeight * 0.45)); }}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-black/50 hover:bg-black/70 text-white/50 hover:text-white/80 transition-colors border border-white/10"
                title="Reset position, width, and height"
              >
                Reset
              </button>
            )}
          </div>

          {/* Collapsible dialog + choices area */}
          {!dialogCollapsed && (
            <>
              <div className="flex gap-6 items-end">
                {/* Dialog Box — show streamed OW text if generating */}
                <div className="flex-1">
                  {owGenerating ? (
                    /* Show a loading state while the AI generates (structured JSON isn't streamable to UI) */
                    <DialogBox
                      speakerName="Narrator"
                      text={owStreamText || 'Writing the next scene...'}
                      onComplete={() => {}}
                      textSpeed={0}
                      maxHeight={dialogMaxHeight}
                    />
                  ) : owPendingResult ? (
                    /* Scene is ready — keep showing current scene text, don't reveal next scene yet */
                    <DialogBox
                      speakerName={currentScene.speakerName}
                      text={currentScene.storyText}
                      onComplete={() => {}}
                      textSpeed={0}
                      maxHeight={dialogMaxHeight}
                      ttsState={useImageGenStore.getState().tts.enabled ? ttsState : 'disabled'}
                      onToggleTTS={handleToggleTTS}
                    />
                  ) : (
                    <DialogBox
                      speakerName={currentScene.speakerName}
                      text={currentScene.storyText}
                      onComplete={handleTypingComplete}
                      textSpeed={dialogEditing ? 0 : preferences.textSpeed}
                      maxHeight={dialogMaxHeight}
                      editable={dialogEditing}
                      onTextChange={handleSceneTextEdit}
                      ttsState={useImageGenStore.getState().tts.enabled ? ttsState : 'disabled'}
                      onToggleTTS={handleToggleTTS}
                    />
                  )}
                </div>

                {/* Choice List */}
                {!isTyping && currentScene.choices.length > 0 && !owGenerating && !owPendingResult && (
                  <div className="w-80">
                    <ChoiceList
                      choices={currentScene.choices}
                      onSelect={handleChoice}
                    />
                  </div>
                )}

                {/* "Next Scene Ready" button — always visible when OW scene is ready */}
                {owPendingResult && (
                  <div className="w-80">
                    <button
                      onClick={handleAdvanceToOwScene}
                      className="
                        w-full py-4 rounded-lg text-base font-semibold
                        bg-gradient-to-r from-amber-500/80 to-yellow-400/80
                        text-black hover:from-amber-400 hover:to-yellow-300
                        shadow-lg shadow-amber-500/30 animate-pulse
                        transition-all
                      "
                    >
                      Continue to Next Scene
                    </button>
                  </div>
                )}
              </div>

              {/* Open World Input — below dialog area */}
              {openWorldMode && !owGenerating && (
                <div className="max-w-3xl">
                  <OpenWorldInput
                    onSubmit={(text, attachedImages) => {
                      // Direct text input: ensure we create a NEW choice (don't reuse stale ref)
                      owExistingChoiceRef.current = null;
                      handleOpenWorldAction(text, attachedImages);
                    }}
                    disabled={owGenerating}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Open World Status Box */}
      {openWorldMode && (
        <StatusBox statuses={owStatuses} isGenerating={owGenerating} />
      )}

      {/* Side panel icons — right edge, vertically centered (Open World only) */}
      {openWorldMode && !isLoading && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
          {/* Curiosity — Fun Facts */}
          <button
            onClick={() => setShowCuriosity(true)}
            disabled={curiosityFacts.length === 0}
            className="p-3 rounded-xl transition-all disabled:opacity-30"
            style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
            title="Curiosity — Fun Facts"
          >
            <Lightbulb size={22} style={{ color: '#f59e0b' }} />
          </button>

          {/* Character Lens — Mind States */}
          <button
            onClick={() => setShowCharacterLens(true)}
            disabled={Object.keys(characterMindStates).length === 0}
            className="p-3 rounded-xl transition-all disabled:opacity-30"
            style={{ background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.3)' }}
            title="Character Lens — Mind States"
          >
            <Eye size={22} style={{ color: '#f97316' }} />
          </button>

          {/* Ask the Storyteller — Chat */}
          <button
            onClick={() => setShowStorytellerChat(true)}
            className="p-3 rounded-xl transition-all relative"
            style={{ background: 'rgba(180, 83, 9, 0.15)', border: '1px solid rgba(180, 83, 9, 0.3)' }}
            title="Ask the Storyteller"
          >
            <BookOpen size={22} style={{ color: '#b45309' }} />
            {storytellerMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full text-[9px] text-black flex items-center justify-center font-bold">
                {storytellerMessages.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Open World Debug: bottom-left button group */}
      {openWorldMode && currentScene && (
        <div className="fixed bottom-6 left-6 z-30 flex gap-2">
          {/* View AI Response (Brain icon) */}
          <button
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/10 text-white/50 hover:text-white/90 transition-all"
            title="View AI model response for this scene"
            onClick={() => {
              const projStore = useProjectStore.getState();
              const nodeId = session?.currentNodeId;
              const node = nodeId ? projStore.currentProject?.nodes.find(n => n.id === nodeId) : undefined;
              const data = node?.data as Record<string, unknown> | undefined;
              // Check node data first (legacy), then transient store, then pending result
              const transient = nodeId ? getOwContext(nodeId) : undefined;
              const raw = (data?.aiResponse as string) || transient?.rawAiResponse || (owPendingResult?.rawAiResponse) || '';
              if (raw) {
                try {
                  setAiDebugText(JSON.stringify(JSON.parse(raw), null, 2));
                } catch {
                  setAiDebugText(raw);
                }
              } else {
                setAiDebugText('(No AI response stored for this scene)');
              }
              setShowAiDebug(true);
            }}
          >
            <Brain size={18} />
          </button>

          {/* View Constructed Context (FileText icon) */}
          <button
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/10 text-white/50 hover:text-white/90 transition-all"
            title="View the full context sent to the AI for this scene"
            onClick={() => {
              const projStore = useProjectStore.getState();
              const nodeId = session?.currentNodeId;
              const node = nodeId ? projStore.currentProject?.nodes.find(n => n.id === nodeId) : undefined;
              const data = node?.data as Record<string, unknown> | undefined;
              // Check transient store first (current session), then node data (legacy)
              const transient = nodeId ? getOwContext(nodeId) : undefined;
              const ctx = transient?.constructedContext || (data?.constructedContext as string) || (owPendingResult?.constructedContext) || '';
              const sys = transient?.constructedSystemPrompt || (data?.constructedSystemPrompt as string) || (owPendingResult?.constructedSystemPrompt) || '';
              if (ctx || sys) {
                setContextViewerText(ctx || '(No user message stored)');
                setContextViewerTab('user');
              } else {
                setContextViewerText('(No constructed context stored for this scene — only available for recently generated scenes)');
              }
              setShowContextViewer(true);
            }}
          >
            <FileText size={18} />
          </button>
        </div>
      )}

      {/* AI Debug Modal */}
      <Modal
        isOpen={showAiDebug}
        onClose={() => setShowAiDebug(false)}
        title="AI Model Response"
        size="nearfull"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-editor-muted">
            Complete JSON from the scene-writing model. Read-only view for debugging.
          </p>
          <textarea
            className="w-full font-mono text-xs bg-editor-bg text-editor-text p-3 rounded-lg border border-editor-border resize-y focus:outline-none"
            style={{ minHeight: '60vh' }}
            value={aiDebugText}
            readOnly
          />
          <div className="flex justify-end">
            <button
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-sm"
              onClick={() => setShowAiDebug(false)}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Constructed Context Viewer Modal */}
      <Modal
        isOpen={showContextViewer}
        onClose={() => setShowContextViewer(false)}
        title="Constructed Context (what the AI sees)"
        size="nearfull"
      >
        <div className="flex flex-col gap-3">
          {/* Tab bar to switch between user message and system prompt */}
          <div className="flex gap-2 border-b border-editor-border pb-2">
            <button
              className={`px-3 py-1.5 rounded-t text-sm transition-colors ${
                contextViewerTab === 'user'
                  ? 'bg-accent/20 text-accent border-b-2 border-accent'
                  : 'text-editor-muted hover:text-editor-text'
              }`}
              onClick={() => {
                const projStore = useProjectStore.getState();
                const nodeId = session?.currentNodeId;
                const node = nodeId ? projStore.currentProject?.nodes.find(n => n.id === nodeId) : undefined;
                const data = node?.data as Record<string, unknown> | undefined;
                const transient = nodeId ? getOwContext(nodeId) : undefined;
                setContextViewerText(
                  transient?.constructedContext || (data?.constructedContext as string) || (owPendingResult?.constructedContext) || '(No user message stored)'
                );
                setContextViewerTab('user');
              }}
            >
              User Message (Context)
            </button>
            <button
              className={`px-3 py-1.5 rounded-t text-sm transition-colors ${
                contextViewerTab === 'system'
                  ? 'bg-accent/20 text-accent border-b-2 border-accent'
                  : 'text-editor-muted hover:text-editor-text'
              }`}
              onClick={() => {
                const projStore = useProjectStore.getState();
                const nodeId = session?.currentNodeId;
                const node = nodeId ? projStore.currentProject?.nodes.find(n => n.id === nodeId) : undefined;
                const data = node?.data as Record<string, unknown> | undefined;
                const transient = nodeId ? getOwContext(nodeId) : undefined;
                setContextViewerText(
                  transient?.constructedSystemPrompt || (data?.constructedSystemPrompt as string) || (owPendingResult?.constructedSystemPrompt) || '(No system prompt stored)'
                );
                setContextViewerTab('system');
              }}
            >
              System Prompt
            </button>
          </div>
          <p className="text-xs text-editor-muted">
            {contextViewerTab === 'user'
              ? 'The full user message assembled from notes, entities, story timeline, variables, and player action. This is exactly what the scene-writing model received.'
              : 'The system prompt (from Writer Settings) that instructs the model how to write scenes.'}
          </p>
          <textarea
            className="w-full font-mono text-xs bg-editor-bg text-editor-text p-3 rounded-lg border border-editor-border resize-y focus:outline-none"
            style={{ minHeight: '60vh' }}
            value={contextViewerText}
            readOnly
          />
          <div className="flex justify-end">
            <button
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-sm"
              onClick={() => setShowContextViewer(false)}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Open World Mode Indicator */}
      {openWorldMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <span className="px-3 py-1 bg-purple-600/60 backdrop-blur-sm rounded-full text-xs text-white/80 border border-purple-400/30">
            Open World Mode
          </span>
        </div>
      )}

      {/* System Menu */}
      {isMenuOpen && <SystemMenu />}

      {/* --- Side Panel Overlays (Open World feature panels) --- */}

      {/* Curiosity Panel — Fun facts about the scene/world */}
      {showCuriosity && (
        <CuriosityPanel
          facts={curiosityFacts}
          onClose={() => setShowCuriosity(false)}
        />
      )}

      {/* Character Lens — AI mind states for present characters */}
      {showCharacterLens && (
        <CharacterLensPanel
          mindStates={characterMindStates}
          entities={(useProjectStore.getState().currentProject?.entities || []).map(e => ({
            id: e.id,
            name: e.name,
            category: e.category,
            referenceImage: e.referenceImage,
            summary: e.summary,
          }))}
          onClose={() => setShowCharacterLens(false)}
          onMindStateChange={handleMindStateChange}
        />
      )}

      {/* Storyteller Chat — Chat with the AI narrator/DM */}
      {showStorytellerChat && (
        <StorytellerChatPanel
          messages={storytellerMessages}
          onSendMessage={handleStorytellerSend}
          onClose={() => setShowStorytellerChat(false)}
          isGenerating={storytellerGenerating}
          streamingText={storytellerStreamText}
        />
      )}
    </div>
  );
}
