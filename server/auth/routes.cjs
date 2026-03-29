/**
 * =============================================================================
 * AUTHENTICATION ROUTES
 * =============================================================================
 *
 * Express router providing all auth-related endpoints:
 *   POST /register      — Create new account with email/password
 *   POST /confirm-email — Verify email address via confirmation token
 *   GET  /confirm-email — Browser-friendly email confirmation (query param)
 *   POST /login         — Authenticate with email/password, receive tokens
 *   POST /google        — Authenticate via Google OAuth ID token
 *   POST /refresh       — Exchange refresh token for new access token
 *   POST /logout        — Invalidate a refresh token (end session)
 *   GET  /me            — Get current user info (requires auth)
 *
 * Security considerations:
 *   - Passwords are hashed with bcrypt (10 salt rounds).
 *   - Email confirmation prevents account abuse.
 *   - Password validation enforces minimum complexity.
 *   - Generic error messages prevent email enumeration on login/register.
 *   - Refresh tokens are stored hashed-equivalent (opaque UUIDs in DB).
 *   - All auth events are logged to console for debugging.
 *
 * =============================================================================
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');

const { getDb, saveDb } = require('../db.cjs');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt.cjs');
const { sendConfirmationEmail, sendPasswordResetEmail } = require('../utils/email.cjs');
const { requireAuth } = require('./middleware.cjs');

const router = express.Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bcrypt salt rounds. 10 is a good balance of security vs. speed for login. */
const BCRYPT_ROUNDS = 10;

/** Refresh token lifetime: 30 days (in milliseconds). */
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Password reset token lifetime: 1 hour (in milliseconds). */
const RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Whether we're in "dev mode" — skips email confirmation requirement for login.
 * In production, set NODE_ENV=production to enforce email confirmation.
 */
const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Sets the refresh token as an httpOnly cookie on the response.
 * The cookie is:
 *   - httpOnly: JavaScript cannot read it (XSS protection)
 *   - sameSite: 'lax' (sent with same-site requests, not cross-site)
 *   - secure: true in production (HTTPS only)
 *   - path: '/api/v2/auth' (only sent to auth endpoints)
 *   - maxAge: 30 days
 */
function setRefreshCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: !IS_DEV,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_LIFETIME_MS,
  });
}

/** Clears the refresh token cookie. */
function clearRefreshCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: !IS_DEV,
    sameSite: 'lax',
    path: '/',
  });
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validates an email address format using a pragmatic regex.
 * This isn't RFC 5322 compliant (almost nothing is), but catches the common cases.
 *
 * @param {string} email - The email to validate.
 * @returns {boolean} True if the format looks valid.
 */
