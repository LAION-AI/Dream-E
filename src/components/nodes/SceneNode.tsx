/**
 * =============================================================================
 * SCENE NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of a Scene Node in the editor canvas.
 *
 * SCENE NODES ARE:
 * - The "output" nodes where the game displays content
 * - Blue colored
 * - Show thumbnail of background image
 * - Display story text preview
 * - Have multiple output handles (one per choice)
 *
 * MEMORY OPTIMIZATION:
 * - Uses IntersectionObserver with BIDIRECTIONAL visibility to load thumbnails
 *   only when the node is in the viewport, and UNLOAD when it leaves.
 * - Global cap of 10 simultaneously loaded thumbnails prevents OOM on large
 *   projects. Excess visible nodes show a placeholder icon.
 * - NEVER loads the full-resolution image — only 256px JPEG thumbnails
 *   (~50KB each vs 3.6MB decoded RGBA per full-res image).
 * - Uses blob URLs via getBlobUrl() in the thumbnail pipeline, keeping
 *   binary data in native blob storage outside the JS heap.
 *
 * =============================================================================
 */

import React, { memo, useRef, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Film, Image as ImageIcon } from 'lucide-react';
import { getThumbnail, onThumbnailReady } from '@/utils/thumbnailCache';
import { useProjectStore } from '@/stores/useProjectStore';

/**
 * SCENE NODE DATA
 */
interface SceneNodeData {
  label: string;
  backgroundImage?: string;
  speakerName?: string;
  storyText: string;
  choices: Array<{ id: string; label: string }>;
  musicKeepPlaying: boolean;
  voiceoverAutoplay: boolean;
}

// =============================================================================
// GLOBAL THUMBNAIL SLOT COORDINATOR
// =============================================================================
// Caps the number of simultaneously loaded thumbnails to MAX_VISIBLE_THUMBS.
// This prevents OOM when zooming out on large projects (100+ scene nodes)
// because each decoded image bitmap costs ~3.6MB in the browser's image cache.
// With the cap, at most 10 × ~50KB = 500KB of decoded thumbnails exist at once.
//
// Each LazyNodeImage registers/unregisters here. When the cap is full, new
// nodes show a placeholder until an existing slot is freed (node scrolls
// offscreen or unmounts).
// =============================================================================

const MAX_VISIBLE_THUMBS = 10;

/** Set of node component instance IDs that currently hold a thumbnail slot. */
const activeThumbSlots = new Set<number>();

/** Monotonically increasing counter to give each LazyNodeImage a unique ID. */
let nextInstanceId = 0;

/** Try to acquire a thumbnail slot. Returns true if a slot was available. */
function acquireThumbSlot(instanceId: number): boolean {
  if (activeThumbSlots.has(instanceId)) return true; // already holds a slot
  if (activeThumbSlots.size >= MAX_VISIBLE_THUMBS) return false; // full
  activeThumbSlots.add(instanceId);
  return true;
}

/** Release a thumbnail slot so another node can use it. */
function releaseThumbSlot(instanceId: number): void {
  activeThumbSlots.delete(instanceId);
}

// Expose slot count for diagnostics (window.__visibleThumbs())
if (typeof window !== 'undefined') {
  (window as any).__visibleThumbs = () => ({
    active: activeThumbSlots.size,
    max: MAX_VISIBLE_THUMBS,
  });
}

/**
 * LAZY IMAGE COMPONENT
 *
 * Renders a small thumbnail (<= 256px JPEG, ~30-50KB) when the container is
 * within 200px of the React Flow viewport AND a thumbnail slot is available.
 *
 * MEMORY OPTIMIZATIONS (B1 + B2):
 * - NEVER falls back to the full-resolution image. Shows a placeholder icon
 *   until the thumbnail is generated (~200-500ms). This prevents the browser
 *   from decoding 3.6MB RGBA bitmaps per node (B1 fix).
 * - Visibility is BIDIRECTIONAL: when a node scrolls out of viewport (with
 *   500ms debounce to avoid flicker during pan/drag), it releases its
 *   thumbnail slot and clears its displayed URL (B2 fix).
 * - A global cap of MAX_VISIBLE_THUMBS (10) limits how many thumbnails are
 *   decoded simultaneously. Excess visible nodes show a placeholder.
 */
