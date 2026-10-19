try {
  var p = JSON.parse(localStorage.getItem('hs:prefs') || '{}');
  if (p.theme === 'light' || p.theme === 'dark') document.documentElement.dataset.theme = p.theme;
  if (p.corners === 'soft' || p.corners === 'crisp') document.documentElement.dataset.corners = p.corners;
  if (p.lang === 'ar') {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }
} catch (e) {}
