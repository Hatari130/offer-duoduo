// Runs before the first paint so the boot frame already matches the saved appearance.
// Kept in sync with COLOR_THEME_STORAGE_KEY in src/app/theme.ts; an external file because the CSP forbids inline scripts.
(function () {
  try {
    var stored = window.localStorage.getItem("offerflow:color-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    // Storage can be blocked; the app applies the theme again once it boots.
  }
})();
