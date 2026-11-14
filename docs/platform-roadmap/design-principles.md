# Platform Expansion Design Principles

These principles apply to future proposals. Where a feature decision conflicts, document the reason instead of silently changing the standard.

1. **Keep the current family experience simple.** New capabilities should be discoverable without making routine gifting harder.
2. **Separate recipient, list manager and buyer.** A recipient must not learn who selected their gifts merely because they can edit a list.
3. **Keep private information private.** Buyer notes, purchase details, assignments and private profile fields need explicit access rules enforced by Supabase.
4. **Backend authorization is authoritative.** UI hiding is not security. Owner-only tools use private-schema RPCs and verified family roles.
5. **Prefer reversible lifecycle changes.** Archive instead of deleting when history or active selections matter. Preserve stable IDs and audit high-impact changes.
6. **Make uncertainty visible.** Separate agreed requirements from proposals, assumptions, open questions and implemented behavior.
7. **Design for mobile first, and for shared displays when needed.** Keep controls accessible, legible, keyboard operable and usable at narrow widths.
8. **Do not overbuild integrations.** External stores, AI providers, email and live-event services add security, cost and maintenance requirements; evaluate them per feature.
9. **Treat dates and estimates as honest metadata.** Priority, phase, complexity and effort answer different questions.
10. **Preserve existing behavior.** New migrations and releases must not alter existing account access, reservations, invitations, passkeys or private gift data unintentionally.

