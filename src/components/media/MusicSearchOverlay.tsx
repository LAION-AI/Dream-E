/**
 * =============================================================================
 * MUSIC SEARCH OVERLAY
 * =============================================================================
 *
 * A reusable modal overlay for searching the RPG music library (BM25 server).
 * Can be opened from any inspector that needs background music assignment.
 *
 * FEATURES:
 * - Text search with field selector (situations, emotions, captions)
 * - Singing filter toggle (default: no singing)
 * - Results list with metadata, audio preview, and select button
 * - Loading and error states
 *
 * HOW IT WORKS:
 * 1. User types a query (e.g., "mysterious forest night")
 * 2. Sends POST to /api/music/search with BM25 keyword search
 * 3. Displays top 5 results with inline audio previews
 * 4. On "Select", fetches the track audio, converts to base64, calls onSelect
 *
 * WHY A SEPARATE OVERLAY?
 * Music selection is needed from multiple inspectors (StoryRoot, Plot, Act,
 * CoWriteScene, and potentially Scene). A shared overlay avoids duplicating
 * the search UI and audio preview logic in every inspector.
 *
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Music,
  Loader2,
  Play,
  Pause,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export interface MusicSearchOverlayProps {
  /** Whether the overlay is currently visible */
  isOpen: boolean;
  /** Callback to close the overlay */
  onClose: () => void;
  /**
   * Called when the user selects a track. Receives the audio as a base64 data
   * URL and metadata about the track (row_id, title, duration).
   */
  onSelect: (
    trackDataUrl: string,
    metadata: { row_id: number; title: string; duration?: number }
  ) => void;
  /** Optional title for the overlay header */
  title?: string;
}

/** Shape of a single search result from the BM25 music server */
interface MusicResult {
  row_id: number;
  title: string;
  bm25_score: number;
  evoked_emotions: string[];
  has_singing: boolean;
  genre_situations: Record<string, string[]>;
  duration?: number;
}

/** The three searchable fields exposed by the BM25 server */
type SearchField = 'situations' | 'emotions' | 'captions';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * The music API is proxied through Vite at /api/music/* to avoid CORS issues.
 * The actual BM25 server runs on localhost:7862.
 */
const MUSIC_API = '/api/music';

/**
 * Dropdown options for the search field selector.
 * Each option maps to a BM25 index field on the server.
 */