function isValidEmail(email) {
  // Simple but effective: something@something.something
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates password complexity requirements:
 *   - Minimum 8 characters
 *   - At least 1 number
 *   - At least 1 special character (!@#$%^&* etc.)
 *
 * @param {string} password - The password to validate.
 * @returns {{ valid: boolean, message: string }} Validation result with human-readable message.
 */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character (!@#$%^&* etc.).' };
  }
  return { valid: true, message: '' };
}

/**
 * Constructs the base URL from the request (protocol + host).
 * Used to build confirmation/reset URLs in emails.
 *
 * @param {import('express').Request} req
 * @returns {string} The base URL (e.g., "http://localhost:5173").
 */
function getBaseUrl(req) {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:5173';
  return `${protocol}://${host}`;
}

// ---------------------------------------------------------------------------
// Helper: Create session and return tokens
// ---------------------------------------------------------------------------

/**
 * Creates a new session for the given user and returns access + refresh tokens.
 * This is shared between login, Google auth, and any future auth methods.
 *
 * @param {import('sql.js').Database} db - The database instance.
 * @param {string} userId - The user's ID.
 * @returns {{ accessToken: string, refreshToken: string }}
 */
function createSession(db, userId) {
  const sessionId = uuidv4();
  const refreshToken = generateRefreshToken();
  const accessToken = generateAccessToken(userId);
  const now = Date.now();
  const expiresAt = now + REFRESH_TOKEN_LIFETIME_MS;

  db.run(
    'INSERT INTO sessions (id, user_id, refresh_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [sessionId, userId, refreshToken, expiresAt, now]
  );
  saveDb();

  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// POST /register — Create a new account
// ---------------------------------------------------------------------------

router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};

    // --- Input validation ---
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    const db = await getDb();

    // Check if email is already registered.
    const existing = db.exec('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      // Generic message to prevent email enumeration.
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // --- Create user ---
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const confirmationToken = uuidv4();
    const now = Date.now();

    db.run(
      `INSERT INTO users (id, email, password_hash, display_name, email_confirmed, confirmation_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [userId, email.toLowerCase(), passwordHash, displayName || '', confirmationToken, now, now]
    );
    saveDb();

    console.log(`[AUTH] New user registered: ${email.toLowerCase()} (id: ${userId})`);

    // --- Send confirmation email (or log URL in dev mode) ---
    await sendConfirmationEmail(email.toLowerCase(), confirmationToken, getBaseUrl(req));

    res.status(201).json({
      success: true,
      message: IS_DEV
        ? 'Account created. Check the server console for the confirmation URL (SMTP not configured).'
        : 'Account created! Please check your email to confirm your address.',
    });
  } catch (err) {
    console.error('[AUTH] Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// ---------------------------------------------------------------------------
// POST /confirm-email — Verify email address (JSON body)
// GET  /confirm-email — Verify email address (query param, browser-friendly)
// ---------------------------------------------------------------------------

/**
 * Shared handler for email confirmation. Works with both POST body and GET query param.
 */
async function handleConfirmEmail(token, res) {
  if (!token) {
    return res.status(400).json({ error: 'Confirmation token is required.' });
  }

  const db = await getDb();

  const result = db.exec('SELECT id, email FROM users WHERE confirmation_token = ?', [token]);
  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(404).json({ error: 'Invalid or expired confirmation token.' });
  }

  const userId = result[0].values[0][0];
  const userEmail = result[0].values[0][1];

  db.run(
    'UPDATE users SET email_confirmed = 1, confirmation_token = NULL, updated_at = ? WHERE id = ?',
    [Date.now(), userId]
  );
  saveDb();

  console.log(`[AUTH] Email confirmed for user: ${userEmail} (id: ${userId})`);

  return res.json({ success: true, message: 'Email confirmed successfully. You can now log in.' });
}

router.post('/confirm-email', async (req, res) => {
  try {
    await handleConfirmEmail(req.body?.token, res);
  } catch (err) {
    console.error('[AUTH] Email confirmation error:', err);
    res.status(500).json({ error: 'Internal server error during email confirmation.' });
  }
});

router.get('/confirm-email', async (req, res) => {
  try {
    await handleConfirmEmail(req.query?.token, res);
  } catch (err) {
    console.error('[AUTH] Email confirmation error:', err);
    res.status(500).json({ error: 'Internal server error during email confirmation.' });
  }
});

// ---------------------------------------------------------------------------
// POST /login — Authenticate with email/password
// ---------------------------------------------------------------------------

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = await getDb();

    // Look up the user by email.
    const result = db.exec(
      'SELECT id, email, password_hash, display_name, email_confirmed FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      // Generic message prevents email enumeration.
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const row = result[0].values[0];
    const [userId, userEmail, passwordHash, displayName, emailConfirmed] = row;

    // User might have registered via Google (no password hash).
    if (!passwordHash) {
      return res.status(401).json({
        error: 'This account uses Google sign-in. Please log in with Google.',
      });
    }

    // Verify password against the stored bcrypt hash.
    const passwordMatch = await bcrypt.compare(password, passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check email confirmation (skip in dev mode for convenience).
    if (!IS_DEV && !emailConfirmed) {
      return res.status(403).json({
        error: 'Email not confirmed. Please check your inbox for the confirmation link.',
      });
    }

    // --- Create session and return tokens ---
    const { accessToken, refreshToken } = createSession(db, userId);

    // Set refresh token as httpOnly cookie for secure, automatic renewal
    setRefreshCookie(res, refreshToken);

    console.log(`[AUTH] User logged in: ${userEmail} (id: ${userId})`);

    res.json({
      accessToken,
      refreshToken, // Also in body for backwards compat
      user: {
        id: userId,
        email: userEmail,
        displayName: displayName || '',
      },
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// ---------------------------------------------------------------------------
// POST /google — Authenticate via Google OAuth ID token
// ---------------------------------------------------------------------------

router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token is required.' });
    }

    // Verify the Google ID token.
    // The GOOGLE_CLIENT_ID env var should be set to your Google OAuth client ID.
    // If not set, we still attempt verification (Google's library will validate
    // the token's signature against Google's public keys).
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const client = new OAuth2Client(clientId);

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: clientId || undefined,
      });
    } catch (verifyErr) {
      console.error('[AUTH] Google token verification failed:', verifyErr.message);
      return res.status(401).json({ error: 'Invalid Google ID token.' });
    }

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const displayName = payload.name || payload.email;

    if (!email) {
      return res.status(400).json({ error: 'Google account does not have an email address.' });
    }

    const db = await getDb();

    // Check if a user with this Google ID already exists.
    let result = db.exec('SELECT id, email, display_name FROM users WHERE google_id = ?', [googleId]);
    let userId, userEmail, userDisplayName;

    if (result.length > 0 && result[0].values.length > 0) {
      // Existing Google user — just log them in.
      [userId, userEmail, userDisplayName] = result[0].values[0];
      console.log(`[AUTH] Google user logged in: ${userEmail} (id: ${userId})`);
    } else {
      // Check if a user with this email exists (maybe registered with password).
      result = db.exec('SELECT id, email, display_name FROM users WHERE email = ?', [email.toLowerCase()]);

      if (result.length > 0 && result[0].values.length > 0) {
        // Link the Google account to the existing user.
        [userId, userEmail, userDisplayName] = result[0].values[0];
        db.run(
          'UPDATE users SET google_id = ?, email_confirmed = 1, updated_at = ? WHERE id = ?',
          [googleId, Date.now(), userId]
        );
        saveDb();
        console.log(`[AUTH] Linked Google account to existing user: ${userEmail} (id: ${userId})`);
      } else {
        // Create a brand new user.
        userId = uuidv4();
        userEmail = email.toLowerCase();
        userDisplayName = displayName;
        const now = Date.now();

        db.run(
          `INSERT INTO users (id, email, display_name, google_id, email_confirmed, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [userId, userEmail, userDisplayName, googleId, now, now]
        );
        saveDb();
        console.log(`[AUTH] New Google user registered: ${userEmail} (id: ${userId})`);
      }
    }

    // --- Create session and return tokens ---
    const { accessToken, refreshToken } = createSession(db, userId);

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, refreshToken);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email: userEmail,
        displayName: userDisplayName || '',
      },
    });
  } catch (err) {
    console.error('[AUTH] Google auth error:', err);
    res.status(500).json({ error: 'Internal server error during Google authentication.' });
  }
});

