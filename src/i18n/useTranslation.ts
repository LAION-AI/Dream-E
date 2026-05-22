/**
 * =============================================================================
 * INTERNATIONALIZATION — React Hook + Store
 * =============================================================================
 *
 * Provides the `useTranslation` hook that returns a `t()` function for
 * translating UI strings. The active language is stored in Zustand
 * (persisted to localStorage) so it survives page reloads.
 *
 * Usage:
 *   import { useTranslation } from '@/i18n/useTranslation';
 *   const { t, language, setLanguage } = useTranslation();
 *   <span>{t('topbar.save')}</span>
 *   <button onClick={() => setLanguage('de')}>Deutsch</button>
 *
 * =============================================================================
 */

import { create } from 'zustand';
import { translations, type Language } from './translations';

// =============================================================================
// LANGUAGE STORE
// =============================================================================

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

/**
 * Global language store. Persisted to localStorage so the user's choice
 * survives browser refreshes and new sessions.
 */
export const useLanguageStore = create<LanguageStore>((set) => ({
  language: (localStorage.getItem('dreame_language') as Language) || 'en',
  setLanguage: (lang: Language) => {
    localStorage.setItem('dreame_language', lang);
    set({ language: lang });
  },
}));

// =============================================================================
// TRANSLATION HOOK
// =============================================================================

/**
 * React hook for internationalization.
 *
 * Returns:
 *   - `t(key)` — returns the translated string for the active language.
 *     Falls back to English if the key is missing in the current language,
 *     and returns the key itself if not found in either language.
 *   - `language` — the current language code ('en' | 'de')
 *   - `setLanguage` — function to switch languages
 */
export function useTranslation() {
  const { language, setLanguage } = useLanguageStore();

  function t(key: string): string {
    return translations[language]?.[key]
      ?? translations.en?.[key]
      ?? key;
  }

  return { t, language, setLanguage };
}

/**
 * Non-hook version for use outside React components (e.g., in utility functions).
 * Reads the current language from the store snapshot.
 */
export function t(key: string): string {
  const lang = useLanguageStore.getState().language;
  return translations[lang]?.[key]
    ?? translations.en?.[key]
    ?? key;
}
