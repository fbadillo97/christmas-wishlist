# Secret Santa Organizer

- **Feature ID:** `secret-santa`
- **State:** Proposed idea; not implemented.
- **Initial planning:** Phase 3 · Medium priority · Medium complexity (assumptions).

## Overview and problem

Secret Santa is primarily a pre-event organizer: gather participants, set expectations, make a valid private draw and help each giver find the recipient's wishlist.

## Goals and non-goals

- **Goals:** private assignments, budgets, deadlines, exclusions and wishlist links.
- **Non-goals:** a public reveal of all assignments or automatic messaging before notification preferences and delivery are decided.

## Proposed experience and functional requirements

An organizer creates an exchange, selects participants, sets budget/deadline, adds exclusions (such as spouses or prior-year pairs), and runs a randomized draw. Participants see only their own assignment and can open the recipient's appropriate wishlist. The organizer can see readiness without unnecessarily exposing assignments.

## Administration requirements

Organizer controls participant approval, exclusion rules, draw validation, reroll policy, assignment release and cancellation. A reroll should require an explicit explanation and record because it changes private assignments.

## Technical, data and security considerations

The server must generate and validate a complete assignment cycle with no self-assignments and no forbidden pairs. Store assignments privately and enforce per-participant access in the backend. Plan withdrawal/replacement flows before sending any assignment. Do not trust client-side secrecy.

## Dependencies

Multiple Occasions (`multiple-occasions`) and shared authentication. Guest participation is undecided.

## Open questions

- Can participants be guests without permanent family accounts?
- Should assignments be delivered by email, shown in-app, or both?
- How should a participant drop out after assignments are revealed?
- How many previous years should exclusion rules remember?
- Who can rerun the draw and what is disclosed to participants?

## Decisions made

- **Agreed:** Secret Santa belongs on the future roadmap as a separate organizer feature.
- **Proposed:** private assignments and wishlist integration.
- **Deferred:** identity, notifications and withdrawal rules.

## Future enhancements

Gift hints, anonymous questions and exchange history.

## Acceptance criteria

Every eligible participant receives exactly one valid assignment, exclusions are respected, assignments remain secret from other participants, and changes are audited.

## Implementation history

None. Planning record only.

