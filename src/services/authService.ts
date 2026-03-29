/**
 * =============================================================================
 * AUTHENTICATION SERVICE
 * =============================================================================
 *
 * Client-side service layer for all authentication API calls.
 *
 * RESPONSIBILITIES:
 * - Registering new users
 * - Logging in (email/password and Google OAuth)
 * - Refreshing expired access tokens via httpOnly refresh cookie
 * - Logging out (clearing server-side refresh token)
 * - Email confirmation and password reset flows
 * - Authenticated API fetch helper with automatic token refresh
 *
 * API BASE:
 * All endpoints are prefixed with /api/v2/auth. In development, Vite proxies
 * these to the backend server. In production, the same origin serves both
 * the SPA and the API.
 *
 * TOKEN STRATEGY:
 * - Access token: Short-lived JWT stored in memory (useAuthStore.accessToken).
 *   Sent as `Authorization: Bearer <token>` header.
 * - Refresh token: Long-lived, stored in an httpOnly cookie set by the server.
 *   The browser sends it automatically with requests to /api/v2/auth/refresh.
 *   This service never sees or stores the refresh token directly.
 *
 * =============================================================================
 */

import { useAuthStore, type AuthUser } from '@stores/useAuthStore';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * API_BASE
 * Base path for all authentication endpoints. The versioned path (/api/v2)
 * allows the server to evolve the API without breaking older clients.
 */
const API_BASE = '/api/v2';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Standard success/error response shape used by register, confirmEmail,
 * forgotPassword, and resetPassword endpoints.
 */
interface ApiResult {
  success: boolean;
  message: string;
}

/**
 * Response shape returned by login and Google sign-in endpoints.
 * Contains the user profile and a short-lived access token.
 * The refresh token is set as an httpOnly cookie by the server.
 */
interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

// =============================================================================
// AUTH API FUNCTIONS
// =============================================================================

/**
 * REGISTER
 * Creates a new user account with email and password.
 *
 * After registration, the server sends a confirmation email. The user must
 * click the link in that email before they can log in. This prevents spam
 * accounts and ensures the email is valid.
 *
 * @param email - The user's email address
 * @param password - The user's chosen password (min 8 chars, 1 number, 1 special)
 * @param displayName - The user's display name shown in the UI
 * @returns Success status and a message (e.g., "Check your email to confirm")
 * @throws Error if the request fails (network error, server error, etc.)
 */
export async function register(
  email: string,
  password: string,
  displayName: string
): Promise<ApiResult> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Registration failed');
  }

  return data;
}

/**
 * LOGIN
 * Authenticates a user with email and password.
 *
 * On success, returns the user profile and access token. The server also
 * sets an httpOnly refresh cookie for silent token renewal.
 *
 * @param email - The user's email address
 * @param password - The user's password
 * @returns The authenticated user and access token
 * @throws Error if credentials are invalid or the account is not confirmed
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // credentials: 'include' ensures the browser sends and accepts cookies
    // (needed for the httpOnly refresh token cookie)
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Login failed');
  }

  return data;
}

/**
 * LOGIN WITH GOOGLE
 * Authenticates using a Google OAuth ID token.
 *
 * The flow:
 * 1. User clicks "Sign in with Google" button
 * 2. Google Identity Services returns an ID token (JWT signed by Google)
 * 3. We send that token to our server
 * 4. Server verifies it with Google, creates/finds the user, returns auth data
 *
 * If the user doesn't exist yet, the server auto-creates an account using
 * their Google profile (email, name). No separate registration step needed.
 *
 * @param idToken - The JWT ID token from Google Identity Services
 * @returns The authenticated user and access token
 * @throws Error if the token is invalid or Google auth fails
 */
export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Google sign-in failed');
  }

  return data;
}

/**
 * REFRESH TOKEN
 * Silently refreshes the access token using the httpOnly refresh cookie.
 *
 * This is called:
 * 1. On app startup (to restore a session after page reload)
 * 2. By authFetch when a 401 response is received (token expired)
 *
 * The browser automatically sends the refresh cookie with this request.
 * If the refresh succeeds, we get a new access token. If it fails (cookie
 * expired or missing), the user needs to log in again.
 *
 * @returns The new access token, or null if refresh failed
 */
export async function refreshToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.accessToken || null;
  } catch {
    // Network error or server unreachable -- treat as failed refresh.
    // This is expected during local development when the auth server
    // isn't running.
    return null;
  }
}

