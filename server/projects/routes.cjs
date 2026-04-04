/**
 * =============================================================================
 * PROJECT ROUTES
 * =============================================================================
 *
 * Express router for project CRUD operations, export, and import.
 *
 * All routes require authentication (requireAuth applied at mount level).
 * Project ownership is verified on every per-project operation to prevent
 * unauthorized access (user A can't read/modify user B's projects).
 *
 * Endpoints:
 *   GET    /             — List all projects for the authenticated user
 *   POST   /             — Create a new project
 *   GET    /:id          — Get a single project (full data)
 *   PUT    /:id          — Update a project
 *   DELETE /:id          — Delete a project and all its assets
 *   GET    /:id/export   — Generate a downloadable ZIP file
 *   POST   /import       — Import a project from an uploaded ZIP
 *
 * Project data structure:
 *   The "data" column stores the full serialized project JSON (scenes, entities,
 *   connections, settings, etc.). Assets referenced within the project may use
 *   "asset:{id}" references that the client resolves by fetching from /assets/:id.
 *
 * =============================================================================
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const { getDb, saveDb, ASSETS_DIR, EXPORTS_DIR } = require('../db.cjs');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies that a project belongs to the authenticated user.
 * Returns the project row if authorized, or sends 404/403 and returns null.
 *
 * @param {import('sql.js').Database} db - Database instance.
 * @param {string} projectId - The project ID from the URL.
 * @param {string} userId - The authenticated user's ID.
 * @param {import('express').Response} res - Express response (for sending errors).
 * @returns {Array|null} The project row [id, user_id, data, updated_at, created_at] or null.
 */
function verifyProjectOwnership(db, projectId, userId, res) {
  const result = db.exec(
    'SELECT id, user_id, data, updated_at, created_at FROM projects WHERE id = ?',
    [projectId]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    res.status(404).json({ error: 'Project not found.' });
    return null;
  }

  const row = result[0].values[0];
  const projectUserId = row[1];

  if (projectUserId !== userId) {
    // Return 404 instead of 403 to avoid leaking project existence info.
    res.status(404).json({ error: 'Project not found.' });
    return null;
  }

  return row;
}

/**
 * Safely extracts summary fields from a project's JSON data.
 * Used for the project list endpoint where we don't want to send the full blob.
 *
 * @param {string} dataStr - The raw JSON string from the database.
 * @param {string} projectId - The project ID (fallback for title).
 * @returns {{ title: string, nodeCount: number, mode: string, theme: string }}
 */
function extractProjectSummary(dataStr, projectId) {
  try {
    const data = JSON.parse(dataStr);
    return {
      title: data?.info?.title || data?.settings?.projectName || `Project ${projectId.slice(0, 8)}`,
      nodeCount: data?.scenes ? Object.keys(data.scenes).length : 0,
      mode: data?.settings?.mode || 'editor',
      theme: data?.settings?.theme || 'default',
    };
  } catch {
    // If the JSON is malformed, return safe defaults.
    return {
      title: `Project ${projectId.slice(0, 8)}`,
      nodeCount: 0,
      mode: 'unknown',
      theme: 'default',
    };
  }
}

/**
 * Recursively deletes a directory and all its contents.
 * Used when deleting a project's asset folder.
 *
 * @param {string} dirPath - Absolute path to the directory to remove.
 */
function removeDirectoryRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// GET / — List all projects for the authenticated user
// ---------------------------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    const db = await getDb();

    const result = db.exec(
      'SELECT id, data, updated_at, created_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
      [req.userId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ projects: [] });
    }

    // Map each row to a lightweight summary (don't send the full project data).
    const projects = result[0].values.map(row => {
      const [id, data, updatedAt, createdAt] = row;
      const summary = extractProjectSummary(data, id);
      return {
        id,
        title: summary.title,
        nodeCount: summary.nodeCount,
        mode: summary.mode,
        theme: summary.theme,
        updatedAt,
        createdAt,
      };
    });

    res.json({ projects });
  } catch (err) {
    console.error('[PROJECTS] List error:', err);
    res.status(500).json({ error: 'Internal server error while listing projects.' });
  }
});

// ---------------------------------------------------------------------------
// POST / — Create a new project
// ---------------------------------------------------------------------------

