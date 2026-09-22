function savedLanguage() {
  try { return localStorage.getItem('kw_lang') || 'en'; } catch (error) { return 'en'; }
}

function setNavOpen(open) {
  const body = document.body;
  const toggle = document.querySelector('.nav-toggle');
  body.classList.toggle('nav-open', open);
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
}

function applyLang(language) {
  const zh = language === 'zh';
  const root = document.documentElement;
  root.classList.toggle('lang-zh', zh);
  root.classList.toggle('lang-en', !zh);
  document.body.classList.toggle('lang-zh', zh);
  document.body.classList.toggle('lang-en', !zh);
  root.lang = zh ? 'zh-CN' : 'en';

  const title = zh ? root.dataset.titleZh : root.dataset.titleEn;
  if (title) document.title = title;

  const toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.setAttribute('aria-label', zh ? '打开导航菜单' : 'Open navigation');
    toggle.textContent = zh ? '菜单' : 'Menu';
  }
  const languageButton = document.querySelector('.lang-toggle');
  if (languageButton) languageButton.setAttribute('aria-label', zh ? 'Switch to English' : '切换至中文');

  try { localStorage.setItem('kw_lang', zh ? 'zh' : 'en'); } catch (error) { /* storage is optional */ }
}

function toggleLang() {
  applyLang(savedLanguage() === 'zh' ? 'en' : 'zh');
  setNavOpen(false);
}

document.addEventListener('DOMContentLoaded', () => {
  applyLang(savedLanguage());
  const nav = document.querySelector('.top-nav');
  const navToggle = document.querySelector('.nav-toggle');
  const languageButton = document.querySelector('.lang-toggle');

  if (navToggle) navToggle.addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  if (languageButton) languageButton.addEventListener('click', toggleLang);
  if (nav) nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setNavOpen(false)));

  document.addEventListener('click', (event) => {
    if (nav && navToggle && !nav.contains(event.target) && !navToggle.contains(event.target)) setNavOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setNavOpen(false);
  });
});
