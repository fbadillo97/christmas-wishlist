# Multiple Occasions

- **Feature ID:** `multiple-occasions`
- **State:** Proposed platform expansion; not implemented.
- **Initial planning:** Phase 3 · High priority · High complexity (assumptions).

## Overview and problem

The current application is Christmas-specific. The family may eventually want birthdays and other gifting events without separate accounts or repeated setup.

## Goals and non-goals

- **Goals:** reusable occasions, lists and gift history under shared family accounts.
- **Non-goals:** redesigning the live site before the 2026 holidays or assuming all occasions use Christmas rules.

## Proposed experience and functional requirements

Create occasions with name, date, participants/recipients, status and associated wishlist items. Support recurring annual occasions, archive past events, and keep current-year navigation obvious. Preserve the distinction between list owner, recipient and buyer.

## Administration requirements

Manage occasions, visibility and lifecycle. Provide preview and revision-safe archive operations; avoid destructive deletion of selection history.

## Technical, data and security considerations

This is a schema and information-architecture change. Plan migrations around stable recipient/gift IDs, and define whether gift records are reusable templates or occasion-specific copies. Apply RLS and private RPC authorization to every occasion-specific operation.

## Dependencies

Recipient Profiles (`recipient-profiles`). This initiative may become a foundation for Secret Santa and White Elephant events.

## Open questions

- Should an occasion hold a snapshot or a live reference to a recipient's wishlist?
- How do reservations carry over between years?
- What is the retention policy for past gifts and purchases?
- Which occasions are in scope for the first release?

## Decisions made

- **Agreed:** likely a broader redesign to consider after the holidays.
- **Proposed:** shared accounts with separate occasion lists and reusable family history.
- **Deferred:** data model, migration strategy, and dates.

## Future enhancements

Shared calendars, event reminders and occasion-specific budgets.

## Acceptance criteria

Multiple occasions coexist without cross-event privacy leaks; existing gifts and selections survive migration; archived events remain readable under defined access rules.

## Implementation history

None. Planning record only.

