/**
 * =============================================================================
 * AUTH GUARD COMPONENT
 * =============================================================================
 *
 * A wrapper component that protects routes from unauthenticated access.
 *
 * HOW IT WORKS:
 * 1. Checks the auth store for authentication status
 * 2. If loading (e.g., token refresh in progress): shows a loading spinner
 * 3. If not authenticated: redirects to /login
 * 4. If authenticated: renders the children (the protected content)
 *
 * USAGE:
 * Wrap any route element that requires authentication:
 *
 *   <Route path="/game" element={
 *     <AuthGuard>
 *       <Dashboard mode="game" />
 *     </AuthGuard>
 *   } />
 *
 * WHY A SEPARATE COMPONENT?
 * - Single point of auth enforcement (DRY principle)
 * - Easy to add/remove auth protection from routes
 * - Loading state prevents flash of login page during token refresh
 * - Clean separation between auth logic and page content
 *
 * =============================================================================
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@stores/useAuthStore';

// =============================================================================
// TYPES
// =============================================================================

interface AuthGuardProps {
  /**
   * The protected content to render when authenticated.
   */
  children: React.ReactNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * AuthGuard
 *
 * Protects child routes from unauthenticated access. Redirects to /login
 * if the user is not authenticated and no auth check is in progress.
 *
 * The loading state is critical: on page refresh, the auth store has user
 * info from localStorage but no access token yet (it's refreshed async).
 * Without the loading check, the user would see a brief flash of the login
 * page before being redirected back.
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const navigate = useNavigate();

  /**
   * REDIRECT EFFECT
   * Navigates to /login when the user is definitively not authenticated.
   *
   * The check skips while isLoading is true because:
   * - On app startup, the token refresh hasn't completed yet
   * - The user may actually be authenticated, we just don't know yet
   * - Redirecting prematurely would be a poor UX (flash of login page)
   *
   * Uses navigate() instead of <Navigate> for better compatibility with
   * React's effect lifecycle.
   */
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // ---- Loading state: auth check in progress ----
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-editor-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-editor-border border-t-editor-accent rounded-full animate-spin" />
          <p className="text-editor-muted text-sm">Verifying session...</p>
        </div>
      </div>
    );
  }

  // ---- Not authenticated: render nothing (redirect is happening) ----
  if (!isAuthenticated) {
    return null;
  }

  // ---- Authenticated: render the protected content ----
  return <>{children}</>;
}
