/**
 * Theme store for managing app-wide theme preferences
 */

import { browser } from '$app/environment';

type Theme = 'light' | 'dark' | 'auto';

let currentTheme = $state<Theme>('auto');
let initialized = false;

/**
 * Apply theme to the document
 */
function applyTheme(theme: Theme): void {
  if (!browser) return;

  const root = document.documentElement;

  if (theme === 'auto') {
    // Remove explicit theme, let CSS media query handle it
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }

  currentTheme = theme;
}

/**
 * Initialize theme from user preferences
 */
export async function initializeTheme(): Promise<void> {
  if (!browser || initialized) return;
  initialized = true;

  try {
    const { getDatabase } = await import('@gigwidget/db');
    const db = getDatabase();
    const users = await db.users.toArray();

    if (users.length > 0) {
      const prefs = await db.userPreferences.where('userId').equals(users[0].id).first();
      if (prefs?.theme) {
        applyTheme(prefs.theme);
      }
    }
  } catch (err) {
    console.error('Failed to load theme preference:', err);
  }
}

/**
 * Set and persist theme preference
 */
export async function setTheme(theme: Theme): Promise<void> {
  applyTheme(theme);

  if (!browser) return;

  try {
    const { getDatabase } = await import('@gigwidget/db');
    const db = getDatabase();
    const users = await db.users.toArray();

    if (users.length > 0) {
      const prefs = await db.userPreferences.where('userId').equals(users[0].id).first();
      if (prefs) {
        await db.userPreferences.where('userId').equals(users[0].id).modify({ theme });
      }
    }
  } catch (err) {
    console.error('Failed to save theme preference:', err);
  }
}

/**
 * Get current theme
 */
export function getTheme(): Theme {
  return currentTheme;
}
