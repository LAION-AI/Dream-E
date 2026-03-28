/**
 * =============================================================================
 * CONFIRM EMAIL PAGE COMPONENT
 * =============================================================================
 *
 * Handles the email confirmation step of the registration flow.
 *
 * FLOW:
 * 1. User registers -> server sends email with a confirmation link
 * 2. User clicks the link -> navigates to /confirm-email?token=xxx
 * 3. This component reads the token from the URL query parameter
 * 4. Calls the confirmEmail API to validate the token
 * 5. Shows success (with link to login) or error (token invalid/expired)
 *
 * WHY A SEPARATE PAGE?
 * Email confirmation links are clicked from external email clients (Gmail,
 * Outlook, etc.). They navigate to the app with a token in the URL.
 * A dedicated page provides clear feedback about the confirmation status.
 *
 * =============================================================================
 */

import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import * as authService from '@services/authService';

// =============================================================================
// COMPONENT
// =============================================================================

export default function ConfirmEmailPage() {
  /**
   * Read the token from the URL query parameter.
   * Example URL: /confirm-email?token=abc123
   */
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // UI state
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  /**
   * Ref to track whether the confirmation has already been attempted.
   * Prevents double-calls in React's StrictMode (development).
   */
  const attemptedRef = useRef(false);

  /**
   * CONFIRM THE TOKEN ON MOUNT
   *
   * This effect runs once when the component mounts. It calls the
   * server to validate the confirmation token. The ref guard prevents
   * duplicate API calls in React StrictMode.
   */
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    async function confirm() {
      // No token in URL -- invalid link
      if (!token) {
        setStatus('error');
        setMessage('No confirmation token found. Please check your email link.');
        return;
      }

      try {
        const result = await authService.confirmEmail(token);
        if (result.success) {
          setStatus('success');
          setMessage('Your email has been confirmed! You can now sign in.');
        } else {
          setStatus('error');
          setMessage(result.message || 'Email confirmation failed.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(
          err instanceof Error
            ? err.message
            : 'Email confirmation failed. The link may be expired or invalid.'
        );
      }
    }

    confirm();
  }, [token]);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div className="min-h-screen bg-editor-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* ==================== LOGO ==================== */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-editor-accent mb-6">
          <BookOpen className="w-8 h-8 text-white" />
        </div>

        {/* ==================== LOADING STATE ==================== */}
        {status === 'loading' && (
          <div className="bg-editor-surface rounded-2xl border border-editor-border p-8 shadow-xl">
            <Loader2 className="w-10 h-10 text-editor-accent animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-editor-text mb-2">
              Confirming your email...
            </h1>
            <p className="text-editor-muted text-sm">
              Please wait while we verify your email address.
            </p>
          </div>
        )}

        {/* ==================== SUCCESS STATE ==================== */}
        {status === 'success' && (
          <div className="bg-editor-surface rounded-2xl border border-editor-border p-8 shadow-xl">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/20 mb-4">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <h1 className="text-xl font-bold text-editor-text mb-2">
              Email Confirmed!
            </h1>
            <p className="text-editor-muted text-sm mb-6">{message}</p>
            <Link
              to="/login"
              className="inline-block px-6 py-2.5 bg-editor-accent text-white font-medium rounded-lg hover:bg-editor-accent/80 transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}

        {/* ==================== ERROR STATE ==================== */}
        {status === 'error' && (
          <div className="bg-editor-surface rounded-2xl border border-editor-border p-8 shadow-xl">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/20 mb-4">
              <XCircle className="w-7 h-7 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-editor-text mb-2">
              Confirmation Failed
            </h1>
            <p className="text-editor-muted text-sm mb-6">{message}</p>
            <div className="flex flex-col items-center gap-3">
              <Link
                to="/login"
                className="inline-block px-6 py-2.5 bg-editor-accent text-white font-medium rounded-lg hover:bg-editor-accent/80 transition-colors"
              >
                Go to Sign In
              </Link>
              <Link
                to="/register"
                className="text-sm text-editor-accent hover:text-editor-accent/80 transition-colors"
              >
                Create a new account
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
