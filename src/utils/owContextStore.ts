/**
 * =============================================================================
 * TRANSIENT OW CONTEXT STORE
 * =============================================================================
 *
 * Stores constructedContext, constructedSystemPrompt, and rawAiResponse strings
 * in a module-scoped Map (outside the Zustand/project store). These strings are
 * only needed for the debug viewer (Brain/FileText icons in play mode and the
 * SceneInspector "View AI Response" panel). They are NOT needed for gameplay
 * or persistence.
 *
 * WHY THIS EXISTS:
 * Previously these strings were stored directly on project node.data. Because
 * the context for scene N includes ALL prior scenes, the total memory grows
 * O(N²) — after 100 scenes, ~15-50 MB of V8 heap just for context strings.
 * Worse, they were included in structuredClone during saves, doubling the cost.
 *
 * By moving them here:
 *   - They are NOT persisted to IndexedDB (not needed for save/load)
 *   - They are NOT cloned during structuredClone/rehydrateForSave
 *   - They are NOT included in undo/redo snapshots
 *   - We can cap the store to only keep the N most recent entries
 *   - Total memory: only the most recent entries, not cumulative
 *
 * =============================================================================
 */

/** Maximum number of scene contexts to retain in memory */
const MAX_ENTRIES = 5;

interface ContextEntry {
  rawAiResponse?: string;
  constructedContext?: string;
  constructedSystemPrompt?: string;
  timestamp: number;
}

/** Transient context storage: nodeId → context data */
const store = new Map<string, ContextEntry>();

/** Insertion-order tracking for LRU eviction */
const insertionOrder: string[] = [];

/**
 * Store context data for a scene node. Evicts oldest entries when
 * the store exceeds MAX_ENTRIES.
 */
export function setOwContext(
  nodeId: string,
  data: {
    rawAiResponse?: string;
    constructedContext?: string;
    constructedSystemPrompt?: string;
  }
): void {
  // If already exists, remove from insertion order (will be re-added at end)
  const existingIdx = insertionOrder.indexOf(nodeId);
  if (existingIdx !== -1) {
    insertionOrder.splice(existingIdx, 1);
  }

  store.set(nodeId, { ...data, timestamp: Date.now() });
  insertionOrder.push(nodeId);

  // Evict oldest entries beyond the cap
  while (insertionOrder.length > MAX_ENTRIES) {
    const oldestId = insertionOrder.shift()!;
    store.delete(oldestId);
  }
}

/**
 * Retrieve context data for a scene node.
 * Returns undefined if the node's context was never stored or was evicted.
 */
export function getOwContext(nodeId: string): ContextEntry | undefined {
  return store.get(nodeId);
}

/**
 * Clear all stored contexts. Call on project close or game end.
 */
export function clearOwContextStore(): void {
  store.clear();
  insertionOrder.length = 0;
}

/**
 * Diagnostic: returns the current store size and total bytes of stored strings.
 */
export function getOwContextDiagnostics(): {
  entryCount: number;
  maxEntries: number;
  totalBytes: number;
} {
  let totalBytes = 0;
  for (const entry of store.values()) {
    totalBytes += (entry.rawAiResponse?.length || 0);
    totalBytes += (entry.constructedContext?.length || 0);
    totalBytes += (entry.constructedSystemPrompt?.length || 0);
  }
  return {
    entryCount: store.size,
    maxEntries: MAX_ENTRIES,
    totalBytes,
  };
}

// Expose diagnostics on window for console debugging
if (typeof window !== 'undefined') {
  (window as any).__owContextDiag = getOwContextDiagnostics;
}
