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

// Without JavaScript every panel shows in turn; with it, one panel at a time behind its tab.
function setUpTabs(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>('[role="tablist"]');
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  if (!list || tabs.length === 0) return;
  const panelOf = (tab: HTMLButtonElement) =>
    document.getElementById(tab.getAttribute('aria-controls') ?? '');

  const select = (selected: HTMLButtonElement, focus: boolean) => {
    for (const tab of tabs) {
      const isSelected = tab === selected;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      const panel = panelOf(tab);
      if (panel) panel.hidden = !isSelected;
    }
    if (focus) selected.focus();
  };

  for (const tab of tabs) {
    const panel = panelOf(tab);
    panel?.setAttribute('role', 'tabpanel');
    panel?.setAttribute('aria-labelledby', tab.id);
    panel?.setAttribute('tabindex', '0');
    tab.addEventListener('click', () => {
      select(tab, false);
      history.replaceState(null, '', `#${panel?.id ?? ''}`);
    });
  }

  list.addEventListener('keydown', (event) => {
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    const target = {
      ArrowRight: (current + 1) % tabs.length,
      ArrowLeft: (current - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    tabs[target]!.click();
    tabs[target]!.focus();
  });

  const linked = tabs.find((tab) => `#${tab.getAttribute('aria-controls')}` === location.hash);
  select(linked ?? tabs[0]!, false);
  list.hidden = false;
  root.classList.add('tabs--ready');
}

const tabsRoot = document.querySelector<HTMLElement>('.tabs');
if (tabsRoot) setUpTabs(tabsRoot);
