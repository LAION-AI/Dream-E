/**
 * =============================================================================
 * EMAIL UTILITY MODULE
 * =============================================================================
 *
 * Sends transactional emails for account confirmation and password reset.
 *
 * SMTP configuration comes from environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Dev mode fallback:
 *   If SMTP is not configured (which is the common case during local development),
 *   the module logs the confirmation/reset URLs to the console instead of sending
 *   real emails. This lets developers test the full auth flow without an SMTP server.
 *
 * Why nodemailer?
 *   It's the de-facto standard for Node.js email, supports all major SMTP providers
 *   (Gmail, SendGrid, Mailgun, AWS SES, etc.), handles TLS/STARTTLS negotiation,
 *   and has a simple API. We only need it for two transactional emails, so the
 *   configuration is kept minimal.
 *
 * =============================================================================
 */

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// SMTP Configuration
// ---------------------------------------------------------------------------

/**
 * Checks whether SMTP environment variables are configured.
 * All four are required for real email sending to work.
 *
 * @returns {boolean} True if SMTP is fully configured.
 */
function isSmtpConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

/**
 * Creates a nodemailer transporter from environment variables.
 * Only called when SMTP is fully configured (checked by isSmtpConfigured).
 *
 * @returns {import('nodemailer').Transporter} A configured transporter instance.
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    // Use TLS for port 465 (implicit TLS); STARTTLS for everything else.
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Returns the "From" address for outgoing emails.
 * Defaults to a descriptive noreply address if not configured.
 *
 * @returns {string} The sender email address.
 */
function getFromAddress() {
  return process.env.SMTP_FROM || '"Dream-E" <noreply@dream-e.app>';
}

// ---------------------------------------------------------------------------
// Email Sending Functions
// ---------------------------------------------------------------------------

/**
 * Sends an email confirmation link to a newly registered user.
 *
 * In production (SMTP configured): sends a real email with an HTML body.
 * In development (no SMTP): logs the confirmation URL to the server console
 * so the developer can click it manually.
 *
 * @param {string} email - The recipient's email address.
 * @param {string} token - The unique confirmation token (stored in the users table).
 * @param {string} baseUrl - The application base URL (e.g., http://localhost:5173).
 * @returns {Promise<void>}
 */
async function sendConfirmationEmail(email, token, baseUrl) {
  const confirmUrl = `${baseUrl}/api/v2/auth/confirm-email?token=${encodeURIComponent(token)}`;

  if (!isSmtpConfigured()) {
    // Dev mode fallback: print the URL to the console.
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('[EMAIL] SMTP not configured — printing confirmation URL:');
    console.log(`  Email: ${email}`);
    console.log(`  URL:   ${confirmUrl}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    return;
  }

  const transporter = createTransporter();

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #6366f1;">Welcome to Dream-E!</h1>
      <p>Please confirm your email address by clicking the button below:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${confirmUrl}"
           style="display: inline-block; background: #6366f1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Confirm Email
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        If the button doesn't work, copy and paste this URL into your browser:<br>
        <a href="${confirmUrl}" style="color: #6366f1;">${confirmUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px;">
        If you didn't create a Dream-E account, you can safely ignore this email.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject: 'Confirm your Dream-E account',
      html: htmlBody,
    });
    console.log(`[EMAIL] Confirmation email sent to ${email}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send confirmation email to ${email}:`, err.message);
    // Don't throw — the registration should still succeed. The user can
    // request a new confirmation email later.
  }
}

/**
 * Sends a password reset link to the user.
 *
 * In production (SMTP configured): sends a real email.
 * In development (no SMTP): logs the reset URL to the server console.
 *
 * @param {string} email - The recipient's email address.
 * @param {string} token - The unique reset token (stored in the users table).
 * @param {string} baseUrl - The application base URL (e.g., http://localhost:5173).
 * @returns {Promise<void>}
 */
async function sendPasswordResetEmail(email, token, baseUrl) {
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  if (!isSmtpConfigured()) {
    // Dev mode fallback: print the URL to the console.
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('[EMAIL] SMTP not configured — printing password reset URL:');
    console.log(`  Email: ${email}`);
    console.log(`  URL:   ${resetUrl}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    return;
  }

  const transporter = createTransporter();

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #6366f1;">Password Reset</h1>
      <p>We received a request to reset your Dream-E account password.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}"
           style="display: inline-block; background: #6366f1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Reset Password
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.<br><br>
        Direct URL: <a href="${resetUrl}" style="color: #6366f1;">${resetUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px;">
        If you didn't request this, someone may have entered your email by mistake.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject: 'Reset your Dream-E password',
      html: htmlBody,
    });
    console.log(`[EMAIL] Password reset email sent to ${email}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send password reset email to ${email}:`, err.message);
    // Don't throw — we still return success to the client to prevent
    // email enumeration (attacker shouldn't know if the email exists).
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  sendConfirmationEmail,
  sendPasswordResetEmail,
};
