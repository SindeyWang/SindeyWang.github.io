"""Real Google endpoints; only explicit test opt-in sends events. --live uses published site."""
from pathlib import Path
from urllib.parse import urlsplit,parse_qs,unquote
import json,mimetypes,sys,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
OUT=Path.home()/'.hermes/artifacts/google-site-setup'
LIVE='--live' in sys.argv
BASE='https://kongxinwang.com'
MARKER='kw-private-probe-20260930'
results=[]

def run(browser,name,action,signal=None):
 ctx=browser.new_context(viewport={'width':390,'height':844},user_agent=f'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{browser.version} Safari/537.36')
 errors=[];external=[];collect=[];statuses=[]
 if signal:ctx.add_init_script(f"Object.defineProperty(navigator,{json.dumps(signal)},{{get:()=>{('true' if signal=='globalPrivacyControl' else chr(39)+'1'+chr(39))}}});")
 def record(req):
  u=urlsplit(req.url)
  if u.hostname!='kongxinwang.com':external.append({'url':req.url,'body':req.post_data or ''})
  if 'google-analytics.com' in (u.hostname or '') and '/g/collect' in u.path:
   for line in ((req.post_data or '').splitlines() or ['']):
    q=parse_qs(u.query+'&'+line,keep_blank_values=True)
    collect.append({k:v[0] for k,v in q.items() if k in ['en','tid','dl','dr','dt','gcs','gcd'] or k.startswith(('ep.','epn.'))})
 def response(res):
  if 'google-analytics.com' in (urlsplit(res.url).hostname or '') and '/g/collect' in urlsplit(res.url).path:statuses.append(res.status)
 ctx.on('request',record);ctx.on('response',response)
 if not LIVE:
  def route(route):
   u=urlsplit(route.request.url)
   if u.hostname!='kongxinwang.com':route.continue_();return
   path=u.path.lstrip('/') or 'index.html';f=(ROOT/path).resolve()
   if ROOT not in f.parents or not f.is_file():route.fulfill(status=404,body='Not found');return
   route.fulfill(body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
  ctx.route('**/*',route)
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/privacy.html?probe='+MARKER+'#'+MARKER,wait_until='networkidle')
 page.wait_for_function('Boolean(window.KWConsent)')
 assert not external,external
 if page.locator('.kw-consent-banner').is_visible():
  assert page.locator('.kw-consent-banner').bounding_box()['height'] <= 280,'Initial mobile notice dominates the viewport'
 action(page,ctx,external,collect,statuses)
 assert not errors,errors
 serialized=json.dumps(external,ensure_ascii=False)
 assert MARKER not in unquote(serialized),'Private query/hash reached a Google request'
 assert not any('linkedin' in x['url'] or 'doubleclick' in x['url'] for x in external),external
 results.append({'case':name,'status':'PASS','external_request_count':len(external),'collect_events':[x.get('en') for x in collect],'collect_http_statuses':statuses})
 ctx.close()

def deny(page,ctx,external,collect,statuses):
 page.locator('.kw-consent-banner').get_by_role('button',name='Reject all',exact=True).click();page.reload(wait_until='networkidle')
 assert not external
 assert not any(c['name'].startswith(('_ga','_gid','_gat')) for c in ctx.cookies())

def signal(page,ctx,external,collect,statuses):
 assert page.evaluate('KWConsent.getState().analytics') is False
 page.locator('main [data-cookie-settings]').click()
 expect(page.locator('#kw-cookie-description')).to_contain_text('privacy signal')
 assert not external

def optin(page,ctx,external,collect,statuses):
 page.locator('.kw-consent-banner').get_by_role('button',name='Customize',exact=True).click()
 expect(page.locator('#kw-cookie-marketing')).not_to_be_visible()
 page.locator('#kw-cookie-analytics').check();page.locator('#kw-cookie-dialog').get_by_role('button',name='Save choices',exact=True).click()
 deadline=time.monotonic()+35
 while not collect and time.monotonic()<deadline:page.wait_for_timeout(500)
 assert collect,'No real Google Analytics collect event received by browser'
 page.wait_for_timeout(2000)
 pv=[x for x in collect if x.get('en')=='page_view'];assert len(pv)==1,collect
 assert pv[0]['tid']=='G-27PSMLEKYC'
 assert pv[0]['dl']==BASE+'/privacy.html',pv
 assert pv[0].get('dr','')=='',pv
 assert statuses and all(x in [200,204] for x in statuses),statuses
 assert page.evaluate('KWConsent.getState().marketing') is False
 ga=[c for c in ctx.cookies() if c['name'].startswith('_ga')];assert ga,'Expected analytics cookie after explicit opt-in'
 assert all(c['expires']-time.time()<=181*86400 for c in ga),[(c['name'],c['expires']) for c in ga]
 page.evaluate("""() => {
  document.dispatchEvent(new CustomEvent('kw:analytics-event',{detail:{event:'project_filter',category:'research',email:'kw-private-probe-20260930'}}));
  for (const href of ['mailto:kw-private-probe-20260930@example.invalid','/assets/cv/Kongxin_Wang_Resume_EN.pdf?probe=kw-private-probe-20260930']) {
   const a=document.createElement('a');a.href=href;document.body.append(a);a.addEventListener('click',e=>e.preventDefault());a.click();a.remove();
  }
  window.scrollTo(0,document.documentElement.scrollHeight);
 }""")
 page.wait_for_timeout(3500)
 # Language switch is an actual UI action; the front-end suppresses duplicate initial page_view.
 if page.locator('.nav-toggle').is_visible():page.locator('.nav-toggle').click()
 page.locator('.top-header .lang-toggle').click()
 deadline=time.monotonic()+15
 while 'language_switch' not in {x.get('en') for x in collect} and time.monotonic()<deadline:page.wait_for_timeout(500)
 got={x.get('en') for x in collect}
 assert {'page_view','project_filter','contact_click','resume_download','read_depth','language_switch'}<=got,collect
 assert len([x for x in collect if x.get('en')=='page_view'])==1,collect
 assert all(x.get('dl')==BASE+'/privacy.html' for x in collect),collect
 # Explicitly check actual native runtime after revocation/reload.
 page.evaluate('KWConsent.open()')
 before_revoke=len(collect)
 with page.expect_navigation(wait_until='load'):
  page.locator('#kw-cookie-dialog').get_by_role('button',name='全部拒绝',exact=True).click()
 assert page.url==BASE+'/privacy.html'
 assert len(collect)==before_revoke,'A denied-transition Google analytics request escaped the transport gate'
 assert page.evaluate('KWConsent.getState().analytics') is False
 assert not any(c['name'].startswith(('_ga','_gid','_gat')) for c in ctx.cookies())
 n=len(collect);m=len(external)
 page.wait_for_timeout(3000);page.reload(wait_until='networkidle');page.wait_for_timeout(1000)
 assert len(collect)==n and len(external)==m,'Google requests continued after denial/reload'
 print('Verified six native events; Google collection succeeded; post-reload denial quiet.',flush=True)
 (OUT/('live-collect-sanitized.json' if LIVE else 'preflight-collect-sanitized.json')).write_text(json.dumps(collect,ensure_ascii=False,indent=2))

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/snap/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 run(browser,'reject_and_reload_no_google',deny)
 run(browser,'DNT_no_google',signal,'doNotTrack')
 run(browser,'GPC_no_google',signal,'globalPrivacyControl')
 run(browser,'optin_six_events_private_fields_and_revoke',optin)
 browser.close()
report={'mode':'live' if LIVE else 'local-site-real-Google-container','cases':results,'passed':len(results),'configuration_complete':True}
(OUT/('live-browser-report.json' if LIVE else 'preflight-browser-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
