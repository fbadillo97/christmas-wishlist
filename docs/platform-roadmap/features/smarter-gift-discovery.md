# Smarter Gift Discovery

- **Feature ID:** `smarter-gift-discovery`
- **State:** Proposed idea; not implemented.
- **Initial planning:** Phase 2 · High priority · High complexity (assumptions).

## Overview and problem

As the wishlist grows, family members need faster ways to find appropriate gifts without scanning every item.

## Goals and non-goals

- **Goals:** searchable and filterable gift browsing, useful categories, availability cues, and a possible “Surprise me” action.
- **Non-goals:** storefront checkout or price tracking in the first version.

## Proposed experience and functional requirements

Support search by title and description, category, recipient, price/budget range when data is available, and availability. Filters should work together and provide a clear reset. A random suggestion should respect current filters and availability preferences.

## Administration requirements

Editors need manageable categories/tags and a way to correct inaccurate metadata. Avoid requiring extensive per-gift data entry before proving the value of filters.

## Technical, data and security considerations

Search only data returned after family authorization. Define whether categories live on gifts or in normalized tables. Keep availability rules consistent with existing limited and open-ended selection modes. Do not send private gift data to external services without separate approval.

## Dependencies

Recipient Profiles (`recipient-profiles`). Multiple Occasions may later change filtering scope.

## Open questions

- Which three filters solve the most common browsing problem?
- Should a budget mean suggested gift price, family budget, or both?
- Should “Surprise me” exclude already reserved items?
- Are categories curated or freeform?

## Decisions made

- **Agreed:** smarter discovery is valuable but likely a larger execution.
- **Proposed:** begin with simple search and a few filters before recommendations.

## Future enhancements

Optional recommendations, duplicate detection and product previews.

## Acceptance criteria

Search and combined filters operate on authorized gift data, clearly represent availability, remain usable on mobile, and do not disclose selections or purchaser identities.

## Implementation history

None. Planning record only.

