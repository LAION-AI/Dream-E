/**
 * =============================================================================
 * AUTHENTICATION MIDDLEWARE
 * =============================================================================
 *
 * Express middleware that protects routes by requiring a valid JWT access token.
 *
 * How it works:
 *   1. Reads the Authorization header (expects "Bearer {token}" format).
 *   2. Verifies the JWT signature and expiration using the shared secret.
 *   3. Extracts the userId from the token payload and attaches it to req.userId.
 *   4. If the token is missing, malformed, expired, or invalid, responds with 401.
 *
 * Usage:
 *   const { requireAuth } = require('./auth/middleware');
 *   app.use('/projects', requireAuth, projectRoutes);
 *   // or per-route:
 *   router.get('/me', requireAuth, (req, res) => { ... });
 *
 * Why Bearer tokens instead of cookies?
 *   - The client is a SPA (React) that makes fetch() calls to the API.
 *   - Bearer tokens work cleanly with CORS and don't have SameSite complexity.
 *   - The access token is short-lived (15 min), limiting exposure if intercepted.
 *   - Refresh tokens are stored securely by the client and exchanged for new
 *     access tokens when needed.
 *
 * =============================================================================
 */

const { verifyAccessToken } = require('../utils/jwt.cjs');

/**
 * Express middleware: requires a valid JWT access token.
 *
 * On success: sets req.userId (string) and calls next().
 * On failure: responds with 401 JSON error and does NOT call next().
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAuth(req, res, next) {
  try {
    // Extract the Authorization header value.
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No Authorization header provided. Include "Authorization: Bearer {token}" in your request.',
      });
    }

    // Parse "Bearer {token}" format.
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Invalid authorization format',
        message: 'Authorization header must use "Bearer {token}" format.',
      });
    }

    const token = parts[1];

    // Verify the JWT. This checks both the signature (authenticity) and
    // the exp claim (not expired). Throws on any failure.
    const payload = verifyAccessToken(token);

    // Attach the userId to the request object for downstream handlers.
    // TypeScript note: in .js files we just set it dynamically.
    req.userId = payload.userId;

    next();
  } catch (err) {
    // jwt.verify() throws different error types:
    // - TokenExpiredError: token's exp claim is in the past
    // - JsonWebTokenError: invalid signature, malformed token, etc.
    // - NotBeforeError: token's nbf claim is in the future
    const isExpired = err.name === 'TokenExpiredError';

    console.log(`[AUTH] Token verification failed: ${err.name} — ${err.message}`);

    return res.status(401).json({
      error: isExpired ? 'Token expired' : 'Invalid token',
      message: isExpired
        ? 'Your access token has expired. Please refresh your token.'
        : 'The provided token is invalid. Please log in again.',
    });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { requireAuth };
