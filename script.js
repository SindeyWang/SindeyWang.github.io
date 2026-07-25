document.addEventListener('click', (event) => {
  const nav = document.querySelector('.top-nav');
  const btn = document.querySelector('.nav-toggle');
  if (!nav || !btn) return;
  if (!nav.contains(event.target) && !btn.contains(event.target)) {
    document.body.classList.remove('nav-open');
  }
});
