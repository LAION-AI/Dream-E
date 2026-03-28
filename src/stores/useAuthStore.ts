/**
 * =============================================================================
 * AUTHENTICATION STATE STORE (ZUSTAND)
 * =============================================================================
 *
 * Manages the client-side authentication state for Dream-E.
 *
 * WHAT STATE LIVES HERE?
 * - user: The currently authenticated user (id, email, displayName)
 * - accessToken: JWT access token for API calls (kept in memory only)
 * - isAuthenticated: Derived from whether user + token exist
 * - isLoading: Whether an auth check is in progress (e.g., token refresh)
 *
 * PERSISTENCE STRATEGY:
 * - User info (id, email, displayName) is persisted to localStorage so the
 *   UI can render immediately on reload without a flash of the login page.
 * - The access token is NOT persisted. It lives only in memory. On reload,
 *   the app attempts a silent token refresh via the httpOnly refresh cookie.
 *   This is more secure because even if an attacker can read localStorage,
 *   they cannot obtain a valid access token without the refresh cookie.
 *
 * WHY ZUSTAND?
 * - Minimal boilerplate compared to Redux
 * - Built-in persistence middleware
 * - Works with React's concurrent features
 * - Already used throughout the Dream-E codebase
 *
 * =============================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// TYPES
// =============================================================================

/**
 * USER TYPE
 * Represents the minimal user info needed on the client side.
 * Matches what the server returns from /api/v2/auth/me.
 */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * AUTH STATE INTERFACE
 * Full shape of the authentication store, including data and actions.
 */
export interface AuthState {
  /**
   * The currently authenticated user, or null if not logged in.
   * Persisted to localStorage for fast UI rendering on reload.
   */
  user: AuthUser | null;

  /**
   * JWT access token for authenticating API requests.
   * Kept in memory only (NOT persisted to localStorage) for security.
   * Short-lived; refreshed via httpOnly cookie on expiry.
   */
  accessToken: string | null;

  /**
   * Computed from whether both user and accessToken are present.
   * A user may exist in localStorage without a valid token after a reload;
   * isAuthenticated is only true once the token refresh succeeds.
   */
  isAuthenticated: boolean;

  /**
   * True while an authentication check is in progress (initial token refresh,
   * login request, etc.). Used by AuthGuard to show a loading spinner instead
   * of prematurely redirecting to /login.
   */
  isLoading: boolean;

  // =========================================================================
  // ACTIONS
  // =========================================================================

  /**
   * SET AUTH
   * Called after a successful login or token refresh. Sets both the user
   * object and the access token, and marks the user as authenticated.
   *
   * @param user - The authenticated user's info
   * @param accessToken - The JWT access token
   */
  setAuth: (user: AuthUser, accessToken: string) => void;

  /**
   * LOGOUT
   * Clears all auth state. Called when the user explicitly logs out or
   * when a token refresh fails (session expired). Resets user, token,
   * and isAuthenticated to their default (logged-out) values.
   */
  logout: () => void;

  /**
   * SET LOADING
   * Toggles the loading state. Used during async auth operations
   * (login, register, token refresh) to prevent premature redirects.
   *
   * @param loading - Whether auth is currently loading
   */
  setLoading: (loading: boolean) => void;
}

// =============================================================================
// STORE CREATION
// =============================================================================

/**
 * useAuthStore
 *
 * The Zustand store for authentication. Uses the `persist` middleware to
 * save the `user` field to localStorage under the key 'dream-e-auth'.
 *
 * The `partialize` option ensures only the user object is persisted --
 * the accessToken stays in memory for security.
 *
 * USAGE:
 *   import { useAuthStore } from '@stores/useAuthStore';
 *
 *   // In a component:
 *   const { user, isAuthenticated, logout } = useAuthStore();
 *
 *   // Outside React (e.g., in authService.ts):
 *   const token = useAuthStore.getState().accessToken;
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // -----------------------------------------------------------------------
      // INITIAL STATE
      // -----------------------------------------------------------------------
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      // -----------------------------------------------------------------------
      // ACTIONS
      // -----------------------------------------------------------------------

      setAuth: (user: AuthUser, accessToken: string) =>
        set({
          user,
          accessToken,
          isAuthenticated: true,
          isLoading: false,
        }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      setLoading: (loading: boolean) =>
        set({ isLoading: loading }),
    }),
    {
      /**
       * PERSISTENCE CONFIG
       * - name: localStorage key
       * - partialize: Only persist the `user` field. The access token must
       *   NOT be stored in localStorage (security best practice).
       */
      name: 'dream-e-auth',
      partialize: (state) => ({
        user: state.user,
      }),
    }
  )
);

export default useAuthStore;
