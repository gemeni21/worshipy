# Development Prompt: My Songs, Manual Song Editor, and ChordPro Import/Export

## Your role

Act as a senior full-stack engineer, UX/UI designer, and pragmatic software architect. Extend the existing Worship Music Companion application with a reliable personal-song feature so users can add songs that are missing from the built-in catalog.

This is a **separate feature prompt for the Basic MVP**. Implement it in the existing project and follow the repository's current framework, component conventions, storage choices, and design system. Do not rebuild the application from scratch or remove existing functionality.

The future AI Song Assistant belongs to Worship Music Companion Pro. Document it in the roadmap only; do not implement AI, MCP connections, web research, or external catalog integrations in this task.

## 1. Goal and product decision

Add a **My Songs** area where a user can create and manage their own song charts. The user should be able to:

- Create a song manually.
- Add and edit song metadata, lyrics, chords, and song sections.
- Preview the finished chord chart before saving.
- Correct, reorder, add, or delete song sections and lines.
- Transpose custom charts with the application's existing transposition engine.
- Add custom songs to favorites and personal setlists.
- Save custom songs for offline use using the existing offline system.
- Import a ChordPro file or paste ChordPro text.
- Export a custom song as a ChordPro text file.

Personal songs must stay separate from the built-in catalog and be stored locally in this MVP. There is no cloud account sync or team sharing in this task.

## 2. Inspect before changing the project

1. Inspect the existing repository, data model, song rendering, chord transposition engine, local storage, favorites, setlists, and offline saving code.
2. Reuse and extend existing functionality wherever possible. Do not create a second chord parser or a competing transposition implementation if a suitable one already exists.
3. Identify the song data shape currently used by the chord chart. Map imported and manually created songs into that existing shape, extending it only when necessary.
4. Keep all new code typed, modular, and testable.
5. Before finishing, run the available lint, type-check, unit-test, and production-build commands. Fix errors caused by this work and report exactly what was run.

## 3. Navigation and information architecture

Add a navigation destination called **My Songs**. Keep the existing built-in catalog unchanged and visibly distinct from personal songs.

The My Songs landing page should include:

- Page title and a short explanation that songs are stored on this device in the Basic MVP.
- A prominent **Create Song** action.
- An **Import ChordPro** action.
- Search within personal songs by title, artist, or attribution.
- A song list with title, artist/attribution, language, original key, and last-updated date where available.
- An edit action and a clearly labeled delete action for each custom song.
- Empty state with a useful first action when the user has not created any songs.
- Helpful import errors and success confirmation without falsely claiming an operation succeeded.

Personal songs must also appear in relevant global song search results, clearly labeled as **My Song** or **Personal Song**. They must be openable, transposable, favoritable, and addable to personal setlists. Avoid duplicate entries when one is already saved in a list.

Use stable unique IDs and make the storage distinction explicit. Never overwrite a built-in catalog record when saving a custom song with the same title.

## 4. Manual song editor

Build a comfortable, responsive editing flow that works on mobile, tablet, and desktop. A church musician should not need to understand programming or hand-align lyrics using spaces.

### Song metadata fields

Support at least:

- Song title (required)
- Artist or attribution (optional)
- Writers/composers (optional)
- Original key (optional but recommended)
- Language (optional; support English and Filipino-language songs, plus future language codes)
- Category/genre (optional; examples include contemporary worship, hymn, gospel, Filipino worship, and other)
- Tempo BPM (optional; validate reasonable positive values)
- Time signature (optional)
- Song source / notes (optional)
- Attribution and rights notes (optional)

Show only useful fields in the initial editor; advanced metadata may sit behind an expandable section. Do not force users to fill in fields that are genuinely optional.

### Lyrics, chords, and sections

The editor must support common sections, including Intro, Verse, Pre-Chorus, Chorus, Bridge, Tag, Outro, Instrumental, and Custom Section. Let users add a section, rename it, reorder it, duplicate it if practical, and remove it with confirmation when it contains content.

Each section must support multiple lines. Each line must allow a sequence of chord-and-lyric segments, with a chord attached to a position immediately before the relevant lyric text. Include support for:

- Lines with chord and lyric segments.
- Lines with lyrics but no chords.
- Instrumental chord-only lines.
- Comments or performance notes such as "repeat twice" when appropriate.
- Empty lines and section spacing without corrupting chart order.
- Chords with qualities/extensions and slash bass notes, such as `Am7`, `Cadd9`, `D/F#`, and `G/B`.

### Editing interaction

Provide a clear way to add a chord at the current cursor position or select a lyric segment and attach a chord to it. The user should be able to edit the chord token and lyric text independently. Do not require manual insertion of multiple spaces as the only way to align chords.

A practical approach is a line editor that creates structured chord/lyric segments, accompanied by a rendered chart preview. Keep the preview close enough to the editor to make review easy on desktop. On mobile, use a clearly accessible Edit/Preview toggle or equivalent layout.

### Validation and saving

