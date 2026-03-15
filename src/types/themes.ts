/**
 * =============================================================================
 * THEME TYPE DEFINITIONS
 * =============================================================================
 *
 * This file defines types for the theming system in Dream-E.
 *
 * WHAT IS THEMING?
 * Theming allows games to have different visual styles:
 * - Fantasy: Parchment textures, gold borders, medieval fonts
 * - Cyberpunk: Neon colors, sharp edges, digital fonts
 * - Modern: Clean design, rounded corners, minimal style
 *
 * Themes control:
 * - Colors (text, backgrounds, borders, accents)
 * - Fonts (headers, body text)
 * - Visual elements (border styles, corner rounding)
 * - Sounds (click sounds, transitions)
 * - Textures (background images for UI elements)
 *
 * =============================================================================
 */

/**
 * THEME ID TYPE
 * The built-in themes available.
 */
export type ThemeId = 'fantasy' | 'cyberpunk' | 'modern' | 'custom';

/**
 * THEME COLORS INTERFACE
 * Color definitions for a theme.
 *
 * Colors use CSS color values (hex, rgb, rgba, etc.)
 */
export interface ThemeColors {
  /**
   * Primary color - main actions, highlights.
   * Example: Button backgrounds, active states.
   */
  primary: string;

  /**
   * Secondary color - supporting elements.
   * Example: Secondary buttons, links.
   */
  secondary: string;

  /**
   * Accent color - emphasis, important elements.
   * Example: Notifications, warnings.
   */
  accent: string;

  /**
   * Background color - main backdrop.
   * Usually semi-transparent over the game image.
   */
  background: string;

  /**
   * Surface color - cards, panels.
   * Slightly different from background for depth.
   */
  surface: string;

  /**
   * Primary text color.
   * Must contrast well with background.
   */
  text: string;

  /**
   * Muted/secondary text color.
   * For less important text.
   */
  textMuted: string;

  /**
   * Border color.
   */
  border: string;

  /**
   * Success/positive color.
   * For confirmations, achievements.
   */
  success: string;

  /**
   * Error/negative color.
   * For errors, damage, warnings.
   */
  error: string;
}

/**
 * THEME FONTS INTERFACE
 * Font definitions for a theme.
 *
 * Fonts use CSS font-family values.
 * Include fallbacks for systems without the font installed.
 */
export interface ThemeFonts {
  /**
   * Font for headings, titles.
   * Can be decorative/stylized.
   */
  header: string;

  /**
   * Font for body text, paragraphs.
   * Should be highly readable.
   */
  body: string;

  /**
   * Font for UI elements, buttons.
   * Usually matches body or is a clean sans-serif.
   */
  ui: string;
}

/**
 * THEME ASSETS INTERFACE
 * Asset URLs for theme visuals.
 */
export interface ThemeAssets {
  /**
   * Texture for dialog box backgrounds.
   * Example: Parchment image for fantasy theme.
   */
  dialogBoxTexture?: string;

  /**
   * Texture for button backgrounds.
   */
  buttonTexture?: string;

  /**
   * Texture for HUD backgrounds.
   */
  hudTexture?: string;

  /**
   * Pattern/texture for overall UI.
   */
  uiPattern?: string;

  /**
   * Sound for button clicks.
   */
  clickSound?: string;

  /**
   * Sound for hover events.
   */
  hoverSound?: string;

  /**
   * Sound for transitions between scenes.
   */
  transitionSound?: string;
}

/**
 * THEME LAYOUT INTERFACE
 * Layout and styling properties.
 */
export interface ThemeLayout {
  /**
   * Border radius for rounded corners.
   * "0px" for sharp, "16px" for rounded, etc.
   */
  borderRadius: string;

  /**
   * Border style (CSS border-style).
   * "solid", "double", "dashed", etc.
   */
  borderStyle: string;

  /**
   * Border width.
   */
  borderWidth: string;

  /**
   * Box shadow for depth.
   * Can include glow effects.
   */
  boxShadow: string;

  /**
   * Padding inside boxes.
   */
  padding: string;

  /**
   * Gap between elements.
   */
  gap: string;
}

/**
 * THEME DEFINITION INTERFACE
 * Complete definition of a theme.
 */
export interface ThemeDefinition {
  /** Theme identifier */
  id: ThemeId;

  /** Display name */
  name: string;

  /** Description */
  description: string;

  /** Color palette */
  colors: ThemeColors;

  /** Font families */
  fonts: ThemeFonts;

  /** Asset URLs */
  assets: ThemeAssets;

  /** Layout/styling */
  layout: ThemeLayout;
}

/**
 * THEME CONFIG INTERFACE
 * User's theme configuration for a project.
 *
 * This allows customization of the base theme.
 */
export interface ThemeConfig {
  /** Which base theme to use */
  id: ThemeId;

  /**
   * Custom color overrides.
   * Only the specified colors are overridden.
   */
  customColors?: Partial<ThemeColors>;

  /**
   * Custom font overrides.
   */
  customFonts?: Partial<ThemeFonts>;

  /**
   * Custom asset overrides.
   */
  customAssets?: Partial<ThemeAssets>;

