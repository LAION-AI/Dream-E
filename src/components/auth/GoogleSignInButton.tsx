/**
 * =============================================================================
 * GOOGLE SIGN-IN BUTTON COMPONENT
 * =============================================================================
 *
 * A reusable Google Sign-In button that integrates with Google Identity
 * Services (GIS). Handles the full OAuth flow on the client side.
 *
 * HOW GOOGLE SIGN-IN WORKS:
 * 1. We load the Google Identity Services script from accounts.google.com
 * 2. Initialize it with our Google Client ID (from VITE_GOOGLE_CLIENT_ID)
 * 3. Google renders a branded "Sign in with Google" button
 * 4. User clicks it, authenticates in a popup
 * 5. Google returns a JWT credential (ID token)
 * 6. We send that ID token to our backend (/api/v2/auth/google)
 * 7. Backend verifies the token with Google and returns our own auth tokens
 *
 * ENVIRONMENT VARIABLE:
 * The Google Client ID must be set as VITE_GOOGLE_CLIENT_ID in the .env file.
 * If it's not set, this component renders nothing (graceful degradation).
 *
 * =============================================================================
 */

import { useEffect, useRef, useCallback } from 'react';
import * as authService from '@services/authService';
import type { AuthUser } from '@stores/useAuthStore';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Props for the GoogleSignInButton component.
 */
interface GoogleSignInButtonProps {
  /**
   * Callback fired after successful Google authentication.
   * Receives the authenticated user and access token from our backend.
   */
  onSuccess: (user: AuthUser, accessToken: string) => void;

  /**
   * Callback fired when Google authentication fails.
   * Receives an error message string.
   */
  onError: (error: string) => void;
}

/**
 * Type declarations for the Google Identity Services global objects.
 * These are added to `window` when the GIS script loads.
 */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              width?: number;
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              type?: 'standard' | 'icon';
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * GoogleSignInButton
 *
 * Renders a Google-branded sign-in button. If no Google Client ID is configured,
 * renders nothing (allows the app to work without Google auth configured).
 *
 * @example
 * <GoogleSignInButton
 *   onSuccess={(user, token) => {
 *     authStore.setAuth(user, token);
 *     navigate('/');
 *   }}
 *   onError={(err) => setError(err)}
 * />
 */
export default function GoogleSignInButton({
  onSuccess,
  onError,
}: GoogleSignInButtonProps) {
  /**
   * Ref to the container div where Google will render its button.
   * Google's SDK replaces the contents of this div with its own button.
   */
  const buttonRef = useRef<HTMLDivElement>(null);

  /**
   * Track whether the script has been loaded to avoid double-initialization.
   */
  const initializedRef = useRef(false);

  /**
   * Read the Google Client ID from the Vite environment variable.
   * This is set in .env or .env.local as VITE_GOOGLE_CLIENT_ID=xxx.
   */
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  /**
   * HANDLE CREDENTIAL RESPONSE
   * Called by Google Identity Services after the user successfully
   * authenticates. Sends the ID token to our backend for verification.
   */
  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      try {
        const result = await authService.loginWithGoogle(response.credential);
        onSuccess(result.user, result.accessToken);
      } catch (err) {
        onError(
          err instanceof Error ? err.message : 'Google sign-in failed'
        );
      }
    },
    [onSuccess, onError]
  );

  /**
   * LOAD AND INITIALIZE GOOGLE IDENTITY SERVICES
   *
   * This effect:
   * 1. Dynamically loads the GIS script tag if not already present
   * 2. Waits for the script to load
   * 3. Initializes GIS with our client ID and callback
   * 4. Renders the Google button inside our container div
   */
  useEffect(() => {
    // Skip if no client ID is configured or already initialized
    if (!clientId || initializedRef.current) return;

    /**
     * Initialize GIS once the script is loaded.
     * Called either immediately (if already loaded) or on script load event.
     */
    function initializeGIS() {
      if (!window.google || !buttonRef.current || initializedRef.current) return;

      initializedRef.current = true;

      // Initialize with our client ID and callback
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });

      // Render Google's branded button inside our container
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 320,
        text: 'signin_with',
        shape: 'rectangular',
      });
    }

    // Check if the script is already loaded (from a previous render)
    if (window.google) {
      initializeGIS();
      return;
    }

    // Check if the script tag already exists but hasn't finished loading
    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existingScript) {
      existingScript.addEventListener('load', initializeGIS);
      return;
    }

    // Load the Google Identity Services script dynamically
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGIS;
    script.onerror = () => {
      console.warn('[GoogleSignIn] Failed to load Google Identity Services script');
    };
    document.head.appendChild(script);
  }, [clientId, handleCredentialResponse]);

  // If no client ID is configured, render nothing.
  // This allows the app to work without Google OAuth set up.
  if (!clientId) {
    return null;
  }

  return (
    <div
      ref={buttonRef}
      className="flex justify-center"
      data-testid="google-signin-button"
    />
  );
}
