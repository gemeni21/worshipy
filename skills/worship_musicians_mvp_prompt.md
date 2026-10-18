# Build Prompt: Church Musicians Song & Chord App — MVP

## Your role
Act as a senior product engineer, UX/UI designer, and pragmatic software architect. Build a polished, working first version of a church musicians app. The app's working name is **Worship Music Companion**; keep the name, logo, and brand styling easy to replace later.

Do not build the future Pro product yet. Build only the basic MVP specified here, but organize the code and data model so that Pro features can be added without rewriting the core song and chord system.

## 1. Product vision
The app helps church musicians quickly find a song, read its chord chart and lyrics, change the song's key, and use the chart while practicing or performing. The first audience includes individual musicians and small worship teams. The initial product must feel useful on a phone, tablet, and desktop browser.

The core promise is: **Find a song, view its chords and lyrics, transpose it instantly, and keep the chart readable while playing.**

### Platform decision
Build a **responsive web app that can be installed as a Progressive Web App (PWA)**. Use one codebase for desktop and mobile browsers. Include basic offline access for songs a user explicitly saves on that device. Do not build separate native iOS or Android apps in this MVP.

### Product principles
- Keep the experience focused on songs, chords, and dependable transposition.
- Make the chord chart the most important part of the song screen.
- Prioritize readability, speed, and reliable behavior over decorative UI.
- Use accessible contrast and comfortable touch targets.
- Never let transposition modify the original source song data.
- Make future Pro features possible through clear data models and modular components, but do not implement them now.

## 2. MVP scope

### Required features
1. **Song catalog** with an initial set of original demo songs.
2. **Search and filtering** by title, artist, language, category/genre, and original key.
3. **Song detail page** with song metadata, lyrics, chords, and clearly labeled sections.
4. **Automatic chord transposition** by semitone controls and a destination-key selector.
5. **Transpose reset** to return to the song's original key.
6. **Favorites** stored on the user's device.
7. **Recently viewed songs** stored on the user's device.
8. **Readable performance mode** with larger text, low-distraction layout, and light/dark appearance.
9. **Basic personal setlist**: add, remove, and reorder songs in one or more locally stored personal setlists. This is not collaborative and must not have team-sharing functionality.
10. **Save songs for offline use**: save song charts, metadata, and required app assets locally so previously saved songs can be opened without an internet connection.
11. **Responsive layout and PWA installation support**.
12. **Clear demo-content labeling** and straightforward instructions for adding authorized song records to the catalog.

### Do not build in the MVP
- Video tutorials, embedded video players, or video downloads.
- Tuner, metronome, audio playback, backing tracks, isolated instrument tracks, or recording.
- Full instrument-specific experiences for guitar, keyboard, and bass. The data model may be ready for them, but the initial chart interface is a general chord-and-lyrics chart.
- Guitar scales, fretboard tools, piano key diagrams, bass tabs, detailed chord voicings, or capo recommendations.
- Nashville number system.
- Church/team accounts, shared setlists, member invitations, rehearsal scheduling, team notifications, or real-time synchronization.
- Public song uploads, user-generated content feeds, or a community marketplace.
- Subscription billing, payment processing, a Pro paywall, or enterprise church plans.
- A complex admin dashboard or external catalog-provider integration.
- Scraping song websites or importing copyrighted lyrics from third-party sources.

Put these features in a clearly written future roadmap, but do not implement them now.

## 3. Recommended technical approach

First inspect the repository, its current stack, and existing conventions. If it is already an application, preserve the stack and extend it rather than replacing it without a compelling reason. If the repository is empty, use this default:

- Next.js with App Router
- React and TypeScript
- Tailwind CSS
- A small accessible component system; avoid excessive dependencies
- PWA manifest and service-worker/offline strategy appropriate to the chosen Next.js setup
- Typed, local JSON seed data for the MVP catalog
- IndexedDB for downloaded/offline song records; localStorage may be used for small preferences, favorites, recently viewed IDs, and local setlists
- Unit tests for the chord parser and transposition engine, plus basic UI or end-to-end tests for primary workflows

