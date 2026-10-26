import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getGuitarChordDiagram,
  getPianoKeysForChord,
} from '../chordDiagrams.ts';

describe('Chord Diagram & Piano Fingering Engine', () => {
  it('resolves direct guitar chord definitions for common worship chords', () => {
    const commonChords = ['C', 'G', 'D', 'Em', 'Am', 'F', 'D/F#', 'Gsus4', 'Cadd9'];
    for (const ch of commonChords) {
      const diagram = getGuitarChordDiagram(ch);
      assert.ok(diagram, `Should find a diagram for ${ch}`);
      assert.equal(diagram.frets.length, 6, `Should have 6 strings for ${ch}`);
      assert.ok(diagram.baseFret >= 1, `Base fret should be >= 1 for ${ch}`);
    }
  });

  it('handles slash chords correctly with specific bass note', () => {
    const dOverFSharp = getGuitarChordDiagram('D/F#');
    assert.ok(dOverFSharp);
    assert.equal(dOverFSharp.chord, 'D/F#');
    // Low E string is fretted at 2 (F#)
    assert.equal(dOverFSharp.frets[0], 2);

    const cOverE = getGuitarChordDiagram('C/E');
    assert.ok(cOverE);
    assert.equal(cOverE.frets[0], 0); // open low E
  });

  it('generates movable barre chords for higher and sharp/flat keys', () => {
    const fSharp = getGuitarChordDiagram('F#');
    assert.ok(fSharp);
    assert.equal(fSharp.frets.length, 6);
    assert.ok(fSharp.barres && fSharp.barres.length > 0);

    const gSharpMinor = getGuitarChordDiagram('G#m');
    assert.ok(gSharpMinor);
    assert.equal(gSharpMinor.frets.length, 6);
    assert.ok(gSharpMinor.barres && gSharpMinor.barres.length > 0);

    const bFlat = getGuitarChordDiagram('Bb');
    assert.ok(bFlat);
    assert.equal(bFlat.frets.length, 6);
  });

  it('returns valid 2-octave piano keys with active and bass notes', () => {
    const pianoC = getPianoKeysForChord('C');
    assert.ok(pianoC.keys.length === 24);
    // Should have active keys for C, E, G
    const chordToneNotes = pianoC.keys.filter((k) => k.isChordTone).map((k) => k.note);
    assert.ok(chordToneNotes.includes('C'));
    assert.ok(chordToneNotes.includes('E'));
    assert.ok(chordToneNotes.includes('G'));

    // Test piano slash chord C/E
    const pianoCOverE = getPianoKeysForChord('C/E');
    assert.equal(pianoCOverE.leftHandBass, 'E');
    const bassKeys = pianoCOverE.keys.filter((k) => k.isBass);
    assert.ok(bassKeys.length > 0);
    assert.equal(bassKeys[0].note, 'E');

    // Strict octave separation: Octave 1 (left hand) must only contain the bass note, not chord tones
    const octave1Keys = pianoCOverE.keys.slice(0, 12);
    const octave2Keys = pianoCOverE.keys.slice(12, 24);

    assert.equal(octave1Keys.filter((k) => k.isBass).length, 1);
    assert.equal(octave1Keys.filter((k) => k.isChordTone).length, 0, 'Octave 1 must not contain chord tones');

    // Octave 2 (right hand) must contain chord tones, but no bass notes
    assert.equal(octave2Keys.filter((k) => k.isBass).length, 0, 'Octave 2 must not contain bass notes');
    assert.ok(octave2Keys.filter((k) => k.isChordTone).length >= 3, 'Octave 2 must contain RH chord tones');
  });

  it('resolves worship minor slash chords correctly', () => {
    const minorSlashChords = ['Am/G', 'Bm/A', 'Em/D', 'Dm/C', 'F#m/E'];
    for (const ch of minorSlashChords) {
      const diagram = getGuitarChordDiagram(ch);
      assert.ok(diagram, `Should resolve chord diagram for ${ch}`);
      assert.equal(diagram.frets.length, 6);
    }
  });

  it('handles non-chord tokens and empty strings safely', () => {
    const empty = getGuitarChordDiagram('');
    assert.equal(empty, null);

    const nc = getGuitarChordDiagram('N.C.');
    assert.equal(nc, null);

    const pianoEmpty = getPianoKeysForChord('');
    assert.ok(Array.isArray(pianoEmpty.keys));
    assert.equal(pianoEmpty.keys.filter((k) => k.isChordTone).length, 0);
  });
});

