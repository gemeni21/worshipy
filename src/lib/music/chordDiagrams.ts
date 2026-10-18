import {
  parseChord,
  SHARP_SCALE,
  FLAT_SCALE,
} from './transposition.ts';
import { getKeyboardVoicing } from './instrumentGuidance.ts';

export interface GuitarChordDiagram {
  chord: string;
  baseFret: number; // 1 means nut/first fret
  // 6 values from 6th string (low E) to 1st string (high E)
  // 'x' = muted, 0 = open, number = fret relative to baseFret or absolute fret
  frets: (number | 'x')[];
  fingers?: (number | 'T' | null)[]; // 1=index, 2=middle, 3=ring, 4=pinky, T=thumb
  barres?: number[];
}

export interface PianoKey {
  note: string;
  isBlack: boolean;
  isBass: boolean;
  isChordTone: boolean;
  isRoot: boolean;
}

// Common, verified church/worship guitar chord shapes
// Strings: [6th, 5th, 4th, 3rd, 2nd, 1st] (E A D G B e)
const STANDARD_GUITAR_CHORDS: Record<string, GuitarChordDiagram> = {
  // C family
  C: { chord: 'C', baseFret: 1, frets: ['x', 3, 2, 0, 1, 0], fingers: [null, 3, 2, null, 1, null] },
  Cadd9: { chord: 'Cadd9', baseFret: 1, frets: ['x', 3, 2, 0, 3, 3], fingers: [null, 2, 1, null, 3, 4] },
  C2: { chord: 'C2', baseFret: 1, frets: ['x', 3, 2, 0, 3, 3], fingers: [null, 2, 1, null, 3, 4] },
  Cmaj7: { chord: 'Cmaj7', baseFret: 1, frets: ['x', 3, 2, 0, 0, 0], fingers: [null, 3, 2, null, null, null] },
  C7: { chord: 'C7', baseFret: 1, frets: ['x', 3, 2, 3, 1, 0], fingers: [null, 3, 2, 4, 1, null] },
  Csus4: { chord: 'Csus4', baseFret: 1, frets: ['x', 3, 3, 0, 1, 1], fingers: [null, 3, 4, null, 1, 1] },
  Csus: { chord: 'Csus', baseFret: 1, frets: ['x', 3, 3, 0, 1, 1], fingers: [null, 3, 4, null, 1, 1] },
  Cm: { chord: 'Cm', baseFret: 3, frets: ['x', 3, 5, 5, 4, 3], barres: [3], fingers: [null, 1, 3, 4, 2, 1] },
  'C/E': { chord: 'C/E', baseFret: 1, frets: [0, 3, 2, 0, 1, 0], fingers: [null, 3, 2, null, 1, null] },
  'C/G': { chord: 'C/G', baseFret: 1, frets: [3, 3, 2, 0, 1, 0], fingers: [3, 4, 2, null, 1, null] },

  // D family
  D: { chord: 'D', baseFret: 1, frets: ['x', 'x', 0, 2, 3, 2], fingers: [null, null, null, 1, 3, 2] },
  Dm: { chord: 'Dm', baseFret: 1, frets: ['x', 'x', 0, 2, 3, 1], fingers: [null, null, null, 2, 3, 1] },
  Dsus4: { chord: 'Dsus4', baseFret: 1, frets: ['x', 'x', 0, 2, 3, 3], fingers: [null, null, null, 1, 2, 4] },
  Dsus: { chord: 'Dsus', baseFret: 1, frets: ['x', 'x', 0, 2, 3, 3], fingers: [null, null, null, 1, 2, 4] },
  Dsus2: { chord: 'Dsus2', baseFret: 1, frets: ['x', 'x', 0, 2, 3, 0], fingers: [null, null, null, 1, 2, null] },
  D7: { chord: 'D7', baseFret: 1, frets: ['x', 'x', 0, 2, 1, 2], fingers: [null, null, null, 2, 1, 3] },
  Dmaj7: { chord: 'Dmaj7', baseFret: 1, frets: ['x', 'x', 0, 2, 2, 2], fingers: [null, null, null, 1, 1, 1], barres: [2] },
  'D/F#': { chord: 'D/F#', baseFret: 1, frets: [2, 0, 0, 2, 3, 2], fingers: ['T', null, null, 1, 3, 2] },
  'D/A': { chord: 'D/A', baseFret: 1, frets: ['x', 0, 0, 2, 3, 2], fingers: [null, null, null, 1, 3, 2] },
  'D/C': { chord: 'D/C', baseFret: 1, frets: ['x', 3, 0, 2, 3, 2], fingers: [null, 2, null, 1, 4, 3] },

  // E family
  E: { chord: 'E', baseFret: 1, frets: [0, 2, 2, 1, 0, 0], fingers: [null, 2, 3, 1, null, null] },
  Em: { chord: 'Em', baseFret: 1, frets: [0, 2, 2, 0, 0, 0], fingers: [null, 2, 3, null, null, null] },
  Em7: { chord: 'Em7', baseFret: 1, frets: [0, 2, 2, 0, 3, 3], fingers: [null, 1, 2, null, 3, 4] },
  E7: { chord: 'E7', baseFret: 1, frets: [0, 2, 0, 1, 0, 0], fingers: [null, 2, null, 1, null, null] },
  Esus4: { chord: 'Esus4', baseFret: 1, frets: [0, 2, 2, 2, 0, 0], fingers: [null, 2, 3, 4, null, null] },
  'E/G#': { chord: 'E/G#', baseFret: 1, frets: [4, 2, 2, 4, 0, 0], fingers: [3, 1, 1, 4, null, null] },

  // F family
  F: { chord: 'F', baseFret: 1, frets: [1, 3, 3, 2, 1, 1], barres: [1], fingers: [1, 3, 4, 2, 1, 1] },
  Fm: { chord: 'Fm', baseFret: 1, frets: [1, 3, 3, 1, 1, 1], barres: [1], fingers: [1, 3, 4, 1, 1, 1] },
  Fmaj7: { chord: 'Fmaj7', baseFret: 1, frets: ['x', 'x', 3, 2, 1, 0], fingers: [null, null, 3, 2, 1, null] },
  F7: { chord: 'F7', baseFret: 1, frets: [1, 3, 1, 2, 1, 1], barres: [1], fingers: [1, 3, 1, 2, 1, 1] },
  'F/A': { chord: 'F/A', baseFret: 1, frets: ['x', 0, 3, 2, 1, 1], fingers: [null, null, 3, 2, 1, 1] },

  // F# / Gb family
  'F#': { chord: 'F#', baseFret: 2, frets: [2, 4, 4, 3, 2, 2], barres: [2], fingers: [1, 3, 4, 2, 1, 1] },
  'F#m': { chord: 'F#m', baseFret: 2, frets: [2, 4, 4, 2, 2, 2], barres: [2], fingers: [1, 3, 4, 1, 1, 1] },
  'F#m7': { chord: 'F#m7', baseFret: 2, frets: [2, 4, 2, 2, 2, 2], barres: [2], fingers: [1, 3, 1, 1, 1, 1] },
  'F#7': { chord: 'F#7', baseFret: 2, frets: [2, 4, 2, 3, 2, 2], barres: [2], fingers: [1, 3, 1, 2, 1, 1] },
  'F#/A#': { chord: 'F#/A#', baseFret: 1, frets: ['x', 1, 4, 3, 2, 2], fingers: [null, 1, 4, 3, 2, 2] },

  // G family
  G: { chord: 'G', baseFret: 1, frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, null, null, 3, 4] },
  Gm: { chord: 'Gm', baseFret: 3, frets: [3, 5, 5, 3, 3, 3], barres: [3], fingers: [1, 3, 4, 1, 1, 1] },
  G7: { chord: 'G7', baseFret: 1, frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, null, null, null, 1] },
  Gsus4: { chord: 'Gsus4', baseFret: 1, frets: [3, 2, 0, 0, 1, 3], fingers: [3, 2, null, null, 1, 4] },
  Gsus: { chord: 'Gsus', baseFret: 1, frets: [3, 2, 0, 0, 1, 3], fingers: [3, 2, null, null, 1, 4] },
  'G/B': { chord: 'G/B', baseFret: 1, frets: ['x', 2, 0, 0, 3, 3], fingers: [null, 1, null, null, 3, 4] },
  'G/D': { chord: 'G/D', baseFret: 1, frets: ['x', 'x', 0, 0, 0, 3], fingers: [null, null, null, null, null, 3] },

  // A family
  A: { chord: 'A', baseFret: 1, frets: ['x', 0, 2, 2, 2, 0], fingers: [null, null, 1, 2, 3, null] },
  Am: { chord: 'Am', baseFret: 1, frets: ['x', 0, 2, 2, 1, 0], fingers: [null, null, 2, 3, 1, null] },
  Am7: { chord: 'Am7', baseFret: 1, frets: ['x', 0, 2, 0, 1, 0], fingers: [null, null, 2, null, 1, null] },
  A7: { chord: 'A7', baseFret: 1, frets: ['x', 0, 2, 0, 2, 0], fingers: [null, null, 2, null, 3, null] },
  Asus4: { chord: 'Asus4', baseFret: 1, frets: ['x', 0, 2, 2, 3, 0], fingers: [null, null, 1, 2, 4, null] },
  Asus2: { chord: 'Asus2', baseFret: 1, frets: ['x', 0, 2, 2, 0, 0], fingers: [null, null, 1, 2, null, null] },
  A2: { chord: 'A2', baseFret: 1, frets: ['x', 0, 2, 2, 0, 0], fingers: [null, null, 1, 2, null, null] },
  'A/C#': { chord: 'A/C#', baseFret: 1, frets: ['x', 4, 2, 2, 2, 0], fingers: [null, 4, 1, 2, 3, null] },
  'A/E': { chord: 'A/E', baseFret: 1, frets: [0, 0, 2, 2, 2, 0], fingers: [null, null, 1, 2, 3, null] },

  // B family
  B: { chord: 'B', baseFret: 2, frets: ['x', 2, 4, 4, 4, 2], barres: [2], fingers: [null, 1, 2, 3, 4, 1] },
  Bm: { chord: 'Bm', baseFret: 2, frets: ['x', 2, 4, 4, 3, 2], barres: [2], fingers: [null, 1, 3, 4, 2, 1] },
  Bm7: { chord: 'Bm7', baseFret: 2, frets: ['x', 2, 4, 2, 3, 2], barres: [2], fingers: [null, 1, 3, 1, 2, 1] },
  Bsus4: { chord: 'Bsus4', baseFret: 2, frets: ['x', 2, 4, 4, 5, 2], barres: [2], fingers: [null, 1, 2, 3, 4, 1] },
  B7: { chord: 'B7', baseFret: 1, frets: ['x', 2, 1, 2, 0, 2], fingers: [null, 2, 1, 3, null, 4] },
  'B/D#': { chord: 'B/D#', baseFret: 1, frets: ['x', 'x', 1, 4, 4, 2], fingers: [null, null, 1, 3, 4, 2] },

  // Bb / A#
  Bb: { chord: 'Bb', baseFret: 1, frets: ['x', 1, 3, 3, 3, 1], barres: [1], fingers: [null, 1, 2, 3, 4, 1] },
  Bbm: { chord: 'Bbm', baseFret: 1, frets: ['x', 1, 3, 3, 2, 1], barres: [1], fingers: [null, 1, 3, 4, 2, 1] },
  'Bb/D': { chord: 'Bb/D', baseFret: 1, frets: ['x', 'x', 0, 3, 3, 1], fingers: [null, null, null, 2, 3, 1] },

  // Eb / D#
  Eb: { chord: 'Eb', baseFret: 6, frets: ['x', 6, 8, 8, 8, 6], barres: [6], fingers: [null, 1, 2, 3, 4, 1] },
  'Eb/G': { chord: 'Eb/G', baseFret: 3, frets: [3, 6, 5, 3, 4, 3], barres: [3], fingers: [1, 4, 3, 1, 2, 1] },
  'Eb/Bb': { chord: 'Eb/Bb', baseFret: 1, frets: ['x', 1, 1, 3, 4, 3], fingers: [null, 1, 1, 2, 4, 3] },

  // Ab / G#
  Ab: { chord: 'Ab', baseFret: 4, frets: [4, 6, 6, 5, 4, 4], barres: [4], fingers: [1, 3, 4, 2, 1, 1] },
  'Ab/C': { chord: 'Ab/C', baseFret: 1, frets: ['x', 3, 1, 1, 1, 'x'], barres: [1], fingers: [null, 3, 1, 1, 1, null] },

  // Db / C#
  Db: { chord: 'Db', baseFret: 4, frets: ['x', 4, 6, 6, 6, 4], barres: [4], fingers: [null, 1, 2, 3, 4, 1] },
  'Db/F': { chord: 'Db/F', baseFret: 1, frets: [1, 4, 3, 1, 2, 1], barres: [1], fingers: [1, 4, 3, 1, 2, 1] },
};

