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
import type {
  ChordLyricSegment,
  SongLine,
  SongRecord,
  SongSection,
} from '../../types/song.ts';

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

/**
 * Splits a segment's lyric text into interactive word tokens (preserving exact character offsets
 * and trailing whitespace) so the leader can tap ANY word in the lyric line to drop a chord
 * directly above that word.
 */
export interface TappableLyricWordToken {
  word: string;
  trailingSpace: string;
  charOffset: number;
}

export function splitSegmentTextIntoTappableWords(
  text: string
): TappableLyricWordToken[] {
  if (!text) return [];
  const tokens: TappableLyricWordToken[] = [];
  const regex = /(\S+)(\s*)|(\s+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[1] !== undefined) {
      tokens.push({
        word: match[1],
        trailingSpace: match[2] ?? '',
        charOffset: match.index,
      });
    } else if (match[3] !== undefined) {
      tokens.push({
        word: '',
        trailingSpace: match[3],
        charOffset: match.index,
      });
    }
  }

  return tokens;
}

/**
 * Normalizes a list of `ChordLyricSegment[]` by merging adjacent segments where the second
 * segment has no chord (e.g., when a chord was removed from a split word), while keeping at
 * least one segment per line.
 */
export function normalizeLineSegments(
  segments: ChordLyricSegment[]
): ChordLyricSegment[] {
  const merged: ChordLyricSegment[] = [];

  for (const seg of segments) {
    const cleanChord = seg.chord?.trim() || undefined;
    const text = seg.text ?? '';

    if (!cleanChord && text === '' && merged.length > 0) {
      continue;
    }

    if (
      !cleanChord &&
      merged.length > 0 &&
      merged[merged.length - 1].text.length > 0
    ) {
      merged[merged.length - 1] = {
        ...merged[merged.length - 1],
        text: merged[merged.length - 1].text + text,
      };
    } else {
      merged.push({
        ...(cleanChord ? { chord: cleanChord } : {}),
        text,
      });
    }
  }

  return merged.length > 0 ? merged : [{ text: '' }];
}

/**
 * Inserts or replaces a chord at any character offset `charOffset` inside `(sectionId, lineIndex, segmentIndex)`.
 * - If `charOffset <= 0` (or segment text is empty), updates the chord on that segment directly.
 * - If `0 < charOffset < seg.text.length`, splits `seg` into two segments at `charOffset` and places `newChord`
 *   right above `seg.text.slice(charOffset)`!
 * - If `charOffset >= seg.text.length`, appends a new chord segment right after `seg`.
 */
