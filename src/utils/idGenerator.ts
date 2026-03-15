/**
 * =============================================================================
 * ID GENERATOR UTILITY
 * =============================================================================
 *
 * This file provides functions for generating unique identifiers.
 *
 * WHY DO WE NEED UNIQUE IDs?
 * In Dream-E, everything needs a unique identifier:
 * - Projects need IDs to be saved and loaded
 * - Nodes need IDs to be connected by edges
 * - Assets need IDs to be referenced by nodes
 * - Saves need IDs for retrieval
 *
 * WHAT MAKES A GOOD ID?
 * - Globally unique (won't collide with other IDs)
 * - URL-safe (no special characters that break URLs)
 * - Human-readable prefix (easy to identify type)
 * - Random enough to prevent guessing
 *
 * =============================================================================
 */

/**
 * ID PREFIX TYPE
 * Valid prefixes for different entity types.
 *
 * Using prefixes helps with:
 * - Debugging (you can tell what type of ID it is)
 * - Validation (easy to check if ID is for the right type)
 */
export type IdPrefix =
  | 'project'  // Project IDs
  | 'node'     // Node IDs (scenes, choices, modifiers, comments)
  | 'edge'     // Connection/edge IDs
  | 'var'      // Variable IDs
  | 'choice'   // Scene choice IDs
  | 'asset'    // Asset IDs (images, audio)
  | 'save'     // Save slot IDs
  | 'entity'   // World entity IDs (characters, locations, objects, concepts)
  | 'chat';    // Chat message IDs

/**
 * GENERATE ID FUNCTION
 * Creates a unique identifier with a prefix.
 *
 * FORMAT: {prefix}_{random}
 * EXAMPLE: node_a1b2c3d4e5f6
 *
 * TECHNICAL DETAILS:
 * Uses crypto.randomUUID() if available (modern browsers),
 * falls back to a custom implementation for older browsers.
 *
 * @param prefix - The type prefix for the ID
 * @returns A unique identifier string
 *
 * @example
 * generateId('node')    // 'node_a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 * generateId('project') // 'project_a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 */
export function generateId(prefix: IdPrefix): string {
  // Generate the random part
  const randomPart = generateUUID();

  // Combine prefix with random part
  // Use underscore as separator (URL-safe)
  return `${prefix}_${randomPart}`;
}

/**
 * GENERATE UUID FUNCTION
 * Creates a UUID v4 (random) string.
 *
 * UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * - x is a random hex digit
 * - 4 indicates UUID version 4
 * - y is 8, 9, a, or b (variant indicator)
 *
 * @returns A UUID v4 string
 */
function generateUUID(): string {
  // Use crypto.randomUUID() if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  // This implementation follows UUID v4 spec
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    // Generate random number 0-15
    const random = (Math.random() * 16) | 0;

    // For 'x', use random number
    // For 'y', use random number with constraints (8, 9, a, or b)
    const value = char === 'x' ? random : (random & 0x3) | 0x8;

    // Convert to hex digit
    return value.toString(16);
  });
}

/**
 * GENERATE SHORT ID FUNCTION
 * Creates a shorter random identifier (8 characters).
 *
 * Use this when:
 * - Full UUID is too long (e.g., temporary IDs)
 * - Human readability is important
 * - Uniqueness within a small set is sufficient
 *
 * NOTE: Less unique than full UUID - use generateId() for
 * persistent storage.
 *
 * @returns An 8-character random string
 *
 * @example
 * generateShortId() // 'a1b2c3d4'
 */
export function generateShortId(): string {
  // Characters to use (URL-safe)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

  let result = '';

  // Generate 8 random characters
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  return result;
}

/**
 * VALIDATE ID FUNCTION
 * Checks if an ID has the correct format.
 *
 * @param id - The ID to validate
 * @param expectedPrefix - Optional expected prefix to check
 * @returns true if the ID is valid
 *
 * @example
 * validateId('node_abc123')           // true
 * validateId('node_abc123', 'node')   // true
 * validateId('node_abc123', 'edge')   // false (wrong prefix)
 * validateId('invalid')               // false (no underscore)
 */
export function validateId(id: string, expectedPrefix?: IdPrefix): boolean {
  // Check for null/undefined
  if (!id || typeof id !== 'string') {
    return false;
  }

  // Check minimum length
  if (id.length < 3) {
    return false;
  }

  // Check format: prefix_randompart
  const underscoreIndex = id.indexOf('_');
  if (underscoreIndex === -1) {
    return false;
  }

  // Extract prefix
  const prefix = id.substring(0, underscoreIndex);

  // Check if prefix is valid
  const validPrefixes: IdPrefix[] = [
    'project',
    'node',
    'edge',
    'var',
    'choice',
    'asset',
    'save',
    'entity',
    'chat',
  ];

  if (!validPrefixes.includes(prefix as IdPrefix)) {
    return false;
  }

  // If expected prefix specified, check it matches
  if (expectedPrefix && prefix !== expectedPrefix) {
    return false;
  }

  // Check that there's content after the prefix
  const randomPart = id.substring(underscoreIndex + 1);
  if (randomPart.length === 0) {
    return false;
  }

  return true;
}

/**
 * EXTRACT PREFIX FUNCTION
 * Gets the prefix from an ID.
 *
 * @param id - The ID to extract prefix from
 * @returns The prefix, or null if invalid
 *
 * @example
 * extractPrefix('node_abc123')    // 'node'
 * extractPrefix('project_xyz789') // 'project'
 * extractPrefix('invalid')        // null
 */
export function extractPrefix(id: string): IdPrefix | null {
  if (!id || typeof id !== 'string') {
    return null;
  }

  const underscoreIndex = id.indexOf('_');
  if (underscoreIndex === -1) {
    return null;
  }

  const prefix = id.substring(0, underscoreIndex) as IdPrefix;

  const validPrefixes: IdPrefix[] = [
    'project',
    'node',
    'edge',
    'var',
    'choice',
    'asset',
    'save',
    'entity',
    'chat',
  ];

  if (!validPrefixes.includes(prefix)) {
    return null;
  }

  return prefix;
}

/**
 * GENERATE TIMESTAMP ID FUNCTION
 * Creates an ID that includes a timestamp prefix.
 *
 * FORMAT: {timestamp}_{random}
 * EXAMPLE: 1699999999999_abc123
 *
 * Useful for:
 * - Sorting by creation time
 * - Debugging (can see when something was created)
 *
 * @returns A timestamp-prefixed ID
 */
export function generateTimestampId(): string {
  const timestamp = Date.now();
  const random = generateShortId();
  return `${timestamp}_${random}`;
}
