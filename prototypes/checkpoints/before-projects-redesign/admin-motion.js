/* Presentation only. Authentication remains the explicitly labelled prototype. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let changing = false;
  function switchTheme(button) {
    if (changing) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch {}
      document.querySelectorAll('#thBtn, #login-theme').forEach(b => {
        b.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        b.setAttribute('aria-pressed', String(next === 'dark'));
      });
    };
    if (!document.startViewTransition || reduced.matches) { apply(); return; }
    const bounds = button.getBoundingClientRect();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    changing = true;
    const transition = document.startViewTransition(apply);
    transition.ready.then(() => root.animate({clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]}, {duration: 550, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)'})).catch(() => {});
    transition.finished.catch(() => {}).finally(() => { changing = false; });
  }
  window.rfAdminTheme = () => switchTheme(document.querySelector('#thBtn'));
  document.querySelector('#login-theme').addEventListener('click', e => switchTheme(e.currentTarget));
  document.querySelectorAll('#thBtn, #login-theme').forEach(b => {
    b.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
    b.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  });
  document.querySelectorAll('.spark i').forEach((bar, i) => bar.style.setProperty('--bar-index', i));
  window.RFSplash.start(document.querySelector('#admin-splash'), {
    duration: 1650,
    focusTarget: () => !document.querySelector('#login').hidden ? document.querySelector('#lpw') : document.querySelector('#nav a')
  });
})();
