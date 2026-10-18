# Supplemental Development Prompt: Worship Music Companion Pro — Leader-Led Shared Live Session

## Purpose

Add a leader-led synchronization feature to the existing Worship Music Companion project. This is a supplemental feature prompt, separate from the basic MVP prompt.

The feature is intended for the future **Worship Music Companion Pro** version unless the product owner explicitly requests a prototype earlier. Inspect the existing repository and architecture before making changes. Preserve the current app stack and existing behavior. Do not rebuild unrelated features or silently expand the MVP scope.

## Product owner's idea

During worship rehearsal or a church service, the music ministry leader starts a live session and shares an invite code or link. Guitarists, keyboardists, bassists, and other invited team members join from their own phones, tablets, or computers. When the leader selects a song, changes the official key, moves to a section, or navigates the chart, each participant's device updates so the team can follow together.

The owner initially described this as "screen sharing" or "screen mirroring." For the primary workflow, implement **leader-led live chart synchronization**, not a video of the leader's display. Each member's device should render the same shared song state using its own responsive layout. This is more readable across different screen sizes and uses much less network bandwidth than continuously streaming pixels.

Actual screen broadcasting can be considered as a separate optional future enhancement; it is not the default implementation.

## 1. Core product behavior

### A. Start a live session

A user with the Worship Leader role can:

- Start a new live session from a setlist or a song.
- Give the session a name, such as "Sunday Worship — 9 AM." 
- Share a join link and/or short join code with team members.
- See connected participants and their connection status.
- End the session for everyone.
- Transfer leadership to another authorized team member, if permitted by the role model.

The UI must clearly show when a session is live and which person is leading it.

### B. Join a live session

A team member can join using an invite link or code. The joining flow should:

- Explain which session is being joined and identify the leader.
- Ask for authentication if required by the existing application. If the application does not yet have accounts, do not invent a production-grade identity system; provide a clearly marked development-only path or implement the join flow after authentication exists.
- Validate the invite and reject expired, revoked, invalid, or unauthorized join attempts.
- Show a participant list with online/reconnecting status.
- Load the latest authoritative session state immediately after joining, not only events sent after they connected.
- Let the user leave a session without deleting their personal favorites or setlists.

### C. Shared state to synchronize

The leader is the authority for the shared performance state. Other connected members receive updates for:

- Current song ID and song/arrangement version.
- Official performance key / transposition offset.
- Active song section, such as Intro, Verse, Chorus, Bridge, or Outro.
- Current chart anchor, such as an identified lyric line or chart segment, rather than only a raw pixel scroll coordinate.
- Performance-mode on/off state.
- The selected song in the current shared setlist and the ordered setlist itself, when the leader changes it.
- Tempo and time signature metadata when present.
- Explicit leader cues, such as "Verse 2," "Chorus," "Bridge," "Repeat Chorus," and "Ending."
- Optional playback state only if a future, licensed audio/video player exists. Do not imply that audio playback is synchronized in this implementation unless it is actually implemented and tested.

Only broadcast state when it changes. Do not continually send large song objects, lyrics, or full chart payloads on every scroll event. Send stable IDs and small state updates; fetch or load authorized song content from the existing catalog.

### D. Same shared view, without forcing identical physical layouts

Build two clear viewing behaviors:

1. **Follow Leader (default):** Follow the leader's selected song, official key, chart section/anchor, setlist navigation, and explicit cues. Each device lays out the same state responsively. A narrow phone may wrap or scroll differently from a wide tablet, but the semantic chart position should remain aligned as closely as possible.
2. **Browse Independently:** A member can temporarily explore another song or section without changing the leader's session. Make the temporary independent state obvious and provide a one-tap **Return to Leader** action.

If instrument-specific Pro views exist, keep the shared song, official key, active section, and cues synchronized while rendering the member's local instrument presentation (guitar, keyboard, or bass). Provide an optional "Shared Chart" view if team members need to display the same chord-and-lyric chart format.

The leader should be able to tell when the team is following the shared state. If the product later supports locking participant navigation, make that an explicit session setting and explain it to members. Do not silently hijack a member's screen when they are in Browse Independently mode.

## 2. Important distinction: synchronization versus literal screen mirroring

The default design must be **application-state synchronization**:

