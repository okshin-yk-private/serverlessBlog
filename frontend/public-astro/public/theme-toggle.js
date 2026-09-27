// Theme toggle button click handler. Shared by every ThemeToggle.astro instance.
// External static file (not an Astro-processed <script>) so it is never inlined
// into the page as `<script type="module">...</script>` by the bundler — CSP
// script-src 'self' requires every executable script to be loaded via src.
(function () {
  var btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var current =
      document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'dark'
        : 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch (e) {}
  });
})();
