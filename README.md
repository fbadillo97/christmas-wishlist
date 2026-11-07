# Badillo Family Christmas Wishlist

A mobile-friendly, buildless website for GitHub Pages. Real gift lists start empty; **Explore demo gifts** displays clearly labeled examples with tab-only pretend selections. No real gifts have been invented. No shared tracking is active until a backend is configured and tested.

## Publish

GitHub Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save. The expected URL is https://fbadillo97.github.io/christmas-wishlist/ . Files use relative paths for Pages project hosting. No build or third-party browser libraries are required.

## Add gift ideas

Edit `data/wishlist.json`. Add people using stable IDs; add gifts following `data/examples.json`: stable `id`, `person`, `title`, HTTPS `url`, optional HTTPS `image`, optional `symbol`, `match` (`exact` or `similar`), boolean `used`, and `notes`. Do not copy demo IDs into the real list. Prefer locally hosted licensed product images; remote images disclose visitors' IPs to the image host. Product links open separately with no referrer. Never scrape or invent product information.

Names, ideas, and all repository history are public. Keep full birth dates, addresses, photos of children, emails, shipping details, and purchaser information out of this repository. `noindex` is a request to search engines, not access control. Update the season year for future Christmas lists. Never reuse an old gift ID for a different gift.

## Activate shared tracking (one-time owner setup)

1. Create a Supabase project. Retain the database password privately. Run `backend/setup.sql` once in the project's SQL editor.
2. Privately insert allowed family emails into `family_members` using the commented example at the end of the script. Add yourself first. Do not commit the filled-in SQL.
3. In Authentication → URL Configuration, set Site URL and an allowed redirect URL to `https://fbadillo97.github.io/christmas-wishlist/`. Keep email confirmation enabled. Email magic-link sign-in uses Supabase Auth; configure a production email provider if required by your project's current email limits. Anonymous sign-in is not used.
4. Set `config.json` to the project's HTTPS URL and **publishable (or legacy anon) key**. These are public browser configuration. Never use a secret key, service-role key, database password, or GitHub token. No credentials beyond public configuration belong in GitHub.
5. Whenever real gifts are added, insert matching IDs into `gift_catalog` using the example in the SQL script. This server allowlist prevents arbitrary client-created gift IDs. Retiring IDs removes their claims; back up privately before deleting.
6. Complete the verification below before announcing that family tracking is live.

The frontend uses the Supabase Auth and REST APIs directly. A verified, allowlisted email can read shared statuses; purchaser identities remain private. Database tables have RLS and no direct anonymous/authenticated access. Narrow security-definer functions enforce membership and ownership. The gift primary key and atomic conditional upsert prevent simultaneous claims; only the owning authenticated user can change or undo a claim. No purchaser names are collected. Availability refreshes every 20 seconds and on save. A failed backend connection disables reservation actions. Sign-in persists on the device; sign out on shared devices. Email sign-in restores ownership across devices.

Because this is a public static site, the HTML cannot protect gift ideas. Backend access is restricted to invited verified emails. Project owners can maintain claims through the private Supabase dashboard if a purchaser loses email access. Monitor Auth rate limits, use appropriate email delivery settings, and remove family access when no longer needed.

## Verify before live use

- Serve this directory with `python3 -m http.server 8000`. Check narrow/wide screens, keyboard navigation, filters, image failures, demo separation, and empty states.
- Confirm the deployed HTML and assets load at the Pages URL.
- In a configured test project: sign in using two allowed family emails in separate browser profiles. Race to claim one test gift: exactly one must succeed. The other user must see its status and must not change or undo it, including by calling the RPC directly.
- Check owner transitions Available → Reserved → Purchased → Available and persistence after reload and on a second device signed into the same email.
- An unlisted email and unauthenticated request must fail both RPCs. Direct table reads/writes must fail. Arbitrary gift IDs and invalid statuses must fail. Confirm expired sessions refresh and sign-out removes local access.
- Simulate network failures: no successful-save claim, no enabled actions based on stale data. Demo changes must never reach Supabase.

Backend SQL and browser behavior require these checks after account setup; source inspection alone is not proof of deployed backend security.

Official references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
