/**
 * =============================================================================
 * PROJECTS DATABASE OPERATIONS
 * =============================================================================
 *
 * This file contains all database operations for projects.
 *
 * WHAT THIS MODULE DOES:
 * - Create new projects
 * - Load existing projects
 * - Save/update projects
 * - Delete projects
 * - List all projects
 *
 * ASSET-SEPARATED STORAGE:
 * Binary assets (images, audio) are stored in the `assets` table as native
 * Blobs, NOT inline in the project record. The project record contains only
 * lightweight `asset:{id}` reference strings. This avoids writing 20-40 MB
 * records to IndexedDB (which causes IOError crashes in Edge) and instead
 * writes many small 1-3 MB asset records individually.
 *
 * Backwards compatible: projects with legacy inline base64 strings still load
 * correctly. On first save, they are automatically migrated to the new format.
 *
 * =============================================================================
 */

import { db, type ProjectRecord } from './database';
import type {
  Project,
  ProjectSummary,
  CreateProjectOptions,
  StoryNode,
  StoryEdge,
  SceneNode,
} from '@/types';
import { createDefaultSettings, createDefaultProjectInfo } from '@/types/project';
import { generateId } from '@/utils/idGenerator';
import { rehydrateForSave, registerBlob } from '@/utils/blobCache';
import {
  syncProjectToServer,
  deleteProjectFromServer,
  loadProjectFromServer,
} from '@/services/syncService';

// =============================================================================
// ASSET FIELD DEFINITIONS
// =============================================================================
// These fields on scene nodes and entities contain large binary data (images,
// audio) that should be stored in the assets table instead of inline.

/** Fields on SceneNode.data that hold large binary assets */
const SCENE_ASSET_FIELDS = ['backgroundImage', 'backgroundMusic', 'voiceoverAudio'] as const;

/**
 * Co-write node types (storyRoot, plot, act, cowriteScene) that have asset fields.
 * These are separate from scene nodes which have different field names.
 */
const COWRITE_NODE_TYPES = new Set(['storyRoot', 'plot', 'act', 'cowriteScene']);
const COWRITE_ASSET_FIELDS = ['image', 'voiceoverAudio', 'backgroundMusic'] as const;

/** Fields on Entity that hold large binary assets */
const ENTITY_ASSET_FIELDS = ['referenceImage', 'referenceVoice', 'defaultMusic'] as const;

// =============================================================================
// ASSET EXTRACTION & RESOLUTION (CORE OF THE SEPARATED STORAGE SYSTEM)
// =============================================================================

/**
 * Converts a blob URL or base64 data URL string to a native Blob object.
 *
 * WHY fetch() FOR BOTH:
 * The Fetch API natively handles both `blob:` and `data:` URLs. For blob URLs,
 * it retrieves the Blob from the browser's internal blob storage. For data URLs,
 * it decodes the base64 and creates a Blob. This avoids manual atob() parsing.
 *
 * @param val - A blob URL ("blob:http://...") or data URL ("data:image/png;base64,...")
 * @returns The Blob, or null if conversion fails
 */
async function resolveToBlob(val: string): Promise<Blob | null> {
  try {
    const resp = await fetch(val);
    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}

/**
 * EXTRACT AND SAVE ASSETS
 * Walks all asset fields in the project, converts blob URLs / base64 strings
 * to native Blob objects, writes each as a separate record in the `assets`
 * table, and replaces the field value with an `asset:{id}` reference string.
 *
 * DETERMINISTIC ASSET IDs:
 * Asset IDs are `{projectId}_{ownerId}_{field}` — deterministic based on where
 * the asset lives in the project. This means:
 * - Re-saving the same asset overwrites the same record (no accumulation)
 * - No need to track or garbage-collect stale asset IDs
 * - Each asset field maps to exactly one record in the assets table
 *
 * MUTATES THE PROJECT IN PLACE (call on a clone, not the live store object).
 *
 * @param project - The project clone to extract assets from (mutated in place)
 * @param projectId - The project's ID, used as a prefix for asset IDs
 * @returns Number of assets extracted
 */
async function extractAndSaveAssets(project: Project, projectId: string): Promise<number> {
  let extracted = 0;
  let skippedAssetRef = 0;
  let skippedNonAsset = 0;
  let blobCount = 0;
  let dataUrlCount = 0;
  let failedResolves = 0;

  // Scene node assets
  for (const node of project.nodes) {
    if (node.type !== 'scene') continue;
    const data = node.data as Record<string, unknown>;
    for (const field of SCENE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val !== 'string') continue;
      if (val.startsWith('asset:')) { skippedAssetRef++; continue; }
      // Blob URLs are short (~63 chars) but ARE real assets that need extraction.
      // Data URLs are long (100KB+). Static paths like "/dreamroom.jpg" are neither.
      if (val.startsWith('blob:') || (val.startsWith('data:') && val.length > 200)) {
        // valid asset — continue to extraction below
        if (val.startsWith('blob:')) blobCount++;
        else dataUrlCount++;
      } else {
        skippedNonAsset++;
        continue;
      }

      const assetId = `${projectId}_${node.id}_${field}`;
      const blob = await resolveToBlob(val);
      if (blob) {
        await db.assets.put({
          id: assetId,
          projectId,
          type: field.includes('Image') || field.includes('image') ? 'image' as const : 'audio' as const,
          name: `${node.id}_${field}`,
          mimeType: blob.type || 'application/octet-stream',
          blob,
          size: blob.size,
          createdAt: Date.now(),
        });
        data[field] = `asset:${assetId}`;
        extracted++;
      } else {
        failedResolves++;
        console.warn(`[ProjectsDB] extractAndSaveAssets: FAILED to resolve blob for scene ${node.id}.${field} (${val.substring(0, 60)}...)`);
      }
    }
  }

  // Co-write node assets (storyRoot, plot, act, cowriteScene)
  // These nodes have image, voiceoverAudio (from Photo Story TTS), and backgroundMusic fields.
  for (const node of project.nodes) {
    if (!COWRITE_NODE_TYPES.has(node.type)) continue;
    const data = node.data as Record<string, unknown>;
    for (const field of COWRITE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val !== 'string') continue;
      if (val.startsWith('asset:')) { skippedAssetRef++; continue; }
      if (val.startsWith('blob:') || (val.startsWith('data:') && val.length > 200)) {
        // valid asset
        if (val.startsWith('blob:')) blobCount++;
        else dataUrlCount++;
      } else {
        skippedNonAsset++;
        continue;
      }

      const assetId = `${projectId}_${node.id}_${field}`;
      const blob = await resolveToBlob(val);
      if (blob) {
        await db.assets.put({
          id: assetId,
          projectId,
          type: field.includes('image') || field.includes('Image') ? 'image' as const : 'audio' as const,
          name: `${node.id}_${field}`,
          mimeType: blob.type || 'application/octet-stream',
          blob,
          size: blob.size,
          createdAt: Date.now(),
        });
        data[field] = `asset:${assetId}`;
        extracted++;
      } else {
        failedResolves++;
        console.warn(`[ProjectsDB] extractAndSaveAssets: FAILED to resolve blob for cowrite ${node.id}.${field} (${val.substring(0, 60)}...)`);
      }
    }
  }

  // Entity assets
  for (const entity of (project.entities || [])) {
    const e = entity as unknown as Record<string, unknown>;
    for (const field of ENTITY_ASSET_FIELDS) {
      const val = e[field];
      if (typeof val !== 'string') continue;
      if (val.startsWith('asset:')) { skippedAssetRef++; continue; }
      // Blob URLs are short (~63 chars) but ARE real assets that need extraction.
      if (val.startsWith('blob:') || (val.startsWith('data:') && val.length > 200)) {
        // valid asset — continue to extraction below
        if (val.startsWith('blob:')) blobCount++;
        else dataUrlCount++;
      } else {
        skippedNonAsset++;
        continue;
      }

      const assetId = `${projectId}_${entity.id}_${field}`;
      const blob = await resolveToBlob(val as string);
      if (blob) {
        await db.assets.put({
          id: assetId,
          projectId,
          type: field.includes('Image') || field.includes('image') ? 'image' as const : 'audio' as const,
          name: `${entity.id}_${field}`,
          mimeType: blob.type || 'application/octet-stream',
          blob,
          size: blob.size,
          createdAt: Date.now(),
        });
        e[field] = `asset:${assetId}`;
        extracted++;
      } else {
        failedResolves++;
        console.warn(`[ProjectsDB] extractAndSaveAssets: FAILED to resolve blob for entity ${entity.id}.${field} (${(val as string).substring(0, 60)}...)`);
      }
    }
  }

  // Cover image on project info
  // Blob URLs are short (~63 chars) but ARE real assets that need extraction.
  if (project.info.coverImage &&
      !project.info.coverImage.startsWith('asset:') &&
      (project.info.coverImage.startsWith('blob:') || (project.info.coverImage.startsWith('data:') && project.info.coverImage.length > 200))) {
    const assetId = `${projectId}_coverImage`;
    const blob = await resolveToBlob(project.info.coverImage);
    if (blob) {
      await db.assets.put({
        id: assetId,
        projectId,
        type: 'image' as const,
        name: 'coverImage',
        mimeType: blob.type || 'application/octet-stream',
        blob,
        size: blob.size,
        createdAt: Date.now(),
      });
      project.info.coverImage = `asset:${assetId}`;
      extracted++;
    } else {
      failedResolves++;
      console.warn(`[ProjectsDB] extractAndSaveAssets: FAILED to resolve cover image blob`);
    }
  }

  // Diagnostic summary log — helps debug asset eviction issues
  if (extracted > 0 || failedResolves > 0) {
    console.log(
      `[ProjectsDB] extractAndSaveAssets summary for ${projectId}: ` +
      `extracted=${extracted}, failed=${failedResolves}, ` +
      `blobs=${blobCount}, dataUrls=${dataUrlCount}, ` +
      `alreadyAssetRef=${skippedAssetRef}, nonAsset=${skippedNonAsset}`
    );
  }

  return extracted;
}

