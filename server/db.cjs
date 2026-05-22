/**
 * =============================================================================
 * DATABASE MODULE — sql.js (SQLite compiled to WASM)
 * =============================================================================
 *
 * Provides a persistent SQLite database for Dream-E server-side storage.
 *
 * sql.js runs SQLite entirely in-process via WASM, so there's no external
 * SQLite binary dependency. The database is loaded from a file on startup
 * and saved back to disk after every write operation (debounced to avoid
 * excessive I/O when multiple writes happen in quick succession).
 *
 * Key design decisions:
 *   - We use TEXT for all IDs (UUIDs) and INTEGER for timestamps (Unix ms).
 *   - Asset binary data lives on the filesystem, not in SQLite, to keep the
 *     DB file small and avoid bloating memory when sql.js loads it.
 *   - A debounced saveDb() function writes the DB to disk at most once per
 *     second, preventing I/O storms during batch operations.
 *   - All table creation uses IF NOT EXISTS for safe restarts.
 *
 * Usage:
 *   const { getDb, saveDb } = require('./db');
 *   const db = await getDb();
 *   db.run("INSERT INTO users ...", [...]);
 *   saveDb(); // debounced write to disk
 *
 * =============================================================================
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory where all server-persisted data lives (DB, assets, exports). */
const DATA_DIR = path.resolve(__dirname, '..', 'server-data');

/** Path to the SQLite database file on disk. */
const DB_PATH = path.join(DATA_DIR, 'dream-e.db');

/** Assets are stored as binary files in this sub-directory. */
const ASSETS_DIR = path.join(DATA_DIR, 'assets');

/** Temporary export ZIP files are stored here before download. */
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** The initialized sql.js Database instance (singleton). */
let db = null;

/** Promise that resolves when initialization is complete. Prevents races. */
let initPromise = null;

/** Handle for the debounced save timer so we can cancel/reset it. */
let saveTimer = null;

/** How long to wait (ms) after the last write before flushing to disk. */
const SAVE_DEBOUNCE_MS = 1000;

// ---------------------------------------------------------------------------
// SQL Schema
// ---------------------------------------------------------------------------

/**
 * All CREATE TABLE statements for the Dream-E database.
 * These are idempotent (IF NOT EXISTS) so they can safely re-run on every startup.
 */
const SCHEMA_SQL = `
  -- Users table: stores credentials, display info, confirmation/reset tokens.
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    google_id TEXT UNIQUE,
    email_confirmed INTEGER NOT NULL DEFAULT 0,
    confirmation_token TEXT,
    reset_token TEXT,
    reset_token_expires INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Projects table: each row is a full project snapshot stored as JSON.
  -- The "data" column holds the serialized project state (scenes, entities, etc.).
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Assets table: metadata for binary files stored on disk.
  -- The actual bytes live at server-data/assets/{projectId}/{assetId}.bin.
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  -- Sessions table: tracks refresh tokens for JWT-based auth.
  -- Each row represents an active session; expired rows are cleaned up periodically.
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    refresh_token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Admin config table: centralized API keys, model settings, and other server-wide config.
  -- Secrets (API keys) are AES-256-GCM encrypted when is_secret = 1.
  -- Settings (provider names, models, styles) are stored in plain text.
  -- This eliminates the need for users to manage their own API keys.
  CREATE TABLE IF NOT EXISTS admin_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    is_secret INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  -- Usage log table: tracks every AI API call per user for quota enforcement and analytics.
  -- Each row represents a single API call (image generation, LLM chat, TTS synthesis).
  -- Cost estimates are optional and can be populated based on known provider pricing.
  CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    api_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    image_count INTEGER DEFAULT 0,
    audio_seconds REAL DEFAULT 0,
    cost_estimate REAL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Indexes for efficient usage queries: user+date for per-user daily totals,
  -- api_type+date for aggregate stats by service type.
  CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_log(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_usage_type ON usage_log(api_type, created_at);

  -- Per-user limits table: daily quotas, admin flag, active status.
  -- Each user gets a row here (created on first AI call or by admin).
  -- The is_admin flag controls access to the admin panel and admin API routes.
  -- is_active = 0 disables ALL API access for the user (admin can toggle).
  CREATE TABLE IF NOT EXISTS user_limits (
    user_id TEXT PRIMARY KEY,
    max_projects INTEGER DEFAULT 20,
    daily_llm_tokens INTEGER DEFAULT 500000,
    daily_images INTEGER DEFAULT 50,
    daily_tts_seconds REAL DEFAULT 600,
    is_admin INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    notes TEXT DEFAULT '',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Ensures that the required directory structure exists on disk.
 * Called once during initialization before the DB is loaded.
 */
function ensureDirectories() {
  for (const dir of [DATA_DIR, ASSETS_DIR, EXPORTS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[DB] Created directory: ${dir}`);
    }
  }
}

/**
 * Initializes the sql.js WASM engine, loads or creates the database,
 * and runs the schema migrations.
 *
 * This function is called lazily on first getDb() call and is memoized
 * via initPromise so concurrent callers don't race.
 *
 * @returns {Promise<import('sql.js').Database>} The initialized Database instance.
 */
