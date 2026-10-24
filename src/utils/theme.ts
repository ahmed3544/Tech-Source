/**
 * TECH SOURCE — Theme management (dark / light).
 *
 * Priority: user's explicit choice (localStorage `tech-source-theme`)
 *           → OS preference (prefers-color-scheme) → light.
 * The chosen theme is applied as a `dark` class on <html> (Tailwind 4
 * custom variant is configured in index.css) plus a matching
 * `color-scheme` and <meta name="theme-color">.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tech-source-theme';

const THEME_COLOR: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#0b1220',
};

let listeners = new Set<() => void>();
let currentTheme: Theme = 'light';

export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** The theme the app should currently render with. */
export function getEffectiveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

/** Current in-memory theme (call after initTheme). */
export function getTheme(): Theme {
  return currentTheme;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.setProperty('color-scheme', theme);
  try {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  } catch {
    /* meta tag optional */
  }
}

/**
 * Initialize the theme at app startup (module scope, before first React paint).
 * While the user has not picked a side explicitly, OS-level changes are followed live.
 */
export function initTheme(): Theme {
  currentTheme = getEffectiveTheme();
  applyTheme(currentTheme);
  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', (event) => {
      if (getStoredTheme()) return; // user override wins
      currentTheme = event.matches ? 'dark' : 'light';
      applyTheme(currentTheme);
      listeners.forEach((listener) => listener());
    });
  } catch {
    /* matchMedia unsupported — keep the initial theme */
  }
  return currentTheme;
}

export function setTheme(theme: Theme): void {
  currentTheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — theme applies for this session only */
  }
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Subscribe to theme changes (for React state sync). Returns an unsubscribe fn. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