/**
 * RESOLVE ASSET REFERENCES
 * The inverse of extractAndSaveAssets(). Walks the project looking for
 * `asset:{id}` reference strings, fetches the corresponding Blob from the
 * assets table, creates a blob URL, and registers it in the blob cache
 * so the rest of the app (display, export, rehydration) works seamlessly.
 *
 * BACKWARDS COMPATIBILITY:
 * Fields that still contain inline base64 data URLs (from old projects that
 * haven't been migrated yet) are left as-is. The caller's offloadAssetsInPlace()
 * will convert those to blob URLs separately.
 *
 * MUTATES THE PROJECT IN PLACE.
 *
 * @param project - The project loaded from IndexedDB (mutated in place)
 * @returns Number of asset references resolved
 */
async function resolveAssetReferences(project: Project): Promise<number> {
  let resolved = 0;
  // Reset server recovery counter for this load cycle
  serverRecoveryCount = 0;

  // Scene node assets
  for (const node of project.nodes) {
    if (node.type !== 'scene') continue;
    const data = node.data as Record<string, unknown>;
    for (const field of SCENE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('asset:')) {
        const assetId = val.slice(6); // Remove 'asset:' prefix
        const success = await resolveOneAsset(assetId, project.id, data, field);
        if (success) resolved++;
      }
    }
  }

  // Co-write node assets (storyRoot, plot, act, cowriteScene)
  for (const node of project.nodes) {
    if (!COWRITE_NODE_TYPES.has(node.type)) continue;
    const data = node.data as Record<string, unknown>;
    for (const field of COWRITE_ASSET_FIELDS) {
      const val = data[field];
      if (typeof val === 'string' && val.startsWith('asset:')) {
        const assetId = val.slice(6);
        const success = await resolveOneAsset(assetId, project.id, data, field);
        if (success) resolved++;
      }
    }
  }

  // Entity assets
  for (const entity of (project.entities || [])) {
    const e = entity as unknown as Record<string, unknown>;
    for (const field of ENTITY_ASSET_FIELDS) {
      const val = e[field];
      if (typeof val === 'string' && val.startsWith('asset:')) {
        const assetId = val.slice(6);
        const success = await resolveOneAsset(assetId, project.id, e, field);
        if (success) resolved++;
      }
    }
  }

  // Cover image
  if (project.info.coverImage?.startsWith('asset:')) {
    const assetId = project.info.coverImage.slice(6);
    // Use a wrapper object so resolveOneAsset can assign to it
    const wrapper: Record<string, unknown> = { coverImage: project.info.coverImage };
    const success = await resolveOneAsset(assetId, project.id, wrapper, 'coverImage');
    if (success) {
      project.info.coverImage = wrapper.coverImage as string;
      resolved++;
    } else {
      project.info.coverImage = '';
    }
  }

  return resolved;
}

/**
 * RESOLVE ONE ASSET (with server fallback)
 *
 * Attempts to resolve a single asset:{id} reference:
 * 1. First tries IndexedDB (fast, local)
 * 2. If not in IndexedDB, tries fetching from the server API (recovery path)
 * 3. If recovered from server, caches in IndexedDB for next time
 * 4. Creates a blob URL and registers it in blobCache
 *
 * WHY SERVER FALLBACK:
 * IndexedDB can be evicted by the browser under storage pressure, or the user
 * may be on a new device/browser. If assets were previously synced to the server
 * (by syncAssetsToServer in syncService.ts), this fallback can recover them
 * transparently — the user never sees a broken image.
 *
 * @param assetId - The asset ID (without the "asset:" prefix)
 * @param projectId - The project ID (for caching recovered assets)
 * @param target - The object to write the blob URL into
 * @param field - The field name on the target object
 * @returns true if the asset was resolved, false if not found anywhere
 */
