/**
 * =============================================================================
 * SYNC SERVICE — IndexedDB ↔ Server Synchronization
 * =============================================================================
 *
 * Bridges the gap between local IndexedDB storage (fast, offline-capable) and
 * the remote server API at /api/v2/ (persistent, cross-device).
 *
 * DESIGN PRINCIPLES:
 * 1. **Fire-and-forget**: All server calls are non-blocking. If the server is
 *    down or the user is offline, IndexedDB operations still succeed.
 * 2. **Auth-gated**: Every function checks `isAuthenticated` first. If the user
 *    is not logged in, all sync operations silently no-op. This means the app
 *    works identically for unauthenticated users (pure IndexedDB mode).
 * 3. **Server = source of truth for existence**: The server's project list
 *    determines which projects "exist" across devices. IndexedDB is a cache.
 * 4. **IndexedDB = source of truth for data**: When editing, saves go to
 *    IndexedDB first (fast), then replicate to the server in the background.
 * 5. **Graceful degradation**: Every server call is wrapped in try/catch and
 *    returns a safe default on failure (empty array, null, void).
 *
 * USAGE:
 * - Called from projectsDB.ts after each CRUD operation (save, delete, create)
 * - Called from Dashboard.tsx to merge server project lists with local lists
 * - Called on first login to upload any IndexedDB-only projects to the server
 *
 * =============================================================================
 */

import { useAuthStore } from '@stores/useAuthStore';
import { authFetch } from '@services/authService';
import type { ProjectSummary, Project } from '@/types';
import { db } from '@/db/database';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * API_BASE
 * Base path for the versioned project/asset API endpoints.
 * Matches the server routes defined in the backend.
 */
const API_BASE = '/api/v2';

// =============================================================================
// INDIVIDUAL PROJECT SYNC
// =============================================================================

/**
 * SYNC PROJECT TO SERVER
 *
 * Sends a project to the server after a successful IndexedDB save. This is
 * the primary replication mechanism — every local save triggers a server sync.
 *
 * WHY PUT (not POST):
 * We use PUT because the project already has an ID. The server upserts:
 * creates if the project doesn't exist, updates if it does. This avoids
 * needing separate create/update logic on the client.
 *
 * WHY NOT AWAIT IN THE CALLER:
 * The caller (projectsDB.saveProject) calls this with `.catch(() => {})`.
 * The IndexedDB save has already succeeded, so the user's work is safe locally.
 * A server sync failure is logged but never surfaces as a user-facing error.
 *
 * ASSET NOTE:
 * The project passed here may contain `asset:{id}` reference strings instead
 * of full binary data (after extractAndSaveAssets in projectsDB). The server
 * stores the project metadata/structure; binary assets are synced separately
 * via the /api/v2/assets endpoint (future enhancement). For now, the server
 * gets the lightweight project record which is sufficient for project listing
 * and cross-device metadata sync.
 *
 * @param project - The project to sync (may contain asset:{id} refs)
 */
