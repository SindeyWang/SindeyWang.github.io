"""Bounded browser QA; reports and screenshots stay out of public site."""
from pathlib import Path
from urllib.parse import urlparse,unquote
import json,xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright
ROOT=Path('/home/ubuntu/kongxinwang-site-quality-20260930')
OUT=Path('/home/ubuntu/.hermes/artifacts/site-quality-20260930');OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:18763/'
PAGES=['index.html','projects.html','experience.html','cv.html','contact.html','privacy.html','404.html']
rows=[]; failures=[]; errors=[]; external=[]; axe_rows=[]
axe=Path('/tmp/kw-site-axe-4.10.3.js').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [320,390,768,1440]:
  for lang in ['en','zh']:
   ctx=browser.new_context(viewport={'width':width,'height':900})
   ctx.add_init_script(f"localStorage.setItem('kw_lang','{lang}')")
   for name in PAGES:
    page=ctx.new_page();page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('request',lambda r: external.append(r.url) if urlparse(r.url).hostname not in ['127.0.0.1','localhost',None] else None)
    page.goto(BASE+name,wait_until='load')
    if name=='projects.html':
     for item in page.locator('details.case-note summary').all(): item.click()
    metrics=page.evaluate('''() => ({overflow:document.documentElement.scrollWidth-innerWidth,lang:document.documentElement.lang,h1:document.querySelectorAll('h1').length,main:document.querySelectorAll('main').length,skipTarget:!!document.getElementById('main-content'),visibleEnglish:document.documentElement.lang==='zh-CN'?[...document.querySelectorAll('.lang-en')].filter(x=>x.getClientRects().length).length:0,visibleChinese:document.documentElement.lang==='en'?[...document.querySelectorAll('.lang-zh')].filter(x=>x.getClientRects().length).length:0})''')
    ok=metrics['overflow']<=0 and metrics['h1']==1 and metrics['main']==1 and metrics['skipTarget'] and metrics['visibleEnglish']==0 and metrics['visibleChinese']==0
    rows.append({'page':name,'width':width,'language':lang,'ok':ok,**metrics})
    if not ok: failures.append(rows[-1])
    if name!='404.html' and width<=768:
     page.locator('.nav-toggle').click();assert page.locator('.nav-toggle').get_attribute('aria-expanded')=='true'
     page.keyboard.press('Escape');assert page.locator('.nav-toggle').get_attribute('aria-expanded')=='false'
    # Automated WCAG audit, not a substitute for a screen-reader/manual review.
    if width in [390,1440]:
     page.add_script_tag(content=axe)
     result=page.evaluate("async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),passes:r.passes.length,incomplete:r.incomplete.map(v=>v.id)}}")
     axe_rows.append({'page':name,'width':width,'language':lang,**result})
    if name in ['index.html','projects.html'] and width in [390,1440]:
     page.screenshot(path=str(OUT/f'{name[:-5]}-{width}-{lang}.png'),full_page=True)
    page.close()
   ctx.close()
 # No-JS content and nav remain usable.
 ctx=browser.new_context(java_script_enabled=False,viewport={'width':390,'height':844})
 for name in PAGES:
  page=ctx.new_page();page.goto(BASE+name)
  assert page.locator('h1').is_visible()
  assert page.locator('main').is_visible()
  assert not page.locator('.lang-toggle').is_visible(), 'No-JS language button must not offer a non-working action'
  if name!='404.html':
   assert page.locator('.top-nav').is_visible()
  if name=='projects.html':assert page.locator('.project-card:visible').count()==3
  page.close()
 ctx.close()
 # Keyboard skip-to-content and mobile navigation focus.
 ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();page.goto(BASE)
 page.keyboard.press('Tab');assert page.locator('.skip-link').evaluate('(el)=>el===document.activeElement')
 page.keyboard.press('Enter');assert page.evaluate('location.hash')=='#main-content'
 page.locator('.nav-toggle').click();page.keyboard.press('Escape');assert page.locator('.nav-toggle').evaluate('(el)=>el===document.activeElement')
 ctx.close();browser.close()
# Same-site references: inspect src, href and IDs using the built-in HTMLParser.
from html.parser import HTMLParser
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.refs=[];self.ids=set();self.canonical=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if 'id' in d:self.ids.add(d['id'])
  for k in ['src','href']:
   if k in d:self.refs.append(d[k])
  if tag=='link' and d.get('rel')=='canonical':self.canonical.append(d['href'])
parsers={}
for name in PAGES:
 x=Parser();x.feed((ROOT/name).read_text());parsers[name]=x
broken=[]
for name,parser in parsers.items():
 for ref in parser.refs:
  u=urlparse(ref)
  if u.scheme or u.netloc:continue
  target=ROOT/unquote(u.path.lstrip('/')) if u.path else ROOT/name
  if u.path=='/':target=ROOT/'index.html'
  if target.is_dir():target=target/'index.html'
  if not target.exists():broken.append({'from':name,'ref':ref})
  elif u.fragment and target.suffix=='.html':
   check=Parser();check.feed(target.read_text())
   if u.fragment not in check.ids:broken.append({'from':name,'ref':ref,'reason':'missing fragment'})
violations=sum(len(x['violations']) for x in axe_rows)
report={'matrix_count':len(rows),'matrix_pass':sum(x['ok'] for x in rows),'matrix':rows,'nojs_pages':len(PAGES),'page_errors':errors,'external_requests_without_consent':sorted(set(external)),'broken_local_references':broken,'axe_audits':len(axe_rows),'axe_violations_total':violations,'axe':axe_rows,'screenshots':[x.name for x in OUT.glob('*.png')]}
(OUT/'qa-main.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ['matrix','axe','screenshots']},ensure_ascii=False,indent=2))
assert not failures and not errors and not external and not broken
assert violations==0,'Automated accessibility violations require correction'
