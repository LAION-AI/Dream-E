/**
 * =============================================================================
 * ADMIN ROUTES — User Management, Config, Usage Analytics
 * =============================================================================
 *
 * Express router providing admin-only API endpoints for managing the Dream-E
 * multi-user server. All routes require both authentication (requireAuth) and
 * admin authorization (requireAdmin), applied at mount level in index.cjs.
 *
 * Endpoints:
 *
 * Users:
 *   GET    /users            — List all users with limits and today's usage summary
 *   GET    /users/:id        — Single user detail with 30-day usage history
 *   PATCH  /users/:id/limits — Update user limits (quotas, admin flag, active status)
 *   DELETE /users/:id        — Delete user and all their projects/assets
 *
 * Config:
 *   GET    /config           — Get all admin_config (secrets masked)
 *   PUT    /config           — Set admin_config values (encrypts secrets)
 *
 * Usage:
 *   GET    /usage            — Aggregated usage stats (filterable by date, user, type)
 *
 * System:
 *   GET    /stats            — System overview (total users, projects, storage)
 *
 * =============================================================================
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const { getDb, saveDb, ASSETS_DIR } = require('../db.cjs');
const { encrypt, decrypt, getMasterKey } = require('../utils/crypto.cjs');
const { getStartOfDayUTC } = require('../ai/quotaCheck.cjs');

const router = express.Router();

// ---------------------------------------------------------------------------
// Config key metadata: which keys are secrets vs. plain settings.
// This prevents admins from accidentally storing a non-secret as encrypted
// or forgetting to encrypt a secret.
// ---------------------------------------------------------------------------

/**
 * Registry of all known admin_config keys and whether they hold secrets.
 *
 * Keys marked as secret will be AES-256-GCM encrypted in the database and
 * returned as masked strings ('••••••••') in GET /config responses.
 * Non-secret keys are stored and returned in plain text.
 */
const CONFIG_KEY_META = {
  image_provider: { isSecret: false, description: 'Image generation provider (bfl/gemini/openai-compatible)' },
  image_model: { isSecret: false, description: 'Image generation model name' },
  image_api_key: { isSecret: true, description: 'API key for image generation' },
  image_endpoint: { isSecret: false, description: 'Custom endpoint URL for image generation' },
  llm_provider: { isSecret: false, description: 'LLM provider (gemini/openai-compatible)' },
  llm_model: { isSecret: false, description: 'LLM model name' },
  llm_api_key: { isSecret: true, description: 'API key for LLM' },
  llm_endpoint: { isSecret: false, description: 'Custom endpoint URL for LLM' },
  tts_model: { isSecret: false, description: 'TTS model name' },
  tts_api_key: { isSecret: true, description: 'API key for TTS' },
  tts_voice: { isSecret: false, description: 'Default TTS voice' },
  default_image_style: { isSecret: false, description: 'Style prompt appended to all image prompts' },
};

/** The mask string shown in place of secret values in GET responses. */
const SECRET_MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

// ---------------------------------------------------------------------------
// GET /users — List all users with limits and usage summary
// ---------------------------------------------------------------------------

/**
 * Returns a list of all registered users, including their:
 *   - Basic info (email, display name, creation date)
 *   - Configured limits (quotas, admin flag, active status)
 *   - Today's usage summary (tokens, images, TTS seconds)
 *   - Project count
 *
 * Results are sorted by creation date (newest first) for the admin panel's
 * user management table.
 */
