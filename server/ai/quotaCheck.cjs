/**
 * =============================================================================
 * QUOTA CHECK MODULE — Per-User Daily Rate Limiting
 * =============================================================================
 *
 * Enforces per-user daily usage quotas for AI services (LLM, image gen, TTS).
 *
 * Before any AI API call is made, this module checks:
 *   1. The user's account is active (is_active = 1 in user_limits).
 *   2. The user has not exceeded their daily quota for the requested service.
 *
 * Quotas are tracked per calendar day (UTC midnight to midnight) using the
 * usage_log table. Each successful AI call logs a row there, and this module
 * sums the current day's usage to determine remaining quota.
 *
 * If a user does not have a user_limits row, one is created with default values.
 * This ensures that users who were created before the admin system work seamlessly.
 *
 * Usage:
 *   const { checkQuota } = require('./quotaCheck.cjs');
 *   const quota = await checkQuota(userId, 'image');
 *   if (!quota.allowed) {
 *     return res.status(429).json({ error: 'Quota exceeded', ...quota });
 *   }
 *   // ... proceed with API call ...
 *
 * =============================================================================
 */

const { getDb, saveDb } = require('../db.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default user limits, matching the defaults in the user_limits table schema.
 * Used when creating a new user_limits row for a user who doesn't have one yet.
 */
const DEFAULT_LIMITS = {
  max_projects: 20,
  daily_llm_tokens: 500000,
  daily_images: 50,
  daily_tts_seconds: 600,
  is_admin: 0,
  is_active: 1,
  notes: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the Unix timestamp (ms) for the start of the current UTC day.
 *
 * We use UTC to avoid timezone-related edge cases where a user's "day"
 * might span different calendar dates depending on their timezone.
 * All usage is counted against the UTC day.
 *
 * @returns {number} Unix timestamp in milliseconds for today 00:00:00 UTC.
 */
function getStartOfDayUTC() {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  return startOfDay.getTime();
}

/**
 * Ensures that a user_limits row exists for the given user.
 * If not, creates one with default values.
 *
 * This handles the migration case where users were created before the
 * admin panel was implemented, and also handles any edge cases where
 * the migration in db.cjs didn't cover a user (e.g., registered between
 * startup and first AI call).
 *
 * @param {import('sql.js').Database} db - The database instance.
 * @param {string} userId - The user's ID.
 * @returns {void}
 */
function ensureUserLimits(db, userId) {
  const existing = db.exec(
    'SELECT user_id FROM user_limits WHERE user_id = ?',
    [userId]
  );

  if (existing.length === 0 || existing[0].values.length === 0) {
    const now = Date.now();
    db.run(
      `INSERT INTO user_limits (user_id, max_projects, daily_llm_tokens, daily_images, daily_tts_seconds, is_admin, is_active, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        DEFAULT_LIMITS.max_projects,
        DEFAULT_LIMITS.daily_llm_tokens,
        DEFAULT_LIMITS.daily_images,
        DEFAULT_LIMITS.daily_tts_seconds,
        DEFAULT_LIMITS.is_admin,
        DEFAULT_LIMITS.is_active,
        DEFAULT_LIMITS.notes,
        now,
      ]
    );
    saveDb();
    console.log(`[QUOTA] Created default user_limits for user ${userId}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks whether a user is allowed to make an AI API call of the given type.
 *
 * This is the main entry point for quota enforcement. It:
 *   1. Ensures the user has a user_limits row (creates default if missing).
 *   2. Checks is_active — disabled accounts get a hard 403-style rejection.
 *   3. Sums today's usage for the given api_type from usage_log.
 *   4. Compares against the user's configured limit.
 *   5. Returns an object indicating whether the call is allowed.
 *
 * For admin users (is_admin = 1), quotas are still checked but logged.
 * Admins are NOT exempt from quotas by default — this prevents accidental
 * runaway costs. An admin can set their own limits to a very high value
 * through the admin panel if they want effectively unlimited access.
 *
 * @param {string} userId - The authenticated user's ID.
 * @param {string} apiType - The type of API call: 'llm', 'image', or 'tts'.
 * @returns {Promise<{
 *   allowed: boolean,
 *   remaining?: number,
 *   limit?: number,
 *   used?: number,
 *   reason?: string
 * }>} Quota check result.
 *   - allowed=true: proceed with the API call. `remaining` shows how much is left.
 *   - allowed=false: reject the request. `limit`, `used`, and `reason` explain why.
 */
async function checkQuota(userId, apiType) {
  const db = await getDb();

  // Ensure the user has a limits row.
  ensureUserLimits(db, userId);

  // Fetch the user's limits.
  const limitsResult = db.exec(
    `SELECT daily_llm_tokens, daily_images, daily_tts_seconds, is_active, is_admin
     FROM user_limits WHERE user_id = ?`,
    [userId]
  );

  if (limitsResult.length === 0 || limitsResult[0].values.length === 0) {
    // This should never happen since ensureUserLimits just ran,
    // but handle it defensively.
    return {
      allowed: false,
      reason: 'User limits configuration not found. Contact admin.',
    };
  }

  const [dailyLlmTokens, dailyImages, dailyTtsSeconds, isActive, isAdmin] =
    limitsResult[0].values[0];

  // Check 1: Is the account active?
  if (!isActive) {
    return {
      allowed: false,
      reason: 'Your account has been disabled. Contact admin for assistance.',
    };
  }

  // Determine the limit and usage column based on apiType.
  let limit;
  let usageQuery;
  const startOfDay = getStartOfDayUTC();

  switch (apiType) {
    case 'llm':
      limit = dailyLlmTokens;
      // For LLM, we sum tokens_in + tokens_out as the "used" metric.
      usageQuery = `SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as used
                     FROM usage_log
                     WHERE user_id = ? AND api_type = 'llm' AND created_at >= ?`;
      break;

    case 'image':
      limit = dailyImages;
      usageQuery = `SELECT COALESCE(SUM(image_count), 0) as used
                     FROM usage_log
                     WHERE user_id = ? AND api_type = 'image' AND created_at >= ?`;
      break;

    case 'tts':
      limit = dailyTtsSeconds;
      usageQuery = `SELECT COALESCE(SUM(audio_seconds), 0) as used
                     FROM usage_log
                     WHERE user_id = ? AND api_type = 'tts' AND created_at >= ?`;
      break;

    default:
      return {
        allowed: false,
        reason: `Unknown API type: ${apiType}. Expected 'llm', 'image', or 'tts'.`,
      };
  }

  // Check 2: Sum today's usage and compare against the limit.
  const usageResult = db.exec(usageQuery, [userId, startOfDay]);
  const used = (usageResult.length > 0 && usageResult[0].values.length > 0)
    ? usageResult[0].values[0][0]
    : 0;

  const remaining = Math.max(0, limit - used);

  if (used >= limit) {
    console.log(`[QUOTA] User ${userId} exceeded ${apiType} quota: ${used}/${limit} (admin=${isAdmin})`);
    return {
      allowed: false,
      limit,
      used,
      remaining: 0,
      reason: `Daily ${apiType} quota exceeded. Used: ${used}, Limit: ${limit}. Resets at midnight UTC.`,
    };
  }

  return {
    allowed: true,
    remaining,
    limit,
    used,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkQuota,
  ensureUserLimits,
  getStartOfDayUTC,
  DEFAULT_LIMITS,
};
