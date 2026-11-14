# White Elephant — Interactive Game

- **Feature ID:** `white-elephant-game`
- **State:** Proposed concept; not implemented. Gameplay details remain open for future conversations.
- **Initial planning:** Phase 4 · Medium priority · High complexity (assumption).
- **Companion specification:** [White Elephant — Event Setup](white-elephant-setup.md) (`white-elephant-setup`).

## 1. Overview and problem

White Elephant has two different needs: organize an event and house rules before the party, then guide a live exchange where participants, wrapped gifts and physical actions can be hard to coordinate. A hybrid interface could use a television as the room display, one host as game authority, and players' phones for interaction.

## 2. Goals and non-goals

**Goals:** support setup, participant joining, a configurable ruleset, synchronized live state, host recovery, and an understandable final result.

**Non-goals for the initial concept:** implement the game now, require all guests to create permanent accounts, require gift products/photos to be registered in advance, or finalize every house rule before a later requirements discussion.

## 3. Proposed experience

- **Before the event:** organizer creates the exchange, sets participants and initial rules, and opens a lobby.
- **Joining:** QR code and short code let guests join with an event-specific identity; host approves names.
- **TV:** full-screen board with current player, turn number, opened gifts/owners, next players, and clear action prompts. It is display-first and read-only.
- **Host phone:** controls start/pause/resume, confirms physical actions when configured, corrects mistakes, undoes a recent action, skips or advances when the rules permit, and resolves disputes.
- **Player phone:** shows their turn and current gift; lets them select an eligible action or submit a steal/open-gift choice. In hybrid mode, host remains authoritative.
- **After play:** show final gift ownership and a short summary. Retention policy is undecided.

## 4. Functional requirements (proposed)

1. Create an event and roster, invite/approve guests, and randomize or host-define turn order.
2. Keep the rules configuration readable and explain how each rule affects play.
3. Track turns separately from the multiple actions that may occur during a turn.
4. Validate that a selected gift is eligible, steals respect locks/limits, and turn ownership cannot conflict.
5. If a player is stolen from, present the configured replacement action flow; exact chain semantics remain an open gameplay decision.
6. Allow reconnecting TV/phones to recover current state after refresh or network loss.
7. Record each state transition, host correction, undo and rule change.
8. Prevent simultaneous actions from causing conflicting gift ownership.

## 5. Administration and rule configuration

The future Administration area should provide a ruleset editor with sensible presets and direct controls for the house rules. Where safe, authorized hosts may adjust rules during a live event. The interface should show the current value, whether it can change now, the consequence, and require host confirmation for consequential changes. Rules changes are versioned and announced on all connected displays.

| Candidate rule | Before game | During game (candidate policy) | Notes |
|---|---|---|---|
| Maximum steals per gift | Configurable | Safe to increase; reducing requires validation and host confirmation | Must not make existing gift state invalid. |
| Immediate steal-back restriction | Configurable | Change only with host confirmation; affects current action eligibility | Define whether the restriction applies to same player, same gift, or both. |
| First player's final exchange | Configurable | Lock once final turn starts | Timing and eligible gifts need definition. |
| Turn-order selection | Random draw or host-defined | Locked after first turn | A later correction requires pause and audit. |
| Host confirmation | Required / automatic eligible moves | Safe to require more confirmation; disabling requires confirmation | Physical actions are not observable by the backend. |
| Gift lock rules | Configurable | Lock after game begins unless validation permits change | Define what locks a gift. |
| Turn timing | Optional timer / no timer | May be adjusted if no timer is currently expiring | Avoid forcing players to use phones quickly. |
| Additional house rules | Future extension | Depends on rule-specific validation | Do not promise arbitrary rules as a generic toggle. |

These are planning candidates, not final behavior. Exact classifications should be reviewed with the full rule list and state model before implementation.

### Live rule-change safety model

- **Safe change:** update has no effect on already resolved actions and cannot invalidate current state (for example, increasing a future steal cap). Apply and broadcast immediately with audit record.
- **Host confirmation and validation:** pause or validate current state, show affected players/gifts and reject changes that conflict with prior actions (for example, reducing a steal limit below the count already reached).
- **Locked after start:** a change would rewrite established turn order or reinterpret past actions. Require ending/restarting the game or a documented host correction flow rather than silently applying it.

At any edit, the server must validate against current game state, apply a versioned update atomically, record actor/time/before/after values, and publish the new rule version. If validation fails, no part of the change should apply.

## 6. Technical considerations

GitHub Pages can host separate display, host and player views. Supabase Realtime may distribute updates, but all moves and rules must be validated server-side. Use a dedicated event/game schema separate from wishlist gift records. Keep event join credentials short-lived and scoped. A paired TV display URL should be read-only and use a short-lived pairing code. Plan for transactions, reconnects, idempotency, stale client versions, and host recovery.

## 7. Data and security considerations

The host signs in with an approved family account. Guest identities should be event-scoped and expire according to a decided retention policy. Players must not see another person's private assignments or wishlist details beyond what the event explicitly permits. Host override actions require an audit record. Never expose service credentials in browser code.

## 8. Dependencies

`white-elephant-game` depends on `white-elephant-setup`. Both may depend on the broader event/occasion data model. The interactive game may depend on a future Events & Games navigation module.

## 9. Open questions

- Which participants may join: approved family accounts, guests, or both?
- Does a player phone action execute immediately or require host confirmation by default?
- What happens after a gift is stolen, and when does the numbered turn advance?
- What is the exact steal-back, lock, max-steal and first-player final-action logic?
- Can the host skip a turn, and under what safeguards?
- Are gifts represented as numbers, labels, optional descriptions or photos?
- How long are event and turn records retained?
- Should post-game statistics be retained or only the final ownership result?
- How should TV pairing and disconnection recovery work on typical smart TVs?

## 10. Decisions made

- **Agreed:** future White Elephant should support a hybrid host and player experience.
- **Agreed:** game rules should be controllable in Administration where possible, with safe changes available during play and validation/confirmation where needed.
- **Proposed:** TV is the room display, host retains authority, player phones submit/interact, guest join can use QR codes, and Supabase holds synchronized state.
- **Deferred:** detailed rules, joining policy, retention, default host confirmations, and final gameplay flow. Flesh these out before moving from Idea to Planned.

## 11. Potential future enhancements

Animations, sound, reactions, spectator view, gift descriptions/photos, statistics, and a post-game shareable summary.

## 12. Acceptance criteria (for a future release)

- The same valid event state appears on TV, host and player views after reconnect.
- Server rejects invalid, stale and conflicting actions.
- Host pause, correction and undo are auditable and recover safely.
- Rule edits follow their safety class; invalid edits are atomic no-ops.
- Mobile controls and TV display remain usable without exposing owner credentials.
- A synthetic multi-client test covers concurrent actions, locks, steals, rule edits, disconnect/reconnect, and unauthorized access.

## 13. Implementation history

None. Concept specification only. No live rules engine, event tables, or game UI have been implemented.

