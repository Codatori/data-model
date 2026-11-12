(() => {
  'use strict';

  const themes = {
    'zen-graph': { tagline: 'CLARITY FROM COMPLEXITY', canvas: '--rice', logo: 'codatori-logo-light.svg' },
    'midnight-satori': { tagline: 'UNDERSTANDING BEYOND SYNTAX', canvas: '--midnight', logo: 'codatori-logo-dark.svg' }
  };
  const storageKey = 'codatori.theme';
  let current = 'zen-graph';
  let message = '';
  const isStorageError = error => error instanceof DOMException && ['SecurityError', 'QuotaExceededError'].includes(error.name);
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && Object.hasOwn(themes, saved)) current = saved;
    else if (saved) {
      message = 'The saved theme is not recognized. Zen Graph is active; choose a theme to replace the saved setting.';
      console.warn(message);
    }
  } catch (error) {
    if (!isStorageError(error)) throw error;
    message = 'Your browser could not read the saved theme. Zen Graph is active for this visit.';
    console.warn(message, error);
  }
  document.documentElement.dataset.theme = current;

  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.querySelector('#theme-picker');
    const tagline = document.querySelector('#brand-tagline');
    const status = document.querySelector('#theme-status');
    function update() {
      document.documentElement.dataset.theme = current;
      picker.value = current;
      tagline.textContent = themes[current].tagline;
      document.querySelector('.brand-icon').src = themes[current].logo;
      document.querySelector('meta[name="theme-color"]').content =
        getComputedStyle(document.documentElement).getPropertyValue(themes[current].canvas).trim();
      status.textContent = message;
      status.hidden = !message;
    }
    picker.addEventListener('change', () => {
      current = picker.value;
      message = '';
      try {
        localStorage.setItem(storageKey, current);
      } catch (error) {
        if (!isStorageError(error)) throw error;
        message = 'Theme applied for this visit, but your browser could not save the preference.';
        console.warn(message, error);
      }
      update();
    });
    update();
  });
})();
