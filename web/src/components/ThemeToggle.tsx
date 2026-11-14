import { useState } from 'react';
import {
  applyTheme,
  nextTheme,
  readTheme,
  THEME_ICONS,
  THEME_LABELS,
  type Theme,
} from '../lib/theme.ts';

// Cycles system, light and dark. The landing page has the same button in plain HTML.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggle = () => {
    const next = nextTheme(theme);
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button type="button" className="button button--quiet theme-toggle" onClick={toggle}>
      <svg className="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d={THEME_ICONS[theme]} />
      </svg>
      <span className="visually-hidden">Theme: </span>
      <span className="theme-toggle-label">{THEME_LABELS[theme]}</span>
    </button>
  );
}
