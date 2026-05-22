/**
 * =============================================================================
 * ADMIN DASHBOARD COMPONENT
 * =============================================================================
 *
 * The main admin overview page at /admin. Displays:
 * - System-wide statistics cards (total users, projects, storage)
 * - Today's aggregated usage summary (LLM tokens, images, TTS seconds)
 *
 * DATA FLOW:
 * On mount, fetches system stats and today's usage from the server.
 * Data is managed by the useAdminStore Zustand store.
 *
 * LAYOUT:
 * +------------------------------------------------------+
 * | Admin Dashboard                                       |
 * +------------------+------------------+------------------+
 * | Total Users      | Total Projects   | Storage Used     |
 * |      42          |      156         |    2.3 GB        |
 * +------------------+------------------+------------------+
 * | Today's Usage                                         |
 * +------------------+------------------+------------------+
 * | LLM Tokens       | Images Generated | TTS Seconds      |
 * |   1,234,567      |      89          |    1,240         |
 * +------------------+------------------+------------------+
 *
 * =============================================================================
 */

import { useEffect, useMemo } from 'react';
import {
  Users,
  FolderOpen,
  HardDrive,
  MessageSquare,
  Image,
  Volume2,
  RefreshCw,
} from 'lucide-react';
import { useAdminStore } from '@stores/useAdminStore';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * FORMAT BYTES
 * Converts a byte count to a human-readable string with appropriate units.
 *
 * Examples:
 *   formatBytes(0)          -> "0 Bytes"
 *   formatBytes(1024)       -> "1.0 KB"
 *   formatBytes(1048576)    -> "1.0 MB"
 *   formatBytes(2500000000) -> "2.3 GB"
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * FORMAT NUMBER
 * Formats a number with locale-appropriate thousand separators.
 *
 * Examples:
 *   formatNumber(1234567) -> "1,234,567"
 *   formatNumber(0)       -> "0"
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * AdminDashboard
 *
 * Overview page for the admin panel. Shows system statistics and today's
 * usage in a card-based layout.
 *
 * Fetches data on mount and provides a manual refresh button for live updates.
 */
export default function AdminDashboard() {
  const {
    systemStats,
    fetchSystemStats,
    users,
    fetchUsers,
    usageStats,
    fetchUsage,
    loadingUsers,
    loadingUsage,
    error,
    clearError,
  } = useAdminStore();

  /**
   * INITIAL DATA FETCH
   * Load system stats, users, and today's usage on mount.
   * Users are fetched because their today_usage fields are used
   * to compute the aggregated usage summary.
   */
  useEffect(() => {
    fetchSystemStats();
    fetchUsers();
    // Fetch today's usage by setting from/to to today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    fetchUsage({ from: todayStart.getTime(), to: todayEnd.getTime() });
  }, []);

  /**
   * COMPUTE TODAY'S USAGE TOTALS
   * Aggregate usage_today across all users for the summary cards.
   * This is computed client-side from the users array.
   */
  const todayUsage = useMemo(() => {
    let llmTokens = 0;
    let images = 0;
    let ttsSeconds = 0;

    for (const user of users) {
      if (user.todayUsage) {
        llmTokens += user.todayUsage.llmTokens || 0;
        images += user.todayUsage.images || 0;
        ttsSeconds += user.todayUsage.ttsSeconds || 0;
      }
    }

    return { llmTokens, images, ttsSeconds };
  }, [users]);

  /**
   * HANDLE REFRESH
   * Manually reload all dashboard data. Useful for monitoring live usage
   * without navigating away.
   */
  function handleRefresh() {
    fetchSystemStats();
    fetchUsers();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    fetchUsage({ from: todayStart.getTime(), to: todayEnd.getTime() });
  }

  const isLoading = loadingUsers || loadingUsage;

  return (
    <div className="p-8">
      {/* ==================== HEADER ==================== */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            System overview and today's usage
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
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

      {/* ==================== SYSTEM STATS CARDS ==================== */}
      <h2 className="text-lg font-semibold text-white mb-4">System Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Total Users Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {systemStats ? formatNumber(systemStats.totalUsers) : '--'}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Users</div>
        </div>

        {/* Total Projects Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {systemStats ? formatNumber(systemStats.totalProjects) : '--'}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Projects</div>
        </div>

        {/* Storage Used Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {systemStats ? formatBytes(systemStats.storageBytes) : '--'}
          </div>
          <div className="text-sm text-gray-400 mt-1">Storage Used</div>
        </div>
      </div>

      {/* ==================== TODAY'S USAGE CARDS ==================== */}
      <h2 className="text-lg font-semibold text-white mb-4">Today's Usage</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* LLM Tokens Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {loadingUsers ? '--' : formatNumber(todayUsage.llmTokens)}
          </div>
          <div className="text-sm text-gray-400 mt-1">LLM Tokens</div>
        </div>

        {/* Images Generated Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-pink-500/15 flex items-center justify-center">
              <Image className="w-5 h-5 text-pink-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {loadingUsers ? '--' : formatNumber(todayUsage.images)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Images Generated</div>
        </div>

        {/* TTS Seconds Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-teal-500/15 flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-teal-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white">
            {loadingUsers ? '--' : formatNumber(todayUsage.ttsSeconds)}
          </div>
          <div className="text-sm text-gray-400 mt-1">TTS Seconds</div>
        </div>
      </div>
    </div>
  );
}
