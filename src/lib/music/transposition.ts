import type {
  ChordLyricSegment,
  EnharmonicPreference,
  SongLine,
  SongRecord,
  SongSection,
} from '../../types/song.ts';

export interface ParsedChord {
  root: string;
  pitchClass: number;
  suffix: string;
  bass?: string;
  bassPitchClass?: number;
}

export interface KeyOption {
  /** Display key name (e.g., "G", "Bb", "F#m") */
  key: string;
  /** Pitch class 0-11 */
  pitchClass: number;
  /** True if minor key */
  isMinor: boolean;
  /** Semitone offset relative to a reference pitch class */
  semitonesFromOriginal: number;
}

export interface TransposeOptions {
  /** Enharmonic spelling preference: 'auto' (key-aware), 'sharp', or 'flat' */
  preference?: EnharmonicPreference;
  /** Optional original or target key context to ensure consistent chart-wide spelling */
  targetKeyContext?: string;
}

const NOTE_TO_PITCH_CLASS: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

export const SHARP_SCALE: readonly string[] = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

export const FLAT_SCALE: readonly string[] = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

/** Canonical major keys for each pitch class (0-11) when preference is 'auto' */
export const CANONICAL_MAJOR_KEYS: readonly string[] = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

/** Canonical minor keys for each pitch class (0-11) when preference is 'auto' */
export const CANONICAL_MINOR_KEYS: readonly string[] = [
  'Cm',
  'C#m',
  'Dm',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'Bbm',
  'Bm',
];

/** Keys that naturally prefer flat enharmonic spellings in standard music theory */
const FLAT_PREFERRING_KEYS = new Set<string>([
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
  'Dm',
  'Gm',
  'Cm',
  'Fm',
  'Bbm',
  'Ebm',
  'Abm',
]);

/** Common no-chord markings that must never be transposed */
const NO_CHORD_TOKENS = new Set<string>([
  'N.C.',
  'N.C',
  'NC',
  'n.c.',
  'nc',
  '-',
  '/',
  '|',
  '||',
]);

/**
 * Strict validation for musical chord suffixes.
 * Prevents normal lyric words starting with A-G (like "Grace", "Bridge", "Chorus", "Amazing")
 * from being misidentified as chords.
 */
