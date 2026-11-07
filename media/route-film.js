(() => {
  const film = document.querySelector('.route-film');
  if (!film || !window.IntersectionObserver || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.intersectionRatio >= 0.5) {
      observer.disconnect();
      film.play().catch(() => {});
    }
  }, {threshold: 0.5});
  observer.observe(film);
})();
