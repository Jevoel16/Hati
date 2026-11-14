import { inject } from '@vercel/analytics';
import {
  applyTheme,
  nextTheme,
  readTheme,
  THEME_ICONS,
  THEME_LABELS,
  type Theme,
} from './lib/theme.ts';

inject();

function setUpThemeToggle(button: HTMLButtonElement) {
  const path = button.querySelector('path');
  const label = button.querySelector('.theme-toggle-label');
  const show = (theme: Theme) => {
    path?.setAttribute('d', THEME_ICONS[theme]);
    if (label) label.textContent = THEME_LABELS[theme];
  };
  let theme = readTheme();
  show(theme);
  button.addEventListener('click', () => {
    theme = nextTheme(theme);
    applyTheme(theme);
    show(theme);
  });
}

const themeButton = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
if (themeButton) setUpThemeToggle(themeButton);