/**
 * Returns a guitar chord diagram for a chord symbol, generating movable shapes when needed.
 */
export function getGuitarChordDiagram(chordToken: string): GuitarChordDiagram | null {
  const trimmed = chordToken.trim();
  if (!trimmed || trimmed === 'N.C.') return null;

  // Direct lookup
  if (STANDARD_GUITAR_CHORDS[trimmed]) {
    return STANDARD_GUITAR_CHORDS[trimmed];
  }

  // Check enharmonic equivalents (e.g. C# -> Db, F# -> Gb, A# -> Bb, G# -> Ab)
  const parsed = parseChord(trimmed);
  if (!parsed) return null;

  const sharpRoot = SHARP_SCALE[parsed.pitchClass];
  const flatRoot = FLAT_SCALE[parsed.pitchClass];
  const suffix = parsed.suffix;

  const sharpCandidate = `${sharpRoot}${suffix}${parsed.bassPitchClass !== undefined ? '/' + SHARP_SCALE[parsed.bassPitchClass] : ''}`;
  if (STANDARD_GUITAR_CHORDS[sharpCandidate]) {
    return { ...STANDARD_GUITAR_CHORDS[sharpCandidate], chord: trimmed };
  }

  const flatCandidate = `${flatRoot}${suffix}${parsed.bassPitchClass !== undefined ? '/' + FLAT_SCALE[parsed.bassPitchClass] : ''}`;
  if (STANDARD_GUITAR_CHORDS[flatCandidate]) {
    return { ...STANDARD_GUITAR_CHORDS[flatCandidate], chord: trimmed };
  }

  // Movable barre chord generator based on 6th string (E shape) or 5th string (A shape)
  const isMinor = suffix.startsWith('m') && !suffix.startsWith('maj');
  const rootPitch = parsed.pitchClass;

  // Try 5th string root (pitch class 0 = fret 3, etc.)
  const fretOn5th = (rootPitch + 12 - 0 + 3) % 12; // C is fret 3
  if (fretOn5th >= 1 && fretOn5th <= 9) {
    if (isMinor) {
      return {
        chord: trimmed,
        baseFret: fretOn5th,
        frets: ['x', fretOn5th, fretOn5th + 2, fretOn5th + 2, fretOn5th + 1, fretOn5th],
        barres: [fretOn5th],
      };
    } else {
      return {
        chord: trimmed,
        baseFret: fretOn5th,
        frets: ['x', fretOn5th, fretOn5th + 2, fretOn5th + 2, fretOn5th + 2, fretOn5th],
        barres: [fretOn5th],
      };
    }
  }

  // Fallback 6th string barre
  const fretOn6th = (rootPitch + 12 - 4) % 12; // E is fret 0
  const actualFret = fretOn6th === 0 ? 12 : fretOn6th;
  if (actualFret >= 1 && actualFret <= 9) {
    if (isMinor) {
      return {
        chord: trimmed,
        baseFret: actualFret,
        frets: [actualFret, actualFret + 2, actualFret + 2, actualFret, actualFret, actualFret],
        barres: [actualFret],
      };
    } else {
      return {
        chord: trimmed,
        baseFret: actualFret,
        frets: [actualFret, actualFret + 2, actualFret + 2, actualFret + 1, actualFret, actualFret],
        barres: [actualFret],
      };
    }
  }

  return null;
}

