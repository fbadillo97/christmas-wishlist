# White Elephant — Event Setup

- **Feature ID:** `white-elephant-setup`
- **State:** Proposed idea; not implemented.
- **Initial planning:** Phase 3 · Medium priority · Medium complexity (assumptions).
- **Related specifications:** [Interactive Game](white-elephant-game.md) and [feature group overview](white-elephant.md).

## 1. Feature overview

Set up a family White Elephant exchange before the event. This is the organizer workflow and configuration record; live turn logic belongs to the separate Interactive Game feature.

## 2. Problem being solved

Organizers need a clear place to record participants, budget, date, gifts expectation and house rules so guests know what to expect before the party begins.

## 3. Goals and non-goals

- **Goals:** create and edit an event, manage participants, configure and preview rules, and prepare a lobby for game day.
- **Non-goals:** implement live turns, gift ownership or real-time game controls as part of event setup alone.

## 4. Proposed user experience

An approved organizer creates an event and chooses whether participants are family accounts, guests joining via an event link/QR code, or both. The organizer enters the event date, optional budget guidance, participant roster, and rules. A preview explains the rules in plain language before the organizer opens the lobby.

## 5. Functional requirements

- Create, edit, cancel and archive an event while preserving an audit history.
- Invite or approve participants; provide QR and short-code joining if guest support is selected.
- Randomize turn order or allow the host to define it, then preview and lock the order before play.
- Configure the candidate rules documented in the Interactive Game specification.
- Validate settings together and explain incompatible combinations before an event begins.
- Save a versioned ruleset with the event and show participants the current summary.

## 6. Administration requirements

The event organizer needs controls for event visibility, participant approval, rules, lobby state and initial turn order. A family owner may need to transfer or recover event ownership. Permissions and transfer behavior are open questions.

## 7. Technical considerations

Use separate event/game records rather than storing game configuration on gift wishlist records. Keep setup screens distinct from the live TV display and player controls. QR codes should encode only a scoped, revocable join link. A short-lived token should be used for paired displays and guest admission.

## 8. Data and security considerations

An event is family data. Server-side authorization must distinguish organizer, host, participant and read-only display. Avoid permanent guest accounts unless later approved. Define expiration, roster privacy and event-history retention before implementation. Never expose a service key to the static client.

## 9. Dependencies

The event/occasion data model (`multiple-occasions`) may be a prerequisite. The Interactive Game feature (`white-elephant-game`) consumes the event and its locked configuration.

## 10. Open questions

- May any guest join by QR, or must the host approve every name?
- Can a participant be removed after the draw or after the game begins?
- Can guests see the full roster before joining?
- Should budget guidance be required, optional or omitted?
- Can an event be copied for a later year?
- Which host privileges can be transferred if the organizer is unavailable?

## 11. Decisions made

- **Agreed:** White Elephant belongs on the long-term platform roadmap.
- **Proposed:** setup and live gameplay are separate roadmap entries.
- **Deferred:** joining policy, event retention, roster controls and final rules.

## 12. Potential future enhancements

Reusable rule presets, invitations, calendar reminders and annual event templates.

## 13. Acceptance criteria

An organizer can create an event, configure and review its rules, manage participants, and prepare a lobby. Permissions are enforced in Supabase, join access is revocable, and no live gameplay begins without an explicit host action.

## 14. Implementation history

None. Planning record only.

