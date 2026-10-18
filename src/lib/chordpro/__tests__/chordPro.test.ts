import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  buildCustomSongRecord,
  createCustomSongId,
  createCustomSongSlug,
  exportSongToChordPro,
  formatSegmentsToBracketedLine,
  getChordProFilename,
  getSuggestedChordsForKey,
  insertChordAtCursor,
  parseBracketedLineToSegments,
  parseChordPro,
  validateCustomSongDraft,
} from '../chordPro.ts';
import {
  clearAllCustomSongsFromStorage,
  deleteCustomSongFromStorage,
  getAllCustomSongsFromStorage,
  saveCustomSongToStorage,
} from '../../storage/customSongsDb.ts';
import {
  getAllSongs,
  isBuiltInCatalogSongId,
  mergeCatalogAndCustomSongs,
  resolveSongsByIds,
  searchAndFilterSongs,
} from '../../catalog/songCatalog.ts';
import { transposeSong } from '../../music/transposition.ts';
import type { SongSection } from '../../../types/song.ts';

describe('My Songs, Manual Song Editor & ChordPro Import/Export', () => {
  beforeEach(async () => {
    await clearAllCustomSongsFromStorage();
  });

  // 1 & 2. Creating a valid manual song and persisting across reloads
  it('1 & 2. creates a valid manual song and persists it in device storage across reloads', async () => {
    const sections: SongSection[] = [
      {
        id: 'sec-1',
        type: 'verse',
        label: 'Verse 1',
        cue: 'Acoustic guitar and pad',
        lines: [
          {
            id: 'line-1-1',
            segments: parseBracketedLineToSegments(
              '[G]Morning mercy [C]rises on our [G]praise'
            ).segments,
          },
          {
            id: 'line-1-2',
            segments: parseBracketedLineToSegments(
              '[Em7]Every heart [D/F#]awakens to Your [G]grace'
            ).segments,
          },
        ],
      },
      {
        id: 'sec-2',
        type: 'chorus',
        label: 'Chorus',
        lines: [
          {
            id: 'line-2-1',
            segments: parseBracketedLineToSegments(
              '[C]Holy, [G/B]holy is the [Am7]Lord [D]Almighty'
            ).segments,
          },
        ],
      },
    ];

    const validation = validateCustomSongDraft({
      title: 'Morning Mercy Rises',
      originalKey: 'G',
      tempoBpm: 74,
      capo: 2,
      rightsAcknowledged: true,
      sections,
    });
    assert.equal(validation.valid, true);
    assert.equal(validation.errors.length, 0);
    assert.equal(validation.chordWarnings.length, 0);

    const record = buildCustomSongRecord({
      title: 'Morning Mercy Rises',
      subtitle: 'Sunday Service Arrangement',
      artist: 'Grace Fellowship Worship',
      writers: ['Elena Cruz', 'Mateo Santos'],
      languageCode: 'en',
      categoryId: 'contemporary-worship',
      originalKey: 'G',
      tempoBpm: 74,
      timeSignature: '4/4',
      capo: 2,
      attribution: 'Original arrangement by Grace Fellowship',
      sourceNotes: 'Start softly on acoustic guitar',
      rightsNotes: 'Original local church composition',
      rightsAcknowledged: true,
      sections,
    });

    assert.equal(record.sourceType, 'custom');
    assert.equal(isBuiltInCatalogSongId(record.id), false);
    assert.ok(record.id.startsWith('custom-song-'));

    const saveRes = await saveCustomSongToStorage(record);
    assert.equal(saveRes.ok, true);

    const reloaded = await getAllCustomSongsFromStorage();
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].id, record.id);
    assert.equal(reloaded[0].title, 'Morning Mercy Rises');
    assert.equal(reloaded[0].originalKey, 'G');
    assert.equal(reloaded[0].sections.length, 2);
  });

  // 3. Editing an existing custom song while preserving its id and createdAt
  it('3. edits an existing custom song while preserving its id, slug, and createdAt', async () => {
    const original = buildCustomSongRecord({
      title: 'Awit ng Pag-asa',
      artist: 'Local Ministry',
      languageCode: 'fil',
      categoryId: 'filipino-worship',
      originalKey: 'D',
      rightsAcknowledged: true,
      sections: [
        {
          id: 'sec-1',
          type: 'verse',
          label: 'Talata 1',
          lines: [
            {
              id: 'line-1-1',
              segments: parseBracketedLineToSegments(
                '[D]Sa bawat [G]umaga Ikaw ang [A]pag-asa'
              ).segments,
            },
          ],
        },
      ],
    });

    await saveCustomSongToStorage(original);

    const edited = buildCustomSongRecord({
      existingSong: original,
      title: 'Awit ng Pag-asa (Updated)',
      artist: 'Local Ministry Team',
      languageCode: 'fil',
      categoryId: 'filipino-worship',
      originalKey: 'E',
      rightsAcknowledged: true,
      sections: [
        ...original.sections,
        {
          id: 'sec-2',
          type: 'chorus',
          label: 'Koro',
          lines: [
            {
              id: 'line-2-1',
              segments: parseBracketedLineToSegments(
                '[A]Purihin [B]Ka Panginoon [E]magpakailanman'
              ).segments,
            },
          ],
        },
      ],
    });

    assert.equal(edited.id, original.id);
    assert.equal(edited.slug, original.slug);
    assert.equal(edited.createdAt, original.createdAt);
    assert.equal(edited.title, 'Awit ng Pag-asa (Updated)');
    assert.equal(edited.originalKey, 'E');
    assert.equal(edited.sections.length, 2);

    await saveCustomSongToStorage(edited);
    const stored = await getAllCustomSongsFromStorage();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].title, 'Awit ng Pag-asa (Updated)');
  });

  // 4. Adding, renaming, reordering, and deleting sections in the manual editor model
  it('4. supports adding, renaming, reordering, and deleting sections and inserting chords at cursor', () => {
    const initialInsertion = insertChordAtCursor(
      'Amazing grace how sweet the sound',
      0,
      'G'
    );
    assert.equal(
      initialInsertion.nextText,
      '[G]Amazing grace how sweet the sound'
    );

    const secondInsertion = insertChordAtCursor(
      initialInsertion.nextText,
      initialInsertion.nextText.indexOf('sweet'),
      'C/G'
    );
    assert.equal(
      secondInsertion.nextText,
      '[G]Amazing grace how [C/G]sweet the sound'
    );

    const sec1: SongSection = {
      id: 'sec-1',
      type: 'verse',
      label: 'Verse 1',
      lines: [
        {
          id: 'line-1',
          segments: parseBracketedLineToSegments(secondInsertion.nextText)
            .segments,
        },
      ],
    };
    const sec2: SongSection = {
      id: 'sec-2',
      type: 'chorus',
      label: 'Chorus',
      lines: [
        {
          id: 'line-2',
          segments: parseBracketedLineToSegments('[D]Praise the [G]Lord')
            .segments,
        },
      ],
    };
    const sec3: SongSection = {
      id: 'sec-3',
      type: 'bridge',
      label: 'Bridge',
      lines: [
        {
          id: 'line-3',
          segments: parseBracketedLineToSegments('[Em]Forever [C]faithful')
            .segments,
        },
      ],
    };

    // Reorder: start with [sec1, sec2, sec3], delete Verse 1 (sec1), move Chorus first, rename Bridge -> Tag
    const allThree = [sec1, sec2, sec3];
    const withoutVerse = allThree.filter((s) => s.id !== 'sec-1');
    const reordered = [
      withoutVerse[0],
      { ...withoutVerse[1], type: 'tag' as const, label: 'Tag' },
    ];

    const record = buildCustomSongRecord({
      title: 'Section Manipulation Test',
      originalKey: 'G',
      rightsAcknowledged: true,
      sections: reordered,
    });

    assert.equal(record.sections.length, 2);
    assert.equal(record.sections[0].label, 'Chorus');
    assert.equal(record.sections[1].label, 'Tag');
    assert.equal(record.sections[1].type, 'tag');

    const suggested = getSuggestedChordsForKey('G');
    assert.ok(suggested.includes('G'));
    assert.ok(suggested.includes('C'));
    assert.ok(suggested.includes('D'));
    assert.ok(suggested.includes('Em'));
  });

  // 5. Deleting a custom song without affecting built-in catalog songs
  it('5. deletes a custom song without affecting built-in catalog songs and blocks overwriting/deleting catalog IDs', async () => {
    const builtInSongs = getAllSongs();
    assert.ok(builtInSongs.length >= 10);
    const firstCatalogSong = builtInSongs[0];

    // Attempt to overwrite a built-in catalog song ID should fail
    const overwriteAttempt = await saveCustomSongToStorage({
      ...firstCatalogSong,
      title: 'Hacked Built-In Song',
    });
    assert.equal(overwriteAttempt.ok, false);

    // Attempt to delete a built-in catalog song ID should fail
    const deleteCatalogAttempt = await deleteCustomSongFromStorage(
      firstCatalogSong.id
    );
    assert.equal(deleteCatalogAttempt.ok, false);

    // Create and delete a real custom song
    const custom = buildCustomSongRecord({
      title: 'Temporary Custom Song',
      originalKey: 'C',
      rightsAcknowledged: true,
      sections: [
        {
          id: 'sec-1',
          type: 'verse',
          label: 'Verse 1',
          lines: [
            {
              id: 'line-1',
              segments: parseBracketedLineToSegments('[C]Hello [G]world')
                .segments,
            },
          ],
        },
      ],
    });
    await saveCustomSongToStorage(custom);
    assert.equal((await getAllCustomSongsFromStorage()).length, 1);

    const delRes = await deleteCustomSongFromStorage(custom.id);
    assert.equal(delRes.ok, true);
    assert.equal((await getAllCustomSongsFromStorage()).length, 0);
    assert.equal(getAllSongs().length, builtInSongs.length);
  });

  // 6, 7, 8, 9, 10. Importing ChordPro with metadata, sections, inline chords, slash chords, chord-only lines, lyrics-only lines, Unicode, and blank lines
  it('6-10. imports ChordPro with metadata directives, sections, inline chords, slash chords, chord-only lines, lyrics-only lines, Unicode, and blank lines', () => {
    const choInput = `{title:Tapat Kailanpaman — Forever Faithful}
{subtitle:Tagalog & English Worship}
{artist:Grace Fellowship Manila}
{composer:Maria Santos, Juan Dela Cruz}
{key:Bb}
{tempo:72}
{time:6/8}
{capo:3}
{copyright:© 2026 Grace Fellowship Manila (CC-BY)}

{start_of_intro: Intro}
[Bb] [Eb/G] [F/A] [Bb]
{end_of_intro}

{sov: Verse 1}
{comment: Gently with piano}
[Bb]Panginoon, [Gm7]Ikaw ang [EbMaj7]aming kanlu[F7sus4]ngan
Sa gitna ng unos, may kapayapaan

[Cm7]Your mercy [Bb/D]never [Eb]fails us, [F#dim7]Lord
{eov}

{soc: Koro}
[Bb]Tapat Kailanpa[F/A]man, [Gm7]forever [Eb]faithful
{eoc}`;

    const parsed = parseChordPro(choInput, { fileName: 'tapat.cho' });
    assert.equal(parsed.ok, true);
    assert.ok(parsed.draft);

    const draft = parsed.draft!;
    assert.equal(draft.title, 'Tapat Kailanpaman — Forever Faithful');
    assert.equal(draft.subtitle, 'Tagalog & English Worship');
    assert.equal(draft.artist, 'Grace Fellowship Manila');
    assert.deepEqual(draft.writers, ['Maria Santos', 'Juan Dela Cruz']);
    assert.equal(draft.originalKey, 'Bb');
    assert.equal(draft.tempoBpm, 72);
    assert.equal(draft.timeSignature, '6/8');
    assert.equal(draft.capo, 3);
    assert.equal(
      draft.attribution,
      '© 2026 Grace Fellowship Manila (CC-BY)'
    );

    assert.equal(draft.sections.length, 3);
    // Intro is a chord-only instrumental line
    const introSection = draft.sections[0];
    assert.equal(introSection.type, 'intro');
    assert.equal(introSection.lines[0].isInstrumental, true);
    assert.deepEqual(
      introSection.lines[0].segments.map((s) => s.chord),
      ['Bb', 'Eb/G', 'F/A', 'Bb']
    );

    // Verse 1 has cue, inline chords, lyrics-only line, blank line, and slash/extended chords
    const verseSection = draft.sections[1];
    assert.equal(verseSection.type, 'verse');
    assert.equal(verseSection.cue, 'Gently with piano');
    assert.equal(verseSection.lines.length, 4);
    // Line 2 is lyrics-only
    assert.equal(verseSection.lines[1].segments.length, 1);
    assert.equal(verseSection.lines[1].segments[0].chord, undefined);
    assert.equal(
      verseSection.lines[1].segments[0].text,
      'Sa gitna ng unos, may kapayapaan'
    );
    // Line 3 is preserved blank line inside Verse 1
    assert.equal(verseSection.lines[2].segments[0].text, '');
    // Line 4 has slash chord Bb/D and diminished F#dim7
    assert.deepEqual(
      verseSection.lines[3].segments.filter((s) => s.chord).map((s) => s.chord),
      ['Cm7', 'Bb/D', 'Eb', 'F#dim7']
    );
  });

  // 11 & 12. Handling malformed chord brackets and unsupported directives with clear warnings
  it('11 & 12. handles malformed chord brackets and unsupported directives gracefully with non-destructive warnings', () => {
    const choWithIssues = `{title:Warning Test Song}
{key:G}
{define: G base-fret 1 frets 3 2 0 0 3 3}
{textsize: 14}
{sov: Verse 1}
[G]Here is an [unclosed chord on this line
[C]And an empty [] bracket plus [XYZ123] unrecognized token
{eov}`;

    const parsed = parseChordPro(choWithIssues);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.draft);
    assert.equal(parsed.unsupportedDirectives.length, 2);
    assert.ok(
      parsed.warnings.some((w) => w.includes('Unsupported ChordPro directive'))
    );
    assert.ok(
      parsed.warnings.some((w) => w.includes('Unclosed chord bracket'))
    );
    assert.ok(parsed.warnings.some((w) => w.includes('Empty chord bracket')));
    assert.ok(
      parsed.warnings.some(
        (w) => w.includes('Unrecognized chord token') && w.includes('XYZ123')
      )
    );
    // Unsupported directives are preserved in sourceNotes so no user data is lost
    assert.ok(parsed.draft!.sourceNotes?.includes('define'));
  });

  // 13 & 14. Exporting a custom song to .cho and round-tripping import -> save -> export -> re-import
  it('13 & 14. exports a custom song to .cho and preserves title, key, sections, lyrics, and chord positions on re-import round-trip', () => {
    const initialCho = `{title: Shepherd of My Soul}
{subtitle: Acoustic Worship}
{artist: Hope Chapel}
{composer: David Lin}
{key: E}
{tempo: 68}
{time: 4/4}
{capo: 4}
{copyright: Public Domain / Original}

{start_of_verse: Verse 1}
{comment: Fingerpicked guitar}
[E]Shepherd of my [A2]soul, I [Badd4]give You full con[E]trol
[C#m7]Wherever You may [A2]lead I will [B]follow
{end_of_verse}

{start_of_chorus: Chorus}
[A2]I have made my [E/G#]choice to [F#m7]listen for Your [E]voice
{end_of_chorus}`;

    const firstImport = parseChordPro(initialCho);
    assert.equal(firstImport.ok, true);
    const savedSong = firstImport.draft!;

    const exportedCho = exportSongToChordPro(savedSong);
    assert.equal(getChordProFilename(savedSong.title), 'shepherd-of-my-soul.cho');
    // Ensure private internal IDs are not leaked in .cho export
    assert.equal(exportedCho.includes(savedSong.id), false);
    assert.ok(exportedCho.includes('{title: Shepherd of My Soul}'));
    assert.ok(exportedCho.includes('{key: E}'));

    const reimported = parseChordPro(exportedCho);
    assert.equal(reimported.ok, true);
    const roundTripSong = reimported.draft!;

    assert.equal(roundTripSong.title, savedSong.title);
    assert.equal(roundTripSong.subtitle, savedSong.subtitle);
    assert.equal(roundTripSong.artist, savedSong.artist);
    assert.deepEqual(roundTripSong.writers, savedSong.writers);
    assert.equal(roundTripSong.originalKey, savedSong.originalKey);
    assert.equal(roundTripSong.tempoBpm, savedSong.tempoBpm);
    assert.equal(roundTripSong.timeSignature, savedSong.timeSignature);
    assert.equal(roundTripSong.capo, savedSong.capo);
    assert.equal(roundTripSong.sections.length, savedSong.sections.length);

    for (let s = 0; s < savedSong.sections.length; s++) {
      assert.equal(
        roundTripSong.sections[s].label,
        savedSong.sections[s].label
      );
      assert.equal(
        roundTripSong.sections[s].type,
        savedSong.sections[s].type
      );
      assert.equal(
        roundTripSong.sections[s].lines.length,
        savedSong.sections[s].lines.length
      );
      for (let l = 0; l < savedSong.sections[s].lines.length; l++) {
        assert.equal(
          formatSegmentsToBracketedLine(
            roundTripSong.sections[s].lines[l].segments
          ),
          formatSegmentsToBracketedLine(savedSong.sections[s].lines[l].segments)
        );
      }
    }
  });

  // 15 & 16. Transposing a custom song and integrating with global search, favorites, and setlist resolution
  it('15 & 16. transposes custom songs non-destructively and integrates with catalog search, favorites, and setlists', () => {
    const parsed = parseChordPro(`{title: Crown of Grace}
{artist: Sanctuary Music}
{key: G}
{sov: Verse 1}
[G]Crown of [D/F#]grace upon [Em7]our [C]heads
{eov}`);
    assert.equal(parsed.ok, true);
    const customSong = parsed.draft!;

    // Transpose +2 semitones (G -> A)
    const transposed = transposeSong(customSong, 2, 'auto');
    assert.equal(transposed.displayedKey, 'A');
    assert.deepEqual(
      transposed.song.sections[0].lines[0].segments.map((s) => s.chord),
      ['A', 'E/G#', 'F#m7', 'D']
    );
    // Original custom song remains untouched in key of G
    assert.equal(customSong.originalKey, 'G');
    assert.deepEqual(
      customSong.sections[0].lines[0].segments.map((s) => s.chord),
      ['G', 'D/F#', 'Em7', 'C']
    );

    // Merge with built-in catalog and verify search, source filter, and ID resolution
    const merged = mergeCatalogAndCustomSongs([customSong]);
    assert.equal(merged.length, getAllSongs().length + 1);

    const customOnlyResults = searchAndFilterSongs(merged, {
      sourceType: 'custom',
    });
    assert.equal(customOnlyResults.length, 1);
    assert.equal(customOnlyResults[0].id, customSong.id);

    const queryResults = searchAndFilterSongs(merged, {
      query: 'Crown of Grace',
    });
    assert.equal(queryResults.length, 1);
    assert.equal(queryResults[0].slug, customSong.slug);

    const resolvedFavorites = resolveSongsByIds(
      [customSong.id, getAllSongs()[0].id],
      merged
    );
    assert.equal(resolvedFavorites.length, 2);
    assert.equal(resolvedFavorites[0].id, customSong.id);

    // Ensure custom slug never collides with existing slugs
    const nonCollidingSlug = createCustomSongSlug(
      getAllSongs()[0].title,
      createCustomSongId()
    );
    assert.notEqual(nonCollidingSlug, getAllSongs()[0].slug);
  });
});
