/**
 * =============================================================================
 * ADMIN STORE (ZUSTAND)
 * =============================================================================
 *
 * Zustand store for the Dream-E admin panel. Manages:
 *   - User management (list, update limits, delete)
 *   - AI configuration (server-side config for image gen, LLM, TTS)
 *   - Usage analytics (daily aggregated stats by API type)
 *   - System-level statistics (total users, projects, storage)
 *
 * All API calls use the access token from the auth store (useAuthStore)
 * via the authFetch helper, which handles automatic token refresh on 401.
 *
 * API ENDPOINTS:
 *   GET    /api/v2/admin/users          - List all users with their limits/usage
 *   PUT    /api/v2/admin/users/:id       - Update a user's limits
 *   DELETE /api/v2/admin/users/:id       - Delete a user
 *   GET    /api/v2/admin/stats           - System-wide statistics
 *   GET    /api/v2/admin/usage           - Usage analytics with filters
 *   GET    /api/v2/ai/config             - Read AI configuration
 *   PUT    /api/v2/ai/config             - Update AI configuration
 *
 * =============================================================================
 */

import { create } from 'zustand';
import { authFetch } from '@services/authService';

// =============================================================================
// TYPES
// =============================================================================

/**
 * USER LIMITS
 * Per-user rate limits and permission flags stored on the server.
 * These control how much of each AI service the user can consume per day,
 * as well as admin/active status.
 */
export interface UserLimits {
  /** Maximum number of projects the user can create */
  maxProjects: number;
  /** Maximum LLM tokens the user can consume per day */
  dailyLlmTokens: number;
  /** Maximum images the user can generate per day */
  dailyImages: number;
  /** Maximum TTS seconds the user can generate per day */
  dailyTtsSeconds: number;
  /** Whether the user has admin privileges */
  isAdmin: boolean;
  /** Whether the user account is active */
  isActive: boolean;
  /** Admin notes about this user (internal, not shown to user) */
  notes: string;
}

/**
 * ADMIN USER
 * Full user record as returned by the admin API, including limits and today's usage.
 * This is richer than the AuthUser type used in the auth store.
 */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
  lastLogin?: number;
  projectCount: number;
  limits: UserLimits;
  /** Today's aggregated usage for this user across all API types */
  todayUsage: {
    llmTokens: number;
    images: number;
    ttsSeconds: number;
  };
}

/**
 * USAGE STAT
 * A single row of aggregated usage data, representing one day + user + API type combination.
 * Returned by the /api/v2/admin/usage endpoint.
 */
export interface UsageStat {
  /** Date string in YYYY-MM-DD format */
  date: string;
  /** User email (may be undefined if aggregated across all users) */
  user_email?: string;
  /** API type (e.g., "llm", "image", "tts") */
  api_type: string;
  /** AI provider used (e.g., "gemini", "bfl", "openai") */
  provider: string;
  /** Total LLM tokens consumed */
  total_tokens: number;
  /** Total images generated */
  total_images: number;
  /** Total TTS audio seconds generated */
  total_tts_seconds: number;
  /** Estimated cost in USD */
  total_cost: number;
}

/**
 * SYSTEM STATS
 * High-level statistics about the entire Dream-E instance.
 */
export interface SystemStats {
  totalUsers: number;
  totalProjects: number;
  storageBytes: number;
}

/**
 * ADMIN STORE INTERFACE
 * The complete shape of the admin store, including data and actions.
 */
export interface AdminStore {
  // ---- Users ----
  /** List of all users retrieved from the admin API */
  users: AdminUser[];
  /** Whether the user list is currently being fetched */
  loadingUsers: boolean;
  /** Fetch all users from the server */
  fetchUsers: () => Promise<void>;
  /** Update a specific user's limits (partial update) */
  updateUserLimits: (userId: string, limits: Partial<UserLimits>) => Promise<void>;
  /** Delete a user by ID */
  deleteUser: (userId: string) => Promise<void>;

  // ---- Config ----
  /** AI configuration key-value pairs */
  config: Record<string, string>;
  /** Whether the config is currently being fetched */
  loadingConfig: boolean;
  /** Fetch the current AI configuration from the server */
  fetchConfig: () => Promise<void>;
  /** Save updated configuration values (partial update, merges with existing) */
  saveConfig: (updates: Record<string, string>) => Promise<void>;

