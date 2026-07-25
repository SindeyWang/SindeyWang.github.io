function applyLang(lang){
  const zh = lang === 'zh';
  document.documentElement.classList.toggle('lang-zh', zh);
  document.documentElement.classList.toggle('lang-en', !zh);
  document.body.classList.toggle('lang-zh', zh);
  document.body.classList.toggle('lang-en', !zh);
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  localStorage.setItem('kw_lang', zh ? 'zh' : 'en');
}
function toggleLang(){ applyLang(localStorage.getItem('kw_lang') === 'zh' ? 'en' : 'zh'); }
document.addEventListener('DOMContentLoaded', () => {
  applyLang(localStorage.getItem('kw_lang') || 'en');
  document.addEventListener('click', (event) => {
    const nav = document.querySelector('.top-nav');
    const btn = document.querySelector('.nav-toggle');
    if (!nav || !btn) return;
    if (!nav.contains(event.target) && !btn.contains(event.target)) document.body.classList.remove('nav-open');
  });
});
