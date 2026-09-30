"""One vertical browser contract for project browsing."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page = b.new_page(viewport={'width':390,'height':844})
    page.goto('http://127.0.0.1:18763/projects.html',wait_until='load')
    assert page.locator('.project-filters').count() == 1, 'Missing progressive project filter'
    assert page.locator('.project-card:visible').count() == 3
    page.locator('[data-filter="research"]').click()
    assert page.locator('.project-card:visible').count() == 1
    assert page.locator('.project-card:visible').get_attribute('id') == 'measurement-research'
    assert page.locator('[data-filter="research"]').get_attribute('aria-pressed') == 'true'
    page.locator('.nav-toggle').click()
    page.locator('.lang-toggle').click()
    page.locator('.nav-toggle').click()
    assert page.locator('html').get_attribute('lang') == 'zh-CN'
    assert '1' in page.locator('.filter-status').inner_text()
    assert '项' in page.locator('.filter-status').inner_text()
    page.locator('[data-filter="all"]').click()
    assert page.locator('.project-card:visible').count() == 3
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    b.close()
print('project_filter_browser_contract PASS')