  // ---- Usage ----
  /** Usage analytics data (array of daily aggregated stats) */
  usageStats: UsageStat[];
  /** Whether usage data is currently being fetched */
  loadingUsage: boolean;
  /** Fetch usage data with optional filters */
  fetchUsage: (params?: {
    from?: number;
    to?: number;
    userId?: string;
    apiType?: string;
  }) => Promise<void>;

  // ---- System Stats ----
  /** System-wide statistics (total users, projects, storage) */
  systemStats: SystemStats | null;
  /** Fetch system-wide statistics */
  fetchSystemStats: () => Promise<void>;

  // ---- Error handling ----
  /** Last error message (cleared on successful fetch) */
  error: string | null;
  /** Clear the current error */
  clearError: () => void;
}

// =============================================================================
// API BASE
// =============================================================================

const API_BASE = '/api/v2';

// =============================================================================
// STORE CREATION
// =============================================================================

/**
 * useAdminStore
 *
 * The Zustand store for admin panel state. Unlike the auth or image gen stores,
 * this store is NOT persisted to localStorage. Admin data is always fetched
 * fresh from the server to ensure accuracy.
 *
 * USAGE:
 *   import { useAdminStore } from '@stores/useAdminStore';
 *
 *   // In a component:
 *   const { users, loadingUsers, fetchUsers } = useAdminStore();
 *
 *   // On mount:
 *   useEffect(() => { fetchUsers(); }, []);
 */
