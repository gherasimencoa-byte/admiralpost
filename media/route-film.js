(() => {
  const desktop = document.querySelector('.hero .route-film');
  const link = document.querySelector('.journey-play');
  if (!desktop || !link) return;
  const mobile = matchMedia('(max-width: 900px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let player;
  let observer;
  let started = false;

  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    player = desktop.cloneNode(true);
    player.removeAttribute('class');
    player.tabIndex = 0;
    link.after(player);
    link.hidden = true;
    player.focus({preventScroll: true});
    player.play().catch(() => {});
  });

  function layout() {
    observer?.disconnect();
    if (mobile.matches) {
      desktop.pause();
      return;
    }
    if (player) {
      player.pause();
      player.remove();
      player = null;
      link.hidden = false;
    }
    if (started || reducedMotion.matches || !window.IntersectionObserver) return;
    observer = new IntersectionObserver(([entry]) => {
      if (!mobile.matches && entry.intersectionRatio >= 0.5) {
        started = true;
        observer.disconnect();
        desktop.play().catch(() => {});
      }
    }, {threshold: 0.5});
    observer.observe(desktop);
  }
  mobile.addEventListener('change', layout);
  layout();
})();
