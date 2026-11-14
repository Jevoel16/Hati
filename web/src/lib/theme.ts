// System follows the device; light and dark are saved per browser. web/public/theme.js reads
// the same key before first paint.
export const THEMES = Object.freeze(['system', 'light', 'dark'] as const);
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'hati-theme';

export const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

// One 24px stroke icon per theme, each a single path so the landing page can swap `d`.
export const THEME_ICONS: Record<Theme, string> = {
  system: 'M3 5h18v11H3z M8 20h8 M12 16v4',
  light:
    'M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  dark: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
};

export const nextTheme = (theme: Theme): Theme =>
  THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;

export const parseTheme = (value: string | null): Theme =>
  value === 'light' || value === 'dark' ? value : 'system';

export function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}
