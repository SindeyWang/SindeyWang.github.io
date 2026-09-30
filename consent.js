/* First-party consent controller, BASIC mode: no GTM before an explicit grant.
 * Load analytics-config.js then this file, after script.js, without async.
 * Never add a GTM noscript iframe or a separate GA4/LinkedIn loader.
 * Container release gate: disable auto page views/enhanced measurement and map
 * ONLY the documented event payload fields; do not use raw Page URL/Referrer,
 * Click URL/Text or form inputs. Consent gates must be verified inside GTM.
 *
 * Public API: KWConsent.open(openerElement?) and KWConsent.getState() -> frozen
 * {analytics, marketing, configured, forced, storageAvailable, loaded, version,
 *  expiresAt}. loaded means the request was initiated, NOT provider verification.
 * Footer opener: button[data-cookie-settings]. No programmatic grant API.
 * Parent events on window (document supported too; bubbling is deduplicated):
 *   kw:languagechange after updating <html lang>, detail {language:'en'|'zh'};
 *   kw:analytics-event detail {event:'language_switch',language:'en'|'zh'} or
 *     {event:'project_filter',category:'all'|'finance'|'outreach'|'research'}.
 * Analytics-only dataLayer events: kw_page_view, resume_download,
 * contact_click, language_switch, project_filter, read_depth. Common fields:
 * page_path/page_location (allowlisted paths ONLY), page_title (static),
 * page_referrer (same-origin allowlisted path or ''), language ('en'|'zh').
 * Event extras: resume_language ('en'|'zh'|'legacy'), link_kind
 * ('email'|'linkedin'|'github'), category (above), percent (75), respectively.
 */
