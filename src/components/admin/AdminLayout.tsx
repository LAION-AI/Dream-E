/**
 * =============================================================================
 * ADMIN LAYOUT COMPONENT
 * =============================================================================
 *
 * Provides the shared layout for all admin panel pages. Includes:
 * - A sidebar with navigation links to each admin section
 * - A main content area that renders child routes via <Outlet />
 * - Admin-only access guard (redirects non-admins to the home page)
 * - Back button to return to the main Dream-E application
 *
 * ROUTE STRUCTURE:
 *   /admin           -> AdminDashboard (overview)
 *   /admin/users     -> AdminUsers (user management)
 *   /admin/config    -> AdminConfig (AI configuration)
 *   /admin/usage     -> AdminUsage (usage analytics)
 *
 * ACCESS CONTROL:
 * On mount, the component calls /api/v2/auth/me to check if the current
 * user has admin privileges. If not, it redirects to '/'. This is a
 * client-side guard; the server also enforces admin-only access on all
 * /api/v2/admin/* endpoints.
 *
 * =============================================================================
 */

import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Settings,
  BarChart3,
  ArrowLeft,
  Shield,
} from 'lucide-react';
import { authFetch } from '@services/authService';

// =============================================================================
// NAVIGATION ITEMS
// =============================================================================

/**
 * Sidebar navigation items. Each item maps to an admin route.
 * The `end` prop on NavLink ensures exact matching for the index route.
 */
const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users, end: false },
  { to: '/admin/config', label: 'AI Config', icon: Settings, end: false },
  { to: '/admin/usage', label: 'Usage', icon: BarChart3, end: false },
] as const;

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * AdminLayout
 *
 * Wraps all admin pages in a consistent layout with sidebar navigation.
 * Checks admin privileges on mount and redirects non-admins.
 *
 * The layout uses the same dark theme as the rest of Dream-E
 * (bg-gray-900 background, gray-800 sidebar, white text) to maintain
 * visual consistency.
 */
export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Admin verification state.
   * - 'checking': Initial state, verifying admin status with the server
   * - 'authorized': User is confirmed as admin, show the admin panel
   * - 'unauthorized': User is not admin, redirect is in progress
   */
  const [authStatus, setAuthStatus] = useState<'checking' | 'authorized' | 'unauthorized'>('checking');

  /**
   * CHECK ADMIN PRIVILEGES
   * On mount, call /api/v2/auth/me to verify the user is an admin.
   * The server response includes is_admin flag. If the user is not an admin,
   * redirect them back to the home page.
   *
   * This is a client-side convenience guard. The server also enforces
   * admin-only access on all /api/v2/admin/* endpoints, so even if someone
   * bypasses this check, the API calls will fail with 403.
   */
  useEffect(() => {
    let cancelled = false;

    async function checkAdmin() {
      try {
        const response = await authFetch('/api/v2/auth/me');
        if (!response.ok) {
          if (!cancelled) {
            setAuthStatus('unauthorized');
            navigate('/');
          }
          return;
        }

        const data = await response.json();
        // The server includes is_admin in the /me response for admin users.
        // It may be a number (1/0) or boolean — handle both.
        const isAdmin = data.user?.is_admin || data.is_admin;
        if (!cancelled) {
          if (isAdmin) {
            setAuthStatus('authorized');
          } else {
            setAuthStatus('unauthorized');
            navigate('/');
          }
        }
      } catch {
        if (!cancelled) {
          setAuthStatus('unauthorized');
          navigate('/');
        }
      }
    }

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // ---- Loading state: checking admin privileges ----
  if (authStatus === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  // ---- Unauthorized: render nothing (redirect is happening) ----
  if (authStatus === 'unauthorized') {
    return null;
  }

  // ---- Authorized: render the admin layout ----
  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* ==================== SIDEBAR ==================== */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0">
        {/* Logo / Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white">Dream-E</h1>
              <p className="text-xs text-gray-400">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-400'
                        : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                    }`
                  }
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Back to App */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-700/50 hover:text-gray-200 transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Back to App</span>
          </button>
        </div>
      </aside>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
