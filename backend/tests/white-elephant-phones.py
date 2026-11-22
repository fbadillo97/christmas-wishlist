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

    server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    rest = "http://127.0.0.1:3000"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        phones = []
        sent, release = asyncio.Event(), asyncio.Event()
        for user, width in [(host_a, 375), (host_b, 390)]:
            ctx = await browser.new_context(viewport={"width":width,"height":812}, is_mobile=True, has_touch=True)
            token = test_token(user)
            session = json.dumps({"access_token":token,"expires_at":time.time()+3600})
            await ctx.add_init_script("if (!sessionStorage.boot) {localStorage.setItem('badillo-session'," +
                                      json.dumps(session) + ");sessionStorage.boot='1'}")
            page = await ctx.new_page()
            await page.route("**/config.json", lambda route: route.fulfill(json={"supabaseUrl":origin,"publishableKey":"fixture"}))
            await page.route("**/auth/v1/user", lambda route: route.fulfill(json={"id":"fixture"}))

            def bridge_for(host):
                async def bridge(route):
                    req = route.request
                    if host == host_b and req.post_data_json["command"] == "confirm" and not sent.is_set():
                        sent.set()
                        await asyncio.wait_for(release.wait(), 7)
                    response = await route.fetch(url=rest + "/rpc/we_host_action")
                    await route.fulfill(response=response)
                return bridge
            await page.route("**/rest/v1/rpc/we_host_action", bridge_for(user))
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
        await a.locator("#title").fill("Parcel")
        await a.locator("#open").click()
        await expect(b.locator("#pending")).to_contain_text("Parcel")
        await b.locator("#confirm").click()
        await asyncio.wait_for(sent.wait(),3)
        await a.locator("#confirm").click()
        await expect(a.locator("#turn")).to_have_text("Turn 2 of 3")
        release.set()
        await expect(b.locator("#status")).to_contain_text("Another host acted first")
        await expect(b.locator("#turn")).to_have_text("Turn 2 of 3")
        await b.get_by_role("button",name="Steal Parcel").click()
        await expect(a.locator("#pending")).to_contain_text("steal Parcel")
        await a.locator("#confirm").click()
        for page in phones:
            await expect(page.locator("#player")).to_have_text(first_player)
            await expect(page.locator("#gifts")).to_contain_text("1/3 steals")
            await expect(page.get_by_role("button",name="Steal Parcel")).to_have_count(0)
        await b.reload()
        await expect(b.locator("#player")).to_have_text(first_player)
        await expect(b.locator("#turn")).to_have_text("Turn 2 of 3")
        await b.get_by_role("button",name="Propose opening a gift").click()
        await a.locator("#confirm").click()
        await expect(b.locator("#turn")).to_have_text("Turn 3 of 3")
        await a.locator("#open").click()
        await expect(b.locator("#confirm")).to_be_visible()
        await b.locator("#confirm").click()
        await expect(a.locator("#turn")).to_have_text("Final exchange")
        await a.get_by_role("button",name="Keep current gift").click()
        await expect(b.locator("#pending")).to_contain_text("keep their gift")
        await b.locator("#confirm").click()
        for page in phones:
            await expect(page.locator("#player")).to_have_text("Game complete")
        with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as admin:
            assert admin.execute("SELECT count(*) FROM white_elephant.history WHERE game_id=%s",(game,)).fetchone()[0]==5
        print("Two mobile hosts synced; stale confirm recovered; displaced player acted; reload restored turn; five moves recorded; both phones showed the completed game.")
        await browser.close()
    server.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception:
        detail = traceback.format_exc().replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print("::error title=Mobile host integration::" + detail, flush=True)
        raise
