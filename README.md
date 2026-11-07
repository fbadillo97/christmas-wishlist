# Badillo Family Christmas Wishlist

A mobile-friendly GitHub Pages website with private family gift lists in Supabase.

## Access and privacy

The public site is a welcome/sign-in screen. Gift titles, product URLs, images, notes, preferences, and recipients are fetched only after Supabase confirms that the signed-in email is a verified, approved family member. People and gift records live in `wishlist_private.wishlist_people` and `wishlist_private.gift_catalog.details`, not public JSON. No private records or real-data seeds belong in GitHub.

Gift details were previously public and remain in older Git commits and potentially visitor/browser caches. Removing those copies requires separate history cleanup; this change does not erase them. Remote product image URLs are public manufacturer assets, but their association with the wishlist is now restricted. Previously viewed information cannot be recalled.

The database uses RLS, revoked direct table access, and checked functions in an unexposed private schema. Public RPC wrappers use SECURITY INVOKER; their private implementations explicitly enforce verified family membership. Do not expose `wishlist_private` through the Data API. Anonymous and non-approved accounts cannot fetch wishlists or statuses.

The browser clears gift details on sign-out and on failed access checks. In-flight responses from an old session cannot restore them after sign-out. Gifts are not persisted to localStorage; only the sign-in session is stored there. Status refreshes recheck access every 20 seconds while the page is visible. Information already seen by an authorized visitor cannot be made unseen when access is revoked.

## Maintain family access and gifts

Use the connected Supabase tools or private Supabase dashboard. Add approved lowercase emails to `wishlist_private.family_members`; never commit a filled-in family list. Add recipients to `wishlist_private.wishlist_people` with stable IDs, names, symbols, and sort order. Do not add ages or birthdays.

Add gifts by upserting `wishlist_private.gift_catalog` with a stable `id` and a JSON `details` object containing the matching `id`, recipient `person` ID, `title`, HTTPS `url`, optional HTTPS `image`, optional `symbol`, `match` (`exact`, `similar`, or null), `used` (true, false, or null), and `notes`. Only use real user-approved gift information. Existing IDs preserve reservations. Avoid deleting catalog rows: claims reference them. Do not reuse an ID for a different gift.

`backend/setup.sql` describes the original generic schema. `backend/private-content.sql` adds private content access. Both have already been applied to this project; do not rerun them. Neither contains private gift seeds. Public `data/examples.json` remains a fabricated schema example and is not loaded by the site.

## Sign-in and hosting

GitHub Pages deploys `main` at `/ (root)`. Assets use relative paths. The site is https://fbadillo97.github.io/christmas-wishlist/ .

`config.json` contains only the public Supabase URL and publishable key. Never commit service-role keys, SMTP credentials, database passwords, or tokens. Sign-in uses Supabase email links and privately configured custom SMTP. Site URL and allowed redirect URL must both be the website's full HTTPS address including the trailing slash. Never put email app passwords in this repository.

## Checks

Verify signed-out visitors make no wishlist requests and receive no gift details. Approved accounts should fetch gifts and statuses; unlisted and anonymous accounts must fail the RPCs and direct table reads. Confirm expired sessions fail closed, sign-out clears the DOM immediately, and delayed responses cannot restore private content. Use fabricated fixtures in rollback transactions for database checks.

Reservation updates still use the unique gift key and owner-only conditional upsert. Validate owner reserve/purchase/undo, non-owner denial, concurrent claims, and persistence across signed-in devices before announcing a fully verified tracking system. No purchaser identity is exposed in the statuses response.

JavaScript syntax and simulated DOM/privacy tests can be run without contacting real family accounts. Production browser layout, email delivery, and simultaneous browser claims require a live browser check.

Security advisor review: informational [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) findings are intentional for private tables with all direct client access revoked. The project also reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); this site currently uses passwordless email sign-in, not passwords. Do not enable password-based flows without reviewing that setting.
