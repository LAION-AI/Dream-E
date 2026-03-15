/**
 * =============================================================================
 * POSTCSS CONFIGURATION
 * =============================================================================
 *
 * PostCSS is a tool for transforming CSS.
 * It's like a pipeline: CSS goes in, gets processed, and comes out.
 *
 * WHAT DOES IT DO HERE?
 * 1. tailwindcss: Processes Tailwind's utility classes
 * 2. autoprefixer: Adds vendor prefixes for browser compatibility
 *    Example: -webkit-backdrop-filter, -moz-border-radius
 *
 * =============================================================================
 */

export default {
  plugins: {
    /**
     * TAILWIND CSS
     * Generates all the utility classes based on tailwind.config.js
     */
    tailwindcss: {},

    /**
     * AUTOPREFIXER
     * Automatically adds browser prefixes to CSS properties.
     *
     * WHY IS THIS NEEDED?
     * Some CSS features need different prefixes for different browsers:
     * - Chrome/Safari: -webkit-
     * - Firefox: -moz-
     * - Edge/IE: -ms-
     *
     * Autoprefixer handles this automatically so you don't have to.
     */
    autoprefixer: {},
  },
};
