(function () {
  function readStoredTheme() {
    try {
      return localStorage.getItem('sdp.theme');
    } catch {
      return null;
    }
  }

  const theme = readStoredTheme() === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
