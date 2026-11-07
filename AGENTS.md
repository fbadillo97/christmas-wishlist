# Project instructions

- Keep the app buildless and compatible with GitHub Pages project paths; use relative asset URLs.
- Use the connected GitHub connector for repository changes. Read the current head before writing and never overwrite concurrent work.
- Preserve stable people and gift IDs; support future family members and seasons through JSON. Show names without ages; do not add age or birthday fields.
- Do not fabricate real gifts. Keep examples separate, conspicuously labeled, and outside the backend catalog.
- Public repo/site: no secrets, private emails, purchaser identities, addresses, birthdays, or child photos. Only Supabase URL and publishable/anon key may be public.
- Use textContent for gift/user text and HTTPS-only external product/image URLs. Preserve CSP, no-referrer, accessible controls, and mobile layouts.
- Backend tables require RLS, revoked direct access, verified family membership, atomic unique gift claims, and owner-only changes/undo. Never enforce ownership solely in the browser.
- Never silently substitute local storage for shared tracking. Disable actions on unavailable/unknown shared state. Demo states stay in memory and must never call the backend.
- Explain setup and verification accurately. Do not claim shared tracking or deployment is live without checking it.
- Check JavaScript syntax, JSON shape, relative file references, empty/demo modes, and narrow/wide keyboard-accessible layouts when tools permit. Backend changes require the two-account race, ownership, unauthenticated, and unlisted-account checks in README against a configured test project.
- Do not delete repositories, erase gift history, or publish private information. No paid services without authorization.
