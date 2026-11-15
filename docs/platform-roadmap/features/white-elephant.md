# White Elephant Feature Group

White Elephant is planned as separate event setup, live game, and later enhancement work. The V1 scope is documented, while some exact house rules and retention decisions still need to be settled before backend implementation. No game or event functionality has been implemented.

- [`white-elephant-setup`](white-elephant-setup.md) — create an event, enter participants, and configure supported rules.
- [`white-elephant-game`](white-elephant-game.md) — host-operated game with a shared read-only TV display.
- [`white-elephant-enhancements`](white-elephant-enhancements.md) — V2 ideas to revisit after family feedback.

## Agreed direction

- The game is a separate page within the existing wishlist site and shares its family sign-in.
- Hosts control the game; players do not need accounts or phones.
- Multiple authorized family hosts can operate it.
- The TV is the room display and cannot change game state.
- Turn order is randomized and hidden, with a fun reveal one player at a time.
- The TV board emphasizes the current player and keeps opened gifts/owners/locks visible.
- Gifts are identified when opened; descriptions and private photos are optional and must not block gameplay.
- The game stores authoritative state in Supabase, validates actions on the server, and reconnects from saved state.
- The family can continue manually during a full internet outage; V1 has no offline synchronization.
- V1 includes undo, pause/resume, a host-triggered no-penalty countdown, brief visual moments, optional sound effects, and humorous end-of-game awards.
- Voice, manual reaction buttons, a full-screen gift gallery, persistent player profiles, and offline support are V2 candidates.

## Boundaries

The public site source must contain no real family event data, player roster, gift contents, private photos, or credentials. The TV display is read-only and must not inherit host credentials. Game tables/storage stay separate from wishlist gift and claim data.

## Still to decide before backend implementation

Exact steal-chain behavior, default steal limits and steal-back rules, the first player's final opportunity, lock/count semantics, supported live rule changes, pairing and retention policy, and whether personal portraits belong in V1. See the open-decision lists in the setup and game specifications.
