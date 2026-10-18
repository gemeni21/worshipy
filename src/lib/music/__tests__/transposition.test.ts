import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import rawDemoSongs from '../../../data/demo-songs.json' with { type: 'json' };
import {
  getAllSongs,
  resolveSongsByIds,
  searchAndFilterSongs,
} from '../../catalog/songCatalog.ts';
import { validateSongCatalog, validateSongRecord } from '../../validation/songValidator.ts';
import {
  formatSignedSemitones,
  getDestinationKeyOptions,
  getSemitoneDistanceBetweenKeys,
  normalizeSemitones,
  parseChord,
  parseKey,
  transposeChord,
  transposeKey,
  transposeSong,
} from '../transposition.ts';
import type { SongRecord } from '../../../types/song.ts';

describe('Chord Parser & Transposition Engine', () => {
  it('parses and transposes natural roots and boundary transitions across B/C and E/F', () => {
    // Boundary B -> C (+1) and C -> B (-1)
    assert.equal(transposeChord('B', 1, { preference: 'sharp' }), 'C');
    assert.equal(transposeChord('C', -1, { preference: 'sharp' }), 'B');

    // Boundary E -> F (+1) and F -> E (-1)
    assert.equal(transposeChord('E', 1, { preference: 'sharp' }), 'F');
    assert.equal(transposeChord('F', -1, { preference: 'sharp' }), 'E');

    // Natural roots shifted by +2 semitones in sharp context
    assert.equal(transposeChord('C', 2, { preference: 'sharp' }), 'D');
    assert.equal(transposeChord('D', 2, { preference: 'sharp' }), 'E');
    assert.equal(transposeChord('E', 2, { preference: 'sharp' }), 'F#');
    assert.equal(transposeChord('F', 2, { preference: 'sharp' }), 'G');
    assert.equal(transposeChord('G', 2, { preference: 'sharp' }), 'A');
    assert.equal(transposeChord('A', 2, { preference: 'sharp' }), 'B');
    assert.equal(transposeChord('B', 2, { preference: 'sharp' }), 'C#');
  });

  it('handles sharp and flat roots with consistent enharmonic spelling', () => {
    const sharpChords = ['C#', 'D#', 'F#', 'G#', 'A#'];
    const expectedFlats = ['Db', 'Eb', 'Gb', 'Ab', 'Bb'];

    sharpChords.forEach((chord, idx) => {
      assert.equal(
        transposeChord(chord, 0, { preference: 'flat' }),
        expectedFlats[idx]
      );
    });

    expectedFlats.forEach((chord, idx) => {
      assert.equal(
        transposeChord(chord, 0, { preference: 'sharp' }),
        sharpChords[idx]
      );
    });

    // Key-aware auto spelling: in key of F or Bb, pitch class 10 is Bb, pitch class 3 is Eb
    assert.equal(
      transposeChord('A', 1, { preference: 'auto', targetKeyContext: 'Bb' }),
      'Bb'
    );
    assert.equal(
      transposeChord('D', 1, { preference: 'auto', targetKeyContext: 'Bb' }),
      'Eb'
    );
    // In key of A or E, pitch class 6 is F# and pitch class 1 is C#
    assert.equal(
      transposeChord('E', 2, { preference: 'auto', targetKeyContext: 'A' }),
      'F#'
    );
    assert.equal(
      transposeChord('B', 2, { preference: 'auto', targetKeyContext: 'A' }),
      'C#'
    );
  });

  it('preserves all required chord qualities and extensions accurately', () => {
    const suffixes = [
      '',
      'm',
      'min',
      'maj',
      'sus2',
      'sus4',
      'dim',
      'dim7',
      'aug',
      '6',
      '7',
      'maj7',
      'm7',
      'm7b5',
      'add9',
      '9',
      '11',
      '13',
      '7sus4',
      'm(add9)',
      '6/9',
    ];

    for (const suffix of suffixes) {
      const source = `C${suffix}`;
      const transposedUp2 = transposeChord(source, 2, { preference: 'sharp' });
      assert.equal(transposedUp2, `D${suffix}`, `Failed on suffix "${suffix}"`);

      const transposedBack = transposeChord(transposedUp2, -2, {
        preference: 'sharp',
      });
      assert.equal(transposedBack, source);
    }
  });

  it('transposes slash/inversion chords on both main root and bass note', () => {
    assert.equal(
      transposeChord('D/F#', 2, { preference: 'sharp' }),
      'E/G#'
    );
    assert.equal(
      transposeChord('G/B', 1, { preference: 'flat', targetKeyContext: 'Ab' }),
      'Ab/C'
    );
    assert.equal(
      transposeChord('C/E', 5, { preference: 'flat', targetKeyContext: 'F' }),
      'F/A'
    );
    assert.equal(
      transposeChord('Am7/G', 2, { preference: 'sharp' }),
      'Bm7/A'
    );
    assert.equal(
      transposeChord('Bb/D', -3, { preference: 'sharp', targetKeyContext: 'G' }),
      'G/B'
    );
  });

  it('preserves N.C. markings and safely ignores normal words or unknown tokens', () => {
    assert.equal(transposeChord('N.C.', 5), 'N.C.');
    assert.equal(transposeChord('NC', -3), 'NC');

    // Words that start with A-G must never be parsed or transposed as chords
    const normalWords = [
      'Amazing',
      'Grace',
      'Bridge',
      'Chorus',
      'Day',
      'Earth',
      'Faithful',
      'Glory',
      'Alleluia',
      'Biyaya',
      'Dakila',
    ];
    for (const word of normalWords) {
      assert.equal(parseChord(word), null, `Word "${word}" should not parse as a chord`);
      assert.equal(transposeChord(word, 4), word);
    }
  });

  it('handles major and minor key transposition and destination key options', () => {
    assert.deepEqual(parseKey('F#m'), {
      root: 'F#',
      pitchClass: 6,
      isMinor: true,
    });
    assert.equal(transposeKey('G', 2), 'A');
    assert.equal(transposeKey('G', -2), 'F');
    assert.equal(transposeKey('F#m', 1), 'Gm');
    assert.equal(transposeKey('Am', 3), 'Cm');
    assert.equal(transposeKey('Bb', 2), 'C');

    const gOptions = getDestinationKeyOptions('G');
    assert.equal(gOptions.length, 12);
    assert.equal(gOptions[0].key, 'G');
    assert.equal(gOptions[0].isMinor, false);

    const fSharpMinorOptions = getDestinationKeyOptions('F#m');
    assert.equal(fSharpMinorOptions.length, 12);
    assert.equal(fSharpMinorOptions[0].key, 'F#m');
    assert.equal(fSharpMinorOptions.every((opt) => opt.isMinor), true);

    assert.equal(getSemitoneDistanceBetweenKeys('G', 'A'), 2);
    assert.equal(getSemitoneDistanceBetweenKeys('G', 'F'), 10);
  });

  it('is strictly reversible and returns to exact original chart on reset or 12-semitone cycle', () => {
    const testChart: SongRecord = {
      id: 'test-1',
      slug: 'test-chart',
      title: 'Grace in the Valley',
      artist: 'Test Artist',
      language: { code: 'en', label: 'English' },
      category: { id: 'contemporary-worship', label: 'Contemporary Worship' },
      originalKey: 'G',
      contentStatus: 'demo',
      sections: [
        {
          id: 's1',
          type: 'verse',
          label: 'Verse 1',
          cue: 'Acoustic only - do not transpose this cue',
          lines: [
            {
              annotation: 'Sing softly on repeat',
              segments: [
                { chord: 'G', text: 'Amazing Grace, how ' },
                { chord: 'D/F#', text: 'sweet the sound ' },
                { chord: 'Em7', text: 'that saved a ' },
                { chord: 'Cadd9', text: 'wretch like me.' },
              ],
            },
          ],
        },
        {
          id: 's2',
          type: 'chorus',
          label: 'Chorus',
          lines: [
            {
              segments: [
                { chord: 'N.C.', text: 'Before the throne ' },
                { chord: 'G/B', text: 'we stand in ' },
                { chord: 'C', text: 'peace and ' },
                { chord: 'Dsus4', text: 'grateful ' },
                { chord: 'D', text: 'praise.' },
              ],
            },
          ],
        },
      ],
    };

    const originalSnapshot = JSON.stringify(testChart);

    // Transpose +3 semitones (G -> Bb)
    const up3 = transposeSong(testChart, 3);
    assert.equal(up3.displayedKey, 'Bb');
    assert.deepEqual(
      up3.song.sections[0].lines[0].segments.map((s) => s.chord),
      ['Bb', 'F/A', 'Gm7', 'Ebadd9']
    );
    // Verify lyrics, section labels, and cues are completely untouched
    assert.deepEqual(
      up3.song.sections[0].lines[0].segments.map((s) => s.text),
      testChart.sections[0].lines[0].segments.map((s) => s.text)
    );
    assert.equal(up3.song.sections[0].label, 'Verse 1');
    assert.equal(up3.song.sections[0].cue, 'Acoustic only - do not transpose this cue');
    assert.equal(up3.song.sections[1].lines[0].segments[0].chord, 'N.C.');

    // Verify source record was never mutated
    assert.equal(JSON.stringify(testChart), originalSnapshot);

    // Simulate repeated up/down tapping (+1 fifteen times, -1 fifteen times = 0)
    let semitones = 0;
    for (let i = 0; i < 15; i++) semitones += 1;
    for (let i = 0; i < 15; i++) semitones -= 1;

    const afterTaps = transposeSong(testChart, semitones);
    assert.equal(afterTaps.displayedKey, 'G');
    assert.equal(JSON.stringify(afterTaps.song), originalSnapshot);

    // Full octave (+12) returns to exact original chart
    const fullOctave = transposeSong(testChart, 12);
    assert.equal(fullOctave.displayedKey, 'G');
    assert.equal(JSON.stringify(fullOctave.song), originalSnapshot);

    // Normalize and signed semitone helpers
    assert.equal(normalizeSemitones(-1), 11);
    assert.equal(formatSignedSemitones(11), '-1');
    assert.equal(formatSignedSemitones(2), '+2');
    assert.equal(formatSignedSemitones(0), '0');
  });
});

