# Worship Music Companion — MVP + Pro Live Sync + Instrument Tuner

> **Find a song, view its chords and lyrics, transpose it instantly, tune your instrument accurately, keep the chart readable while playing, and synchronize your worship band in real time.**

**Worship Music Companion** is a responsive web application and installable Progressive Web App (PWA) built for church musicians and worship teams. It includes the full **MVP** (song catalog, structured chord-and-lyric rendering, deterministic transposition, low-distraction Performance Mode, personal setlists, and IndexedDB offline access), the **Built-In Guitar, Bass & Chromatic Microphone Tuner** (`/tuner`), and the **Worship Music Companion Pro: Leader-Led Live Sync** feature (`/live`).

---

## 1. Feature Scope

### Core MVP Features
- **Song Catalog (`src/data/demo-songs.json`)**: Seeded with 10 original English and Filipino demo songs across Contemporary Worship, Filipino Worship, Traditional Hymn, and Gospel & Praise categories.
- **Search & Multi-Faceted Filtering (`/songs`)**: Search across title, artist, writer, language, category, and key; combine with Language, Category, Original Key, and Saved-Offline filters.
- **Structured Song Detail & Chord Chart (`/songs/[slug]`)**:
  - Clear section breakdown (`Intro`, `Verse 1`, `Chorus`, `Bridge`, `Tag`, `Outro`) and performance cues.
  - Structured `{ chord, text }` segment rendering that keeps chords aligned above their exact lyric syllables even when chord widths change during transposition (e.g., `G` → `Abmaj7` or `F#` → `Bb`).
  - Horizontal scroll protection on narrow mobile screens so long lines never wrap chords onto the wrong lyric line.
- **Dedicated Chord Transposition Engine (`src/lib/music/transposition.ts`)**:
  - Semitone stepper (`-1` / `+1`) and 12-key destination selector preserving major/minor mode.
  - One-click **Reset to Original Key** that returns to the exact source chart without rounding or cumulative drift.
  - Supports natural, sharp, and flat roots, extensions (`m`, `maj7`, `m7b5`, `sus2`, `sus4`, `add9`, `dim7`, `9`, `11`, `13`, `6/9`), slash/inversion chords (`D/F#`, `G/B`, `C/E`), and non-chord markers (`N.C.`).
  - Key-aware enharmonic spelling (`Auto`, `Sharps ♯`, `Flats ♭`).
  - Never mutates source song records or transposes lyric text, headings, or annotations.
- **Performance Mode**: Full-screen, low-distraction view with larger typography, stage dark/light surface toggle, quick transposition bar, section jump buttons, adjustable auto-scroll, and feature-detected Screen Wake Lock.
- **Favorites & Recently Viewed (`/favorites`)**: Persisted on-device with safe resolution if song IDs are ever removed.
- **Personal Setlists (`/setlists`)**: Create, rename, delete, and reorder songs across multiple local setlists.
- **Explicit Offline Saving**: Save individual songs to `IndexedDB` + Cache Storage (`Save Offline`) so saved charts open without an internet connection. Includes an in-app **Offline Mode Simulator** in Settings for easy verification.

### My Songs, Manual Song Editor & ChordPro Import/Export (`/my-songs`)
- **Device-Local Personal Song Library (`src/lib/storage/customSongsDb.ts`)**:
  - Personal songs (`sourceType: "custom"`) are persisted on the user's device in `IndexedDB` (`worship_companion_custom_songs_db`) with a synchronized `localStorage` mirror (`wmc_custom_songs_v1`).
  - Clearly distinguished from the built-in catalog (`sourceType: "catalog"`) with **My Song** badges and a dedicated **Song Source** filter in `/songs`.
  - Built-in catalog songs are strictly protected against accidental overwrite or deletion.