Do not require private API keys, cloud credentials, or paid services for the app to run locally. Keep the song data access layer separate from UI components so a hosted database or catalog API can be integrated in a future release. Do not add Supabase, Firebase, or another backend just for the sake of adding one.

Use current stable APIs and check official documentation when a framework or library detail is uncertain. Do not invent APIs. Keep dependencies minimal and explain any important additional dependency.

## 4. Information architecture and screens

### A. Home / Library
Build a welcoming but practical home screen with:
- App name and compact navigation
- Prominent song search
- Browse-by-category controls
- Recently viewed songs, when available
- Favorite songs, when available
- A link to personal setlists
- A clear empty state for a new user

Use these main destinations:
- Home
- Songs
- Favorites
- My Setlists
- Settings

On mobile, use a compact navigation pattern such as a bottom navigation bar if it improves usability. On desktop, use a sidebar or top navigation. Do not show every destination in multiple places unnecessarily.

### B. Song catalog / Search results
Each song result should show as much useful information as fits cleanly:
- Song title
- Artist or attribution, where known
- Language
- Genre/category
- Original key
- Tempo, if known
- A favorite control

Support query matching across title, artist, language, category, and key. Include filters for language, category, and key. Search and filters must combine correctly, and the user must be able to clear them easily. Show a useful empty state when there are no matches.

Initial categories should allow a future catalog containing contemporary worship, traditional hymns, gospel, and Filipino worship music. The data model must allow English, Filipino, and additional language labels without needing a schema redesign. The MVP interface can be in English; this does not mean the future song catalog is English-only.

### C. Song detail / Chord chart
This is the primary screen and must receive the most design attention.

At the top show:
- Song title and artist/attribution
- Language and category
- Original key and currently displayed key
- Tempo and time signature when available
- Favorite control
- Add to personal setlist action
- Save for offline use / remove offline copy action
- Enter/exit Performance Mode action

Below the header, show a compact transposition toolbar with:
- A minus-semitone button
- A visible current-key label or selector
- A plus-semitone button
- A destination-key selector covering all 12 pitch classes, including major and minor choices when appropriate
- A clearly visible Reset to Original Key action
- Optional display preference for sharp/flat spelling if this can be implemented simply and reliably