function LazyNodeImage({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string>('');

  // Unique instance ID for this component — used by the slot coordinator.
  const instanceIdRef = useRef(nextInstanceId++);
  // Debounce timer for hiding — prevents flicker during brief scroll-through.
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether this component is still mounted to guard async callbacks.
  const mountedRef = useRef(true);

  // ── IntersectionObserver: bidirectional visibility ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    mountedRef.current = true;
    const instanceId = instanceIdRef.current;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Cancel any pending hide — node is visible again before debounce fired
          if (hideTimerRef.current !== null) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          setIsVisible(true);
        } else {
          // Debounce the hide by 500ms to avoid flicker during quick
          // pan/drag operations. If the node comes back into view within
          // 500ms the timer is cancelled above.
          if (hideTimerRef.current === null) {
            hideTimerRef.current = setTimeout(() => {
              hideTimerRef.current = null;
              if (mountedRef.current) {
                setIsVisible(false);
                setThumbUrl('');
                releaseThumbSlot(instanceId);
              }
            }, 500);
          }
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => {
      mountedRef.current = false;
      observer.disconnect();
      // Clean up on unmount: release slot and cancel pending timer
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      releaseThumbSlot(instanceId);
    };
  }, []);

  // ── Thumbnail loading: only when visible AND a slot is available ──
  useEffect(() => {
    if (!isVisible || !src) return;

    const instanceId = instanceIdRef.current;

    // Try to acquire a slot — if all 10 are taken, skip (show placeholder)
    if (!acquireThumbSlot(instanceId)) return;

    // Try synchronous cache hit first
    const cached = getThumbnail(src);
    if (cached) {
      setThumbUrl(cached);
      return;
    }

    // Register callback for async generation. Guard with mountedRef to
    // prevent setState on an unmounted component.
    onThumbnailReady(src, (url) => {
      if (mountedRef.current) {
        setThumbUrl(url);
      }
    });
  }, [isVisible, src]);

  // B1 FIX: No getBlobUrl(src) fallback. Only display the thumbnail.
  // If the thumbnail isn't ready yet, displayUrl is '' and we show
  // the placeholder icon. This prevents the browser from decoding
  // the full 1280×720 image (3.6MB decoded RGBA per node).
  const displayUrl = thumbUrl;

  return (
    <div ref={containerRef} className="h-24 bg-editor-bg flex items-center justify-center overflow-hidden">
      {isVisible && displayUrl ? (
        <img
          src={displayUrl}
          alt="Background"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <ImageIcon size={32} className="text-editor-muted" />
      )}
    </div>
  );
}

/**
 * SCENE NODE COMPONENT
 * Renders a scene node with image preview and text.
 */
function SceneNode({ id, data, selected }: NodeProps<SceneNodeData>) {
  // DIAGNOSTIC: Render counter
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  if ((window as any).__renderDiag) {
    console.log(`[RenderDiag] SceneNode ${id} render #${renderCountRef.current}`);
  }

  // Check if this is the project's start node
  const isStartNode = useProjectStore(
    (s) => s.currentProject?.settings?.startNodeId === id
  );

  // Truncate text for preview
  const previewText = data.storyText
    ? data.storyText.length > 80
      ? data.storyText.substring(0, 80) + '...'
      : data.storyText
    : 'No content';

  return (
    <div
      className={`
        node-scene min-w-[200px] max-w-[280px]
        ${selected ? 'selected ring-2 ring-node-scene shadow-glow-blue' : ''}
        ${isStartNode ? 'ring-2 ring-green-500/60' : ''}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!bg-node-scene !w-3 !h-3"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-node-scene/30">
        {isStartNode ? (
          <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" title="Start Node" />
        ) : (
          <Film size={16} className="text-node-scene" />
        )}
        <span className="font-medium text-sm text-editor-text truncate">
          {data.label || 'Scene'}
        </span>
      </div>

      {/* Image preview — lazy-loaded with blob URL */}
      {data.backgroundImage ? (
        <LazyNodeImage src={data.backgroundImage} />
      ) : (
        <div className="h-24 bg-editor-bg flex items-center justify-center overflow-hidden">
          <ImageIcon size={32} className="text-editor-muted" />
        </div>
      )}

      {/* Text preview */}
      <div className="px-3 py-2">
        {data.speakerName && (
          <p className="text-xs font-medium text-node-scene mb-1">
            {data.speakerName}
          </p>
        )}
        <p className="text-xs text-editor-muted line-clamp-2">
          {previewText}
        </p>
      </div>

      {/* Choices / Output handles - only show if there are choices */}
      {data.choices && data.choices.length > 0 && (
        <div className="border-t border-node-scene/30">
          {data.choices.map((choice, index) => (
            <div
              key={choice.id}
              className="relative px-3 py-1.5 text-xs text-editor-muted flex items-center justify-between hover:bg-node-scene/10"
            >
              <span className="truncate pr-4">
                {choice.label || `Choice ${index + 1}`}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={choice.id}
                className="!bg-node-scene !w-3 !h-3 !right-[-6px]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Memo to prevent unnecessary re-renders
export default memo(SceneNode);
