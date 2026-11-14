# Recipient Profiles

- **Feature ID:** `recipient-profiles`
- **State:** Proposed idea; not implemented.
- **Initial planning:** Phase 1 · High priority · Low complexity (assumptions).

## Overview and problem

Shared details such as interests, clothing sizes, favorite colors and gifting guidance are repeated across gift entries or family conversations. A private profile could make those details reusable.

## Goals and non-goals

- **Goals:** provide concise, editable recipient preferences that can inform gift browsing and suggestions.
- **Non-goals:** a child-development record, a public social profile, or a place to store ages and birthdays.

## Proposed experience and functional requirements

Show profiles only to approved family members. Support optional preference categories and freeform guidance, with clear labels and a way to remove outdated information. Gift cards may refer to a profile without duplicating every field.

## Administration requirements

Authorized editors manage profile content and ordering. Consider a side-panel editor consistent with Administration and wishlist editing.

## Technical, data and security considerations

Profile data is personal information and belongs in private Supabase tables with explicit role rules. Do not add age or birthday fields. Allow multiple recipients and stable IDs. Validate field length and avoid putting profile data in public HTML or repository fixtures.

## Dependencies

Current private recipient records; richer discovery and multiple occasions depend on this feature.

## Open questions

- Which fields are useful enough to include in a first version?
- Can all approved members edit profiles, or only editors/owner?
- Should any profile detail be hidden from gift buyers?
- How should profiles be archived if a recipient leaves the family list?

## Decisions made

- **Agreed:** profile is a promising future feature.
- **Agreed:** do not store ages or birthdays.
- **Deferred:** fields, access and retention.

## Future enhancements

Per-occasion preferences, favorite categories, and optional profile photos only if privacy requirements are resolved.

## Acceptance criteria

Profiles support stable recipient IDs, display only to permitted family accounts, contain no age/birthday fields, and can be changed or archived without breaking existing gift links.

## Implementation history

None. Planning record only.

