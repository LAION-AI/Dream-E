/**
 * =============================================================================
 * ADMIN USERS COMPONENT
 * =============================================================================
 *
 * User management page at /admin/users. Provides:
 * - Searchable table of all registered users
 * - Inline-editable limits (click a value to edit, press Enter or blur to save)
 * - Toggle switches for Active/Inactive and Admin/Regular status
 * - Delete button with confirmation prompt
 * - Real-time usage display (today's LLM tokens, images, TTS seconds)
 *
 * TABLE COLUMNS:
 * | Email | Display Name | Projects | LLM Today | Images Today | TTS Today |
 * | Max Projects | Daily LLM | Daily Images | Daily TTS | Active | Admin | Actions |
 *
 * INLINE EDITING:
 * Numeric limit fields (max_projects, daily_llm_tokens, daily_images,
 * daily_tts_seconds) are editable inline. Click the value to switch to an
 * input field. Press Enter or click away to save. Press Escape to cancel.
 *
 * =============================================================================
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Trash2, RefreshCw } from 'lucide-react';
import { useAdminStore, type AdminUser, type UserLimits } from '@stores/useAdminStore';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * FORMAT NUMBER
 * Formats a number with locale-appropriate separators for display.
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

// =============================================================================
// INLINE EDITABLE CELL COMPONENT
// =============================================================================

/**
 * INLINE EDITABLE CELL PROPS
 * Defines the interface for a table cell that can be clicked to edit.
 */
interface EditableCellProps {
  /** The current numeric value to display */
  value: number;
  /** Callback when the user commits a new value */
  onSave: (newValue: number) => void;
  /** Optional CSS class for the container */
  className?: string;
}

/**
 * EditableCell
 *
 * A table cell that displays a formatted number and switches to an input
 * field when clicked. The user can:
 *   - Press Enter to save the new value
 *   - Press Escape to cancel editing
 *   - Click away (blur) to save the new value
 *
 * The component manages its own editing state to minimize re-renders.
 * Only the specific cell that's being edited re-renders.
 */
function EditableCell({ value, onSave, className = '' }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * When entering edit mode, pre-populate with the current value
   * and auto-focus the input field.
   */
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  /**
   * HANDLE SAVE
   * Parse the input value, validate it, and call the onSave callback.
   * Falls back to the original value if parsing fails.
   */
  function handleSave() {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed !== value) {
      onSave(parsed);
    }
    setIsEditing(false);
  }

  /**
   * HANDLE KEY DOWN
   * Enter saves, Escape cancels.
   */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(String(value));
      setIsEditing(false);
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`w-24 bg-gray-700 border border-blue-500 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
      />
    );
  }

  return (
    <span
      onClick={() => {
        setEditValue(String(value));
        setIsEditing(true);
      }}
      className={`cursor-pointer hover:bg-gray-700 rounded px-2 py-1 transition-colors ${className}`}
      title="Click to edit"
    >
      {formatNumber(value)}
    </span>
  );
}

// =============================================================================
// TOGGLE SWITCH COMPONENT
// =============================================================================

interface ToggleSwitchProps {
  /** Whether the toggle is in the "on" position */
  checked: boolean;
  /** Callback when the toggle state changes */
  onChange: (checked: boolean) => void;
  /** Color when toggled on (Tailwind color class without 'bg-' prefix) */
  activeColor?: string;
  /** Accessible label for screen readers */
  label: string;
}

/**
 * ToggleSwitch
 *
 * A compact toggle switch styled to match the admin panel's dark theme.
 * Used for binary fields like is_active and is_admin.
 */
function ToggleSwitch({ checked, onChange, activeColor = 'blue-500', label }: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
        checked ? `bg-${activeColor}` : 'bg-gray-600'
      }`}
      style={checked ? { backgroundColor: activeColor === 'blue-500' ? '#3b82f6' : activeColor === 'green-500' ? '#22c55e' : '#3b82f6' } : undefined}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * AdminUsers
 *
 * Full user management page. Fetches the user list on mount and provides
 * inline editing, toggle switches, and delete functionality for each user.
 *
 * Search filters users by email or display name (client-side filtering).
 */
