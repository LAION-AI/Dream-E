/**
 * =============================================================================
 * THUMBNAIL CACHE
 * =============================================================================
 *
 * Generates and caches small thumbnails for scene background images.
 * Used by SceneNode in the canvas editor to display image previews
 * without decoding the full-resolution image (1280x720 → 3.6MB decoded RGBA).
 *
 * HOW IT WORKS:
 * 1. Given a source image URL (blob URL or data URL), loads it into an
 *    off-screen Image element.
 * 2. Draws it scaled down to a Canvas element (max 256px longest dimension).
 * 3. Exports the canvas as a JPEG blob URL (~30-50KB).
 * 4. Caches the result so subsequent calls return immediately.
 *
 * MEMORY OPTIMIZATION:
 * - After drawing the thumbnail the off-screen Image element is cleaned up
 *   (src cleared, handlers removed) so the browser can release the full-res
 *   decoded bitmap from its internal image cache.
 * - The cache is capped at MAX_THUMB_CACHE entries. When exceeded, the oldest
 *   entries are evicted and their blob URLs revoked.
 * - 30 thumbnails × ~50KB = ~1.5MB decoded (vs 30 × 3.6MB = 108MB full-res)
 *
 * =============================================================================
 */

import { getBlobUrl } from './blobCache';

/** Maximum dimension (width or height) for generated thumbnails */
const MAX_THUMB_DIM = 256;

/** JPEG quality for thumbnail export (0.0–1.0) */
const THUMB_QUALITY = 0.7;

/** Maximum number of thumbnails kept in cache. Oldest evicted first. */
const MAX_THUMB_CACHE = 100;

/**
 * Cache: source URL → thumbnail blob URL.
 * Uses insertion-order iteration of Map for LRU-style eviction (oldest first).
 */
const thumbCache = new Map<string, string>();

/**
 * Set of source URLs currently being generated — prevents duplicate
 * concurrent generation for the same image.
 */
const pendingSet = new Set<string>();

/**
 * Maximum number of thumbnails generated concurrently.
 * Prevents memory spikes when zooming out on a large canvas (200+ nodes
 * visible → 200 Image elements loading full-res images simultaneously).
 * Excess requests are queued and processed as slots free up.
 */
const MAX_CONCURRENT_GENERATION = 5;
let activeGenerations = 0;
const generationQueue: Array<{ src: string }> = [];

/**
 * Callbacks waiting for a thumbnail that's currently being generated.
 */
const waiters = new Map<string, Array<(url: string) => void>>();

/**
 * Evicts the oldest entries from the thumbnail cache when it exceeds
 * MAX_THUMB_CACHE. Revokes blob URLs of evicted thumbnails to free
 * native memory.
 */
function evictOldest(): void {
  while (thumbCache.size > MAX_THUMB_CACHE) {
    // Map iterates in insertion order — first entry is the oldest
    const oldest = thumbCache.entries().next();
    if (oldest.done) break;
    const [key, thumbUrl] = oldest.value;
    // Only revoke generated thumbnails, not pass-through URLs
    if (thumbUrl.startsWith('blob:') && thumbUrl !== key) {
      URL.revokeObjectURL(thumbUrl);
    }
    thumbCache.delete(key);
  }
}

/**
 * Schedules a thumbnail generation, respecting the concurrency limit.
 * If we're already at MAX_CONCURRENT_GENERATION, the request is queued
 * and will be processed when a slot frees up.
 */
function scheduleGeneration(blobSrc: string): void {
  if (activeGenerations >= MAX_CONCURRENT_GENERATION) {
    generationQueue.push({ src: blobSrc });
    return;
  }
  runGeneration(blobSrc);
}

/**
 * Runs a single thumbnail generation, then processes the next queued item.
 */
function runGeneration(blobSrc: string): void {
  activeGenerations++;

  generateThumbnail(blobSrc).then((thumbUrl) => {
    pendingSet.delete(blobSrc);
    if (thumbUrl) {
      thumbCache.set(blobSrc, thumbUrl);
      evictOldest();
    }
    // Notify waiters
    const callbacks = waiters.get(blobSrc);
    if (callbacks) {
      for (const cb of callbacks) cb(thumbUrl || blobSrc);
      waiters.delete(blobSrc);
    }
  }).finally(() => {
    activeGenerations--;
    // Process next queued item
    if (generationQueue.length > 0) {
      const next = generationQueue.shift()!;
      // Skip if already completed or cancelled
      if (pendingSet.has(next.src) && !thumbCache.has(next.src)) {
        runGeneration(next.src);
      } else {
        // This one's done — try the next in queue
        pendingSet.delete(next.src);
        if (generationQueue.length > 0) {
          const another = generationQueue.shift()!;
          if (pendingSet.has(another.src) && !thumbCache.has(another.src)) {
            runGeneration(another.src);
          }
        }
      }
    }
  });
}

/**
 * Returns a thumbnail blob URL for the given image source.
 *
 * - If a thumbnail is already cached, returns it immediately.
 * - If the source needs downsampling, generates a thumbnail asynchronously
 *   and returns '' (caller should re-render when onThumbnailReady fires).
 * - Returns an empty string immediately if the source is falsy.
 */
