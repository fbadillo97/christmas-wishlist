# Family Gift Suggestions

- **Feature ID:** `family-gift-suggestions`
- **State:** Proposed idea; not implemented.
- **Initial planning:** Phase 1 · High priority · Medium complexity (assumptions).

## Overview and problem

Relatives may have useful gift ideas, but should not be able to publish arbitrary items directly to a recipient's wishlist. A controlled suggestion flow could gather ideas while leaving the existing list curated.

## Goals and non-goals

- **Goals:** submit an idea, review it in a private approval queue, accept/edit/reject it, and preserve the submitter's intent when useful.
- **Non-goals:** public submissions, automatic publishing, or building a general discussion forum.

## Proposed experience and functional requirements

Family members submit a title, recipient, optional HTTPS product link, and a short explanation. Editors or the owner review pending suggestions and may publish an approved item using existing gift-entry rules. The submitter should receive clear in-app feedback if status visibility is supported.

## Administration requirements

Private queue with pending/approved/rejected filters, review notes, and revision checks. Publishing must use the existing secure gift editing path and must not create duplicate or public data accidentally.

## Technical, data and security considerations

Suggestions should be stored privately with submitter identity and timestamps. RLS and RPCs must enforce who can submit, review and publish. Validate links and text; prevent suggestion data from leaking to unapproved visitors. Avoid email notifications in the first version unless separately specified.

## Dependencies

Existing family authentication and authorization; possibly recipient profiles and gift editing APIs.

## Open questions

- Who may submit: all approved relatives, only editors, or both?
- Can submitters see review status or reviewer notes?
- Are suggestions tied to an occasion once multiple occasions exist?
- Should rejected suggestions be retained, and for how long?

## Decisions made

- **Agreed:** suggestions should enter a private approval queue rather than appearing immediately.
- **Deferred:** submission eligibility, status visibility and notifications.

## Future enhancements

Duplicate detection, optional photo/link previews, and suggestions generated from prior feedback.

## Acceptance criteria

No suggestion appears in a wishlist until approved; only authorized reviewers can review or publish; requester identity and review notes remain private; errors and concurrent edits are handled without losing the suggestion.

## Implementation history

None. Planning record only.

