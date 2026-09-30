"""Static release contract: current assets, canonical metadata and crawl scope."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, parse_qs
import hashlib, json, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
PAGES=['index.html','projects.html','experience.html','cv.html','contact.html','privacy.html']
ASSETS=['style.css','script.js','analytics-config.js','consent.js']
class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.meta={}; self.links=[]; self.scripts=[]; self.h1=0
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='meta': self.meta[d.get('name',d.get('property',''))]=d.get('content','')
        if tag=='link': self.links.append(d)
        if tag=='script' and 'src' in d: self.scripts.append(d['src'])
        if tag=='h1': self.h1+=1
for name in PAGES+['404.html']:
    p=Page(); p.feed((ROOT/name).read_text())
    refs=[x['href'] for x in p.links if x.get('rel')=='stylesheet']+p.scripts
    for asset in (["style.css","script.js"] if name=="404.html" else ASSETS):
        matching=[x for x in refs if urlsplit(x).path.lstrip("/")==asset]
        assert len(matching)==1,(name,asset,'missing or duplicate')
        digest=hashlib.sha256((ROOT/asset).read_bytes()).hexdigest()[:12]
        assert parse_qs(urlsplit(matching[0]).query).get('v')==[digest],(name,asset,'stale-cache protection missing')
    assert p.h1==1,(name,'h1')
    if name=='404.html':
        assert p.meta.get('robots')=='noindex';continue
    expected='https://kongxinwang.com/'+('' if name=='index.html' else name)
    assert [x['href'] for x in p.links if x.get('rel')=='canonical']==[expected]
    assert p.meta['og:url']==expected
    assert p.meta.get('description') and p.meta.get('og:title')
    assert p.meta.get('robots','')!='noindex'
    assert p.meta['og:image']=='https://kongxinwang.com/assets/og-kongxin-wang.jpg'
    assert p.meta['og:image:width']=='1200' and p.meta['og:image:height']=='630'
    assert p.meta['twitter:card']=='summary_large_image'
xml=ET.parse(ROOT/'sitemap.xml'); ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
urls=[x.text for x in xml.findall('.//s:loc',ns)]
expected={'https://kongxinwang.com/'+('' if x=='index.html' else x) for x in PAGES}
assert len(urls)==len(expected) and set(urls)==expected
robots=(ROOT/'robots.txt').read_text()
assert 'Sitemap: https://kongxinwang.com/sitemap.xml' in robots and 'Disallow: /tools/' in robots
home=(ROOT/'index.html').read_text(); start=home.index('<script type="application/ld+json">')+len('<script type="application/ld+json">')
person=json.loads(home[start:home.index('</script>',start)])
assert person['@type']=='Person' and person['alternateName']=='王孔鑫'
assert person['url']=='https://kongxinwang.com/'
print('release_seo_contract PASS: 7 versioned pages, 6 canonical sitemap URLs, Person schema, sharing metadata')
