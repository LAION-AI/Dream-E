/**
 * =============================================================================
 * SERVER APPLICATION FACTORY
 * =============================================================================
 *
 * Creates and configures the Express application for Dream-E's server-side API.
 * This module is designed to be mounted as middleware in the Vite dev server
 * at the /api/v2 prefix, providing:
 *
 *   /api/v2/auth/*      — User authentication (register, login, Google OAuth, etc.)
 *   /api/v2/projects/*  — Project CRUD, export, and import
 *   /api/v2/assets/*    — Binary asset storage (images, audio)
 *   /api/v2/exports/*   — Temporary ZIP download endpoints
 *
 * Architecture:
 *   - Express handles routing, body parsing, and middleware chaining.
 *   - sql.js provides SQLite storage via WASM (no native binary dependency).
 *   - JWT-based auth with short-lived access tokens + long-lived refresh tokens.
 *   - Assets stored as files on disk (not in the DB) to keep memory usage low.
 *
 * Cleanup:
 *   A periodic cleanup job runs every 5 minutes to:
 *   - Delete expired export ZIP files (older than 15 minutes)
 *   - Remove expired sessions from the database
 *
 * Usage (in vite.config.ts):
 *   const { createServerApp } = require('./server/index.cjs');
 *   const serverApp = createServerApp();
 *   server.middlewares.use('/api/v2', serverApp);
 *
 * =============================================================================
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const authRoutes = require('./auth/routes.cjs');
const projectRoutes = require('./projects/routes.cjs');
const assetRoutes = require('./assets/routes.cjs');
const { requireAuth } = require('./auth/middleware.cjs');
const { getDb, saveDb, EXPORTS_DIR } = require('./db.cjs');

// ---------------------------------------------------------------------------
// Cleanup Configuration
// ---------------------------------------------------------------------------

/** How often to run the cleanup job (5 minutes in milliseconds). */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** How long export ZIP files are kept before automatic deletion (15 minutes). */
const EXPORT_MAX_AGE_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Cleanup Job
// ---------------------------------------------------------------------------

/**
 * Periodic cleanup job that removes stale temporary files and expired sessions.
 *
 * This runs as a setInterval inside the server process. It handles:
 *   1. Export ZIP files older than 15 minutes (server-data/exports/*.zip)
 *   2. Expired sessions in the sessions table (refresh tokens past their expiry)
 *
 * Why a cleanup job instead of on-demand cleanup?
 *   - Export files are created by one request and downloaded by another (possibly
 *     minutes later), so we can't clean up inline.
 *   - Expired sessions accumulate if users don't explicitly log out (close tab, etc.).
 *   - A periodic sweep is simpler and more reliable than per-request checks.
 */
async function runCleanup() {
  try {
    // --- Clean up expired export ZIP files ---
    if (fs.existsSync(EXPORTS_DIR)) {
      const now = Date.now();
      const files = fs.readdirSync(EXPORTS_DIR);
      let deletedExports = 0;

      for (const file of files) {
        const filePath = path.join(EXPORTS_DIR, file);
        try {
          const stat = fs.statSync(filePath);
          const ageMs = now - stat.mtimeMs;

          if (ageMs > EXPORT_MAX_AGE_MS) {
            fs.unlinkSync(filePath);
            deletedExports++;
          }
        } catch (err) {
          // Ignore errors for individual files (might have been deleted already).
          console.warn(`[CLEANUP] Error checking export file ${file}:`, err.message);
        }
      }

      if (deletedExports > 0) {
        console.log(`[CLEANUP] Deleted ${deletedExports} expired export file(s)`);
      }
    }

    // --- Clean up expired sessions ---
    const db = await getDb();
    const now = Date.now();

    // Count expired sessions before deleting (for logging).
    const countResult = db.exec(
      'SELECT COUNT(*) FROM sessions WHERE expires_at < ?',
      [now]
    );
    const expiredCount = (countResult.length > 0 && countResult[0].values.length > 0)
      ? countResult[0].values[0][0]
      : 0;

    if (expiredCount > 0) {
      db.run('DELETE FROM sessions WHERE expires_at < ?', [now]);
      saveDb();
      console.log(`[CLEANUP] Deleted ${expiredCount} expired session(s)`);
    }
  } catch (err) {
    // Never let cleanup errors crash the server.
    console.error('[CLEANUP] Error during cleanup job:', err);
  }
}

