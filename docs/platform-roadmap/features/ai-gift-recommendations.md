# AI Gift Recommendations

- **Feature ID:** `ai-gift-recommendations`
- **State:** Exploratory idea; not implemented.
- **Initial planning:** Phase 4 · Low priority · High complexity (assumptions).

## Overview and problem

Optional recommendations could help relatives find ideas when a wishlist is sparse or difficult to browse, using approved recipient interests and preferences.

## Goals and non-goals

- **Goals:** offer relevant, clearly labeled suggestions and let users decide whether to add them to the list.
- **Non-goals:** silently adding gifts, claiming products are safe/age-appropriate without evidence, or sharing private family data with a model by default.

## Proposed experience and functional requirements

The user selects a recipient and optional budget/interests. Suggestions are labeled as generated ideas, include a short explanation and can be dismissed or submitted through the normal suggestion/approval flow.

## Administration requirements

Owner can enable/disable the feature, select data categories allowed for use, configure provider and retention settings, and review costs if an external model is used.

## Technical, data and security considerations

Identify the model/provider, costs, logging, retention, region and processor terms before implementation. Never place service credentials in the browser. Minimize input data and obtain explicit approval for external processing. Design safe fallbacks for provider errors and untrusted outputs.

## Dependencies

Recipient Profiles (`recipient-profiles`) and Smarter Gift Discovery (`smarter-gift-discovery`).

## Open questions

- Can useful suggestions be generated locally/rule-based first?
- What profile fields, if any, may be sent to an external provider?
- Should a recommendation link to a product or remain a general idea?
- How are costs and provider outages handled?

## Decisions made

- **Proposed:** this is a later, optional exploration.
- **Deferred:** provider, data sharing, consent and cost limits.

## Future enhancements

Feedback-based personalization and duplicate-product warnings.

## Acceptance criteria

External processing is opt-in and disclosed; only approved data is sent; generated content is labeled; no suggestion is published automatically; secrets and outputs are safely handled.

## Implementation history

None. Exploration only.

