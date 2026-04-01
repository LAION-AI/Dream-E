/**
 * =============================================================================
 * BLOB URL CACHE + ASSET OFFLOADING
 * =============================================================================
 *
 * Converts base64 data URLs to blob URLs on demand and caches them.
 * Also provides asset offloading: replaces base64 strings on in-memory
 * project nodes with blob URLs, keeping binary data in native memory
 * (outside V8 heap). Before saving/exporting, blob URLs are converted
 * back to base64 from the cached Blobs.
 *
 * WHY THIS EXISTS:
 * Base64 data URLs (e.g. "data:image/png;base64,iVBOR...") are stored as
 * massive strings inside the Zustand store. Every reference to them is a
 * multi-megabyte string sitting on the JS heap. When a project has 20+
 * scenes each with a 1-3 MB image, the heap grows to hundreds of megabytes.
 *
 * Blob URLs (e.g. "blob:http://localhost:5173/abc-123") are ~50 byte
 * pointers. The actual binary data lives in the browser's native blob
 * storage, outside the V8 JS heap, and is managed by the browser's own
 * memory manager (which can page to disk under pressure).
 *
 * ASSET OFFLOADING FLOW:
 *   1. New OW scene created → base64 data URLs stored on node data
 *   2. After saving to IndexedDB → offloadProjectAssets() called
 *   3. Base64 strings replaced with blob URLs on in-memory nodes
 *   4. ~2MB base64 → ~50 byte blob URL per asset, binary data in native memory
 *   5. Before next save/export → rehydrateForSave() converts blob URLs back
 *      to base64 data URLs from the cached Blobs
 *
 * =============================================================================
 */

import type { Project } from '@/types';

// =============================================================================
// CACHES
// =============================================================================

/** Map from data URL fingerprint → blob URL */
const cache = new Map<string, string>();

/**
 * Map from blob URL → Blob object.
 * Keeps Blob references alive so we can reconstruct base64 data URLs
 * when saving to IndexedDB or exporting. The Blob's binary data lives
 * in native memory (outside V8 heap), not on the JS string heap.
 */
const blobStore = new Map<string, Blob>();

/**
 * Set of blob URLs that have been soft-evicted (removed from cache + blobStore
 * maps) but NOT yet revoked. These URLs are still valid — the browser keeps
 * the underlying blob data alive until URL.revokeObjectURL() is called.
 *
 * After a confirmed save to IndexedDB, revokeStaleEvictions() can safely
 * revoke these URLs to free native memory. This is the B4 fix — without it,
 * soft-evicted blob URLs accumulate native memory indefinitely.
 */
const softEvictedUrls = new Set<string>();

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Generates a short fingerprint for a data URL string.
 * Uses prefix + length + tail to identify unique data URLs without hashing
 * the entire multi-megabyte string.
 */
function fingerprint(dataUrl: string): string {
  const len = dataUrl.length;
  // Take first 80 chars (includes the mime type header) and last 32 chars
  const head = dataUrl.slice(0, 80);
  const tail = dataUrl.slice(-32);
  return `${head}|${len}|${tail}`;
}

/**
 * Returns a blob URL for the given source string.
 *
 * - If the input is already a blob URL or a regular http(s) URL, returns it as-is.
 * - If the input is a base64 data URL, converts it to a Blob and returns a
 *   blob URL. The result is cached so repeated calls with the same data URL
 *   return the same blob URL without re-converting.
 * - If the input is empty/undefined, returns an empty string.
 */
export function getBlobUrl(src: string | undefined): string {
  if (!src) return '';

  // Already a blob URL or a network URL — pass through
  if (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }

  // Not a data URL — pass through (shouldn't happen, but be safe)
  if (!src.startsWith('data:')) {
    return src;
  }

  // Check cache
  const fp = fingerprint(src);
  const cached = cache.get(fp);
  if (cached) return cached;

  // Convert data URL → Blob → blob URL
  try {
    const [header, base64] = src.split(',', 2);
    if (!base64) return src; // malformed data URL

    // Extract MIME type from "data:image/png;base64"
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

    // Decode base64 to binary
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mime });
    const blobUrl = URL.createObjectURL(blob);

    cache.set(fp, blobUrl);
    blobStore.set(blobUrl, blob); // Keep Blob alive for later base64 reconstruction

    return blobUrl;
  } catch (err) {
    console.warn('[BlobCache] Failed to convert data URL to blob URL:', err);
    return src; // Fall back to original data URL
  }
}

