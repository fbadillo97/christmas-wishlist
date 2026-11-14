# Personal Gift Planner

- **Feature ID:** `personal-gift-planner`
- **State:** Proposed idea; not implemented.
- **Initial planning:** Phase 2 · Medium priority · Medium complexity (assumptions).

## Overview and problem

The current private selections help a buyer claim items, but do not necessarily cover personal shopping notes, budget tracking or preparation.

## Goals and non-goals

- **Goals:** make a buyer's own planned purchases easier to organize.
- **Non-goals:** expose who is buying to recipients or turn the family site into a full accounting app.

## Proposed experience and functional requirements

Expand “My selections” with optional private notes, estimated/actual price, purchase status and gift-wrapping or readiness status. Keep the current simple reserve/purchased flow available.

## Administration requirements

No broad admin dashboard is required. The owner may retain only existing owner-only tracking visibility; additional access must be explicitly decided.

## Technical, data and security considerations

All planner details must be scoped to the authenticated buyer. Protect columns and records with private-schema RPCs and authorization checks. Currency should be explicit (initially CAD if enabled); handle missing prices and update conflicts.

## Dependencies

Existing private selections. Recipient profiles can provide reusable sizing guidance.

## Open questions

- Which fields provide enough value: note, planned spend, actual spend, wrapped?
- Should the owner see private planner details?
- Should users be able to plan a gift without reserving it?
- How should gifts with multiple quantities be represented?

## Decisions made

- **Proposed:** purchasing details remain private to the buyer.
- **Deferred:** exact fields and owner visibility.

## Future enhancements

Personal budget totals, shopping lists and optional receipt attachment with strict privacy controls.

## Acceptance criteria

Buyer-only data is enforced in Supabase, never displayed on recipient views, and integrates with current reservations without changing their ownership rules.

## Implementation history

None. Planning record only.

