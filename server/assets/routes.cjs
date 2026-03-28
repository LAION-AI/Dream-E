/**
 * =============================================================================
 * ASSET ROUTES
 * =============================================================================
 *
 * Express router for binary asset operations (images, audio files, etc.).
 *
 * Assets are stored as binary files on disk at:
 *   server-data/assets/{projectId}/{assetId}.bin
 *
 * The database's "assets" table stores metadata (type, name, mime_type, size)
 * while the actual bytes live on the filesystem. This keeps the SQLite database
 * small and avoids loading large blobs into memory unnecessarily.
 *
 * All routes require authentication (requireAuth applied at mount level).
 * Asset access is verified through project ownership — you can only access
 * assets belonging to your own projects.
 *
 * Endpoints:
 *   GET /:id     — Download an asset (streams the binary file)
 *   PUT /:id     — Upload/replace an asset (accepts raw binary or base64)
 *   DELETE /:id  — Delete an asset (removes file and DB record)
 *
 * =============================================================================
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const { getDb, saveDb, ASSETS_DIR } = require('../db.cjs');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies that an asset exists and belongs to a project owned by the
 * authenticated user. Returns the asset row if authorized.
 *
 * The ownership check is done by joining assets -> projects and verifying
 * the project's user_id matches the request's userId.
 *
 * @param {import('sql.js').Database} db - Database instance.
 * @param {string} assetId - The asset ID from the URL.
 * @param {string} userId - The authenticated user's ID.
 * @param {import('express').Response} res - Express response (for sending errors).
 * @returns {Array|null} The asset row or null if not found/unauthorized.
 */
function verifyAssetAccess(db, assetId, userId, res) {
  // sql.js doesn't support JOIN syntax in exec() parameterized queries the same
  // way, so we do two queries. First get the asset, then verify the project owner.
  const assetResult = db.exec(
    'SELECT id, project_id, type, name, mime_type, size FROM assets WHERE id = ?',
    [assetId]
  );

  if (assetResult.length === 0 || assetResult[0].values.length === 0) {
    res.status(404).json({ error: 'Asset not found.' });
    return null;
  }

  const assetRow = assetResult[0].values[0];
  const projectId = assetRow[1];

  // Verify the project belongs to this user.
  const projectResult = db.exec(
    'SELECT user_id FROM projects WHERE id = ?',
    [projectId]
  );

  if (projectResult.length === 0 || projectResult[0].values.length === 0) {
    res.status(404).json({ error: 'Asset not found.' });
    return null;
  }

  const projectUserId = projectResult[0].values[0][0];
  if (projectUserId !== userId) {
    // 404 instead of 403 to avoid leaking info about other users' assets.
    res.status(404).json({ error: 'Asset not found.' });
    return null;
  }

  return assetRow;
}

/**
 * Detects MIME type from a buffer's magic bytes.
 * Falls back to 'application/octet-stream' if unrecognized.
 *
 * @param {Buffer} buffer - The file data.
 * @returns {string} The detected MIME type.
 */
