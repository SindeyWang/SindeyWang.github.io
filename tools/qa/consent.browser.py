"""Offline Chromium integration: local route fulfillment, NO external requests.
Run: /home/ubuntu/hermes-venv/bin/python tools/qa/consent.browser.py
The synthetic GTM ID is a test fixture only; no Google container is fetched.
No server, dependency install, real provider ID, or publication is required.
"""
from pathlib import Path
from urllib.parse import urlsplit
import json
import mimetypes
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = 'https://consent-test.invalid'
CONFIG = "window.KW_ANALYTICS={enabled:true,gtmId:'GTM-TEST123'};"
results = []


def run_case(browser, name, action, *, config=None, signal=None, stored=False, storage_failure=False, fallback=False, no_inert=False, viewport=None):
    context = browser.new_context(viewport=viewport or {'width': 390, 'height': 844})
    attempted_external = []
    errors = []

    def route_request(route):
        request = route.request
        url = urlsplit(request.url)
        if url.netloc != 'consent-test.invalid':
            attempted_external.append({'url': request.url, 'headers': request.headers})
            route.abort()  # Never contact Google/LinkedIn or another remote host.
            return
        requested_path = url.path.lstrip('/') or 'index.html'
        target = (ROOT / requested_path).resolve()
        if ROOT not in target.parents or not target.is_file():
            route.fulfill(status=404, body='Not found')
            return
        if requested_path == 'analytics-config.js' and config is not None:
            route.fulfill(content_type='application/javascript', body=config)
        else:
            route.fulfill(body=target.read_bytes(), content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

    context.route('**/*', route_request)
    if signal:
        context.add_init_script(f"Object.defineProperty(navigator,{json.dumps(signal)},{'{'}get:()=>{('true' if signal == 'globalPrivacyControl' else chr(39)+'1'+chr(39))}{'}'});")
    if stored:
        context.add_init_script("localStorage.setItem('kw_consent',JSON.stringify({version:1,analytics:true,marketing:true,updatedAt:Date.now(),expiresAt:Date.now()+180*86400000}));")
    if storage_failure:
        context.add_init_script("Storage.prototype.setItem=function(){throw new Error('test quota');};")
    if fallback:
        context.add_init_script('HTMLDialogElement.prototype.showModal=undefined;')
    if no_inert:
        context.add_init_script("Object.defineProperty(HTMLElement.prototype,'inert',{get:()=>false,set:()=>{}});")
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(ORIGIN + '/privacy.html?email=secret%40example.com#private', wait_until='networkidle')
    page.wait_for_function('Boolean(window.KWConsent)')
    action(page, context, attempted_external)
    assert not errors, errors
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'
    results.append({'case': name, 'status': 'PASS', 'external_attempts': len(attempted_external)})
    context.close()


def open_settings(page):
    button = page.locator('main [data-cookie-settings]').first
    button.click()
    expect(page.locator('#kw-cookie-dialog')).to_be_visible()
    return button


def default_case(page, context, requests):
    assert not requests
    assert page.locator('.kw-consent-banner').count() == 0
    opener = open_settings(page)
    expect(page.locator('#kw-cookie-description')).to_contain_text('not enabled')
    assert not page.locator('#kw-cookie-dialog input').first.is_visible()
    assert not page.get_by_role('button', name='Accept all', exact=True).is_visible()
    page.keyboard.press('Escape')
    expect(page.locator('#kw-cookie-dialog')).to_be_hidden()
    expect(opener).to_be_focused()
    if page.locator('.nav-toggle').is_visible():
        page.locator('.nav-toggle').click()
    page.locator('.top-header .lang-toggle').click()
    if page.locator('.nav-toggle').get_attribute('aria-expanded') == 'true':
        page.locator('.nav-toggle').click()
    assert page.locator('html').get_attribute('lang') == 'zh-CN'
    open_settings(page)
    expect(page.locator('#kw-cookie-title')).to_have_text('Cookie 设置')
    expect(page.locator('#kw-cookie-description')).to_contain_text('尚未启用')
    assert not requests


def signal_case(page, context, requests):
    assert not requests
    assert page.evaluate('KWConsent.getState().analytics') is False
    open_settings(page)
    expect(page.locator('#kw-cookie-description')).to_contain_text('privacy signal')
    assert not page.get_by_role('button', name='Accept all', exact=True).is_visible()


def storage_case(page, context, requests):
    assert not requests
    open_settings(page)
    expect(page.locator('#kw-cookie-description')).to_contain_text('storage')
    assert page.evaluate('KWConsent.getState().analytics') is False


def reject_case(page, context, requests):
    banner = page.locator('.kw-consent-banner')
    expect(banner).to_be_visible()
    styles = banner.locator('button').evaluate_all("els=>els.map(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,border:getComputedStyle(el).border,minHeight:getComputedStyle(el).minHeight}))")
    assert styles[0] == styles[1] == styles[2], styles
    banner.get_by_role('button', name='Reject all', exact=True).click()
    expect(banner).to_be_hidden()
    assert not requests
    assert page.evaluate("JSON.parse(localStorage.getItem('kw_consent')).analytics") is False
    page.reload(wait_until='networkidle')
    expect(page.locator('.kw-consent-banner')).to_be_hidden()
    assert not requests


def marketing_case(page, context, requests):
    page.locator('.kw-consent-banner').get_by_role('button', name='Customize', exact=True).click()
    dialog = page.locator('#kw-cookie-dialog')
    expect(dialog).to_be_visible()
    expect(page.locator('#kw-cookie-analytics')).not_to_be_checked()
    expect(page.locator('#kw-cookie-marketing')).not_to_be_checked()
    page.locator('#kw-cookie-marketing').check()
    dialog.get_by_role('button', name='Save choices', exact=True).click()
    page.wait_for_timeout(100)
    assert len(requests) == 1, requests
    assert 'referer' not in requests[0]['headers'], requests
    assert page.evaluate('KWConsent.getState().marketing') is True
    assert page.evaluate('KWConsent.getState().analytics') is False
    assert page.evaluate("dataLayer.filter(e=>e.event==='kw_page_view').length") == 0


def accept_revoke_case(page, context, requests):
    page.locator('.kw-consent-banner').get_by_role('button', name='Accept all', exact=True).click()
    page.wait_for_timeout(100)
    assert len(requests) == 1, requests
    assert requests[0]['url'] == 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST123'
    assert 'referer' not in requests[0]['headers']
    page.evaluate("""() => {
      document.dispatchEvent(new CustomEvent('kw:analytics-event',{detail:{event:'project_filter',category:'research',email:'secret@example.com'}}));
      const a=document.createElement('a');a.href='mailto:secret@example.com';document.body.append(a);
      a.addEventListener('click',e=>e.preventDefault());a.click();a.remove();
      const a2=document.createElement('a');a2.href='/assets/cv/Kongxin_Wang_Resume_EN.pdf?email=secret@example.com';document.body.append(a2);
      a2.addEventListener('click',e=>e.preventDefault());a2.click();a2.remove();
      window.scrollTo(0,document.documentElement.scrollHeight);
    }""")
    page.wait_for_function("dataLayer.some(e=>e.event==='read_depth')", timeout=5000)
    payloads = page.evaluate("dataLayer.filter(e=>e.event&&e.event!=='gtm.js')")
    assert [e['event'] for e in payloads] == ['kw_page_view','project_filter','contact_click','resume_download','read_depth'], payloads
    assert 'secret@example.com' not in json.dumps(payloads)
    assert all(e['page_path'] == '/privacy.html' and e['page_location'] == '/privacy.html' for e in payloads)
    context.add_cookies([{'name':'_ga','value':'test','domain':'consent-test.invalid','path':'/'},{'name':'_gid','value':'test','domain':'.consent-test.invalid','path':'/'}])
    open_settings(page)
    with page.expect_navigation(wait_until='networkidle'):
        page.locator('#kw-cookie-dialog').get_by_role('button', name='Reject all', exact=True).click()
    assert page.url == ORIGIN + '/privacy.html', page.url
    assert page.evaluate('KWConsent.getState().analytics') is False
    assert len(requests) == 1, requests
    assert not any(c['name'].startswith(('_ga','_gid','_gat')) for c in context.cookies())


def fallback_case(page, context, requests):
    opener = open_settings(page)
    title = page.locator('#kw-cookie-title')
    expect(title).to_be_focused()
    page.keyboard.press('Tab')
    assert page.evaluate("document.querySelector('#kw-cookie-dialog').contains(document.activeElement)")
    page.keyboard.press('Escape')
    expect(page.locator('#kw-cookie-dialog')).to_be_hidden()
    expect(opener).to_be_focused()
    assert not requests


def fallback_no_inert_case(page, context, requests):
    open_settings(page)
    page.evaluate("document.querySelector('main [data-cookie-settings]').focus()")
    assert page.evaluate("document.querySelector('#kw-cookie-dialog').contains(document.activeElement)"), 'fallback focus escaped without inert support'
    assert page.locator('.kw-consent-backdrop').is_visible(), 'fallback pointer blocker missing'
    page.keyboard.press('Escape')
    assert not page.locator('.kw-consent-backdrop').is_visible()
    assert not requests


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium-browser', args=['--disable-dev-shm-usage'])
    try:
        run_case(browser, 'explicit disabled fixture, bilingual dialog, Escape/focus, mobile', default_case, config="window.KW_ANALYTICS={enabled:false,gtmId:''};")
        run_case(browser, 'enabled but missing ID', default_case, config="window.KW_ANALYTICS={enabled:true,gtmId:''};")
        run_case(browser, 'GPC overrides stored grants', signal_case, config=CONFIG, signal='globalPrivacyControl', stored=True)
        run_case(browser, 'DNT overrides stored grants', signal_case, config=CONFIG, signal='doNotTrack', stored=True)
        run_case(browser, 'storage failure stays denied', storage_case, config=CONFIG, storage_failure=True)
        run_case(browser, 'equal-priority buttons and persisted rejection', reject_case, config=CONFIG)
        run_case(browser, 'marketing-only custom consent; no analytics', marketing_case, config=CONFIG)
        run_case(browser, 'accept, sanitized events, cookie cleanup, revocation reload', accept_revoke_case, config=CONFIG, viewport={'width': 1440, 'height': 900})
        run_case(browser, 'native-dialog fallback and focus return', fallback_case, config=CONFIG, fallback=True)
        run_case(browser, 'fallback without inert keeps focus and blocks background pointer', fallback_no_inert_case, config=CONFIG, fallback=True, no_inert=True)
    finally:
        browser.close()
print(json.dumps({'browser':'Chromium', 'passed':len(results),'failed':0,'cases':results},ensure_ascii=False,indent=2))