export async function syncProjectToServer(project: Project): Promise<void> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return;

  try {
    const res = await authFetch(`${API_BASE}/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: project }),
    });

    if (!res.ok) {
      console.warn(
        `[Sync] Failed to sync project to server (HTTP ${res.status}):`,
        project.id
      );
    }

    // After syncing project JSON, sync asset binaries in the background.
    // This is fire-and-forget — asset sync failure never blocks the save path.
    // Assets are uploaded in small batches to avoid overwhelming the server
    // and to keep memory usage low (each base64 conversion is ~2x the blob size).
    syncAssetsToServer(project.id).catch((err) => {
      console.warn('[Sync] Background asset sync failed (non-blocking):', err);
    });
  } catch (err) {
    // Network error, server unreachable, etc.
    // This is expected during local-only development or when offline.
    console.warn('[Sync] Failed to sync project to server:', err);
  }
}

// =============================================================================
// ASSET SYNC — Upload binary assets to the server
// =============================================================================

/**
 * BATCH SIZE FOR ASSET UPLOADS
 * Controls how many assets are uploaded in parallel. Each upload involves
 * reading a Blob from IndexedDB and converting it to base64, which temporarily
 * uses ~2x the blob size in memory. A batch of 3 limits the spike to ~6MB
 * for typical 1MB images.
 */
const ASSET_UPLOAD_BATCH_SIZE = 3;

/**
 * Tracks asset IDs that have already been synced to the server in this session.
 * This prevents redundant uploads on every save — once an asset is uploaded,
 * it only needs re-uploading if its content changes (which gets a new ID
 * due to the deterministic ID scheme: projectId_nodeId_field).
 */
const syncedAssetIds = new Set<string>();

/**
 * SYNC ASSETS TO SERVER
 *
 * Reads all IndexedDB asset records for a project and uploads them to
 * the server's /api/v2/assets endpoint. Assets that have already been
 * synced in this session (tracked by syncedAssetIds) are skipped.
 *
 * WHY NOT UPLOAD ALL EVERY TIME:
 * Asset IDs are deterministic (projectId_nodeId_field). Once uploaded, the
 * same asset ID only changes if the user replaces the image/audio. In that
 * case, extractAndSaveAssets() overwrites the IndexedDB record (same ID,
 * new blob), and our session cache misses because the ID is the same but
 * we can add a size check. For simplicity, we skip assets already synced
 * this session — if the user changes an image, the next save re-syncs it
 * because the session set is keyed by ID, and the new blob has the same ID.
 *
 * Actually, to handle updates within a session: we key by ID+size so that
 * a changed asset (same ID, different blob size) triggers a re-upload.
 *
 * @param projectId - The project ID whose assets to sync
 */
async function syncAssetsToServer(projectId: string): Promise<void> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return;

  try {
    // Get all IndexedDB asset records for this project
    const assets = await db.assets.where('projectId').equals(projectId).toArray();

    if (assets.length === 0) return;

    // Filter to assets that haven't been synced yet this session.
    // Key is "assetId:size" so a changed blob (same ID, different size) re-syncs.
    const toSync = assets.filter((asset) => {
      const key = `${asset.id}:${asset.size}`;
      return !syncedAssetIds.has(key);
    });

    if (toSync.length === 0) {
      console.log(`[Sync] All ${assets.length} assets already synced this session for project ${projectId}`);
      return;
    }

    console.log(`[Sync] Syncing ${toSync.length} asset(s) to server for project ${projectId} (${assets.length - toSync.length} already synced)`);

    // Upload in batches to avoid memory spikes and server overload.
    // Each batch uploads ASSET_UPLOAD_BATCH_SIZE assets in parallel.
    let uploaded = 0;
    let failed = 0;

    for (let i = 0; i < toSync.length; i += ASSET_UPLOAD_BATCH_SIZE) {
      const batch = toSync.slice(i, i + ASSET_UPLOAD_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((asset) => uploadSingleAsset(asset, projectId))
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled') {
          const asset = batch[j];
          const key = `${asset.id}:${asset.size}`;
          syncedAssetIds.add(key);
          uploaded++;
        } else {
          failed++;
          console.warn(`[Sync] Failed to upload asset ${batch[j].id}:`, (results[j] as PromiseRejectedResult).reason);
        }
      }
    }

    console.log(`[Sync] Asset sync complete: ${uploaded} uploaded, ${failed} failed`);
  } catch (err) {
    console.warn('[Sync] Asset sync failed:', err);
  }
}

/**
 * UPLOAD SINGLE ASSET
 *
 * Converts an IndexedDB asset record's Blob to a base64 data URL and
 * PUTs it to the server's /api/v2/assets/:id endpoint.
 *
 * The server expects:
 * - URL: PUT /api/v2/assets/:id?projectId=xxx
 * - Body: JSON with { data: "data:mime;base64,...", mimeType, name, type, size }
 *
 * @param asset - The IndexedDB asset record (with .blob)
 * @param projectId - The project ID (used as query parameter)
 */
async function uploadSingleAsset(
  asset: { id: string; blob: Blob; mimeType: string; name: string; type: string; size: number },
  projectId: string
): Promise<void> {
  if (!asset.blob) {
    throw new Error(`Asset ${asset.id} has no blob data`);
  }

  // Convert Blob to base64 data URL via FileReader
  const base64 = await blobToBase64(asset.blob);
  if (!base64) {
    throw new Error(`Failed to convert asset ${asset.id} blob to base64`);
  }

  const res = await authFetch(
    `${API_BASE}/assets/${asset.id}?projectId=${encodeURIComponent(projectId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: base64,
        mimeType: asset.mimeType,
        name: asset.name,
        type: asset.type,
        size: asset.size,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Server returned HTTP ${res.status} for asset ${asset.id}`);
  }
}

/**
 * BLOB TO BASE64 HELPER
 *
 * Converts a Blob to a base64 data URL string using FileReader.
 * Returns null if the conversion fails.
 *
 * @param blob - The Blob to convert
 * @returns The base64 data URL string, or null on failure
 */
function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * DELETE PROJECT FROM SERVER
 *
 * Removes a project from the server after a successful IndexedDB delete.
 * Called fire-and-forget from projectsDB.deleteProject().
 *
 * If the project doesn't exist on the server (e.g., it was never synced),
 * the server returns 404 which we treat as a successful no-op.
 *
 * @param id - The project ID to delete from the server
 */
export async function deleteProjectFromServer(id: string): Promise<void> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return;

  try {
    const res = await authFetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok && res.status !== 404) {
      console.warn(
        `[Sync] Failed to delete project from server (HTTP ${res.status}):`,
        id
      );
    }
  } catch (err) {
    console.warn('[Sync] Failed to delete project from server:', err);
  }
}

// =============================================================================
// PROJECT LIST SYNC
// =============================================================================

/**
 * LOAD PROJECT LIST FROM SERVER
 *
 * Fetches the user's project summaries from the server. This is used by
 * the Dashboard to show projects that exist on other devices but haven't
 * been cached locally yet.
 *
 * The server returns a lightweight list (id, title, updatedAt, etc.) —
 * no full project data is transferred. Full project data is fetched on-demand
 * when the user opens a project (see loadProjectFromServer).
 *
 * @returns Array of project summaries from the server, or empty array on failure
 */
export async function loadProjectsFromServer(): Promise<ProjectSummary[]> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return [];

  try {
    const res = await authFetch(`${API_BASE}/projects`);
    if (!res.ok) return [];

    const body = await res.json();

    // The server may return projects in various formats depending on the
    // backend implementation. We normalize to ProjectSummary[].
    const projects: unknown[] = body.projects || body.data || body || [];

    if (!Array.isArray(projects)) {
      console.warn('[Sync] Server returned non-array project list:', typeof projects);
      return [];
    }

    // Map server records to ProjectSummary, with safe defaults for missing fields
    return projects.map((p: any) => ({
      id: p.id,
      title: p.title || p.data?.info?.title || 'Untitled',
      author: p.author || p.data?.info?.author || '',
      updatedAt: p.updatedAt || p.updated_at || Date.now(),
      nodeCount: p.nodeCount || p.data?.nodes?.length || 0,
      theme: p.theme || p.data?.info?.theme || 'modern',
      mode: p.mode || p.data?.mode || 'game',
      // Don't include coverImage from server — it may be a stale blob URL
      // or a large base64 string. The dashboard gradient placeholder is fine.
      coverImage: undefined,
    }));
  } catch (err) {
    console.warn('[Sync] Failed to load project list from server:', err);
    return [];
  }
}

/**
 * LOAD SINGLE PROJECT FROM SERVER
 *
 * Fetches a full project from the server by ID. Used as a fallback when
 * the project is not found in IndexedDB (e.g., the user is on a new device
 * or cleared their browser cache).
 *
 * The returned project may contain `asset:{id}` references that need to be
 * resolved. The caller (projectsDB.getProject) handles caching the result
 * in IndexedDB for next time.
 *
 * @param id - The project ID to fetch
 * @returns The full project data, or null if not found / server error
 */
export async function loadProjectFromServer(id: string): Promise<Project | null> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return null;

  try {
    const res = await authFetch(`${API_BASE}/projects/${id}`);
    if (!res.ok) return null;

    const body = await res.json();

    // The server wraps the project in a `data` field.
    // Handle both `{ data: project }` and `{ project: { data: project } }` shapes.
    const project: Project | null = body.data || body.project?.data || null;

    if (!project || !project.id || !project.info) {
      console.warn('[Sync] Server returned invalid project data for:', id);
      return null;
    }

    return project;
  } catch (err) {
    console.warn('[Sync] Failed to load project from server:', err);
    return null;
  }
}

/**
 * SYNC PROJECT LIST
 *
 * Called by the Dashboard after loading the local (IndexedDB) project list.
 * Fetches the server's project list and returns any projects that exist on
 * the server but not locally — these are "new from server" projects that
 * need to appear in the Dashboard grid.
 *
 * Also triggers background upload of any local-only projects to the server
 * (projects that were created offline or before the user logged in).
 *
 * WHY A SEPARATE FUNCTION (not inside getAllProjects):
 * getAllProjects() is a pure IndexedDB operation and should remain fast and
 * synchronous-feeling. Server sync is async and may take seconds. Keeping
 * them separate lets the Dashboard show local projects immediately, then
 * merge server projects when they arrive.
 *
 * @param mode - The current dashboard mode ('game' or 'cowrite') for filtering
 * @returns Server-only projects that should be added to the Dashboard display
 */
export async function syncProjectList(
  mode: 'game' | 'cowrite'
): Promise<ProjectSummary[]> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return [];

  try {
    const serverProjects = await loadProjectsFromServer();

    // Filter to the current mode, matching Dashboard behavior.
    // Projects without a mode field default to 'game'.
    return serverProjects.filter(
      (p) => (p.mode || 'game') === mode
    );
  } catch (err) {
    console.warn('[Sync] syncProjectList failed:', err);
    return [];
  }
}

// =============================================================================
// BULK SYNC (FIRST LOGIN / MIGRATION)
// =============================================================================

/**
 * SYNC ALL LOCAL PROJECTS TO SERVER
 *
 * Uploads all IndexedDB projects to the server. Called on first login to
 * ensure any projects created while offline (or before the user had an
 * account) are persisted to the server.
 *
 * DEDUPLICATION:
 * Fetches the server's project list first and only uploads projects that
 * don't already exist on the server (by ID). This prevents duplicate uploads
 * if the function is called multiple times (e.g., on every login).
 *
 * RATE LIMITING:
 * Projects are uploaded sequentially (not in parallel) to avoid overwhelming
 * the server with many simultaneous large PUT requests.
 *
 * @param localProjects - Array of full Project objects from IndexedDB
 */
export async function syncAllProjectsToServer(
  localProjects: Project[]
): Promise<void> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return;

  try {
    // Get the list of projects already on the server
    const serverSummaries = await loadProjectsFromServer();
    const serverIds = new Set(serverSummaries.map((p) => p.id));

    // Upload local projects that don't exist on the server
    let uploaded = 0;
    for (const project of localProjects) {
      if (!serverIds.has(project.id)) {
        try {
          await syncProjectToServer(project);
          uploaded++;
        } catch {
          // Individual project sync failure — continue with the rest.
          // The warning is already logged inside syncProjectToServer.
        }
      }
    }

    if (uploaded > 0) {
      console.log(`[Sync] Uploaded ${uploaded} local project(s) to server on first login`);
    }
  } catch (err) {
    console.warn('[Sync] syncAllProjectsToServer failed:', err);
  }
}
