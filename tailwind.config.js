/**
 * =============================================================================
 * TAILWIND CSS CONFIGURATION
 * =============================================================================
 *
 * Tailwind CSS is a utility-first CSS framework.
 *
 * WHAT DOES THAT MEAN?
 * Instead of writing CSS like:
 *   .button { background: blue; padding: 10px; border-radius: 5px; }
 *
 * You write HTML like:
 *   <button class="bg-blue-500 p-2 rounded">Click me</button>
 *
 * This file customizes Tailwind for Dream-E's design system.
 *
 * =============================================================================
 */

/** @type {import('tailwindcss').Config} */
export default {
  /**
   * CONTENT
   * Tells Tailwind which files to scan for class names.
   * Tailwind removes unused styles, so it needs to know where to look.
   */
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

  /**
   * DARK MODE
   * How dark mode is activated.
   * 'class' means we add a 'dark' class to enable dark mode.
   * This gives us manual control over the theme.
   */
  darkMode: 'class',

  /**
   * THEME
   * Customize colors, fonts, spacing, and more.
   */
  theme: {
    /**
     * EXTEND
     * Add new values without replacing Tailwind's defaults.
     */
    extend: {
      /**
       * CUSTOM COLORS
       * These match Dream-E's design system.
       *
       * HOW TO USE:
       * bg-editor-bg     -> background color
       * text-editor-text -> text color
       * border-node-scene -> border color
       */
      colors: {
        // Editor colors (dark theme)
        editor: {
          bg: '#1a1a2e',           // Main background - deep blue-black
          surface: '#16213e',      // Panels and cards
          border: '#0f3460',       // Borders
          text: '#e4e4e7',         // Primary text
          muted: '#a1a1aa',        // Secondary text
          accent: '#0ea5e9',       // Highlights and focus
        },

        // Node colors (matching the spec)
        node: {
          scene: '#3b82f6',        // Blue - Scene nodes
          choice: '#eab308',       // Yellow - Choice nodes
          modifier: '#22c55e',     // Green - Modifier nodes
          comment: '#6b7280',      // Gray - Comment nodes
        },

        // Player theme colors (will be overridden by CSS variables)
        player: {
          primary: 'var(--player-primary)',
          secondary: 'var(--player-secondary)',
          accent: 'var(--player-accent)',
          text: 'var(--player-text)',
          bg: 'var(--player-bg)',
        },

        // Glass effect colors
        glass: {
          white: 'rgba(255, 255, 255, 0.1)',
          dark: 'rgba(0, 0, 0, 0.3)',
        },
      },

      /**
       * CUSTOM FONTS
       * Font families for different contexts.
       *
       * HOW TO USE:
       * font-display -> For headings
       * font-body    -> For body text
       */
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        // Fantasy theme fonts
        fantasy: ['Cinzel', 'serif'],
        'fantasy-body': ['Merriweather', 'serif'],
        // Cyberpunk theme fonts
        cyber: ['Orbitron', 'sans-serif'],
        'cyber-body': ['Roboto Mono', 'monospace'],
      },

      /**
       * BOX SHADOW
       * Custom shadows for depth and glow effects.
       *
       * HOW TO USE:
       * shadow-glow-blue -> Blue glow effect
       */
      boxShadow: {
        // Glow effects for nodes
        'glow-blue': '0 0 15px rgba(59, 130, 246, 0.5)',
        'glow-yellow': '0 0 15px rgba(234, 179, 8, 0.5)',
        'glow-green': '0 0 15px rgba(34, 197, 94, 0.5)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.5)',
        // Glass panel shadow
        glass: '0 8px 32px rgba(0, 0, 0, 0.3)',
        // Inner shadow for depth
        inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.2)',
      },

      /**
       * BACKDROP BLUR
       * Custom blur values for glassmorphism.
       *
       * HOW TO USE:
       * backdrop-blur-glass -> Apply glass blur effect
       */
      backdropBlur: {
        glass: '12px',
        'glass-heavy': '20px',
      },

      /**
       * BORDER RADIUS
       * Custom rounding values.
       */
      borderRadius: {
        node: '12px',      // Node corners
        panel: '16px',     // Panel corners
        button: '8px',     // Button corners
      },

      /**
       * SPACING
       * Custom spacing values for consistent layout.
       */
      spacing: {
        'toolbar': '60px',      // Width of left toolbar
        'inspector': 'var(--inspector-width)',   // Width of right inspector panel
        'topbar': '48px',       // Height of top bar
      },

      /**
       * ANIMATION
       * Custom animations for UI interactions.
       */
      animation: {
        // Smooth fade in
        'fade-in': 'fadeIn 0.2s ease-out',
        // Slide from right (for inspector)
        'slide-in-right': 'slideInRight 0.2s ease-out',
        // Slide from bottom (for modals)
        'slide-in-up': 'slideInUp 0.3s ease-out',
        // Gentle pulse for active states
        'pulse-soft': 'pulseSoft 2s infinite',
        // Typewriter cursor blink
        'cursor-blink': 'cursorBlink 1s step-end infinite',
        // Flow animation for edges
        'flow': 'flow 1s linear infinite',
      },

      /**
       * KEYFRAMES
       * Define the animation steps.
       */
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        cursorBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        flow: {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
      },

      /**
       * Z-INDEX
       * Layering order for overlapping elements.
       * Higher numbers appear on top.
       */
      zIndex: {
        'toolbar': '10',
        'topbar': '20',
        'inspector': '30',
        'modal': '50',
        'dropdown': '60',
        'tooltip': '70',
        'toast': '80',
      },
    },
  },

  /**
   * PLUGINS
   * Extend Tailwind with additional functionality.
   */
  plugins: [],
};