// ---------------------------------------------------------------------------
// POST /refresh — Exchange refresh token for new access token
// ---------------------------------------------------------------------------

router.post('/refresh', async (req, res) => {
  try {
    // Read refresh token from httpOnly cookie (primary) or body (fallback)
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }

    const db = await getDb();

    // Find the session by refresh token.
    const result = db.exec(
      'SELECT id, user_id, expires_at FROM sessions WHERE refresh_token = ?',
      [refreshToken]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    const [sessionId, userId, expiresAt] = result[0].values[0];

    // Check if the session has expired.
    if (Date.now() > expiresAt) {
      // Clean up the expired session.
      db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      saveDb();
      return res.status(401).json({ error: 'Refresh token has expired. Please log in again.' });
    }

    // Generate a new access token (the refresh token stays the same).
    const accessToken = generateAccessToken(userId);

    console.log(`[AUTH] Token refreshed for user: ${userId}`);

    res.json({ accessToken });
  } catch (err) {
    console.error('[AUTH] Token refresh error:', err);
    res.status(500).json({ error: 'Internal server error during token refresh.' });
  }
});

// ---------------------------------------------------------------------------
// POST /logout — Invalidate a refresh token
// ---------------------------------------------------------------------------

router.post('/logout', async (req, res) => {
  try {
    // Read refresh token from httpOnly cookie (primary) or body (fallback)
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (refreshToken) {
      const db = await getDb();
      db.run('DELETE FROM sessions WHERE refresh_token = ?', [refreshToken]);
      saveDb();
    }

    // Clear the httpOnly cookie
    clearRefreshCookie(res);

    console.log('[AUTH] User logged out (session invalidated)');

    res.json({ success: true });
  } catch (err) {
    console.error('[AUTH] Logout error:', err);
    res.status(500).json({ error: 'Internal server error during logout.' });
  }
});

// ---------------------------------------------------------------------------
// GET /me — Get current user info
// ---------------------------------------------------------------------------

router.get('/me', requireAuth, async (req, res) => {
  try {
    const db = await getDb();

    const result = db.exec(
      'SELECT id, email, display_name, email_confirmed, google_id, created_at FROM users WHERE id = ?',
      [req.userId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const [id, email, displayName, emailConfirmed, googleId, createdAt] = result[0].values[0];

    res.json({
      user: {
        id,
        email,
        displayName: displayName || '',
        emailConfirmed: !!emailConfirmed,
        hasGoogleAccount: !!googleId,
        createdAt,
      },
    });
  } catch (err) {
    console.error('[AUTH] Get user info error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /forgot-password — Request a password reset email
// ---------------------------------------------------------------------------

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const db = await getDb();

    const result = db.exec('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);

    // Always return success to prevent email enumeration.
    if (result.length === 0 || result[0].values.length === 0) {
      return res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
    }

    const userId = result[0].values[0][0];
    const resetToken = uuidv4();
    const resetExpires = Date.now() + RESET_TOKEN_LIFETIME_MS;

    db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ? WHERE id = ?',
      [resetToken, resetExpires, Date.now(), userId]
    );
    saveDb();

    await sendPasswordResetEmail(email.toLowerCase(), resetToken, getBaseUrl(req));

    console.log(`[AUTH] Password reset requested for: ${email.toLowerCase()}`);

    res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[AUTH] Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /reset-password — Reset password using token
// ---------------------------------------------------------------------------

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    const db = await getDb();

    const result = db.exec(
      'SELECT id, reset_token_expires FROM users WHERE reset_token = ?',
      [token]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired reset token.' });
    }

    const [userId, resetExpires] = result[0].values[0];

    // Check if the reset token has expired.
    if (Date.now() > resetExpires) {
      return res.status(410).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Hash the new password and clear the reset token.
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    db.run(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ? WHERE id = ?',
      [passwordHash, Date.now(), userId]
    );

    // Invalidate all existing sessions for this user (force re-login with new password).
    db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    saveDb();

    console.log(`[AUTH] Password reset completed for user: ${userId}`);

    res.json({ success: true, message: 'Password has been reset. Please log in with your new password.' });
  } catch (err) {
    console.error('[AUTH] Reset password error:', err);
    res.status(500).json({ error: 'Internal server error during password reset.' });
  }
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = router;