/**
 * Converts a blob URL back to a base64 data URL using the cached Blob.
 * If the blob URL is not in the store (e.g., evicted), falls back to
 * fetch() to retrieve the Blob from the browser's internal blob storage.
 * Returns null only if both methods fail (e.g., blob URL was revoked).
 * This is async because FileReader is used for reliable conversion.
 */
export function blobUrlToBase64(blobUrl: string): Promise<string | null> {
  // Try cached Blob first (fast path)
  let blob = blobStore.get(blobUrl);

  if (blob) {
    return blobToBase64(blob, blobUrl);
  }

  // Fallback: fetch() the blob URL — the browser may still have the
  // underlying object alive even if we removed it from our Map.
  // This is critical because evictBlobsExcept() removes from blobStore
  // but (after our fix) no longer revokes the URL.
  return fetch(blobUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`fetch returned ${res.status}`);
      return res.blob();
    })
    .then((fetchedBlob) => {
      // Re-register so future calls are fast
      blobStore.set(blobUrl, fetchedBlob);
      return blobToBase64(fetchedBlob, blobUrl);
    })
    .catch(() => {
      console.warn('[BlobCache] Cannot recover blob URL (revoked or expired):', blobUrl);
      return null;
    });
}

/**
 * Internal helper: reads a Blob as a base64 data URL via FileReader.
 */
