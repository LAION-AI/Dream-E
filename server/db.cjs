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

  // Flush the (possibly new) schema to disk immediately.
  saveDbImmediate();

  return db;
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
