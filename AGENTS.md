# Project instructions

- Keep the app buildless and compatible with GitHub Pages project paths; use relative asset URLs.
- Use the connected GitHub connector for repository changes. Read the current head before writing and never overwrite concurrent work.
- Preserve stable people and gift IDs; support future family members and seasons through private Supabase data. Show names without ages; do not add age or birthday fields.
- Do not fabricate real gifts. Real people/gifts live only in the private Supabase tables; never restore a public wishlist JSON or seed. Signed-out and unapproved visitors must get no gift content. Sign-out must clear it immediately and invalidate in-flight responses.
- Public repo/site: no real gift titles, URLs, images, notes, recipients, data seeds, secrets, private emails, purchaser identities, addresses, birthdays, or child photos. Only Supabase URL and publishable/anon key may be public.
- Use textContent for gift/user text and HTTPS-only external product/image URLs. Preserve CSP, no-referrer, accessible controls, and mobile layouts.
- Backend tables require RLS, revoked direct access, verified family membership, atomic unique gift claims, and owner-only changes/undo. Never enforce ownership solely in the browser.
- Never silently substitute local storage for shared tracking. Disable actions on unavailable/unknown shared state. Demo states stay in memory and must never call the backend.
- Explain setup and verification accurately. Do not claim shared tracking or deployment is live without checking it.
- Check JavaScript syntax, JSON shape, relative file references, signed-out/approved/unapproved modes, and narrow/wide keyboard-accessible layouts when tools permit. Backend changes require the two-account race, ownership, unauthenticated, and unlisted-account checks in README against a configured test project.
- Do not delete repositories, erase gift history, or publish private information. No paid services without authorization.

- Default new specific products (`kind: product`) to `match: "exact"`; general ideas (`kind: idea`) to `match: "similar"`. Both default to `used: true` (Gently used welcome) and quantity 1, unless the user specifies otherwise. Gently used means complete, in good condition, and appropriate to buy used; do not infer product safety or suitability without evidence.

- Use a single general `notes` field for item-specific information; no clothing-specific fields. Product URLs are optional. Preserve `(gift_id, unit_no)` claims when editing; never reduce requested quantity by silently releasing selections.
- For gift-entry maintenance, use `.agents/skills/manage-family-wishlist/SKILL.md`.

- Web roles come only from private family_members.role/active and verified Auth identity, never client email or user_metadata. Both editors manage viewers; only the owner manages editors. Owner removal/demotion is blocked. Keep real role assignments out of Git.
- Gift edits and archives require revision checks. Archive instead of deleting, preserve claims, and do not silently move a selected gift to another recipient. Clear private editor forms and member lists on sign-out or lost authorization; ignore stale editor responses.