- **Manual Song Editor (`src/components/songs/CustomSongEditor.tsx`)**:
  - Metadata fields: **Title** (required), **Subtitle**, **Artist / Ministry**, **Writers / Composers**, **Language** (`English`, `Filipino`, `Bilingual`, etc.), **Category**, **Original Key** (validated against the transposition engine), **Tempo (BPM)**, **Time Signature**, **Capo** (`0–12`), **Copyright / Attribution**, **Song / Arrangement Notes**, and **Rights / License Notes**.
  - Section & Line Builder: Add, rename, reorder, duplicate, or delete sections (`Intro`, `Verse`, `Pre-Chorus`, `Chorus`, `Bridge`, `Tag`, `Instrumental`, `Interlude`, `Outro`, `Custom Section`).
  - Two editing modes per line:
    1. **Inline Bracket Editor + One-Tap Cursor Insertion**: Place the cursor anywhere in a lyric line and tap any diatonic key chord chip (e.g., `G`, `C`, `D`, `Em`, `D/F#`) or custom chord input to insert `[Chord]` at the exact syllable.
    2. **Visual Segment Editor**: Add, edit, or remove individual `{ chord, text }` segments side by side.
  - Non-destructive chord token validation warnings plus a live transposable **Rendered Chart Preview** right alongside the editor.
- **ChordPro Import & Export (`src/lib/chordpro/chordPro.ts`)**:
  - **Import**: Upload `.cho`, `.chopro`, `.crd`, `.chord`, `.pro`, or `.txt` files (up to `256 KB`) or paste ChordPro text directly.
  - **Supported Directives**:
    - Metadata: `{title}` / `{t}`, `{subtitle}` / `{st}`, `{artist}`, `{composer}` / `{lyricist}` / `{author}`, `{key}`, `{tempo}`, `{time}`, `{capo}`, `{copyright}`, `{meta: ...}`.
    - Sections: `{start_of_verse}` / `{sov}`, `{end_of_verse}` / `{eov}`, `{start_of_chorus}` / `{soc}`, `{end_of_chorus}` / `{eoc}`, `{start_of_bridge}` / `{sob}`, `{end_of_bridge}` / `{eob}`, `{start_of_intro}` / `{soi}`, `{end_of_intro}` / `{eoi}`, `{start_of_outro}` / `{soo}`, `{end_of_outro}` / `{eoo}`, `{start_of_part}` / `{sop}`, `{end_of_part}` / `{eop}`, `{chorus}`, and standalone section headers (`[Verse 1]`, `Chorus:`).
    - Comments & Notes: `{comment}` / `{c}`, `{comment_italic}` / `{ci}`, `{comment_box}` / `{cb}`, and `#` comment lines.
    - Unsupported directives (e.g., `{define}`, `{textsize}`) and malformed brackets produce clear, non-destructive warnings and preserve directive text in `sourceNotes`.
  - **Export (`.cho`)**: Export any song as a clean `.cho` file from `/my-songs` or `/songs/[slug]`. Exports the stored original key and chords by default and omits internal app IDs.

### Built-In Guitar, Bass & Chromatic Tuner (`/tuner`)
- **Three Tuning Modes**:
  - **Guitar (6-String Standard)**: `E2` (82.41 Hz), `A2` (110.00 Hz), `D3` (146.83 Hz), `G3` (196.00 Hz), `B3` (246.94 Hz), `E4` (329.63 Hz) ordered low-to-high (`6th` to `1st` string).
  - **Bass (4-String Standard)**: `E1` (41.20 Hz), `A1` (55.00 Hz), `D2` (73.42 Hz), `G2` (98.00 Hz) ordered low-to-high (`4th` to `1st` string).
  - **Chromatic**: Detects any semitone across the instrument range (`30 Hz` – `1200 Hz`) with user-selectable **Sharps (`♯`)** or **Flats (`♭`)** note spelling.
- **Auto & Manual String Selection**:
  - **Auto-Detect Closest String**: Automatically snaps to the closest standard string for the active instrument preset.
  - **Manual String Lock**: Tap any string button to lock the comparison display and cents gauge to that exact target string.