// =============================================================================
// PROACTIVE TOKEN REFRESH
// =============================================================================
// Refresh the token periodically so the user never gets logged out during
// long creative sessions. The access token lasts 24h, so we refresh every
// 12h (well before expiry). Also refreshes when the tab regains focus after
// being inactive (common during multi-tab usage or switching to other apps).

let refreshTimerId: ReturnType<typeof setInterval> | null = null;

/** Start periodic token refresh (called after successful login/restore). */
export function startProactiveRefresh(): void {
  stopProactiveRefresh();

  // Refresh every 12 hours (well before the 24h token expiry)
  refreshTimerId = setInterval(async () => {
    const store = (await import('@/stores/useAuthStore')).useAuthStore.getState();
    if (!store.isAuthenticated) return;
    const newToken = await refreshToken();
    if (newToken) {
      store.setAuth(store.user!, newToken);
      console.log('[Auth] Proactive token refresh succeeded');
    }
  }, 12 * 60 * 60 * 1000);

  // Also refresh when the tab regains focus (handles tab-away scenarios)
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

/** Stop periodic refresh (called on logout). */
export function stopProactiveRefresh(): void {
  if (refreshTimerId) {
    clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

/** When tab becomes visible again, try to refresh the token */
async function handleVisibilityChange(): Promise<void> {
  if (document.visibilityState !== 'visible') return;
  const { useAuthStore } = await import('@/stores/useAuthStore');
  const store = useAuthStore.getState();
  if (!store.isAuthenticated || !store.user) return;

  try {
    const newToken = await refreshToken();
    if (newToken) {
      store.setAuth(store.user, newToken);
      console.log('[Auth] Token refreshed on tab focus');
    }
  } catch {
    // Silent — authFetch will handle 401 if needed
  }
}

/**
 * LOGOUT
 * Ends the user session on both client and server.
 *
 * Server-side: Invalidates the refresh token (removes it from the DB and
 * clears the httpOnly cookie).
 * Client-side: The caller (or authFetch) clears the Zustand store.
 *
 * @throws Silently catches errors -- logout should always "succeed" on the
 *         client side even if the server is unreachable.
 */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Silently ignore -- we still clear client-side state regardless.
    // The refresh token will eventually expire on its own.
  }
}

/**
 * CONFIRM EMAIL
 * Validates an email confirmation token sent to the user after registration.
 *
 * The token is a one-time-use code embedded in the confirmation link.
 * After confirmation, the user's account becomes active and they can log in.
 *
 * @param token - The confirmation token from the email link's query parameter
 * @returns Success status
 * @throws Error if the token is invalid, expired, or already used
 */
export async function confirmEmail(token: string): Promise<ApiResult> {
  const response = await fetch(`${API_BASE}/auth/confirm-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Email confirmation failed');
  }

  return data;
}

/**
 * FORGOT PASSWORD
 * Initiates the password reset flow by requesting a reset email.
 *
 * The server sends an email with a reset link regardless of whether the email
 * is registered (to prevent email enumeration attacks). The UI always shows
 * a success message.
 *
 * @param email - The email address to send the reset link to
 * @returns Success status (always succeeds from the client's perspective)
 */
export async function forgotPassword(email: string): Promise<ApiResult> {
  const response = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to send reset email');
  }

  return data;
}

/**
 * RESET PASSWORD
 * Completes the password reset flow by setting a new password.
 *
 * The token comes from the reset email link's query parameter. It's a
 * one-time-use code that expires after a set period (typically 1 hour).
 *
 * @param token - The reset token from the email link
 * @param newPassword - The user's new password
 * @returns Success status
 * @throws Error if the token is invalid/expired or the password doesn't meet requirements
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<ApiResult> {
  const response = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Password reset failed');
  }

  return data;
}

/**
 * GET ME
 * Fetches the current user's profile from the server.
 *
 * Uses the access token to authenticate. This is useful for verifying
 * that the stored user data is still current (e.g., if the display name
 * was changed on another device).
 *
 * @returns The current user's profile
 * @throws Error if not authenticated or the token is invalid
 */
export async function getMe(): Promise<AuthUser> {
  const response = await authFetch(`${API_BASE}/auth/me`);

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to fetch user profile');
  }

  return data.user;
}

// =============================================================================
// AUTH FETCH HELPER
// =============================================================================

/**
 * Flag to prevent multiple simultaneous refresh attempts.
 * Without this, if 5 API calls all get 401 at the same time, we'd fire
 * 5 refresh requests. Instead, subsequent calls wait for the first refresh
 * to complete.
 */
let isRefreshing = false;

/**
 * Queue of callbacks waiting for the token refresh to complete.
 * When a refresh is in progress and another authFetch gets a 401,
 * it pushes a resolve/reject callback here and waits.
 */
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Process all queued callbacks after a refresh attempt completes.
 * Either resolves all with the new token or rejects all with an error.
 *
 * @param token - The new access token (null if refresh failed)
 * @param error - The error if refresh failed (null if succeeded)
 */
function processRefreshQueue(token: string | null, error: Error | null): void {
  for (const { resolve, reject } of refreshQueue) {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    } else {
      reject(new Error('Token refresh returned null'));
    }
  }
  refreshQueue = [];
}

/**
 * AUTH FETCH
 * A fetch wrapper that automatically handles JWT authentication and
 * token refresh on 401 responses.
 *
 * HOW IT WORKS:
 * 1. Gets the current access token from the auth store
 * 2. Adds the Authorization header to the request
 * 3. Makes the request
 * 4. If the response is 401 (token expired):
 *    a. Attempts to refresh the token using the httpOnly cookie
 *    b. If refresh succeeds, retries the original request with the new token
 *    c. If refresh fails, logs the user out (React router handles redirect)
 * 5. Returns the response for the caller to handle
 *
 * CONCURRENCY:
 * Uses a refresh queue to prevent multiple simultaneous refresh requests.
 * The first 401 triggers the refresh; subsequent 401s wait for it to complete.
 *
 * SOFT LOGOUT (NO HARD RELOAD):
 * When token refresh fails, we clear the auth state via store.logout() but
 * do NOT call window.location.href = '/login'. A hard page reload would:
 * - Kill all blob URLs in memory (they're session-scoped browser objects)
 * - Destroy the blobStore/blobCache Maps, making rehydrateForSave() unable
 *   to convert blob URLs back to base64, causing permanent asset data loss
 * - Force a full React re-mount, losing any unsaved editor state
 * Instead, we just clear the Zustand auth state. The AuthGuard component
 * detects isAuthenticated=false and renders the login page via React Router,
 * preserving in-memory state and blob URLs.
 *
 * @param url - The URL to fetch (can be relative, e.g., '/api/v2/projects')
 * @param options - Standard fetch options (method, body, headers, etc.)
 * @returns The fetch Response object
 * @throws Error if the request fails after retry, or if not authenticated
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const store = useAuthStore.getState();
  const token = store.accessToken;

  // Build headers with the Authorization token
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Make the initial request
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If not a 401, return the response as-is (success or other error)
  if (response.status !== 401) {
    return response;
  }

  // -------------------------------------------------------------------------
  // HANDLE 401: Token expired, attempt refresh
  // -------------------------------------------------------------------------

  // If a refresh is already in progress, wait for it to complete
  if (isRefreshing) {
    try {
      const newToken = await new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      });

      // Retry the original request with the new token
      const retryHeaders = new Headers(options.headers);
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      return fetch(url, { ...options, headers: retryHeaders, credentials: 'include' });
    } catch {
      // Refresh failed -- clear auth state, let React handle redirect.
      // NO hard reload (window.location.href) — that kills blob URLs and causes data loss.
      store.logout();
      return response;
    }
  }

  // This is the first 401 -- initiate the refresh
  isRefreshing = true;

  try {
    const newToken = await refreshToken();

    if (newToken) {
      // Refresh succeeded -- update the store and retry
      store.setAuth(store.user!, newToken);
      processRefreshQueue(newToken, null);

      // Retry the original request with the new token
      const retryHeaders = new Headers(options.headers);
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      return fetch(url, { ...options, headers: retryHeaders, credentials: 'include' });
    } else {
      // Refresh failed -- session expired. Clear auth state only.
      // NO hard reload — React AuthGuard handles the redirect to /login.
      const error = new Error('Session expired. Please log in again.');
      processRefreshQueue(null, error);
      store.logout();
      return response;
    }
  } catch (err) {
    // Network error during refresh. Clear auth state only.
    // NO hard reload — preserves blob URLs and in-memory project state.
    const error = err instanceof Error ? err : new Error('Token refresh failed');
    processRefreshQueue(null, error);
    store.logout();
    return response;
  } finally {
    isRefreshing = false;
  }
}