router.get('/users', async (req, res) => {
  try {
    const db = await getDb();
    const startOfDay = getStartOfDayUTC();

    // Fetch all users with their limits.
    const usersResult = db.exec(`
      SELECT u.id, u.email, u.display_name, u.email_confirmed, u.created_at, u.updated_at,
             ul.max_projects, ul.daily_llm_tokens, ul.daily_images, ul.daily_tts_seconds,
             ul.is_admin, ul.is_active, ul.notes
      FROM users u
      LEFT JOIN user_limits ul ON u.id = ul.user_id
      ORDER BY u.created_at DESC
    `);

    if (usersResult.length === 0 || usersResult[0].values.length === 0) {
      return res.json({ users: [] });
    }

    const users = [];

    for (const row of usersResult[0].values) {
      const [id, email, displayName, emailConfirmed, createdAt, updatedAt,
        maxProjects, dailyLlmTokens, dailyImages, dailyTtsSeconds,
        isAdmin, isActive, notes] = row;

      // Count projects for this user.
      const projResult = db.exec(
        'SELECT COUNT(*) FROM projects WHERE user_id = ?',
        [id]
      );
      const projectCount = (projResult.length > 0 && projResult[0].values.length > 0)
        ? projResult[0].values[0][0]
        : 0;

      // Sum today's usage per type.
      const llmResult = db.exec(
        `SELECT COALESCE(SUM(tokens_in + tokens_out), 0) FROM usage_log
         WHERE user_id = ? AND api_type = 'llm' AND created_at >= ?`,
        [id, startOfDay]
      );
      const todayLlmTokens = (llmResult.length > 0 && llmResult[0].values.length > 0)
        ? llmResult[0].values[0][0] : 0;

      const imgResult = db.exec(
        `SELECT COALESCE(SUM(image_count), 0) FROM usage_log
         WHERE user_id = ? AND api_type = 'image' AND created_at >= ?`,
        [id, startOfDay]
      );
      const todayImages = (imgResult.length > 0 && imgResult[0].values.length > 0)
        ? imgResult[0].values[0][0] : 0;

      const ttsResult = db.exec(
        `SELECT COALESCE(SUM(audio_seconds), 0) FROM usage_log
         WHERE user_id = ? AND api_type = 'tts' AND created_at >= ?`,
        [id, startOfDay]
      );
      const todayTts = (ttsResult.length > 0 && ttsResult[0].values.length > 0)
        ? ttsResult[0].values[0][0] : 0;

      users.push({
        id,
        email,
        displayName: displayName || '',
        emailConfirmed: !!emailConfirmed,
        createdAt,
        updatedAt,
        projectCount,
        limits: {
          maxProjects: maxProjects ?? 20,
          dailyLlmTokens: dailyLlmTokens ?? 500000,
          dailyImages: dailyImages ?? 50,
          dailyTtsSeconds: dailyTtsSeconds ?? 600,
          isAdmin: !!isAdmin,
          isActive: isActive !== 0,
          notes: notes || '',
        },
        todayUsage: {
          llmTokens: todayLlmTokens,
          images: todayImages,
          ttsSeconds: todayTts,
        },
      });
    }

    res.json({ users });

  } catch (err) {
    console.error('[ADMIN] List users error:', err);
    res.status(500).json({ error: 'Failed to list users.' });
  }
});

// ---------------------------------------------------------------------------
// GET /users/:id — Single user detail with usage history
// ---------------------------------------------------------------------------

/**
 * Returns detailed information about a single user, including:
 *   - Full user info and limits
 *   - Usage history for the last 30 days (daily aggregates by api_type)
 *   - Project list (IDs and titles only, not full data)
 */
