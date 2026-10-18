# Worship Music Companion Pro — Product Roadmap

> **Note:** The features documented in this roadmap describe the planned future product (**Worship Music Companion Pro**). None of these features are implemented in the current MVP. The current MVP is focused strictly on local song browsing, structured chord-and-lyric rendering, dependable chord transposition, personal setlists, and basic device-local offline saving.

---

## Overview

The MVP establishes a rock-solid foundation: a structured, immutable song data model and a deterministic chord transposition engine. Future releases will expand upon this core without requiring a rewrite of the underlying song schema or rendering pipeline.

---

## Pro Pillar A: Instrument Learning

- **Curated & Commissioned Video Tutorials**: Video lessons linked directly to specific songs and arrangements.
- **Structured Lesson Types**: Full-song walkthroughs, technique breakdowns, and guided-practice sessions.
- **Full Guitar Experience**:
  - Interactive chord diagrams and voicing libraries
  - Capo placement guidance and transposed-shape assistance
  - Strumming and fingerpicking patterns
  - Fretboard visualization, scale overlays, and alternate tuning support
- **Full Keyboard Experience**:
  - Interactive piano key diagrams
  - Chord tones, inversions, and worship voicing suggestions
  - Left-hand / right-hand split guidance
- **Full Bass Experience**:
  - Fretboard diagrams and root/passing-tone maps
  - Bass lines, groove lessons, and tablature where licensed
- **Multi-Instrument Expansion**: Future support for drums and vocal harmony parts.
- **Granular Lesson Metadata**: Tutorials tagged by instrument, difficulty level, arrangement version, and song section, complete with video section timestamps and playback-speed controls.

---

## Pro Pillar B: Practice & Performance Tools

- **Integrated Instrument Tuner**: Chromatic and instrument-specific reference tuning.
- **Worship Metronome**: Adjustable BPM, time signatures (`4/4`, `6/8`, `3/4`, etc.), customizable click sounds, visual tap tempo, and count-in support.
- **Backing Tracks & Practice Playback**: Synced audio playback for individual practice.
- **Section Looping**: Repeat and loop specific song sections (e.g., Bridge or Intro) during practice.
- **Instrument-Specific Practice Tracks & Stems**: Isolated instrument stems and custom mix levels where licensing permits.
- **Advanced Live Mode**: Bluetooth foot-pedal / page-turner hardware integration (`PageUp`/`PageDown`/HID mappings) and setlist-continuous swipe navigation.
- **Extended Offline Media**: Encrypted/authorized offline caching for licensed tutorial videos and audio stems.

---

## Pro Pillar C: Worship Teams & Collaboration

- **Church & Team Workspaces**: Multi-tenant organization spaces for local churches and ministries.
- **Role-Based Access Control (RBAC)**: Distinct permissions for Church Administrators, Worship Leaders, Music Directors, and Musicians.
- **Collaborative Setlists & Service Planning**:
  - Shared service setlists with official keys, tempos, and chosen arrangements
  - Rehearsal schedules, leader notes, stage cues, and section transition markers
- **Team Communication & Sync**:
  - Member invitations, roster scheduling, and rehearsal notifications
  - Real-time cloud synchronization across team members' devices
  - Conflict resolution when shared arrangements or annotations are updated concurrently

---

## Pro Pillar D: Music Theory & Advanced Charting

- **Nashville Number System (NNS)**: Instant toggle between standard chord symbols and Nashville numbers (`1`, `4`, `5`, `6m`, etc.) in any key.
- **Capo & Transposed-Shape Assistant**: View concert key chords alongside capo-relative guitar shapes simultaneously.
- **Advanced Voicings**: Contextual chord voicing recommendations tailored to musical style.
- **Custom Chart Creation & Authoring**:
  - Visual and text-based chord chart editor for original church songs
  - Authorized church/user song uploads with automatic chord alignment
  - Arrangement variants (e.g., Acoustic Service vs. Full Band) and personal musician sticky notes
- **MIDI Integration**: Send program changes and tempo/key metadata to external keyboards and effects processors.

---

## Pro Pillar E: Catalog & Administration

- **Admin & Content Management Dashboard**: Dedicated back-office interface for catalog editors.
- **Editorial & Review Workflow**: Multi-step approval and correction workflow for community or contributor song charts and tutorials.
- **Feedback Loops**: In-app song requests and structured chart error reporting.
- **Rights & Attribution Management**: Per-song licensing metadata, CCLI/publisher tracking, territory restrictions, and per-content usage permissions.
- **Licensed Catalog Integrations**: Official API integrations with licensed worship catalog providers where commercially and legally established.
- **Multilingual Catalog Expansion**: Deep support for English and Filipino worship catalogs, plus regional language expansion (Cebuano, Ilocano, Spanish, Korean, etc.).
- **Contributor Program**: Vetted contributor agreements and quality-reviewed charting program.

---

## Pro Pillar F: Commercial Model

- **Tiered Memberships**: Evaluate individual musician subscriptions alongside church/team seat plans.
- **Feature Packaging**: Clear delineation between free community utilities (local transposition, basic charts) and Pro capabilities (licensed catalogs, stems, team sync, video lessons).
- **Billing Infrastructure**: Integrate subscription billing and entitlement management only after licensing frameworks and team workflows are validated.

---

## Pro Pillar G: AI Song Assistant (Future Pro Feature)

> **Status:** Planned for **Worship Music Companion Pro**. No AI APIs, LLM endpoints, or MCP integrations are implemented in the current MVP.

- **Assisted Chart Cleanup & Conversion**:
  - Clean up messy pasted plain-text chord sheets (such as chords typed on separate lines above lyrics) and convert them into structured `{ chord, text }` segments or clean **ChordPro (`.cho`)** markup.
  - Normalize non-standard chord tokens (e.g., `Gmin7` → `Gm7`, `BbM7` → `Bbmaj7`, slash-bass spacing) so every chord works reliably with the deterministic transposition engine.
  - Automatically detect song sections (`Intro`, `Verse`, `Pre-Chorus`, `Chorus`, `Bridge`, `Tag`, `Outro`), infer musical keys from diatonic chord progressions, and suggest original lyric/chord drafts for new church compositions.
- **Mandatory Human Review & Non-Destructive Workflow**:
  - AI-assisted output is always loaded into the **Manual Song Editor** as a reviewable draft before saving.
  - AI suggestions never overwrite a user's stored custom song or built-in catalog record without explicit human confirmation.
- **Security, Rate Limiting & Rights Guardrails**:
  - All LLM/AI calls in Pro must be routed through authenticated server-side endpoints so API keys are never exposed in client bundles.
  - Enforce per-user and per-church rate limiting and payload size caps.
  - Strict copyright and licensing guardrails: the AI Song Assistant will never fetch, scrape, or reproduce copyrighted lyrics or commercial arrangements from the web or model memory; it operates strictly on user-supplied authorized text or original songwriting prompts.

