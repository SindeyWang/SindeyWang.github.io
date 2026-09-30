(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('js');
  const langBtn = document.querySelector('.lang-toggle');
  const navBtn = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.top-nav');
  const storedLanguage = () => { try { return localStorage.getItem('kw_lang'); } catch { return null; } };
  const closeMenu = (returnFocus = false) => {
    document.body.classList.remove('nav-open');
    navBtn?.setAttribute('aria-expanded', 'false');
    if (returnFocus) navBtn?.focus();
  };
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const projects = [...document.querySelectorAll('.project-card')];
  let activeFilter = 'all';
  const updateFilterStatus = () => {
    const status = document.querySelector('.filter-status');
    if (!status) return;
    const count = projects.filter(p => !p.hidden).length;
    status.textContent = root.lang === 'zh-CN' ? `${count} 项公开项目` : `${count} public ${count === 1 ? 'project' : 'projects'}`;
  };
  const setLanguage = (lang, persist = true) => {
    const isZh = lang === 'zh';
    root.classList.toggle('lang-zh', isZh);
    root.classList.toggle('lang-en', !isZh);
    root.lang = isZh ? 'zh-CN' : 'en';
    document.title = root.dataset[isZh ? 'titleZh' : 'titleEn'] || document.title;
    langBtn?.setAttribute('aria-label', isZh ? 'Switch to English' : '切换至中文');
    navBtn?.setAttribute('aria-label', isZh ? '打开导航菜单' : 'Open navigation');
    if (navBtn) navBtn.textContent = isZh ? '菜单' : 'Menu';
    updateFilterStatus();
    window.dispatchEvent(new CustomEvent('kw:languagechange', {detail: {language: isZh ? 'zh' : 'en'}}));
    if (persist) { try { localStorage.setItem('kw_lang', isZh ? 'zh' : 'en'); } catch {} }
  };
  setLanguage(storedLanguage() || 'en', false);
  langBtn?.addEventListener('click', () => {
    const next = root.lang === 'zh-CN' ? 'en' : 'zh';
    setLanguage(next);
    window.dispatchEvent(new CustomEvent('kw:analytics-event', {detail: {event: 'language_switch', language: next}}));
  });
  navBtn?.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    navBtn.setAttribute('aria-expanded', String(open));
  });
  menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) closeMenu(true); });
  document.addEventListener('click', e => { if (!e.target.closest('.top-header')) closeMenu(); });
  matchMedia('(min-width: 851px)').addEventListener('change', e => { if (e.matches) closeMenu(); });
  const filterBar = document.querySelector('.project-filters');
  if (filterBar) filterBar.hidden = false;
  filterButtons.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    projects.forEach(project => { project.hidden = activeFilter !== 'all' && project.dataset.category !== activeFilter; });
    filterButtons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    updateFilterStatus();
    window.dispatchEvent(new CustomEvent('kw:analytics-event', {detail: {event: 'project_filter', category: activeFilter}}));
  }));
  // Deep links always reveal the requested project, even after filtering.
  const revealHash = () => {
    const id = location.hash.slice(1);
    if (id && projects.some(project => project.id === id && project.hidden)) {
      filterButtons.find(button => button.dataset.filter === 'all')?.click();
    }
  };
  window.addEventListener('hashchange', revealHash);
  revealHash();
})();