/** Max server recovery attempts per project load to avoid hammering the API */
const MAX_SERVER_RECOVERIES = 10;
let serverRecoveryCount = 0;

async function resolveOneAsset(
  assetId: string,
  projectId: string,
  target: Record<string, unknown>,
  field: string
): Promise<boolean> {
  // 1. Try IndexedDB first (fast, local)
  let blob: Blob | undefined;
  const record = await db.assets.get(assetId);
  if (record?.blob) {
    blob = record.blob;
  }

  // 2. If not in IndexedDB, try recovering from the server.
  // Limit server recovery attempts to avoid hammering the API when many
  // assets are missing (e.g., after cache clear on a 86-scene project).
  // After MAX_SERVER_RECOVERIES, just mark assets as empty.
  if (!blob && serverRecoveryCount < MAX_SERVER_RECOVERIES) {
    serverRecoveryCount++;
    const recovered = await recoverAssetFromServer(assetId, projectId);
    if (recovered) {
      blob = recovered.blob;
    }
  }

  // 3. Create blob URL and register
  if (blob) {
    const blobUrl = URL.createObjectURL(blob);
    registerBlob(blobUrl, blob);
    target[field] = blobUrl;
    return true;
  }

  // 4. Asset not found anywhere
  console.warn(`[ProjectsDB] Asset not found (local or server): ${assetId}`);
  target[field] = '';
  return false;
}

/**
 * RECOVER ASSET FROM SERVER
 *
 * Fetches an asset's binary data from the server API and caches it in
 * IndexedDB for future use. This handles the case where IndexedDB was
 * evicted but the asset was previously synced to the server.
 *
 * The server GET /api/v2/assets/:id returns the raw binary with the correct
 * Content-Type header. We fetch it as a blob, then cache it locally.
 *
 * @param assetId - The asset ID to recover
 * @param projectId - The project ID (for the IndexedDB cache record)
 * @returns The asset record if recovered, or null if the server doesn't have it
 */
async function recoverAssetFromServer(
  assetId: string,
  projectId: string
): Promise<{ blob: Blob } | null> {
  try {
    // Dynamic imports to avoid circular dependencies — authService and
    // useAuthStore are imported lazily only when needed.
    const { authFetch } = await import('@/services/authService');
    const { useAuthStore } = await import('@/stores/useAuthStore');

    if (!useAuthStore.getState().isAuthenticated) return null;

    // The server's GET /assets/:id streams the raw binary file with
    // the correct Content-Type header. We fetch it as a blob directly.
    const res = await authFetch(`/api/v2/assets/${assetId}`);
    if (!res.ok) return null;

    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;

    const mimeType = blob.type || 'application/octet-stream';
    const type = mimeType.startsWith('image/') ? 'image' as const : 'audio' as const;

    // Cache in IndexedDB so we don't need to fetch from server next time
    const assetRecord = {
      id: assetId,
      projectId,
      type,
      name: assetId,
      mimeType,
      blob,
      size: blob.size,
      createdAt: Date.now(),
    };

    try {
      await db.assets.put(assetRecord);
      console.log(`[ProjectsDB] Recovered asset from server and cached locally: ${assetId} (${blob.size} bytes)`);
    } catch (cacheErr) {
      // Cache failure is non-fatal — we still have the blob in memory
      console.warn(`[ProjectsDB] Recovered asset from server but failed to cache: ${assetId}`, cacheErr);
    }

    return { blob };
  } catch (err) {
    // Network error, server down, auth expired, etc.
    // This is expected when offline or when assets were never synced.
    console.warn(`[ProjectsDB] Server asset recovery failed for ${assetId}:`, err);
    return null;
  }
}

// =============================================================================
// SERVER BACKUP
// =============================================================================

/**
 * BACKUP TO SERVER (FIRE-AND-FORGET)
 * After a successful IndexedDB save, sends the rehydrated project copy
 * to the Vite dev server's /api/backup-project endpoint. The server
 * writes it to Build_Output/backups/{projectId}.json on disk.
 *
 * WHY THIS EXISTS:
 * IndexedDB is scoped to a single browser origin (protocol + host + port).
 * If the user switches browsers, clears cache, or the browser evicts data
 * under storage pressure, all projects are lost. This filesystem backup
 * provides a safety net — the dashboard can offer to restore backups.
 *
 * WHY FIRE-AND-FORGET:
 * We don't await this call because it should never slow down the save path.
 * If the backup fails (e.g., server is production build without middleware),
 * the error is logged silently and the user's IndexedDB save is unaffected.
 *
 * @param project - The rehydrated project copy (base64 data URLs, not blob URLs)
 */