(function () {
  'use strict';
  if (window.KWConsent) return;
  const KEY = 'kw_consent';
  const VERSION = 1;
  const TTL = 180 * 24 * 60 * 60 * 1000;
  const denied = () => ({ analytics: false, marketing: false });
  const config = window.KW_ANALYTICS || {};
  const configured = config.enabled === true && typeof config.gtmId === 'string' && /^GTM-[A-Z0-9]{4,20}$/.test(config.gtmId);
  const marketingConfigured = config.marketingEnabled !== false;
  let state = denied(), record = null, storageAvailable = true, loaded = false;
  let initialized = false, reloading = false, expiryTimer = null;
  let pageViewSent = false, readDepthSent = false;
  const handledEvents = new WeakSet();
  let banner, dialog, backdrop, dialogTitle, dialogText, categories, actions, saveButton, closeButton;
  let analyticsInput, marketingInput, returnFocus, fallback = false, inertSiblings = [];
  const translations = {
    en: {
      title: 'Cookie settings', intro: 'Necessary local storage remembers your language and cookie choices. Optional analytics and marketing are off until you choose. You can change or withdraw consent here at any time.',
      introAnalytics: 'Necessary local storage remembers your language and cookie choices. Optional GA4 analytics is off until you choose. Advertising and marketing tags are not enabled. You can change or withdraw consent here at any time.',
      disabled: 'Analytics and marketing are not enabled on this site. Only necessary language and consent storage is used; no analytics or advertising tag is loaded.',
      forced: 'Your browser privacy signal (Do Not Track or Global Privacy Control) is respected. Analytics and marketing remain off.',
      storage: 'Browser storage is unavailable. Optional tracking stays off because your choice cannot be safely saved.',
      reject: 'Reject all', accept: 'Accept all', customize: 'Customize', save: 'Save choices', close: 'Close', privacy: 'Privacy notice',
      analytics: 'Analytics — optional GA4 visit and interaction measurement.', marketing: 'Marketing — optional LinkedIn advertising measurement via GTM.',
      necessary: 'Necessary language and consent storage is always available. Consent choices expire after 180 days. Closing this dialog does not grant consent.'
    },
    zh: {
      title: 'Cookie 设置', intro: '必要的本地存储用于记住语言及 Cookie 选择。可选的分析与营销在你选择前均关闭。你可随时在此更改或撤回同意。',
      introAnalytics: '必要的本地存储用于记住语言及 Cookie 选择。可选 GA4 分析在你选择前保持关闭，广告与营销标签未启用。你可随时在此更改或撤回同意。',
      disabled: '本站尚未启用分析或营销。目前仅使用必要的语言与同意设置存储，不加载分析或广告标签。',
      forced: '已尊重浏览器的隐私信号（Do Not Track 或 Global Privacy Control）。分析与营销保持关闭。',
      storage: '浏览器存储不可用，无法安全保存你的选择，因此可选追踪保持关闭。',
      reject: '全部拒绝', accept: '全部接受', customize: '自定义', save: '保存选择', close: '关闭', privacy: '隐私说明',
      analytics: '分析 — 可选的 GA4 访问与交互统计。', marketing: '营销 — 通过 GTM 进行的可选 LinkedIn 广告效果衡量。',
      necessary: '必要的语言与同意设置存储始终可用。同意选择在 180 天后到期。关闭此窗口不代表同意。'
    }
  };
  function language() { return /^zh(?:-|$)/i.test(document.documentElement.lang) ? 'zh' : 'en'; }
  function privacyForced() {
    const n = window.navigator;
    return n.globalPrivacyControl === true || [n.doNotTrack, window.doNotTrack, n.msDoNotTrack].some(v => v === '1' || v === 'yes');
  }
  function validRecord(value) {
    const now = Date.now();
    return value && !Array.isArray(value) && value.version === VERSION &&
      typeof value.analytics === 'boolean' && typeof value.marketing === 'boolean' &&
      Number.isSafeInteger(value.updatedAt) && Number.isSafeInteger(value.expiresAt) &&
      value.updatedAt > 0 && value.updatedAt <= now && value.expiresAt > now &&
      value.expiresAt > value.updatedAt && value.expiresAt - value.updatedAt <= TTL;
  }
  function readRecord() {
    try {
      const store = window.localStorage;
      const raw = store.getItem(KEY);
      // Even a readable old grant is unusable if writes are blocked (e.g. quota).
      store.setItem('kw_consent_probe', '1');
      store.removeItem('kw_consent_probe');
      storageAvailable = true;
      if (!raw) return null;
      try { const parsed = JSON.parse(raw); return validRecord(parsed) ? parsed : null; }
      catch (_) { return null; }
    } catch (_) { storageAvailable = false; return null; }
  }
  function effective(value) {
    return configured && pagePath() && !privacyForced() && storageAvailable && validRecord(value)
      ? { analytics: value.analytics, marketing: marketingConfigured && value.marketing } : denied();
  }
  function consentValues(value) {
    return {
      analytics_storage: value.analytics ? 'granted' : 'denied',
      ad_storage: value.marketing ? 'granted' : 'denied',
      ad_user_data: value.marketing ? 'granted' : 'denied',
      ad_personalization: value.marketing ? 'granted' : 'denied',
      functionality_storage: 'granted', security_storage: 'granted', personalization_storage: 'denied'
    };
  }
  // Installed BEFORE Google scripts can cache a sender. On revocation the native
  // runtime may otherwise emit a final denied/cookieless engagement request.
  let transportGuardInstalled = false;
  function installAnalyticsTransportGuard() {
    if (transportGuardInstalled) return true;
    const block = input => {
      if (state.analytics && !reloading && !privacyForced() && validRecord(record)) return false;
      try {
        const u = new URL(typeof input === 'string' ? input : (input?.url || String(input)), window.location.origin);
        return /(^|\.)google-analytics\.com$/.test(u.hostname) ||
          /(^|\.)analytics\.google\.com$/.test(u.hostname) ||
          (u.hostname === 'www.googletagmanager.com' && u.pathname === '/a') ||
          (u.hostname === 'www.google.com' && u.pathname === '/ccm/collect');
      } catch (_) { return false; }
    };
    try {
      if (typeof window.navigator.sendBeacon === 'function') {
        const original = window.navigator.sendBeacon;
        window.navigator.sendBeacon = function (url, data) {
          // Return true after dropping: false would invite a transport fallback.
          return block(url) ? true : original.call(this, url, data);
        };
      }
      if (typeof window.fetch === 'function') {
        const original = window.fetch;
        window.fetch = function (input, init) {
          if (block(input)) return Promise.resolve(window.Response ? new window.Response(null, {status: 204}) : {ok: true, status: 204});
          return original.call(this, input, init);
        };
      }
      if (window.XMLHttpRequest) {
        const proto = window.XMLHttpRequest.prototype, open = proto.open, send = proto.send;
        const urls = new WeakMap();
        proto.open = function (method, url) { urls.set(this, url); return open.apply(this, arguments); };
        proto.send = function () { if (block(urls.get(this))) { this.abort(); return; } return send.apply(this, arguments); };
      }
      transportGuardInstalled = true;
      return true;
    } catch (_) { return false; } // Fail closed rather than loading an unguarded provider.
  }
  // Local dataLayer commands are not network requests. Only loadTag creates one.
  function command() { window.dataLayer.push(arguments); }
  function loadTag() {
    if (loaded || reloading || !configured || (!state.analytics && !state.marketing)) return;
    if (!installAnalyticsTransportGuard()) { state = denied(); return; }
    window.dataLayer = window.dataLayer || [];
    command('consent', 'default', consentValues(denied()));
    command('set', 'ads_data_redaction', true);
    command('set', 'url_passthrough', false);
    command('set', pageFields());
    command('consent', 'update', consentValues(state));
    loaded = true; // At most once, even if the container request fails.
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(config.gtmId);
    script.referrerPolicy = 'no-referrer';
    document.head.appendChild(script);
  }
  function removeGoogleCookies() {
    // Best effort: JS cannot remove HttpOnly, provider-domain or partitioned cookies.
    try {
      const names = document.cookie.split(';').map(c => c.split('=')[0].trim())
        .filter(name => /^_(?:ga(?:_[A-Za-z0-9_-]+)?|gid|gat(?:_[A-Za-z0-9_-]+)?)$/.test(name));
      const host = window.location.hostname;
      const domains = ['', host, '.' + host];
      const parts = host.split('.');
      for (let i = 1; i < parts.length - 1; i++) {
        domains.push(parts.slice(i).join('.'), '.' + parts.slice(i).join('.'));
      }
      names.forEach(name => domains.forEach(domain => {
        document.cookie = name + '=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax' + (domain ? '; Domain=' + domain : '');
      }));
    } catch (_) { /* Still reload to stop this page's loaded tags. */ }
  }
  const pageTitles = Object.freeze({
    '/': 'Home | Kongxin Wang', '/index.html': 'Home | Kongxin Wang',
    '/projects.html': 'Projects | Kongxin Wang', '/experience.html': 'Experience | Kongxin Wang',
    '/cv.html': 'CV | Kongxin Wang', '/contact.html': 'Contact | Kongxin Wang', '/privacy.html': 'Privacy | Kongxin Wang'
  });
  function pagePath() { const p = window.location.pathname; return Object.prototype.hasOwnProperty.call(pageTitles, p) ? p : null; }
  function safeReferrer() {
    try {
      const url = new URL(document.referrer);
      return url.origin === window.location.origin && Object.prototype.hasOwnProperty.call(pageTitles, url.pathname) ? url.pathname : '';
    } catch (_) { return ''; }
  }
  function pageFields() {
    const path = pagePath();
    return { page_path: path, page_location: path, page_title: pageTitles[path], page_referrer: safeReferrer(), language: language() };
  }
  function pushEvent(event, extra) {
    if (!loaded || reloading || !state.analytics || !pagePath()) return false;
    // Build a new payload: never merge input detail, URL, DOM text or form values.
    window.dataLayer.push({ event, ...pageFields(), ...extra });
    return true;
  }
  function emit(event, extra) { refresh(); return pushEvent(event, extra); }
  function customEvent(event) {
    if (handledEvents.has(event)) return;
    handledEvents.add(event);
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (detail.event === 'language_switch' && ['en', 'zh'].includes(detail.language)) {
      emit('language_switch', { language: detail.language });
    } else if (detail.event === 'project_filter' && ['all', 'finance', 'outreach', 'research'].includes(detail.category)) {
      emit('project_filter', { category: detail.category });
    }
  }
  function trackClick(event) {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    let url;
    try { url = new URL(link.getAttribute('href'), window.location.origin + (pagePath() || '/')); }
    catch (_) { return; }
    const resumes = {
      '/assets/cv/Kongxin_Wang_Resume_EN.pdf': 'en',
      '/assets/cv/Kongxin_Wang_Resume_ZH.pdf': 'zh',
      '/assets/cv/Kongxin_Wang_Resume.pdf': 'legacy'
    };
    if (url.origin === window.location.origin && Object.prototype.hasOwnProperty.call(resumes, url.pathname)) {
      emit('resume_download', { resume_language: resumes[url.pathname] });
    } else if (url.protocol === 'mailto:') {
      emit('contact_click', { link_kind: 'email' });
    } else if (url.protocol === 'https:' && ['www.linkedin.com', 'linkedin.com'].includes(url.hostname) && /^\/in\/wangkongxin\/?$/.test(url.pathname)) {
      emit('contact_click', { link_kind: 'linkedin' });
    } else if (url.protocol === 'https:' && url.hostname === 'github.com' && /^\/SindeyWang\/?$/.test(url.pathname)) {
      emit('contact_click', { link_kind: 'github' });
    }
  }
  function trackScroll() {
    if (readDepthSent || !state.analytics) return;
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const range = height - window.innerHeight;
    // Do not report a depth on an unscrollable page or retroactively on acceptance.
    if (range > 0 && window.scrollY / range >= 0.75) {
      readDepthSent = emit('read_depth', { percent: 75 });
    }
  }
  function applyRecord(value) {
    const before = state;
    record = value;
    state = effective(value);
    window.clearTimeout(expiryTimer);
    const decreased = (before.analytics && !state.analytics) || (before.marketing && !state.marketing);
    if (loaded && decreased && !reloading) {
      reloading = true;
      // Deny EVERYTHING immediately; the retained choice is evaluated after reload.
      command('consent', 'update', consentValues(denied()));
      removeGoogleCookies();
      window.location.replace(pagePath() || '/'); // Deliberately drop query/hash.
    } else if (loaded && !reloading) {
      command('consent', 'update', consentValues(state));
    } else { loadTag(); }
    if (!pageViewSent && state.analytics && !reloading) pageViewSent = pushEvent('kw_page_view', {});
    if (validRecord(record) && !reloading) {
      expiryTimer = window.setTimeout(() => refresh(), Math.min(record.expiresAt - Date.now(), 2147483647));
    }
    if (banner) banner.hidden = !(configured && storageAvailable && !privacyForced() && !validRecord(record));
    reserveBannerSpace();
  }
  function refresh() { applyRecord(readRecord()); }
  function persist(analytics, marketing) {
    const now = Date.now();
    const next = { version: VERSION, analytics: analytics === true, marketing: marketingConfigured && marketing === true, updatedAt: now, expiresAt: now + TTL };
    if (!configured || privacyForced()) { applyRecord(null); render(); return; }
    try {
      const text = JSON.stringify(next);
      window.localStorage.setItem(KEY, text);
      if (window.localStorage.getItem(KEY) !== text) throw new Error('Storage write not retained');
      storageAvailable = true;
      applyRecord(next);
      closeDialog();
    } catch (_) {
      storageAvailable = false;
      try { window.localStorage.removeItem(KEY); } catch (_) { /* fail closed */ }
      applyRecord(null);
      render();
    }
  }
  function text() { const t = translations[language()]; return marketingConfigured ? t : { ...t, intro: t.introAnalytics }; }
  function explanation() {
    const t = text();
    return !configured ? t.disabled : privacyForced() ? t.forced : !storageAvailable ? t.storage : t.intro;
  }
  function element(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value) el.textContent = value;
    return el;
  }
  function button(value, fn) {
    const el = element('button', 'kw-consent-button', value);
    el.type = 'button'; el.addEventListener('click', fn); return el;
  }
  function restoreFocus() {
    if (backdrop) backdrop.hidden = true;
    inertSiblings.forEach(([el, previous]) => { el.inert = previous; });
    inertSiblings = [];
    const target = returnFocus && !returnFocus.closest?.('[hidden]') ? returnFocus :
      document.querySelector?.('[data-cookie-settings]') || document.querySelector?.('.logo');
    if (target && target.isConnected && typeof target.focus === 'function') target.focus();
    returnFocus = null;
  }
  function closeDialog() {
    if (!dialog || !dialog.open) return;
    if (!fallback && typeof dialog.close === 'function') dialog.close();
    else { dialog.open = false; dialog.removeAttribute('open'); restoreFocus(); }
    dialog.hidden = true;
  }
  function openDialog(opener) {
    if (!initialized) return;
    refresh(); render();
    if (dialog.open) return;
    returnFocus = opener && typeof opener.focus === 'function' ? opener : document.activeElement;
    analyticsInput.checked = state.analytics;
    marketingInput.checked = state.marketing;
    categories.hidden = !(configured && storageAvailable && !privacyForced());
    dialog.hidden = false;
    try {
      if (typeof dialog.showModal !== 'function') throw new Error('No native dialog');
      dialog.showModal(); fallback = false;
    } catch (_) {
      fallback = true; dialog.setAttribute('open', ''); dialog.open = true;
      backdrop.hidden = false;
      Array.from(document.body.children).filter(el => el !== dialog && el !== backdrop).forEach(el => {
        inertSiblings.push([el, !!el.inert]); el.inert = true;
      });
    }
    dialogTitle.focus();
  }
  function reserveBannerSpace() {
    // A fixed notice must not cover the footer/Cookie settings on first visit.
    if (!banner || typeof banner.getBoundingClientRect !== 'function') return;
    const height = banner.hidden ? 0 : banner.getBoundingClientRect().height;
    document.body.style.paddingBottom = height ? (Math.ceil(height) + 32) + 'px' : '';
  }
  function render() {
    if (!dialog) return;
    const t = text();
    dialog.lang = language() === 'zh' ? 'zh-CN' : 'en';
    dialogTitle.textContent = t.title;
    dialogText.textContent = explanation();
    const available = configured && storageAvailable && !privacyForced();
    categories.hidden = !available;
    actions.hidden = !available;
    saveButton.hidden = !available;
    closeButton.textContent = t.close;
    dialog.querySelectorAll('[data-kw-copy]').forEach(el => { el.textContent = t[el.getAttribute('data-kw-copy')]; });
    if (banner) {
      banner.lang = dialog.lang;
      banner.setAttribute('aria-label', t.title);
      banner.querySelectorAll('[data-kw-copy]').forEach(el => { el.textContent = t[el.getAttribute('data-kw-copy')]; });
    }
    reserveBannerSpace();
  }
  function copied(tag, key) {
    const el = element(tag, '', text()[key]); el.setAttribute('data-kw-copy', key); return el;
  }
  function choiceButtons(parent, customize) {
    const reject = button(text().reject, () => persist(false, false)); reject.setAttribute('data-kw-copy', 'reject');
    const accept = button(text().accept, () => persist(true, marketingConfigured)); accept.setAttribute('data-kw-copy', 'accept');
    const custom = button(text().customize, customize); custom.setAttribute('data-kw-copy', 'customize');
    parent.append(reject, accept, custom);
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    const styles = element('style');
    styles.textContent = '.kw-consent-banner,.kw-consent-dialog{font-family:var(--serif-mixed,"Times New Roman",STSong,SimSun,serif);color:var(--ink,#172033);background:#fff;border:1px solid var(--line,#d9deea);padding:24px;box-sizing:border-box}.kw-consent-banner{position:fixed;bottom:16px;left:16px;right:16px;z-index:60;max-height:75vh;overflow:auto;box-shadow:0 8px 40px #17203326}.kw-consent-dialog{position:fixed;inset:0;margin:auto;width:min(640px,calc(100% - 32px));max-height:85vh;overflow:auto;z-index:100;box-shadow:0 10px 60px #17203340}.kw-consent-dialog::backdrop{background:#17203370}.kw-consent-dialog[open]{display:block}.kw-consent-dialog[hidden],.kw-consent-banner[hidden],.kw-consent-dialog [hidden]{display:none!important}.kw-consent-actions{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.kw-consent-actions .kw-consent-button{flex:1 1 140px}.kw-consent-button{font:inherit;min-height:44px;padding:8px 14px;color:var(--navy,#0b3d91);background:#fff;border:1px solid var(--navy,#0b3d91);cursor:pointer}.kw-consent-button:hover{background:var(--surface-soft,#f5f7fb)}.kw-consent-dialog h2,.kw-consent-banner h2{font-size:1.6rem}.kw-consent-dialog label{display:flex;gap:12px;align-items:baseline;margin:16px 0}.kw-consent-dialog input{width:18px;height:18px;flex-shrink:0}.kw-consent-dialog :focus-visible,.kw-consent-banner :focus-visible{outline:3px solid #a87510;outline-offset:3px}';
    styles.textContent += '.kw-consent-backdrop{position:fixed;inset:0;background:#17203370;z-index:99}.kw-consent-backdrop[hidden]{display:none!important}';
    document.head.appendChild(styles);
    backdrop = element('div', 'kw-consent-backdrop'); backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
    dialog = element('dialog', 'kw-consent-dialog'); dialog.id = 'kw-cookie-dialog'; dialog.hidden = true;
    dialog.setAttribute('aria-labelledby', 'kw-cookie-title');
    dialog.setAttribute('aria-describedby', 'kw-cookie-description');
    dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('role', 'dialog');
    dialogTitle = copied('h2', 'title'); dialogTitle.id = 'kw-cookie-title'; dialogTitle.tabIndex = -1;
    dialogText = element('p', '', explanation()); dialogText.id = 'kw-cookie-description';
    categories = element('div');
    analyticsInput = element('input'); analyticsInput.type = 'checkbox'; analyticsInput.id = 'kw-cookie-analytics';
    marketingInput = element('input'); marketingInput.type = 'checkbox'; marketingInput.id = 'kw-cookie-marketing';
    [['analytics', analyticsInput], ['marketing', marketingInput]].forEach(([key, input]) => {
      const label = element('label');
      if (key === 'marketing' && !marketingConfigured) { input.disabled = true; label.hidden = true; }
      label.append(input, copied('span', key)); categories.appendChild(label);
    });
    categories.appendChild(copied('p', 'necessary'));
    actions = element('div', 'kw-consent-actions');
    choiceButtons(actions, () => { categories.hidden = false; analyticsInput.focus(); });
    saveButton = button(text().save, () => persist(analyticsInput.checked, marketingInput.checked)); saveButton.setAttribute('data-kw-copy', 'save');
    closeButton = button(text().close, closeDialog);
    const privacy = copied('a', 'privacy'); privacy.href = 'privacy.html';
    const bottom = element('div', 'kw-consent-actions'); bottom.append(saveButton, closeButton, privacy);
    dialog.append(dialogTitle, dialogText, categories, actions, bottom);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    dialog.addEventListener('close', () => { dialog.hidden = true; restoreFocus(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(dialog.querySelectorAll('button:not([hidden]),input,a[href]')).filter(el => !el.disabled && !el.hidden && !el.closest?.('[hidden]'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogTitle)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogTitle)) { event.preventDefault(); first?.focus(); }
      }
    });
    document.body.appendChild(dialog);
    // Disabled/unconfigured/privacy-forced sites do not pretend to collect data.
    if (configured && !privacyForced()) {
      banner = element('section', 'kw-consent-banner'); banner.setAttribute('aria-label', text().title);
      banner.append(copied('h2', 'title'), copied('p', 'intro'));
      const bannerActions = element('div', 'kw-consent-actions');
      choiceButtons(bannerActions, event => openDialog(event.currentTarget));
      banner.appendChild(bannerActions);
      const link = copied('a', 'privacy'); link.href = 'privacy.html'; banner.appendChild(link);
      document.body.appendChild(banner);
      if (typeof window.ResizeObserver === 'function') new window.ResizeObserver(reserveBannerSpace).observe(banner);
      window.addEventListener('resize', reserveBannerSpace);
    }
    refresh(); render();
    document.addEventListener('click', event => {
      const opener = event.target.closest?.('[data-cookie-settings]');
      if (opener) { event.preventDefault(); openDialog(opener); }
    });
    document.addEventListener('kw:languagechange', render);
    document.addEventListener('focusin', event => {
      if (fallback && dialog.open && !dialog.contains(event.target)) dialogTitle.focus();
    });
    window.addEventListener('kw:languagechange', render);
    document.addEventListener('kw:analytics-event', customEvent);
    window.addEventListener('kw:analytics-event', customEvent);
    document.addEventListener('click', trackClick);
    document.addEventListener('scroll', trackScroll, { passive: true });
    window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) { refresh(); render(); } });
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  }
  window.KWConsent = Object.freeze({
    open: openDialog,
    getState: () => Object.freeze({ ...state, configured, forced: privacyForced(), storageAvailable, loaded, version: VERSION, expiresAt: record?.expiresAt || null })
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
