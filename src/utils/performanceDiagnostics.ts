/**
 * =============================================================================
 * PERFORMANCE DIAGNOSTICS MODULE
 * =============================================================================
 *
 * Exposes diagnostic functions on `window.__perfDiag` for console-based
 * performance investigation. All functions are read-only and non-invasive —
 * they gather metrics from existing diagnostic hooks without mutating state.
 *
 * USAGE (browser console):
 *   window.__perfDiag.summary()    — Complete health check
 *   window.__perfDiag.blobs()      — Blob cache/store/eviction metrics
 *   window.__perfDiag.audio()      — Howl instance tracking
 *   window.__perfDiag.thumbs()     — Thumbnail cache efficiency
 *   window.__perfDiag.renders()    — SceneNode render count info
 *   window.__perfDiag.notes()      — Notes sync diagnostic info
 *   window.__perfDiag.timeline(ms) — Continuous monitoring at interval
 *
 * =============================================================================
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Blob diagnostics — reads from window.__blobDiag (exposed by blobCache.ts)
 * and the softEvictedUrls set size (exposed indirectly).
 */
function blobDiag(): Record<string, unknown> {
  const w = window as any;
  const diag = w.__blobDiag?.();
  if (!diag) {
    return { error: '__blobDiag not available — blobCache.ts not loaded' };
  }
  return {
    blobCacheEntries: diag.blobCacheEntries,
    blobStoreEntries: diag.blobStoreEntries,
    nativeBlobMB: (diag.estimatedBlobBytes / 1024 / 1024).toFixed(1),
    heapUsedMB: diag.jsHeapUsed ? (diag.jsHeapUsed / 1024 / 1024).toFixed(0) : 'N/A',
    heapLimitMB: diag.jsHeapLimit ? (diag.jsHeapLimit / 1024 / 1024).toFixed(0) : 'N/A',
    heapPercent: diag.jsHeapUsed && diag.jsHeapLimit
      ? ((diag.jsHeapUsed / diag.jsHeapLimit) * 100).toFixed(1) + '%'
      : 'N/A',
    projectBase64MB: diag.projectAssetStats
      ? (diag.projectAssetStats.totalBase64Bytes / 1024 / 1024).toFixed(1)
      : 'N/A',
    projectBlobUrls: diag.projectAssetStats?.totalBlobUrlCount ?? 'N/A',
    status: (() => {
      const issues: string[] = [];
      if (diag.jsHeapUsed && diag.jsHeapLimit) {
        const pct = diag.jsHeapUsed / diag.jsHeapLimit;
        if (pct > 0.8) issues.push('HEAP > 80%');
        if (pct > 0.9) issues.push('CRITICAL: HEAP > 90%');
      }
      if (diag.projectAssetStats?.totalBase64Bytes > 10 * 1024 * 1024) {
        issues.push('> 10MB base64 on heap (should be blob URLs)');
      }
      if (diag.blobStoreEntries > 30) {
        issues.push(`${diag.blobStoreEntries} blobs in store (high)`);
      }
      return issues.length > 0 ? '⚠ ' + issues.join('; ') : '✓ Healthy';
    })(),
  };
}

/**
 * Audio diagnostics — reads from window.__audioAudit (exposed by AdventureEngine)
 */
function audioDiag(): Record<string, unknown> {
  const w = window as any;
  const audit = w.__audioAudit?.();
  if (!audit) {
    return { info: '__audioAudit not available (only in player mode)' };
  }
  return {
    totalCreated: audit.totalCreated,
    orphanedInstances: audit.orphanedInstances,
    activeInstances: audit.activeInstances ?? 'N/A',
    status: audit.orphanedInstances > 2 ? '⚠ Audio leak likely' : '✓ OK',
  };
}

/**
 * Thumbnail diagnostics — reads from window.__thumbDiag (exposed by thumbnailCache.ts)
 * and window.__visibleThumbs (exposed by SceneNode.tsx)
 */
function thumbDiag(): Record<string, unknown> {
  const w = window as any;
  const thumb = w.__thumbDiag?.();
  const visible = w.__visibleThumbs?.();
  return {
    cacheSize: thumb?.cacheSize ?? 'N/A',
    maxCache: thumb?.maxCache ?? 'N/A',
    pendingGenerations: thumb?.pendingCount ?? 'N/A',
    visibleSlots: visible ? `${visible.active}/${visible.max}` : 'N/A',
    status: (() => {
      const issues: string[] = [];
      if (thumb?.pendingCount > 10) issues.push(`${thumb.pendingCount} pending (high)`);
      if (visible?.active >= visible?.max) issues.push('All slots full');
      return issues.length > 0 ? '⚠ ' + issues.join('; ') : '✓ OK';
    })(),
  };
}

