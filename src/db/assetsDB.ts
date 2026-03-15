/**
 * =============================================================================
 * ASSETS DATABASE OPERATIONS
 * =============================================================================
 *
 * This file contains all database operations for media assets.
 *
 * WHAT ARE ASSETS?
 * Assets are media files used in the game:
 * - Background images for scenes
 * - Character portraits
 * - Item icons
 * - Background music
 * - Sound effects
 * - Voice over audio
 *
 * HOW ASSETS ARE STORED:
 * Assets are stored as "blobs" (Binary Large Objects) in IndexedDB.
 * A blob is raw binary data - the actual file contents.
 *
 * WHY STORE ASSETS LOCALLY?
 * - Works offline (no server needed)
 * - No upload/download time during editing
 * - Complete data privacy
 * - Games can be exported as self-contained packages
 *
 * =============================================================================
 */

import { db, type AssetRecord } from './database';
import { generateId } from '@/utils/idGenerator';

/**
 * DEBUG LOGGER FOR ASSET OPERATIONS
 *
 * @param operation - Name of the operation
 * @param data - Optional data to log
 */
function logAssets(operation: string, data?: unknown): void {
  if (import.meta.env.DEV) {
    console.log(`[AssetsDB] ${operation}`, data ?? '');
  }
}

/**
 * ASSET SUMMARY INTERFACE
 * Lightweight asset info without the blob data.
 */
export interface AssetSummary {
  id: string;
  projectId: string;
  type: 'image' | 'audio';
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
}

/**
 * UPLOAD ASSET
 * Stores a new asset file in the database.
 *
 * This function:
 * 1. Validates the file
 * 2. Generates a unique ID
 * 3. Stores the file as a blob
 * 4. Returns a URL that can be used to display/play the asset
 *
 * @param projectId - ID of the project this asset belongs to
 * @param file - The file to upload
 * @param type - Type of asset ('image' or 'audio')
 * @returns Object containing asset ID and blob URL
 * @throws Error if upload fails
 */
