/* A timed introduction, never a claim about network or authentication progress. */
window.RFSplash = {
  start(splash, {duration = 1850, onReveal = () => {}, onComplete = () => {}, focusTarget} = {}) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) { onReveal(); splash.remove(); onComplete(); return; }
    splash.hidden = false;
    const peers = [...document.body.children].filter(el => el !== splash && !['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el => [el,el.inert]);
    const overflow = document.body.style.overflow;
    peers.forEach(([el]) => el.inert = true);
    document.body.style.overflow = 'hidden';
    splash.querySelector('.skip').focus({preventScroll:true});
    let finished = false, cleaned = false, cleanupTimer;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(cleanupTimer);
      peers.forEach(([el,inert]) => { if (el.isConnected) el.inert = inert; });
      document.body.style.overflow = overflow;
      splash.remove();
      reduced.removeEventListener('change', motionChange);
      onComplete();
      const target = focusTarget?.();
      if (target) target.focus({preventScroll:true});
    }
    function finish() {
      if (finished) { if (reduced.matches) cleanup(); return; }
      finished = true;
      clearTimeout(fallback);
      clearTimeout(introTimer);
      onReveal();
      splash.classList.add('is-leaving');
      if (reduced.matches) cleanup(); else cleanupTimer = setTimeout(cleanup, 880);
    }
    function motionChange(e) { if (e.matches) finish(); }
    const introTimer = setTimeout(finish, duration);
    const fallback = setTimeout(finish, duration+2000);
    splash.querySelector('.skip').addEventListener('click',finish);
    splash.addEventListener('keydown',e => {
      if (['Escape','Enter',' '].includes(e.key)) { e.preventDefault(); finish(); }
      if (e.key === 'Tab') { e.preventDefault(); splash.querySelector('.skip').focus(); }
    });
    reduced.addEventListener('change',motionChange);
  }
};
