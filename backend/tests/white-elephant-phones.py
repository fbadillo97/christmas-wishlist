"""Two mobile browser sessions using the staged console and a disposable PostgREST service."""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import threading
import time
import traceback
import subprocess
import atexit
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg
from playwright.async_api import async_playwright, expect


def test_token(user):
    def part(data):
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
    claims = {"sub": str(user), "role": "authenticated", "exp": int(time.time()) + 3600}
    body = part(b'{"alg":"HS256","typ":"JWT"}') + "." + part(json.dumps(claims).encode())
    signature = hmac.digest(os.environ["TEST_JWT_SECRET"].encode(), body.encode(), hashlib.sha256)
    return body + "." + part(signature)


async def run():
    host_a, host_b = uuid4(), uuid4()
    with psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as admin:
        # PostgREST makes verified JWT claims available under request.jwt.claims.
        admin.execute("""CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
            $$ SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$""")
        for host, role in [(host_a, "editor"), (host_b, "viewer")]:
            email = f"{host}@example.invalid"
            admin.execute("INSERT INTO auth.users VALUES (%s,%s,now())", (host,email))
            admin.execute("INSERT INTO wishlist_private.family_members VALUES (%s,%s,true)", (email,role))
        admin.execute("UPDATE wishlist_private.family_members SET first_name='Robin',last_name='Winter' WHERE email=%s",(f"{host_b}@example.invalid",))
        admin.execute("UPDATE wishlist_private.family_members SET first_name='Casey',last_name='Host' WHERE email=%s",(f"{host_a}@example.invalid",))
        admin.execute("NOTIFY pgrst, 'reload schema'")

    rest = "http://127.0.0.1:3000"
    origin = ""
    attempts = []
    sent, release = threading.Event(), threading.Event()
    peer_token = test_token(host_b)

    objects, accounts = {}, {}

    class FixtureServer(SimpleHTTPRequestHandler):
        def reply(self, status, body, mime='application/json'):
            self.send_response(status)
            self.send_header("Content-Type",mime)
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            prefix='/storage/v1/object/authenticated/we-gift-photos/'
            if self.path.startswith(prefix):
                data=objects.get(self.path[len(prefix):])
                if self.headers.get('Authorization')=='Bearer fixture-service' and data:
                    self.reply(200,data,'image/jpeg')
                else: self.reply(403,b'{}')
                return
            if self.path == "/config.json":
                self.reply(200,json.dumps({"supabaseUrl":origin,"publishableKey":"fixture"}).encode())
            elif self.path == "/auth/v1/user":
                self.reply(200,b'{"id":"fixture"}')
            else:
                super().do_GET()

        def do_POST(self):
            if self.path=='/functions/v1/we-gift-photo':
                auth=self.headers.get('Authorization')
                body=self.rfile.read(int(self.headers['Content-Length']))
                req=Request('http://127.0.0.1:8000/',data=body,headers={'Content-Type':'application/json',**({'Authorization':auth} if auth else {})})
                try: result=urlopen(req,timeout=5)
                except HTTPError as e: result=e
                with result: self.reply(result.status,result.read(),result.headers.get_content_type())
                return
            prefix='/storage/v1/object/we-gift-photos/'
            if self.path.startswith(prefix):
                path=self.path[len(prefix):]
                raw=self.rfile.read(int(self.headers['Content-Length']))
                user=accounts[self.headers['Authorization']]
                with psycopg.connect(os.environ['TEST_DATABASE_URL'],autocommit=True) as db:
                    db.execute('SET ROLE authenticated')
                    db.execute("select set_config('request.jwt.claims',%s,false)",(json.dumps({'sub':str(user)}),))
                    db.execute("insert into storage.objects values('we-gift-photos',%s)",(path,))
                objects[path]=raw
                self.reply(200,b'{}')
                return
            if self.path not in ("/rest/v1/rpc/we_active_host_games","/rest/v1/rpc/we_host_action","/rest/v1/rpc/we_pair_tv","/rest/v1/rpc/we_tv_board","/rest/v1/rpc/we_attach_photo","/rest/v1/rpc/we_start_game","/rest/v1/rpc/we_cohost_choices","/rest/v1/rpc/we_viewer_player_names","/rest/v1/rpc/we_viewer_choices","/rest/v1/rpc/we_account_portrait"):
                self.send_error(404)
                return
            body = self.rfile.read(int(self.headers["Content-Length"]))
            command = json.loads(body).get("command")
            auth = self.headers.get("Authorization")
            if auth == "Bearer " + peer_token and command == "confirm" and not sent.is_set():
                sent.set()
                if not release.wait(8):
                    self.reply(504,b'{"message":"Test synchronization timed out"}')
                    return
            request = Request(rest + self.path.removeprefix("/rest/v1"),data=body,
                              headers={"Content-Type":"application/json", **({"Authorization":auth} if auth else {})})
            try:
                result = urlopen(request,timeout=5)
            except HTTPError as error:
                result = error
            with result:
                payload = result.read()
                if command and command != "read":
                    attempts.append((command,result.status,json.loads(payload).get("code")))
                self.reply(result.status,payload)

    server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureServer)
    origin = f"http://127.0.0.1:{server.server_port}"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    edge=subprocess.Popen(['deno','run','--allow-env','--allow-net','supabase/functions/we-gift-photo/index.ts'],
                          env={**os.environ,'SUPABASE_URL':origin,'SUPABASE_ANON_KEY':'fixture','SUPABASE_SERVICE_ROLE_KEY':'fixture-service'})
    atexit.register(edge.terminate)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        phones = []
        for user, width in [(host_a, 375), (host_b, 390)]:
            ctx = await browser.new_context(viewport={"width":width,"height":812}, is_mobile=True, has_touch=True)
            token = peer_token if user == host_b else test_token(user)
            accounts["Bearer "+token]=user
            session = json.dumps({"access_token":token,"expires_at":time.time()+3600})
            await ctx.add_init_script("if (!sessionStorage.boot) {localStorage.setItem('badillo-session'," +
                                      json.dumps(session) + ");sessionStorage.boot='1'}")
            page = await ctx.new_page()
            phones.append(page)

        api = await pw.request.new_context(base_url=rest, extra_http_headers={"Authorization":"Bearer "+test_token(host_a)})
        start = {"request_id":str(uuid4()),"names":["Red","Blue","Green"],"cohosts":[str(host_b)]}
        a,b=phones
        await a.goto(origin+"/white-elephant-host.html")
        async def upload(page,label,color):
            encoded=await page.evaluate("""color=>{const c=document.createElement('canvas'); c.width=c.height=10;
              const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,10,10);return c.toDataURL().split(',')[1]}""",color)
            await page.get_by_label(label).set_input_files({'name':'gift.png','mimeType':'image/png','buffer':base64.b64decode(encoded)})
        editor = a.get_by_role("checkbox",name="Casey Host",exact=True)
        setup_reads = []
        a.on("request", lambda req: setup_reads.append(req.url) if req.url.endswith("/we_host_action") else None)
        await editor.check()
        await a.evaluate("""() => {
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('offline'));
            window.dispatchEvent(new Event('online'));
        }""")
        await a.wait_for_timeout(300)
        assert not setup_reads
        await expect(editor).to_be_checked()
        await expect(a.locator("#roster-count")).to_have_text("1 contestant selected")
        await editor.uncheck()
        assert await a.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await a.locator("#recipients > div").filter(has_text="Robin Winter").locator("summary").click()
        await expect(a.get_by_role("checkbox",name="Red",exact=True)).to_have_count(0)
        await upload(a,"Save account photo for Robin Winter","yellow")
        await a.get_by_role("button",name="Use saved photo for this game").click()
        await expect(a.locator("#names")).to_have_value("Robin Winter")
        await a.locator("#guests").fill("Blue\nGreen")
        await expect(a.locator("#roster-count")).to_have_text("3 contestants selected")
        await a.get_by_text("Co-host access").click()
        await a.locator("#choices").get_by_label(str(host_b)+"@example.invalid").check()
        await a.get_by_role("button",name="Start game").click()
        await expect(a.locator("#console")).to_be_visible()
        from urllib.parse import urlsplit, parse_qs
        url=a.url
        game=parse_qs(urlsplit(url).query)["game"][0]
        await b.goto(origin+"/white-elephant-host.html")
        await b.locator('#resume-list a[href="?game='+game+'"]').click()
        assert b.url == url
        for page in phones:
            await expect(page.locator("#status")).to_have_text("Connected")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        for button_id in ["open","pause","share-host","cancel-game"]:
            assert await a.locator("#"+button_id).evaluate("""button => {
                const label = document.createRange();
                label.selectNodeContents(button);
                return label.getClientRects().length === 1 && button.offsetHeight >= 44;
            }""")
        first_player = await a.locator("#player").inner_text()
        await a.get_by_text("TV display", exact=True).click()
        await a.locator("#pair-tv").click()
        await expect(a.locator("#tv-link")).to_be_visible()
        link = await a.locator("#tv-link").get_attribute("href")
        tv_context = await browser.new_context(viewport={"width":1920,"height":1080})
        tv = await tv_context.new_page()
        await tv.goto(origin + "/" + link.removeprefix("./"))
        await expect(tv.locator("#player")).to_have_text(first_player)
        assert await tv.evaluate("localStorage.length === 0")
        from urllib.parse import urlsplit, parse_qs
        pairing = parse_qs(urlsplit(link).fragment)["token"][0]
        guest = await pw.request.new_context(base_url=rest)
        other_game = await api.post("/rpc/we_start_game",data={**start,"request_id":str(uuid4())})
        assert other_game.ok
        cross = await guest.post("/rpc/we_tv_board",data={"game":(await other_game.json())["id"],"token":pairing})
        assert cross.status in (401,403)
        private = await guest.post("/rpc/we_host_action",data={"game":game,"expected":0,"command":"pause"})
        assert private.status in (401,403)
        initial_board = await guest.post("/rpc/we_tv_board",data={"game":game,"token":pairing})
        data = await initial_board.json()
        assert set(data)=={"portraits","revision","paused","phase","turn","active","gifts","revealed","player_count"}
        assert data["revealed"]==[first_player]
        await a.locator("#title").fill("Parcel")
        await a.locator("#open").click()
        await expect(b.locator("#pending")).to_contain_text("Parcel")
        await b.locator("#confirm").click()
        assert await asyncio.to_thread(sent.wait,3), "Second phone did not submit its confirmation"
        await a.locator("#confirm").click()
        await expect(a.locator("#turn")).to_have_text("Turn 2 of 3")
        release.set()
        try:
            await expect(b.locator("#status")).to_contain_text("Another host acted first",timeout=15000)
        except AssertionError as exc:
            raise AssertionError(f"Host RPC responses {attempts}; board: {await b.locator('main').inner_text()}") from exc
        await expect(b.locator("#turn")).to_have_text("Turn 2 of 3")
        await a.get_by_text("Player portraits",exact=True).click()
        current=await a.locator("#player").inner_text()
        await upload(a,"Portrait for "+current,"green")
        await expect(tv.locator("#number img")).to_have_js_property("naturalWidth",10)
        assert await tv.locator("#number").evaluate("""badge => {
            const img = badge.querySelector('img');
            const rect = badge.getBoundingClientRect();
            return rect.width === 384 && Math.abs(rect.width - rect.height) < 1 &&
                img.clientWidth === badge.clientWidth && img.clientHeight === badge.clientHeight &&
                getComputedStyle(img).objectFit === 'cover' && getComputedStyle(badge).overflow === 'hidden';
        }""")
        await upload(a,'Take photo for Parcel','red')
        await expect(tv.locator('#gifts img')).to_have_js_property('complete',True)
        await expect(tv.locator('#gifts img')).to_have_js_property('naturalWidth',10)
        old=await tv.locator('#gifts img').first.get_attribute('data-photo')
        await upload(b,'Replace photo for Parcel','blue')
        await expect(tv.locator('#gifts img')).not_to_have_attribute('data-photo',old)
        await expect(tv.locator('#gifts img')).to_have_js_property('naturalWidth',10)
        replacement=await tv.locator('#gifts img').first.get_attribute('data-photo')
        assert len(set(objects.values()))==4
        await b.get_by_role("button",name="Steal Parcel").click()
        await expect(a.locator("#pending")).to_contain_text("steal Parcel")
        await a.locator("#confirm").click()
        for page in phones:
            await expect(page.locator("#player")).to_have_text(first_player)
            await expect(page.locator("#gifts")).to_contain_text("1/3 steals")
            await expect(page.get_by_role("button",name="Steal Parcel")).to_have_count(0)
        await expect(tv.locator("#player")).to_have_text(first_player)
        await expect(tv.locator("#gifts")).to_contain_text("1/3 steals")
        await tv.reload()
        await expect(tv.locator('#gifts img')).to_have_attribute('data-photo',replacement)
        await expect(tv.locator('#gifts img')).to_have_js_property('naturalWidth',10)
        await expect(tv.locator("#turn")).to_have_text("Turn 2 of 3")
        await b.reload()
        await expect(b.locator("#player")).to_have_text(first_player)
        await expect(b.locator("#turn")).to_have_text("Turn 2 of 3")
        await b.get_by_role("button",name="Propose opening a gift").click()
        await a.locator("#confirm").click()
        await expect(b.locator("#turn")).to_have_text("Turn 3 of 3")
        await a.get_by_role("button",name="Steal Parcel").click()
        await expect(b.locator("#pending")).to_contain_text("steal Parcel")
        await b.locator("#confirm").click()
        await expect(tv.locator("#gifts")).to_contain_text("2/3 steals")
        await a.locator("#open").click()
        await expect(b.locator("#confirm")).to_be_visible()
        await b.locator("#confirm").click()
        await expect(a.locator("#turn")).to_have_text("Final exchange")
        await a.get_by_role("button",name="Steal Parcel").click()
        await expect(b.locator("#pending")).to_contain_text("steal Parcel")
        await b.locator("#confirm").click()
        await expect(tv.locator("#gifts")).to_contain_text("Locked · 3 steals")
        await expect(a.locator("#gifts")).to_contain_text("Locked")
        await a.get_by_role("button",name="Take Gift 2").click()
        await expect(b.locator("#pending")).to_contain_text("take Gift 2")
        await b.locator("#confirm").click()
        for page in [a,b,tv]:
            await expect(page.locator("#player")).to_have_text("Game complete")
        await a.locator("#revoke-tv").click()
        await expect(tv.locator("#board")).to_be_hidden()
        await expect(tv.locator("#status")).to_contain_text("TV link unavailable")
        with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as admin:
            assert admin.execute("SELECT count(*) FROM white_elephant.history WHERE game_id=%s",(game,)).fetchone()[0]==7
        print("Two mobile hosts synced; stale confirm recovered; displaced player acted; reload restored turn; seven moves recorded; both hosts and TV showed completion; revoked TV cleared.")
        await a.locator("#return-setup").click()
        await a.locator("#guests").fill("Amber\nSilver\nGold")
        await a.get_by_text("Co-host access").click()
        await a.get_by_label(str(host_b)+"@example.invalid").check()
        await a.get_by_role("button",name="Start game").click()
        await expect(a.locator("#console")).to_be_visible()
        await b.goto(a.url)
        await a.get_by_text("TV display",exact=True).click()
        await a.locator("#pair-tv").click()
        await expect(a.locator("#tv-link")).to_be_visible()
        await tv.goto("about:blank")
        await tv.goto(await a.locator("#tv-link").evaluate("link => link.href"))
        await expect(tv.locator("#board")).to_be_visible()
        a.once("dialog",lambda dialog: dialog.dismiss())
        await a.locator("#cancel-game").click()
        await expect(a.locator("#console")).to_be_visible()
        a.once("dialog",lambda dialog: dialog.accept())
        await a.locator("#cancel-game").click()
        await expect(a.locator("#setup")).to_be_visible()
        for page in [b,tv]:
            await expect(page.locator("#status")).to_have_text("Game cancelled.")
        await expect(b.locator("#console")).to_be_hidden()
        await expect(tv.locator("#board")).to_be_hidden()
        await browser.close()
    server.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception:
        detail = traceback.format_exc().replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print("::error title=Mobile host integration::" + detail, flush=True)
        raise