function blobToBase64(blob: Blob, debugUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => {
      console.warn('[BlobCache] FileReader failed for blob URL:', debugUrl);
      resolve(null);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Revokes a specific blob URL and removes it from cache.
 * Call this when an asset is removed (e.g., image deleted from a scene).
 */
export function revokeBlobUrl(src: string | undefined): void {
  if (!src) return;

  // Handle both data URLs (via fingerprint) and direct blob URLs
  if (src.startsWith('data:')) {
    const fp = fingerprint(src);
    const blobUrl = cache.get(fp);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobStore.delete(blobUrl);
      cache.delete(fp);
    }
  } else if (src.startsWith('blob:')) {
    URL.revokeObjectURL(src);
    blobStore.delete(src);
    // Also remove from fingerprint cache if present
    for (const [fp, url] of cache.entries()) {
      if (url === src) {
        cache.delete(fp);
        break;
      }
    }
  }
}

/**
 * Revokes all cached blob URLs.
 * Call this when closing a project or when a major state reset happens.
 */
export function revokeAllBlobUrls(): void {
  for (const blobUrl of cache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  // Also revoke any soft-evicted URLs that haven't been hard-revoked yet
  for (const blobUrl of softEvictedUrls) {
    URL.revokeObjectURL(blobUrl);
  }
  cache.clear();
  blobStore.clear();
  softEvictedUrls.clear();
  console.log('[BlobCache] All blob URLs revoked');
}

/**
 * Returns the current cache size (number of entries).
 * Useful for debugging.
 */
export function getCacheSize(): number {
  return cache.size;
}

/**
 * Returns the number of Blobs kept alive in the store.
 */
export function getBlobStoreSize(): number {
  return blobStore.size;
}

/**
 * Soft-evicts blob URLs that are NOT in the retain set.
 * Used in player mode to reduce memory from non-essential scenes.
 *
 * SOFT EVICTION: Removes Blob references from our Maps (freeing the
 * large binary data from our explicit references) but does NOT call
 * URL.revokeObjectURL(). This means:
 * - The browser's native blob storage may reclaim the memory under pressure
 * - But the blob URL string still resolves (browser keeps a ref count
 *   for blob URLs until explicitly revoked)
 * - rehydrateForSave() can still fetch() the blob URL to get the data back
 *   even though our blobStore Map no longer holds a reference
 * - Existing <img> elements continue displaying correctly
 *
 * This prevents the catastrophic data loss scenario where:
 *   evict → revoke → save triggered → rehydrateForSave can't convert →
 *   delete field → IndexedDB loses the asset permanently
 *
 * @param retainBlobUrls - Set of blob URLs to keep alive (current + recent scenes)
 */
export function evictBlobsExcept(retainBlobUrls: Set<string>): number {
  let evicted = 0;

  // Walk the fingerprint → blobUrl cache, remove entries not in the retain set
  for (const [fp, blobUrl] of cache.entries()) {
    if (!retainBlobUrls.has(blobUrl)) {
      // Soft eviction: remove from our Maps but DON'T revoke the URL.
      // The browser still holds the blob data (ref-counted by the URL)
      // and fetch(blobUrl) can recover it for rehydrateForSave().
      // Track the URL so revokeStaleEvictions() can hard-revoke it later
      // after a confirmed save (B4 fix).
      blobStore.delete(blobUrl);
      cache.delete(fp);
      if (blobUrl.startsWith('blob:')) {
        softEvictedUrls.add(blobUrl);
      }
      evicted++;
    }
  }

  // Also check blobStore for blob URLs that may have been added directly
  // (without going through the fingerprint cache)
  for (const blobUrl of blobStore.keys()) {
    if (!retainBlobUrls.has(blobUrl)) {
      blobStore.delete(blobUrl);
      if (blobUrl.startsWith('blob:')) {
        softEvictedUrls.add(blobUrl);
      }
      evicted++;
    }
  }

  if (evicted > 0) {
    console.log(`[BlobCache] Soft-evicted ${evicted} blob entries (Maps cleared, URLs still valid, ${softEvictedUrls.size} pending hard-revoke). Remaining: cache=${cache.size}, store=${blobStore.size}`);
  }

  return evicted;
}

/**
 * Hard-revokes blob URLs that were previously soft-evicted.
 *
 * B4 FIX: Call this AFTER a confirmed save to IndexedDB. At that point the
 * asset data is safely persisted and the blob URLs are no longer needed for
 * recovery by rehydrateForSave(). Revoking them tells the browser it can
 * free the native memory (500KB-2MB per image).
 *
 * Safety: only revokes URLs that are NOT currently in blobStore (i.e., they
 * were soft-evicted and not re-registered). If a URL was re-added to the
 * store (e.g., the user navigated back to that scene), it's skipped.
 *
 * @param retainBlobUrls - Optional set of blob URLs to keep (e.g., currently
 *   displayed images). If provided, these won't be revoked even if they were
 *   previously soft-evicted.
 * @returns Number of blob URLs revoked
 */
export function revokeStaleEvictions(retainBlobUrls?: Set<string>): number {
  let revoked = 0;

  for (const blobUrl of softEvictedUrls) {
    // Don't revoke if it was re-registered in the store (scene revisited)
    if (blobStore.has(blobUrl)) {
      softEvictedUrls.delete(blobUrl);
      continue;
    }
    // Don't revoke if it's in the explicit retain set
    if (retainBlobUrls && retainBlobUrls.has(blobUrl)) {
      continue;
    }
    // Don't revoke if it's back in the fingerprint cache
    let inCache = false;
    for (const cachedUrl of cache.values()) {
      if (cachedUrl === blobUrl) { inCache = true; break; }
    }
    if (inCache) {
      softEvictedUrls.delete(blobUrl);
      continue;
    }

    // Safe to hard-revoke — data is in IndexedDB, not needed for recovery
    URL.revokeObjectURL(blobUrl);
    softEvictedUrls.delete(blobUrl);
    revoked++;
  }

  if (revoked > 0) {
    console.log(`[BlobCache] Hard-revoked ${revoked} stale blob URLs (native memory freed). Remaining soft-evicted: ${softEvictedUrls.size}`);
  }

  return revoked;
}

// =============================================================================
// ASSET OFFLOADING — Move binary data from V8 heap to native blob storage
// =============================================================================

/** Fields on SceneNode.data that hold large binary assets */
const SCENE_ASSET_FIELDS = ['backgroundImage', 'backgroundMusic', 'voiceoverAudio'] as const;

/**
 * Fields on co-write node types (storyRoot, plot, act, cowriteScene) that hold
 * large binary assets. These nodes have `image` and optionally `voiceoverAudio`
 * (TTS narration generated by Photo Story player) and `backgroundMusic`.
 */
const COWRITE_NODE_TYPES = new Set(['storyRoot', 'plot', 'act', 'cowriteScene']);
const COWRITE_ASSET_FIELDS = ['image', 'voiceoverAudio', 'backgroundMusic'] as const;

/** Fields on Entity that hold large binary assets */
const ENTITY_ASSET_FIELDS = ['referenceImage', 'referenceVoice', 'defaultMusic'] as const;

/**
 * Strips stale blob URLs from a project loaded from IndexedDB.
 *
 * Blob URLs (e.g. "blob:http://localhost:5173/abc-123") do NOT survive page
 * reloads — they're session-scoped browser objects. If a previous save wrote
 * dead blob URL strings to IndexedDB (because rehydration failed), those
 * strings are useless and will never resolve. This function detects and
 * clears them so they don't propagate further.
 *
 * IMPORTANT: Sets field to empty string '' instead of deleting it. This
 * preserves the field structure so downstream code doesn't break from
 * missing properties, and distinguishes "asset was lost" from "no asset
 * was ever set".
 *
 * Call this immediately after loading a project from IndexedDB, BEFORE
 * collectAssetReplacements() converts base64 → blob URLs.
 *
 * @returns Number of stale blob URLs cleaned
 */
export function cleanStaleBlobUrls(project: Project): number {
  let cleaned = 0;

  // Clean scene node assets
  for (const node of project.nodes) {
    if (node.type !== 'scene') continue;
    const data = node.data as Record<string, unknown>;
    for (const field of SCENE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('blob:') && !blobStore.has(val)) {
        console.warn(`[BlobCache] Cleaned stale blob URL from node ${node.id}.${field} — ` +
          `blob URL did not survive reload. Setting to empty.`);
        data[field] = ''; // preserve field, clear dead URL
        cleaned++;
      }
    }
  }

  // Clean co-write node assets (storyRoot, plot, act, cowriteScene)
  for (const node of project.nodes) {
    if (!COWRITE_NODE_TYPES.has(node.type)) continue;
    const data = node.data as Record<string, unknown>;
    for (const field of COWRITE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('blob:') && !blobStore.has(val)) {
        console.warn(`[BlobCache] Cleaned stale blob URL from cowrite node ${node.id}.${field} — ` +
          `blob URL did not survive reload. Setting to empty.`);
        data[field] = '';
        cleaned++;
      }
    }
  }

  // Clean entity assets
  for (const entity of (project.entities || [])) {
    const e = entity as unknown as Record<string, unknown>;
    for (const field of ENTITY_ASSET_FIELDS) {
      const val = e[field];
      if (typeof val === 'string' && val.startsWith('blob:') && !blobStore.has(val)) {
        console.warn(`[BlobCache] Cleaned stale blob URL from entity ${entity.id}.${field} — ` +
          `blob URL did not survive reload. Setting to empty.`);
        e[field] = ''; // preserve field, clear dead URL
        cleaned++;
      }
    }
  }

  // Clean coverImage — offloadAssetsInPlace() converts this to blob URL,
  // and if rehydrateForSave() was missing it (now fixed), stale blob URLs
  // could have been persisted to IndexedDB.
  if (project.info.coverImage &&
      project.info.coverImage.startsWith('blob:') &&
      !blobStore.has(project.info.coverImage)) {
    console.warn('[BlobCache] Cleaned stale blob URL from project coverImage');
    project.info.coverImage = '';
    cleaned++;
  }

  if (cleaned > 0) {
    console.error(`[BlobCache] WARNING: ${cleaned} asset(s) had stale blob URLs from a previous session. ` +
      `This means a save occurred while blob data was evicted. ` +
      `The underlying base64 data may still be in a prior IndexedDB save. ` +
      `Affected entities/nodes need their assets re-uploaded.`);
  }

  return cleaned;
}