- Validate the required title and structurally valid sections/lines.
- Do not reject a song merely because optional metadata is absent.
- Warn about malformed chord tokens without destroying or silently deleting user text.
- Offer Save and Cancel actions.
- Unsaved-change navigation should warn before discarding meaningful edits.
- When editing an existing song, preserve its stable ID and creation date; update only its edited date.
- Deleting a custom song must not delete a built-in song or unrelated favorites/setlists. Clean up or handle references to deleted custom songs safely.
- Use a confirmation step before deleting a song.
- Persist successfully saved songs across reloads on the same browser/device.

## 5. Song data model and separation

Use the existing app song schema if it supports the necessary information. Otherwise extend it with a clear, documented structure.

A custom song should have at least:

- `id`: stable unique ID, distinct from built-in song IDs
- `sourceType`: a value such as `custom` or `catalog`
- `title`
- Optional artist, writers, language, category, original key, tempo, time signature, attribution, source notes, and rights notes
- Ordered `sections`
- Structured `lines` and `segments` where a segment can contain a chord token and associated lyric text
- `createdAt` and `updatedAt`
- Optional import provenance such as file name and import date

Do not use array positions as persistent IDs. Ensure imported/custom song IDs remain stable through editing and export.

Keep chord and lyric placement represented structurally. Never implement transposition by searching/replacing substrings in lyrics. Reuse the existing dedicated chord parser and transposition utility so custom songs behave the same way as built-in songs.

Use IndexedDB if it is already the app's chosen persistent structured-data store or if it is the appropriate existing architecture for offline song records. Do not add a backend solely for this feature. If the app currently uses another appropriate local persistence layer, reuse it. Document that personal songs in the Basic MVP do not sync across devices.

## 6. ChordPro import

Implement both:

1. Import a local ChordPro text file.
2. Paste ChordPro text into an import editor.

Support common ChordPro file extensions such as `.cho`, `.chopro`, `.crd`, `.chord`, and `.pro`. Treat these as common extensions, not proof that every file uses valid ChordPro syntax.

Use the official ChordPro format documentation as the compatibility reference: https://www.chordpro.org/chordpro/chordpro-introduction/ and https://www.chordpro.org/chordpro/chordpro-directives/ . Implement a deliberate, documented subset rather than pretending to support every advanced directive.

### Minimum compatible syntax

Support inline chords in square brackets, for example:

`[G]We gather in Your [D/F#]light`

Support common metadata directives where provided:

- `{title: ...}`
- `{subtitle: ...}`
- `{artist: ...}`
- `{composer: ...}`
- `{lyricist: ...}`
- `{key: ...}`
- `{tempo: ...}`
- `{time: ...}`
- `{capo: ...}` if the existing schema can retain it safely; otherwise issue a clear unsupported-metadata warning rather than silently discarding it

Support common section directives and their short forms where practical, including chorus, verse, and bridge start/end directives. Also support common comment directives as notes or visible performance instructions where appropriate.

The parser must handle blank lines, lyrics-only lines, chord-only lines, multiple chords on a line, slash chords, minor chords, common extensions, and normal Unicode lyric text.

### Import preview and safety

Before saving an imported song:

- Parse the file/text into the app's structured song model.
- Show a preview of title, metadata, sections, and chord/lyric alignment.
- Report validation messages and unsupported directives.
- Allow the user to edit the imported draft before saving.
- Do not silently discard meaningful lines or metadata.
- If a directive cannot be interpreted, retain it as an import note or display a warning with the original value; do not execute it as code or HTML.
- Do not overwrite an existing song automatically. If a title resembles an existing custom song, offer to save as a new song or cancel; only offer replace/merge if that behavior is implemented safely and clearly.
- Handle empty files, malformed brackets, very large files, unsupported encodings, and invalid metadata gracefully.

Sanitize imported content and render it as text. Never insert imported HTML or scripts into the DOM. Place sensible size limits on imports and return helpful validation errors.

## 7. ChordPro export

Allow a user to export a personal song as a downloadable `.cho` file.

Requirements:

- Export metadata using supported ChordPro directives where values exist.
- Export song sections and inline chord positions with a consistent, standard representation.
- Preserve lyrics, chord qualities, slash chords, line order, blank lines where meaningful, and section sequence.
- Escape special characters where required by the format.
- Use a safe, readable filename based on the title.
- Export the source/original key and chord names, not a temporary transposed display state, unless the user explicitly chooses an export-current-key option. For the MVP, a stable export of the original stored chart is preferred.
- Do not include internal IDs, private app metadata, or other personal data in the file by default.
- Trigger the browser download only after preparing a valid export, and provide a helpful error if the browser blocks or the export fails.

### Round-trip expectation

For the supported subset, importing a ChordPro file and exporting it again should preserve the song's essential structure, metadata, lyric text, chord symbols, and chord positions. Formatting may be normalized. Do not promise lossless round-tripping for unsupported advanced directives; report those limitations clearly.

## 8. Transposition integration

Custom songs must use the same transposition engine as catalog songs.

Test that:

- Transposing a custom song changes supported chord roots and slash-bass notes but never lyric text, section names, or comments.
- Chord quality and extensions remain intact.
- The source/original key and stored chart remain unchanged when a temporary display key is selected.
- Returning to the original key restores the original chord names exactly.
- The key label is correct after semitone changes and target-key selection.
- ChordPro export defaults to the stored/original chart, not the currently transposed preview.