/**
 * Render diagnostics — instructions for SceneNode render counting.
 * Requires window.__renderDiag = true to be set first.
 */
function renderDiag(): Record<string, unknown> {
  const w = window as any;
  return {
    renderDiagEnabled: !!w.__renderDiag,
    instructions: w.__renderDiag
      ? 'Render counting active. Check console for [RenderDiag] SceneNode messages. Zoom/pan to trigger.'
      : 'Set window.__renderDiag = true to enable SceneNode render counting.',
    notesDiagEnabled: !!w.__notesDiag,
    notesInstructions: w.__notesDiag
      ? 'Notes sync tracking active. Check console for [NotesDiag] messages.'
      : 'Set window.__notesDiag = true to enable notes sync tracking.',
  };
}

/**
 * Complete health check — runs all diagnostics and prints a summary table.
 */
function summary(): void {
  console.group('═══ Dream-E Performance Health Check ═══');

  console.group('1. Memory (Blobs)');
  console.table(blobDiag());
  console.groupEnd();

  console.group('2. Audio');
  console.table(audioDiag());
  console.groupEnd();

  console.group('3. Thumbnails');
  console.table(thumbDiag());
  console.groupEnd();

  console.group('4. Render Diagnostics');
  console.table(renderDiag());
  console.groupEnd();

  // Listener audit (if available)
  const w = window as any;
  const listeners = w.__listenerAudit?.();
  if (listeners) {
    console.group('5. Event Listeners');
    console.table({
      added: listeners.totalAdded,
      removed: listeners.totalRemoved,
      leaked: listeners.leaked,
      status: listeners.leaked > 4 ? '⚠ Listener leak' : '✓ OK',
    });
    console.groupEnd();
  }

  console.groupEnd();
}

/**
 * Timeline — continuous monitoring at an interval.
 * Logs a compact summary line every `intervalMs` milliseconds.
 * Returns a stop function.
 *
 * Usage:
 *   const stop = window.__perfDiag.timeline(5000)
 *   // ... play/edit for a while ...
 *   stop()  // prints collected samples as a table
 */
function timeline(intervalMs: number = 5000): () => void {
  const w = window as any;
  const samples: Array<Record<string, unknown>> = [];
  const startTime = Date.now();

  console.log(`[PerfTimeline] Started. Sampling every ${intervalMs}ms. Call returned function to stop.`);

  const id = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const blob = w.__blobDiag?.() || {};
    const thumb = w.__thumbDiag?.() || {};
    const visible = w.__visibleThumbs?.() || {};
    const audio = w.__audioAudit?.() || {};

    const sample = {
      time: `${elapsed}s`,
      heapMB: blob.jsHeapUsed ? Math.round(blob.jsHeapUsed / 1024 / 1024) : -1,
      blobStore: blob.blobStoreEntries ?? 0,
      nativeMB: blob.estimatedBlobBytes ? (blob.estimatedBlobBytes / 1024 / 1024).toFixed(1) : '0',
      thumbs: `${thumb.cacheSize ?? 0}/${thumb.maxCache ?? 0}`,
      thumbSlots: `${visible.active ?? 0}/${visible.max ?? 0}`,
      howls: audio.totalCreated ?? 0,
      orphanHowls: audio.orphanedInstances ?? 0,
    };

    samples.push(sample);
    console.log(
      `[PerfTimeline] ${sample.time} | Heap: ${sample.heapMB}MB | ` +
      `Blobs: ${sample.blobStore} (${sample.nativeMB}MB) | ` +
      `Thumbs: ${sample.thumbs} [${sample.thumbSlots} visible] | ` +
      `Howls: ${sample.howls} (${sample.orphanHowls} orphaned)`
    );
  }, intervalMs);

  return () => {
    clearInterval(id);
    console.log(`[PerfTimeline] Stopped. ${samples.length} samples collected.`);
    if (samples.length > 0) console.table(samples);
  };
}

// =============================================================================
// EXPOSE ON WINDOW
// =============================================================================

if (typeof window !== 'undefined') {
  (window as any).__perfDiag = {
    summary,
    blobs: blobDiag,
    audio: audioDiag,
    thumbs: thumbDiag,
    renders: renderDiag,
    notes: renderDiag, // notes diag info is included in renderDiag
    timeline,
  };

  console.log('[PerfDiag] Performance diagnostics loaded. Run window.__perfDiag.summary() for health check.');
}
