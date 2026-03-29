/**
 * =============================================================================
 * JWT UTILITY MODULE
 * =============================================================================
 *
 * Handles JSON Web Token creation and verification for Dream-E authentication.
 *
 * Token strategy:
 *   - Access tokens: Short-lived (15 min), used for authenticating API requests.
 *     Contains the user ID in the payload. Sent as Bearer token in Authorization header.
 *   - Refresh tokens: Long-lived opaque strings (UUIDs) stored in the sessions table.
 *     Used to obtain new access tokens without re-entering credentials.
 *
 * JWT secret management:
 *   - Reads JWT_SECRET from environment variable first.
 *   - Falls back to a file-persisted random secret at server-data/.jwt-secret.
 *   - The file-based approach means the secret survives server restarts (so existing
 *     tokens remain valid) without requiring the user to set env vars in development.
 *
 * =============================================================================
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// JWT Secret Resolution
// ---------------------------------------------------------------------------

/** Path where the auto-generated JWT secret is persisted between restarts. */
const SECRET_FILE = path.resolve(__dirname, '..', '..', 'server-data', '.jwt-secret');

/**
 * Lazily resolved JWT signing secret.
 * Priority: JWT_SECRET env var > file on disk > generate new and save to disk.
 * Cached after first resolution so file I/O only happens once.
 */
let cachedSecret = null;

/**
 * Gets the JWT signing secret, initializing it if necessary.
 *
 * @returns {string} The JWT secret string.
 */
function getSecret() {
  if (cachedSecret) return cachedSecret;

  // 1. Check environment variable (highest priority — for production deployments).
  if (process.env.JWT_SECRET) {
    cachedSecret = process.env.JWT_SECRET;
    console.log('[JWT] Using JWT_SECRET from environment variable');
    return cachedSecret;
  }

  // 2. Check for persisted secret file (survives dev server restarts).
  if (fs.existsSync(SECRET_FILE)) {
    cachedSecret = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
    console.log('[JWT] Loaded JWT secret from file');
    return cachedSecret;
  }

  // 3. Generate a new random secret and persist it.
  // 64 bytes of random data encoded as hex gives us a 128-character string,
  // which is more than sufficient entropy for HMAC-SHA256 signing.
  cachedSecret = crypto.randomBytes(64).toString('hex');

  // Ensure the directory exists before writing.
  const dir = path.dirname(SECRET_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SECRET_FILE, cachedSecret, 'utf-8');
  console.log('[JWT] Generated and saved new JWT secret to file');

  return cachedSecret;
}

// ---------------------------------------------------------------------------
// Token Generation
// ---------------------------------------------------------------------------

/** Access token lifetime: 24 hours. Extended for creative sessions that
 *  can last hours (OW play, co-writing). Refresh cookie handles renewal. */
const ACCESS_TOKEN_EXPIRY = '24h';

/**
 * Generates a signed JWT access token for the given user.
 *
 * The token payload contains only the userId — all other user data should
 * be fetched from the database on each request to stay current.
 *
 * @param {string} userId - The user's unique ID (UUID).
 * @returns {string} A signed JWT string.
 */
function generateAccessToken(userId) {
  return jwt.sign(
    { userId },
    getSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generates an opaque refresh token (UUID v4).
 *
 * Refresh tokens are not JWTs — they're random strings stored in the sessions
 * table. This keeps them revocable (delete the session row to invalidate)
 * and avoids encoding sensitive data in a long-lived token.
 *
 * @returns {string} A UUID v4 string to use as the refresh token.
 */
function generateRefreshToken() {
  return uuidv4();
}

// ---------------------------------------------------------------------------
// Token Verification
// ---------------------------------------------------------------------------

/**
 * Verifies and decodes a JWT access token.
 *
 * @param {string} token - The JWT string from the Authorization header.
 * @returns {{ userId: string }} The decoded payload.
 * @throws {jwt.JsonWebTokenError} If the token is invalid or expired.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, getSecret());
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
};
