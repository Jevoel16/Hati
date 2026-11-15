import { inject } from '@vercel/analytics';
import { applyTheme, parseTheme, readTheme, type Theme } from './lib/theme.ts';

inject();

function setUpThemePicker(picker: HTMLElement) {
  const buttons = picker.querySelectorAll<HTMLButtonElement>('[data-theme-option]');
  const show = (theme: Theme) => {
    for (const b of buttons)
      b.setAttribute('aria-pressed', String(b.dataset.themeOption === theme));
  };
  show(readTheme());
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const theme = parseTheme(b.dataset.themeOption ?? null);
      applyTheme(theme);
      show(theme);
    });
  }
}

const picker = document.querySelector<HTMLElement>('[data-theme-picker]');
if (picker) setUpThemePicker(picker);
