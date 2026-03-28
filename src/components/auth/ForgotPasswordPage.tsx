/**
 * =============================================================================
 * FORGOT PASSWORD PAGE COMPONENT
 * =============================================================================
 *
 * Allows users to request a password reset email.
 *
 * SECURITY CONSIDERATIONS:
 * - Always shows a success message regardless of whether the email is registered.
 *   This prevents email enumeration attacks (an attacker can't determine which
 *   emails have accounts by observing the response).
 * - The actual reset logic happens server-side; this page only submits the email.
 *
 * FLOW:
 * 1. User enters their email address
 * 2. Clicks "Send Reset Link"
 * 3. Server sends a password reset email (if the address is registered)
 * 4. UI shows a generic success message
 * 5. User checks email, clicks link -> navigates to ResetPasswordPage
 *
 * =============================================================================
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as authService from '@services/authService';

// =============================================================================
// COMPONENT
// =============================================================================

export default function ForgotPasswordPage() {
  // Form state
  const [email, setEmail] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  /**
   * HANDLE FORM SUBMIT
   * Sends the password reset request. Always shows a success message
   * to prevent email enumeration.
   */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setIsLoading(true);

    try {
      await authService.forgotPassword(email);
      setIsSuccess(true);
    } catch (err) {
      // Even on error, we show a generic success message to prevent
      // email enumeration. The only exception is network errors.
      if (err instanceof Error && err.message.includes('Network')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        // Show success regardless -- the server may return an error for
        // unregistered emails, but we don't reveal that to the user.
        setIsSuccess(true);
      }
    } finally {
      setIsLoading(false);
    }
  }

  // ===========================================================================
  // SUCCESS STATE
  // ===========================================================================

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-editor-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-editor-text mb-3">
            Check Your Email
          </h1>
          <p className="text-editor-muted mb-6">
            If this email is registered, you&apos;ll receive a password reset link
            shortly. Check your inbox (and spam folder).
          </p>
          <Link
            to="/login"
            className="inline-block px-6 py-2.5 bg-editor-accent text-white font-medium rounded-lg hover:bg-editor-accent/80 transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // FORGOT PASSWORD FORM
  // ===========================================================================

  return (
    <div className="min-h-screen bg-editor-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* ==================== LOGO ==================== */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-editor-accent mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-editor-text">Dream-E</h1>
          <p className="text-editor-muted mt-1">Reset your password</p>
        </div>

        {/* ==================== CARD ==================== */}
        <div className="bg-editor-surface rounded-2xl border border-editor-border p-8 shadow-xl">
          <p className="text-editor-muted text-sm mb-6">
            Enter the email address associated with your account. We&apos;ll send
            you a link to reset your password.
          </p>

          {/* Error display */}
          {error && (
            <div className="mb-6 flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email field */}
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-sm font-medium text-editor-text mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  className="w-full pl-11 pr-4 py-2.5 bg-editor-bg border border-editor-border rounded-lg text-editor-text placeholder-editor-muted focus:outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent transition-colors"
                />
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-editor-accent text-white font-medium rounded-lg hover:bg-editor-accent/80 focus:outline-none focus:ring-2 focus:ring-editor-accent focus:ring-offset-2 focus:ring-offset-editor-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>

          {/* Back to login link */}
          <p className="mt-6 text-center text-sm text-editor-muted">
            Remember your password?{' '}
            <Link
              to="/login"
              className="text-editor-accent hover:text-editor-accent/80 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