export async function uploadAsset(
  projectId: string,
  file: File,
  type: 'image' | 'audio'
): Promise<{ id: string; url: string }> {
  logAssets('Uploading asset', { projectId, name: file.name, type, size: file.size });

  try {
    // Validate file type
    if (type === 'image' && !file.type.startsWith('image/')) {
      throw new Error(`Invalid image type: ${file.type}`);
    }
    if (type === 'audio' && !file.type.startsWith('audio/')) {
      throw new Error(`Invalid audio type: ${file.type}`);
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size is 50MB.`);
    }

    // Generate unique ID
    const assetId = generateId('asset');

    // Create asset record
    const record: AssetRecord = {
      id: assetId,
      projectId,
      type,
      name: file.name,
      mimeType: file.type,
      blob: file, // File extends Blob, so we can store it directly
      size: file.size,
      createdAt: Date.now(),
    };

    // Save to database
    await db.assets.add(record);

    // Create a blob URL for immediate use
    // This URL can be used as src for images or audio elements
    const url = URL.createObjectURL(file);

    logAssets('Asset uploaded', { id: assetId, name: file.name });

    return { id: assetId, url };
  } catch (error) {
    console.error('[AssetsDB] Failed to upload asset:', error);
    throw new Error(`Failed to upload asset: ${getErrorMessage(error)}`);
  }
}

/**
 * GET ASSET
 * Retrieves an asset from the database.
 *
 * @param id - Asset ID
 * @returns The asset record, or null if not found
 */
export async function getAsset(id: string): Promise<AssetRecord | null> {
  logAssets('Getting asset', id);

  try {
    const record = await db.assets.get(id);

    if (!record) {
      logAssets('Asset not found', id);
      return null;
    }

    return record;
  } catch (error) {
    console.error('[AssetsDB] Failed to get asset:', error);
    throw new Error(`Failed to load asset: ${getErrorMessage(error)}`);
  }
}

/**
 * GET ASSET URL
 * Gets a blob URL for an asset.
 *
 * WHAT IS A BLOB URL?
 * A blob URL looks like: blob:http://localhost:5173/abc-123
 * It's a temporary URL that points to data in memory.
 * It can be used as src for <img> or <audio> elements.
 *
 * IMPORTANT: Blob URLs should be revoked when no longer needed
 * to prevent memory leaks. See revokeAssetUrl().
 *
 * @param id - Asset ID
 * @returns Blob URL, or null if asset not found
 */
export async function getAssetUrl(id: string): Promise<string | null> {
  logAssets('Getting asset URL', id);

  try {
    const record = await db.assets.get(id);

    if (!record) {
      return null;
    }

    // Create and return blob URL
    const url = URL.createObjectURL(record.blob);
    return url;
  } catch (error) {
    console.error('[AssetsDB] Failed to get asset URL:', error);
    return null;
  }
}

/**
 * REVOKE ASSET URL
 * Releases a blob URL to free memory.
 *
 * Call this when an asset is no longer being displayed.
 * For example, when navigating away from a scene.
 *
 * @param url - The blob URL to revoke
 */
export function revokeAssetUrl(url: string): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
    logAssets('Revoked asset URL', url);
  }
}

/**
 * DELETE ASSET
 * Removes an asset from the database.
 *
 * @param id - Asset ID to delete
 * @throws Error if deletion fails
 */
export async function deleteAsset(id: string): Promise<void> {
  logAssets('Deleting asset', id);

  try {
    await db.assets.delete(id);
    logAssets('Asset deleted', id);
  } catch (error) {
    console.error('[AssetsDB] Failed to delete asset:', error);
    throw new Error(`Failed to delete asset: ${getErrorMessage(error)}`);
  }
}

/**
 * GET ASSETS FOR PROJECT
 * Retrieves summary information for all assets in a project.
 *
 * Returns summaries (without blob data) for efficiency.
 *
 * @param projectId - Project ID
 * @param type - Optional filter by asset type
 * @returns Array of asset summaries
 */
export async function getProjectAssets(
  projectId: string,
  type?: 'image' | 'audio'
): Promise<AssetSummary[]> {
  logAssets('Getting project assets', { projectId, type });

  try {
    let query = db.assets.where('projectId').equals(projectId);

    const records = await query.toArray();

    // Filter by type if specified
    const filtered = type
      ? records.filter((r) => r.type === type)
      : records;

    // Map to summaries (exclude blob data)
    const summaries: AssetSummary[] = filtered.map((record) => ({
      id: record.id,
      projectId: record.projectId,
      type: record.type,
      name: record.name,
      mimeType: record.mimeType,
      size: record.size,
      createdAt: record.createdAt,
    }));

    // Sort by creation date (newest first)
    summaries.sort((a, b) => b.createdAt - a.createdAt);

    logAssets('Got project assets', { count: summaries.length });

    return summaries;
  } catch (error) {
    console.error('[AssetsDB] Failed to get project assets:', error);
    throw new Error(`Failed to load assets: ${getErrorMessage(error)}`);
  }
}

/**
 * DELETE PROJECT ASSETS
 * Deletes all assets for a project.
 *
 * This is called when deleting a project.
 *
 * @param projectId - Project ID
 */
export async function deleteProjectAssets(projectId: string): Promise<void> {
  logAssets('Deleting project assets', projectId);

  try {
    const count = await db.assets
      .where('projectId')
      .equals(projectId)
      .delete();

    logAssets('Deleted project assets', { projectId, count });
  } catch (error) {
    console.error('[AssetsDB] Failed to delete project assets:', error);
    throw new Error(`Failed to delete assets: ${getErrorMessage(error)}`);
  }
}

/**
 * GET ASSET AS DATA URL
 * Converts an asset to a data URL (base64 encoded).
 *
 * WHAT IS A DATA URL?
 * A data URL looks like: data:image/png;base64,iVBORw0KGgo...
 * It embeds the file data directly in the URL string.
 *
 * WHEN TO USE:
 * - Exporting projects (data URLs can be saved in JSON)
 * - Creating thumbnails
 * - Situations where blob URLs don't work
 *
 * NOTE: Data URLs are larger than blob URLs and use more memory.
 * Prefer blob URLs for display; use data URLs only for export.
 *
 * @param id - Asset ID
 * @returns Data URL string, or null if not found
 */
export async function getAssetAsDataUrl(id: string): Promise<string | null> {
  logAssets('Getting asset as data URL', id);

  try {
    const record = await db.assets.get(id);

    if (!record) {
      return null;
    }

    // Convert blob to data URL using FileReader
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        reject(new Error('Failed to read asset data'));
      };

      reader.readAsDataURL(record.blob);
    });
  } catch (error) {
    console.error('[AssetsDB] Failed to convert asset to data URL:', error);
    return null;
  }
}

/**
 * IMPORT ASSET FROM DATA URL
 * Creates an asset from a data URL.
 *
 * Used when importing projects that contain embedded assets.
 *
 * @param projectId - Project ID
 * @param dataUrl - Data URL string
 * @param name - Filename for the asset
 * @returns Asset ID and blob URL
 */
export async function importAssetFromDataUrl(
  projectId: string,
  dataUrl: string,
  name: string
): Promise<{ id: string; url: string }> {
  logAssets('Importing asset from data URL', { projectId, name });

  try {
    // Parse data URL
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!matches) {
      throw new Error('Invalid data URL format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // Convert base64 to blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    // Determine type from MIME type
    const type: 'image' | 'audio' = mimeType.startsWith('audio/')
      ? 'audio'
      : 'image';

    // Create asset record
    const assetId = generateId('asset');

    const record: AssetRecord = {
      id: assetId,
      projectId,
      type,
      name,
      mimeType,
      blob,
      size: blob.size,
      createdAt: Date.now(),
    };

    // Save to database
    await db.assets.add(record);

    // Create blob URL
    const url = URL.createObjectURL(blob);

    logAssets('Asset imported', { id: assetId, name });

    return { id: assetId, url };
  } catch (error) {
    console.error('[AssetsDB] Failed to import asset:', error);
    throw new Error(`Failed to import asset: ${getErrorMessage(error)}`);
  }
}

/**
 * GET ERROR MESSAGE HELPER
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
