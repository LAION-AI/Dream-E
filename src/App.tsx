/**
 * =============================================================================
 * APP COMPONENT - ROOT APPLICATION COMPONENT
 * =============================================================================
 *
 * This is the root component of Dream-E. It sets up:
 * 1. React Router for navigation between pages
 * 2. Global providers (context providers for state)
 * 3. The main layout structure
 *
 * COMPONENT HIERARCHY:
 * App
 * ├── BrowserRouter (handles URL-based navigation)
 * │   ├── Routes (defines which component shows for which URL)
 * │   │   ├── "/" -> StartMenu (mode selection)
 * │   │   ├── "/game" -> Dashboard (Game Mode projects)
 * │   │   ├── "/cowrite" -> Dashboard (Co-Writing Mode projects)
 * │   │   ├── "/edit/:id" -> Editor (node canvas)
 * │   │   ├── "/play/:id" -> Player (game runtime)
 * │   │   ├── "/cowrite/edit/:id" -> Editor (co-writing canvas)
 * │   │   └── "/cowrite/play/:id" -> Player (co-writing playback)
 *
 * =============================================================================
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';

// Register the bunny scene injector on window (dev utility)
import '@/utils/injectBunnyScene';

// Components are loaded lazily to improve initial load time
// This means they're only downloaded when needed

/**
 * LAZY LOADING EXPLANATION
 * Instead of loading all pages at once, we load them on-demand.
 *
 * Without lazy loading:
 *   - User opens app
 *   - Browser downloads Dashboard + Editor + Player code
 *   - Slow initial load
 *
 * With lazy loading:
 *   - User opens app
 *   - Browser downloads only Dashboard code
 *   - Fast initial load
 *   - Editor code downloads when user clicks "Edit"
 */
const StartMenu = lazy(() => import('@components/startmenu/StartMenu'));
const Dashboard = lazy(() => import('@components/dashboard/Dashboard'));
const Editor = lazy(() => import('@components/editor/Editor'));
const Player = lazy(() => import('@components/player/AdventureEngine'));

/**
 * LOADING FALLBACK COMPONENT
 * Shown while lazy-loaded components are being downloaded.
 *
 * This provides visual feedback so users know the app is working,
 * not frozen.
 */
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-editor-bg">
      {/* Animated loading spinner */}
      <div className="flex flex-col items-center gap-4">
        {/* Spinner animation using Tailwind */}
        <div className="w-12 h-12 border-4 border-editor-border border-t-editor-accent rounded-full animate-spin" />
        {/* Loading text */}
        <p className="text-editor-muted text-sm">Loading...</p>
      </div>
    </div>
  );
}

/**
 * ERROR BOUNDARY FALLBACK
 * Shown when a route fails to load.
 *
 * WHY MIGHT A ROUTE FAIL?
 * - Network error while downloading the chunk
 * - JavaScript error in the component
 * - Browser incompatibility
 */
function ErrorFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-editor-bg">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-error mb-4">
          Something went wrong
        </h1>
        <p className="text-editor-muted mb-6">
          Failed to load this page. Please try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

/**
 * NOT FOUND PAGE
 * Shown when the URL doesn't match any defined route.
 */
function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-editor-bg">
      <div className="text-center p-8">
        <h1 className="text-6xl font-bold text-editor-accent mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-editor-text mb-4">
          Page Not Found
        </h2>
        <p className="text-editor-muted mb-6">
          The page you're looking for doesn't exist.
        </p>
        <a href="/" className="btn-primary inline-block">
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

/**
 * MAIN APP COMPONENT
 * Sets up routing and wraps the application with necessary providers.
 */
function App() {
  return (
    /**
     * BROWSER ROUTER
     * Enables client-side routing using the browser's History API.
     *
     * How it works:
     * - Intercepts link clicks and navigation
     * - Updates the URL without full page reload
     * - Renders the correct component for the URL
     */
    <BrowserRouter>
      {/**
       * SUSPENSE
       * Handles the loading state for lazy-loaded components.
       *
       * When a lazy component is loading:
       * 1. React "suspends" rendering
       * 2. Shows the fallback component
       * 3. When loaded, swaps in the real component
       */}
      <Suspense fallback={<LoadingFallback />}>
        {/**
         * ROUTES
         * Defines the URL-to-component mapping.
         *
         * The Routes component:
         * - Looks at the current URL
         * - Finds the matching Route
         * - Renders that Route's element
         */}
        <Routes>
          {/**
           * START MENU ROUTE (Landing Page)
           * URL: /
           * Shows the mode selection screen (Game Mode vs Co-Writing Mode).
           */}
          <Route path="/" element={<StartMenu />} />

          {/**
           * GAME MODE DASHBOARD
           * URL: /game
           * Shows the project manager filtered to Game Mode projects.
           */}
          <Route path="/game" element={<Dashboard mode="game" />} />

          {/**
           * CO-WRITING MODE DASHBOARD
           * URL: /cowrite
           * Shows the project manager filtered to Co-Writing Mode projects.
           */}
          <Route path="/cowrite" element={<Dashboard mode="cowrite" />} />

          {/**
           * LEGACY REDIRECT: /dashboard → /game
           * Maintains backwards compatibility for bookmarks or hardcoded links.
           */}
          <Route path="/dashboard" element={<Navigate to="/game" replace />} />

          {/**
           * GAME MODE EDITOR ROUTE
           * URL: /edit/:projectId
           * The :projectId is a dynamic parameter.
           *
           * Examples:
           * - /edit/project-abc-123 -> Opens project "project-abc-123"
           * - /edit/my-cool-game -> Opens project "my-cool-game"
           *
           * The Editor component can access this ID using useParams()
           */}
          <Route path="/edit/:projectId" element={<Editor />} />

          {/**
           * GAME MODE PLAYER ROUTE
           * URL: /play/:projectId
           * Runs the game for the specified project.
           */}
          <Route path="/play/:projectId" element={<Player />} />

          {/**
           * CO-WRITING MODE EDITOR ROUTE
           * URL: /cowrite/edit/:projectId
           * Same Editor component, but the /cowrite prefix tells navigation
           * to return to the Co-Writing dashboard instead of Game dashboard.
           */}
          <Route path="/cowrite/edit/:projectId" element={<Editor />} />

          {/**
           * CO-WRITING MODE PLAYER ROUTE
           * URL: /cowrite/play/:projectId
           * Same Player component, with /cowrite prefix for correct back-nav.
           */}
          <Route path="/cowrite/play/:projectId" element={<Player />} />

          {/**
           * CATCH-ALL ROUTE (404)
           * URL: anything that doesn't match above
           * Shows the "Not Found" page.
           *
           * The * path matches anything, so it must be last!
           */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

// Export the App component as the default export
// This is imported by main.tsx to render the application
export default App;
