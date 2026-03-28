/**
 * =============================================================================
 * RESET PASSWORD PAGE COMPONENT
 * =============================================================================
 *
 * Allows users to set a new password using a reset token from their email.
 *
 * FLOW:
 * 1. User clicked "Forgot Password" -> received email with reset link
 * 2. Link navigates to /reset-password?token=xxx
 * 3. This page reads the token from the URL
 * 4. User enters a new password (with confirmation)
 * 5. Submits to the server, which validates the token and updates the password
 * 6. On success, redirects to the login page
 *
 * SECURITY:
 * - The token is single-use and time-limited (typically 1 hour)
 * - Password requirements are enforced both client-side and server-side
 * - The token is never stored; it's used once and discarded
 *
 * =============================================================================
 */

import { useState, type FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { BookOpen, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as authService from '@services/authService';

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Password requirement checks, reused from RegisterPage pattern.
 */
interface PasswordCheck {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_CHECKS: PasswordCheck[] = [
  {
    label: 'At least 8 characters',
    test: (pw) => pw.length >= 8,
  },
  {
    label: 'Contains a number',
    test: (pw) => /\d/.test(pw),
  },
  {
    label: 'Contains a special character (!@#$%^&*...)',
    test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw),
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  /**
   * Read the reset token from the URL query parameter.
   * Example URL: /reset-password?token=abc123
   */
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  /**
   * HANDLE FORM SUBMIT
   * Validates the new password and sends it to the server with the
   * reset token for verification.
   */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    // Check for missing token
    if (!token) {
      setError('No reset token found. Please use the link from your email.');
      return;
    }

    // Validate password requirements
    const failedChecks = PASSWORD_CHECKS.filter((check) => !check.test(password));
    if (failedChecks.length > 0) {
      setError(`Password must: ${failedChecks.map((c) => c.label.toLowerCase()).join(', ')}.`);
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authService.resetPassword(token, password);
      if (result.success) {
        setIsSuccess(true);
        // Auto-redirect to login after 3 seconds
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setError(result.message || 'Password reset failed.');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Password reset failed. The link may be expired.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  // ===========================================================================
  // NO TOKEN STATE
  // ===========================================================================

  if (!token) {
    return (
      <div className="min-h-screen bg-editor-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-editor-surface rounded-2xl border border-editor-border p-8 shadow-xl">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-editor-text mb-2">
              Invalid Reset Link
            </h1>
            <p className="text-editor-muted text-sm mb-6">
              No reset token was found in the URL. Please use the link from
              your password reset email, or request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block px-6 py-2.5 bg-editor-accent text-white font-medium rounded-lg hover:bg-editor-accent/80 transition-colors"
            >
              Request New Reset Link
            </Link>
          </div>
        </div>
      </div>
    );
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
            Password Reset!
          </h1>
          <p className="text-editor-muted mb-6">
            Your password has been updated. Redirecting you to the sign-in page...
          </p>
          <Link
            to="/login"
            className="inline-block px-6 py-2.5 bg-editor-accent text-white font-medium rounded-lg hover:bg-editor-accent/80 transition-colors"
          >
            Sign In Now
          </Link>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // RESET PASSWORD FORM
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
          <p className="text-editor-muted mt-1">Set a new password</p>
        </div>

        {/* ==================== CARD ==================== */}
        <div className="bg-editor-surface rounded-2xl border border-editor-border p-8 shadow-xl">
          {/* Error display */}
          {error && (
            <div className="mb-6 flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* New Password field */}
            <div>
              <label
                htmlFor="reset-password"
                className="block text-sm font-medium text-editor-text mb-1.5"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className="w-full pl-11 pr-4 py-2.5 bg-editor-bg border border-editor-border rounded-lg text-editor-text placeholder-editor-muted focus:outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent transition-colors"
                />
              </div>

              {/* Password requirements checklist */}
              <div className="mt-2 space-y-1">
                {PASSWORD_CHECKS.map((check) => {
                  const passed = check.test(password);
                  return (
                    <div
                      key={check.label}
                      className={`flex items-center gap-2 text-xs transition-colors ${
                        password
                          ? passed
                            ? 'text-green-400'
                            : 'text-red-400'
                          : 'text-editor-muted'
                      }`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${
                        password && passed ? 'opacity-100' : 'opacity-40'
                      }`} />
                      <span>{check.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confirm Password field */}
            <div>
              <label
                htmlFor="reset-confirm"
                className="block text-sm font-medium text-editor-text mb-1.5"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="reset-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="w-full pl-11 pr-4 py-2.5 bg-editor-bg border border-editor-border rounded-lg text-editor-text placeholder-editor-muted focus:outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent transition-colors"
                />
              </div>
              {/* Match indicator */}
              {confirmPassword && (
                <p className={`mt-1.5 text-xs ${
                  password === confirmPassword ? 'text-green-400' : 'text-red-400'
                }`}>
                  {password === confirmPassword
                    ? 'Passwords match'
                    : 'Passwords do not match'}
                </p>
              )}
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
                  Resetting...
                </span>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>

          {/* Back to login link */}
          <p className="mt-6 text-center text-sm text-editor-muted">
            <Link
              to="/login"
              className="text-editor-accent hover:text-editor-accent/80 font-medium transition-colors"
            >
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