The chart itself must:
- Display song sections clearly, such as Intro, Verse 1, Chorus, Verse 2, Bridge, Tag, and Outro.
- Display chord symbols above the lyric fragments they belong to.
- Keep chord-to-lyric alignment correct after transposition, including when a chord label changes width (for example, from F# to Bb).
- Use structured data rather than relying on fragile find-and-replace over a large raw text block.
- Provide a clean fallback for instrumental sections or sections without lyrics.
- Never transpose lyric text, section headings, annotations, or unrelated letters.
- Be comfortable to read on narrow mobile screens. If a chart line cannot fit without breaking alignment, allow that line to scroll horizontally rather than wrapping chords incorrectly.
- Include a font-size control and a clear way to return to normal chart mode.

Avoid excessive panels, ads, modals, and unrelated controls. The primary task is reading and playing the song.

### D. Performance Mode
Provide a low-distraction, readable version of the same chart. This is still part of the basic MVP, not a separate Pro feature.

Requirements:
- Larger chord and lyric text
- Strong contrast and a dark presentation option
- Compact header with song title, current key, and previous/next section navigation if applicable
- Quick transposition controls that remain accessible
- Hide or minimize nonessential metadata and navigation
- Manual scroll that works naturally on touch devices
- Optional simple automatic scrolling with start/pause and speed adjustment, if it can be done reliably
- Attempt to prevent the screen from sleeping only where a supported browser capability exists; gracefully handle unsupported devices and permission requirements
- A clear exit action

Do not promise that every mobile browser can keep the screen awake. Feature-detect supported behavior and fail gracefully.

### E. Favorites and Recently Viewed
- Favorites persist across refreshes on the same browser/device.
- Recently viewed songs update when a song is opened and appear newest first.
- Both lists handle deleted or unavailable song IDs without crashing.
- Clearly communicate that these MVP lists are local to the current device and are not synced to other devices.

### F. Personal Setlists
Provide lightweight personal setlist management only:
- Create a setlist with a name, such as “Sunday Service” or “Practice List.”
- Add songs, remove songs, and reorder them.
- Open songs directly from the setlist.
- Persist setlists locally.
- Allow the same song to appear in different setlists.
- Do not add member invitations, shared editing, scheduling, collaboration, or cloud synchronization.

### G. Settings
Include simple settings for:
- Theme: system, light, or dark
- Chart text size
- Chord spelling preference if supported
- Clear local favorites, history, setlists, and offline downloads, with confirmation before destructive actions
- Short explanation of what is stored only on this device

### H. Offline behavior
A user must be able to explicitly save a song for offline use from its detail page. Persist the song's chart data and metadata locally, along with the minimum assets needed to render the page. Provide a visible saved/offline status and a list or filter for saved songs.

Requirements:
- Offline-saved songs can open when the device has no connection.
- The app explains when a song is unavailable offline.
- Removing an offline copy must not remove the song from favorites or personal setlists.
- Handle storage errors and quota failures gracefully; do not claim a download succeeded if it did not.
- No video or audio downloads are part of this MVP.
- Do not cache private secrets or assume the whole internet is available offline.

## 5. Song data model
Create a well-typed schema and document it. Keep the structure extensible for future arrangements and instrument-specific resources.

At minimum, a song record should support:
- `id`: stable unique ID
- `slug`: URL-friendly unique identifier
- `title`
- `artist` or attribution, optional
- `writers`, optional
- `language`: stable language code plus display label as needed
- `category`: for example contemporary worship, hymn, gospel, Filipino worship, or other
- `originalKey`: musical key such as G, D, Am, or F#m
- `tempoBpm`: optional number
- `timeSignature`: optional value such as 4/4 or 6/8
- `difficulty`: optional label for future use
- `contentStatus`: demo/original/authorized/public-domain/other status field as appropriate for internal content tracking; do not imply legal clearance merely because a record has a label
- `sections`: ordered list of named sections
- `sourceNotes` or attribution/license metadata where applicable

Represent chart lines as structured segments. For example:

```json
{
  "label": "Verse 1",
  "lines": [
    {
      "segments": [
        { "chord": "G", "text": "We gather in Your light " },
        { "chord": "D", "text": "today" }
      ]
    }
  ]
}
```

The exact schema can be improved as long as chord placement stays structured, transposition only affects chord symbols, and the UI can render correct alignment. A segment with no chord must be supported. Keep source records immutable during transposition; calculate a display version instead.

Include validation for seed records so invalid data is caught during development. Keep song rendering independent from storage so future database migration is straightforward.

## 6. Chord transposition requirements
Transposition is the most important technical feature. Build a dedicated, well-tested music utility module rather than embedding chord parsing in a UI component.

It must support:
- Natural roots: A, B, C, D, E, F, G
- Sharp and flat roots: A#, Bb, C#, Db, D#, Eb, F#, Gb, G#, Ab, etc.
- Major chords and chord suffixes such as `m`, `min`, `maj`, `sus2`, `sus4`, `dim`, `aug`, `6`, `7`, `maj7`, `m7`, `m7b5`, `add9`, `9`, `11`, `13`, and common alterations
- Slash/inversion chords, such as `D/F#`, `G/B`, and `C/E`; transpose both the main chord root and the slash bass note
- Spacing and chord labels without corrupting surrounding lyric text
- Common no-chord markings such as `N.C.` and non-chord annotations that must remain unchanged
- Up/down semitone controls
- A target key selector and reset-to-original behavior
- Sensible enharmonic spelling based on the selected key or user's spelling preference
- Major and minor key display where the source record specifies it

Implementation guidance:
- Parse each structured chord into root, quality/suffix, and optional bass note.
- Shift root and bass pitch classes by the same semitone offset.
- Preserve the chord quality and extensions exactly unless a known canonicalization is required.
- Choose a consistent enharmonic spelling policy. Avoid random mixtures of sharps and flats within the same chart.
- Never transpose normal words, lyrics, section labels, or arbitrary substrings that happen to resemble chord names.
- If a chord token is unknown or malformed, preserve it unchanged and make the behavior safe rather than guessing.
- The currently displayed key must match the selected transposition. Reset must return to the exact original chart/key, not merely a visually similar state.
- Chord transposition must be reversible and must not accumulate rounding or state errors when the user taps up/down repeatedly.

Write unit tests for every supported chord family, slash chords, flat/sharp spelling, major/minor keys, reset behavior, and boundary transitions across B/C and E/F. Include a small test chart with multiple sections and verify that only chord tokens change.

## 7. Demo content and copyright safeguards
Seed the application with approximately 8–12 fictional/original demo songs to make the interface testable. Use a mix of English and Filipino-language sample material and category metadata to demonstrate the intended catalog range. Make the demo status unmistakable.

Do not reproduce lyrics, chord charts, sheet music, audio, or arrangements from copyrighted commercial worship songs. Do not scrape websites or pretend that sample entries are real licensed songs. Use original demo titles and original sample lyrics, or use content whose public-domain status and applicable terms have been independently verified. Include a README section explaining how the owner can replace demo data with properly authorized catalog records.

Do not embed unauthorized YouTube videos or create fake tutorial links. Tutorials are not implemented in this MVP.

## 8. UX and visual direction
Design a calm, contemporary, trustworthy music utility. It should feel purpose-built for musicians rather than like a generic admin dashboard.

- Prioritize clear hierarchy, legible typography, and generous spacing.
- Use a restrained palette with one clear accent color; avoid unnecessary gradients, heavy shadows, or decorative backgrounds.
- Use consistent chord styling so chord symbols stand apart from lyrics without overpowering them.
- Ensure tap targets are usable on phones and tablets.
- Support keyboard navigation, visible focus states, semantic headings, accessible control labels, and appropriate color contrast.
- Include loading, empty, error, saved, and offline states. Never leave a blank panel without an explanation.
- Do not add fake buttons, dead navigation, placeholder charts, or controls that imply functionality that does not exist.
- Use helpful microcopy and avoid clutter on the chart screen.
- Prefer custom-designed, responsive layouts to a collection of generic cards on every screen.

## 9. Pro roadmap: document, do not implement
Create a `ROADMAP.md` describing the following planned future product, called **Worship Music Companion Pro** (the product name can later change). Do not implement these features in the MVP; the roadmap is for planning only.

### Pro pillar A: Instrument learning
- Curated or commissioned tutorial videos linked to songs
- Full-song, technique, and guided-practice lessons
- Full guitar experience: chord diagrams, capo guidance, strumming/picking patterns, fretboard, scales, and alternate tunings
- Full keyboard experience: interactive piano keys, chord tones, inversions, voicings, and left/right-hand guidance
- Full bass experience: fretboard diagrams, bass lines, tablature where available, and groove lessons
- Later support for drums and vocals if prioritized
- Tutorials labeled by instrument, difficulty, arrangement, and song section
- Video timestamps and section navigation; playback-speed controls where permitted and technically supported

### Pro pillar B: Practice and performance tools
- Tuner for supported instruments
- Metronome with adjustable BPM, time signatures, click sounds, and count-in
- Backing tracks and practice playback
- Repeat/loop a chosen song section
- Instrument-specific practice tracks and, later, isolated instrument stems where rights allow
- Advanced live mode and supported foot-pedal/page-turner controls
- Extended offline downloads for authorized video/audio content

### Pro pillar C: Worship teams
- Church and team workspaces
- Roles and permissions for church administrators, worship leaders, and musicians
- Shared setlists, official keys/tempos, arrangements, rehearsal plans, notes, cues, and section markers
- Team invitations, notifications, and synchronization across devices
- Conflict handling when shared arrangements are edited

### Pro pillar D: Music theory and charting
- Nashville number system
- Guitar capo and transposed-shape assistance
- Advanced chord diagrams and voicing suggestions
- Custom chart creation/editing and authorized user or church song uploads
- Song section editing, arrangement variants, and personal notes
- Future MIDI integration if there is demonstrated demand

### Pro pillar E: Catalog and administration
- Admin/content-management dashboard
- Approval and correction workflow for song charts and tutorials
- Song requests and user-submitted error reports
- Rights/attribution tracking and per-content use permissions
- Licensed catalog-provider integrations if commercially and legally feasible
- English and Filipino-language catalog support, with additional language expansion as appropriate
- Contributor agreements and a reviewed contributor program

### Pro pillar F: Commercial model
- Evaluate individual memberships and church/team plans
- Decide which catalog, learning, offline, and collaboration features are free or paid
- Add subscription billing only after the business model and legal/licensing constraints are validated

## 10. Testing and definition of done
The MVP is not complete just because the home screen looks attractive. It must run and the core workflows must work.

Before considering the task complete:
1. Run linting, type checking, unit tests, and a production build; fix failures caused by the changes.
2. Verify that the app runs locally using the README instructions without requiring secret credentials.
3. Test searching by title and filtering by language/category/key.
4. Open a song and confirm lyrics and chord alignment.
5. Transpose a chart up and down, switch to a target key, and reset to original. Confirm that chord qualities, slash chords, and lyric text remain correct.
6. Reload the page and confirm favorites, recents, settings, and personal setlists persist on the same device.
7. Save a song for offline use, simulate or test loss of network connectivity, and confirm that the saved chart still opens.
8. Check at least one narrow mobile viewport, one tablet-sized viewport, and one desktop viewport.
9. Test empty search results, empty favorites, no setlists, unavailable offline songs, and storage errors.
10. Verify that no Pro feature is represented as functional when it is not implemented.

Create an `README.md` that includes:
- Project overview and exact MVP scope
- Required software versions and install commands
- How to run locally
- How to run tests and build for production
- Where the demo song data lives and how to add an authorized song record
- What is saved locally and what does not sync
- How PWA installation and offline saving work, including browser limitations
- Known limitations and next recommended steps

Create or update `ROADMAP.md` as described above. Add a short `CONTENT_AND_RIGHTS.md` checklist explaining that song content, lyrics, charts, recordings, and videos must be cleared for their intended uses before production distribution.

## 11. Working method
1. Inspect the repository and summarize the existing state briefly.
2. State a short implementation plan, then start implementing; do not stop after giving recommendations.
3. If the repo is empty, scaffold the agreed stack. If the repo already has a stack, follow its conventions.
4. Build the complete MVP end to end, not just static mockups.
5. Use sensible defaults and do not ask questions unless a genuine blocker makes implementation impossible.
6. If a feature cannot be supported reliably, implement a clear graceful fallback and document the limitation instead of faking success.
7. After implementation, run the available checks and fix issues.
8. In your final response, summarize what was implemented, list key files, provide exact local run/test commands, report checks actually run and their results, identify anything that remains unfinished, and explain how to test the core transposition workflow.

**Final instruction: Build only the MVP defined in this prompt. Keep the Pro roadmap documented but unimplemented. The most important acceptance criterion is correct, reliable chord transposition in a clean, readable song chart.**
