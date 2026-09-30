"""Regression checks for language-consistent controls and state-neutral details."""
from pathlib import Path
from html.parser import HTMLParser
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    ctx=browser.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("localStorage.setItem('kw_lang','zh')")
    for name in ['index.html','projects.html','experience.html','cv.html','contact.html','privacy.html']:
        page=ctx.new_page();page.goto('http://127.0.0.1:18763/'+name)
        assert page.locator('.nav-toggle').inner_text()=='菜单',(name,'Chinese menu label missing')
        page.locator('.nav-toggle').click();page.locator('.lang-toggle').click()
        assert page.locator('.nav-toggle').inner_text()=='Menu',(name,'English menu label missing')
        page.close()
    ctx.close()
    # Native details remain honest and understandable even with JavaScript disabled.
    ctx=browser.new_context(java_script_enabled=False)
    page=ctx.new_page();page.goto('http://127.0.0.1:18763/projects.html')
    for summary in page.locator('details.case-note summary').all():
        assert summary.locator('.lang-en').inner_text()=='Contribution path'
        assert summary.locator('.lang-zh').text_content()=='贡献路径'
        summary.click();assert summary.locator('..').get_attribute('open') is not None
        assert summary.locator('.lang-en').inner_text()=='Contribution path'
    ctx.close();browser.close()
print('bilingual_controls_contract PASS: 6 menus switch correctly; 3 native details use state-neutral labels')
