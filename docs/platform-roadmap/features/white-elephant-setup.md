# White Elephant — Event Setup

- **Feature ID:** `white-elephant-setup`
- **State:** V1 setup scope agreed at a high level; specification updated; implementation not started.
- **Initial planning:** Phase 3 · Medium priority · Medium complexity (assumptions).
- **Related specifications:** [Interactive Game](white-elephant-game.md) and [feature group overview](white-elephant.md).

## 1. Feature overview

Provide the small amount of setup needed to run a family White Elephant game. A host creates the event, enters the participant roster, reviews configurable house rules, and starts play. Live turns and gift ownership belong to the separate Interactive Game feature.

This is a game-day tool, not an invitation or event-planning system in V1.

## 2. Goals and boundaries

- **Goals:** create and resume an event, enter participants, choose supported rules, review the setup, and start the game.
- **Out of scope for V1:** family invitations, QR guest registration, player accounts, player phones, budgets, calendar scheduling, and reusable annual templates.
- Participants are entered by a host and do not need accounts or devices.
- Authorized family accounts may act as hosts. Multiple hosts have the same game-control permissions.

## 3. V1 setup flow

1. An approved host opens the separate White Elephant page and creates a game.
2. The host enters participant names and checks for duplicate or missing names.
3. The host chooses a supported rule preset and adjusts the available settings.
4. The page summarizes turn, steal, lock, and first-player rules in plain language.
5. The host starts the game. The server records the randomized turn order but the TV reveals players one at a time.
6. Refreshing or reopening the game returns to its saved state. It must not silently create a replacement game.

The initial participant count should be configurable within a documented implementation limit. The current family use case is about 18 participants; do not hard-code exactly 18.

## 4. Functional requirements

- Create, start, pause, resume, complete, and reopen the current event state as permitted by its status.
- Add, edit, reorder, and remove roster entries before play. After play begins, protect roster changes from silently invalidating the turn order or recorded actions.
- Validate participant names and clearly identify duplicates before the game starts.
- Configure only rules with implemented server-side validation.
- Show an understandable rules summary before start.
- Randomize the hidden turn order once when the game starts. Do not reveal future participants.
- Keep enough event metadata to distinguish a current game from a completed one; retention and archive policy remain open.
- Record host actions and consequential rule changes in the game history.

## 5. Administration and permissions

The existing wishlist Administration page manages wishlist accounts and platform planning. Game setup belongs in the White Elephant host console, not as new controls mixed into account administration.

- Host actions require an authenticated, active, verified family account.
- All authorized hosts share game-control permissions in V1.
- Participants are roster entries, not authenticated application users.
- The TV display is read-only and uses a scoped event pairing flow.
- The server, not the browser, decides whether an account can create or control an event.

## 6. Technical and data considerations

- Host the page in the existing wishlist GitHub Pages site, using isolated game files and relative paths.
- Store events and game data in a separate private Supabase schema/tables from wishlist items and claims.
- Protect exposed RPC wrappers with verified family authorization and enforce RLS/restricted grants on underlying tables.
- Never place real participant lists, gifts, photos, credentials, or seed data in Git.
- No service key or host credential may be sent to the TV display.
- Event pairing must be scoped, read-only, revocable, and expire according to the retention decision.
- Keep demo data in memory only; demo mode must not call the backend.

## 7. Open questions before implementation

- Exact participant-name limits, supported maximum count, and whether a participant can appear in multiple games.
- Whether host-defined turn order is needed in addition to randomized order. Current V1 direction is randomized and hidden.
- Whether a roster may be edited after the game starts, and what host correction flow applies.
- Whether completed games can be reopened, and when events, action history, and gift photos are deleted.
- How TV pairing is issued and revoked.
- How a completed game is archived without leaking private family data.

## 8. Decisions made

- **Agreed:** the game should be a separate page within the wishlist site.
- **Agreed:** players do not need accounts or phones.
- **Agreed:** multiple authorized hosts may operate the game.
- **Agreed:** the TV provides a shared, read-only display.
- **Agreed:** the roster and rules are controlled by the host.
- **Deferred:** invitations, guest join links/QR codes, and permanent player profiles.

## 9. Implementation history

Planning decisions were consolidated on 2026-11-15. No event setup UI or event/game tables have been implemented or deployed.
