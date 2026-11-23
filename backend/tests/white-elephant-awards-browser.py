"""Exercise the offline rehearsal against the real TV views and export review frames."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os

root = Path(__file__).resolve().parents[2]
out = root / 'review'
out.mkdir(exist_ok=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'))
    page = browser.new_page(viewport={'width':1920, 'height':1080}, reduced_motion='reduce')
    page.clock.install()
    page.goto((root/'awards-demo.html').as_uri())
    def shot(name):
        page.locator('nav').evaluate("n => n.style.visibility='hidden'")
        page.screenshot(path=out/(name+'.png'))
        page.locator('nav').evaluate("n => n.style.visibility=''")
    shot('01-game-complete')
    for n in (1,2,3,6,8,18,24,0):
        page.select_option('#count',str(n))
        page.locator('#next').click()
        if n:
            seen=[]
            for group in range((n+5)//6):
                winners=page.locator('.victory-grid strong').all_text_contents()
                assert len(winners)==min(6,n-group*6)
                seen.extend(winners)
                if n in (1,3,18):
                    shot(f'award-{n}-group-{group+1}')
                if len(seen)<n:
                    page.clock.fast_forward(4500)
            assert len(set(seen))==n
            for title in ('Most Robbed','Master Gift Thief','Longest Stealing Chain'):
                page.locator('#next').click()
                assert page.locator('h1').inner_text()==title
            page.locator('#next').click()
        assert page.locator('h1').inner_text()=='TOTAL CHAOS!'
        if n==18:shot('total-chaos')
        page.clock.fast_forward(4100)
        assert page.locator('h1').inner_text()=='Final results'
        if n==18:shot('final-results')
        for index in range(4):
            names=set()
            for _ in range(max(1,(n+1)//2)):
                names.update(page.locator('.summary').nth(index).locator('strong').all_text_contents())
                page.clock.fast_forward(4500)
            assert len(names)==n
    browser.close()