function backupToServer(project: Project): void {
  try {
    fetch('/api/backup-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
      .then((resp) => {
        if (!resp.ok) {
          console.warn(`[ProjectsDB] Backup failed (HTTP ${resp.status}) for project ${project.id}`);
        } else {
          logDB('Backup sent to server', { id: project.id });
        }
      })
      .catch((err) => {
        // Silent catch — backup failure must never surface as a user-facing error.
        // Common cause: running in production build without the Vite middleware.
        console.warn('[ProjectsDB] Backup to server failed (non-blocking):', err?.message || err);
      });
  } catch (err) {
    // Catch synchronous errors from JSON.stringify (e.g., circular refs — shouldn't
    // happen since rehydrateForSave already produced a serializable copy, but be safe)
    console.warn('[ProjectsDB] Backup serialization failed:', err);
  }
}

/**
 * DEBUG LOGGER FOR DATABASE OPERATIONS
 * Logs database operations in development mode.
 *
 * @param operation - Name of the operation
 * @param data - Optional data to log
 */
function logDB(operation: string, data?: unknown): void {
  if (import.meta.env.DEV) {
    console.log(`[ProjectsDB] ${operation}`, data ?? '');
  }
}

// =============================================================================
// PROJECT CRUD OPERATIONS
// =============================================================================

/**
 * CREATE NEW PROJECT
 * Creates a new project in the database.
 *
 * This function:
 * 1. Generates a unique ID
 * 2. Creates default settings
 * 3. Optionally adds starter content
 * 4. Saves to database
 *
 * @param options - Project creation options
 * @returns The created project
 * @throws Error if creation fails
 */
export async function createProject(
  options: CreateProjectOptions
): Promise<Project> {
  logDB('Creating project', options);

  try {
    // Generate unique project ID
    const projectId = generateId('project');

    // Create project info with defaults
    const info = createDefaultProjectInfo(options.title);
    info.author = options.author || '';
    info.description = options.description || '';
    info.theme = options.theme || 'modern';

    // Create default settings
    const settings = createDefaultSettings();

    // Initialize empty arrays
    let nodes: StoryNode[] = [];
    let edges: StoryEdge[] = [];

    // If co-write mode, create a full default story structure:
    // - 1 Story Root (high-level metadata)
    // - 4 Plot nodes (Main, Relationship, Character Development, Antagonist)
    // - 3 Act nodes (Act 1, Act 2, Act 3)
    // - Edges: root → each plot (4 edges)
    // - Edges: each plot → each act with relationship data (4×3 = 12 edges)
    // This gives users an immediate working structure to start fleshing out.
    if (options.mode === 'cowrite') {
      // Determine which structure template to use. Defaults to 'acts' for
      // backwards compatibility when cowriteStructure is not specified.
      const structure = options.cowriteStructure || 'acts';
      const isEpisode = structure === 'episodes';
      // Default count: 3 for acts, 6 for episodes. Clamped to 1-12 range.
      const structureCount = Math.max(1, Math.min(12,
        options.cowriteCount ?? (isEpisode ? 6 : 3)
      ));

      // Create Story Root node at the top center — always present regardless
      // of which structure template is chosen.
      const rootNode: StoryNode = {
        id: generateId('node'),
        type: 'storyRoot',
        position: { x: 550, y: 50 },
        label: 'Story Root',
        data: {
          title: options.title || '',
          genre: '',
          targetAudience: '',
          punchline: '',
          mainCharacter: { name: '', role: 'Protagonist' },
          antagonist: { name: '', role: 'Antagonist' },
          supportingCharacters: [],
          protagonistGoal: '',
          summary: '',
        },
      };

      if (structure === 'blank') {
        // BLANK TEMPLATE: Only the Story Root, no plots or acts.
        // The user adds structure manually or via the AI chat.
        nodes = [rootNode] as StoryNode[];
        settings.startNodeId = rootNode.id;
        edges = [] as StoryEdge[];
      } else {
        // ACT or EPISODE TEMPLATE: Root + 4 plots + N acts/episodes + edges.

        // Create 4 Plot nodes — each represents a different narrative thread.
        // Spread horizontally below the Story Root for a clean visual layout.
        const plotConfigs = [
          { name: 'Main Plot', plotType: 'Main Plot', x: 100 },
          { name: 'Relationship', plotType: 'Relationship Plot', x: 400 },
          { name: 'Character Development', plotType: 'Character Development Plot', x: 700 },
          { name: 'Antagonist', plotType: 'Antagonist Plot', x: 1000 },
        ];
        const plotNodes = plotConfigs.map(cfg => ({
          id: generateId('node'),
          type: 'plot' as const,
          position: { x: cfg.x, y: 280 },
          label: cfg.name,
          data: { name: cfg.name, plotType: cfg.plotType, description: '' },
        }));

        // Create N act nodes. The label and data vary based on whether we're
        // using the act structure or the episode structure.
        const structureLabel = isEpisode ? 'Episode' : 'Act';
        const actNodes = Array.from({ length: structureCount }, (_, i) => {
          const num = i + 1;
          return {
            id: generateId('node'),
            type: 'act' as const,
            position: { x: 200 + i * 350, y: 600 },
            label: `${structureLabel} ${num}`,
            data: {
              actNumber: num,
              name: `${structureLabel} ${num}`,
              description: '',
              ...(isEpisode ? { isEpisode: true } : {}),
            },
          };
        });

        nodes = [rootNode, ...plotNodes, ...actNodes] as StoryNode[];
        settings.startNodeId = rootNode.id;

        // Root → Plot edges: connect the Story Root to each plot node
        const rootToPlotEdges = plotNodes.map(p => ({
          id: generateId('edge'),
          source: rootNode.id,
          target: p.id,
        }));

        // Plot → Act/Episode edges: each plot connects to each act/episode
        // with relationship metadata describing how that plot thread manifests
        // in that structural unit. Uses the 'relationship' edge type with
        // plotInvolvement data field.
        const plotToActEdges: Array<{
          id: string;
          source: string;
          target: string;
          type: string;
          data: { relationshipType: string; description: string; status: string; history: string; plotInvolvement: string };
        }> = [];
        for (const plot of plotNodes) {
          for (const act of actNodes) {
            plotToActEdges.push({
              id: generateId('edge'),
              source: plot.id,
              target: act.id,
              type: 'relationship',
              data: {
                relationshipType: isEpisode ? 'Episode-Plot' : 'Act-Plot',
                description: '',
                status: '',
                history: '',
                plotInvolvement: '',
              },
            });
          }
        }

        edges = [...rootToPlotEdges, ...plotToActEdges] as StoryEdge[];
      }
    } else if (options.addStarterContent !== false) {
      // Game mode — add the default Dream Room starter scene
      const startNode = createStarterSceneNode();
      nodes = [startNode];
      settings.startNodeId = startNode.id;
    }

    // Create default variables (Health with green bar)
    const defaultVariables = [
      {
        id: generateId('var'),
        name: 'Health',
        type: 'integer' as const,
        defaultValue: 100,
        showInHUD: true,
        hudIcon: 'heart' as const,
        hudColor: '#22c55e',
        maxValue: 100,
        minValue: 0,
        description: 'Player health points',
        category: 'Stats',
      },
    ];

    // Construct the project object
    const project: Project = {
      id: projectId,
      // Store the mode so the dashboard can filter by game vs co-writing projects.
      // Defaults to 'game' for backwards compatibility.
      mode: options.mode || 'game',
      info,
      globalVariables: defaultVariables,
      nodes,
      edges,
      settings,
    };

    // Create database record
    const record: ProjectRecord = {
      id: projectId,
      data: project,
      updatedAt: Date.now(),
    };

    // Save to database
    await db.projects.add(record);

    logDB('Project created', {
      id: projectId,
      title: options.title,
      mode: options.mode || 'game',
      nodeCount: nodes.length,
      nodeTypes: nodes.map(n => n.type),
      edgeCount: edges.length,
    });

    // Sync new project to server (fire-and-forget, non-blocking).
    // The IndexedDB save has already succeeded, so the project is safe locally.
    // Server sync runs in the background — failure is logged but never surfaces.
    syncProjectToServer(project).catch((err) => console.warn('[ProjectsDB] Server sync failed:', err));

    return project;
  } catch (error) {
    console.error('[ProjectsDB] Failed to create project:', error);
    throw new Error(`Failed to create project: ${getErrorMessage(error)}`);
  }
}

/**
 * GET PROJECT BY ID
 * Retrieves a project from the database and resolves any asset references.
 *
 * LOAD FLOW:
 * 1. Read lightweight project record from IndexedDB (asset:{id} references)
 * 2. Resolve asset references → fetch Blobs from assets table → create blob URLs
 * 3. Legacy inline base64 strings pass through unchanged (handled later by
 *    offloadAssetsInPlace in the store)
 *
 * @param id - Project ID
 * @returns The project with blob URLs, or null if not found
 * @throws Error if retrieval fails
 */
export async function getProject(id: string): Promise<Project | null> {
  logDB('Getting project', id);

  try {
    // Query database for the project
    const record = await db.projects.get(id);

    // If not in IndexedDB, try fetching from the server.
    // This handles the case where the user is on a new device or cleared
    // their browser cache but the project exists on the server.
    if (!record) {
      logDB('Project not found locally, trying server', id);

      const serverProject = await loadProjectFromServer(id);
      if (serverProject) {
        logDB('Project fetched from server, caching in IndexedDB', id);

        // Cache in IndexedDB for next time (extract assets to separate records)
        try {
          const cacheCopy = structuredClone(serverProject);
          await extractAndSaveAssets(cacheCopy, serverProject.id);
          await db.projects.put({
            id: serverProject.id,
            data: cacheCopy,
            updatedAt: Date.now(),
          });
        } catch (cacheErr) {
          // Cache failure is non-fatal — we still have the server copy in memory
          console.warn('[ProjectsDB] Failed to cache server project in IndexedDB:', cacheErr);
        }

        // Resolve asset references in the server copy so the caller gets blob URLs
        await resolveAssetReferences(serverProject);

        // Count how many asset fields ended up as empty strings — these are
        // assets that could not be recovered from either IndexedDB or the server.
        // Log a warning so the user knows some content may be missing and need
        // regeneration.
        let lostAssets = 0;
        for (const node of serverProject.nodes) {
          if (node.type === 'scene') {
            const data = node.data as Record<string, unknown>;
            for (const field of SCENE_ASSET_FIELDS) {
              if (data[field] === '') lostAssets++;
            }
          }
        }
        for (const entity of (serverProject.entities || [])) {
          const e = entity as unknown as Record<string, unknown>;
          for (const field of ENTITY_ASSET_FIELDS) {
            if (e[field] === '') lostAssets++;
          }
        }
        if (lostAssets > 0) {
          console.warn(`[ProjectsDB] ${lostAssets} assets could not be recovered from server project. They may need to be regenerated.`);
        }

        return serverProject;
      }

      logDB('Project not found on server either', id);
      return null;
    }

    // Check if the local project has many empty asset fields that the server
    // might have repaired. If so, prefer the server version (which runs
    // repairAssetReferences on every GET).
    const sceneNodes = record.data.nodes.filter((n: any) => n.type === 'scene');
    const emptyImages = sceneNodes.filter((n: any) => !n.data?.backgroundImage || n.data.backgroundImage === '').length;
    if (sceneNodes.length > 0 && emptyImages > sceneNodes.length * 0.5) {
      // More than half the scenes are missing images — try server version
      logDB(`Local project has ${emptyImages}/${sceneNodes.length} empty scene images — checking server for repairs`);
      try {
        const serverProject = await loadProjectFromServer(id);
        if (serverProject) {
          const serverEmpty = serverProject.nodes
            .filter((n: any) => n.type === 'scene')
            .filter((n: any) => !n.data?.backgroundImage || n.data.backgroundImage === '').length;
          if (serverEmpty < emptyImages) {
            logDB(`Server version has ${serverEmpty} empty images (vs ${emptyImages} local) — using server version`);
            // Update local cache with server version
            try {
              const cacheCopy = structuredClone(serverProject);
              await extractAndSaveAssets(cacheCopy, serverProject.id);
              await db.projects.put({ id: serverProject.id, data: cacheCopy, updatedAt: Date.now() });
            } catch { /* cache update failure is non-fatal */ }
            await resolveAssetReferences(serverProject);
            return serverProject;
          }
        }
      } catch {
        // Server fetch failed — use local version
      }
    }

    // Resolve asset:{id} references → blob URLs from the assets table.
    // This handles the new separated storage format. Legacy inline base64
    // strings are left as-is for the caller's offloadAssetsInPlace() to handle.
    const resolved = await resolveAssetReferences(record.data);
    if (resolved > 0) {
      logDB(`Resolved ${resolved} asset references → blob URLs`);
    }

    logDB('Project loaded', { id, title: record.data.info.title });

    return record.data;
  } catch (error) {
    console.error('[ProjectsDB] Failed to get project:', error);
    throw new Error(`Failed to load project: ${getErrorMessage(error)}`);
  }
}

/**
 * SAVE PROJECT
 * Saves a project using asset-separated storage.
 *
 * SAVE FLOW:
 * 1. Clone the project (cheap: blob URLs are ~50 bytes each)
 * 2. Extract binary assets from clone → individual records in assets table
 *    (each 1-3 MB, written separately — no more giant 40 MB atomic writes)
 * 3. Write lightweight project record (~50-200 KB) to projects table
 * 4. Fire-and-forget: rehydrate blob URLs → base64 for server file backup
 *
 * BACKWARDS COMPATIBILITY:
 * The clone may contain blob URLs (from offloaded assets) or base64 strings
 * (from newly generated assets that haven't been offloaded yet). Both are
 * handled by extractAndSaveAssets() via fetch().
 *
 * @param project - The project to save (NOT mutated — a clone is used)
 * @throws Error if save fails
 */
export async function saveProject(project: Project): Promise<void> {
  logDB('Saving project', { id: project.id, title: project.info.title });

  try {
    const updatedAt = Date.now();

    // Create a lightweight clone. After asset offloading, blob URLs are ~50 bytes
    // each, so structuredClone is cheap (~5 KB for text+structure vs 40 MB for
    // inline base64). This clone is what gets written to IndexedDB.
    const lightCopy = structuredClone(project);
    lightCopy.info.updatedAt = updatedAt;

    // Extract binary assets from the clone into separate asset records.
    // Each asset is written individually to the assets table (1-3 MB each).
    // The clone's fields are replaced with `asset:{id}` reference strings.
    const extracted = await extractAndSaveAssets(lightCopy, project.id);
    console.log(`[ProjectsDB] extractAndSaveAssets: extracted ${extracted} assets for project ${project.id}`);
    if (extracted > 0) {
      logDB(`Extracted ${extracted} assets to separate records`);
    }

    // The project record is now lightweight — just text, structure, and
    // `asset:{id}` reference strings. Typically 50-200 KB.
    const record: ProjectRecord = {
      id: lightCopy.id,
      data: lightCopy,
      updatedAt,
    };

    // Write to IndexedDB with retry for transient I/O errors.
    // With asset-separated storage, this record is small enough that IOErrors
    // should be extremely rare, but we keep the retry for robustness.
    const MAX_RETRIES = 3;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await db.projects.put(record);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[ProjectsDB] IndexedDB put failed (attempt ${attempt}/${MAX_RETRIES}): ${errMsg}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }

    // If all retries failed, ensure server backup still runs as safety net.
    if (lastError) {
      console.error('[ProjectsDB] IndexedDB save failed after all retries — falling back to server backup only.', lastError);
      rehydrateForSave(project)
        .then((fullCopy) => backupToServer(fullCopy))
        .catch((err) => console.warn('[ProjectsDB] Server backup also failed:', err));
      return;
    }

    logDB('Project saved', { id: lightCopy.id });

    // Sync to remote server API (fire-and-forget, non-blocking).
    // Uses the lightweight copy with asset:{id} references — the server
    // stores project metadata/structure, not binary asset data.
    syncProjectToServer(lightCopy).catch((err) => console.warn('[ProjectsDB] Server sync failed:', err));

    // Fire-and-forget server backup: rehydrate blob URLs → base64 for a
    // self-contained JSON file on disk. This runs asynchronously and won't
    // block the UI. The rehydrateForSave() call works on the ORIGINAL project
    // (which still has blob URLs registered in blobCache), not the lightCopy.
    rehydrateForSave(project)
      .then((fullCopy) => backupToServer(fullCopy))
      .catch((err) => console.warn('[ProjectsDB] Server backup failed:', err));
  } catch (error) {
    console.error('[ProjectsDB] Failed to save project:', error);
    throw new Error(`Failed to save project: ${getErrorMessage(error)}`);
  }
}

