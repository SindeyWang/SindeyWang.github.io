from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
robots=(ROOT/'robots.txt').read_text()
assert 'Disallow: /tools/' in robots,'Developer QA and résumé source templates must not be indexed as public portfolio content'
assert 'Allow: /' in robots
assert 'Sitemap: https://kongxinwang.com/sitemap.xml' in robots
assert 'Disallow: /assets/' not in robots,'Public fonts/images/CVs remain crawlable'
print('robots_public_content_contract PASS')
