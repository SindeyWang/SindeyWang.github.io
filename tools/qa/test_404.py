from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path('/home/ubuntu/kongxinwang-site-quality-20260930')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':390,'height':844})
 page.goto('http://127.0.0.1:18763/404.html')
 assert page.locator('h1').inner_text() != 'Redirecting…', 'Unknown URLs need an honest, navigable 404'
 assert page.locator('meta[name="robots"]').count() == 1, '404 must be excluded from indexing'
 assert page.locator('meta[name="robots"]').get_attribute('content') == 'noindex'
 assert page.locator('main a[href="/"]').count() == 1
 b.close()
print('honest_404_contract PASS')