/**
 * DELETE PROJECT
 * Removes a project and all its associated data from the database.
 *
 * This function also deletes:
 * - All assets belonging to the project (both separated and uploaded)
 * - All saves belonging to the project
 *
 * @param id - Project ID to delete
 * @throws Error if deletion fails
 */
export async function deleteProject(id: string): Promise<void> {
  logDB('Deleting project', id);

  try {
    // Use a transaction to delete project and related data atomically
    await db.transaction('rw', [db.projects, db.assets, db.saves], async () => {
      // Delete the project
      await db.projects.delete(id);

      // Delete all assets for this project (covers both separated scene/entity
      // assets and any explicitly uploaded assets)
      await db.assets.where('projectId').equals(id).delete();

      // Delete all saves for this project
      await db.saves.where('projectId').equals(id).delete();
    });

    logDB('Project deleted', id);

    // Sync deletion to server (fire-and-forget, non-blocking).
    // If the project never existed on the server, the 404 is treated as success.
    deleteProjectFromServer(id).catch((err) => console.warn('[ProjectsDB] Server sync failed:', err));
  } catch (error) {
    console.error('[ProjectsDB] Failed to delete project:', error);
    throw new Error(`Failed to delete project: ${getErrorMessage(error)}`);
  }
}

/**
 * GET ALL PROJECTS (SUMMARIES)
 * Retrieves summary information for all projects.
 *
 * Returns lightweight summaries instead of full project data
 * for better performance in the dashboard.
 *
 * PERFORMANCE FIX: Uses .each() cursor instead of .toArray().
 * .toArray() loads EVERY full ProjectRecord (including all nodes with
 * multi-MB base64 images) into memory simultaneously. With 3+ projects
 * that each have 50 scenes (50×2MB = 100MB per project), this allocates
 * 300+ MB at once and causes OOM crashes on the dashboard.
 *
 * .each() processes records one at a time via an IndexedDB cursor.
 * Only one project's data is in memory at a time — the GC can reclaim
 * each record's memory after we extract the summary fields. This reduces
 * peak memory from O(all projects) to O(largest single project).
 *
 * NOTE: With asset-separated storage, project records are already lightweight
 * (~50-200 KB), so OOM on the dashboard is no longer a concern for new
 * projects. This cursor approach is kept for backwards compat with any
 * old projects that still have inline base64.
 *
 * @returns Array of project summaries, sorted by updatedAt (newest first)
 */
