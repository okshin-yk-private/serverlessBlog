// Live OS theme follow when the user has not explicitly chosen light/dark.
// External static file (see theme-toggle.js for why: avoids the bundler
// inlining this as `<script type="module">...</script>` without a src).
(function () {
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  var handler = function (e) {
    var saved = localStorage.getItem('theme') || 'system';
    if (saved !== 'system') return;
    document.documentElement.setAttribute(
      'data-theme',
      e.matches ? 'dark' : 'light'
    );
  };
  mql.addEventListener('change', handler);
})();