describe('Demo Song Catalog & Search/Filter Validation', () => {
  it('validates all seed demo songs with zero schema or chord errors', () => {
    const result = validateSongCatalog(rawDemoSongs as unknown[]);
    assert.equal(
      result.valid,
      true,
      `Seed validation failed: ${result.errors.join('; ')}`
    );
    assert.ok((rawDemoSongs as unknown[]).length >= 8);
  });

  it('catches invalid song records in validator', () => {
    const badRecord = {
      id: '',
      slug: 'Invalid Slug!',
      title: 'Bad Song',
      originalKey: 'H#',
      sections: [],
    };
    const res = validateSongRecord(badRecord);
    assert.equal(res.valid, false);
    assert.ok(res.errors.length >= 4);
  });

  it('combines search queries and language/category/key filters accurately', () => {
    const allSongs = getAllSongs();

    // Filter by Filipino language
    const filSongs = searchAndFilterSongs(allSongs, { language: 'fil' });
    assert.ok(filSongs.length >= 3);
    assert.ok(filSongs.every((s) => s.language.code === 'fil'));

    // Combine category + key filter
    const gContemporary = searchAndFilterSongs(allSongs, {
      category: 'contemporary-worship',
      originalKey: 'G',
    });
    assert.ok(gContemporary.length >= 1);
    assert.equal(gContemporary[0].slug, 'goodness-of-god');

    // Search by title substring + filter
    const searchRes = searchAndFilterSongs(allSongs, {
      query: 'dakila',
      language: 'fil',
    });
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].slug, 'dakilang-katapatan');

    // Empty search match
    const noMatch = searchAndFilterSongs(allSongs, {
      query: 'nonexistent-xyz-999',
    });
    assert.equal(noMatch.length, 0);

    // Safe resolution of song IDs including deleted/unavailable IDs
    const resolved = resolveSongsByIds([
      'song-01',
      'deleted-song-id-999',
      'song-02',
    ]);
    assert.equal(resolved.length, 2);
    assert.equal(resolved[0].id, 'song-01');
    assert.equal(resolved[1].id, 'song-02');
  });
});