export async function getAllProjects(): Promise<ProjectSummary[]> {
  logDB('Getting all projects');

  try {
    const summaries: ProjectSummary[] = [];

    // Process one record at a time via cursor — prevents loading all
    // full project data into memory simultaneously (OOM fix).
    // Each callback is wrapped in try/catch so a single corrupted record
    // doesn't abort the cursor and hide ALL projects from the dashboard.
    await db.projects
      .orderBy('updatedAt')
      .reverse()
      .each((record) => {
        try {
          // Validate minimum required fields before accessing them
          if (!record?.data?.info || !record?.data?.nodes) {
            console.warn('[ProjectsDB] Skipping corrupted record (missing data.info or data.nodes):', record?.id);
            return;
          }

          // Determine cover image for the summary.
          // With asset-separated storage, coverImage may be an `asset:{id}` reference.
          // We skip it in the summary — it would require an async DB lookup which
          // isn't possible inside the synchronous .each() callback. The dashboard
          // will show the gradient placeholder instead.
          let coverImage = record.data.info.coverImage;
          // Skip asset references (can't resolve synchronously)
          if (coverImage && coverImage.startsWith('asset:')) {
            coverImage = undefined;
          }
          // Skip large base64 (legacy projects not yet migrated)
          if (coverImage && coverImage.startsWith('data:') && coverImage.length > 100_000) {
            coverImage = undefined;
          }
          // Skip dead blob URLs from previous sessions
          if (coverImage && coverImage.startsWith('blob:')) {
            coverImage = undefined;
          }

          summaries.push({
            id: record.data.id,
            title: record.data.info.title || 'Untitled',
            author: record.data.info.author || '',
            coverImage,
            updatedAt: record.updatedAt,
            nodeCount: record.data.nodes?.length ?? 0,
            theme: record.data.info.theme || 'modern',
            // Include the project mode so the Dashboard can filter by mode.
            // Backwards compat: projects without a mode field default to 'game'.
            mode: (record.data as any).mode || 'game',
          });
        } catch (err) {
          console.error('[ProjectsDB] Error reading project record, skipping:', record?.id, err);
        }
      });

    logDB('Got projects', { count: summaries.length });

    return summaries;
  } catch (error) {
    console.error('[ProjectsDB] Failed to get projects:', error);
    throw new Error(`Failed to load projects: ${getErrorMessage(error)}`);
  }
}

/**
 * DUPLICATE PROJECT
 * Creates a copy of an existing project.
 *
 * The copy gets:
 * - New ID
 * - "(Copy)" appended to title
 * - New timestamps
 *
 * ASSET HANDLING:
 * getProject() resolves asset references to blob URLs. The duplicate gets
 * new node/entity IDs, so on save, extractAndSaveAssets() writes new asset
 * records with the duplicate's deterministic IDs. We also extract assets
 * immediately here so the initial save to IndexedDB is lightweight.
 *
 * @param id - ID of project to duplicate
 * @returns The new duplicate project
 * @throws Error if duplication fails
 */
