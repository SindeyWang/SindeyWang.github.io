'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');

// A deliberately small DOM/storage boundary; production consent.js executes unmodified.
function harness(options = {}) {
  const handlers = {}, winHandlers = {}, nodes = [], cookies = [], redirects = [], storage = new Map();
  if (options.stored !== undefined) storage.set('kw_consent', options.stored);
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.listeners = {}; this.hidden = false; this.open = false; this.checked = false; this.disabled = false; this.isConnected = true; }
    appendChild(el) { this.children.push(el); nodes.push(el); el.parentNode = this; return el; }
    append(...els) { els.forEach(el => this.appendChild(el)); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
    dispatchEvent(e) { e.currentTarget = this; (this.listeners[e.type] || []).forEach(fn => fn(e)); }
    closest(selector) { if (selector === '[hidden]') return this.hidden ? this : this.parentNode?.closest(selector); return null; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent({type: 'close'}); }
    querySelectorAll(selector = '') { const descendants = this.children.flatMap(el => [el, ...el.querySelectorAll('*')]); return descendants.filter(el => selector === '*' || (selector === '[data-kw-copy]' ? el.getAttribute('data-kw-copy') !== null : /^(BUTTON|INPUT|A)$/.test(el.tagName))); }
    remove() { this.isConnected = false; }
    contains(el) { return el === this || this.children.some(child => child.contains(el)); }
  }
  const document = {
    readyState: 'complete', documentElement: {lang: options.lang || 'en', scrollHeight: 2000, clientHeight: 500},
    referrer: options.referrer || 'https://kongxinwang.com/contact.html?email=secret@example.com',
    title: 'unsafe title secret@example.com', activeElement: null,
    createElement: tag => new Element(tag), head: new Element('head'), body: new Element('body'),
    addEventListener: (k, fn) => (handlers[k] ||= []).push(fn), querySelectorAll: () => [],
    get cookie() { return '_ga=abc; _ga_TEST=def; _gid=ghi; _gat_gtag_TEST=x; kw_lang=en'; },
    set cookie(v) { cookies.push(v); }
  };
  document.body.scrollHeight = 2000;
  const location = {origin: 'https://kongxinwang.com', hostname: 'kongxinwang.com', pathname: options.pathname || '/projects.html', href: 'https://kongxinwang.com/projects.html?email=secret@example.com#private', replace: url => redirects.push(url)};
  const window = {document, location, navigator: {globalPrivacyControl: !!options.gpc, doNotTrack: options.dnt || ''},
    innerHeight: 500, scrollY: 0,
    localStorage: {
      getItem: k => { if (options.readFail) throw new Error('blocked'); return storage.get(k) ?? null; },
      setItem: (k,v) => { if (options.writeFail) throw new Error('quota'); storage.set(k,String(v)); },
      removeItem: k => { if (options.writeFail) throw new Error('quota'); storage.delete(k); }
    },
    KW_ANALYTICS: options.config || {enabled: true, gtmId: 'GTM-TEST123'},
    addEventListener: (k, fn) => (winHandlers[k] ||= []).push(fn),
    dispatchEvent: e => (winHandlers[e.type] || []).forEach(fn => fn(e)),
    setTimeout: () => 1, clearTimeout: () => {}, CustomEvent: class {constructor(type, init) {this.type=type; this.detail=init?.detail;}}, URL
  };
  window.window = window;
  const context = vm.createContext({...window, window, document, location, navigator: window.navigator, localStorage: window.localStorage, console});
  const source = fs.existsSync(path.join(ROOT, 'consent.js')) ? fs.readFileSync(path.join(ROOT,'consent.js'),'utf8') : '';
  vm.runInContext(source, context, {filename: 'consent.js'});
  const dispatch = (type, detail = {}) => (handlers[type] || []).forEach(fn => fn({type, detail, ...detail, preventDefault() {this.defaultPrevented = true;}}));
  const click = label => { const el = nodes.find(el => el.tagName === 'BUTTON' && el.textContent === label && !el.closest('[hidden]')); assert.ok(el, `button ${label} exists`); el.dispatchEvent({type:'click', preventDefault(){}}); };
  return {window, document, nodes, storage, cookies, redirects, api: window.KWConsent, dispatch, click,
    scripts: () => nodes.filter(el => el.tagName === 'SCRIPT'),
    events: () => (window.dataLayer || []).filter(el => el.event && el.event !== 'gtm.js')};
}