- A leader selects the chorus, and members' charts move to the chorus anchor.
- A leader transposes the song, and every follower sees the updated official key and transposed chord chart.
- A leader changes the song, and followers load that song's corresponding chart.
- A late joiner receives the latest state immediately.

Do not stream a screenshot or video of the leader's entire screen as the normal feature. Pixel mirroring is less responsive, harder to read on devices of different sizes, and can expose unrelated notifications or other private information.

### Optional later enhancement: actual screen broadcasting

If actual screen broadcasting is later requested, design it as a separate feature with a separate UI label such as "Broadcast Screen." Investigate browser support, secure-context/HTTPS requirements, user-initiated screen-capture permission, WebRTC signaling, connection quality, and mobile operating-system limitations before implementation. Screen capture permission must be explicit each time the browser requires it, and the user must be able to stop sharing immediately. Never start screen capture silently. Do not implement actual screen broadcast as a substitute for shared-state synchronization.

## 3. Recommended architecture

First inspect the current project. Reuse its backend and authentication provider if available. If no backend exists, explain the minimum infrastructure needed before implementing production multi-user synchronization. Do not pretend localStorage alone can synchronize separate devices.

Recommended architecture:

- **Persisted session snapshot:** Store the current session status, leader, membership/authorization data, active song/setlist, official key, active section/anchor, and revision in a server-side store. The database snapshot is the source of truth when a user joins or reconnects.
- **Realtime event channel:** Use a secure WebSocket-based realtime channel to broadcast small state-change messages with low latency.
- **Presence:** Track which authorized members are connected, reconnecting, or have left. Presence should not be used as a high-frequency transport for scroll position or every state event.
- **Authorization:** Only the leader or designated co-leader may publish authoritative session changes. Members may send allowed actions such as acknowledgement or request-to-take-control, but they must not impersonate the leader or directly overwrite authoritative state.
- **Transport choice:** If the existing stack uses Supabase, evaluate Supabase Realtime Broadcast for state-change events, Presence for participant status, database persistence for the latest state snapshot, and Row Level Security/private-channel authorization. If the project uses another backend, use its appropriate secure realtime equivalent. Do not add Supabase blindly when a suitable backend already exists.
- **No secret exposure:** Never expose service-role, admin, or server secrets to the browser. Validate session membership and permissions server-side or through correctly configured authorization policies.

Realtime events should have a documented, typed schema. A suggested conceptual payload:

```ts
 type SharedSessionState = {
   sessionId: string;
   revision: number;
   leaderId: string;
   status: "live" | "ended";
   setlistId?: string;
   currentSongId?: string;
   arrangementId?: string;
   transpositionSemitones: number;
   displayedKey?: string;
   activeSectionId?: string;
   activeChartAnchor?: string;
   performanceMode: boolean;
   tempoBpm?: number;
   timeSignature?: string;
   updatedAt: string;
 };
```

This is a starting point, not a mandate to copy verbatim. Adapt it to the existing data model. Use stable song and section IDs instead of relying on titles or raw pixel positions. The server must validate every state-changing request.

## 4. Realtime behavior and reliability

Implement the following behaviors deliberately:

- Use monotonically increasing revisions or another conflict-resistant ordering method so stale messages cannot override newer state.
- Apply leader changes optimistically only when appropriate, with clear error recovery if the server rejects the update.
- When followers reconnect, fetch the current persisted snapshot and reconcile it before resuming follow mode.
- When a follower briefly loses connectivity, show a visible "Reconnecting" or "Connection lost" status rather than implying they are synchronized.
- If events arrive out of order, ignore obsolete revisions and recover from the latest snapshot.
- If the leader disconnects, indicate that the session is temporarily without a leader. Do not silently elect another leader unless an explicitly designed handoff policy allows it.
- If the leader ends the session, notify members and return them to a safe page; do not delete their own content.
- Provide sensible behavior for a member who joins late or changes devices.
- Do not send the entire chart on every update. Minimize event payloads and avoid excessive broadcasts.
- Throttle/debounce chart-position events if needed, and synchronize semantic anchors (section/line IDs) rather than assuming different devices have identical pixel dimensions.
- Include clear error, loading, expired invite, no permission, ended session, and offline states.

## 5. Security and privacy