export async function duplicateProject(id: string): Promise<Project> {
  logDB('Duplicating project', id);

  try {
    // Get the original project (asset refs already resolved to blob URLs)
    const original = await getProject(id);

    if (!original) {
      throw new Error('Project not found');
    }

    // Create a deep copy with new IDs
    const newProjectId = generateId('project');
    const now = Date.now();

    // Clone the project — structuredClone avoids the intermediate JSON string
    // that JSON.parse(JSON.stringify()) creates, reducing peak memory by ~2x.
    const duplicate: Project = {
      ...structuredClone(original),
      id: newProjectId,
      info: {
        ...original.info,
        title: `${original.info.title} (Copy)`,
        createdAt: now,
        updatedAt: now,
      },
    };

    // Regenerate IDs for nodes, choices, and edges to avoid conflicts.
    // Choice IDs must also be remapped because edges use them as sourceHandle.
    const idMap = new Map<string, string>();

    // Generate new node IDs and choice IDs
    duplicate.nodes = duplicate.nodes.map((node) => {
      const newId = generateId('node');
      idMap.set(node.id, newId);
      const cloned = { ...node, id: newId };

      // Remap choice IDs inside scene nodes
      if (cloned.type === 'scene' && cloned.data?.choices) {
        cloned.data = {
          ...cloned.data,
          choices: cloned.data.choices.map((choice: { id: string; label: string }) => {
            const newChoiceId = generateId('choice');
            idMap.set(choice.id, newChoiceId);
            return { ...choice, id: newChoiceId };
          }),
        };
      }

      return cloned;
    });

    // Update edge references — source, target, AND sourceHandle
    duplicate.edges = duplicate.edges.map((edge) => ({
      ...edge,
      id: generateId('edge'),
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
      sourceHandle: (edge.sourceHandle && idMap.get(edge.sourceHandle)) || edge.sourceHandle,
    }));

    // Update start node reference
    if (duplicate.settings.startNodeId && idMap.has(duplicate.settings.startNodeId)) {
      duplicate.settings.startNodeId = idMap.get(duplicate.settings.startNodeId)!;
    }

    // Extract assets into the assets table for the new project.
    // The duplicate has blob URLs from the original — extractAndSaveAssets()
    // converts them to Blob records with the new project's deterministic IDs.
    await extractAndSaveAssets(duplicate, newProjectId);

    // Save the lightweight duplicate record
    const record: ProjectRecord = {
      id: newProjectId,
      data: duplicate,
      updatedAt: now,
    };

    await db.projects.add(record);

    logDB('Project duplicated', { originalId: id, newId: newProjectId });

    // Sync duplicated project to server so it's immediately persisted
    syncProjectToServer(duplicate).catch((err) => console.warn('[ProjectsDB] Server sync failed:', err));

    return duplicate;
  } catch (error) {
    console.error('[ProjectsDB] Failed to duplicate project:', error);
    throw new Error(`Failed to duplicate project: ${getErrorMessage(error)}`);
  }
}

/**
 * IMPORT PROJECT FROM ZIP FILE
 * Reads a .dream-e.zip (or legacy .storyweaver.zip) file, extracts
 * the project.json inside, validates its structure, assigns a new
 * unique ID, and saves it to the database.
 *
 * The imported project gets:
 * - A brand new unique ID (avoids collisions with existing projects)
 * - New node and edge IDs (avoids cross-project ID conflicts)
 * - Updated creation and modification timestamps
 * - " (Imported)" appended to the title for clarity
 *
 * ASSET HANDLING:
 * Imported projects contain inline base64 strings (from the ZIP export).
 * extractAndSaveAssets() converts these to separate asset records on import,
 * so the project record stored in IndexedDB is immediately lightweight.
 *
 * @param file - The .dream-e.zip or .storyweaver.zip File from a file input or drop
 * @returns The imported project
 * @throws Error if the file is not valid or import fails
 */
