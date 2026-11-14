// Classic script in <head>: applies the saved theme before first paint, so there is no flash.
/* global document, localStorage */
try {
  const theme = localStorage.getItem('hati-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage blocked: follow the device setting.
}