export const useAdminStore = create<AdminStore>((set, get) => ({
  // ---- Initial State ----
  users: [],
  loadingUsers: false,
  config: {},
  loadingConfig: false,
  usageStats: [],
  loadingUsage: false,
  systemStats: null,
  error: null,

  clearError: () => set({ error: null }),

  // =========================================================================
  // USER MANAGEMENT
  // =========================================================================

  /**
   * FETCH USERS
   * Retrieves the full list of users with their limits and today's usage.
   * Uses authFetch for automatic token management.
   *
   * The server returns users sorted by creation date (newest first).
   * Each user includes their current limits and aggregated usage for today.
   */
  fetchUsers: async () => {
    set({ loadingUsers: true, error: null });
    try {
      const response = await authFetch(`${API_BASE}/admin/users`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to fetch users (HTTP ${response.status})`);
      }
      const data = await response.json();
      set({ users: data.users || data, loadingUsers: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      console.error('[AdminStore] fetchUsers failed:', err);
      set({ loadingUsers: false, error: message });
    }
  },

  /**
   * UPDATE USER LIMITS
   * Sends a partial limits update for a specific user. The server merges
   * the provided fields with the user's existing limits.
   *
   * After a successful update, the local user list is updated optimistically
   * to reflect the change without requiring a full re-fetch.
   *
   * @param userId - The ID of the user to update
   * @param limits - Partial limits object with only the fields to change
   */
  updateUserLimits: async (userId: string, limits: Partial<UserLimits>) => {
    set({ error: null });
    try {
      const response = await authFetch(`${API_BASE}/admin/users/${userId}/limits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(limits),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to update user (HTTP ${response.status})`);
      }
      // Optimistic local update — merge the new limits into the existing user
      set((state) => ({
        users: state.users.map((u) =>
          u.id === userId
            ? { ...u, limits: { ...u.limits, ...limits } }
            : u
        ),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user limits';
      console.error('[AdminStore] updateUserLimits failed:', err);
      set({ error: message });
      throw err; // Re-throw so the UI component can handle it
    }
  },

  /**
   * DELETE USER
   * Permanently deletes a user account from the system.
   *
   * After successful deletion, removes the user from the local list.
   * The server also cleans up all associated data (projects, usage records, etc.).
   *
   * @param userId - The ID of the user to delete
   */
  deleteUser: async (userId: string) => {
    set({ error: null });
    try {
      const response = await authFetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to delete user (HTTP ${response.status})`);
      }
      // Remove from local state
      set((state) => ({
        users: state.users.filter((u) => u.id !== userId),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user';
      console.error('[AdminStore] deleteUser failed:', err);
      set({ error: message });
      throw err;
    }
  },

  // =========================================================================
  // AI CONFIGURATION
  // =========================================================================

  /**
   * FETCH CONFIG
   * Retrieves the current AI configuration from the server.
   * Returns a flat key-value map of config settings.
   *
   * Config keys include:
   *   image_provider, image_model, image_api_key, image_endpoint,
   *   image_google_api_key, llm_provider, llm_model, llm_api_key,
   *   llm_endpoint, tts_model, tts_api_key, tts_voice,
   *   default_image_style
   */
  fetchConfig: async () => {
    set({ loadingConfig: true, error: null });
    try {
      // Fetch from admin endpoint which returns all config with masked secrets
      const response = await authFetch(`${API_BASE}/admin/config`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to fetch config (HTTP ${response.status})`);
      }
      const data = await response.json();
      // Admin endpoint returns { config: [{ key, value, isSecret, ... }] }
      // Convert array to flat key-value map for local editing
      const configMap: Record<string, string> = {};
      if (Array.isArray(data.config)) {
        for (const item of data.config) {
          configMap[item.key] = item.value || '';
        }
      } else if (data.config && typeof data.config === 'object') {
        Object.assign(configMap, data.config);
      }
      set({ config: configMap, loadingConfig: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch AI config';
      console.error('[AdminStore] fetchConfig failed:', err);
      set({ loadingConfig: false, error: message });
    }
  },

  /**
   * SAVE CONFIG
   * Updates AI configuration values on the server. Only the provided keys
   * are updated; existing keys not in the update are left unchanged.
   *
   * After successful save, merges the updates into the local config state.
   *
   * @param updates - Key-value pairs to update
   */
  saveConfig: async (updates: Record<string, string>) => {
    set({ error: null });
    try {
      const response = await authFetch(`${API_BASE}/admin/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: updates }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to save config (HTTP ${response.status})`);
      }
      // Merge updates into local config
      set((state) => ({
        config: { ...state.config, ...updates },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save AI config';
      console.error('[AdminStore] saveConfig failed:', err);
      set({ error: message });
      throw err;
    }
  },

  // =========================================================================
  // USAGE ANALYTICS
  // =========================================================================

  /**
   * FETCH USAGE
   * Retrieves aggregated usage data with optional filters.
   *
   * The server returns daily aggregated stats that can be filtered by:
   *   - Date range (from/to as Unix timestamps in milliseconds)
   *   - User ID (filter to a specific user)
   *   - API type (e.g., "llm", "image", "tts")
   *
   * @param params - Optional filter parameters
   */
  fetchUsage: async (params) => {
    set({ loadingUsage: true, error: null });
    try {
      const searchParams = new URLSearchParams();
      if (params?.from) searchParams.set('from', String(params.from));
      if (params?.to) searchParams.set('to', String(params.to));
      if (params?.userId) searchParams.set('userId', params.userId);
      if (params?.apiType) searchParams.set('apiType', params.apiType);

      const queryString = searchParams.toString();
      const url = `${API_BASE}/admin/usage${queryString ? `?${queryString}` : ''}`;

      const response = await authFetch(url);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to fetch usage (HTTP ${response.status})`);
      }
      const data = await response.json();
      // The API returns { summary, byUser, byType }. Store the full response
      // and let components pick what they need.
      set({ usageStats: data, loadingUsage: false } as any);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch usage data';
      console.error('[AdminStore] fetchUsage failed:', err);
      set({ loadingUsage: false, error: message });
    }
  },

  // =========================================================================
  // SYSTEM STATISTICS
  // =========================================================================

  /**
   * FETCH SYSTEM STATS
   * Retrieves high-level system statistics: total users, total projects,
   * and total storage used across all users.
   *
   * These are displayed on the admin dashboard overview page.
   */
  fetchSystemStats: async () => {
    set({ error: null });
    try {
      const response = await authFetch(`${API_BASE}/admin/stats`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Failed to fetch stats (HTTP ${response.status})`);
      }
      const data = await response.json();
      set({
        systemStats: {
          totalUsers: data.totalUsers ?? 0,
          totalProjects: data.totalProjects ?? 0,
          storageBytes: data.storageBytes ?? 0,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch system stats';
      console.error('[AdminStore] fetchSystemStats failed:', err);
      set({ error: message });
    }
  },
}));

export default useAdminStore;