- **Time-Domain YIN Pitch Detection (`src/lib/tuner/tunerEngine.ts`)**:
  - Uses Web Audio API `AnalyserNode` (`fftSize = 8192`) with time-domain **YIN Cumulative Mean Normalized Difference (CMND)** and parabolic lag interpolation rather than naive FFT bin peak picking.
  - Accurately resolves fundamental pitch down to low Bass `E1` (`41.20 Hz`) even when real instrument strings produce strong 2nd and 3rd harmonic overtones.
  - Includes an RMS noise gate, confidence threshold, and `PitchSmoother` (rolling median + exponential moving average with instant string-switch reset) to prevent display jitter.
- **Visual Cents Gauge & Accessible Status Cues**:
  - Displays detected note, octave, frequency in Hz, cents offset (`-50¢` to `+50¢`), target string comparison, and tuning guidance that combines color, icon, and text (`Too Flat — Tune Up`, `In Tune` within `±5¢` inclusive, `Too Sharp — Tune Down`).
- **Strict Microphone Privacy & Lifecycle Cleanup (`src/lib/tuner/tunerController.ts`)**:
  - Never requests microphone access on page load; requires an explicit user tap on **Start Listening**.
  - Never connects the microphone source to `AudioContext.destination` (zero speaker feedback/monitoring).
  - Stops all `MediaStreamTrack`s, disconnects audio nodes, cancels animation/polling timers, and closes the `AudioContext` immediately on **Stop** or page unmount.

### Pro Feature: Leader-Led Live Sync (`/live`)
- **Shared Application-State Synchronization**: Synchronizes stable `songId`, `arrangementId`, `officialSemitones`, `enharmonicPreference`, semantic `activeSectionId` / `activeSectionLabel`, and `setlistSongIds` across connected devices in real time without video streaming or raw pixel scroll mirroring.
- **Leader Capabilities**:
  - Start a live session directly from `/live`, from any song detail page (**Start Live Sync**), or from any personal setlist (`/setlists`).
  - Generate a 6-character join code and an HMAC-signed expiring invitation link (`/live?code=...&invite=...`).
  - View connected team members, their selected instrument view, and their live connection status (`connected`, `reconnecting`, `disconnected`).
  - Navigate between songs in the live setlist queue, transpose the official concert key, and jump between semantic song sections (`Intro`, `Verse 1`, `Chorus`, `Bridge`, etc.) for all followers simultaneously.
  - Promote/revoke **Co-Leader** permissions or transfer primary **Leader** control via server-verified role checks.
  - End the session safely without deleting any participant's personal favorites, local setlists, or saved offline songs.
