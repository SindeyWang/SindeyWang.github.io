from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':390,'height':844})
 page.add_init_script("localStorage.setItem('kw_lang','zh')")
 page.goto('http://127.0.0.1:18763/privacy.html')
 assert page.locator('.skip-link').count()==1,'Privacy page must join the shared keyboard navigation contract'
 assert page.locator('main#main-content').count()==1
 assert page.locator('.lang-toggle').count()==1
 assert page.locator('.footer-settings').count()==1
 assert page.locator('html').get_attribute('lang')=='zh-CN'
 assert not page.locator('html').evaluate("el=>el.classList.contains('lang-en')")
 page.locator('.footer-settings [data-cookie-settings]').click()
 assert page.locator('#kw-cookie-dialog').is_visible()
 assert '尚未启用' in page.locator('#kw-cookie-description').inner_text()
 assert page.locator('#kw-cookie-analytics').is_hidden()
 page.keyboard.press('Escape')
 assert page.locator('.footer-settings [data-cookie-settings]').evaluate('el=>el===document.activeElement')
 b.close()
print('privacy_shared_contract PASS')