function storedConsent(analytics, marketing, overrides = {}) {
  const now = Date.now();
  return JSON.stringify({version: 1, analytics, marketing, updatedAt: now, expiresAt: now + 180 * 86400000, ...overrides});
}

test('unconfigured production defaults are empty and disabled', () => {
  const context = vm.createContext({window: {}});
  const file = path.join(ROOT, 'analytics-config.js');
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file,'utf8'),context);
  assert.ok(context.window.KW_ANALYTICS, 'configuration module exists');
  assert.equal(context.window.KW_ANALYTICS.enabled, false);
  assert.equal(context.window.KW_ANALYTICS.gtmId, '');
});

test('first visit denies everything without loading tracking', () => {
  const h = harness();
  assert.ok(h.api, 'consent API exists');
  assert.equal(h.api.getState().analytics, false);
  assert.equal(h.api.getState().marketing, false);
  assert.equal(h.scripts().length, 0);
  assert.equal(h.events().length, 0);
});

test('accept persists a bounded, versioned choice and loads GTM only once', () => {
  const h = harness();
  h.click('Accept all');
  const saved = JSON.parse(h.storage.get('kw_consent'));
  assert.equal(saved.version, 1);
  assert.equal(saved.analytics, true);
  assert.equal(saved.marketing, true);
  assert.equal(saved.expiresAt - saved.updatedAt, 180 * 86400000);
  assert.equal(h.scripts().length, 1);
  assert.equal(h.scripts()[0].src, 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST123');
  h.api.open(); h.click('Accept all');
  assert.equal(h.scripts().length, 1);
  const commands = h.window.dataLayer.filter(e => e[0] === 'consent');
  assert.equal(commands[0][1], 'default');
  assert.equal(commands[0][2].analytics_storage, 'denied');
  assert.equal(commands[1][1], 'update');
  assert.equal(commands[1][2].ad_user_data, 'granted');
});

test('disabled or invalid ID never shows an automatic collection banner or loads a tag', () => {
  for (const config of [{enabled:false,gtmId:'GTM-TEST123'},{enabled:true,gtmId:''},{enabled:true,gtmId:'GTM-x<script>'},{enabled:'true',gtmId:'GTM-TEST123'}]) {
    const h = harness({config, stored: storedConsent(true, true)});
    assert.equal(h.scripts().length, 0);
    assert.equal(h.api.getState().analytics, false);
    assert.equal(h.nodes.some(el => el.textContent === 'Accept all' && !el.closest('[hidden]')), false);
    h.api.open();
    assert.ok(h.nodes.some(el => /not enabled/.test(el.textContent || '')));
  }
});

test('DNT and GPC override even previously granted consent', () => {
  for (const privacy of [{gpc:true},{dnt:'1'},{dnt:'yes'}]) {
    const h = harness({...privacy, stored: storedConsent(true,true)});
    assert.equal(h.api.getState().analytics, false);
    assert.equal(h.api.getState().marketing, false);
    assert.equal(h.scripts().length, 0);
    h.api.open();
    assert.ok(h.nodes.some(el => /privacy signal/.test(el.textContent || '')));
  }
});

test('malformed, expired, future, old-version and type-confused choices fail closed', () => {
  for (const stored of ['{bad', 'null', '[]', storedConsent('true',false), storedConsent(true,true,{version:0}), storedConsent(true,true,{expiresAt:Date.now()-1}), storedConsent(true,true,{updatedAt:Date.now()+100000}), storedConsent(true,true,{expiresAt:Date.now()+181*86400000})]) {
    const h = harness({stored});
    assert.equal(h.api.getState().analytics, false);
    assert.equal(h.scripts().length, 0);
  }
});

test('blocked reads or quota errors fail closed, including a stored grant', () => {
  for (const failure of [{readFail:true},{writeFail:true}]) {
    const h = harness({...failure, stored: storedConsent(true,true)});
    assert.equal(h.api.getState().analytics,false);
    assert.equal(h.scripts().length,0);
    h.api.open();
    assert.ok(h.nodes.some(el => /storage/.test(el.textContent || '')));
  }
});

test('reject is equal-priority, stored, and never loads tracking', () => {
  const h = harness(); h.click('Reject all');
  assert.equal(JSON.parse(h.storage.get('kw_consent')).analytics,false);
  assert.equal(h.scripts().length,0);
});

test('custom categories are independent and initially unchecked', () => {
  const h = harness(); h.click('Customize');
  const inputs = h.nodes.filter(el => el.tagName === 'INPUT');
  assert.equal(inputs.length,2);
  assert.ok(inputs.every(el => el.checked === false));
  inputs[1].checked = true; h.click('Save choices');
  assert.equal(h.api.getState().analytics,false);
  assert.equal(h.api.getState().marketing,true);
  assert.equal(h.scripts().length,1);
  assert.equal(h.events().length,0);
});

test('revocation denies, deletes GA cookies for host and parent domains and reloads clean path', () => {
  const h = harness(); h.click('Accept all'); h.api.open(); h.click('Reject all');
  assert.equal(h.api.getState().analytics,false);
  assert.equal(h.redirects[0],'/projects.html');
  const commands = h.window.dataLayer.filter(e => e[0] === 'consent');
  assert.equal(commands.at(-1)[2].analytics_storage,'denied');
  assert.equal(commands.at(-1)[2].ad_storage,'denied');
  assert.ok(h.cookies.some(c => c.startsWith('_ga=') && c.includes('Domain=kongxinwang.com')));
  assert.ok(h.cookies.some(c => c.startsWith('_ga_TEST=') && c.includes('Domain=.kongxinwang.com')));
  assert.ok(h.cookies.every(c => c.includes('Path=/')));
  assert.ok(h.cookies.every(c => !c.startsWith('kw_lang=')));
});

test('analytics page view uses only fixed path/title and sanitized same-origin referrer', () => {
  const h = harness(); h.click('Accept all');
  const views = h.events().filter(e => e.event === 'kw_page_view');
  assert.equal(views.length,1);
  assert.equal(views[0].page_path,'/projects.html');
  assert.equal(views[0].page_location,'/projects.html');
  assert.equal(views[0].page_referrer,'/contact.html');
  assert.equal(views[0].page_title,'Projects | Kongxin Wang');
  assert.ok(!JSON.stringify(h.window.dataLayer).includes('secret@example.com'));
  const foreign = harness({referrer:'https://outside.example/private?email=secret@example.com'}); foreign.click('Accept all');
  assert.equal(foreign.events()[0].page_referrer,'');
});

test('unknown paths and marketing-only grants never emit analytics', () => {
  const h = harness({pathname:'/private/secret@example.com', stored: storedConsent(true,true)});
  assert.equal(h.scripts().length,0);
  assert.equal(h.events().length,0);
  const marketing = harness({stored: storedConsent(false,true)});
  marketing.dispatch('kw:analytics-event',{event:'language_switch',language:'zh'});
  assert.equal(marketing.events().length,0);
});

test('custom analytics events drop arbitrary attributes and reject unknown names or values', () => {
  const h = harness();
  h.dispatch('kw:analytics-event',{event:'project_filter',category:'finance'});
  assert.equal(h.events().length,0);
  h.click('Accept all');
  h.dispatch('kw:analytics-event',{event:'language_switch',language:'zh',email:'secret@example.com',url:'https://private.example/'});
  h.dispatch('kw:analytics-event',{event:'project_filter',category:'finance',email:'secret@example.com'});
  h.dispatch('kw:analytics-event',{event:'project_filter',category:'secret@example.com'});
  h.dispatch('kw:analytics-event',{event:'language_switch',language:'secret@example.com'});
  h.dispatch('kw:analytics-event',{event:'unknown',email:'secret@example.com'});
  h.dispatch('kw:analytics-event',{event:'contact_click',link_kind:'email'});
  assert.deepEqual(Array.from(h.events(), e => e.event),['kw_page_view','language_switch','project_filter']);
  assert.ok(!JSON.stringify(h.events()).includes('secret@example.com'));
  assert.ok(!JSON.stringify(h.events()).includes('private.example'));
});

test('delegated clicks send only known resume language or contact kind', () => {
  const h = harness(); h.click('Accept all');
  const clickURL = href => h.dispatch('click',{target:{closest: selector => selector === 'a[href]' ? {getAttribute: () => href} : null}});
  clickURL('/assets/cv/Kongxin_Wang_Resume_ZH.pdf?private=secret@example.com');
  clickURL('mailto:secret@example.com?subject=private');
  clickURL('https://www.linkedin.com/in/wangkongxin/');
  clickURL('https://github.com/SindeyWang');
  clickURL('/assets/cv/secret@example.com.pdf');
  clickURL('https://unknown.example/');
  assert.deepEqual(Array.from(h.events(), e => e.event),['kw_page_view','resume_download','contact_click','contact_click','contact_click']);
  assert.equal(h.events()[1].resume_language,'zh');
  assert.equal(h.events()[2].link_kind,'email');
  assert.ok(!JSON.stringify(h.events()).includes('secret@example.com'));
});

test('75 percent scroll is emitted once, only after analytics consent and a subsequent scroll', () => {
  const h = harness();
  h.window.scrollY=1200; h.dispatch('scroll');
  assert.equal(h.events().length,0);
  h.click('Accept all');
  assert.equal(h.events().filter(e => e.event === 'read_depth').length,0);
  h.window.scrollY=900; h.dispatch('scroll');
  assert.equal(h.events().filter(e => e.event === 'read_depth').length,0);
  h.window.scrollY=1125; h.dispatch('scroll'); h.dispatch('scroll');
  assert.equal(h.events().filter(e => e.event === 'read_depth').length,1);
  assert.equal(h.events().at(-1).percent,75);
});

test('cross-tab revocation and late storage failure stop events and reload', () => {
  for (const cause of ['clear','quota']) {
    const options = {};
    const h = harness(options); h.click('Accept all');
    if (cause === 'clear') h.storage.delete('kw_consent');
    else options.writeFail = true;
    h.dispatch('kw:analytics-event',{event:'language_switch',language:'zh'});
    assert.equal(h.events().length,1);
    assert.equal(h.redirects.length,1);
  }
});

test('language change updates the banner and dialog without changing consent', () => {
  const h = harness(); h.document.documentElement.lang='zh-CN'; h.dispatch('kw:languagechange');
  assert.ok(h.nodes.some(el => el.textContent === '全部拒绝'));
  assert.equal(h.nodes.find(el => el.className === 'kw-consent-banner').getAttribute('aria-label'),'Cookie 设置');
  h.click('自定义');
  assert.ok(h.nodes.some(el => el.textContent === '保存选择'));
  assert.equal(h.api.getState().analytics,false);
});

test('window-dispatched language and filter events match the parent API without bubbling duplicates', () => {
  const h = harness();
  h.document.documentElement.lang = 'zh-CN';
  h.window.dispatchEvent({type:'kw:languagechange',detail:{language:'zh'}});
  assert.ok(h.nodes.some(el => el.textContent === '全部拒绝'));
  h.click('全部接受');
  const e = {type:'kw:analytics-event',detail:{event:'project_filter',category:'outreach'}};
  h.window.dispatchEvent(e); h.window.dispatchEvent(e);
  assert.equal(h.events().filter(e => e.event === 'project_filter').length,1);
  h.window.dispatchEvent({type:'kw:analytics-event',detail:{event:'language_switch',language:'en'}});
  assert.equal(h.events().filter(e => e.event === 'language_switch').length,1);
});

test('Escape closes dialog, returns focus and grants nothing', () => {
  const h = harness();
  const opener = h.document.createElement('button'); opener.focus(); h.api.open(opener);
  const d = h.nodes.find(el => el.tagName === 'DIALOG');
  assert.equal(d.open,true);
  d.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){}});
  assert.equal(d.open,false);
  assert.equal(h.document.activeElement,opener);
  assert.equal(h.scripts().length,0);
});