const SEARCH_FIELDS: { value: SearchField; label: string }[] = [
  { value: 'situations', label: 'Situations' },
  { value: 'emotions', label: 'Emotions' },
  { value: 'captions', label: 'Captions' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function MusicSearchOverlay({
  isOpen,
  onClose,
  onSelect,
  title = 'Search Music Library',
}: MusicSearchOverlayProps) {
  // ── Search state ──────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('situations');
  const [noSinging, setNoSinging] = useState(true);
  const [results, setResults] = useState<MusicResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // ── Audio preview state ───────────────────────────────────────────────
  /** The row_id of the track currently playing in the preview */
  const [playingId, setPlayingId] = useState<number | null>(null);
  /** Playback progress 0-1 for the currently playing track */
  const [playProgress, setPlayProgress] = useState(0);
  /**
   * Cache of fetched audio blob URLs keyed by row_id. We keep these alive
   * for the lifetime of the overlay so re-playing a track is instant.
   */
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  /** Reference to the single shared <audio> element used for previews */
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Track selection (download) state ──────────────────────────────────
  /** The row_id currently being downloaded for selection */
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // ── Reset state when the modal opens ──────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      setHasSearched(false);
      setPlayingId(null);
      setPlayProgress(0);
      setDownloadingId(null);
      // Revoke any cached blob URLs to free memory
      for (const url of audioCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      audioCacheRef.current.clear();
      // Stop any playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    }
  }, [isOpen]);

  // ── Clean up audio element on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      for (const url of audioCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      audioCacheRef.current.clear();
    };
  }, []);

  // ── Search handler ────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    // Stop any preview audio while searching
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(null);
    setPlayProgress(0);

    try {
      const res = await fetch(`${MUSIC_API}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          search_field: searchField,
          top_k: 5,
          singing_filter: noSinging ? 'no_singing' : 'any',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Search failed (${res.status})`);
      }

      const data = await res.json();
      setResults(data.results || []);
    } catch (err: any) {
      console.error('[MusicSearchOverlay] Search failed:', err);
      setSearchError(
        err.message || 'Music search failed. Is the RPG music server running?'
      );
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query, searchField, noSinging]);

  /**
   * Trigger search on Enter key press in the search input.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // ── Audio preview ─────────────────────────────────────────────────────

  /**
   * Fetches audio for preview and plays/pauses it.
   * Uses a cache to avoid re-fetching the same track.
   */
  const togglePreview = useCallback(
    async (row_id: number) => {
      // Create audio element lazily on first use
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener('timeupdate', () => {
          const a = audioRef.current;
          if (a && a.duration) {
            setPlayProgress(a.currentTime / a.duration);
          }
        });
        audioRef.current.addEventListener('ended', () => {
          setPlayingId(null);
          setPlayProgress(0);
        });
      }

      const audio = audioRef.current;

      // If already playing this track, pause it
      if (playingId === row_id) {
        audio.pause();
        setPlayingId(null);
        return;
      }

      // If a different track is playing, stop it first
      if (playingId !== null) {
        audio.pause();
      }

      setPlayProgress(0);

      // Check cache first, fetch if not cached.
      // The BM25 server exposes GET /api/track/{row_id} which returns metadata
      // including an `audio_url` field. We fetch that URL to get the actual audio.
      let blobUrl = audioCacheRef.current.get(row_id);
      if (!blobUrl) {
        try {
          // Step 1: Get track metadata (contains the audio_url)
          const metaRes = await fetch(`${MUSIC_API}/track/${row_id}`);
          if (!metaRes.ok) {
            console.error(`[MusicSearchOverlay] Failed to get track metadata for ${row_id}`);
            return;
          }
          const meta = await metaRes.json();
          const audioUrl = meta.audio_url;
          if (!audioUrl) {
            console.error(`[MusicSearchOverlay] Track ${row_id} has no audio_url`);
            return;
          }

          // Step 2: Fetch the actual audio file from the audio URL
          const audioRes = await fetch(audioUrl);
          if (!audioRes.ok) {
            console.error(`[MusicSearchOverlay] Failed to download audio from ${audioUrl}`);
            return;
          }
          const blob = await audioRes.blob();
          blobUrl = URL.createObjectURL(blob);
          audioCacheRef.current.set(row_id, blobUrl);
        } catch (err) {
          console.error('[MusicSearchOverlay] Audio fetch error:', err);
          return;
        }
      }

      audio.src = blobUrl;
      audio.currentTime = 0;
      setPlayingId(row_id);

      try {
        await audio.play();
      } catch (err) {
        console.error('[MusicSearchOverlay] Audio play error:', err);
        setPlayingId(null);
      }
    },
    [playingId]
  );

  // ── Track selection (download + convert to data URL) ──────────────────

  /**
   * Downloads the full track audio, converts it to a base64 data URL, and
   * passes it to the onSelect callback. This is the "heavy" operation that
   * happens only when the user commits to selecting a track.
   *
   * WHY BASE64?
   * The project state stores assets as base64 data URLs so they survive
   * serialization to IndexedDB and export to .dream-e.zip files. Blob URLs
   * are ephemeral and would break on save/reload.
   */
  const handleSelectTrack = useCallback(
    async (track: MusicResult) => {
      setDownloadingId(track.row_id);

      // Stop preview audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingId(null);

      try {
        // Step 1: Get track metadata to obtain the audio_url
        const metaRes = await fetch(`${MUSIC_API}/track/${track.row_id}`);
        if (!metaRes.ok) {
          throw new Error(`Failed to get track metadata: HTTP ${metaRes.status}`);
        }
        const meta = await metaRes.json();
        const audioUrl = meta.audio_url;
        if (!audioUrl) {
          throw new Error('Track has no audio URL');
        }

        // Step 2: Fetch the actual audio file
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) {
          throw new Error(`Failed to download audio: HTTP ${audioRes.status}`);
        }

        const blob = await audioRes.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Convert to base64 in chunks to avoid O(n^2) string concat on large files
        const CHUNK = 8192;
        const chunks: string[] = [];
        for (let i = 0; i < bytes.length; i += CHUNK) {
          chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
        }
        const base64 = btoa(chunks.join(''));
        const mimeType = blob.type || 'audio/mpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        onSelect(dataUrl, {
          row_id: track.row_id,
          title: track.title,
          duration: track.duration,
        });
        onClose();
      } catch (err: any) {
        console.error('[MusicSearchOverlay] Track download failed:', err);
        setSearchError(err.message || 'Failed to download track.');
      } finally {
        setDownloadingId(null);
      }
    },
    [onSelect, onClose]
  );

  // ── Helper: format genre_situations into readable text ────────────────

  /**
   * Collapses the genre_situations map into a compact readable string.
   * Example: "forest: exploration, mystery | dungeon: tension"
   */
  const formatSituations = (gs: Record<string, string[]>): string => {
    const parts: string[] = [];
    for (const [genre, situations] of Object.entries(gs)) {
      if (situations.length > 0) {
        parts.push(`${genre}: ${situations.slice(0, 3).join(', ')}`);
      }
    }
    return parts.slice(0, 3).join(' | ') || 'No situation data';
  };

  /**
   * Format duration in seconds to mm:ss string.
   */
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Render ────────────────────────────────────────────────────────────

  // ── Render ────────────────────────────────────────────────────────────
  // Uses createPortal to render a fullscreen overlay (like the chat panel)
  // instead of a centered modal popup. This gives more room for search
  // results and a better browsing experience.

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0f1117',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header with title and close button ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid #2d3148',
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1em', fontWeight: 600, color: '#e2e4ea', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Music size={20} style={{ color: '#6c8aff' }} />
          {title}
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8b8fa4',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close"
        >
          <X size={20} />
        </button>
      </div>

      {/* ── Scrollable content area ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Search Controls ── */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {/* Query input */}
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Search Query</label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., mysterious forest night, epic battle..."
                style={inputStyle}
                disabled={isSearching}
                autoFocus
              />
            </div>

            {/* Search field dropdown */}
            <div style={{ width: 130 }}>
              <label style={labelStyle}>Field</label>
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value as SearchField)}
                style={inputStyle}
                disabled={isSearching}
              >
                {SEARCH_FIELDS.map((sf) => (
                  <option key={sf.value} value={sf.value}>
                    {sf.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Search button */}
            <button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                border: 'none',
                background:
                  isSearching || !query.trim() ? '#6c8aff60' : '#6c8aff',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.88em',
                cursor:
                  isSearching || !query.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {isSearching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              Search
            </button>
          </div>

          {/* ── Singing Filter Toggle ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: '0.85em',
                color: '#8b8fa4',
              }}
            >
              <input
                type="checkbox"
                checked={noSinging}
                onChange={(e) => setNoSinging(e.target.checked)}
                style={{ accentColor: '#6c8aff' }}
                disabled={isSearching}
              />
              No singing (instrumental only)
            </label>
          </div>

          {/* ── Error Message ── */}
          {searchError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '0.85em',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={16} />
              {searchError}
            </div>
          )}

          {/* ── Loading State ── */}
          {isSearching && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
                color: '#8b8fa4',
                gap: 10,
              }}
            >
              <Loader2 size={20} className="animate-spin" />
              Searching music library...
            </div>
          )}

          {/* ── Results List ── */}
          {!isSearching && results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={labelStyle}>
                Results ({results.length})
              </label>
              {results.map((track) => (
                <div
                  key={track.row_id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #2d3148',
                    background: '#171923',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {/* Track header: title + duration + score */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Music size={16} style={{ color: '#6c8aff', flexShrink: 0 }} />
                      <span
                        style={{
                          fontWeight: 600,
                          color: '#e2e4ea',
                          fontSize: '0.92em',
                        }}
                      >
                        {track.title}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.78em',
                        color: '#8b8fa4',
                        fontFamily: "'Cascadia Code', monospace",
                      }}
                    >
                      {formatDuration(track.duration)}
                    </span>
                  </div>

                  {/* Metadata: situations + emotions */}
                  <div style={{ fontSize: '0.8em', color: '#8b8fa4', lineHeight: 1.5 }}>
                    <div>{formatSituations(track.genre_situations)}</div>
                    {track.evoked_emotions && track.evoked_emotions.length > 0 && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{ color: '#6c8aff' }}>Emotions:</span>{' '}
                        {track.evoked_emotions.slice(0, 5).join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Audio preview (play/pause + progress bar) + Select button */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {/* Play/Pause button */}
                    <button
                      onClick={() => togglePreview(track.row_id)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        border: '1px solid #2d3148',
                        background:
                          playingId === track.row_id
                            ? 'rgba(108, 138, 255, 0.2)'
                            : 'transparent',
                        color: playingId === track.row_id ? '#6c8aff' : '#8b8fa4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        padding: 0,
                      }}
                      title={
                        playingId === track.row_id ? 'Pause preview' : 'Play preview'
                      }
                    >
                      {playingId === track.row_id ? (
                        <Pause size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>

                    {/* Progress bar — only shows meaningful progress for the playing track */}
                    <div
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background: '#2d3148',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${playingId === track.row_id ? playProgress * 100 : 0}%`,
                          height: '100%',
                          background: '#6c8aff',
                          borderRadius: 2,
                          transition: 'width 0.3s linear',
                        }}
                      />
                    </div>

                    {/* Select button */}
                    <button
                      onClick={() => handleSelectTrack(track)}
                      disabled={downloadingId !== null}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: 'none',
                        background:
                          downloadingId === track.row_id
                            ? '#4ade8040'
                            : '#4ade8020',
                        color: '#4ade80',
                        fontWeight: 600,
                        fontSize: '0.82em',
                        cursor:
                          downloadingId !== null ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        whiteSpace: 'nowrap',
                      }}
                      title="Select this track"
                    >
                      {downloadingId === track.row_id ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Check size={12} />
                          Select
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Empty State ── */}
          {!isSearching && hasSearched && results.length === 0 && !searchError && (
            <div
              style={{
                textAlign: 'center',
                padding: 32,
                color: '#8b8fa4',
                fontSize: '0.9em',
              }}
            >
              No tracks found. Try different keywords or search field.
            </div>
          )}

          {/* ── Initial State (before first search) ── */}
          {!isSearching && !hasSearched && (
            <div
              style={{
                textAlign: 'center',
                padding: 32,
                color: '#8b8fa4',
                fontSize: '0.9em',
              }}
            >
              <Music size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>Search the RPG music library (~2,580 tracks)</div>
              <div style={{ fontSize: '0.85em', marginTop: 4, opacity: 0.7 }}>
                Enter keywords and press Search or hit Enter
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #2d3148',
  background: '#0f1117',
  color: '#e2e4ea',
  fontSize: '0.92em',
  fontFamily: 'inherit',
  outline: 'none',
};
