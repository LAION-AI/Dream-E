/**
 * =============================================================================
 * MAIN ENTRY POINT - APPLICATION BOOTSTRAP
 * =============================================================================
 *
 * This is the first JavaScript/TypeScript file that runs when the app loads.
 * It's responsible for:
 * 1. Importing global styles
 * 2. Setting up React
 * 3. Mounting the app to the DOM
 *
 * WHAT IS "MOUNTING"?
 * React takes control of a DOM element (the #root div in index.html)
 * and manages everything inside it. This is called "mounting".
 *
 * =============================================================================
 */

// React core libraries
import React from 'react';
import ReactDOM from 'react-dom/client';

// Our root application component
import App from './App';

// Global styles (Tailwind CSS + custom styles)
import './index.css';

// Import the database to ensure it's initialized
import { initializeDatabase } from '@db/database';

/**
 * DEBUG LOGGER
 * A helper to output formatted debug messages to the console.
 * Only logs in development mode (not in production).
 *
 * WHY IS THIS USEFUL?
 * When debugging, colored console messages are easier to spot
 * than plain text. This helps track the app's initialization.
 *
 * @param message - The message to log
 * @param data - Optional data to include
 */
function debugLog(message: string, data?: unknown): void {
  // Only log in development mode
  if (import.meta.env.DEV) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c[Dream-E ${timestamp}] ${message}`,
      'color: #3b82f6; font-weight: bold;',
      data ?? ''
    );
  }
}

/**
 * APPLICATION INITIALIZATION
 * This async function handles all startup tasks before rendering.
 *
 * WHY ASYNC?
 * Some initialization tasks (like database setup) are asynchronous.
 * We want to complete these before the app renders to prevent
 * "loading" states or errors.
 */
async function initializeApp(): Promise<void> {
  debugLog('Starting application initialization...');

  try {
    // Step 1: Initialize the IndexedDB database
    // This creates tables if they don't exist
    debugLog('Initializing database...');
    await initializeDatabase();
    debugLog('Database initialized successfully');

    // Step 2: Check for any stored preferences
    // (Theme, language, etc.)
    debugLog('Loading user preferences...');
    // Preferences are handled by Zustand stores with persistence

    // Step 3: Render the application
    debugLog('Mounting React application...');
    renderApp();

    debugLog('Application initialized successfully! 🚀');
  } catch (error) {
    // If initialization fails, show an error message
    console.error('Failed to initialize application:', error);

    // Display a user-friendly error message
    displayInitializationError(error);
  }
}

/**
 * RENDER APPLICATION
 * Creates the React root and renders the App component.
 *
 * REACT 18 CHANGES:
 * React 18 introduced a new "createRoot" API (replacing ReactDOM.render).
 * This enables new features like:
 * - Concurrent rendering (smoother updates)
 * - Automatic batching (fewer re-renders)
 * - Suspense improvements
 */
function renderApp(): void {
  // Find the root element in index.html
  const rootElement = document.getElementById('root');

  // Safety check: make sure the element exists
  if (!rootElement) {
    throw new Error(
      'Root element not found! Make sure there is a <div id="root"> in index.html'
    );
  }

  // Create a React root for concurrent features
  const root = ReactDOM.createRoot(rootElement);

  // Render the app inside React.StrictMode
  // StrictMode helps find potential problems by:
  // - Running some functions twice (in dev) to detect side effects
  // - Warning about deprecated APIs
  // - Detecting unexpected side effects
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

/**
 * DISPLAY INITIALIZATION ERROR
 * Shows a user-friendly error message if the app fails to start.
 *
 * WHY IS THIS IMPORTANT?
 * If something goes wrong during initialization, we want to:
 * 1. Tell the user what happened
 * 2. Suggest possible solutions
 * 3. Make it easy to report the issue
 *
 * @param error - The error that occurred
 */
function displayInitializationError(error: unknown): void {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  // Format the error message
  const errorMessage =
    error instanceof Error ? error.message : 'An unknown error occurred';

  // Create a simple error display
  rootElement.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
      background: #1a1a2e;
      color: #e4e4e7;
      font-family: system-ui, sans-serif;
      text-align: center;
    ">
      <h1 style="color: #ef4444; margin-bottom: 16px;">
        ⚠️ Failed to Start Dream-E
      </h1>
      <p style="max-width: 500px; margin-bottom: 24px; color: #a1a1aa;">
        Something went wrong while starting the application.
        This might be due to browser compatibility issues or corrupted data.
      </p>
      <pre style="
        background: #16213e;
        padding: 16px;
        border-radius: 8px;
        max-width: 100%;
        overflow-x: auto;
        font-size: 14px;
        margin-bottom: 24px;
      ">${errorMessage}</pre>
      <div style="display: flex; gap: 12px;">
        <button onclick="location.reload()" style="
          padding: 12px 24px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
        ">
          Try Again
        </button>
        <button onclick="
          localStorage.clear();
          indexedDB.deleteDatabase('StoryWeaverDB');
          location.reload();
        " style="
          padding: 12px 24px;
          background: transparent;
          color: #ef4444;
          border: 1px solid #ef4444;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
        ">
          Reset All Data
        </button>
      </div>
    </div>
  `;
}

// Start the application!
initializeApp();
