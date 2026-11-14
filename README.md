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

## Passkeys

Approved family members can use Passkeys in the account header to create/list/remove their own keys. Initial enrollment requires an existing confirmed email-link session. The sign-in dialog offers Sign in with a passkey and keeps email links available. Unsupported browsers show an explanation and retain email sign-in.

Supabase Authentication → Passkeys must be enabled with RP ID `fbadillo97.github.io`, allowed origin `https://fbadillo97.github.io`, and a family-wishlist display name. A changed domain/RP ID requires re-enrollment. Do not add the project path to RP ID/origin.

The buildless app uses native WebAuthn and the same two-step REST endpoints as Supabase Auth's client: registration/options and registration/verify require the current session; authentication/options and authentication/verify return a new session. Binary challenge/credential fields use base64url, with native JSON conversion where supported. The returned session is checked against Auth /user and then the existing private family allowlist. A passkey does not grant membership or editor roles.

No private key, biometric, device PIN or passkey secret is handled by the app. Only the browser's signed response is sent to Supabase Auth. Removing a passkey revokes it for this account; it may still appear in the user's password manager. Email-link recovery remains available.

Passkey endpoints were checked against [Supabase passkey documentation](https://supabase.com/docs/guides/auth/passkeys) and [the current Auth implementation](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/GoTrueClient.ts). Supabase currently labels the feature experimental. There is no new third-party runtime dependency.

Verification passed with synthetic browser/auth responses: base64url conversion, credential serialization, session-required registration, passkey authentication/session acceptance, device cancellation, unsupported browsers, stale operations after sign-out, server-user verification, incomplete-session rejection and unapproved-family denial. Actual device enrollment and sign-in require the user's native browser/device prompt; these have not yet been confirmed on the live site.

### My selections and confirmations

Apply `backend/my-selections.sql` after the existing backend migrations. The authenticated RPC checks verified active membership and returns only the caller's claims, including archived gifts so they can undo old selections. It never returns purchaser identities. My selections supports recipient/status filters; archived selections allow undo only. Selection actions show inline progress/results and a dismissible confirmation; editor and passkey confirmations remain visible through periodic refresh. Feedback and selection data clear on sign-out or lost authorization.

Mobile passkey providers are selected by the device/browser. A passkey must exist in the chosen manager and sync to the phone; email-link fallback remains available. Keeper's Android setup: https://docs.keeper.io/user-guides/autofill-setup-for-android

Verification for My selections passed in rolled-back synthetic fixtures: two-account isolation, no owner-ID disclosure, archived selections and owner undo, another owner’s undo rejection, unlisted-account rejection, and anonymous EXECUTE denial. Existing mutation/atomic claim functions are unchanged. Simulated DOM checks cover own units only, archived undo-only actions, confirmation display and privacy cleanup. JavaScript syntax passed. Physical phone/provider behavior and visual browser layout remain user-device checks.

### Private family display photo

`backend/family-photo.sql` defines a single bounded JPEG (maximum 250 KB) in the private database, with RLS and no direct client access. This small image uses the existing checked RPC pattern instead of a public image URL. `get_family_photo` requires confirmed active family membership, returns only the display copy, and sets Cache-Control to no-store/private. No real image seed, filename, source URL, or photo bytes belong in Git.

The app fetches the photo once after family authorization and displays a full portrait above the lists. It uses a temporary blob URL, clears/revokes it on sign-out or lost authorization, ignores delayed responses, and leaves wishlists usable if the photo cannot load. Metadata is stripped from the resized JPEG; originals stay untouched. This bounded single-image approach is not a gallery or upload interface; use private object storage if expanding to many photos.

Photo verification passed: two approved accounts can read the photo, unlisted/inactive accounts are denied, anonymous RPC execution and direct table reads are denied, and the response requests no caching. Simulated UI checks cover signed-out no-fetch, approved display, blob revocation and delayed-response rejection. The display copy is 700 × 1055 pixels with no EXIF/XMP/IPTC metadata. No changes were made to gift claims or roles. Physical-browser visual verification remains unconfirmed. Security advisors report the intended private RLS/no-policy tables and the existing [disabled leaked-password check](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).


## Permanent welcome emails

In Administration, **Send welcome email** and **Resend welcome email** send a personalized HTML and plain-text welcome with the permanent wishlist URL. The link contains no sign-in token and does not grant access. Recipients choose **Sign in**, request a fresh email link, or use their passkey when ready. Saving accounts/names never sends email. Existing first names personalize the greeting; blank names use “Hi there”.

The sender name is **Badillo Family Wishlist**. The email explains that the sending address is not monitored and directs questions to the privately configured contact address. That address is also set as CC and Reply-To for every welcome email. It lives in `wishlist_private.welcome_email_settings`, not public source. CC recipients can see the invited email address, as explicitly requested by the owner.

The Edge Function uses Gmail SMTP on TLS port 465. Set `WISHLIST_SMTP_USERNAME` and `WISHLIST_SMTP_PASSWORD` in Edge Function Secrets; the password is a Google app password. Auth's existing custom SMTP settings do not automatically populate these variables. No credentials or real sender/contact addresses belong in Git. Auth templates, OTP expiry and the home-maintenance app's email flow are unchanged. Ordinary sign-in emails remain temporary authentication links.

Deployment order: apply `backend/permanent-welcome.sql`, then `backend/welcome-email-contact.sql`; privately configure the singleton contact address; save the SMTP secrets; deploy `wishlist-welcome` with both its source files. Deploy `wishlist-invite` as the compatibility wrapper alongside the welcome module so older clients also use permanent welcome emails. Publish the updated Administration files last. The wrapper imports the same implementation; no legacy Auth invitation fallback remains.

The sender verifies the caller through Auth /user, then the service-only database claim enforces active verified editor/owner permission, target role, revision and cooldown. The saved recipient, name and contact come from that claim; browser-supplied body, sender, CC and name are ignored. Existing send status fields and two-minute duplicate-send protection remain. Ambiguous SMTP failures are recorded as uncertain and never automatically retried. Sent means Gmail accepted the message, not proof of inbox delivery.

Tests: `node tests/invitations.mjs` checks personalized/fallback greetings, escaping, permanent links only, trusted CC/Reply-To, authorization, missing SMTP configuration, SMTP rejection and ambiguous timeout handling without sending email. Deployment verification authenticated to Gmail SMTP successfully without sending a message; live endpoints reject missing authentication. Transactional SQL checks confirmed private-name snapshots and duplicate prevention, with fixtures rolled back. No family welcome email was sent during deployment. A temporary configuration-only diagnostic was removed before publishing.

## Administration and account names

Open **Administration** from the wishlist header, or visit `admin.html`. The page reuses the wishlist's email/passkey session and requires verified active editor/owner authorization from the database. It fetches account administration data only, rather than the gift catalog. Navigation back to the wishlist is always available.

Accounts have an optional private `first_name` (maximum 80 characters). Existing names start blank; none are inferred from email addresses, Auth metadata, or gift recipients. Add accounts, edit names, change permitted roles and access, search by name/email, and send/resend invitations from this page. Saved account emails remain fixed identities: add the new email and remove the old account's access when an address changes. Gift selections remain preserved.

Editors manage viewer accounts only. Only the owner manages editors or updates the owner's name. Owner role/access cannot be removed or changed. Name updates use the same revision protection as account permissions. Saving never invokes Auth, creates Auth users, or sends email. The previous account-saving RPC remains compatible and preserves the new name field.

The new SQL is `backend/administration.sql`; deploy it before the page and updated JavaScript. Public RPC wrappers use security invoker; private authorized routines use fixed search paths and explicitly restricted grants. Direct private-table access remains revoked. Account names are not stored in the public repository, browser local storage, or user-editable Auth metadata.

The personalized permanent welcome email is deployed through its own SMTP sender. Adding a first name changes future welcome greetings; saving never sends a message. Shared Supabase Auth email templates remain unchanged.

Verification: transactional database tests passed for owner/editor/viewer/unlisted/anonymous authorization, owner protection, name updates, stale-edit rejection and saves without Auth/email side effects; all fixtures and temporary owner-name changes were rolled back. DOM checks passed for signed-out startup, authorized account-only loading, preserving unsaved drafts during refresh, and immediately clearing private names/lists on cross-tab sign-out. Mobile layout stacks the account editor and saved-account list below 760px. Gift claim routines are unchanged. No real invitation email was sent during testing.


## Owner gift tracking

Administration includes a **Gift tracking** section visible only to the active verified owner. It lists current reserved/purchased claims, one row per quantity, with recipient, status, selecting account's saved first name or email fallback, and last status-update time. Archived gifts remain visible and labeled. Filters combine status, recipient and selecting account. It is read-only; selection changes and undo remain with the selecting account's **My selections**.

`backend/gift-tracking.sql` adds a nullable `gift_claims.updated_at` column and a trigger that stamps inserts and actual status/owner changes. Existing claims are not backfilled; they show **Not recorded** until a material update. A repeated save of the same status preserves its prior timestamp. Undo deletes the current claim through the existing ownership-protected routine, so this section tracks current selections rather than a historical audit log.

The owner-only RPC `admin_gift_tracking` checks private verified membership on every call. `get_administration` includes these rows only for the owner; editor responses contain no tracking field. Public wrappers use security invoker and private routines use a fixed empty search path and restricted grants. The public wishlist RPCs still expose no purchaser identities. No service key is added to the website. Deploy SQL before the updated Administration files.

Verification: database transaction checks passed for owner access; editor/viewer/unlisted/anonymous denial; no tracking in editor administration responses; per-unit rows; name/email fallback; timestamp insertion/status changes; no-op timestamp preservation; competing-account reservation and undo denial. All fixtures were rolled back. DOM checks passed for combined filters, empty results, undated/archived rows, read-only rendering, and clearing rows/filter identities on owner demotion and sign-out. Security advisories introduced no new findings. The table supports keyboard-accessible horizontal scrolling on narrow screens. Existing real selections were not modified.



## Open-ended ideas

`backend/open-ended-selections.sql` adds explicit `reservation_mode`: `limited` preserves unit reservations, `open-ended` allows one independent selection per member, and `inspiration-only` has no selection actions. Existing ideas become open-ended; products stay limited. Existing unit claims are retained unchanged and idea claims are copied into independent selections, combining multiple units per member (purchased takes precedence). An explicit undo also removes that member's legacy idea claims. Gift IDs remain stable.

General ideas always remain open to everyone, including when others have purchased something. My selections includes active and archived selections for undo. Notes are optional, limited to 2000 characters, and returned only to their author by `get_my_selections`; owner tracking includes status but never these notes. Direct table access is revoked and RLS enabled. All actions verify active, email-confirmed family membership in the database. Old unit/status APIs reject non-limited entries. Mode or recipient changes with existing selections are rejected. Saving an editor form uses revision checks. No invitation or email endpoint is involved.

Deploy SQL before the website files. Older cached clients cannot reserve an idea via the unit API and must refresh. New general ideas default to open-ended, and products to limited; editors can explicitly choose any mode. Quantity is shown only for limited entries.

Verification: transactional synthetic-account checks passed for independent selections, owner-only note reads and undo, limited-product contention, legacy endpoint rejection, inspiration-only rejection, oversized notes, archived selection undo, and anonymous/unlisted denial. All test data was rolled back. The existing real unit-claim fingerprint was identical before and after migration. DOM tests cover open availability, purchased state, private note text rendering, filters, editor defaults, sign-out clearing, signed-out/unapproved views, and zero email calls. Security review found no new warnings; the new private table intentionally has RLS with no direct-access policies, matching the RPC-only design.

Browser checks passed at 390px and 1280px with synthetic approved accounts: selection-note dialog, save, editor mode defaults, hidden open-ended quantity, sign-out clearing, no horizontal overflow and no JavaScript errors. `tests/open-ended-selections.sql` runs synthetic database fixtures in a rollback-only transaction. `tests/open-ended-ui.mjs` requires jsdom 26.1.0; `tests/open-ended-browser.mjs` requires Playwright 1.56.1 with Chromium. The browser test mocks all backend requests and cannot send emails. Tests exercised two-account contention serially; a simultaneous cross-session database race was not run.


## Personal invitation welcome page and optional passkeys

New welcome emails open `welcome.html#<random-token>`. The page is not listed in navigation. It greets the invited person, fills in their email, and requests a fresh normal Auth sign-in email only when **Email me a sign-in link** is pressed. The authentication email returns to the root wishlist. The top-right sign-in button and passkey fallback remain available. A matching already-authorized session continues directly; a different account requires explicit switching.

The welcome token contains no email or Auth credential. Its 256 random bits are generated server-side; only the SHA-256 hash and account mapping are stored in private `welcome_links`. Each newly sent welcome has its own link; previous personal links remain usable while family access is active. Removing access disables all of that account's links. Whoever holds/receives a forwarded personal link can see the invited name/email, but must still verify through that inbox or a valid passkey to access gifts. Old emails containing the generic site link cannot be changed retroactively; resend a welcome to give an existing recipient a personal page.

The public `wishlist-welcome-link` Edge Function accepts a token in a POST body, resolves it using a service-only RPC, and returns only first name/email for an active account. It never sends email, signs in, or returns gifts. Responses are no-store and tokens are not placed in query strings, localStorage or application logs. The static page retains no-referrer/CSP. Invalid links offer regular sign-in. Contacts, CC, Reply-To and the unmonitored sender notice remain in the existing welcome template.

After a fresh email sign-in and verified family access, the site checks the account's own passkey list. Supported browsers with no registered passkeys show an inline **Make next time easier** invitation. **Maybe later** dismisses it on this device; the preference uses a hash of the account email. Setup is optional, starts only on a button click, and displays success only after server registration verification. Passkey errors/cancellation do not block email sign-in. Sign-out cancels pending ceremonies and clears private passkey data.

Deployment: `backend/personal-welcome.sql`, lookup function, static page/auth/passkey additions, then updated welcome sender and compatibility route. Shared Auth templates and expiry are unchanged. New general-idea/open-ended selection code from the parallel chat is preserved.

Checks: database transaction tests passed for hashed lookup, minimal profile, invalid tokens, inactive account rejection, service-only RPC grants and private-table denial; fixtures rolled back. Browser checks passed at 390px and 1200px for prefilled email, no send on opening, one-click email request, matching/wrong sessions, invalid-link fallback, optional nudge/dismissal, mocked server-verified passkey setup, sign-out clearing, and coexistence with open-ended selection controls. Mail tests passed for token/hash pairing, trusted greeting/contact/CC, permanent personal links, authorization and send failures. Native device authentication was not automated and no family emails were sent.


## Administration account details and section navigation

Administration has separate **Users & invitations** and **Reservations & purchases** section buttons. Reservations remain owner-only; editors see a disabled button with an owner-access explanation. Owner refreshes preserve the selected section, and switching does not discard unsaved account edits. Existing `#gift-tracking` links open reservation tracking for the owner.

The compact account table includes separate first/last names, a stable private account UUID, whether the shared Auth account has signed in (with last sign-in on hover), and whether it currently has registered passkeys/count. The ID is assigned when an allowlist entry is created, including before first sign-in; its short display copies the full UUID and is searchable. Imported last names are preserved and editable. These are login-account indicators, not proof of a particular wishlist visit. No credential material or sessions are returned.

`backend/account-details.sql` adds the account UUID, extends the authorized member-list RPC with the safe status summary, and adds a new authorized `admin_save_account` wrapper for first/last name edits. The old save RPC remains compatible and preserves last names. Existing role, owner and revision protections remain in force. Saving still sends no email. Auth passkey registration and removal remain solely in each user's passkey settings.

Checks: transactional tests covered last-name saves, stable/unique IDs, metadata shape, exact passkey counts against Auth, owner tracking still returned, editor permission limits, viewer denial and anonymous grants; fixtures rolled back. No real account names, permissions, reservations or passkeys were changed.