/**
 * Scans all nodes and entities in a project, converts any base64 data URLs
 * to blob URLs, and returns a list of replacements to apply.
 *
 * This does NOT mutate the project — it only reads data URLs and creates
 * Blobs. Call this OUTSIDE of an Immer producer, then apply the returned
 * replacements inside one.
 *
 * Each getBlobUrl() call temporarily uses ~3x the data size during atob()
 * conversion, but the temporary memory is freed immediately after.
 */
export function collectAssetReplacements(project: Project): Array<{
  type: 'node' | 'entity';
  id: string;
  field: string;
  blobUrl: string;
}> {
  const replacements: Array<{ type: 'node' | 'entity'; id: string; field: string; blobUrl: string }> = [];

  // Scene node assets
  for (const node of project.nodes) {
    if (node.type !== 'scene') continue;
    const data = node.data as Record<string, unknown>;
    for (const field of SCENE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('data:') && val.length > 200) {
        const blobUrl = getBlobUrl(val);
        if (blobUrl !== val) { // successfully converted
          replacements.push({ type: 'node', id: node.id, field, blobUrl });
        }
      }
    }
  }

  // Co-write node assets (storyRoot, plot, act, cowriteScene)
  for (const node of project.nodes) {
    if (!COWRITE_NODE_TYPES.has(node.type)) continue;
    const data = node.data as Record<string, unknown>;
    for (const field of COWRITE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('data:') && val.length > 200) {
        const blobUrl = getBlobUrl(val);
        if (blobUrl !== val) {
          replacements.push({ type: 'node', id: node.id, field, blobUrl });
        }
      }
    }
  }

  // Entity assets
  for (const entity of (project.entities || [])) {
    const e = entity as unknown as Record<string, unknown>;
    for (const field of ENTITY_ASSET_FIELDS) {
      const val = e[field];
      if (typeof val === 'string' && val.startsWith('data:') && val.length > 200) {
        const blobUrl = getBlobUrl(val as string);
        if (blobUrl !== val) {
          replacements.push({ type: 'entity', id: entity.id, field, blobUrl });
        }
      }
    }
  }

  return replacements;
}