function detectMimeType(buffer) {
  if (!buffer || buffer.length < 4) return 'application/octet-stream';

  // Check magic bytes for common formats.
  const hex = buffer.slice(0, 8).toString('hex');

  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3')) return 'audio/mpeg';
  if (hex.startsWith('4f676753')) return 'audio/ogg';
  if (hex.startsWith('52494646') && buffer.slice(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (hex.startsWith('664c6143')) return 'audio/flac';

  return 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// GET /:id — Download an asset
// ---------------------------------------------------------------------------

router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const assetRow = verifyAssetAccess(db, req.params.id, req.userId, res);
    if (!assetRow) return;

    const [assetId, projectId, , , mimeType] = assetRow;
    const assetPath = path.join(ASSETS_DIR, projectId, `${assetId}.bin`);

    if (!fs.existsSync(assetPath)) {
      return res.status(404).json({ error: 'Asset file not found on disk.' });
    }

    // Set the Content-Type so the browser can render images/play audio directly.
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');

    // Set cache headers: assets are immutable (identified by UUID), so they can
    // be cached aggressively. If the content changes, a new asset ID is generated.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Stream the file to the response to avoid loading the entire thing into memory.
    const stream = fs.createReadStream(assetPath);
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error(`[ASSETS] Error streaming asset ${assetId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading asset file.' });
      }
    });
  } catch (err) {
    console.error('[ASSETS] Get error:', err);
    res.status(500).json({ error: 'Internal server error while retrieving asset.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — Upload/replace an asset
// ---------------------------------------------------------------------------

/**
 * Accepts the asset as:
 *   - Raw binary body (Content-Type: application/octet-stream or image/*)
 *   - Base64 string in JSON body ({ data: "base64...", mimeType: "...", name: "..." })
 *   - Data URL in JSON body ({ data: "data:image/png;base64,..." })
 *
 * If the asset doesn't exist yet, it's created. If it exists (same ID), it's replaced.
 * The projectId must be provided as a query parameter: PUT /assets/:id?projectId=xxx
 */
router.put('/:id', async (req, res) => {
  try {
    const assetId = req.params.id;
    const projectId = req.query.projectId;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId query parameter is required.' });
    }

    const db = await getDb();

    // Verify the project belongs to this user.
    const projectResult = db.exec(
      'SELECT user_id FROM projects WHERE id = ?',
      [projectId]
    );
    if (
      projectResult.length === 0 ||
      projectResult[0].values.length === 0 ||
      projectResult[0].values[0][0] !== req.userId
    ) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    let buffer;
    let mimeType = 'application/octet-stream';
    let name = assetId;
    let type = 'uploaded';

    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      // JSON body with base64 data.
      const { data, mimeType: providedMime, name: providedName, type: providedType } = req.body || {};

      if (!data) {
        return res.status(400).json({ error: 'Asset data is required (base64 string or data URL).' });
      }

      if (providedMime) mimeType = providedMime;
      if (providedName) name = providedName;
      if (providedType) type = providedType;

      // Handle data URLs (strip the prefix to get raw base64).
      let base64 = data;
      const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        base64 = dataUrlMatch[2];
      }

      buffer = Buffer.from(base64, 'base64');
    } else {
      // Raw binary body.
      if (Buffer.isBuffer(req.body)) {
        buffer = req.body;
      } else {
        // If body wasn't parsed as buffer, read from stream.
        buffer = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on('data', chunk => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
          req.on('error', reject);
        });
      }

      // Try to detect MIME type from the binary content.
      mimeType = detectMimeType(buffer);
    }

    // Ensure the project's asset directory exists.
    const projectAssetsDir = path.join(ASSETS_DIR, projectId);
    if (!fs.existsSync(projectAssetsDir)) {
      fs.mkdirSync(projectAssetsDir, { recursive: true });
    }

    // Write the binary file to disk.
    const assetPath = path.join(projectAssetsDir, `${assetId}.bin`);
    fs.writeFileSync(assetPath, buffer);

    // Upsert the asset record in the database.
    // Check if it already exists.
    const existingAsset = db.exec('SELECT id FROM assets WHERE id = ?', [assetId]);
    const now = Date.now();

    if (existingAsset.length > 0 && existingAsset[0].values.length > 0) {
      // Update existing record.
      db.run(
        'UPDATE assets SET type = ?, name = ?, mime_type = ?, size = ? WHERE id = ?',
        [type, name, mimeType, buffer.length, assetId]
      );
    } else {
      // Insert new record.
      db.run(
        'INSERT INTO assets (id, project_id, type, name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [assetId, projectId, type, name, mimeType, buffer.length, now]
      );
    }
    saveDb();

    console.log(`[ASSETS] Stored asset ${assetId} (${buffer.length} bytes, ${mimeType}) for project ${projectId}`);

    res.json({
      success: true,
      id: assetId,
      size: buffer.length,
      mimeType,
    });
  } catch (err) {
    console.error('[ASSETS] Put error:', err);
    res.status(500).json({ error: 'Internal server error while storing asset.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — Delete an asset
// ---------------------------------------------------------------------------

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const assetRow = verifyAssetAccess(db, req.params.id, req.userId, res);
    if (!assetRow) return;

    const [assetId, projectId] = assetRow;
    const assetPath = path.join(ASSETS_DIR, projectId, `${assetId}.bin`);

    // Delete the file from disk.
    if (fs.existsSync(assetPath)) {
      fs.unlinkSync(assetPath);
    }

    // Delete the database record.
    db.run('DELETE FROM assets WHERE id = ?', [assetId]);
    saveDb();

    console.log(`[ASSETS] Deleted asset ${assetId} from project ${projectId}`);

    res.json({ success: true });
  } catch (err) {
    console.error('[ASSETS] Delete error:', err);
    res.status(500).json({ error: 'Internal server error while deleting asset.' });
  }
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = router;
