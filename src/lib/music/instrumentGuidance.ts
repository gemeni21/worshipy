import {
  FLAT_SCALE,
  normalizeSemitones,
  parseChord,
  parseKey,
  pitchClassToNote,
  SHARP_SCALE,
  shouldUseFlats,
  transposeChord,
} from './transposition.ts';
import type { EnharmonicPreference } from '../../types/song.ts';

export interface GuitarCapoSuggestion {
  capoFret: number;
  shapeKey: string;
  description: string;
}

export interface KeyboardVoicingInfo {
  chord: string;
  leftHandBass: string;
  rightHandNotes: string[];
  voicingTip: string;
}

export interface BassNoteInfo {
  chord: string;
  primaryBass: string;
  isSlashInversion: boolean;
  chordRoot: string;
  fifthNote: string;
}

const OPEN_MAJOR_SHAPES: { shapeKey: string; pitchClass: number }[] = [
  { shapeKey: 'G', pitchClass: 7 },
  { shapeKey: 'C', pitchClass: 0 },
  { shapeKey: 'D', pitchClass: 2 },
  { shapeKey: 'A', pitchClass: 9 },
  { shapeKey: 'E', pitchClass: 4 },
];

const OPEN_MINOR_SHAPES: { shapeKey: string; pitchClass: number }[] = [
  { shapeKey: 'Em', pitchClass: 4 },
  { shapeKey: 'Am', pitchClass: 9 },
  { shapeKey: 'Dm', pitchClass: 2 },
];

/**
 * Computes practical guitar capo suggestions for any concert key.
 */
export function getGuitarCapoSuggestions(
  concertKey: string
): GuitarCapoSuggestion[] {
  const parsed = parseKey(concertKey);
  if (!parsed) return [];

  const shapes = parsed.isMinor ? OPEN_MINOR_SHAPES : OPEN_MAJOR_SHAPES;
  const suggestions: GuitarCapoSuggestion[] = [];

  for (const candidate of shapes) {
    const fret = normalizeSemitones(parsed.pitchClass - candidate.pitchClass);
    if (fret === 0) {
      suggestions.unshift({
        capoFret: 0,
        shapeKey: candidate.shapeKey,
        description: `No Capo — Play open ${candidate.shapeKey} shapes`,
      });
    } else if (fret >= 1 && fret <= 7) {
      suggestions.push({
        capoFret: fret,
        shapeKey: candidate.shapeKey,
        description: `Capo ${fret} — Play ${candidate.shapeKey} shapes`,
      });
    }
  }

  return suggestions.sort((a, b) => a.capoFret - b.capoFret).slice(0, 3);
}

/**
 * Computes the capo-relative chord symbol when a guitarist uses a capo on `capoFret`.
 */
export function getCapoRelativeChord(
  concertChord: string,
  capoFret: number,
  shapeKeyContext?: string
): string {
  if (!capoFret || capoFret <= 0) return concertChord;
  return transposeChord(concertChord, -capoFret, {
    preference: 'sharp',
    targetKeyContext: shapeKeyContext,
  });
}

/**
 * Computes keyboard left-hand bass and right-hand chord tones for a chord symbol.
 */
export function getKeyboardVoicing(
  chordToken: string,
  preference: EnharmonicPreference = 'auto',
  keyContext?: string
): KeyboardVoicingInfo | null {
  const parsed = parseChord(chordToken);
  if (!parsed) return null;

  const useFlats = shouldUseFlats(preference, keyContext, parsed.pitchClass);
  const scale = useFlats ? FLAT_SCALE : SHARP_SCALE;

  const root = scale[parsed.pitchClass];
  const s = parsed.suffix;

  // Determine intervals in semitones from root
  const intervals: number[] = [0];

  if (s.includes('sus2')) {
    intervals.push(2, 7);
  } else if (s.includes('sus4') || s === 'sus') {
    intervals.push(5, 7);
  } else if (s.startsWith('dim')) {
    intervals.push(3, 6);
  } else if (s.startsWith('aug') || s.startsWith('+')) {
    intervals.push(4, 8);
  } else if (s.startsWith('m') && !s.startsWith('maj')) {
    intervals.push(3, 7);
  } else {
    intervals.push(4, 7);
  }

  if (s.includes('m7b5') || s.includes('ø')) {
    intervals[2] = 6;
    intervals.push(10);
  } else if (s.includes('dim7')) {
    intervals.push(9);
  } else if (s.includes('maj7') || s.includes('maj9')) {
    intervals.push(11);
  } else if (s.includes('7') || s.includes('9') || s.includes('11') || s.includes('13')) {
    intervals.push(10);
  } else if (s.includes('6')) {
    intervals.push(9);
  }

  if (s.includes('add9') || s.includes('9')) {
    intervals.push(2);
  }

  const uniqueNotes = Array.from(
    new Set(intervals.map((semi) => scale[(parsed.pitchClass + semi) % 12]))
  );

  const leftHandBass =
    parsed.bassPitchClass !== undefined
      ? scale[parsed.bassPitchClass]
      : root;

  const voicingTip =
    parsed.bassPitchClass !== undefined
      ? `Slash inversion: hold ${leftHandBass} in LH, omit ${leftHandBass} from lowest RH thumb if muddy.`
      : `Play ${leftHandBass} octaves in LH; voice ${uniqueNotes.join('–')} smoothly in RH.`;

  return {
    chord: chordToken,
    leftHandBass,
    rightHandNotes: uniqueNotes,
    voicingTip,
  };
}

/**
 * Extracts bass guitar primary pedal/inversion note and fifth for a chord symbol.
 */
export function getBassGuidanceForChord(
  chordToken: string,
  preference: EnharmonicPreference = 'auto',
  keyContext?: string
): BassNoteInfo | null {
  const parsed = parseChord(chordToken);
  if (!parsed) return null;

  const useFlats = shouldUseFlats(preference, keyContext, parsed.pitchClass);
  const primaryPitch =
    parsed.bassPitchClass !== undefined
      ? parsed.bassPitchClass
      : parsed.pitchClass;

  const primaryBass = pitchClassToNote(primaryPitch, useFlats);
  const chordRoot = pitchClassToNote(parsed.pitchClass, useFlats);
  const fifthNote = pitchClassToNote((parsed.pitchClass + 7) % 12, useFlats);

  return {
    chord: chordToken,
    primaryBass,
    isSlashInversion: parsed.bassPitchClass !== undefined,
    chordRoot,
    fifthNote,
  };
}