## 9. Rights, source information, and user privacy

The app must not claim that a user owns or has permission to distribute a song merely because they created a chart for it.

- Add a concise notice when creating or importing songs: users are responsible for ensuring they have the right to store and use supplied lyrics, charts, and other content.
- Where appropriate, include a checkbox acknowledging this responsibility before saving imported or lyric-containing content. Do not present the checkbox as legal clearance or automated rights verification.
- Include optional attribution, source, and rights-note fields.
- Keep personal songs private to the current device by default.
- Do not upload songs to a server or expose their content to other users in this MVP.
- Do not scrape sites or automatically import copyrighted lyrics.

## 10. Compatibility with the existing MVP

Verify these integrations:

- Custom songs open in the standard song detail page.
- Favorite and unfavorite actions work for custom songs.
- Custom songs can be added to and removed from personal setlists.
- Search can find custom songs without incorrectly duplicating catalog results.
- The existing key transposition controls work with custom songs.
- Offline saving works with custom songs using the existing offline feature.
- Performance mode displays custom charts correctly.
- Text size and dark/light themes continue to work.
- Deleting a song does not corrupt other records.

Do not implement team sharing or cross-device synchronization. The UI and documentation should clearly state that personal content is stored locally in the Basic MVP.

## 11. Future Pro roadmap: document only

Add or update `ROADMAP.md` with a future feature named **AI Song Assistant**. Do not implement it in this task.

The future assistant may, subject to available tools, source permissions, provider terms, and product validation:

- Search authorized song metadata/catalog sources.
- Use licensed catalog-provider integrations where permitted.
- Help identify a song and its language/version.
- Convert user-supplied text or a supported ChordPro file into a structured draft.
- Suggest section labels and chord formatting.
- Suggest chord interpretations as unverified drafts for user review.
- Display source information and uncertainty.
- Ask the user to review and approve the result before saving.
- Use a backend AI service or an MCP-connected tool layer if that architecture is selected later.

Important: MCP is a way to connect an AI system to tools or resources. It is not itself a song database, search engine, source license, or guarantee that online lyrics/charts may be copied. The future assistant must not bypass paywalls, scrape prohibited sources, or assume that publicly visible copyrighted content can be redistributed.

The AI assistant must never automatically publish an unreviewed chart into the built-in catalog. Keep personal drafts, shared/team content, and official catalog content as distinct concepts.

## 12. Tests and definition of done

Add automated tests for the song model, manual editor transformations, parser, exporter, and integrations.

At minimum, verify:

1. A user can create a new song with metadata, sections, lyrics, and chords.
2. A saved song persists after a page reload on the same device.
3. A user can reopen and edit a custom song without changing its ID or original creation date.
4. A user can add, rename, reorder, and delete sections.
5. Deleting a custom song cannot delete a built-in song.
6. A ChordPro file and pasted ChordPro text import into an editable preview.
7. Common metadata and verse/chorus/bridge directives are parsed correctly.
8. Multiple chord tokens, slash chords, lyrics-only lines, chord-only lines, Unicode text, and blank lines survive import.
9. Malformed chord brackets or unsupported directives produce helpful warnings without crashing or silently losing content.
10. Export produces a valid `.cho` text file with the song's stored/original chart.
11. Import-export round-trip preserves the supported content and chord placements.
12. Custom charts transpose correctly, and lyrics and section labels never change.
13. Custom songs work with favorites, search, personal setlists, performance mode, and offline saving.
14. Empty states, cancellation, confirmation, and storage errors are handled cleanly.
15. The app remains usable on a narrow mobile screen and on desktop.
16. Lint, type checking, unit tests, and production build pass, or any pre-existing failure is clearly reported.

## 13. Documentation

Update `README.md` with:

- How to create and edit a custom song.
- How local storage works and what does not sync.
- How to import a ChordPro file or pasted ChordPro text.
- How to export a `.cho` file.
- Which ChordPro directives are supported and which are ignored or warned about.
- Content-rights responsibilities and how source/attribution notes work.
- How to run the relevant tests.

Add a short `CONTENT_AND_RIGHTS.md` checklist if one does not already exist. Keep the documentation consistent with the actual implementation.

## 14. Working method and final report

1. Inspect the repository first and summarize the relevant existing architecture briefly.
2. Provide a concise implementation plan, then implement the feature end to end.
3. Do not stop after making a static mockup or writing recommendations.
4. Reuse existing song and chord logic wherever possible.
5. Do not ask for clarification unless implementation is genuinely blocked; make sensible choices and document them.
6. Run tests and builds and fix failures caused by the change.
7. In the final response, list what changed, key files, run/test commands, actual test results, limitations, and steps to try creating a song, importing ChordPro, exporting it, and transposing it.

**Final instruction:** Implement manual song creation/editing plus basic ChordPro import/export in the Basic MVP. Keep personal content local and private. Document the AI Song Assistant as a Pro roadmap item only. Do not implement AI or MCP integrations yet.
