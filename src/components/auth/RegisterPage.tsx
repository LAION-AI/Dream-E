/**
 * =============================================================================
 * REGISTER PAGE COMPONENT
 * =============================================================================
 *
 * The sign-up page for Dream-E. Collects user information and creates
 * a new account.
 *
 * FEATURES:
 * - Display name, email, password, and confirm password inputs
 * - Real-time client-side validation with visual feedback
 * - Password requirements displayed inline (min 8 chars, 1 number, 1 special)
 * - Google Sign-Up as an alternative
 * - Success message directing user to check their email
 *
 * VALIDATION:
 * Client-side validation runs on submit and provides immediate feedback.
 * Server-side validation is the authoritative check (handles edge cases
 * like duplicate emails).
 *
 * =============================================================================
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Mail, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@stores/useAuthStore';
import * as authService from '@services/authService';
import GoogleSignInButton from './GoogleSignInButton';

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * PASSWORD REQUIREMENTS
 * Each requirement is checked individually and displayed as a checklist.
 * This gives the user clear, actionable feedback while typing.
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

/**
 * Validate an email address format using a simple regex.
 * This is intentionally lenient -- the server does the authoritative check
 * and sends a confirmation email to verify the address actually works.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  /**
   * HANDLE FORM SUBMIT
   * Validates all fields, calls the register API, and shows a success message.
   *
   * The user must confirm their email before they can log in, so we
   * don't redirect to the app -- instead we show a success message.
   */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    // --- Client-side validation ---

    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }

    if (!email.trim() || !isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    // Check all password requirements
    const failedChecks = PASSWORD_CHECKS.filter((check) => !check.test(password));
    if (failedChecks.length > 0) {
      setError(`Password must: ${failedChecks.map((c) => c.label.toLowerCase()).join(', ')}.`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // --- API call ---

    setIsLoading(true);

    try {
      await authService.register(email, password, displayName.trim());
      setIsSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Registration failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * HANDLE GOOGLE SIGN-UP SUCCESS
   * Google OAuth creates the account automatically on the server side,
   * so we can log the user in immediately (no email confirmation needed).
   */
  function handleGoogleSuccess(
    user: { id: string; email: string; displayName: string },
    accessToken: string
  ) {
    setAuth(user, accessToken);
    navigate('/');
  }

  /**
   * HANDLE GOOGLE SIGN-UP ERROR
   */
  function handleGoogleError(errorMessage: string) {
    setError(errorMessage);
  }

  // ===========================================================================
  // SUCCESS STATE
  // ===========================================================================

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-editor-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          {/* Success icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>

          <h1 className="text-2xl font-bold text-editor-text mb-3">
            Account Created!
          </h1>
          <p className="text-editor-muted mb-6">
            Check your email for a confirmation link. You&apos;ll need to confirm
            your email address before you can sign in.
          </p>

          <Link
            to="/login"
            className="inline-block px-6 py-2.5 bg-editor-accent text-white font-medium rounded-lg hover:bg-editor-accent/80 transition-colors"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // REGISTRATION FORM
  // ===========================================================================

  return (
    <div className="min-h-screen bg-editor-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* ==================== LOGO ==================== */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-editor-accent mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-editor-text">Dream-E</h1>
          <p className="text-editor-muted mt-1">Create your account</p>
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

          {/* ==================== REGISTER FORM ==================== */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Display Name field */}
            <div>
              <label
                htmlFor="register-name"
                className="block text-sm font-medium text-editor-text mb-1.5"
              >
                Display Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="register-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="w-full pl-11 pr-4 py-2.5 bg-editor-bg border border-editor-border rounded-lg text-editor-text placeholder-editor-muted focus:outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent transition-colors"
                />
              </div>
            </div>

            {/* Email field */}
            <div>
              <label
                htmlFor="register-email"
                className="block text-sm font-medium text-editor-text mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-2.5 bg-editor-bg border border-editor-border rounded-lg text-editor-text placeholder-editor-muted focus:outline-none focus:border-editor-accent focus:ring-1 focus:ring-editor-accent transition-colors"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="register-password"
                className="block text-sm font-medium text-editor-text mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
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
                htmlFor="register-confirm"
                className="block text-sm font-medium text-editor-text mb-1.5"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="register-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
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
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* ==================== DIVIDER ==================== */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-editor-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-editor-surface text-editor-muted">
                or sign up with
              </span>
            </div>
          </div>

          {/* ==================== GOOGLE SIGN-UP ==================== */}
          <GoogleSignInButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
          />

          {/* ==================== LOGIN LINK ==================== */}
          <p className="mt-6 text-center text-sm text-editor-muted">
            Already have an account?{' '}
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
