// Theme-aware favicon. Mirrors public-astro Layout.
// Must run after the #site-favicon <link> element exists in the document
// (i.e. this <script src> tag must stay after that <link> tag in <head>).
(function () {
  var favicon = document.getElementById('site-favicon');
  if (!favicon) return;

  var syncFavicon = function () {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    favicon.setAttribute(
      'href',
      isDark ? '/favicon-dark.png' : '/favicon-light.png'
    );
  };

  syncFavicon();
  new MutationObserver(syncFavicon).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
})();
