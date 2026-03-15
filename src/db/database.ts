/**
 * =============================================================================
 * DATABASE CONFIGURATION - DEXIE.JS (INDEXEDDB)
 * =============================================================================
 *
 * This file sets up the local database using Dexie.js.
 *
 * WHAT IS INDEXEDDB?
 * IndexedDB is a database built into every modern web browser.
 * It allows web applications to store large amounts of data locally,
 * including files (images, audio) as binary blobs.
 *
 * Unlike localStorage:
 * - No 5MB limit (can store gigabytes)
 * - Can store complex objects and files
 * - Supports transactions (safe concurrent access)
 * - Indexed for fast queries
 *
 * WHAT IS DEXIE.JS?
 * Dexie.js is a wrapper library that makes IndexedDB easier to use.
 * It provides:
 * - Promise-based API (async/await)
 * - TypeScript support
 * - Easy schema definition
 * - Powerful query syntax
 *
 * DATABASE TABLES:
 * 1. projects - Stores project data (nodes, edges, variables)
 * 2. assets - Stores media files (images, audio) as blobs
 * 3. saves - Stores game save files
 *
 * =============================================================================
 */

import Dexie, { type Table } from 'dexie';
import type { Project } from '@/types';

/**
 * PROJECT RECORD INTERFACE
 * Structure of a project record in the database.
 *
 * WHY SEPARATE FROM Project TYPE?
 * The database record includes additional metadata
 * and stores the project data serialized.
 */
export interface ProjectRecord {
  /** Project ID (primary key) */
  id: string;

  /** Full project data */
  data: Project;

  /** Last modified timestamp (for sorting) */
  updatedAt: number;
}

/**
 * ASSET RECORD INTERFACE
 * Structure of an asset record in the database.
 *
 * Assets are media files (images, audio) stored as blobs.
 * They are associated with a specific project.
 */
export interface AssetRecord {
  /** Asset ID (primary key) */
  id: string;

  /** ID of the project this asset belongs to */
  projectId: string;

  /** Type of asset */
  type: 'image' | 'audio';

  /** Original filename */
  name: string;

  /** MIME type (e.g., 'image/png', 'audio/mp3') */
  mimeType: string;

  /** The actual file data */
  blob: Blob;

  /** File size in bytes */
  size: number;

  /** When the asset was uploaded */
  createdAt: number;
}

/**
 * SAVE RECORD INTERFACE
 * Structure of a save game record in the database.
 */
export interface SaveRecord {
  /** Unique ID for this save */
  id: string;

  /** ID of the project this save belongs to */
  projectId: string;

  /** Slot number (0 = auto-save, 1+ = manual) */
  slot: number;

  /** The game state at time of save */
  state: Record<string, unknown>;

  /** Screenshot thumbnail (blob) */
  screenshot?: Blob;

  /** When the save was created */
  savedAt: number;

  /** User-provided save name */
  name?: string;
}

/**
 * DREAM-E DATABASE CLASS
 * Extends Dexie to define our database schema.
 *
 * HOW DEXIE WORKS:
 * 1. Define tables as class properties with Table<Type>
 * 2. In constructor, call this.version().stores()
 * 3. The stores object defines indexes for each table
 *
 * INDEX SYNTAX:
 * - 'id' - Primary key
 * - 'projectId' - Simple index
 * - '[projectId+slot]' - Compound index
 * - '++id' - Auto-incrementing primary key
 */
export class StoryWeaverDatabase extends Dexie {
  /**
   * Projects table - stores all project data
   */
  projects!: Table<ProjectRecord, string>;

  /**
   * Assets table - stores media files
   */
  assets!: Table<AssetRecord, string>;

  /**
   * Saves table - stores game save files
   */
  saves!: Table<SaveRecord, string>;

