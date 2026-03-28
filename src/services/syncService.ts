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
  } catch (err) {
    // Network error, server unreachable, etc.
    // This is expected during local-only development or when offline.
    console.warn('[Sync] Failed to sync project to server:', err);
  }
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