router.post('/', async (req, res) => {
  try {
    const { data } = req.body || {};

    if (!data) {
      return res.status(400).json({ error: 'Project data is required.' });
    }

    // Validate that data is valid JSON (or already an object).
    let dataStr;
    if (typeof data === 'string') {
      try {
        JSON.parse(data); // Validate
        dataStr = data;
      } catch {
        return res.status(400).json({ error: 'Project data must be valid JSON.' });
      }
    } else {
      dataStr = JSON.stringify(data);
    }

    const db = await getDb();
    const projectId = uuidv4();
    const now = Date.now();

    db.run(
      'INSERT INTO projects (id, user_id, data, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [projectId, req.userId, dataStr, now, now]
    );
    saveDb();

    console.log(`[PROJECTS] Created project ${projectId} for user ${req.userId}`);

    res.status(201).json({ id: projectId });
  } catch (err) {
    console.error('[PROJECTS] Create error:', err);
    res.status(500).json({ error: 'Internal server error while creating project.' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id — Get a single project (full data)
// ---------------------------------------------------------------------------

/**
 * Strip dead blob URLs from project data before returning to the client.
 *
 * WHY THIS IS NEEDED:
 * Blob URLs (blob:http://...) are session-scoped browser objects that don't
 * survive page reloads, server restarts, or device changes. If they were
 * accidentally stored in the database (from before the blob-URL extraction
 * fix), they become dead pointers that the browser can never resolve.
 * Sending them to the client would cause broken images/audio.
 *
 * This function walks all known asset fields and replaces any blob: URLs
 * with empty strings so the client sees "no asset" rather than a broken
 * reference. The client's asset recovery system can then attempt to
 * recover the asset from IndexedDB or regenerate it.
 *
 * @param {object} data - The parsed project data object (mutated in place)
 * @returns {object} The cleaned data (same reference, mutated)
 */
function cleanBlobUrls(data) {
  if (!data || typeof data !== 'object') return data;

  const assetFields = [
    'backgroundImage', 'backgroundMusic', 'voiceoverAudio',
    'referenceImage', 'referenceVoice', 'defaultMusic', 'image',
  ];

  let cleaned = 0;

  // Clean scene node assets
  for (const node of data.nodes || []) {
    if (node.data) {
      for (const field of assetFields) {
        if (typeof node.data[field] === 'string' && node.data[field].startsWith('blob:')) {
          node.data[field] = '';
          cleaned++;
        }
      }
    }
  }

  // Clean entity assets
  for (const entity of data.entities || []) {
    for (const field of assetFields) {
      if (typeof entity[field] === 'string' && entity[field].startsWith('blob:')) {
        entity[field] = '';
        cleaned++;
      }
    }
  }

  // Clean cover image
  if (data.info && typeof data.info.coverImage === 'string' && data.info.coverImage.startsWith('blob:')) {
    data.info.coverImage = '';
    cleaned++;
  }

  if (cleaned > 0) {
    console.log(`[PROJECTS] Cleaned ${cleaned} dead blob URL(s) from project data`);
  }

  return data;
}

/**
 * Auto-repair empty asset fields by checking if matching asset records
 * exist in the database. If a scene's backgroundImage is '' but an asset
 * record with the expected deterministic ID exists, restore the reference.
 *
 * This handles the case where cleanBlobUrls stripped dead blob URLs but
 * the binary asset data was already uploaded to the server. Without this
 * repair, images appear lost even though the data is on disk.
 *
 * @param {object} data - The project data object (mutated in place)
 * @param {string} projectId - The project ID (for building asset IDs)
 * @param {import('sql.js').Database} db - The database for asset lookups
 * @returns {object} The repaired data
 */
function repairAssetReferences(data, projectId, db) {
  if (!data || typeof data !== 'object' || !projectId) return data;

  const sceneFields = ['backgroundImage', 'backgroundMusic', 'voiceoverAudio'];
  const entityFields = ['referenceImage', 'referenceVoice', 'defaultMusic'];
  const cowriteFields = ['image', 'voiceoverAudio', 'backgroundMusic'];
  let repaired = 0;

  // Repair scene nodes
  for (const node of data.nodes || []) {
    if (!node.data || !node.id) continue;
    const fields = node.type === 'scene' ? sceneFields
      : ['storyRoot', 'plot', 'act', 'cowriteScene'].includes(node.type) ? cowriteFields
      : [];
    for (const field of fields) {
      if (node.data[field] && node.data[field] !== '') continue; // already has value
      const assetId = `${projectId}_${node.id}_${field}`;
      const exists = db.exec('SELECT COUNT(*) FROM assets WHERE id = ?', [assetId]);
      if (exists.length > 0 && exists[0].values[0][0] > 0) {
        node.data[field] = `asset:${assetId}`;
        repaired++;
      }
    }
  }

  // Repair entities
  for (const entity of data.entities || []) {
    if (!entity.id) continue;
    for (const field of entityFields) {
      if (entity[field] && entity[field] !== '') continue;
      const assetId = `${projectId}_${entity.id}_${field}`;
      const exists = db.exec('SELECT COUNT(*) FROM assets WHERE id = ?', [assetId]);
      if (exists.length > 0 && exists[0].values[0][0] > 0) {
        entity[field] = `asset:${assetId}`;
        repaired++;
      }
    }
  }

  // Repair cover image
  if (data.info && (!data.info.coverImage || data.info.coverImage === '')) {
    const assetId = `${projectId}_coverImage`;
    const exists = db.exec('SELECT COUNT(*) FROM assets WHERE id = ?', [assetId]);
    if (exists.length > 0 && exists[0].values[0][0] > 0) {
      data.info.coverImage = `asset:${assetId}`;
      repaired++;
    }
  }

  if (repaired > 0) {
    console.log(`[PROJECTS] Auto-repaired ${repaired} asset reference(s) from server asset records`);
    // Save the repaired data back to the database so future loads don't need repair
    db.run('UPDATE projects SET data = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(data), Date.now(), projectId]);
    const { saveDb } = require('../db.cjs');
    saveDb();
  }

  return data;
}

router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const row = verifyProjectOwnership(db, req.params.id, req.userId, res);
    if (!row) return; // Response already sent by verifyProjectOwnership

    const [id, , data, updatedAt, createdAt] = row;

    // Parse the data JSON so the client receives a proper object.
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = data; // Fall back to raw string if parse fails
    }

    // Strip any dead blob URLs before returning to the client.
    // Blob URLs are session-scoped and never valid across sessions.
    if (typeof parsedData === 'object' && parsedData !== null) {
      cleanBlobUrls(parsedData);
      // Auto-repair: if asset fields are empty but matching asset records
      // exist on the server, restore the asset:{id} references. This
      // recovers images that were lost when cleanBlobUrls stripped dead
      // blob URLs but the binary data had already been uploaded.
      repairAssetReferences(parsedData, id, db);
    }

    res.json({
      id,
      data: parsedData,
      updatedAt,
      createdAt,
    });
  } catch (err) {
    console.error('[PROJECTS] Get error:', err);
    res.status(500).json({ error: 'Internal server error while retrieving project.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — Update a project
// ---------------------------------------------------------------------------

router.put('/:id', async (req, res) => {
  try {
    const { data } = req.body || {};

    if (!data) {
      return res.status(400).json({ error: 'Project data is required.' });
    }

    const db = await getDb();

    // Clean blob URLs before storing — blob URLs are session-scoped browser
    // objects that become dead pointers after page reload. Strip them on
    // save to prevent accumulating stale references in the database.
    let dataObj;
    let dataStr;
    if (typeof data === 'string') {
      try {
        dataObj = JSON.parse(data);
      } catch {
        return res.status(400).json({ error: 'Project data must be valid JSON.' });
      }
    } else {
      dataObj = data;
    }
    cleanBlobUrls(dataObj);
    dataStr = JSON.stringify(dataObj);

    const now = Date.now();

    // UPSERT: Check if the project exists. If it does, verify ownership
    // and update. If it doesn't, create it for this user.
    // This is critical for syncProjectToServer() which uses PUT for both
    // initial sync and subsequent saves.
    const existingResult = db.exec(
      'SELECT user_id FROM projects WHERE id = ?',
      [req.params.id]
    );

    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      // Project exists — verify ownership before updating
      const ownerId = existingResult[0].values[0][0];
      if (ownerId !== req.userId) {
        return res.status(403).json({ error: 'Not your project.' });
      }
      db.run(
        'UPDATE projects SET data = ?, updated_at = ? WHERE id = ?',
        [dataStr, now, req.params.id]
      );
      console.log(`[PROJECTS] Updated project ${req.params.id}`);
    } else {
      // Project doesn't exist yet — create it for this user
      db.run(
        'INSERT INTO projects (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, req.userId, dataStr, now, now]
      );
      console.log(`[PROJECTS] Created project ${req.params.id} (via PUT upsert)`);
    }

    saveDb();
    res.json({ success: true, updatedAt: now });
  } catch (err) {
    console.error('[PROJECTS] Update error:', err);
    res.status(500).json({ error: 'Internal server error while updating project.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — Delete a project and all its assets
// ---------------------------------------------------------------------------

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const row = verifyProjectOwnership(db, req.params.id, req.userId, res);
    if (!row) return;

    const projectId = req.params.id;

    // Delete all asset records for this project.
    db.run('DELETE FROM assets WHERE project_id = ?', [projectId]);

    // Delete the project record.
    db.run('DELETE FROM projects WHERE id = ?', [projectId]);
    saveDb();

    // Delete asset files from disk.
    const projectAssetsDir = path.join(ASSETS_DIR, projectId);
    removeDirectoryRecursive(projectAssetsDir);

    console.log(`[PROJECTS] Deleted project ${projectId} and all its assets`);

    res.json({ success: true });
  } catch (err) {
    console.error('[PROJECTS] Delete error:', err);
    res.status(500).json({ error: 'Internal server error while deleting project.' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/export — Generate a downloadable ZIP
// ---------------------------------------------------------------------------

router.get('/:id/export', async (req, res) => {
  try {
    const db = await getDb();
    const row = verifyProjectOwnership(db, req.params.id, req.userId, res);
    if (!row) return;

    const projectId = req.params.id;
    const [, , dataStr] = row;

    // Parse project data to resolve asset references.
    let projectData;
    try {
      projectData = JSON.parse(dataStr);
    } catch {
      return res.status(500).json({ error: 'Project data is corrupted.' });
    }

    // Load JSZip dynamically (it's a dependency of the main project).
    let JSZip;
    try {
      JSZip = require('jszip');
    } catch {
      return res.status(500).json({ error: 'JSZip not available for export.' });
    }

    const zip = new JSZip();

    // Get all assets for this project.
    const assetsResult = db.exec(
      'SELECT id, type, name, mime_type FROM assets WHERE project_id = ?',
      [projectId]
    );

    // Read each asset from disk and add to the ZIP.
    // Also build a map of asset:{id} -> base64 for inline resolution.
    const assetMap = {};
    if (assetsResult.length > 0 && assetsResult[0].values.length > 0) {
      for (const assetRow of assetsResult[0].values) {
        const [assetId, assetType, assetName, mimeType] = assetRow;
        const assetPath = path.join(ASSETS_DIR, projectId, `${assetId}.bin`);

        if (fs.existsSync(assetPath)) {
          const assetBuffer = fs.readFileSync(assetPath);
          const base64 = assetBuffer.toString('base64');
          const dataUrl = `data:${mimeType};base64,${base64}`;

          // Add the raw binary to the ZIP's assets folder.
          zip.file(`assets/${assetId}.bin`, assetBuffer);

          // Map asset references for inline resolution in project.json.
          assetMap[`asset:${assetId}`] = dataUrl;
        }
      }
    }

    // Resolve asset references in the project data.
    // Walk through the JSON string and replace all "asset:{id}" references
    // with their base64 data URLs.
    let resolvedDataStr = JSON.stringify(projectData);
    for (const [ref, dataUrl] of Object.entries(assetMap)) {
      // Use a global replace in case the same asset is referenced multiple times.
      resolvedDataStr = resolvedDataStr.split(ref).join(dataUrl);
    }

    // Add the resolved project.json to the ZIP.
    zip.file('project.json', resolvedDataStr);

    // Generate the ZIP buffer.
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    // Write to the exports directory with a unique filename.
    const exportId = uuidv4();
    const exportPath = path.join(EXPORTS_DIR, `${exportId}.zip`);

    if (!fs.existsSync(EXPORTS_DIR)) {
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }
    fs.writeFileSync(exportPath, zipBuffer);

    console.log(`[PROJECTS] Generated export ZIP for project ${projectId}: ${exportPath} (${zipBuffer.length} bytes)`);

    res.json({
      downloadUrl: `/api/v2/exports/${exportId}`,
      size: zipBuffer.length,
    });
  } catch (err) {
    console.error('[PROJECTS] Export error:', err);
    res.status(500).json({ error: 'Internal server error while exporting project.' });
  }
});

// ---------------------------------------------------------------------------
// POST /import — Import a project from uploaded JSON or ZIP
// ---------------------------------------------------------------------------

router.post('/import', async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';

    let projectData;
    let assetsToStore = []; // Array of { id, buffer, mimeType, name, type }

    if (contentType.includes('application/json')) {
      // Direct JSON import (no ZIP, no assets to extract).
      projectData = req.body?.data || req.body;

      if (typeof projectData === 'string') {
        try {
          projectData = JSON.parse(projectData);
        } catch {
          return res.status(400).json({ error: 'Invalid JSON in import data.' });
        }
      }
    } else {
      // ZIP import: expect raw binary body.
      // The client should send the ZIP as a raw buffer with appropriate content-type.
      let JSZip;
      try {
        JSZip = require('jszip');
      } catch {
        return res.status(500).json({ error: 'JSZip not available for import.' });
      }

      // Collect the raw body if it hasn't been parsed.
      let rawBody;
      if (Buffer.isBuffer(req.body)) {
        rawBody = req.body;
      } else if (typeof req.body === 'string') {
        rawBody = Buffer.from(req.body, 'binary');
      } else {
        // Try reading from the request stream.
        rawBody = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on('data', chunk => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
          req.on('error', reject);
        });
      }

      let zip;
      try {
        zip = await JSZip.loadAsync(rawBody);
      } catch {
        return res.status(400).json({ error: 'Invalid ZIP file.' });
      }

      // Extract project.json from the ZIP.
      const projectFile = zip.file('project.json');
      if (!projectFile) {
        return res.status(400).json({ error: 'ZIP does not contain project.json.' });
      }

      const projectJsonStr = await projectFile.async('string');
      try {
        projectData = JSON.parse(projectJsonStr);
      } catch {
        return res.status(400).json({ error: 'project.json contains invalid JSON.' });
      }

      // Extract assets from the ZIP (if any).
      const assetsFolder = zip.folder('assets');
      if (assetsFolder) {
        const assetFiles = [];
        assetsFolder.forEach((relativePath, file) => {
          if (!file.dir) {
            assetFiles.push({ relativePath, file });
          }
        });

        for (const { relativePath, file } of assetFiles) {
          const buffer = await file.async('nodebuffer');
          const assetId = path.basename(relativePath, '.bin');
          assetsToStore.push({
            id: assetId,
            buffer,
            mimeType: 'application/octet-stream', // Will be updated if we can detect it
            name: relativePath,
            type: 'imported',
          });
        }
      }
    }

    // Validate that we got some project data.
    if (!projectData || typeof projectData !== 'object') {
      return res.status(400).json({ error: 'No valid project data found in import.' });
    }

    // Create the project record.
    const db = await getDb();
    const projectId = uuidv4();
    const now = Date.now();
    const dataStr = JSON.stringify(projectData);

    db.run(
      'INSERT INTO projects (id, user_id, data, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [projectId, req.userId, dataStr, now, now]
    );

    // Store extracted assets on disk and in the database.
    if (assetsToStore.length > 0) {
      const projectAssetsDir = path.join(ASSETS_DIR, projectId);
      if (!fs.existsSync(projectAssetsDir)) {
        fs.mkdirSync(projectAssetsDir, { recursive: true });
      }

      for (const asset of assetsToStore) {
        const assetId = asset.id || uuidv4();
        const assetPath = path.join(projectAssetsDir, `${assetId}.bin`);
        fs.writeFileSync(assetPath, asset.buffer);

        db.run(
          'INSERT INTO assets (id, project_id, type, name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [assetId, projectId, asset.type, asset.name, asset.mimeType, asset.buffer.length, now]
        );
      }
    }

    saveDb();

    console.log(`[PROJECTS] Imported project ${projectId} with ${assetsToStore.length} assets`);

    res.status(201).json({ id: projectId });
  } catch (err) {
    console.error('[PROJECTS] Import error:', err);
    res.status(500).json({ error: 'Internal server error while importing project.' });
  }
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = router;
