"""Run against an empty, disposable PostgreSQL cluster as its test administrator."""
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import psycopg

BACKEND = Path(__file__).resolve().parents[1]
DSN = os.environ["TEST_DATABASE_URL"]


def connect():
    conn = psycopg.connect(DSN, autocommit=True)
    conn.execute("SET statement_timeout = '15s'")
    return conn


def as_host(conn, host):
    conn.execute("SET ROLE authenticated")
    conn.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(host),))


def action(conn, game_id, revision, command, move=None, target=None):
    return conn.execute(
        "SELECT public.we_host_action(%s, %s, %s, %s, %s)",
        (game_id, revision, command, move, target),
    ).fetchone()[0]


def run():
    # These stand-ins supply the family and Auth dependencies in an empty cluster.
    # The game migration itself is loaded unmodified from this checkout.
    with connect() as admin, connect() as first, connect() as second, connect() as reader:
        admin.execute("""
            CREATE ROLE anon;
            CREATE ROLE authenticated;
            CREATE SCHEMA storage;
            CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
            CREATE TABLE storage.objects(bucket_id text,name text,primary key(bucket_id,name));
            ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
            GRANT USAGE ON SCHEMA storage TO authenticated;
            GRANT INSERT ON storage.objects TO authenticated;
            CREATE SCHEMA auth;
            CREATE SCHEMA wishlist_private;
            CREATE TABLE auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
            CREATE TABLE wishlist_private.wishlist_people(name text);
            INSERT INTO wishlist_private.wishlist_people VALUES ('Red');
            CREATE TABLE wishlist_private.family_members(email text primary key, role text, active boolean,first_name text,last_name text,account_id uuid default gen_random_uuid());
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
            $$ SELECT current_setting('request.jwt.claim.sub', true)::uuid $$;
            CREATE FUNCTION wishlist_private.member_role() RETURNS text LANGUAGE sql STABLE AS
            $$ SELECT f.role FROM wishlist_private.family_members f JOIN auth.users u
               ON f.email = lower(u.email) WHERE u.id = auth.uid() AND f.active
               AND u.email_confirmed_at IS NOT NULL $$;
            CREATE FUNCTION wishlist_private.is_family_member() RETURNS boolean LANGUAGE sql STABLE AS
            $$ SELECT wishlist_private.member_role() IS NOT NULL $$;
        """)
        admin.execute((BACKEND / "white-elephant.sql").read_text())
        admin.execute((BACKEND / "white-elephant-portraits.sql").read_text())
        admin.execute((BACKEND / "white-elephant-viewer-roster.sql").read_text())
        admin.execute((BACKEND / "white-elephant-family-roster.sql").read_text())
        admin.execute((BACKEND / "white-elephant-cancel.sql").read_text())
        admin.execute((BACKEND / "white-elephant-rejoin.sql").read_text())
        admin.execute((BACKEND / "white-elephant-tv-announcements.sql").read_text())
        host_a, host_b = uuid4(), uuid4()
        for host, role in [(host_a, "editor"), (host_b, "viewer")]:
            email = f"{host}@example.invalid"
            admin.execute("INSERT INTO auth.users VALUES (%s,%s,now())", (host, email))
            admin.execute("INSERT INTO wishlist_private.family_members VALUES (%s,%s,true)", (email, role))
        as_host(first, host_a)
        as_host(second, host_b)
        as_host(reader, host_b)
        initial = first.execute("SELECT public.we_start_game(%s,%s,%s)",
                                (uuid4(), ["Red", "Blue"], [host_b])).fetchone()[0]
        game = initial["id"]
        pending = action(first, game, initial["revision"], "propose", "open", "Parcel")
        revision = pending["revision"]
        with ThreadPoolExecutor(max_workers=1) as executor:
            with first.transaction():
                winner = action(first, game, revision, "confirm")
                contender = executor.submit(action, second, game, revision, "confirm")
                deadline = time.monotonic() + 8
                while not admin.execute("SELECT %s = ANY(pg_blocking_pids(%s))",
                                        (first.info.backend_pid, second.info.backend_pid)).fetchone()[0]:
                    if contender.done():
                        contender.result()
                        raise AssertionError("Second confirmation completed without waiting")
                    if time.monotonic() >= deadline:
                        raise AssertionError("PostgreSQL did not report B waiting on A")
                    time.sleep(0.05)
                print("PostgreSQL observed B waiting on A", flush=True)
                reader.execute("SET statement_timeout = '2s'")
                assert action(reader, game, None, "read") == pending
                print("Board read returned the committed pending snapshot while A held the lock", flush=True)
            try:
                contender.result(timeout=5)
            except psycopg.DatabaseError as exc:
                assert exc.sqlstate == "PT409" and exc.diag.message_primary == "Refresh game state"
            else:
                raise AssertionError("Both confirmations succeeded")
        final = action(reader, game, None, "read")
        assert final == winner and final["revision"] == revision + 1 and final["pending"] is None
        gifts = final["state"]["gifts"]
        assert len(gifts) == 1 and gifts["1"]["title"] == "Parcel" and gifts["1"]["owner"] == 1
        assert admin.execute("SELECT actor, revision FROM white_elephant.history WHERE game_id=%s",
                             (game,)).fetchall() == [(host_a, revision + 1)]
        print(f"B received PT409; revision {revision} -> {final['revision']}; one gift, one history entry")


if __name__ == "__main__":
    run()
