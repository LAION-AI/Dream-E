/**
 * =============================================================================
 * LOGIN PAGE COMPONENT
 * =============================================================================
 *
 * The sign-in page for Dream-E. Provides two authentication methods:
 * 1. Email + password (traditional login)
 * 2. Google Sign-In (OAuth)
 *
 * DESIGN:
 * Dark-themed centered card matching the Dream-E aesthetic. Uses the same
 * color palette (editor-bg, editor-surface, editor-accent) as the rest
 * of the application for visual consistency.
 *
 * FLOW:
 * - User enters credentials and clicks "Sign In"
 * - On success: auth store is updated, user is redirected to "/"
 * - On failure: inline error message is displayed
 * - Links to Register and Forgot Password pages
 *
 * =============================================================================
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@stores/useAuthStore';
import * as authService from '@services/authService';
import GoogleSignInButton from './GoogleSignInButton';

// =============================================================================
// COMPONENT
// =============================================================================

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  /**
   * HANDLE FORM SUBMIT
   * Validates inputs, calls the login API, and handles the response.
   *
   * Why prevent default? Without it, the browser would do a full page
   * navigation to the form's action URL, which would reload the SPA.
   */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    // Basic client-side validation
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authService.login(email, password);

      // Update the auth store with the returned user and token.
      // This triggers AuthGuard to let the user through.
      setAuth(result.user, result.accessToken);

      // Navigate to the main app
      navigate('/');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * HANDLE GOOGLE SIGN-IN SUCCESS
   * Called by the GoogleSignInButton after successful Google OAuth.
   */
  function handleGoogleSuccess(
    user: { id: string; email: string; displayName: string },
    accessToken: string
  ) {
    setAuth(user, accessToken);
    navigate('/');
  }

  /**
   * HANDLE GOOGLE SIGN-IN ERROR
   * Called by the GoogleSignInButton when Google OAuth fails.
   */
  function handleGoogleError(errorMessage: string) {
    setError(errorMessage);
  }

  return (
    <div className="min-h-screen bg-editor-bg flex items-center justify-center px-4">
      {/**
       * LOGIN CARD
       * Centered container with the Dream-E dark surface background.
       * Max width prevents it from stretching too wide on large screens.
       */}
      <div className="w-full max-w-md">
        {/* ==================== LOGO ==================== */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-editor-accent mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-editor-text">Dream-E</h1>
          <p className="text-editor-muted mt-1">Sign in to your account</p>
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

          {/* ==================== LOGIN FORM ==================== */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email field */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-editor-text mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="login-email"
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
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-editor-text"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-editor-accent hover:text-editor-accent/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-editor-muted" />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
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
                  Signing in...
                </span>
              ) : (
                'Sign In'
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
                or continue with
              </span>
            </div>
          </div>

          {/* ==================== GOOGLE SIGN-IN ==================== */}
          <GoogleSignInButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
          />

          {/* ==================== REGISTER LINK ==================== */}
          <p className="mt-6 text-center text-sm text-editor-muted">
            Don&apos;t have an account?{' '}
            <Link
              to="/register"
              className="text-editor-accent hover:text-editor-accent/80 font-medium transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