export async function importProject(file: File): Promise<Project> {
  logDB('Importing project from file', file.name);

  try {
    // Dynamically import JSZip (it's already a dependency)
    const JSZip = (await import('jszip')).default;

    // Read the ZIP file
    const zip = await JSZip.loadAsync(file);

    // Look for project.json inside the ZIP
    const projectFile = zip.file('project.json');
    if (!projectFile) {
      throw new Error(
        'Invalid Dream-E file: no project.json found inside the ZIP.'
      );
    }

    // Parse the JSON content
    const jsonText = await projectFile.async('text');
    let projectData: Project;

    try {
      projectData = JSON.parse(jsonText);
    } catch {
      throw new Error(
        'Invalid Dream-E file: project.json contains invalid JSON.'
      );
    }

    // Basic validation — make sure it looks like a Dream-E project
    if (!projectData.info || !projectData.nodes || !projectData.edges) {
      throw new Error(
        'Invalid Dream-E file: missing required project fields (info, nodes, edges).'
      );
    }

    if (!projectData.info.title) {
      throw new Error(
        'Invalid Dream-E file: project has no title.'
      );
    }

    // Generate a new unique ID for this import
    const newProjectId = generateId('project');
    const now = Date.now();

    // Build maps of old IDs to new IDs so all internal references stay consistent.
    // This includes node IDs AND choice IDs (which are used as edge sourceHandles).
    const idMap = new Map<string, string>();

    // Generate new node IDs and choice IDs
    const newNodes = projectData.nodes.map((node) => {
      const newNodeId = generateId('node');
      idMap.set(node.id, newNodeId);

      const clonedNode = structuredClone(node);
      clonedNode.id = newNodeId;

      // Regenerate choice IDs inside scene nodes AND record old→new mapping.
      // This is critical because edges use choice IDs as their sourceHandle
      // to identify which output port they connect from.
      if (clonedNode.type === 'scene' && clonedNode.data?.choices) {
        clonedNode.data.choices = clonedNode.data.choices.map(
          (choice: { id: string; label: string }) => {
            const newChoiceId = generateId('choice');
            idMap.set(choice.id, newChoiceId);
            return { ...choice, id: newChoiceId };
          }
        );
      }

      return clonedNode;
    });

    // Update edges with new IDs — remap source, target, AND sourceHandle.
    // sourceHandle can be a choice ID (e.g. "choice_abc123"), "default", or "success"/"failure".
    // Only choice IDs exist in the idMap, so fixed strings pass through unchanged.
    const newEdges = projectData.edges.map((edge) => ({
      ...structuredClone(edge),
      id: generateId('edge'),
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
      sourceHandle: (edge.sourceHandle && idMap.get(edge.sourceHandle)) || edge.sourceHandle,
    }));

    // Regenerate variable IDs
    const newVariables = (projectData.globalVariables || []).map((v) => ({
      ...structuredClone(v),
      id: generateId('var'),
    }));

    // Update the start node reference
    const settings = projectData.settings
      ? structuredClone(projectData.settings)
      : createDefaultSettings();

    if (settings.startNodeId && idMap.has(settings.startNodeId)) {
      settings.startNodeId = idMap.get(settings.startNodeId)!;
    }

    // ROBUSTNESS FIX: If startNodeId is empty/missing or doesn't map to any
    // new node, fall back to the first scene node. This prevents "Node not found"
    // errors when importing old ZIPs that lack a settings field or have an
    // unmapped startNodeId.
    if (!settings.startNodeId || !newNodes.some(n => n.id === settings.startNodeId)) {
      const firstScene = newNodes.find(n => n.type === 'scene');
      settings.startNodeId = firstScene?.id || newNodes[0]?.id || '';
      if (settings.startNodeId) {
        logDB('Import: repaired missing startNodeId', { fallback: settings.startNodeId });
      }
    }

    // Regenerate entity IDs and remap any entity references in scene nodes
    const entityIdMap = new Map<string, string>();
    const newEntities = (projectData.entities || []).map((entity) => {
      const newEntityId = generateId('entity');
      entityIdMap.set(entity.id, newEntityId);
      // Deep clone to capture profile and all nested data
      const cloned = structuredClone(entity);
      cloned.id = newEntityId;
      return cloned;
    });

    // Remap entity references inside scene node data (linkedCharacters, linkedLocations, etc.)
    for (const node of newNodes) {
      if (node.type === 'scene' && node.data) {
        const d = node.data as Record<string, unknown>;
        for (const field of ['linkedCharacters', 'linkedLocations', 'linkedObjects', 'linkedConcepts']) {
          if (Array.isArray(d[field])) {
            d[field] = (d[field] as string[]).map(
              (eid: string) => entityIdMap.get(eid) || eid
            );
          }
        }
        // Remap entityStates keys
        if (d.entityStates && typeof d.entityStates === 'object') {
          const oldStates = d.entityStates as Record<string, unknown>;
          const newStates: Record<string, unknown> = {};
          for (const [oldId, val] of Object.entries(oldStates)) {
            newStates[entityIdMap.get(oldId) || oldId] = val;
          }
          d.entityStates = newStates;
        }
      }
    }

    // Assemble the imported project — include ALL fields from the source
    const importedProject: Project = {
      id: newProjectId,
      info: {
        ...projectData.info,
        title: `${projectData.info.title} (Imported)`,
        createdAt: now,
        updatedAt: now,
      },
      globalVariables: newVariables,
      nodes: newNodes,
      edges: newEdges,
      settings,
      entities: newEntities,
      notes: projectData.notes || '',
      assetNames: projectData.assetNames
        ? structuredClone(projectData.assetNames)
        : {},
      chatMessages: [],
    };

    // Extract inline base64 assets into separate asset records.
    // The imported project contains full base64 strings from the ZIP file.
    // This converts them to native Blobs in the assets table so the project
    // record saved to IndexedDB is lightweight from the start.
    const extracted = await extractAndSaveAssets(importedProject, newProjectId);
    if (extracted > 0) {
      logDB(`Import: extracted ${extracted} assets to separate records`);
    }

    // Save the lightweight project record
    const record: ProjectRecord = {
      id: newProjectId,
      data: importedProject,
      updatedAt: now,
    };

    await db.projects.add(record);

    logDB('Project imported', {
      id: newProjectId,
      title: importedProject.info.title,
      nodeCount: newNodes.length,
    });

    // Sync imported project to server so it's immediately persisted.
    // The imported project has asset:{id} references (assets were extracted
    // to IndexedDB). The server stores the lightweight project JSON — asset
    // binary data stays in IndexedDB for now (server asset sync is separate).
    syncProjectToServer(importedProject).catch((err) => console.warn('[ProjectsDB] Server sync failed:', err));

    return importedProject;
  } catch (error) {
    console.error('[ProjectsDB] Failed to import project:', error);
    throw new Error(
      `Failed to import project: ${getErrorMessage(error)}`
    );
  }
}

/**
 * CHECK IF PROJECT EXISTS
 * Quickly checks if a project exists without loading all data.
 *
 * @param id - Project ID to check
 * @returns true if project exists
 */
export async function projectExists(id: string): Promise<boolean> {
  const count = await db.projects.where('id').equals(id).count();
  return count > 0;
}

// =============================================================================
// STARTER CONTENT
// =============================================================================

/**
 * DEFAULT DREAM ROOM TEXT
 * The introductory scene text for every new adventure. Describes a white
 * holodeck-like simulation room that can become anything the player imagines.
 * This is paired with the dreamroom.jpg image in public/.
 */
const DEFAULT_START_TEXT = `You wake up standing in the middle of a perfectly empty room.

The floor is smooth white glass. The walls curve upward like the inside of a giant pearl. Soft light glows from nowhere and everywhere at once.

There are no doors. No windows. No furniture.

Just you.

For a moment you wonder if you're dreaming. Then a calm voice speaks from the air around you.

"Welcome to the Dream Room."

A faint ripple of light passes across the walls. The empty space begins to shimmer, as if reality itself is waiting for instructions.

"This environment is a fully immersive holodeck simulation. Any world can be created here. Any story. Any person."

You feel a subtle vibration under your feet, like the room is alive.

"You will be able to walk through cities that do not exist. Meet people who were never born. Fight battles, solve mysteries, fall in love, explore distant planets, or relive forgotten memories."

The voice pauses for a moment.

"In this room, your imagination becomes reality."

You raise your hand and notice something strange: the air ripples slightly where your fingers move, like touching the surface of water.

"This simulation will feel real," the voice continues.

"You will feel wind, warmth, movement. You may even feel pain or exhaustion. But do not worry — your body will always remain safe."

The white walls pulse faintly with soft light.

"Nothing here can truly harm you."

A thin circle of glowing symbols appears in the air in front of you. It slowly rotates, waiting.

"Simply imagine a world."

The room grows quiet.

Reality itself seems to lean forward in anticipation.

What would you like to create?`;

/**
 * CREATE STARTER SCENE NODE
 * Creates a default starting scene for new projects.
 *
 * Every new adventure starts in the "Dream Room" — a white holodeck-like
 * environment. The background image (/dreamroom.jpg) is served from public/
 * and the story text introduces the player to the simulation concept.
 * This ensures players can immediately jump into Open World mode.
 *
 * @returns A new scene node with the Dream Room setup
 */
function createStarterSceneNode(): SceneNode {
  return {
    id: generateId('node'),
    type: 'scene',
    position: { x: 250, y: 200 },
    label: 'The Dream Room',
    data: {
      storyText: DEFAULT_START_TEXT,
      speakerName: 'Narrator',
      backgroundImage: '/dreamroom.jpg',
      choices: [
        {
          id: generateId('choice'),
          label: 'Begin the adventure',
        },
      ],
      musicKeepPlaying: false,
      voiceoverAutoplay: false,
    },
  };
}

/**
 * GET ERROR MESSAGE
 * Extracts a readable error message from various error types.
 *
 * @param error - The error object
 * @returns Human-readable error message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}
