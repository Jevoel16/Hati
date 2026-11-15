import { useState } from 'react';
import {
  applyTheme,
  readTheme,
  THEME_ICONS,
  THEME_LABELS,
  THEMES,
  type Theme,
} from '../lib/theme.ts';

// One button per theme so any choice is one click. The landing pages have the same markup in plain HTML.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const choose = (next: Theme) => {
    applyTheme(next);
    setTheme(next);
  };

  return (
    <div className="theme-picker" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-label={THEME_LABELS[t]}
          title={THEME_LABELS[t]}
          aria-pressed={t === theme}
          onClick={() => choose(t)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={THEME_ICONS[t]} />
          </svg>
        </button>
      ))}
    </div>
  );
}
