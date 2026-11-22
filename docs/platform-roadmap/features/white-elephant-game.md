# White Elephant — Interactive Game

- **Feature ID:** `white-elephant-game`
- **State:** V1 scope agreed; mock-only visual prototype prepared; backend rules engine staged for integration.
- **Initial planning:** Phase 4 · Medium priority · High complexity (assumption).
- **Companion specification:** [White Elephant — Event Setup](white-elephant-setup.md) (`white-elephant-setup`).

## 1. Overview

Build a light, room-friendly companion for the family White Elephant exchange. A shared TV shows the game, while one or more hosts use phones to record and confirm the physical actions. The app should keep the game moving and add a little fun; the family can continue manually if the internet is unavailable.

This is also a low-stakes way to learn how to build a real-time application with AI. The family experience and the development exercise both matter.

## 2. V1 goals and boundaries

### Goals

- Set up an event, enter its participants, and configure a readable ruleset.
- Let multiple authorized family hosts operate the same game.
- Keep the full turn order hidden; reveal one person at a time.
- Track opened gifts, ownership, steal counts, locks, pending actions, and the active turn.
- Synchronize host phones and a read-only TV display through Supabase.
- Recover the current saved game after refresh or reconnect.
- Make steals, locked gifts, and the ending entertaining without slowing the exchange.
- Support a simple pause/resume and quick undo for mistakes.

### V1 exclusions

- Player accounts, player phones, QR guest registration, or permanent player profiles.
- Voice narration or AI-generated live dialogue.
- Host-triggered reaction buttons.
- A separate full-screen gift gallery.
- Offline synchronization.
- A complex points system or competitive leaderboard.

Players do not need a phone or account. Hosts use their existing approved family accounts. The TV is a shared display, not a host control surface.

## 3. V1 experience

### Before play

A host creates an event, enters the participant names, and reviews the rule preset. The rules can be adjusted in administration where the change is safe and clear. The order is randomized and kept hidden.

Gifts are selected from a single wrapped pile. They do not need labels or photos before play. A gift receives its game identity when first opened. Hosts can optionally add a short description or take a photo after it is opened.

### During play

The TV keeps the current player prominent and shows a compact overview of opened gifts, their owners, and lock status. Design for people viewing from across the room. A steal temporarily highlights the people and gift involved, then returns to the board.

A host records the physical move as a pending action and confirms it. The server validates and saves the action atomically; other hosts and the TV then receive the updated state. Only one game action may be pending at a time. If a player is stolen from, the game follows the agreed replacement-turn/steal-chain rule described below.

When a numbered turn begins, the TV briefly reveals that player with their name and a playful visual treatment. It does not reveal future players. Gift photos are optional and uploaded after the game action is saved, so a slow upload cannot block a turn. Photos are private and follow the gift if it changes owners.

Hosts can start a playful countdown with no penalty for running out. Any host can pause/resume the game. Any host can undo the most recent completed action after a quick confirmation; undo is unavailable while an action is pending and restores the prior ownership, steal count, and active game state.

### End of play

The TV presents a short, humorous awards sequence calculated from completed actions, followed by the final player-to-gift overview. Candidate awards:

- **Most Wanted Gift:** gift stolen the most times.
- **Most Robbed:** player whose held gifts were stolen the most times.
- **Biggest Gift Thief:** player who stole the most gifts.
- **Longest Stealing Chain:** most consecutive steals during one numbered turn.

Ties should be shown as ties. An award with no qualifying action is skipped. These are jokes, not points or a serious leaderboard.

## 4. Rules administration and safety

The host can configure supported house rules. The interface explains each rule and whether it can change during play. Do not present arbitrary rule toggles unless the engine can validate their effects.

| Rule | V1 direction | Change during a live game |
|---|---|---|
| Maximum steals per gift | Configurable preset | Increasing may be safe; reductions require validation and confirmation. |
| Immediate steal-back restriction | Configurable once defined | Host confirmation and validation; exact restriction still open. |
| First player's final opportunity | Configurable once defined | Lock after the final-turn phase begins. |
| Turn-order method | Randomized, hidden order | Lock after the game starts. |
| Countdown | Host-triggered, optional, no penalty | May start/cancel without changing game state. |
| Pause | Host-controlled pause/resume | Always available to hosts; no game state is discarded. |

Every game action and consequential rule change is checked against the latest server state. A rejected or stale action makes no partial update. Undo and corrections are recorded in the action history.

