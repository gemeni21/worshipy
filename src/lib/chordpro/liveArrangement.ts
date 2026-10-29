import {
  exportSongToChordPro,
  formatSegmentsToBracketedLine,
  parseBracketedLineToSegments,
  parseChordPro,
  sanitizePlainText,
} from './chordPro.ts';
import {
  getSemitoneDistanceBetweenKeys,
  normalizeSemitones,
  parseKey,
  transposeSong,
} from '../music/transposition.ts';
import type { LiveSongArrangementOverride } from '../../types/live.ts';
import type { SongLine, SongRecord, SongSection } from '../../types/song.ts';

export const MAX_LIVE_ARRANGEMENT_CHORDPRO_LENGTH = 100_000;

/**
 * Resolves a base catalog/custom `SongRecord` with an active `LiveSongArrangementOverride`.
 * Preserves the base song's identity and `originalKey` so that live session `officialSemitones`
 * and individual musician capo/transposition offsets remain 100% consistent.
 */
export function resolveSongWithLiveOverride(
  baseSong: SongRecord,
  override?: LiveSongArrangementOverride | null
): SongRecord {
  if (!override || !override.chordPro || !override.chordPro.trim()) {
    return baseSong;
  }

  const parsed = parseChordPro(override.chordPro, {
    existingId: baseSong.id,
    existingCreatedAt: baseSong.createdAt,
  });

  if (!parsed.ok || !parsed.draft || parsed.draft.sections.length === 0) {
    return baseSong;
  }

  let effectiveSections = parsed.draft.sections;

  // Check if the ChordPro had an explicit {key: ...} directive that differs from baseSong.originalKey.
  // If so, normalize the sections back to baseSong.originalKey so `transposeSong(sourceSong, activeSemitones)`
  // never double-transposes.
  const hasExplicitKeyDirective = /^\s*\{\s*(?:key|k)\s*[:\s]/im.test(
    override.chordPro
  );
  if (
    hasExplicitKeyDirective &&
    parsed.draft.originalKey &&
    baseSong.originalKey
  ) {
    const draftKeyParsed = parseKey(parsed.draft.originalKey);
    const baseKeyParsed = parseKey(baseSong.originalKey);
    if (
      draftKeyParsed &&
      baseKeyParsed &&
      draftKeyParsed.pitchClass !== baseKeyParsed.pitchClass
    ) {
      const deltaToBase = getSemitoneDistanceBetweenKeys(
        parsed.draft.originalKey,
        baseSong.originalKey
      );
      if (deltaToBase !== 0) {
        const normalized = transposeSong(parsed.draft, deltaToBase, 'auto');
        effectiveSections = normalized.song.sections;
      }
    }
  }

  return {
    ...baseSong,
    title: parsed.draft.title || baseSong.title,
    subtitle: parsed.draft.subtitle ?? baseSong.subtitle,
    tempoBpm: parsed.draft.tempoBpm ?? baseSong.tempoBpm,
    timeSignature: parsed.draft.timeSignature ?? baseSong.timeSignature,
    sections: effectiveSections,
  };
}

/**
 * Converts a `SongRecord` that was edited while viewing at `displayedSemitones` offset
 * back into a canonical ChordPro string in `baseSong.originalKey` (semitones = 0).
 */
export function convertDisplayedSongToBaseChordPro(
  editedDisplayedSong: SongRecord,
  baseSong: SongRecord,
  displayedSemitones: number = 0
): string {
  const norm = normalizeSemitones(displayedSemitones);
  let songInBaseKey: SongRecord = {
    ...editedDisplayedSong,
    id: baseSong.id,
    slug: baseSong.slug,
    originalKey: baseSong.originalKey,
  };

  if (norm !== 0) {
    const reverseSemitones = normalizeSemitones(-norm);
    // Transpose from the displayed key back to baseSong.originalKey
    const displayedKeySong: SongRecord = {
      ...editedDisplayedSong,
      originalKey:
        transposeSong(baseSong, norm, 'auto').displayedKey ||
        baseSong.originalKey,
    };
    const reversed = transposeSong(displayedKeySong, reverseSemitones, 'auto');
    songInBaseKey = {
      ...reversed.song,
      id: baseSong.id,
      slug: baseSong.slug,
      originalKey: baseSong.originalKey,
    };
  }

  return exportSongToChordPro(songInBaseKey, { semitones: 0 });
}

/**
 * Replaces or removes a single chord token at `(sectionId, lineIndex, segmentIndex)` inside a `SongRecord`.
 * Returns a new immutable `SongRecord`.
 */
export function replaceChordInSongSectionLine(
  song: SongRecord,
  sectionId: string,
  lineIndex: number,
  segmentIndex: number,
  newChord: string
): SongRecord {
  const cleanChord = sanitizePlainText(newChord).trim();

  const nextSections: SongSection[] = song.sections.map((sec) => {
    if (sec.id !== sectionId) return sec;

    const nextLines: SongLine[] = sec.lines.map((line, lIdx) => {
      if (lIdx !== lineIndex) return line;

      const nextSegments = line.segments.map((seg, sIdx) => {
        if (sIdx !== segmentIndex) return seg;
        const updated = { ...seg };
        if (cleanChord) {
          updated.chord = cleanChord;
        } else {
          delete updated.chord;
        }
        return updated;
      });

      const hasAnyChord = nextSegments.some((s) => Boolean(s.chord && s.chord.trim()));
      const hasAnyLyric = nextSegments.some((s) => s.text.trim().length > 0);

      return {
        ...line,
        isInstrumental: hasAnyChord && !hasAnyLyric,
        segments: nextSegments,
      };
    });

    return {
      ...sec,
      lines: nextLines,
    };
  });

  return {
    ...song,
    sections: nextSections,
  };
}

/**
 * Updates a single line inside a section using inline bracketed `[Chord]lyric` notation
 * and optional line annotation/cue.
 */
export function updateLineInSongSection(
  song: SongRecord,
  sectionId: string,
  lineIndex: number,
  bracketedLineText: string,
  annotation?: string
): SongRecord {
  const parsedLine = parseBracketedLineToSegments(bracketedLineText);
  const cleanAnnotation = annotation !== undefined ? sanitizePlainText(annotation).trim() : undefined;

  const nextSections: SongSection[] = song.sections.map((sec) => {
    if (sec.id !== sectionId) return sec;

    const nextLines: SongLine[] = sec.lines.map((line, lIdx) => {
      if (lIdx !== lineIndex) return line;

      const updatedLine: SongLine = {
        ...line,
        isInstrumental: parsedLine.isInstrumental,
        segments: parsedLine.segments,
      };

      if (cleanAnnotation !== undefined) {
        if (cleanAnnotation) {
          updatedLine.annotation = cleanAnnotation;
        } else {
          delete updatedLine.annotation;
        }
      }

      return updatedLine;
    });

    return {
      ...sec,
      lines: nextLines,
    };
  });

  return {
    ...song,
    sections: nextSections,
  };
}

/**
 * Formats a `SongLine` into bracketed `[Chord]Lyric` text for quick editing.
 */
export function formatSongLineForQuickEdit(line: SongLine): string {
  return formatSegmentsToBracketedLine(line.segments);
}
