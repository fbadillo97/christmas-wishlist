"""Render real pages with a synthetic, local-only TV pairing for visual review."""
import base64
import json
import mimetypes
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from PIL import Image
from skimage import data
from io import BytesIO

root, output = map(Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
def jpeg(pixels):
    stream=BytesIO()
    Image.fromarray(pixels).save(stream,format="JPEG",quality=88)
    return stream.getvalue()
portrait,coffee=jpeg(data.astronaut()),jpeg(data.coffee())
names=["Avery Winter","Robin Snow","Alex Evergreen-Winter"]
titles=["Coffee Maker","Wool Throw","Record Player","Winter Tea Set","Pocket Projector","Board Game"]
board=dict(revision=3,phase="regular",active=1,turn=7,player_count=12,paused=False,revealed=names,
           gifts={str(i):dict(id=str(i),title=t,owner=i%3+1,steals=i%3,photo="coffee" if i==1 else None) for i,t in enumerate(titles,1)},
           portraits=[dict(id="portrait",title=names[0],photo="portrait")],last_move=None)
with sync_playwright() as pw:
    browser=pw.chromium.launch()
    page=browser.new_page(viewport=dict(width=1920,height=1080))
    def respond(route):
        req=route.request
        from urllib.parse import urlsplit
        path=urlsplit(req.url).path
        if path=="/config.json":return route.fulfill(json=dict(supabaseUrl="https://preview.supabase.co",publishableKey="sample"))
        if path.endswith('/we_tv_board'):return route.fulfill(json=board)
        if path.endswith('/we-gift-photo'):return route.fulfill(content_type='image/jpeg',body=portrait if req.post_data_json['gift']=='portrait' else coffee)
        if path.startswith('/rest/') or path.startswith('/auth/'):return route.fulfill(json=[])
        file=root/path.lstrip('/')
        if file.is_file():return route.fulfill(path=file,content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
        return route.fulfill(status=404)
    page.route('**/*',respond)
    # Local fixture requests share the page origin for the photo response.
    tv="https://preview.supabase.co/white-elephant-tv.html#game=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa&token=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    page.goto(tv)
    expect(page.locator('#number img')).to_have_js_property('naturalWidth',512)
    def shot(name):
        page.screenshot(path=str(output/(name+'.jpg')),type='jpeg',quality=88)
    shot('tv-idle')
    for kind,steals in [('open',0),('steal',1),('lock',3)]:
        board['revision']+=1
        board['last_move']=dict(kind='open' if kind=='open' else 'steal',actor=1,revision=board['revision'],gift='1')
        board['gifts']['1']['steals']=steals
        board['active']=2
        page.evaluate("window.dispatchEvent(new Event('online'))")
        expect(page.locator('#announcement')).to_have_attribute('data-kind',kind)
        page.wait_for_timeout(1900)
        shot('tv-'+kind)
    page.set_viewport_size(dict(width=3840,height=2160))
    shot('tv-lock-4k')
    page.set_viewport_size(dict(width=390,height=844))
    page.add_init_script("""localStorage.setItem('badillo-session',JSON.stringify({access_token:'test',expires_at:4102444800}));""")
    page.goto('https://preview.supabase.co/white-elephant-host.html')
    expect(page.locator('#setup')).to_be_visible()
    shot('host-mobile')
    page.goto('https://preview.supabase.co/index.html')
    shot('wishlist-mobile')
    browser.close()
