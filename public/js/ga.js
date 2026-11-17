// Google Analytics 4 bootstrap. The measurement id comes from the GA_MEASUREMENT_ID
// environment variable and is written into the page by the server.
(function () {
  var id = document.currentScript && document.currentScript.getAttribute('data-ga');
  if (!id) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true });
})();