- Live sessions must be private by default.
- Use authenticated membership/role checks for protected team sessions.
- Treat a short join code as an invitation mechanism, not as complete authorization by itself. Use sufficient entropy, expiration, revocation, and server-side validation.
- Consider rate limiting join attempts and invalid codes.
- Members must not be able to change the official shared key, setlist order, or current song unless the leader grants permission.
- Never capture or transmit a device's whole screen in the default synchronized-chart mode.
- Show session membership and relevant permissions clearly.
- Do not log sensitive invite tokens or expose them in analytics.

## 6. UX screens and controls

Create these screens/states using the existing app's visual system:

1. **Start Live Session:** Choose a setlist or song, review initial key/tempo, and start.
2. **Invite Team:** Show join link/code, copy/share actions, expiration/renewal controls, and member count.
3. **Live Leader View:** Show current song, official key, active section, participant presence, next/previous section actions, next/previous song, and end-session control.
4. **Join Session:** Enter code or open link, confirm session identity, and join.
5. **Follower View:** Show the shared chart, current key and section, leader identity, connection state, and Follow Leader/Browse Independently control.
6. **Participant List:** Show names or display names, instrument where known, and connection status; allow the leader to remove a participant where permissions allow.
7. **Connection/Recovery states:** Reconnecting, out of sync, session ended, invalid/expired invite, and no internet.

Make leader controls safe for use during a service: large touch targets, no unnecessary dialogs for common transitions, and confirmation only for destructive actions such as ending a session or removing a participant.

## 7. Scope boundaries

Implement only the shared-live-session behavior described here. Do not add video calls, cameras, microphones, chat, cloud audio mixing, meeting recording, or actual screen broadcasting unless explicitly requested in a separate specification.

If the current project is still the basic MVP with no authentication/backend, do not fake multi-device synchronization using localStorage or a simulated participant list. Instead:

1. Identify the existing backend and auth status.
2. Propose the minimum production-capable backend/auth/realtime changes.
3. Implement the feature only if those dependencies are configured or can be set up cleanly with environment-variable placeholders and documented setup steps.
4. If credentials are unavailable, build the frontend states and interfaces with an explicit development mock, keep the real adapter clearly separated, and document that cross-device sync is not yet functional. Do not claim it works across devices until verified.

This feature belongs to the Pro roadmap by default. Do not weaken or delay the existing basic MVP deliverable to implement it prematurely.

## 8. Acceptance criteria

The feature is complete only when the following can be demonstrated with at least two independent browser/device sessions connected to the configured backend:

1. A leader can start a session and share a working invite link/code.
2. An authorized member can join and appears in the live participant list.
3. A follower joining late receives the current song, transposition, active section, and current session revision.
4. When the leader changes the song or setlist position, all followers in Follow Leader mode update correctly.
5. When the leader changes key, all followers see the correctly transposed chart. Lyrics and section labels remain unchanged.
6. When the leader changes section or chart anchor, followers navigate to the corresponding semantic anchor without depending on matching pixel sizes.
7. A follower can browse independently and return to the leader without changing the leader's state.
8. Non-leader users cannot publish authoritative state changes unless their role explicitly permits them.
9. Disconnect/reconnect restores the latest session snapshot and clearly reports temporary loss of sync.
10. Expired, invalid, revoked, or unauthorized join attempts are rejected safely.
11. Ending a session closes the live session for members without deleting personal data.
12. No browser captures or streams a user's device screen in the default synchronized-chart feature.
13. Tests cover state updates, authorization/role restrictions, event ordering, join/rejoin, and error paths.
14. README documentation accurately explains setup, environment variables, backend requirements, and which parts were actually tested.

## 9. Developer workflow and final report

1. Inspect the current repository, existing MVP, data model, authentication, and backend integrations.
2. Summarize the implementation plan briefly and then proceed without asking unnecessary questions.
3. Implement a maintainable, typed live-session module with clean boundaries between persistence, realtime transport, authorization, and UI.
4. Add or update tests and run lint/type-check/build/test commands available in the repository.
5. Do not claim multi-device operation is verified unless it was tested with two independent clients against a real configured backend.
6. In the final report, distinguish clearly between implemented, simulated, and not configured behavior. Document any infrastructure or environment-variable setup still required.

**Final instruction:** Implement leader-led synchronized song/chart state, not literal pixel mirroring. Keep true screen broadcasting as a separate optional future feature. Preserve the basic MVP and implement this as a Pro module unless the project owner explicitly changes that scope.
