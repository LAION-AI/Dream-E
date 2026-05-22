/**
 * =============================================================================
 * USAGE LOGGER MODULE — Per-User API Usage Tracking
 * =============================================================================
 *
 * Records every AI API call into the usage_log table for:
 *   - Quota enforcement (checked by quotaCheck.cjs before each call)
 *   - Admin analytics (usage dashboards, per-user breakdowns)
 *   - Cost estimation (optional, based on known provider pricing)
 *
 * Each call to logUsage() inserts a single row capturing:
 *   - Who made the call (user_id)
 *   - What type (api_type: 'llm', 'image', 'tts')
 *   - Which provider and model were used
 *   - Resource consumption metrics (tokens, image count, audio seconds)
 *   - Estimated cost (if calculable from provider pricing)
 *
 * The usage_log table has indexes on (user_id, created_at) and
 * (api_type, created_at) for efficient quota queries and time-range analytics.
 *
 * Usage:
 *   const { logUsage } = require('./usageLogger.cjs');
 *   await logUsage(userId, 'image', 'bfl', 'flux-2-pro', {
 *     imageCount: 1,
 *     costEstimate: 0.05,
 *   });
 *
 * =============================================================================
 */

const { getDb, saveDb } = require('../db.cjs');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Logs an AI API usage event to the database.
 *
 * This should be called AFTER a successful API call completes. If the external
 * API call fails, usage should NOT be logged (the user shouldn't be charged
 * quota for a failed attempt).
 *
 * @param {string} userId - The authenticated user's ID.
 * @param {string} apiType - The type of call: 'llm', 'image', or 'tts'.
 * @param {string} provider - The AI provider used: 'gemini', 'bfl', 'openai-compatible', etc.
 * @param {string} model - The specific model used (e.g., 'gemini-2.5-flash', 'flux-2-pro').
 * @param {object} [details={}] - Additional usage details.
 * @param {number} [details.tokensIn=0] - Input tokens consumed (LLM only).
 * @param {number} [details.tokensOut=0] - Output tokens generated (LLM only).
 * @param {number} [details.imageCount=0] - Number of images generated.
 * @param {number} [details.audioSeconds=0] - Seconds of audio synthesized (TTS only).
 * @param {number} [details.costEstimate=0] - Estimated cost in USD.
 * @returns {Promise<void>}
 */
async function logUsage(userId, apiType, provider, model, details = {}) {
  try {
    const db = await getDb();
    const now = Date.now();

    const {
      tokensIn = 0,
      tokensOut = 0,
      imageCount = 0,
      audioSeconds = 0,
      costEstimate = 0,
    } = details;

    db.run(
      `INSERT INTO usage_log (user_id, api_type, provider, model, tokens_in, tokens_out, image_count, audio_seconds, cost_estimate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        apiType,
        provider || 'unknown',
        model || 'unknown',
        Math.round(tokensIn),
        Math.round(tokensOut),
        Math.round(imageCount),
        audioSeconds,
        costEstimate,
        now,
      ]
    );

    saveDb();

    console.log(
      `[USAGE] ${userId.slice(0, 8)}.. | ${apiType} | ${provider}/${model}` +
      (tokensIn || tokensOut ? ` | tokens: ${tokensIn}in/${tokensOut}out` : '') +
      (imageCount ? ` | images: ${imageCount}` : '') +
      (audioSeconds ? ` | audio: ${audioSeconds.toFixed(1)}s` : '') +
      (costEstimate ? ` | est: $${costEstimate.toFixed(4)}` : '')
    );
  } catch (err) {
    // Usage logging failures should NEVER block the API response.
    // The user already got their result — failing to log is a minor bookkeeping issue.
    console.error('[USAGE] Failed to log usage (non-fatal):', err.message);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { logUsage };