  /**
   * Constructor - sets up the database schema
   */
  constructor() {
    // Call parent constructor with database name
    super('StoryWeaverDB');

    /**
     * DATABASE VERSIONING
     * Dexie uses versions to handle schema changes.
     *
     * When you change the schema:
     * 1. Create a new version (e.g., version(2))
     * 2. Define the new schema
     * 3. Optionally add upgrade logic
     *
     * Dexie automatically migrates existing data.
     */
    this.version(1).stores({
      /**
       * PROJECTS TABLE SCHEMA
       * - 'id' is the primary key
       * - 'updatedAt' index allows sorting by recent
       */
      projects: 'id, updatedAt',

      /**
       * ASSETS TABLE SCHEMA
       * - 'id' is the primary key
       * - 'projectId' index for finding assets by project
       * - 'type' index for filtering by asset type
       */
      assets: 'id, projectId, type',

      /**
       * SAVES TABLE SCHEMA
       * - 'id' is the primary key
       * - '[projectId+slot]' compound index for unique project+slot
       */
      saves: 'id, [projectId+slot]',
    });

    // Log database creation in development
    if (import.meta.env.DEV) {
      console.log('[Database] StoryWeaverDB initialized');
    }
  }
}

/**
 * DATABASE SINGLETON INSTANCE
 * We export a single instance of the database.
 * All parts of the app use this same instance.
 */
export const db = new StoryWeaverDatabase();

/**
 * INITIALIZE DATABASE
 * Opens the database connection and performs any setup.
 *
 * This is called at app startup to ensure the database
 * is ready before the app tries to use it.
 *
 * @returns Promise that resolves when database is ready
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Open the database connection
    // Dexie creates tables if they don't exist
    await db.open();

    // Log success
    if (import.meta.env.DEV) {
      console.log('[Database] Connection opened successfully');

      // Log table counts for debugging
      const projectCount = await db.projects.count();
      const assetCount = await db.assets.count();
      const saveCount = await db.saves.count();

      console.log('[Database] Records:', {
        projects: projectCount,
        assets: assetCount,
        saves: saveCount,
      });
    }
  } catch (error) {
    // Handle database errors
    console.error('[Database] Failed to initialize:', error);

    // Check for common issues
    if (error instanceof Dexie.QuotaExceededError) {
      throw new Error(
        'Storage quota exceeded. Please free up disk space or clear browser data.'
      );
    }

    if (error instanceof Dexie.DatabaseClosedError) {
      throw new Error(
        'Database was closed unexpectedly. Please refresh the page.'
      );
    }

    // Re-throw for general handling
    throw error;
  }
}

/**
 * CLEAR ALL DATA
 * Deletes all data from the database.
 *
 * USE WITH CAUTION - this is destructive!
 * Typically used for:
 * - Development reset
 * - User-initiated "clear all data"
 * - Recovering from corrupt data
 *
 * @returns Promise that resolves when data is cleared
 */
export async function clearAllData(): Promise<void> {
  if (import.meta.env.DEV) {
    console.log('[Database] Clearing all data...');
  }

  await db.transaction('rw', [db.projects, db.assets, db.saves], async () => {
    await db.projects.clear();
    await db.assets.clear();
    await db.saves.clear();
  });

  if (import.meta.env.DEV) {
    console.log('[Database] All data cleared');
  }
}

/**
 * GET DATABASE SIZE
 * Estimates the total size of data in the database.
 *
 * NOTE: This is an estimate. Actual storage usage may vary
 * due to IndexedDB overhead.
 *
 * @returns Object with size information
 */
export async function getDatabaseSize(): Promise<{
  projects: { count: number; sizeEstimate: number };
  assets: { count: number; sizeEstimate: number };
  saves: { count: number; sizeEstimate: number };
  total: number;
}> {
  // Count records
  const projectCount = await db.projects.count();
  const assetCount = await db.assets.count();
  const saveCount = await db.saves.count();

  // Estimate sizes (rough estimates based on typical data)
  let assetSize = 0;
  await db.assets.each((asset) => {
    assetSize += asset.size || 0;
  });

  // Estimate project and save sizes (rough)
  const projectSize = projectCount * 50000; // ~50KB per project average
  const saveSize = saveCount * 10000; // ~10KB per save average

  return {
    projects: { count: projectCount, sizeEstimate: projectSize },
    assets: { count: assetCount, sizeEstimate: assetSize },
    saves: { count: saveCount, sizeEstimate: saveSize },
    total: projectSize + assetSize + saveSize,
  };
}

/**
 * FORMAT BYTES HELPER
 * Converts bytes to human-readable format.
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "2.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