/**
 * Converts all base64 data URLs in a project to blob URLs IN PLACE.
 *
 * Unlike collectAssetReplacements() which returns a list and requires a
 * separate Immer-safe mutation step, this function mutates the raw project
 * object directly. This is critical for the load-time OOM fix:
 *
 * BEFORE (old flow):
 *   1. getProject() → 100MB of base64 strings on heap
 *   2. state.currentProject = project → still 100MB
 *   3. snapshotProjectLean() → structuredClone → another 100MB transient
 *   4. setTimeout → collectAssetReplacements → creates ALL blobs while
 *      base64 strings still exist → another 100MB transient
 *   Peak: ~300MB for a 100MB project → OOM
 *
 * AFTER (new flow):
 *   1. getProject() → 100MB of base64 strings on heap
 *   2. offloadAssetsInPlace() → converts ONE asset at a time, replacing
 *      the field immediately so each 2MB base64 string can be GC'd
 *   3. After all assets: project has blob URLs (~50 bytes each) → ~5MB
 *   4. state.currentProject = project → 5MB
 *   5. snapshotProjectLean() → structuredClone → 5MB transient
 *   Peak: ~105MB (initial load + one conversion at a time)
 *
 * Call this on the raw project from IndexedDB BEFORE setting it into
 * Zustand/Immer state.
 *
 * @returns Number of assets offloaded
 */
export function offloadAssetsInPlace(project: Project): number {
  let count = 0;

  // Scene node assets — process one at a time so each base64 string
  // can be GC'd after its field is replaced with the tiny blob URL.
  for (const node of project.nodes) {
    if (node.type !== 'scene') continue;
    const data = node.data as Record<string, unknown>;
    for (const field of SCENE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('data:') && val.length > 200) {
        const blobUrl = getBlobUrl(val);
        if (blobUrl !== val) {
          data[field] = blobUrl; // Replace immediately → base64 can be GC'd
          count++;
        }
      }
    }
  }

  // Co-write node assets (storyRoot, plot, act, cowriteScene) — these have
  // image, voiceoverAudio, and backgroundMusic fields that may hold large
  // base64 data URLs (especially TTS audio from Photo Story player).
  for (const node of project.nodes) {
    if (!COWRITE_NODE_TYPES.has(node.type)) continue;
    const data = node.data as Record<string, unknown>;
    for (const field of COWRITE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('data:') && val.length > 200) {
        const blobUrl = getBlobUrl(val);
        if (blobUrl !== val) {
          data[field] = blobUrl;
          count++;
        }
      }
    }
  }

  // Entity assets
  for (const entity of (project.entities || [])) {
    const e = entity as unknown as Record<string, unknown>;
    for (const field of ENTITY_ASSET_FIELDS) {
      const val = e[field];
      if (typeof val === 'string' && val.startsWith('data:') && val.length > 200) {
        const blobUrl = getBlobUrl(val as string);
        if (blobUrl !== val) {
          e[field] = blobUrl;
          count++;
        }
      }
    }
  }

  // Cover image on project info
  if (project.info.coverImage &&
      project.info.coverImage.startsWith('data:') &&
      project.info.coverImage.length > 200) {
    const blobUrl = getBlobUrl(project.info.coverImage);
    if (blobUrl !== project.info.coverImage) {
      project.info.coverImage = blobUrl;
      count++;
    }
  }

  return count;
}

