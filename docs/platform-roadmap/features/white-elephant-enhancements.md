# White Elephant Enhancements

- **Feature ID:** `white-elephant-enhancements`
- **State:** V2 candidates; no enhancements implemented.
- **Initial planning:** Phase 4 · Low priority · Medium complexity (assumptions).
- **Dependency:** [White Elephant Interactive Game](white-elephant-game.md).

## Overview

This feature tracks additions that should be considered after a family has tried the core game. The following V1 presentation features are already part of the Interactive Game specification: optional gift photos after opening, a hybrid TV board, short visual turn/steal/lock moments, optional sound effects, a playful host-triggered countdown, and humorous end-of-game awards. They do not need to be implemented as a separate feature.

## V2 candidates

- Voice narration or a game-show announcer.
- Persistent gamer tags and player portraits.
- Host-triggered reaction buttons, after feedback from people willing to host.
- A full-screen gift gallery, if the normal game board proves insufficient.
- Offline synchronization, only if the first version proves useful and offline play is a real need.
- Additional statistics or presentation ideas requested after family feedback.

## Design principles

- Keep optional effects brief, skippable, and usable with sound off.
- Respect reduced-motion preferences.
- Effects must never delay, block, or change a saved game action.
- Avoid adding host controls that distract from managing physical exchanges.
- Do not introduce points or a competitive leaderboard without a separate discussion.

## Open questions

- Which V2 ideas did family members actually enjoy or ask for?
- Is narration welcome in a room with 18 participants?
- Would a gallery solve a real problem during the game?
- Is offline support worth its implementation and recovery complexity?

## Acceptance criteria

Any enhancement remains optional and accessible, cannot block core gameplay, and does not expose more event data than the host and participants expect.

## Implementation history

V1 and V2 presentation boundaries were recorded on 2026-11-15. No enhancement work has been implemented.