router.get('/users/:id', async (req, res) => {
  try {
    const db = await getDb();
    const targetUserId = req.params.id;

    // Fetch user info.
    const userResult = db.exec(
      `SELECT u.id, u.email, u.display_name, u.email_confirmed, u.google_id, u.created_at, u.updated_at,
              ul.max_projects, ul.daily_llm_tokens, ul.daily_images, ul.daily_tts_seconds,
              ul.is_admin, ul.is_active, ul.notes, ul.updated_at as limits_updated
       FROM users u
       LEFT JOIN user_limits ul ON u.id = ul.user_id
       WHERE u.id = ?`,
      [targetUserId]
    );

    if (userResult.length === 0 || userResult[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const [id, email, displayName, emailConfirmed, googleId, createdAt, updatedAt,
      maxProjects, dailyLlmTokens, dailyImages, dailyTtsSeconds,
      isAdmin, isActive, notes, limitsUpdated] = userResult[0].values[0];

    // Fetch usage history for the last 30 days.
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const usageResult = db.exec(
      `SELECT api_type, provider, model,
              SUM(tokens_in) as total_tokens_in,
              SUM(tokens_out) as total_tokens_out,
              SUM(image_count) as total_images,
              SUM(audio_seconds) as total_audio,
              SUM(cost_estimate) as total_cost,
              COUNT(*) as call_count,
              created_at
       FROM usage_log
       WHERE user_id = ? AND created_at >= ?
       GROUP BY api_type, provider, model
       ORDER BY created_at DESC`,
      [targetUserId, thirtyDaysAgo]
    );

    const usageHistory = [];
    if (usageResult.length > 0 && usageResult[0].values.length > 0) {
      const cols = usageResult[0].columns;
      for (const row of usageResult[0].values) {
        const entry = {};
        cols.forEach((col, i) => { entry[col] = row[i]; });
        usageHistory.push(entry);
      }
    }

    // Fetch project summaries for this user.
    const projResult = db.exec(
      'SELECT id, data, updated_at, created_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
      [targetUserId]
    );

    const projects = [];
    if (projResult.length > 0 && projResult[0].values.length > 0) {
      for (const row of projResult[0].values) {
        const [projId, projData, projUpdated, projCreated] = row;
        let title = `Project ${projId.slice(0, 8)}`;
        try {
          const parsed = JSON.parse(projData);
          title = parsed?.info?.title || parsed?.settings?.projectName || title;
        } catch { /* use default title */ }
        projects.push({
          id: projId,
          title,
          updatedAt: projUpdated,
          createdAt: projCreated,
        });
      }
    }

    res.json({
      user: {
        id,
        email,
        displayName: displayName || '',
        emailConfirmed: !!emailConfirmed,
        hasGoogleAccount: !!googleId,
        createdAt,
        updatedAt,
        limits: {
          maxProjects: maxProjects ?? 20,
          dailyLlmTokens: dailyLlmTokens ?? 500000,
          dailyImages: dailyImages ?? 50,
          dailyTtsSeconds: dailyTtsSeconds ?? 600,
          isAdmin: !!isAdmin,
          isActive: isActive !== 0,
          notes: notes || '',
          updatedAt: limitsUpdated,
        },
        projectCount: projects.length,
      },
      usageHistory,
      projects,
    });

  } catch (err) {
    console.error('[ADMIN] Get user error:', err);
    res.status(500).json({ error: 'Failed to get user details.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /users/:id/limits — Update user limits
// ---------------------------------------------------------------------------

/**
 * Updates the quotas, admin flag, active status, and/or notes for a user.
 *
 * Only the provided fields are updated — omitted fields keep their current values.
 * This allows the admin to toggle just one setting (e.g., is_active) without
 * having to re-send all the other limits.
 *
 * Request body (all optional):
 *   { maxProjects, dailyLlmTokens, dailyImages, dailyTtsSeconds, isAdmin, isActive, notes }
 *
 * Safety: Admins cannot de-admin themselves (to prevent lockout scenarios).
 */
router.patch('/users/:id/limits', async (req, res) => {
  try {
    const db = await getDb();
    const targetUserId = req.params.id;
    const callerUserId = req.userId;

    // Verify the target user exists.
    const userCheck = db.exec('SELECT id FROM users WHERE id = ?', [targetUserId]);
    if (userCheck.length === 0 || userCheck[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Safety check: prevent admins from removing their own admin status.
    if (targetUserId === callerUserId && req.body.isAdmin === false) {
      return res.status(400).json({
        error: 'Cannot remove your own admin status. Ask another admin to do this.',
      });
    }

    const {
      maxProjects,
      dailyLlmTokens,
      dailyImages,
      dailyTtsSeconds,
      isAdmin,
      isActive,
      notes,
    } = req.body;

    const now = Date.now();

    // Ensure the user_limits row exists (creates with defaults if not).
    db.run(
      `INSERT OR IGNORE INTO user_limits (user_id, max_projects, daily_llm_tokens, daily_images, daily_tts_seconds, is_admin, is_active, notes, updated_at)
       VALUES (?, 20, 500000, 50, 600, 0, 1, '', ?)`,
      [targetUserId, now]
    );

    // Build the UPDATE dynamically based on which fields are provided.
    // This ensures omitted fields aren't overwritten with defaults.
    const updates = [];
    const params = [];

    if (maxProjects !== undefined) {
      updates.push('max_projects = ?');
      params.push(maxProjects);
    }
    if (dailyLlmTokens !== undefined) {
      updates.push('daily_llm_tokens = ?');
      params.push(dailyLlmTokens);
    }
    if (dailyImages !== undefined) {
      updates.push('daily_images = ?');
      params.push(dailyImages);
    }
    if (dailyTtsSeconds !== undefined) {
      updates.push('daily_tts_seconds = ?');
      params.push(dailyTtsSeconds);
    }
    if (isAdmin !== undefined) {
      updates.push('is_admin = ?');
      params.push(isAdmin ? 1 : 0);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    // Always update the timestamp.
    updates.push('updated_at = ?');
    params.push(now);

    // Add the WHERE clause parameter.
    params.push(targetUserId);

    db.run(
      `UPDATE user_limits SET ${updates.join(', ')} WHERE user_id = ?`,
      params
    );
    saveDb();

    console.log(`[ADMIN] Updated limits for user ${targetUserId}: ${updates.map(u => u.split(' = ')[0]).join(', ')}`);

    res.json({ success: true, updatedAt: now });

  } catch (err) {
    console.error('[ADMIN] Update limits error:', err);
    res.status(500).json({ error: 'Failed to update user limits.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /users/:id — Delete user and all their data
// ---------------------------------------------------------------------------

/**
 * Permanently deletes a user and ALL their associated data:
 *   - All projects owned by the user
 *   - All asset records and files for those projects
 *   - All sessions (refresh tokens)
 *   - The user_limits row
 *   - All usage_log entries
 *   - The user record itself
 *
 * This is irreversible. The admin panel should show a confirmation dialog.
 *
 * Safety: Admins cannot delete themselves.
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const db = await getDb();
    const targetUserId = req.params.id;
    const callerUserId = req.userId;

    // Safety: prevent self-deletion.
    if (targetUserId === callerUserId) {
      return res.status(400).json({
        error: 'Cannot delete your own account. Ask another admin to do this.',
      });
    }

    // Verify the target user exists.
    const userCheck = db.exec('SELECT email FROM users WHERE id = ?', [targetUserId]);
    if (userCheck.length === 0 || userCheck[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const userEmail = userCheck[0].values[0][0];

    // Delete all projects and their assets.
    const projResult = db.exec('SELECT id FROM projects WHERE user_id = ?', [targetUserId]);
    let deletedProjects = 0;

    if (projResult.length > 0 && projResult[0].values.length > 0) {
      for (const [projId] of projResult[0].values) {
        // Delete asset records.
        db.run('DELETE FROM assets WHERE project_id = ?', [projId]);

        // Delete asset files from disk.
        const projAssetsDir = path.join(ASSETS_DIR, projId);
        if (fs.existsSync(projAssetsDir)) {
          fs.rmSync(projAssetsDir, { recursive: true, force: true });
        }

        deletedProjects++;
      }
    }

    // Delete all project records.
    db.run('DELETE FROM projects WHERE user_id = ?', [targetUserId]);

    // Delete sessions.
    db.run('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);

    // Delete usage logs.
    db.run('DELETE FROM usage_log WHERE user_id = ?', [targetUserId]);

    // Delete user limits.
    db.run('DELETE FROM user_limits WHERE user_id = ?', [targetUserId]);

    // Delete the user record.
    db.run('DELETE FROM users WHERE id = ?', [targetUserId]);

    saveDb();

    console.log(`[ADMIN] Deleted user ${userEmail} (${targetUserId}) — ${deletedProjects} projects removed`);

    res.json({
      success: true,
      deleted: {
        user: userEmail,
        projects: deletedProjects,
      },
    });

  } catch (err) {
    console.error('[ADMIN] Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ---------------------------------------------------------------------------
// GET /config — Get all admin_config (secrets masked)
// ---------------------------------------------------------------------------

/**
 * Returns all admin configuration values. Secret values are replaced with
 * a mask string ('••••••••') to prevent API key exposure.
 *
 * The response includes metadata about each key (whether it's a secret,
 * its description) so the frontend can render appropriate UI controls.
 *
 * Response:
 *   { config: [{ key, value, isSecret, description, updatedAt }] }
 */
router.get('/config', async (req, res) => {
  try {
    const db = await getDb();

    // Fetch all config rows from the database.
    const result = db.exec('SELECT key, value, is_secret, updated_at FROM admin_config');

    const configEntries = [];
    const existingKeys = new Set();

    if (result.length > 0 && result[0].values.length > 0) {
      for (const [key, value, isSecret, updatedAt] of result[0].values) {
        existingKeys.add(key);
        const meta = CONFIG_KEY_META[key] || { isSecret: false, description: '' };

        configEntries.push({
          key,
          // Mask secret values — never expose API keys via this endpoint.
          value: isSecret ? SECRET_MASK : value,
          isSecret: !!isSecret,
          description: meta.description,
          updatedAt,
        });
      }
    }

    // Include metadata for known keys that don't have a value yet,
    // so the frontend can show empty fields for unconfigured settings.
    for (const [key, meta] of Object.entries(CONFIG_KEY_META)) {
      if (!existingKeys.has(key)) {
        configEntries.push({
          key,
          value: '',
          isSecret: meta.isSecret,
          description: meta.description,
          updatedAt: null,
        });
      }
    }

    res.json({ config: configEntries });

  } catch (err) {
    console.error('[ADMIN] Get config error:', err);
    res.status(500).json({ error: 'Failed to read admin config.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /config — Set admin_config values (encrypts secrets)
// ---------------------------------------------------------------------------

/**
 * Sets one or more admin configuration values.
 *
 * Request body:
 *   { values: { [key: string]: string } }
 *
 * For secret keys (API keys), the value is encrypted with AES-256-GCM before
 * storage. For non-secret keys, the value is stored in plain text.
 *
 * If a secret key's value is the mask string ('••••••••'), it is skipped
 * (the frontend sends this when the admin didn't change the key).
 *
 * Unknown keys (not in CONFIG_KEY_META) are accepted but stored as non-secret.
 * This allows future-proofing without requiring code changes for new settings.
 */
router.put('/config', async (req, res) => {
  try {
    const { values } = req.body || {};

    if (!values || typeof values !== 'object') {
      return res.status(400).json({ error: 'Request body must contain a "values" object.' });
    }

    const db = await getDb();
    const masterKey = getMasterKey();
    const now = Date.now();
    let updated = 0;

    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== 'string') continue;

      // Determine if this key should be encrypted.
      const meta = CONFIG_KEY_META[key] || { isSecret: false };
      const isSecret = meta.isSecret;

      // Skip masked values — the admin didn't change this secret.
      if (isSecret && value === SECRET_MASK) {
        continue;
      }

      // Skip empty secret values — don't store empty encrypted blobs.
      // For non-secrets, allow empty strings (clearing a setting).
      if (isSecret && value.trim() === '') {
        // Delete the key if it exists (admin clearing a secret).
        db.run('DELETE FROM admin_config WHERE key = ?', [key]);
        updated++;
        continue;
      }

      // Encrypt secret values; store non-secrets in plain text.
      const storedValue = isSecret ? encrypt(value, masterKey) : value;

      // UPSERT: insert or replace the config row.
      db.run(
        `INSERT OR REPLACE INTO admin_config (key, value, is_secret, updated_at)
         VALUES (?, ?, ?, ?)`,
        [key, storedValue, isSecret ? 1 : 0, now]
      );
      updated++;
    }

    saveDb();

    console.log(`[ADMIN] Updated ${updated} config value(s) by admin ${req.userId.slice(0, 8)}..`);

    res.json({ success: true, updated });

  } catch (err) {
    console.error('[ADMIN] Set config error:', err);
    res.status(500).json({ error: 'Failed to update admin config.' });
  }
});

// ---------------------------------------------------------------------------
// GET /usage — Aggregated usage stats
// ---------------------------------------------------------------------------

/**
 * Returns aggregated usage statistics, filterable by date range, user, and API type.
 *
 * Query parameters (all optional):
 *   - from: Start timestamp (Unix ms). Default: 30 days ago.
 *   - to: End timestamp (Unix ms). Default: now.
 *   - userId: Filter to a specific user.
 *   - apiType: Filter to a specific API type ('llm', 'image', 'tts').
 *
 * Response:
 *   {
 *     summary: { totalCalls, totalTokens, totalImages, totalAudioSeconds, totalCost },
 *     byUser: [{ userId, email, calls, tokens, images, audioSeconds, cost }],
 *     byType: [{ apiType, calls, tokens, images, audioSeconds, cost }],
 *     daily: [{ date, calls, tokens, images, audioSeconds, cost }]
 *   }
 */
router.get('/usage', async (req, res) => {
  try {
    const db = await getDb();

    // Parse query parameters.
    const from = parseInt(req.query.from, 10) || (Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = parseInt(req.query.to, 10) || Date.now();
    const filterUserId = req.query.userId || null;
    const filterApiType = req.query.apiType || null;

    // Build WHERE clause dynamically. Use "ul." prefix for table-qualified names
    // to avoid "ambiguous column name" errors in JOINed queries (usage_log aliased as ul).
    const conditions = ['ul.created_at >= ?', 'ul.created_at <= ?'];
    const params = [from, to];

    if (filterUserId) {
      conditions.push('ul.user_id = ?');
      params.push(filterUserId);
    }
    if (filterApiType) {
      conditions.push('ul.api_type = ?');
      params.push(filterApiType);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // --- Summary totals ---
    const summaryResult = db.exec(
      `SELECT COUNT(*) as total_calls,
              COALESCE(SUM(ul.tokens_in + ul.tokens_out), 0) as total_tokens,
              COALESCE(SUM(ul.image_count), 0) as total_images,
              COALESCE(SUM(ul.audio_seconds), 0) as total_audio,
              COALESCE(SUM(ul.cost_estimate), 0) as total_cost
       FROM usage_log ul ${whereClause}`,
      params
    );

    let summary = { totalCalls: 0, totalTokens: 0, totalImages: 0, totalAudioSeconds: 0, totalCost: 0 };
    if (summaryResult.length > 0 && summaryResult[0].values.length > 0) {
      const [calls, tokens, images, audio, cost] = summaryResult[0].values[0];
      summary = { totalCalls: calls, totalTokens: tokens, totalImages: images, totalAudioSeconds: audio, totalCost: cost };
    }

    // --- Breakdown by user ---
    const byUserResult = db.exec(
      `SELECT ul.user_id, u.email,
              COUNT(*) as calls,
              COALESCE(SUM(ul.tokens_in + ul.tokens_out), 0) as tokens,
              COALESCE(SUM(ul.image_count), 0) as images,
              COALESCE(SUM(ul.audio_seconds), 0) as audio_seconds,
              COALESCE(SUM(ul.cost_estimate), 0) as cost
       FROM usage_log ul
       JOIN users u ON ul.user_id = u.id
       ${whereClause}
       GROUP BY ul.user_id
       ORDER BY calls DESC`,
      params
    );

    const byUser = [];
    if (byUserResult.length > 0 && byUserResult[0].values.length > 0) {
      for (const row of byUserResult[0].values) {
        byUser.push({
          userId: row[0], email: row[1], calls: row[2],
          tokens: row[3], images: row[4], audioSeconds: row[5], cost: row[6],
        });
      }
    }

    // --- Breakdown by API type ---
    const byTypeResult = db.exec(
      `SELECT ul.api_type,
              COUNT(*) as calls,
              COALESCE(SUM(ul.tokens_in + ul.tokens_out), 0) as tokens,
              COALESCE(SUM(ul.image_count), 0) as images,
              COALESCE(SUM(ul.audio_seconds), 0) as audio_seconds,
              COALESCE(SUM(ul.cost_estimate), 0) as cost
       FROM usage_log ul ${whereClause}
       GROUP BY ul.api_type
       ORDER BY calls DESC`,
      params
    );

    const byType = [];
    if (byTypeResult.length > 0 && byTypeResult[0].values.length > 0) {
      for (const row of byTypeResult[0].values) {
        byType.push({
          apiType: row[0], calls: row[1], tokens: row[2],
          images: row[3], audioSeconds: row[4], cost: row[5],
        });
      }
    }

    res.json({ summary, byUser, byType });

  } catch (err) {
    console.error('[ADMIN] Usage stats error:', err);
    res.status(500).json({ error: 'Failed to fetch usage stats.' });
  }
});

// ---------------------------------------------------------------------------
// GET /stats — System overview
// ---------------------------------------------------------------------------

/**
 * Returns system-wide statistics for the admin dashboard:
 *   - Total users (registered, confirmed, active, admin)
 *   - Total projects
 *   - Total asset storage size (disk usage)
 *   - Database file size
 *
 * This endpoint provides a quick health overview without needing to
 * aggregate data from multiple tables.
 */
router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();

    // User counts.
    const userCountResult = db.exec('SELECT COUNT(*) FROM users');
    const totalUsers = (userCountResult.length > 0 && userCountResult[0].values.length > 0)
      ? userCountResult[0].values[0][0] : 0;

    const confirmedResult = db.exec('SELECT COUNT(*) FROM users WHERE email_confirmed = 1');
    const confirmedUsers = (confirmedResult.length > 0 && confirmedResult[0].values.length > 0)
      ? confirmedResult[0].values[0][0] : 0;

    const activeResult = db.exec(
      `SELECT COUNT(*) FROM user_limits WHERE is_active = 1`
    );
    const activeUsers = (activeResult.length > 0 && activeResult[0].values.length > 0)
      ? activeResult[0].values[0][0] : 0;

    const adminResult = db.exec(
      `SELECT COUNT(*) FROM user_limits WHERE is_admin = 1`
    );
    const adminUsers = (adminResult.length > 0 && adminResult[0].values.length > 0)
      ? adminResult[0].values[0][0] : 0;

    // Project count.
    const projectResult = db.exec('SELECT COUNT(*) FROM projects');
    const totalProjects = (projectResult.length > 0 && projectResult[0].values.length > 0)
      ? projectResult[0].values[0][0] : 0;

    // Asset count and total size (from DB metadata, not disk).
    const assetResult = db.exec('SELECT COUNT(*), COALESCE(SUM(size), 0) FROM assets');
    let totalAssets = 0;
    let totalAssetSize = 0;
    if (assetResult.length > 0 && assetResult[0].values.length > 0) {
      totalAssets = assetResult[0].values[0][0];
      totalAssetSize = assetResult[0].values[0][1];
    }

    // Database file size.
    const { DATA_DIR } = require('../db.cjs');
    const dbPath = path.join(DATA_DIR, 'dream-e.db');
    let dbFileSize = 0;
    if (fs.existsSync(dbPath)) {
      dbFileSize = fs.statSync(dbPath).size;
    }

    // Usage log count.
    const usageCountResult = db.exec('SELECT COUNT(*) FROM usage_log');
    const totalUsageLogs = (usageCountResult.length > 0 && usageCountResult[0].values.length > 0)
      ? usageCountResult[0].values[0][0] : 0;

    res.json({
      users: {
        total: totalUsers,
        confirmed: confirmedUsers,
        active: activeUsers,
        admin: adminUsers,
      },
      projects: {
        total: totalProjects,
      },
      assets: {
        total: totalAssets,
        totalSizeBytes: totalAssetSize,
      },
      storage: {
        dbSizeBytes: dbFileSize,
      },
      usage: {
        totalLogEntries: totalUsageLogs,
      },
    });

  } catch (err) {
    console.error('[ADMIN] Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch system stats.' });
  }
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = router;