export function getThumbnail(src: string | undefined): string {
  if (!src) return '';

  // Convert data URLs to blob URLs first (uses the main blobCache)
  const blobSrc = getBlobUrl(src);
  if (!blobSrc) return '';

  // Check cache
  const cached = thumbCache.get(blobSrc);
  if (cached) return cached;

  // Don't duplicate generation — if already pending, just wait
  if (pendingSet.has(blobSrc)) return '';

  // Start async thumbnail generation (respecting concurrency limit)
  pendingSet.add(blobSrc);
  scheduleGeneration(blobSrc);

  return ''; // Not ready yet — caller should re-render when available
}

/**
 * Register a callback to be called when a thumbnail becomes available.
 * If the thumbnail is already cached, the callback is called immediately.
 */
export function onThumbnailReady(src: string | undefined, callback: (thumbUrl: string) => void): void {
  if (!src) return;
  const blobSrc = getBlobUrl(src);
  if (!blobSrc) return;

  const cached = thumbCache.get(blobSrc);
  if (cached) {
    callback(cached);
    return;
  }

  // Register waiter
  if (!waiters.has(blobSrc)) {
    waiters.set(blobSrc, []);
  }
  waiters.get(blobSrc)!.push(callback);

  // Trigger generation if not already pending
  if (!pendingSet.has(blobSrc)) {
    getThumbnail(src); // This starts the generation
  }
}

/**
 * Generates a thumbnail by loading the image, scaling it down on a Canvas,
 * and exporting as a JPEG blob URL.
 *
 * IMPORTANT: After drawing, the off-screen Image element is cleaned up so
 * the browser can release the full-resolution decoded bitmap from its
 * internal image cache. Without this, each thumbnail generation keeps
 * ~3.6MB (1280×720×4 RGBA) in the browser's decode cache permanently.
 */
async function generateThumbnail(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    /** Clean up the Image element to release the decoded bitmap from the
     *  browser's internal image cache. Without this, each generateThumbnail
     *  call permanently consumes ~3.6MB of decoded pixel data. */
    const cleanupImage = () => {
      img.onload = null;
      img.onerror = null;
      // Setting src to '' tells the browser it can release the decoded bitmap
      img.src = '';
    };

    img.onload = () => {
      try {
        // Calculate scaled dimensions (fit within MAX_THUMB_DIM)
        const { width, height } = img;
        let thumbW: number;
        let thumbH: number;

        if (width >= height) {
          thumbW = Math.min(width, MAX_THUMB_DIM);
          thumbH = Math.round((height / width) * thumbW);
        } else {
          thumbH = Math.min(height, MAX_THUMB_DIM);
          thumbW = Math.round((width / height) * thumbH);
        }

        // If the image is already small enough, use the original
        if (width <= MAX_THUMB_DIM && height <= MAX_THUMB_DIM) {
          cleanupImage();
          resolve(src); // Already small, no need to downsample
          return;
        }

        // Draw to off-screen canvas
        const canvas = document.createElement('canvas');
        canvas.width = thumbW;
        canvas.height = thumbH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanupImage();
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, thumbW, thumbH);

        // Release the full-res image from browser decode cache immediately
        // after drawing — we no longer need it
        cleanupImage();

        // Export as JPEG blob
        canvas.toBlob(
          (blob) => {
            // Release canvas memory
            canvas.width = 0;
            canvas.height = 0;

            if (!blob) {
              resolve(null);
              return;
            }
            const thumbUrl = URL.createObjectURL(blob);
            resolve(thumbUrl);
          },
          'image/jpeg',
          THUMB_QUALITY
        );
      } catch (err) {
        cleanupImage();
        console.warn('[ThumbnailCache] Failed to generate thumbnail:', err);
        resolve(null);
      }
    };

    img.onerror = () => {
      cleanupImage();
      console.warn('[ThumbnailCache] Failed to load image for thumbnail');
      resolve(null);
    };

    img.src = src;
  });
}

/**
 * Clears the entire thumbnail cache and revokes all thumbnail blob URLs.
 * Call on project close or when a full reset is needed.
 */
export function clearThumbnailCache(): void {
  for (const [key, thumbUrl] of thumbCache.entries()) {
    // Only revoke generated thumbnails (blob URLs we created),
    // not pass-through URLs for already-small images.
    if (thumbUrl.startsWith('blob:') && thumbUrl !== key) {
      URL.revokeObjectURL(thumbUrl);
    }
  }
  thumbCache.clear();
  pendingSet.clear();
  waiters.clear();
  generationQueue.length = 0;
  activeGenerations = 0;
}

/**
 * Returns diagnostic info about the thumbnail cache.
 */
export function getThumbnailDiagnostics(): {
  cacheSize: number;
  pendingCount: number;
  maxCache: number;
} {
  return {
    cacheSize: thumbCache.size,
    pendingCount: pendingSet.size,
    maxCache: MAX_THUMB_CACHE,
  };
}

// Expose diagnostics on window for console debugging
if (typeof window !== 'undefined') {
  (window as any).__thumbDiag = getThumbnailDiagnostics;
}