export default function AdminUsers() {
  const {
    users,
    loadingUsers,
    fetchUsers,
    updateUserLimits,
    deleteUser,
    error,
    clearError,
  } = useAdminStore();

  /** Search query for filtering users */
  const [searchQuery, setSearchQuery] = useState('');

  /** ID of the user pending deletion (shows confirm dialog) */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  /** Whether a delete operation is in progress */
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * INITIAL DATA FETCH
   * Load users on mount.
   */
  useEffect(() => {
    fetchUsers();
  }, []);

  /**
   * FILTER USERS
   * Client-side search filter. Matches against email and display_name
   * (case-insensitive). Runs on every render for simplicity since the
   * user list is typically small (< 1000 users).
   */
  const filteredUsers = searchQuery
    ? users.filter((u) => {
        const q = searchQuery.toLowerCase();
        return (
          u.email.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q)
        );
      })
    : users;

  /**
   * HANDLE LIMIT UPDATE
   * Called by EditableCell components when a limit value is changed.
   * Sends the update to the server via the admin store.
   *
   * @param userId - The user to update
   * @param field - The limit field name
   * @param value - The new numeric value
   */
  const handleLimitUpdate = useCallback(
    async (userId: string, field: keyof UserLimits, value: number) => {
      try {
        await updateUserLimits(userId, { [field]: value });
      } catch {
        // Error is already set in the store
      }
    },
    [updateUserLimits]
  );

  /**
   * HANDLE TOGGLE
   * Called when an Active or Admin toggle switch is changed.
   * Converts boolean to number (1/0) for the server.
   *
   * @param userId - The user to update
   * @param field - 'is_active' or 'is_admin'
   * @param checked - The new boolean state
   */
  const handleToggle = useCallback(
    async (userId: string, field: 'is_active' | 'is_admin', checked: boolean) => {
      try {
        await updateUserLimits(userId, { [field]: checked ? 1 : 0 });
      } catch {
        // Error is already set in the store
      }
    },
    [updateUserLimits]
  );

  /**
   * HANDLE DELETE
   * Confirms and executes user deletion.
   */
  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await deleteUser(pendingDeleteId);
      setPendingDeleteId(null);
    } catch {
      // Error is already set in the store
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="p-8">
      {/* ==================== HEADER ==================== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-gray-400 text-sm mt-1">
            {users.length} registered user{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => fetchUsers()}
          disabled={loadingUsers}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loadingUsers ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ==================== ERROR BANNER ==================== */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
          <button onClick={clearError} className="ml-4 underline text-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* ==================== SEARCH BAR ==================== */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by email or name..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* ==================== USERS TABLE ==================== */}
      {loadingUsers && users.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            {/* Table Header */}
            <thead>
              <tr className="bg-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Display Name</th>
                <th className="px-4 py-3 font-medium text-right">Projects</th>
                <th className="px-4 py-3 font-medium text-right">LLM Today</th>
                <th className="px-4 py-3 font-medium text-right">Images Today</th>
                <th className="px-4 py-3 font-medium text-right">TTS Today</th>
                <th className="px-4 py-3 font-medium text-right">Max Projects</th>
                <th className="px-4 py-3 font-medium text-right">Daily LLM</th>
                <th className="px-4 py-3 font-medium text-right">Daily Images</th>
                <th className="px-4 py-3 font-medium text-right">Daily TTS</th>
                <th className="px-4 py-3 font-medium text-center">Active</th>
                <th className="px-4 py-3 font-medium text-center">Admin</th>
                <th className="px-4 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-gray-700/50">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-gray-500">
                    {searchQuery
                      ? `No users matching "${searchQuery}"`
                      : 'No users found'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onLimitUpdate={handleLimitUpdate}
                    onToggle={handleToggle}
                    onDelete={() => setPendingDeleteId(user.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== DELETE CONFIRMATION OVERLAY ==================== */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">
              Delete User
            </h3>
            <p className="text-gray-400 text-sm mb-1">
              Are you sure you want to permanently delete this user?
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Email: {users.find((u) => u.id === pendingDeleteId)?.email || pendingDeleteId}
            </p>
            <p className="text-red-400 text-sm mb-6">
              This action cannot be undone. All user data, projects, and usage
              history will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingDeleteId(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// USER ROW COMPONENT
// =============================================================================

interface UserRowProps {
  user: AdminUser;
  onLimitUpdate: (userId: string, field: keyof UserLimits, value: number) => void;
  onToggle: (userId: string, field: 'is_active' | 'is_admin', checked: boolean) => void;
  onDelete: () => void;
}

/**
 * UserRow
 *
 * A single row in the users table. Extracted as a separate component to
 * minimize re-renders when editing a cell in one row — only that row
 * re-renders, not the entire table.
 *
 * Displays:
 * - User info (email, display name, project count)
 * - Today's usage stats
 * - Editable limit fields
 * - Toggle switches for active/admin status
 * - Delete button
 */
function UserRow({ user, onLimitUpdate, onToggle, onDelete }: UserRowProps) {
  return (
    <tr className="hover:bg-gray-700/30 transition-colors">
      {/* Email */}
      <td className="px-4 py-3 text-white font-medium">
        <div className="max-w-[200px] truncate" title={user.email}>
          {user.email}
        </div>
      </td>

      {/* Display Name */}
      <td className="px-4 py-3 text-gray-300">
        {user.displayName || '--'}
      </td>

      {/* Project Count */}
      <td className="px-4 py-3 text-gray-300 text-right">
        {user.projectCount}
      </td>

      {/* Today's Usage - LLM Tokens */}
      <td className="px-4 py-3 text-gray-400 text-right">
        {formatNumber(user.todayUsage?.llmTokens || 0)}
      </td>

      {/* Today's Usage - Images */}
      <td className="px-4 py-3 text-gray-400 text-right">
        {formatNumber(user.todayUsage?.images || 0)}
      </td>

      {/* Today's Usage - TTS Seconds */}
      <td className="px-4 py-3 text-gray-400 text-right">
        {formatNumber(user.todayUsage?.ttsSeconds || 0)}
      </td>

      {/* Editable Limits - Max Projects */}
      <td className="px-4 py-3 text-right">
        <EditableCell
          value={user.limits.maxProjects}
          onSave={(val) => onLimitUpdate(user.id, 'maxProjects' as any, val)}
        />
      </td>

      {/* Editable Limits - Daily LLM Tokens */}
      <td className="px-4 py-3 text-right">
        <EditableCell
          value={user.limits.dailyLlmTokens}
          onSave={(val) => onLimitUpdate(user.id, 'dailyLlmTokens' as any, val)}
        />
      </td>

      {/* Editable Limits - Daily Images */}
      <td className="px-4 py-3 text-right">
        <EditableCell
          value={user.limits.dailyImages}
          onSave={(val) => onLimitUpdate(user.id, 'dailyImages' as any, val)}
        />
      </td>

      {/* Editable Limits - Daily TTS Seconds */}
      <td className="px-4 py-3 text-right">
        <EditableCell
          value={user.limits.dailyTtsSeconds}
          onSave={(val) => onLimitUpdate(user.id, 'dailyTtsSeconds' as any, val)}
        />
      </td>

      {/* Active Toggle */}
      <td className="px-4 py-3 text-center">
        <ToggleSwitch
          checked={!!user.limits.isActive}
          onChange={(checked) => onToggle(user.id, 'is_active', checked)}
          activeColor="green-500"
          label={`Toggle active status for ${user.email}`}
        />
      </td>

      {/* Admin Toggle */}
      <td className="px-4 py-3 text-center">
        <ToggleSwitch
          checked={!!user.limits.isAdmin}
          onChange={(checked) => onToggle(user.id, 'is_admin', checked)}
          activeColor="blue-500"
          label={`Toggle admin status for ${user.email}`}
        />
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-center">
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title={`Delete ${user.email}`}
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
}