/**
 * Builds a 2-octave piano keyboard (C to B twice, 24 keys) with highlighted bass and chord tones.
 */
export function getPianoKeysForChord(
  chordToken: string,
  keyContext?: string
): { keys: PianoKey[]; notes: string[]; leftHandBass: string } {
  const emptyKeys: PianoKey[] = [];
  const baseNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const blackKeys = new Set(['C#', 'D#', 'F#', 'G#', 'A#']);

  const voicing = getKeyboardVoicing(chordToken, 'auto', keyContext);
  const bass = voicing?.leftHandBass ?? '';
  const chordNotes = voicing?.rightHandNotes ?? [];

  const parsed = parseChord(chordToken);
  const rootNote = parsed ? SHARP_SCALE[parsed.pitchClass] : '';
  const rootFlat = parsed ? FLAT_SCALE[parsed.pitchClass] : '';

  const chordToneSet = new Set(chordNotes);

  // Generate 24 keys (Octave 1 and Octave 2)
  for (let octave = 1; octave <= 2; octave++) {
    for (let i = 0; i < 12; i++) {
      const sharpNote = baseNotes[i];
      const flatNote = FLAT_SCALE[i];
      const isBlack = blackKeys.has(sharpNote);

      const isBassMatch =
        octave === 1 &&
        (sharpNote === bass || flatNote === bass);

      const isToneMatch =
        chordToneSet.has(sharpNote) ||
        chordToneSet.has(flatNote) ||
        (octave === 2 && (sharpNote === rootNote || flatNote === rootFlat));

      const isRootMatch = sharpNote === rootNote || flatNote === rootFlat;

      emptyKeys.push({
        note: sharpNote,
        isBlack,
        isBass: isBassMatch,
        isChordTone: isToneMatch,
        isRoot: isRootMatch,
      });
    }
  }

  return {
    keys: emptyKeys,
    notes: chordNotes,
    leftHandBass: bass,
  };
}