export function insertChordAtLyricPositionInSong(
  song: SongRecord,
  sectionId: string,
  lineIndex: number,
  segmentIndex: number,
  charOffset: number,
  newChord: string
): SongRecord {
  const cleanChord = sanitizePlainText(newChord).trim();

  const nextSections: SongSection[] = song.sections.map((sec) => {
    if (sec.id !== sectionId) return sec;

    const nextLines: SongLine[] = sec.lines.map((line, lIdx) => {
      if (lIdx !== lineIndex) return line;

      const rawSegments: ChordLyricSegment[] = [];

      line.segments.forEach((seg, sIdx) => {
        if (sIdx !== segmentIndex) {
          rawSegments.push({ ...seg });
          return;
        }

        const text = seg.text ?? '';
        if (charOffset <= 0 || text.length === 0) {
          const updated: ChordLyricSegment = { text };
          if (cleanChord) {
            updated.chord = cleanChord;
          }
          rawSegments.push(updated);
        } else if (charOffset >= text.length) {
          rawSegments.push({ ...seg });
          if (cleanChord) {
            rawSegments.push({
              chord: cleanChord,
              text: '',
            });
          }
        } else {
          const beforeText = text.slice(0, charOffset);
          const afterText = text.slice(charOffset);
          rawSegments.push({
            ...(seg.chord ? { chord: seg.chord } : {}),
            text: beforeText,
          });
          rawSegments.push({
            ...(cleanChord ? { chord: cleanChord } : {}),
            text: afterText,
          });
        }
      });

      const nextSegments = normalizeLineSegments(rawSegments);
      const hasAnyChord = nextSegments.some((s) =>
        Boolean(s.chord && s.chord.trim())
      );
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
 * Appends a new chord token to the end of `(sectionId, lineIndex)` (e.g., adding a trailing turnaround chord
 * or adding another chord to an instrumental line).
 */
export function appendChordToSongSectionLine(
  song: SongRecord,
  sectionId: string,
  lineIndex: number,
  newChord: string
): SongRecord {
  const cleanChord = sanitizePlainText(newChord).trim();
  if (!cleanChord) return song;

  const nextSections: SongSection[] = song.sections.map((sec) => {
    if (sec.id !== sectionId) return sec;

    const nextLines: SongLine[] = sec.lines.map((line, lIdx) => {
      if (lIdx !== lineIndex) return line;

      const nextSegments: ChordLyricSegment[] = [
        ...line.segments.map((s) => ({ ...s })),
        { chord: cleanChord, text: '' },
      ];
      const normalized = normalizeLineSegments(nextSegments);
      const hasAnyChord = normalized.some((s) =>
        Boolean(s.chord && s.chord.trim())
      );
      const hasAnyLyric = normalized.some((s) => s.text.trim().length > 0);

      return {
        ...line,
        isInstrumental: hasAnyChord && !hasAnyLyric,
        segments: normalized,
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
 * Shifts (nudges) an existing chord at `(sectionId, lineIndex, segmentIndex)` one word left (`direction = 'left'`)
 * or one word right (`direction = 'right'`) across the lyric line, returning the updated `SongRecord`
 * and the new `segmentIndex` of the moved chord.
 */
export function nudgeChordByWordInSongSectionLine(
  song: SongRecord,
  sectionId: string,
  lineIndex: number,
  segmentIndex: number,
  direction: 'left' | 'right'
): { song: SongRecord; newSegmentIndex: number } {
  const sec = song.sections.find((s) => s.id === sectionId);
  const line = sec?.lines[lineIndex];
  if (!sec || !line) {
    return { song, newSegmentIndex: segmentIndex };
  }

  const targetSeg = line.segments[segmentIndex];
  if (!targetSeg || !targetSeg.chord) {
    return { song, newSegmentIndex: segmentIndex };
  }

  const chordToMove = targetSeg.chord;

  // Flatten line into a pure lyric string + array of { chord, flatOffset }
  let fullLyric = '';
  const chordPlacements: Array<{
    chord: string;
    flatOffset: number;
    originalSegIdx: number;
  }> = [];

  line.segments.forEach((seg, idx) => {
    if (seg.chord && seg.chord.trim()) {
      chordPlacements.push({
        chord: seg.chord.trim(),
        flatOffset: fullLyric.length,
        originalSegIdx: idx,
      });
    }
    fullLyric += seg.text ?? '';
  });

  const placementIdx = chordPlacements.findIndex(
    (p) => p.originalSegIdx === segmentIndex
  );
  if (placementIdx === -1) {
    return { song, newSegmentIndex: segmentIndex };
  }

  const currentOffset = chordPlacements[placementIdx].flatOffset;

  // Collect all word start boundaries in `fullLyric` plus end-of-line boundary
  const boundaries: number[] = [0];
  const wordRegex = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRegex.exec(fullLyric)) !== null) {
    if (!boundaries.includes(m.index)) {
      boundaries.push(m.index);
    }
  }
  if (!boundaries.includes(fullLyric.length)) {
    boundaries.push(fullLyric.length);
  }
  boundaries.sort((a, b) => a - b);

  let nextOffset = currentOffset;
  if (direction === 'left') {
    const prevBoundaries = boundaries.filter((b) => b < currentOffset);
    if (prevBoundaries.length > 0) {
      nextOffset = prevBoundaries[prevBoundaries.length - 1];
    }
  } else {
    const afterBoundaries = boundaries.filter((b) => b > currentOffset);
    if (afterBoundaries.length > 0) {
      nextOffset = afterBoundaries[0];
    }
  }

  if (nextOffset === currentOffset) {
    return { song, newSegmentIndex: segmentIndex };
  }

  chordPlacements[placementIdx].flatOffset = nextOffset;
  // Sort placements by flatOffset
  chordPlacements.sort((a, b) => a.flatOffset - b.flatOffset);

  // Reconstruct bracketed line from `fullLyric` and `chordPlacements`
  let rebuiltBracketed = '';
  let cursor = 0;
  for (const p of chordPlacements) {
    const clamped = Math.max(cursor, Math.min(p.flatOffset, fullLyric.length));
    if (clamped > cursor) {
      rebuiltBracketed += fullLyric.slice(cursor, clamped);
      cursor = clamped;
    }
    rebuiltBracketed += `[${p.chord}]`;
  }
  if (cursor < fullLyric.length) {
    rebuiltBracketed += fullLyric.slice(cursor);
  }

  const updatedSong = updateLineInSongSection(
    song,
    sectionId,
    lineIndex,
    rebuiltBracketed,
    line.annotation
  );

  const updatedLine = updatedSong.sections
    .find((s) => s.id === sectionId)
    ?.lines[lineIndex];
  let newSegIdx = 0;
  if (updatedLine) {
    let runningLen = 0;
    for (let i = 0; i < updatedLine.segments.length; i++) {
      const s = updatedLine.segments[i];
      if (s.chord === chordToMove && runningLen === nextOffset) {
        newSegIdx = i;
        break;
      }
      runningLen += (s.text ?? '').length;
    }
  }

  return { song: updatedSong, newSegmentIndex: newSegIdx };
}
