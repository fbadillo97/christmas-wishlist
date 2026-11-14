# Platform Roadmap

This folder is the version-controlled home for planning the Badillo family wishlist platform beyond its current Christmas wishlist. Detailed proposals here are linked to stable feature IDs stored in the owner-only Supabase roadmap.

## Sources of truth

- **Supabase Administration → Platform Roadmap:** current priority, complexity, phase, status, dependencies, implementation references and dates.
- **This folder in GitHub:** detailed requirements, assumptions, decisions, unanswered questions and implementation history.
- **Application code and deployed behavior:** what is actually implemented. A roadmap entry is not proof that a feature is live.

Do not put real family gifts, personal contact details, private notes, credentials, or member-only data in these public repository documents.

## Feature lifecycle

`Idea → Planned → In Progress → Testing → Completed`

`On Hold` can pause work. `Archived` means intentionally retired. Completed items remain in the release history; reopening should retain the prior history and record why work resumed. Mark a feature Completed only after the code is deployed and the agreed verification has passed. Link commits, pull requests, migrations, and verification evidence when available.

Priority and phase are separate: high-priority work may belong in a later phase. Complexity is an implementation-risk estimate, not a schedule estimate. Initial values are planning assumptions. Quick Wins means high priority plus low complexity.

## Specification template

Each feature file should distinguish **Agreed**, **Proposed**, **Assumption**, **Open question**, and **Implemented**. Record decisions with enough context to continue in another conversation. Update the roadmap metadata and feature document together when a decision changes scope or dependencies.

## Initial backlog

| Feature ID | Feature | Phase | Specification |
|---|---|---:|---|
| `family-gift-suggestions` | Family Gift Suggestions | 1 | [Open](features/family-gift-suggestions.md) |
| `recipient-profiles` | Recipient Profiles | 1 | [Open](features/recipient-profiles.md) |
| `smarter-gift-discovery` | Smarter Gift Discovery | 2 | [Open](features/smarter-gift-discovery.md) |
| `personal-gift-planner` | Personal Gift Planner | 2 | [Open](features/personal-gift-planner.md) |
| `multiple-occasions` | Multiple Occasions | 3 | [Open](features/multiple-occasions.md) |
| `secret-santa` | Secret Santa Organizer | 3 | [Open](features/secret-santa.md) |
| `white-elephant-setup` | White Elephant — Event Setup | 3 | [Open](features/white-elephant-setup.md) |
| `white-elephant-game` | White Elephant — Interactive Game | 4 | [Open](features/white-elephant-game.md) |
| `ai-gift-recommendations` | AI Gift Recommendations | 4 | [Open](features/ai-gift-recommendations.md) |
| `white-elephant-enhancements` | White Elephant Enhancements | 4 | [Open](features/white-elephant-enhancements.md) |

These entries capture ideas and initial planning assumptions, not authorization to implement the features. The roadmap foundation itself is implemented separately.

