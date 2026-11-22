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
        admin.execute("NOTIFY pgrst, 'reload schema'")

    rest = "http://127.0.0.1:3000"
    origin = ""
    attempts = []
    sent, release = threading.Event(), threading.Event()
    peer_token = test_token(host_b)

    class FixtureServer(SimpleHTTPRequestHandler):
        def reply(self, status, body):
            self.send_response(status)
            self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/config.json":
                self.reply(200,json.dumps({"supabaseUrl":origin,"publishableKey":"fixture"}).encode())
            elif self.path == "/auth/v1/user":
                self.reply(200,b'{"id":"fixture"}')
            else:
                super().do_GET()

        def do_POST(self):
            if self.path not in ("/rest/v1/rpc/we_host_action","/rest/v1/rpc/we_pair_tv","/rest/v1/rpc/we_tv_board"):
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
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        phones = []
        for user, width in [(host_a, 375), (host_b, 390)]:
            ctx = await browser.new_context(viewport={"width":width,"height":812}, is_mobile=True, has_touch=True)
            token = peer_token if user == host_b else test_token(user)
            session = json.dumps({"access_token":token,"expires_at":time.time()+3600})
            await ctx.add_init_script("if (!sessionStorage.boot) {localStorage.setItem('badillo-session'," +
                                      json.dumps(session) + ");sessionStorage.boot='1'}")
            page = await ctx.new_page()
            phones.append(page)

        api = await pw.request.new_context(base_url=rest, extra_http_headers={"Authorization":"Bearer "+test_token(host_a)})
        start = {"request_id":str(uuid4()),"names":["Red","Blue","Green"],"cohosts":[str(host_b)]}
        for _ in range(30):
            result = await api.post("/rpc/we_start_game",data=start)
            if result.ok:
                break
            await asyncio.sleep(.3)
        assert result.ok, await result.text()
        game = (await result.json())["id"]
        a,b = phones
        url = origin + "/white-elephant-host.html?game=" + game
        await asyncio.gather(a.goto(url), b.goto(url))
        for page in phones:
            await expect(page.locator("#status")).to_have_text("Connected")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
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
        assert set(data)=={"revision","paused","phase","turn","active","gifts","revealed","player_count"}
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
        await browser.close()
    server.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception:
        detail = traceback.format_exc().replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print("::error title=Mobile host integration::" + detail, flush=True)
        raise