  /**
   * Custom layout overrides.
   */
  customLayout?: Partial<ThemeLayout>;
}

/**
 * BUILT-IN THEME: FANTASY
 * Medieval/high fantasy aesthetic.
 */
export const THEME_FANTASY: ThemeDefinition = {
  id: 'fantasy',
  name: 'Fantasy',
  description: 'Medieval aesthetic with parchment textures and golden accents',
  colors: {
    primary: '#b8860b',        // Dark goldenrod
    secondary: '#8b4513',      // Saddle brown
    accent: '#daa520',         // Goldenrod
    background: 'rgba(62, 39, 35, 0.85)',
    surface: 'rgba(139, 90, 43, 0.3)',
    text: '#f5f5dc',           // Beige
    textMuted: 'rgba(245, 245, 220, 0.7)',
    border: '#b8860b',
    success: '#228b22',        // Forest green
    error: '#8b0000',          // Dark red
  },
  fonts: {
    header: "'Cinzel', serif",
    body: "'Merriweather', serif",
    ui: "'Cinzel', serif",
  },
  assets: {
    // These would be URLs to actual asset files
    dialogBoxTexture: '/themes/fantasy/parchment.png',
    buttonTexture: '/themes/fantasy/button.png',
    clickSound: '/themes/fantasy/click.mp3',
  },
  layout: {
    borderRadius: '4px',
    borderStyle: 'double',
    borderWidth: '4px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
    padding: '16px',
    gap: '12px',
  },
};

/**
 * BUILT-IN THEME: CYBERPUNK
 * Futuristic neon aesthetic.
 */
export const THEME_CYBERPUNK: ThemeDefinition = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  description: 'Futuristic aesthetic with neon colors and digital effects',
  colors: {
    primary: '#ff00ff',        // Magenta
    secondary: '#00ffff',      // Cyan
    accent: '#ff6b6b',         // Coral
    background: 'rgba(10, 10, 20, 0.9)',
    surface: 'rgba(20, 20, 40, 0.8)',
    text: '#ffffff',
    textMuted: 'rgba(255, 255, 255, 0.6)',
    border: '#00ffff',
    success: '#00ff00',        // Neon green
    error: '#ff0040',          // Neon red
  },
  fonts: {
    header: "'Orbitron', sans-serif",
    body: "'Roboto Mono', monospace",
    ui: "'Orbitron', sans-serif",
  },
  assets: {
    dialogBoxTexture: '/themes/cyberpunk/panel.png',
    buttonTexture: '/themes/cyberpunk/button.png',
    clickSound: '/themes/cyberpunk/beep.mp3',
  },
  layout: {
    borderRadius: '0px',
    borderStyle: 'solid',
    borderWidth: '2px',
    boxShadow: '0 0 10px rgba(0, 255, 255, 0.5)',
    padding: '16px',
    gap: '12px',
  },
};

/**
 * BUILT-IN THEME: MODERN
 * Clean, minimal aesthetic.
 */
export const THEME_MODERN: ThemeDefinition = {
  id: 'modern',
  name: 'Modern',
  description: 'Clean, minimal aesthetic with glassmorphism effects',
  colors: {
    primary: '#6366f1',        // Indigo
    secondary: '#8b5cf6',      // Violet
    accent: '#a855f7',         // Purple
    background: 'rgba(30, 30, 40, 0.7)',
    surface: 'rgba(50, 50, 60, 0.5)',
    text: '#ffffff',
    textMuted: 'rgba(255, 255, 255, 0.7)',
    border: 'rgba(255, 255, 255, 0.15)',
    success: '#22c55e',        // Green
    error: '#ef4444',          // Red
  },
  fonts: {
    header: "'Inter', sans-serif",
    body: "'Inter', sans-serif",
    ui: "'Inter', sans-serif",
  },
  assets: {},
  layout: {
    borderRadius: '16px',
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    padding: '20px',
    gap: '16px',
  },
};

/**
 * ALL THEMES MAP
 * Quick lookup of themes by ID.
 */
export const THEMES: Record<ThemeId, ThemeDefinition> = {
  fantasy: THEME_FANTASY,
  cyberpunk: THEME_CYBERPUNK,
  modern: THEME_MODERN,
  custom: THEME_MODERN, // Custom starts with modern as base
};

/**
 * GET THEME FUNCTION
 * Gets a theme definition by ID.
 *
 * @param id - The theme ID to look up
 * @returns The theme definition, or modern theme if not found
 */
export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES[id] || THEME_MODERN;
}

/**
 * APPLY THEME CONFIG FUNCTION
 * Merges custom config with base theme.
 *
 * @param config - The theme configuration
 * @returns Complete theme definition with customizations applied
 */
export function applyThemeConfig(config: ThemeConfig): ThemeDefinition {
  const baseTheme = getTheme(config.id);

  return {
    ...baseTheme,
    colors: { ...baseTheme.colors, ...config.customColors },
    fonts: { ...baseTheme.fonts, ...config.customFonts },
    assets: { ...baseTheme.assets, ...config.customAssets },
    layout: { ...baseTheme.layout, ...config.customLayout },
  };
}