// ---------------------------------------------------------------------------
// Export Download Handler
// ---------------------------------------------------------------------------

/**
 * Handles GET /exports/:uuid — serves a generated export ZIP for download.
 *
 * Export files are temporary and auto-deleted after 15 minutes. The UUID in the
 * URL acts as an unguessable access token, so no auth is required for the download
 * itself (the user who triggered the export received the URL).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function exportDownloadHandler(req, res) {
  try {
    const exportId = req.params.uuid;

    // Basic UUID format validation to prevent path traversal.
    if (!exportId || !/^[a-f0-9-]{36}$/i.test(exportId)) {
      return res.status(400).json({ error: 'Invalid export ID.' });
    }

    const exportPath = path.join(EXPORTS_DIR, `${exportId}.zip`);

    if (!fs.existsSync(exportPath)) {
      return res.status(404).json({ error: 'Export not found or has expired.' });
    }

    // Serve the ZIP file as a download.
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="dream-e-export.zip"`);

    const stream = fs.createReadStream(exportPath);
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error(`[EXPORTS] Error streaming export ${exportId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading export file.' });
      }
    });
  } catch (err) {
    console.error('[EXPORTS] Download error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}

// ---------------------------------------------------------------------------
// Express App Factory
// ---------------------------------------------------------------------------

/**
 * Creates and returns the configured Express application.
 *
 * The app is designed to be mounted as middleware at a sub-path (e.g., /api/v2)
 * in the Vite dev server. It does NOT call app.listen() — the Vite server
 * handles the actual HTTP listening.
 *
 * @returns {import('express').Express} The configured Express app.
 */
function createServerApp() {
  const app = express();

  // --- Global Middleware ---

  // Parse JSON bodies up to 100MB (projects with inline base64 can be large).
  app.use(express.json({ limit: '100mb' }));

  // Parse raw binary bodies (for asset uploads).
  app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' }));

  // Parse URL-encoded bodies (for form submissions).
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Parse cookies (for potential future cookie-based auth or CSRF tokens).
  app.use(cookieParser());

  // --- Request Logging ---
  // Log all API requests for debugging (method, path, status, duration).
  app.use((req, res, next) => {
    const start = Date.now();
    const originalEnd = res.end;

    res.end = function (...args) {
      const duration = Date.now() - start;
      console.log(`[API] ${req.method} ${req.originalUrl || req.url} → ${res.statusCode} (${duration}ms)`);
      originalEnd.apply(this, args);
    };

    next();
  });

  // --- Routes ---

  // Auth routes are public (login, register don't require a token).
  app.use('/auth', authRoutes);

  // Project and asset routes require authentication.
  app.use('/projects', requireAuth, projectRoutes);
  app.use('/assets', requireAuth, assetRoutes);

  // Export download endpoint: public (URL contains unguessable UUID).
  app.get('/exports/:uuid', exportDownloadHandler);

  // --- Health Check ---
  app.get('/health', async (req, res) => {
    try {
      const db = await getDb();
      // Quick DB check: count users.
      const result = db.exec('SELECT COUNT(*) FROM users');
      const userCount = (result.length > 0 && result[0].values.length > 0)
        ? result[0].values[0][0]
        : 0;

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        userCount,
      });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // --- 404 Handler ---
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      message: `No route matches ${req.method} ${req.url}`,
    });
  });

  // --- Error Handler ---
  // Express error handler must have exactly 4 params to be recognized as such.
  app.use((err, req, res, _next) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
    });
  });

  // --- Start Cleanup Job ---
  // Run immediately on startup, then every 5 minutes.
  // Use setTimeout for the initial run to avoid blocking server startup.
  setTimeout(() => {
    runCleanup();
  }, 10000); // 10 seconds after startup

  const cleanupHandle = setInterval(runCleanup, CLEANUP_INTERVAL_MS);

  // Ensure cleanup interval is cleared if the process exits (prevents dangling handles).
  // This also prevents the interval from keeping the process alive during shutdown.
  if (cleanupHandle.unref) {
    cleanupHandle.unref();
  }

  console.log('[SERVER] Dream-E server app created successfully');
  console.log('[SERVER] Routes: /auth/*, /projects/*, /assets/*, /exports/*');
  console.log(`[SERVER] Cleanup job scheduled every ${CLEANUP_INTERVAL_MS / 1000}s`);

  return app;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { createServerApp };