async function initializeDb() {
  ensureDirectories();

  // Initialize the sql.js WASM engine. This downloads/loads the WASM binary
  // the first time; subsequent calls return the cached module.
  const SQL = await initSqlJs();

  // If a database file already exists on disk, load it into memory.
  // Otherwise, create a fresh in-memory database.
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`[DB] Loaded existing database from ${DB_PATH} (${fileBuffer.length} bytes)`);
  } else {
    db = new SQL.Database();
    console.log(`[DB] Created new database (will be saved to ${DB_PATH})`);
  }

  // Run all CREATE TABLE IF NOT EXISTS statements.
  // sql.js exec() can handle multiple statements separated by semicolons.
  db.run(SCHEMA_SQL);
  console.log('[DB] Schema initialized (all tables ensured)');

  // Run post-schema migrations (create user_limits rows, seed admin, etc.)
  runMigrations(db);

  // Flush the (possibly new) schema to disk immediately.
  saveDbImmediate();

  return db;
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * Post-schema migration logic. Runs every startup but is idempotent.
 *
 * 1. Creates user_limits rows for any existing users who don't have one.
 *    This handles the case where users were created before the user_limits
 *    table existed — they get default quotas automatically.
 *
 * 2. If DREAME_ADMIN_EMAIL env var is set, promotes that user to admin.
 *    This allows the server operator to designate an admin without needing
 *    a UI or manual DB editing. Safe to run repeatedly — if the user is
 *    already admin, the UPDATE is a no-op (same values).
 *
 * @param {import('sql.js').Database} database - The initialized database instance.
 */
function runMigrations(database) {
  const now = Date.now();
  let migrationCount = 0;

  // --- Migration 1: Ensure every user has a user_limits row ---
  // Find all users who do NOT have a corresponding user_limits entry.
  // This covers users created before the admin system was added.
  const usersWithoutLimits = database.exec(
    `SELECT u.id FROM users u
     LEFT JOIN user_limits ul ON u.id = ul.user_id
     WHERE ul.user_id IS NULL`
  );

  if (usersWithoutLimits.length > 0 && usersWithoutLimits[0].values.length > 0) {
    for (const row of usersWithoutLimits[0].values) {
      const userId = row[0];
      database.run(
        `INSERT INTO user_limits (user_id, max_projects, daily_llm_tokens, daily_images, daily_tts_seconds, is_admin, is_active, notes, updated_at)
         VALUES (?, 20, 500000, 50, 600, 0, 1, '', ?)`,
        [userId, now]
      );
      migrationCount++;
    }
    console.log(`[DB] Migration: Created user_limits rows for ${migrationCount} existing user(s)`);
  }

  // --- Migration 2: Auto-promote admin by email ---
  // If DREAME_ADMIN_EMAIL is set, find the user with that email and
  // ensure their user_limits.is_admin = 1. This allows bootstrapping
  // admin access without touching the database manually.
  const adminEmail = process.env.DREAME_ADMIN_EMAIL;
  if (adminEmail) {
    const adminUser = database.exec(
      'SELECT id FROM users WHERE email = ?',
      [adminEmail.toLowerCase()]
    );

    if (adminUser.length > 0 && adminUser[0].values.length > 0) {
      const adminUserId = adminUser[0].values[0][0];

      // Ensure user_limits row exists (might have just been created above,
      // but INSERT OR IGNORE handles the race).
      database.run(
        `INSERT OR IGNORE INTO user_limits (user_id, max_projects, daily_llm_tokens, daily_images, daily_tts_seconds, is_admin, is_active, notes, updated_at)
         VALUES (?, 20, 500000, 50, 600, 1, 1, 'Auto-promoted admin via DREAME_ADMIN_EMAIL', ?)`,
        [adminUserId, now]
      );

      // Update to admin if the row already existed.
      database.run(
        'UPDATE user_limits SET is_admin = 1, updated_at = ? WHERE user_id = ?',
        [now, adminUserId]
      );

      console.log(`[DB] Migration: Auto-promoted ${adminEmail} to admin (user ID: ${adminUserId})`);
    } else {
      console.log(`[DB] Migration: DREAME_ADMIN_EMAIL="${adminEmail}" set but no matching user found yet. Admin will be promoted on next restart after registration.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the initialized sql.js Database instance.
 *
 * The first call triggers async initialization (loading WASM + reading DB file).
 * Subsequent calls return the same instance immediately (after the first await).
 *
 * @returns {Promise<import('sql.js').Database>} The singleton Database.
 */
async function getDb() {
  if (!initPromise) {
    initPromise = initializeDb();
  }
  return initPromise;
}

/**
 * Immediately writes the current in-memory database to the file on disk.
 * Called internally after schema init and by the debounced saveDb().
 *
 * Uses sql.js's export() method which serializes the entire DB to a Uint8Array,
 * then writes that buffer to disk atomically (well, as atomic as writeFileSync gets).
 */
function saveDbImmediate() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Error saving database to disk:', err);
  }
}

/**
 * Debounced save: schedules a disk write 1 second after the last call.
 *
 * Every write operation (INSERT, UPDATE, DELETE) should call saveDb() to ensure
 * persistence. The debounce prevents disk thrashing when many writes happen in
 * quick succession (e.g., bulk asset inserts during project import).
 */
function saveDb() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveDbImmediate();
    saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getDb,
  saveDb,
  saveDbImmediate,
  DATA_DIR,
  ASSETS_DIR,
  EXPORTS_DIR,
};