- **Member Capabilities**:
  - Join an active session via 6-character join code or invitation link and immediately receive the authoritative server snapshot.
  - Toggle between **Follow Leader** (automatically tracks the leader's song, key, and section) and **Browse Independently** (explore other sections, keys, or songs locally with a one-tap **Return to Leader** button).
  - Switch between **Instrument-Specific Guidance Views** while remaining synchronized to the shared song, concert key, and active section:
    - **General Chart**: Clean chord-and-lyric chart.
    - **Guitar View**: Concert key + interactive **Capo & Shape Assistant** that displays capo-relative chord shapes (`A [G]`, `F#m7 [Em7]`, `D/F# [C/E]`) alongside concert chords.
    - **Keyboard View**: Active-section **Left-Hand Bass & Right-Hand Voicing Guide** (chord tones and inversion tips).
    - **Bass View**: Active-section **Pedal & Slash-Inversion Map** highlighting primary bass notes (e.g., `D/F# → Play Bass: F#`) and fifths.

---

## 2. Requirements, Environment Variables & Local Setup

### Prerequisites
- **Node.js**: `v20.19+` or `v22+` / `v24+` (tested with Node `v24.14.0`)
- **npm**: `v10+` (tested with npm `v11.9.0`)

### Environment Variables (Optional for Local Dev, Recommended for Production)
Create a `.env.local` file in the project root if deploying or customizing signing secrets:

```bash
# Server-side HMAC-SHA256 secret used to sign and verify Live Sync participant tokens and expiring invite links.
# Never exposed to the browser. Defaults to a local development fallback when omitted.
LIVE_SYNC_SECRET=replace-with-a-long-random-32-byte-secret-in-production
```

### Install & Run
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser:
- **Tuner**: Open [http://localhost:3000/tuner](http://localhost:3000/tuner) and click **Start Listening** to grant microphone permission.
- **Live Sync**: Open [http://localhost:3000/live](http://localhost:3000/live) in two or more independent browser windows, start a session as the Worship Leader in one window, and join using the 6-character join code or invite link in the other window(s).

### Run Verification Checks (Tests, Typecheck, Lint, Production Build)
```bash
# Run unit & integration tests (chord transposition engine, catalog validation, Live Sync, and Tuner engine/lifecycle)
npm test

# Run TypeScript type checking
npm run typecheck

# Run ESLint
npm run lint

# Build and start production server
npm run build
npm start
```

---

## 3. Tuner Browser Requirements & Known Limitations

- **Secure Context Required (`HTTPS` or `localhost`)**: Browsers restrict `navigator.mediaDevices.getUserMedia` to secure contexts (`https://` or `http://localhost` / `127.0.0.1`). Opening the app over plain `http://192.168.x.x` on a LAN phone/tablet will prevent microphone access unless served over HTTPS.
- **Explicit User Gesture**: Audio capture and `AudioContext.resume()` are strictly initiated only when the user clicks **Start Listening** (satisfying iOS Safari and Chrome autoplay/microphone policies).
- **Raw Instrument Audio Processing**: The tuner requests `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }` so sustained guitar and bass notes are not filtered out as background noise, with automatic fallback to `{ audio: true }` on browsers that reject advanced constraints.
- **Low-Frequency Bass (`E1 = 41.20 Hz`) Hardware Acoustics**: Built-in phone and laptop microphones often roll off fundamental energy below `60 Hz`. While the YIN pitch detector reconstructs the fundamental period from harmonic spacing, best results for 4-string bass `E1` and `A1` are achieved by plucking firmly near the 12th fret in a quiet room or using an audio interface / clip-on mic.
- **Single-Note Monophonic Detection**: The tuner is designed for plucking one open string at a time; strumming full chords simultaneously will produce low confidence (`Listening for a clear note...`).

---

## 4. Live Sync Architecture & Production Supabase Blueprint

### Built-In Authoritative Server Engine (`src/lib/live/liveSessionServer.ts`)
To work out-of-the-box without requiring external cloud credentials while enforcing real server-side security and multi-client synchronization across independent browser clients:
1. **Authoritative Server Snapshot & Monotonic Revisions**:
   - Hosted via Next.js Route Handlers (`/api/live/sessions`, `/api/live/sessions/join`, `/api/live/sessions/[sessionId]`, `/api/live/sessions/[sessionId]/stream`).
   - Every state change increments `session.revision` monotonically. Out-of-order or stale updates (`expectedRevision < session.revision`) are rejected with `409 Conflict (STALE_REVISION)`.
2. **Server-Side Cryptographic Authorization**:
   - Joining or starting a session issues an HMAC-SHA256 signed `participantToken` bound to `(sessionId, participantId)`.
   - Only the session's `leaderId` or a participant listed in `coLeaderIds` can mutate `sharedState` (`403 Forbidden` for regular members).
   - Only the primary `leaderId` can transfer primary leadership or end the session (`403 Forbidden` for all others).
   - Invitation links embed a signed `inviteToken` with an expiration timestamp and version counter (`410 Gone` when expired or when the session has ended).
3. **Real-Time Delivery & Reconnection Recovery**:
   - Connected clients subscribe to `/api/live/sessions/[sessionId]/stream` via **Server-Sent Events (SSE)**.
   - When a client disconnects and reconnects (or clicks **Test Reconnect** in the UI), it immediately fetches the latest authoritative snapshot via `GET /api/live/sessions/[sessionId]` before resuming real-time stream updates.

### Minimum Production Multi-Region Infrastructure (Supabase Realtime + Postgres)
When deploying across horizontally scaled serverless instances (e.g., Vercel or Firebase App Hosting), replace the local file/in-memory store in [`src/lib/live/liveSessionServer.ts`](./src/lib/live/liveSessionServer.ts) with **Supabase**:
- **Authentication**: Supabase Auth (Email Magic Link / OAuth for Worship Leaders; anonymous or session-scoped JWTs for invited band members).
- **Database (`live_sessions` & `live_participants` tables)**:
  - Persist `session_id`, `join_code`, `leader_id`, `co_leader_ids`, `status`, `revision` (`bigint`), `shared_state` (`jsonb`), and `expires_at` (`timestamptz`).
  - Enforce atomic revision increments in Postgres: `UPDATE live_sessions SET shared_state = $1, revision = revision + 1 WHERE session_id = $2 AND revision = $3`.
- **Realtime Broadcast & Presence**:
  - Configure private Supabase Realtime channels (`live-session:${sessionId}`) with Row-Level Security (RLS) on `realtime.messages` so only authenticated participants in `live_participants` can subscribe, and only `leader_id` / `co_leader_ids` can broadcast `state_updated` events.
  - Use **Supabase Realtime Presence** to track `connected` / `reconnecting` member state and selected instrument views.

---

## 5. Verified vs. Simulated Behaviors

| Capability | Status | Details |
| :--- | :--- | :--- |
| **Tuner pitch conversion, cents math, presets & YIN detection** | **Verified (Automated Synthetic Audio)** | Verified across 10 unit/integration test suites in [`src/lib/tuner/__tests__/tuner.test.ts`](./src/lib/tuner/__tests__/tuner.test.ts), including synthetic waveforms with harmonics down to Bass `E1` (`41.20 Hz`) and leak-free start/stop lifecycle. Physical microphone hardware testing requires an interactive browser session with a real instrument. |
| **Multi-client real-time sync (Leader + Followers)** | **Verified** | Verified across independent HTTP/SSE clients against `/api/live/sessions/*` and covered by automated tests in [`src/lib/live/__tests__/liveSync.test.ts`](./src/lib/live/__tests__/liveSync.test.ts). |
| **Server-side role permissions (`403`) & invite expiration (`410`)** | **Verified** | Verified with cryptographic HMAC-SHA256 tokens; unauthorized member mutations return `403 FORBIDDEN_NOT_LEADER`. |
| **Revision ordering & stale update protection (`409`)** | **Verified** | Outdated `expectedRevision` payloads are rejected with `409 STALE_REVISION` and return the latest authoritative snapshot. |
| **Disconnect & Reconnect Snapshot Recovery** | **Verified + Testable in UI** | Automatic SSE reconnection reloads `GET /api/live/sessions/[sessionId]`; also includes a **Test Reconnect** toggle in the `/live` header for interactive rehearsal testing. |
| **Offline Mode & Wake Lock** | **Verified + Simulator** | Songs saved via `Save Offline` persist in `IndexedDB`. Includes an **Offline Mode Simulator** toggle in `/settings`. |

---

## 6. Demo Song Data & Adding Authorized Songs

- **Seed Data**: [`src/data/demo-songs.json`](./src/data/demo-songs.json)
- **TypeScript Schema**: [`src/types/song.ts`](./src/types/song.ts)
- **Validator**: [`src/lib/validation/songValidator.ts`](./src/lib/validation/songValidator.ts)
- **Data Access Layer**: [`src/lib/catalog/songCatalog.ts`](./src/lib/catalog/songCatalog.ts)

All initial records are original fictional demo compositions labeled with `"contentStatus": "demo"`. Before adding real songs for church or public use, review [`CONTENT_AND_RIGHTS.md`](./CONTENT_AND_RIGHTS.md).

