// Theme bootstrap (FOUC prevention). Shared with frontend/admin/index.html.
// Must be loaded as a classic, render-blocking <script src> in <head> so the
// data-theme attribute is set before any stylesheet paints. Do not add
// `defer`/`async`/`type="module"` to the referencing <script> tag.
(function () {
  try {
    var saved = localStorage.getItem('theme');
    if (saved !== 'light' && saved !== 'dark' && saved !== 'system') {
      saved = 'system';
    }
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved =
      saved === 'system' ? (prefersDark ? 'dark' : 'light') : saved;
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
