(function () {
  var root = document.documentElement;
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var media = null;
  var stored = null;

  try {
    stored = window.localStorage && window.localStorage.getItem('ct-theme');
  } catch (_err) {}

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme() {
    var choice = stored === 'light' || stored === 'dark' ? stored : 'system';
    var theme = choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    if (themeMeta) themeMeta.setAttribute('content', theme === 'dark' ? '#171a20' : '#ffffff');
  }

  applyTheme();

  if (window.matchMedia) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) media.addEventListener('change', applyTheme);
    else if (media.addListener) media.addListener(applyTheme);
  }
}());