## 5. Technical and deployment direction

- Keep the wishlist buildless and host White Elephant as an isolated page in the same GitHub Pages site/repository (for example, `white-elephant.html` with its own JavaScript and CSS files). Use relative asset paths so the page works under the repository's project path.
- Use the existing wishlist Supabase project and family sign-in for hosts. Keep game tables and RPCs separate from wishlist gift/claim data. Do not use the separate Household Platform project for this game.
- Store all game state in Supabase. Do not use browser local storage as a shared-state fallback.
- Use server-side atomic validation for turns, steals, locks, rule changes, pause/resume, and undo. Realtime distributes saved changes; reconnecting clients fetch the latest state.
- Give the TV a read-only, event-scoped pairing method. It must not receive host credentials or access wishlist data.
- Put gift images in a private storage bucket, compress display copies, and enforce event access. Never add real family or game data to the public repository.
- The public page source is visible; only the Supabase URL and publishable key may be in the client. Never expose a service key.
- Start UI development with fabricated in-memory demo data. Demo mode must never call Supabase. Do not add production game schema or expose a launch link until the app and backend have been tested.

If the full internet connection is lost, the game can continue manually. V1 does not reconcile offline moves.

## 6. Reliability and verification

- Show hosts whether the app is connected, reconnecting, or offline.
- Reconnect automatically and fetch a fresh authoritative state after reconnect or page refresh.
- Make conflicting or stale host actions fail safely with a clear message.
- Preserve the current event through a browser refresh; do not start a new game implicitly.
- Verify ownership, steal limits, lock states, undo, host authorization, and concurrent actions with synthetic accounts and gifts before family use.
- Verify the TV layout on the actual TV and check host controls on a narrow phone screen.
- Gift photo upload failure must not undo or block a valid gameplay action.

## 7. Gameplay rules and open decisions

The staged engine uses the approved V1 preset. Opening a gift ends a numbered turn and starts its steal count at zero. A successful steal increments that gift's count. Its displaced owner acts immediately and cannot take the same gift straight back. After an intervening steal, the same gift is eligible again until its third steal locks it to its holder.

After the last opening, Player 1 may keep their gift or initiate one final chain. For this implementation a locked gift stays with its holder, including Player 1. If Player 1 steals, their former gift becomes available. Each displaced player may take that available gift to end the game or steal another eligible gift. Taking the available gift leaves its steal count unchanged. This guarantees a legal replacement throughout the final chain.

The initial backend fixes these rules when a game starts. Live rule editing, retention, TV pairing, countdown settings and photo handling remain integration decisions.

## 8. V2 candidates

Revisit these only after family feedback and a successful V1 game:

- Voice narration or an announcer.
- Persistent gamer tags and player portraits.
- Host-triggered reaction buttons.
- A full-screen gift gallery.
- Offline synchronization.
- Further statistics or effects that family members ask for.

## 9. Implementation history

Planning decisions were consolidated on 2026-11-15. A standalone mock-only page previews the host console, TV board, turn reveal, steal moment, countdown, temporary photo preview, and awards. It uses fabricated data in memory only, makes no backend requests, and is not linked from the wishlist navigation. No Supabase game tables, storage bucket, or live rules engine have been implemented or deployed.


### Backend milestone

The migration in `backend/white-elephant.sql` adds a private game schema and two host RPCs. An editor or owner calls `we_start_game(names, cohosts)` with display names and optional co-host Auth UUIDs. The server randomizes the order. Host actions require current family membership and event host status. Returned snapshots reveal only the numbered turns reached so far.

Call `we_host_action(game, expected, command, move_type, target)` with `read` to reconnect. For writes, pass the last snapshot revision. Propose `open` with an optional title, `steal` or `take` with a gift key, or `keep`. Then confirm or cancel the pending move. Other host commands are `pause`, `resume`, and `undo`. Each write locks the game row and rejects a stale revision. Undo restores the state before the latest confirmed move and advances the revision.

To verify on a configured disposable wishlist test database with no existing game schema, run from the repository root:

```sh
( echo 'BEGIN;'; cat backend/white-elephant.sql backend/tests/white-elephant.sql; echo 'ROLLBACK;' ) | psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1
```

The tests create synthetic identities inside the transaction and exercise a full 18-player game. Production deployment and live host/TV integration are pending.
