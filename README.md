# Badillo Family Christmas Wishlist

A mobile-friendly GitHub Pages website with private family gift lists in Supabase.

## Access and privacy

The public site is a welcome/sign-in screen. Gift titles, product URLs, images, notes, preferences, and recipients are fetched only after Supabase confirms that the signed-in email is a verified, approved family member. People and gift records live in `wishlist_private.wishlist_people` and `wishlist_private.gift_catalog.details`, not public JSON. No private records or real-data seeds belong in GitHub.

Gift details were previously public and remain in older Git commits and potentially visitor/browser caches. Removing those copies requires separate history cleanup; this change does not erase them. Remote product image URLs are public manufacturer assets, but their association with the wishlist is now restricted. Previously viewed information cannot be recalled.

The database uses RLS, revoked direct table access, and checked functions in an unexposed private schema. Public RPC wrappers use SECURITY INVOKER; their private implementations explicitly enforce verified family membership. Do not expose `wishlist_private` through the Data API. Anonymous and non-approved accounts cannot fetch wishlists or statuses.

The browser clears gift details on sign-out and on failed access checks. In-flight responses from an old session cannot restore them after sign-out. Gifts are not persisted to localStorage; only the sign-in session is stored there. Status refreshes recheck access every 20 seconds while the page is visible. Information already seen by an authorized visitor cannot be made unseen when access is revoked.

## Maintain family access and gifts

Use the connected Supabase tools or private Supabase dashboard. Add approved lowercase emails to `wishlist_private.family_members`; never commit a filled-in family list. Add recipients to `wishlist_private.wishlist_people` with stable IDs, names, symbols, and sort order. Do not add ages or birthdays.

Add gifts by upserting `wishlist_private.gift_catalog` with a stable `id`, `kind` (`product` or `idea`), requested `quantity` (integer 1–100, default 1), and a JSON `details` object containing the matching `id`, recipient `person` ID, `title`, optional HTTPS `url`/`image`, optional `symbol`, `match` (`exact` or `similar`), boolean `used`, and free-text `notes`. Links are optional. Use notes for sizes, colours, styles, materials, compatibility, or any other unique information. Do not add clothing-specific fields. Products default to exact match; general ideas default to similar acceptable; both default to gently used welcome. Explicit choices override defaults. The database normalizes missing preferences on insert/update. Only use real user-approved gift information. Existing IDs preserve reservations. Avoid deleting catalog rows: claims reference them. Do not reuse an ID for a different gift.

`backend/setup.sql` describes the original generic schema. `backend/private-content.sql` adds private content access. `backend/quantity-support.sql` adds entry kinds, defaults and per-unit claims. All three have already been applied to this project; do not rerun them. Neither contains private gift seeds. Public `data/examples.json` remains a fabricated schema example and is not loaded by the site.

## Sign-in and hosting

GitHub Pages deploys `main` at `/ (root)`. Assets use relative paths. The site is https://fbadillo97.github.io/christmas-wishlist/ .

`config.json` contains only the public Supabase URL and publishable key. Never commit service-role keys, SMTP credentials, database passwords, or tokens. Sign-in uses Supabase email links and privately configured custom SMTP. Site URL and allowed redirect URL must both be the website's full HTTPS address including the trailing slash. Never put email app passwords in this repository.

## Checks

Verify signed-out visitors make no wishlist requests and receive no gift details. Approved accounts should fetch gifts and statuses; unlisted and anonymous accounts must fail the RPCs and direct table reads. Confirm expired sessions fail closed, sign-out clears the DOM immediately, and delayed responses cannot restore private content. Use fabricated fixtures in rollback transactions for database checks.

Each requested unit has a unique `(gift_id, unit_no)` claim and owner-only conditional upsert. `list_gift_units` returns the slots and `set_gift_unit_status` changes one slot. Quantity changes and reservations lock the catalog row to prevent capacity races. Quantity cannot be reduced below a claimed unit; metadata edits never recreate claims. Legacy single-gift RPCs remain compatible with unit 1. Validate owner reserve/purchase/undo, non-owner denial, concurrent claims, and persistence across signed-in devices before announcing a fully verified tracking system. No purchaser identity is exposed in the statuses response.

JavaScript syntax and simulated DOM/privacy tests can be run without contacting real family accounts. Production browser layout, email delivery, and simultaneous browser claims require a live browser check.

Security advisor review: informational [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) findings are intentional for private tables with all direct client access revoked. The project also reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); this site currently uses passwordless email sign-in, not passwords. Do not enable password-based flows without reviewing that setting.

## Wishlist entry skill

[Manage Family Wishlist](.agents/skills/manage-family-wishlist/SKILL.md) is a repository-scoped skill for turning chat requests into private entries. It applies defaults, preserves IDs/claims, asks only for essential missing information, and verifies changes. It does not grant permission to send invitations, buy gifts, or change family access. It is discoverable in checkouts of this repository; a copy must be installed separately for availability in unrelated chats/workspaces.

Quantity upgrade verification passed: idea defaults, remaining-unit counts, per-unit reserve/purchase/undo, other-owner rejection, unit bounds, safe quantity reduction, anonymous/unapproved denial, and an actual two-connection race with exactly one successful claim. Temporary race fixtures were removed and rollback fixtures did not persist. Simulated frontend checks covered notes, link-free ideas, filters, per-unit controls, and sign-out privacy. Production browser layout remains unverified.

## Web editors and Family access

Approved editors see an Editor badge, Add gift/Edit gift buttons, Archived gifts, and Family access after signing in. Existing email-link sign-in is unchanged. Roles and their seeds live privately in Supabase; real email addresses must never be added to repository files.

Gift forms use dropdowns for recipient, entry type, matching preference and condition. Product/image links are optional HTTPS URLs; notes are a single free-text field; requested quantity is 1–100. New forms select the agreed defaults, while edits retain existing choices. Image preview failure does not prevent saving. Every save carries the gift's revision: stale saves are rejected and the user must reopen the latest version. Changing the recipient or reducing capacity is blocked when it would invalidate existing selections.

Archiving hides a gift and its units from active lists without deleting any claims. Editors can restore archived gifts. Archived gifts reject new reservations and purchases; an owner of a selection can still undo it through the checked API. Editors cannot alter another purchaser's claims.

Both editors can add, remove or restore viewers. Only the owner can grant/change editor roles or remove/restore editors. The owner cannot be demoted or deactivated through this API. Removing access sets active=false; it does not delete identity or claims. Every protected RPC checks the current private membership, so an existing token does not bypass removal. Browser refreshes recheck membership. Adding an email does not create a Supabase Auth user or send an invitation; the person requests their own sign-in link.

Family access shows email, role and allowed/removed status only to editors. Updates carry a membership revision and ACL writes serialize. Neither the browser's email label nor user-editable JWT metadata determines permissions.

The generic `backend/editor-support.sql` documents the applied schema/functions; role assignments are deliberately absent. It has already been applied; do not rerun it.

Editor verification passed in rollback transactions: create/edit, stale-save rejection, unsafe-link validation, viewer denial, editor adds viewer but cannot escalate/change editors, owner promotion/removal with owner protection, inactive-account denial, archive/restore preserving claims, capacity protection, and purchaser-only undo. Simulated UI checks passed for defaults, general ideas, field feedback, quantity payloads, preservation of edits, conflict feedback, access controls and private cleanup. Live visual/browser verification is still required; no real family emails were sent during tests.
