/**
 * =============================================================================
 * ADMIN USAGE COMPONENT
 * =============================================================================
 *
 * Usage analytics page at /admin/usage. Displays aggregated AI usage data
 * with filtering capabilities:
 * - Date range picker (from/to)
 * - API type filter dropdown (all, llm, image, tts)
 * - Sortable table showing daily aggregated usage
 * - Totals row at the bottom
 *
 * DATA FLOW:
 * Fetches usage data from /api/v2/admin/usage with query parameters.
 * Data is managed by the useAdminStore Zustand store.
 *
 * TABLE COLUMNS:
 * | Date | User | API Type | Provider | Tokens | Images | TTS (s) | Cost ($) |
 *
 * LAYOUT:
 * +--------------------------------------------------------------+
 * | Usage Analytics                                               |
 * +--------------------------------------------------------------+
 * | From: [date]  To: [date]  Type: [dropdown]  [Search]         |
 * +--------------------------------------------------------------+
 * | Date    | User  | Type  | Provider | Tokens | Imgs | TTS | $ |
 * |---------|-------|-------|----------|--------|------|-----|---|
 * | 2026-04 | admin | llm   | gemini   | 50000  |  0   |  0  | 2 |
 * | ...     | ...   | ...   | ...      | ...    | ...  | ... |...|
 * +---------|-------|-------|----------|--------|------|-----|---+
 * | TOTAL   |       |       |          | 500000 | 150  | 800 |32 |
 * +--------------------------------------------------------------+
 *
 * =============================================================================
 */

import { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Calendar } from 'lucide-react';
import { useAdminStore, type UsageStat } from '@stores/useAdminStore';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * FORMAT DATE FOR INPUT
 * Converts a Date object to YYYY-MM-DD string for <input type="date">.
 */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * FORMAT NUMBER
 * Formats a number with locale-appropriate separators.
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * FORMAT COST
 * Formats a cost value as USD with 2 decimal places.
 */
function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * GET DEFAULT DATE RANGE
 * Returns the start of the current month and today's date as defaults
 * for the date range picker. This gives a reasonable initial view
 * without requiring the user to set dates.
 */
function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: toDateString(firstOfMonth),
    to: toDateString(now),
  };
}

// =============================================================================
// API TYPE OPTIONS
// =============================================================================

/**
 * Available API type filter options. 'all' fetches data for all types.
 */
const API_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'llm', label: 'LLM' },
  { value: 'image', label: 'Image Generation' },
  { value: 'tts', label: 'TTS' },
];

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * AdminUsage
 *
 * Usage analytics page with date range filtering, API type filtering,
 * and a summary table with totals.
 */
export default function AdminUsage() {
  const {
    usageStats,
    loadingUsage,
    fetchUsage,
    error,
    clearError,
  } = useAdminStore();

  /** Date range state (YYYY-MM-DD strings for <input type="date">) */
  const defaultRange = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);

  /** API type filter */
  const [apiTypeFilter, setApiTypeFilter] = useState('');

  /**
   * INITIAL DATA FETCH
   * Load usage data on mount with the default date range.
   */
  useEffect(() => {
    handleSearch();
  }, []);

  /**
   * HANDLE SEARCH
   * Fetches usage data with the current filter parameters.
   * Converts date strings to Unix timestamps for the API.
   */
  function handleSearch() {
    const params: {
      from?: number;
      to?: number;
      apiType?: string;
    } = {};

    if (dateFrom) {
      // Start of the "from" day (00:00:00.000)
      params.from = new Date(dateFrom).getTime();
    }
    if (dateTo) {
      // End of the "to" day (23:59:59.999)
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      params.to = toDate.getTime();
    }
    if (apiTypeFilter) {
      params.apiType = apiTypeFilter;
    }

    fetchUsage(params);
  }

  /**
   * PARSE API RESPONSE
   * The API returns { summary: {totalCalls, totalTokens, totalImages, totalAudioSeconds, totalCost}, byUser: [...], byType: [...] }
   * We display byUser as the main table and summary as totals.
   */
  const data = usageStats as any;
  const summary = data?.summary || { totalCalls: 0, totalTokens: 0, totalImages: 0, totalAudioSeconds: 0, totalCost: 0 };
  const byUser: Array<{ userId: string; email: string; calls: number; tokens: number; images: number; audioSeconds: number; cost: number }> = data?.byUser || [];
  const byType: Array<{ apiType: string; calls: number; tokens: number; images: number; audioSeconds: number; cost: number }> = data?.byType || [];

  const totals = useMemo(() => ({
    totalTokens: summary.totalTokens || 0,
    totalImages: summary.totalImages || 0,
    totalTtsSeconds: summary.totalAudioSeconds || 0,
    totalCost: summary.totalCost || 0,
    totalCalls: summary.totalCalls || 0,
  }), [summary]);

  return (
    <div className="p-8">
      {/* ==================== HEADER ==================== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Usage Analytics</h1>
          <p className="text-gray-400 text-sm mt-1">
            Daily aggregated AI usage across all users
          </p>
        </div>
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

      {/* ==================== FILTERS ==================== */}
      <div className="flex flex-wrap items-end gap-4 mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
        {/* Date From */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            From
          </label>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="pl-8 pr-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Date To */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            To
          </label>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="pl-8 pr-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* API Type Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            API Type
          </label>
          <select
            value={apiTypeFilter}
            onChange={(e) => setApiTypeFilter(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {API_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={loadingUsage}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loadingUsage ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Search size={16} />
          )}
          Search
        </button>
      </div>

      {/* ==================== USAGE TABLE ==================== */}
      {loadingUsage && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            {/* Table Header */}
            <thead>
              <tr className="bg-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium text-right">API Calls</th>
                <th className="px-4 py-3 font-medium text-right">Tokens</th>
                <th className="px-4 py-3 font-medium text-right">Images</th>
                <th className="px-4 py-3 font-medium text-right">TTS (s)</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-gray-700/50">
              {byUser.length === 0 && byType.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No usage data found for the selected filters.
                  </td>
                </tr>
              ) : (
                <>
                  {byUser.map((row, index) => (
                    <tr
                      key={`${row.userId}-${index}`}
                      className="hover:bg-gray-700/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-white">{row.email}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{formatNumber(row.calls)}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{formatNumber(row.tokens)}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{formatNumber(row.images)}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{formatNumber(row.audioSeconds)}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{formatCost(row.cost)}</td>
                    </tr>
                  ))}

                  {/* ==================== TOTALS ROW ==================== */}
                  <tr className="bg-gray-800/80 font-semibold">
                    <td className="px-4 py-3 text-white">TOTAL ({totals.totalCalls} calls)</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-white text-right">
                      {formatNumber(totals.totalTokens)}
                    </td>
                    <td className="px-4 py-3 text-white text-right">
                      {formatNumber(totals.totalImages)}
                    </td>
                    <td className="px-4 py-3 text-white text-right">
                      {formatNumber(totals.totalTtsSeconds)}
                    </td>
                    <td className="px-4 py-3 text-white text-right">
                      {formatCost(totals.totalCost)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// API TYPE BADGE COMPONENT
// =============================================================================

/**
 * ApiTypeBadge
 *
 * A small colored badge that displays the API type (llm, image, tts)
 * with color-coding for quick visual identification.
 */
function ApiTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    llm: 'bg-amber-500/15 text-amber-400',
    image: 'bg-pink-500/15 text-pink-400',
    tts: 'bg-teal-500/15 text-teal-400',
  };

  const colorClass = colorMap[type] || 'bg-gray-500/15 text-gray-400';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {type.toUpperCase()}
    </span>
  );
}
