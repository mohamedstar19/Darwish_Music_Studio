// Apply the saved theme before the page draws (kept as a file so no inline script is needed).
try {
  var t = localStorage.getItem('dms.theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}