const VALID_CHORD_SUFFIX_REGEX =
  /^(?:(?:m|min|maj|M|dim|aug|sus(?:2|4)?|add(?:2|4|9|11|13)?|\+|°|ø)?(?:6\/9|13|11|9|7|6|5|4|2)?(?:maj(?:7|9|11|13)?|min(?:7|9|11|13)?|m(?:6|7|9|11|13)?|sus(?:2|4)?|dim(?:7)?|aug(?:7)?|add(?:2|4|9|11|13)|(?:b|#)(?:5|9|11|13)|no(?:3|5)|\((?:add(?:2|4|9|11|13)|(?:b|#)(?:5|9|11|13)|no(?:3|5)|maj7|sus(?:2|4)?|[b#0-9,\s]+)\))*)$/;

const ROOT_PREFIX_REGEX = /^([A-G][#b]?)(.*)$/;
const SLASH_BASS_REGEX = /^(.*)\/([A-G][#b]?)$/;

/**
 * Normalizes any integer semitone offset into the range [0, 11].
 */
export function normalizeSemitones(semitones: number): number {
  if (!Number.isFinite(semitones)) return 0;
  const rounded = Math.round(semitones);
  return ((rounded % 12) + 12) % 12;
}

/**
 * Normalizes a semitone offset into a signed range [-6, +6] for compact UI display.
 */
export function formatSignedSemitones(semitones: number): string {
  const norm = normalizeSemitones(semitones);
  if (norm === 0) return '0';
  const signed = norm > 6 ? norm - 12 : norm;
  return signed > 0 ? `+${signed}` : `${signed}`;
}

/**
 * Checks whether a suffix string is a valid musical chord suffix.
 */
export function isValidChordSuffix(suffix: string): boolean {
  if (suffix === '') return true;
  return VALID_CHORD_SUFFIX_REGEX.test(suffix);
}

/**
 * Parses a single chord token into its root, pitch class, quality/suffix, and optional slash bass note.
 * Returns null if the token is a no-chord marker, a normal word, or malformed.
 */
export function parseChord(token: string): ParsedChord | null {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (!trimmed || NO_CHORD_TOKENS.has(trimmed)) {
    return null;
  }

  let mainPart = trimmed;
  let bass: string | undefined;
  let bassPitchClass: number | undefined;

  const slashMatch = trimmed.match(SLASH_BASS_REGEX);
  if (slashMatch) {
    mainPart = slashMatch[1];
    bass = slashMatch[2];
    bassPitchClass = NOTE_TO_PITCH_CLASS[bass];
    if (bassPitchClass === undefined) {
      return null;
    }
  }

  const rootMatch = mainPart.match(ROOT_PREFIX_REGEX);
  if (!rootMatch) {
    return null;
  }

  const root = rootMatch[1];
  const suffix = rootMatch[2];
  const pitchClass = NOTE_TO_PITCH_CLASS[root];

  if (pitchClass === undefined) {
    return null;
  }

  if (!isValidChordSuffix(suffix)) {
    return null;
  }

  return {
    root,
    pitchClass,
    suffix,
    ...(bass !== undefined ? { bass, bassPitchClass } : {}),
  };
}

/**
 * Parses a musical key string (e.g. "G", "Bb", "F#m", "Amin") into its pitch class and mode.
 */
export function parseKey(keyStr: string): {
  root: string;
  pitchClass: number;
  isMinor: boolean;
} | null {
  if (!keyStr || typeof keyStr !== 'string') return null;
  const trimmed = keyStr.trim();
  const match = trimmed.match(/^([A-G][#b]?)(m|min)?$/);
  if (!match) return null;

  const root = match[1];
  const isMinor = Boolean(match[2]);
  const pitchClass = NOTE_TO_PITCH_CLASS[root];
  if (pitchClass === undefined) return null;

  return { root, pitchClass, isMinor };
}

/**
 * Resolves whether to use flat or sharp spellings given a preference and optional key context.
 */
export function shouldUseFlats(
  preference: EnharmonicPreference = 'auto',
  keyContext?: string,
  fallbackPitchClass?: number,
  isMinorFallback = false
): boolean {
  if (preference === 'flat') return true;
  if (preference === 'sharp') return false;

  if (keyContext) {
    const trimmed = keyContext.trim();
    if (FLAT_PREFERRING_KEYS.has(trimmed)) {
      return true;
    }
    const parsedKey = parseKey(trimmed);
    if (parsedKey) {
      const canonical = parsedKey.isMinor
        ? CANONICAL_MINOR_KEYS[parsedKey.pitchClass]
        : CANONICAL_MAJOR_KEYS[parsedKey.pitchClass];
      return FLAT_PREFERRING_KEYS.has(canonical);
    }
  }

  if (fallbackPitchClass !== undefined) {
    const canonical = isMinorFallback
      ? CANONICAL_MINOR_KEYS[fallbackPitchClass]
      : CANONICAL_MAJOR_KEYS[fallbackPitchClass];
    return FLAT_PREFERRING_KEYS.has(canonical);
  }

  return false;
}

/**
 * Formats a pitch class (0-11) into a note name using either flat or sharp spelling.
 */
export function pitchClassToNote(pitchClass: number, useFlats: boolean): string {
  const norm = normalizeSemitones(pitchClass);
  return useFlats ? FLAT_SCALE[norm] : SHARP_SCALE[norm];
}

/**
 * Transposes a musical key string (e.g. "G" -> "A", "F#m" -> "Gm") by the given semitones.
 */
export function transposeKey(
  originalKey: string,
  semitones: number,
  preference: EnharmonicPreference = 'auto'
): string {
  const parsed = parseKey(originalKey);
  if (!parsed) return originalKey;

  const normSemitones = normalizeSemitones(semitones);
  if (normSemitones === 0 && preference === 'auto') {
    return originalKey.trim();
  }

  const targetPitchClass = (parsed.pitchClass + normSemitones) % 12;

  if (preference === 'flat') {
    return `${FLAT_SCALE[targetPitchClass]}${parsed.isMinor ? 'm' : ''}`;
  }
  if (preference === 'sharp') {
    return `${SHARP_SCALE[targetPitchClass]}${parsed.isMinor ? 'm' : ''}`;
  }

  return parsed.isMinor
    ? CANONICAL_MINOR_KEYS[targetPitchClass]
    : CANONICAL_MAJOR_KEYS[targetPitchClass];
}

/**
 * Computes the minimum semitone offset [0..11] needed to get from `fromKey` to `toKey`.
 */
export function getSemitoneDistanceBetweenKeys(
  fromKey: string,
  toKey: string
): number {
  const fromParsed = parseKey(fromKey);
  const toParsed = parseKey(toKey);
  if (!fromParsed || !toParsed) return 0;
  return normalizeSemitones(toParsed.pitchClass - fromParsed.pitchClass);
}

/**
 * Returns all 12 destination key choices for a song, preserving its major/minor quality
 * and indicating the semitone offset from the song's original key.
 */
export function getDestinationKeyOptions(
  originalKey: string,
  preference: EnharmonicPreference = 'auto'
): KeyOption[] {
  const parsed = parseKey(originalKey);
  const isMinor = parsed?.isMinor ?? false;
  const basePitchClass = parsed?.pitchClass ?? 0;

  return Array.from({ length: 12 }, (_, semitoneOffset) => {
    const pitchClass = (basePitchClass + semitoneOffset) % 12;
    let keyLabel: string;

    if (semitoneOffset === 0 && preference === 'auto' && parsed) {
      keyLabel = originalKey.trim();
    } else if (preference === 'flat') {
      keyLabel = `${FLAT_SCALE[pitchClass]}${isMinor ? 'm' : ''}`;
    } else if (preference === 'sharp') {
      keyLabel = `${SHARP_SCALE[pitchClass]}${isMinor ? 'm' : ''}`;
    } else {
      keyLabel = isMinor
        ? CANONICAL_MINOR_KEYS[pitchClass]
        : CANONICAL_MAJOR_KEYS[pitchClass];
    }

    return {
      key: keyLabel,
      pitchClass,
      isMinor,
      semitonesFromOriginal: semitoneOffset,
    };
  });
}

/**
 * Transposes a single chord symbol (e.g., "D/F#", "Gmaj7", "Bb", "Am7b5") by `semitones`.
 * Preserves leading/trailing whitespace if any, and leaves non-chord markings ("N.C.")
 * or unrecognized tokens completely untouched.
 */
export function transposeChord(
  chordToken: string,
  semitones: number,
  options: TransposeOptions = {}
): string {
  if (!chordToken || typeof chordToken !== 'string') return chordToken;

  const normSemitones = normalizeSemitones(semitones);
  const preference = options.preference ?? 'auto';

  if (normSemitones === 0 && preference === 'auto') {
    return chordToken;
  }

  const leadingSpaceMatch = chordToken.match(/^\s*/);
  const trailingSpaceMatch = chordToken.match(/\s*$/);
  const leadingSpace = leadingSpaceMatch ? leadingSpaceMatch[0] : '';
  const trailingSpace = trailingSpaceMatch ? trailingSpaceMatch[0] : '';
  const trimmed = chordToken.trim();

  if (!trimmed || NO_CHORD_TOKENS.has(trimmed)) {
    return chordToken;
  }

  const parsed = parseChord(trimmed);
  if (!parsed) {
    // Unknown or non-chord token: preserve safely unchanged
    return chordToken;
  }

  const newRootPitch = (parsed.pitchClass + normSemitones) % 12;
  const isMinorChord =
    parsed.suffix.startsWith('m') && !parsed.suffix.startsWith('maj');

  const useFlats = shouldUseFlats(
    preference,
    options.targetKeyContext,
    newRootPitch,
    isMinorChord
  );

  const newRoot = pitchClassToNote(newRootPitch, useFlats);

  let newBassPart = '';
  if (parsed.bassPitchClass !== undefined) {
    const newBassPitch = (parsed.bassPitchClass + normSemitones) % 12;
    const newBass = pitchClassToNote(newBassPitch, useFlats);
    newBassPart = `/${newBass}`;
  }

  return `${leadingSpace}${newRoot}${parsed.suffix}${newBassPart}${trailingSpace}`;
}

/**
 * Returns a new derived SongRecord with all structured chord tokens transposed
 * by `semitones`. Never mutates the original source SongRecord, lyrics, section
 * headings, or annotations.
 */
export function transposeSong(
  song: SongRecord,
  semitones: number,
  preference: EnharmonicPreference = 'auto'
): {
  song: SongRecord;
  displayedKey: string;
  normalizedSemitones: number;
} {
  const normalizedSemitones = normalizeSemitones(semitones);
  const displayedKey = transposeKey(
    song.originalKey,
    normalizedSemitones,
    preference
  );

  if (normalizedSemitones === 0 && preference === 'auto') {
    return {
      song,
      displayedKey: song.originalKey,
      normalizedSemitones: 0,
    };
  }

  const transposedSections: SongSection[] = song.sections.map((section) => ({
    ...section,
    lines: section.lines.map((line): SongLine => ({
      ...line,
      segments: line.segments.map((segment): ChordLyricSegment => {
        if (!segment.chord) {
          return { ...segment };
        }
        return {
          ...segment,
          chord: transposeChord(segment.chord, normalizedSemitones, {
            preference,
            targetKeyContext: displayedKey,
          }),
        };
      }),
    })),
  }));

  return {
    song: {
      ...song,
      sections: transposedSections,
    },
    displayedKey,
    normalizedSemitones,
  };
}