/**
 * Prepares a project for persistence by converting any blob URLs back to
 * base64 data URLs from the cached Blobs. Returns a deep clone with all
 * blob URLs resolved.
 *
 * Call this before writing to IndexedDB or exporting to ZIP.
 * The clone is cheap because blob URL strings are ~50 bytes each;
 * the heavy work is the async Blob→base64 conversion via FileReader.
 */
export async function rehydrateForSave(project: Project): Promise<Project> {
  // Structured clone is cheap when assets are blob URLs (~50 bytes each)
  // instead of multi-MB base64 strings.
  const copy = structuredClone(project);

  // Collect conversion tasks as lazy functions — NOT started yet.
  // This lets us run them in small batches to limit concurrent memory.
  // Each FileReader reads a Blob and creates a multi-MB base64 string;
  // running all 50+ at once would spike memory by 100MB+. Batches of 3
  // keep the spike to ~6MB while still being fast.
  const tasks: Array<() => Promise<void>> = [];

  // Rehydrate scene node assets
  for (const node of copy.nodes) {
    if (node.type !== 'scene') continue;
    const data = node.data as Record<string, unknown>;
    for (const field of SCENE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('blob:')) {
        tasks.push(async () => {
          const base64 = await blobUrlToBase64(val);
          if (base64) {
            data[field] = base64;
          } else {
            console.error(`[BlobCache] Rehydration FAILED for node ${node.id}.${field} — ` +
              `blob URL is dead and cannot be recovered. Asset data is lost.`);
            data[field] = '';
          }
        });
      }
    }
  }

  // Rehydrate co-write node assets (storyRoot, plot, act, cowriteScene)
  for (const node of copy.nodes) {
    if (!COWRITE_NODE_TYPES.has(node.type)) continue;
    const data = node.data as Record<string, unknown>;
    for (const field of COWRITE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('blob:')) {
        tasks.push(async () => {
          const base64 = await blobUrlToBase64(val);
          if (base64) {
            data[field] = base64;
          } else {
            console.error(`[BlobCache] Rehydration FAILED for cowrite node ${node.id}.${field} — ` +
              `blob URL is dead and cannot be recovered. Asset data is lost.`);
            data[field] = '';
          }
        });
      }
    }
  }

  // Rehydrate entity assets
  for (const entity of (copy.entities || [])) {
    const e = entity as unknown as Record<string, unknown>;
    for (const field of ENTITY_ASSET_FIELDS) {
      const val = e[field];
      if (typeof val === 'string' && val.startsWith('blob:')) {
        tasks.push(async () => {
          const base64 = await blobUrlToBase64(val);
          if (base64) {
            e[field] = base64;
          } else {
            console.error(`[BlobCache] Rehydration FAILED for entity ${entity.id}.${field} — ` +
              `blob URL is dead and cannot be recovered. Asset data is lost.`);
            e[field] = '';
          }
        });
      }
    }
  }

  // Rehydrate coverImage on project info — offloadAssetsInPlace() converts
  // this to a blob URL but the loops above only handle scene/entity fields.
  // Without this, coverImage gets written to IndexedDB as a dead blob URL
  // string that won't survive page reloads, causing broken project thumbnails.
  if (copy.info.coverImage && copy.info.coverImage.startsWith('blob:')) {
    tasks.push(async () => {
      const base64 = await blobUrlToBase64(copy.info.coverImage!);
      if (base64) {
        copy.info.coverImage = base64;
      } else {
        console.error('[BlobCache] Rehydration FAILED for coverImage — blob URL is dead.');
        copy.info.coverImage = '';
      }
    });
  }

  if (tasks.length > 0) {
    console.log(`[BlobCache] Rehydrating ${tasks.length} blob URLs → base64 for save...`);

    // Process in batches of 3 — start each batch only after the previous
    // batch completes, so at most 3 multi-MB base64 strings exist at once.
    const BATCH_SIZE = 3;
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((fn) => fn()));
    }

    console.log('[BlobCache] Rehydration complete');
  }

  return copy;
}

// =============================================================================
// BLOB REGISTRATION (for external producers like TTS/music)
// =============================================================================

/**
 * Register a pre-created Blob and its blob URL in the cache so that
 * rehydrateForSave() can convert it back to base64 later.
 *
 * Use this when you already have a Blob + blob URL created externally
 * (e.g., from URL.createObjectURL) and want the cache to know about it
 * for save/export rehydration. Without registration, revoke/eviction
 * won't know about these blob URLs and rehydrateForSave() can't convert
 * them back to base64.
 */
