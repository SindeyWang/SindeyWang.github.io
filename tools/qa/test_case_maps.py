from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 ctx=b.new_context(java_script_enabled=False,viewport={'width':390,'height':844})
 page=ctx.new_page();page.goto('http://127.0.0.1:18763/projects.html')
 assert page.locator('details.case-note').count()==3,'Each real case needs a no-JS contribution map'
 for detail in page.locator('details.case-note').all():
  assert not detail.get_attribute('open')
  detail.locator('summary').click()
  assert detail.locator('.case-map').is_visible()
  assert detail.locator('.case-map li').count()==3
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert '30' in page.locator('#measurement-research .case-map').inner_text()
 measurement=page.locator('#measurement-research .case-map').inner_text()
 assert '6' in measurement or 'six-item' in measurement
 b.close()
print('native_case_maps_contract PASS')
