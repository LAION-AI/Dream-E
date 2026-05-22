/**
 * =============================================================================
 * ADMIN MIDDLEWARE — Admin-Only Route Protection
 * =============================================================================
 *
 * Express middleware that restricts access to admin-only routes.
 *
 * How it works:
 *   1. Assumes requireAuth has already run (req.userId is set).
 *   2. Queries the user_limits table for the user's is_admin flag.
 *   3. If is_admin = 1, calls next() to allow access.
 *   4. If is_admin = 0 or no row exists, responds with 403 Forbidden.
 *
 * Usage:
 *   const { requireAdmin } = require('./admin/middleware.cjs');
 *   app.use('/admin', requireAuth, requireAdmin, adminRoutes);
 *   // or per-route:
 *   router.get('/users', requireAdmin, (req, res) => { ... });
 *
 * Design decision: We check user_limits.is_admin rather than adding a column
 * to the users table. This avoids SQLite ALTER TABLE limitations and keeps
 * all admin-related configuration in one place.
 *
 * =============================================================================
 */

const { getDb } = require('../db.cjs');

/**
 * Express middleware: requires the authenticated user to be an admin.
 *
 * IMPORTANT: This middleware MUST be used after requireAuth. It depends on
 * req.userId being set by the auth middleware. If used without requireAuth,
 * req.userId will be undefined and the query will fail.
 *
 * On success: calls next() (user is an admin).
 * On failure: responds with 403 JSON error and does NOT call next().
 *
 * @param {import('express').Request} req - Express request (must have req.userId from requireAuth).
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express next function.
 */
async function requireAdmin(req, res, next) {
  try {
    const userId = req.userId;

    if (!userId) {
      // This should never happen if requireAuth ran first, but handle defensively.
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Admin check failed: no user ID found. Ensure requireAuth middleware runs first.',
      });
    }

    const db = await getDb();

    // Query the user_limits table for the admin flag.
    const result = db.exec(
      'SELECT is_admin, is_active FROM user_limits WHERE user_id = ?',
      [userId]
    );

    // No user_limits row means the user hasn't been set up yet (no admin access).
    if (result.length === 0 || result[0].values.length === 0) {
      console.log(`[ADMIN] Access denied for user ${userId}: no user_limits row found`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have admin access.',
      });
    }

    const [isAdmin, isActive] = result[0].values[0];

    // Check if the account is active first.
    if (!isActive) {
      console.log(`[ADMIN] Access denied for user ${userId}: account disabled`);
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your account has been disabled. Contact another admin for assistance.',
      });
    }

    // Check admin flag.
    if (!isAdmin) {
      console.log(`[ADMIN] Access denied for user ${userId}: not an admin`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have admin access.',
      });
    }

    // User is an active admin — proceed.
    next();

  } catch (err) {
    console.error('[ADMIN] Middleware error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify admin status.',
    });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { requireAdmin };