export function registerBlob(blobUrl: string, blob: Blob): void {
  blobStore.set(blobUrl, blob);
}

// =============================================================================
// MEMORY DIAGNOSTICS
// =============================================================================

/**
 * Returns a diagnostic summary of memory usage related to the blob cache
 * and optionally the current project's asset sizes.
 */
export function getMemoryDiagnostics(project?: Project | null): {
  blobCacheEntries: number;
  blobStoreEntries: number;
  estimatedBlobBytes: number;
  jsHeapUsed?: number;
  jsHeapTotal?: number;
  jsHeapLimit?: number;
  projectAssetStats?: {
    totalBase64Bytes: number;
    totalBlobUrlCount: number;
    nodeCount: number;
    entityCount: number;
  };
} {
  // Estimate total Blob sizes in native memory
  let estimatedBlobBytes = 0;
  for (const blob of blobStore.values()) {
    estimatedBlobBytes += blob.size;
  }

  const result: ReturnType<typeof getMemoryDiagnostics> = {
    blobCacheEntries: cache.size,
    blobStoreEntries: blobStore.size,
    estimatedBlobBytes,
  };

  // V8 heap stats (Chrome/Edge only)
  const perf = (performance as any);
  if (perf.memory) {
    result.jsHeapUsed = perf.memory.usedJSHeapSize;
    result.jsHeapTotal = perf.memory.totalJSHeapSize;
    result.jsHeapLimit = perf.memory.jsHeapSizeLimit;
  }

  // Project asset stats
  if (project) {
    let totalBase64Bytes = 0;
    let totalBlobUrlCount = 0;

    for (const node of project.nodes) {
      if (node.type !== 'scene') continue;
      const data = node.data as Record<string, unknown>;
      for (const field of SCENE_ASSET_FIELDS) {
        const val = data[field];
        if (typeof val === 'string') {
          if (val.startsWith('data:')) {
            totalBase64Bytes += val.length;
          } else if (val.startsWith('blob:')) {
            totalBlobUrlCount++;
          }
        }
      }
    }
    for (const entity of (project.entities || [])) {
      const e = entity as unknown as Record<string, unknown>;
      for (const field of ENTITY_ASSET_FIELDS) {
        const val = e[field];
        if (typeof val === 'string') {
          if (val.startsWith('data:')) {
            totalBase64Bytes += val.length;
          } else if (val.startsWith('blob:')) {
            totalBlobUrlCount++;
          }
        }
      }
    }

    result.projectAssetStats = {
      totalBase64Bytes,
      totalBlobUrlCount,
      nodeCount: project.nodes.length,
      entityCount: (project.entities || []).length,
    };
  }

  return result;
}

// Expose diagnostics on window for console debugging
if (typeof window !== 'undefined') {
  (window as any).__blobDiag = getMemoryDiagnostics;

  /**
   * DIAGNOSTIC: Memory timeline — logs heap + blob stats at a configurable interval.
   * Usage: window.__memoryTimeline(5000) to log every 5 seconds.
   * Returns a stop function: const stop = window.__memoryTimeline(5000); stop();
   */
  (window as any).__memoryTimeline = (intervalMs: number = 5000) => {
    const entries: Array<{ ts: number; heapMB: number; blobCount: number; blobMB: number }> = [];
    console.log(`[MemoryTimeline] Started. Logging every ${intervalMs}ms. Call returned function to stop.`);

    const id = setInterval(() => {
      const diag = getMemoryDiagnostics();
      const entry = {
        ts: Date.now(),
        heapMB: diag.jsHeapUsed ? Math.round(diag.jsHeapUsed / 1024 / 1024) : -1,
        blobCount: diag.blobStoreEntries,
        blobMB: Math.round(diag.estimatedBlobBytes / 1024 / 1024),
      };
      entries.push(entry);
      console.log(`[MemoryTimeline] Heap: ${entry.heapMB}MB | Blobs: ${entry.blobCount} (${entry.blobMB}MB native) | Δt: ${entries.length * intervalMs / 1000}s`);
    }, intervalMs);

    return () => {
      clearInterval(id);
      console.log('[MemoryTimeline] Stopped.', entries.length, 'samples collected.');
      console.table(entries);
    };
  };
}
