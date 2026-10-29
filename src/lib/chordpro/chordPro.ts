import {
  CANONICAL_MAJOR_KEYS,
  CANONICAL_MINOR_KEYS,
  parseChord,
  parseKey,
  transposeChord,
  transposeSong,
} from '../music/transposition.ts';
import { getAllSongs, isBuiltInCatalogSongId } from '../catalog/songCatalog.ts';
import type {
  ChordLyricSegment,
  ContentStatus,
  SectionType,
  SongCategory,
  SongCategoryId,
  SongLanguage,
  SongRecord,
  SongSection,
} from '../../types/song.ts';

export const MAX_CHORDPRO_SIZE_BYTES = 262_144; // 256 KB

export const SUPPORTED_CHORDPRO_EXTENSIONS = [
  '.cho',
  '.chopro',
  '.crd',
  '.chord',
  '.pro',
  '.txt',
] as const;

export const LANGUAGE_PRESETS: readonly SongLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
  { code: 'en-fil', label: 'Bilingual (English / Filipino)' },
  { code: 'ceb', label: 'Cebuano' },
  { code: 'ilo', label: 'Ilocano' },
  { code: 'es', label: 'Spanish' },
  { code: 'other', label: 'Other' },
] as const;

export const CATEGORY_PRESETS: readonly SongCategory[] = [
  { id: 'contemporary-worship', label: 'Contemporary Worship' },
  { id: 'filipino-worship', label: 'Filipino Worship' },
  { id: 'hymn', label: 'Traditional Hymn' },
  { id: 'gospel', label: 'Gospel & Praise' },
  { id: 'other', label: 'Other' },
] as const;

export const SECTION_TYPE_PRESETS: readonly {
  type: SectionType;
  defaultLabel: string;
}[] = [
  { type: 'intro', defaultLabel: 'Intro' },
  { type: 'verse', defaultLabel: 'Verse 1' },
  { type: 'pre-chorus', defaultLabel: 'Pre-Chorus' },
  { type: 'chorus', defaultLabel: 'Chorus' },
  { type: 'bridge', defaultLabel: 'Bridge' },
  { type: 'tag', defaultLabel: 'Tag' },
  { type: 'instrumental', defaultLabel: 'Instrumental' },
  { type: 'interlude', defaultLabel: 'Interlude' },
  { type: 'outro', defaultLabel: 'Outro' },
  { type: 'other', defaultLabel: 'Custom Section' },
] as const;

const ALLOWED_NO_CHORD = new Set([
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

export interface ChordWarning {
  sectionIndex: number;
  sectionLabel: string;
  lineIndex: number;
  token: string;
  message: string;
}

export interface CustomSongValidationResult {
  valid: boolean;
  errors: string[];
  chordWarnings: ChordWarning[];
}

export interface ChordProParseResult {
  ok: boolean;
  error?: string;
  draft?: SongRecord;
  warnings: string[];
  unsupportedDirectives: string[];
}

export interface ChordProExportOptions {
  /** Optional semitone transposition; defaults to 0 (exports stored original chart) */
  semitones?: number;
}

/**
 * Sanitizes plain text input by normalizing line endings and removing non-printable control characters.
 * Never strips normal Unicode letters, punctuation, or musical symbols.
 */
export function sanitizePlainText(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/**
 * Generates a stable unique ID for a custom song, guaranteed never to collide with built-in catalog IDs.
 */
export function createCustomSongId(): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `custom-song-${randomPart}`;
}

/**
 * Generates a unique, URL-safe slug for a custom song that never collides with built-in catalog slugs
 * or other custom songs.
 */
export function createCustomSongSlug(
  title: string,
  songId: string,
  existingSlugs?: Set<string>
): string {
  const baseSlug = sanitizePlainText(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  const safeBase = baseSlug || 'custom-song';
  const catalogSlugs = new Set(getAllSongs().map((s) => s.slug));
  const shortSuffix = songId
    .replace(/^custom-song-/, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, 6) || 'local';

  let candidate = safeBase;
  if (
    catalogSlugs.has(candidate) ||
    (existingSlugs && existingSlugs.has(candidate))
  ) {
    candidate = `${safeBase}-${shortSuffix}`;
  }

  let counter = 2;
  while (
    catalogSlugs.has(candidate) ||
    (existingSlugs && existingSlugs.has(candidate))
  ) {
    candidate = `${safeBase}-${shortSuffix}-${counter}`;
    counter += 1;
  }

  return candidate;
}

/**
 * Checks whether a chord token is a recognized musical chord or allowed no-chord marker.
 */
export function isRecognizedChordToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (ALLOWED_NO_CHORD.has(trimmed)) return true;
  return parseChord(trimmed) !== null;
}

/**
 * Parses a single line with inline square-bracket chords (e.g. `[G]We gather in Your [D/F#]light`)
 * into structured `ChordLyricSegment[]` plus non-destructive warnings for malformed brackets or tokens.
 */
export function parseBracketedLineToSegments(
  rawLine: string,
  lineNumber?: number
): {
  segments: ChordLyricSegment[];
  isInstrumental: boolean;
  warnings: string[];
} {
  const line = sanitizePlainText(rawLine).replace(/\n/g, '');
  const warnings: string[] = [];
  const linePrefix = lineNumber !== undefined ? `Line ${lineNumber}: ` : '';

  if (line === '') {
    return {
      segments: [{ text: '' }],
      isInstrumental: false,
      warnings,
    };
  }

  const segments: ChordLyricSegment[] = [];
  let cursor = 0;
  let pendingChord: string | undefined;

  while (cursor < line.length) {
    const openIdx = line.indexOf('[', cursor);

    if (openIdx === -1) {
      const remainingText = line.slice(cursor);
      if (pendingChord !== undefined || remainingText.length > 0 || segments.length === 0) {
        segments.push({
          ...(pendingChord !== undefined ? { chord: pendingChord } : {}),
          text: remainingText,
        });
        pendingChord = undefined;
      }
      break;
    }

    // Text before '['
    if (openIdx > cursor) {
      const textBefore = line.slice(cursor, openIdx);
      segments.push({
        ...(pendingChord !== undefined ? { chord: pendingChord } : {}),
        text: textBefore,
      });
      pendingChord = undefined;
    } else if (pendingChord !== undefined) {
      // Consecutive chord brackets like `[G][D/F#]`
      segments.push({
        chord: pendingChord,
        text: '',
      });
      pendingChord = undefined;
    }

    const closeIdx = line.indexOf(']', openIdx + 1);
    if (closeIdx === -1) {
      // Unclosed '[' bracket: warn and preserve remaining text safely
      const rawFragment = line.slice(openIdx);
      warnings.push(
        `${linePrefix}Unclosed chord bracket "${rawFragment}". Preserved as lyric text.`
      );
      segments.push({
        text: rawFragment,
      });
      break;
    }

    // Check if there is another '[' before ']' (e.g. `[G [D]word`)
    const nestedOpenIdx = line.indexOf('[', openIdx + 1);
    if (nestedOpenIdx !== -1 && nestedOpenIdx < closeIdx) {
      const malformedChunk = line.slice(openIdx, nestedOpenIdx);
      warnings.push(
        `${linePrefix}Unclosed chord bracket "${malformedChunk}". Preserved as lyric text.`
      );
      segments.push({
        text: malformedChunk,
      });
      cursor = nestedOpenIdx;
      continue;
    }

    const chordToken = line.slice(openIdx + 1, closeIdx).trim();
    if (!chordToken) {
      warnings.push(`${linePrefix}Empty chord brackets "[]" ignored.`);
    } else {
      if (!isRecognizedChordToken(chordToken)) {
        warnings.push(
          `${linePrefix}Unrecognized chord token "[${chordToken}]" — kept in chart, but it will not transpose until corrected.`
        );
      }
      pendingChord = chordToken;
    }

    cursor = closeIdx + 1;
    if (cursor >= line.length && pendingChord !== undefined) {
      segments.push({
        chord: pendingChord,
        text: '',
      });
      pendingChord = undefined;
    }
  }

  if (segments.length === 0) {
    segments.push({ text: '' });
  }

  const hasAnyChord = segments.some((s) => Boolean(s.chord && s.chord.trim()));
  const hasAnyLyric = segments.some((s) => s.text.trim().length > 0);
  const isInstrumental = hasAnyChord && !hasAnyLyric;

  return {
    segments,
    isInstrumental,
    warnings,
  };
}

/**
 * Formats structured `ChordLyricSegment[]` back into a single bracketed ChordPro line
 * (e.g. `[G]We gather in Your [D/F#]light`).
 */
export function formatSegmentsToBracketedLine(
  segments: readonly ChordLyricSegment[]
): string {
  if (!segments || segments.length === 0) return '';

  const isChordOnly =
    segments.some((s) => Boolean(s.chord && s.chord.trim())) &&
    segments.every((s) => s.text.trim() === '');

  if (isChordOnly) {
    return segments
      .map((seg) => (seg.chord ? `[${seg.chord.trim()}]` : ''))
      .filter(Boolean)
      .join(' ');
  }

  return segments
    .map((seg) => {
      const chordPart =
        seg.chord && seg.chord.trim() ? `[${seg.chord.trim()}]` : '';
      return `${chordPart}${seg.text ?? ''}`;
    })
    .join('');
}

/**
 * Inserts a `[Chord]` token at the specified cursor index inside a bracketed line string.
 */
export function insertChordAtCursor(
  lineText: string,
  cursorIndex: number,
  chordToken: string
): { nextText: string; nextCursor: number } {
  const trimmedChord = chordToken.trim();
  if (!trimmedChord) {
    return { nextText: lineText, nextCursor: cursorIndex };
  }

  const safeIndex = Math.max(0, Math.min(cursorIndex, lineText.length));
  const insertion = `[${trimmedChord}]`;
  const nextText =
    lineText.slice(0, safeIndex) + insertion + lineText.slice(safeIndex);
  return {
    nextText,
    nextCursor: safeIndex + insertion.length,
  };
}

/**
 * Returns common diatonic worship chords for a given key so musicians can insert chords with one tap.
 */
export function getSuggestedChordsForKey(keyStr: string): string[] {
  const parsed = parseKey(keyStr || 'C');
  const baseKey = parsed ? keyStr : 'C';
  const isMinor = parsed?.isMinor ?? false;

  // Relative scale degrees in semitones
  if (!isMinor) {
    const I = transposeChord('C', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const ii = transposeChord('Dm', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const ii7 = transposeChord('Dm7', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const IOver3 = transposeChord('C/E', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const IV = transposeChord('F', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const IVadd9 = transposeChord('Fadd9', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const V = transposeChord('G', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const Vsus4 = transposeChord('Gsus4', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const VOver7 = transposeChord('G/B', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const vi = transposeChord('Am', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    const vi7 = transposeChord('Am7', parsed?.pitchClass ?? 0, {
      targetKeyContext: baseKey,
    });
    return Array.from(
      new Set([I, IV, V, vi, ii, vi7, ii7, IOver3, VOver7, IVadd9, Vsus4])
    );
  } else {
    const semitonesFromAm = ((parsed?.pitchClass ?? 9) - 9 + 12) % 12;
    const i = transposeChord('Am', semitonesFromAm, {
      targetKeyContext: baseKey,
    });
    const i7 = transposeChord('Am7', semitonesFromAm, {
      targetKeyContext: baseKey,
    });
    const III = transposeChord('C', semitonesFromAm, {
      targetKeyContext: baseKey,
    });
    const iv = transposeChord('Dm7', semitonesFromAm, {
      targetKeyContext: baseKey,
    });
    const v = transposeChord('Em7', semitonesFromAm, {
      targetKeyContext: baseKey,
    });
    const V = transposeChord('E7', semitonesFromAm, {
      targetKeyContext: baseKey,
    });
    const VI = transposeChord('F', semitonesFromAm, {
      targetKeyContext: baseKey,
    });
    const VII = transposeChord('G', semitonesFromAm, {
      targetKeyContext: baseKey,
    });
    return Array.from(new Set([i, VI, III, VII, iv, i7, v, V]));
  }
}

/**
 * Validates a custom song draft before saving.
 * Checks required title and structural validity, and returns non-destructive warnings for any unrecognized chord tokens.
 */
export function validateCustomSongDraft(
  song: Partial<SongRecord>
): CustomSongValidationResult {
  const errors: string[] = [];
  const chordWarnings: ChordWarning[] = [];

  if (!song.title || typeof song.title !== 'string' || !song.title.trim()) {
    errors.push('Song title is required.');
  }

  if (song.originalKey && song.originalKey.trim() !== '') {
    if (!parseKey(song.originalKey.trim())) {
      errors.push(
        `Original key "${song.originalKey}" is not a recognized key (examples: C, G, D, Bb, F#m, Am).`
      );
    }
  }

  if (song.tempoBpm !== undefined && song.tempoBpm !== null) {
    if (
      !Number.isFinite(song.tempoBpm) ||
      song.tempoBpm < 20 ||
      song.tempoBpm > 320
    ) {
      errors.push('Tempo BPM must be a reasonable number between 20 and 320.');
    }
  }

  if (song.capo !== undefined && song.capo !== null) {
    if (
      !Number.isInteger(song.capo) ||
      song.capo < 0 ||
      song.capo > 12
    ) {
      errors.push('Capo must be a whole fret number between 0 and 12.');
    }
  }

  if (!Array.isArray(song.sections) || song.sections.length === 0) {
    errors.push('Add at least one song section (such as Verse 1 or Chorus).');
  } else {
    song.sections.forEach((sec, secIdx) => {
      const label = sec.label?.trim() || `Section ${secIdx + 1}`;
      if (!sec.label || !sec.label.trim()) {
        errors.push(`Section ${secIdx + 1} needs a section label.`);
      }
      if (!Array.isArray(sec.lines) || sec.lines.length === 0) {
        errors.push(`Section "${label}" must contain at least one line.`);
      } else {
        sec.lines.forEach((line, lineIdx) => {
          if (!Array.isArray(line.segments) || line.segments.length === 0) {
            errors.push(
              `Section "${label}", line ${lineIdx + 1} has no content segments.`
            );
          } else {
            line.segments.forEach((seg) => {
              if (seg.chord && seg.chord.trim()) {
                const token = seg.chord.trim();
                if (!isRecognizedChordToken(token)) {
                  chordWarnings.push({
                    sectionIndex: secIdx,
                    sectionLabel: label,
                    lineIndex: lineIdx,
                    token,
                    message: `Section "${label}" (Line ${
                      lineIdx + 1
                    }): "${token}" is not a recognized chord symbol. It will be displayed as written but will not transpose.`,
                  });
                }
              }
            });
          }
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    chordWarnings,
  };
}

/**
 * Infers a `SectionType` from a section label or directive name.
 */
export function inferSectionType(rawLabel: string): SectionType {
  const lower = rawLabel.trim().toLowerCase();
  if (lower.startsWith('intro') || lower.startsWith('panimula')) return 'intro';
  if (
    lower.startsWith('pre-chorus') ||
    lower.startsWith('pre chorus') ||
    lower.startsWith('prechorus')
  ) {
    return 'pre-chorus';
  }
  if (lower.startsWith('chorus') || lower.startsWith('koro') || lower === 'refrain') {
    return 'chorus';
  }
  if (lower.startsWith('verse') || lower.startsWith('talata')) return 'verse';
  if (lower.startsWith('bridge') || lower.startsWith('tulay')) return 'bridge';
  if (lower.startsWith('tag') || lower.startsWith('coda')) return 'tag';
  if (lower.startsWith('interlude') || lower.startsWith('turnaround')) {
    return 'interlude';
  }
  if (lower.startsWith('instrumental') || lower.startsWith('solo')) {
    return 'instrumental';
  }
  if (lower.startsWith('outro') || lower.startsWith('ending')) return 'outro';
  return 'other';
}

function isStandaloneSectionHeading(trimmedLine: string): {
  type: SectionType;
  label: string;
} | null {
  // Match lines like `[Verse 1]`, `[Chorus]`, `[Bridge]`, `[Intro]`, `[Outro]` or `Verse 1:`, `Chorus:`
  const bracketHeading = trimmedLine.match(/^\[([A-Za-z][A-Za-z0-9\s\-()#/]{1,28})\]$/);
  if (bracketHeading) {
    const inner = bracketHeading[1].trim();
    if (!isRecognizedChordToken(inner)) {
      const inferred = inferSectionType(inner);
      if (
        inferred !== 'other' ||
        /^(verse|chorus|bridge|intro|outro|pre-?chorus|tag|interlude|instrumental|koro|talata|tulay|refrain|coda|v\d+|c\d+)\b/i.test(
          inner
        )
      ) {
        return { type: inferred, label: inner };
      }
    }
  }

  const colonHeading = trimmedLine.match(
    /^(Intro|Verse(?:\s+\d+)?|Pre-?Chorus(?:\s+\d+)?|Chorus(?:\s+\d+)?|Bridge(?:\s+\d+)?|Tag(?:\s*\/\s*Vamp|\s+\d+)?|Vamp(?:\s+\d+)?|Spontaneous(?:\s+Tag|\s+Bridge|\s+Worship)?|Interlude(?:\s+\d+)?|Instrumental(?:\s+\d+)?|Outro|Koro|Talata(?:\s+\d+)?|Tulay)(?:\s*\([^)]+\))?:$/i
  );
  if (colonHeading) {
    const label = colonHeading[1].trim();
    return { type: inferSectionType(label), label };
  }

  return null;
}

/**
 * Parses a ChordPro text document into a structured `SongRecord` draft, along with
 * any validation warnings and unsupported directive notices.
 */
export function parseChordPro(
  rawContent: string,
  options?: { fileName?: string; existingId?: string; existingCreatedAt?: string }
): ChordProParseResult {
  if (typeof rawContent !== 'string') {
    return {
      ok: false,
      error: 'ChordPro content must be a text string.',
      warnings: [],
      unsupportedDirectives: [],
    };
  }

  const byteLength =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(rawContent).length
      : rawContent.length;

  if (byteLength > MAX_CHORDPRO_SIZE_BYTES) {
    return {
      ok: false,
      error: `File exceeds the maximum allowed ChordPro size of ${Math.round(
        MAX_CHORDPRO_SIZE_BYTES / 1024
      )} KB.`,
      warnings: [],
      unsupportedDirectives: [],
    };
  }

  const sanitized = sanitizePlainText(rawContent);
  if (!sanitized.trim()) {
    return {
      ok: false,
      error: 'The ChordPro input is empty. Paste or select a file containing song lyrics or chords.',
      warnings: [],
      unsupportedDirectives: [],
    };
  }

  const warnings: string[] = [];
  const unsupportedDirectives: string[] = [];
  const sourceNotesParts: string[] = [];
  const writers: string[] = [];

  let title = '';
  let subtitle = '';
  let artist = '';
  let originalKey = '';
  let tempoBpm: number | undefined;
  let timeSignature = '';
  let capo: number | undefined;
  let attribution = '';
  let rightsNotes = '';
  let language: SongLanguage = { code: 'en', label: 'English' };
  let category: SongCategory = {
    id: 'contemporary-worship',
    label: 'Contemporary Worship',
  };

  const sections: SongSection[] = [];
  let currentSection: SongSection | null = null;
  let sectionCounter = 0;
  let verseCounter = 0;

  const ensureSection = (
    type: SectionType = 'verse',
    explicitLabel?: string
  ): SongSection => {
    if (currentSection && !explicitLabel) {
      return currentSection;
    }
    sectionCounter += 1;
    let label = explicitLabel?.trim();
    if (!label) {
      if (type === 'verse') {
        verseCounter += 1;
        label = `Verse ${verseCounter}`;
      } else {
        const preset = SECTION_TYPE_PRESETS.find((p) => p.type === type);
        label = preset ? preset.defaultLabel : `Section ${sectionCounter}`;
      }
    }
    const created: SongSection = {
      id: `sec-${sectionCounter}`,
      type,
      label,
      lines: [],
    };
    sections.push(created);
    currentSection = created;
    return created;
  };

  const rawLines = sanitized.split('\n');

  for (let i = 0; i < rawLines.length; i += 1) {
    const lineNum = i + 1;
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    // Handle '#' ChordPro source comments
    if (trimmed.startsWith('#')) {
      const commentBody = trimmed.slice(1).trim();
      if (commentBody) {
        sourceNotesParts.push(commentBody);
      }
      continue;
    }

    // Handle '{...}' ChordPro directives
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1).trim();
      const colonPos = inner.indexOf(':');
      const spacePos = inner.indexOf(' ');
      let rawDirective = inner;
      let rawValue = '';

      if (colonPos !== -1) {
        rawDirective = inner.slice(0, colonPos).trim();
        rawValue = inner.slice(colonPos + 1).trim();
      } else if (spacePos !== -1) {
        rawDirective = inner.slice(0, spacePos).trim();
        rawValue = inner.slice(spacePos + 1).trim();
      }

      const dir = rawDirective.toLowerCase();

      // Metadata directives
      if (dir === 'title' || dir === 't') {
        if (rawValue) title = rawValue;
        continue;
      }
      if (dir === 'subtitle' || dir === 'st' || dir === 'su') {
        if (rawValue) subtitle = rawValue;
        continue;
      }
      if (dir === 'artist' || dir === 'a') {
        if (rawValue) artist = rawValue;
        continue;
      }
      if (dir === 'composer' || dir === 'lyricist' || dir === 'writer' || dir === 'writers') {
        if (rawValue) {
          rawValue
            .split(/[,;&]/)
            .map((w) => w.trim())
            .filter(Boolean)
            .forEach((w) => {
              if (!writers.includes(w)) writers.push(w);
            });
        }
        continue;
      }
      if (dir === 'key' || dir === 'k') {
        if (rawValue) {
          if (parseKey(rawValue)) {
            originalKey = rawValue.trim();
          } else {
            warnings.push(
              `Line ${lineNum}: Unrecognized {key: ${rawValue}} value. Defaulted to Key of C and preserved original value in notes.`
            );
            sourceNotesParts.push(`Original ChordPro key directive: ${rawValue}`);
          }
        }
        continue;
      }
      if (dir === 'tempo') {
        const parsedTempo = Number(rawValue);
        if (
          rawValue &&
          Number.isFinite(parsedTempo) &&
          parsedTempo >= 20 &&
          parsedTempo <= 320
        ) {
          tempoBpm = Math.round(parsedTempo);
        } else if (rawValue) {
          warnings.push(
            `Line ${lineNum}: Invalid {tempo: ${rawValue}} value (expected 20–320 BPM). Retained in source notes.`
          );
          sourceNotesParts.push(`Tempo note: ${rawValue}`);
        }
        continue;
      }
      if (dir === 'time') {
        if (rawValue) timeSignature = rawValue;
        continue;
      }
      if (dir === 'capo') {
        const parsedCapo = Number(rawValue);
        if (
          rawValue &&
          Number.isInteger(parsedCapo) &&
          parsedCapo >= 0 &&
          parsedCapo <= 12
        ) {
          capo = parsedCapo;
        } else if (rawValue) {
          warnings.push(
            `Line ${lineNum}: Unsupported {capo: ${rawValue}} value. Retained in source notes.`
          );
          sourceNotesParts.push(`Capo: ${rawValue}`);
        }
        continue;
      }
      if (dir === 'copyright' || dir === 'footer') {
        if (rawValue) {
          attribution = attribution ? `${attribution} · ${rawValue}` : rawValue;
        }
        continue;
      }
      if (dir === 'language' || dir === 'lang') {
        if (rawValue) {
          const lowerVal = rawValue.toLowerCase();
          const matched = LANGUAGE_PRESETS.find(
            (l) =>
              l.code.toLowerCase() === lowerVal ||
              l.label.toLowerCase() === lowerVal
          );
          language = matched ?? { code: lowerVal.slice(0, 12), label: rawValue };
        }
        continue;
      }
      if (dir === 'category' || dir === 'genre') {
        if (rawValue) {
          const lowerVal = rawValue.toLowerCase();
          const matched = CATEGORY_PRESETS.find(
            (c) =>
              c.id.toLowerCase() === lowerVal ||
              c.label.toLowerCase() === lowerVal
          );
          category = matched ?? { id: 'other', label: rawValue };
        }
        continue;
      }
      if (dir === 'meta') {
        const metaSpace = rawValue.indexOf(' ');
        const metaColon = rawValue.indexOf(':');
        const splitAt =
          metaColon !== -1 && (metaSpace === -1 || metaColon < metaSpace)
            ? metaColon
            : metaSpace;
        if (splitAt !== -1) {
          const metaKey = rawValue.slice(0, splitAt).trim().toLowerCase();
          const metaVal = rawValue.slice(splitAt + 1).trim();
          if (metaKey === 'language' && metaVal) {
            const matched = LANGUAGE_PRESETS.find(
              (l) =>
                l.code.toLowerCase() === metaVal.toLowerCase() ||
                l.label.toLowerCase() === metaVal.toLowerCase()
            );
            language = matched ?? { code: metaVal.toLowerCase(), label: metaVal };
            continue;
          }
          if (metaKey === 'category' && metaVal) {
            const matched = CATEGORY_PRESETS.find(
              (c) =>
                c.id.toLowerCase() === metaVal.toLowerCase() ||
                c.label.toLowerCase() === metaVal.toLowerCase()
            );
            category = matched ?? { id: 'other', label: metaVal };
            continue;
          }
          if (metaKey === 'attribution' && metaVal) {
            attribution = metaVal;
            continue;
          }
          if (metaKey === 'rights' && metaVal) {
            rightsNotes = metaVal;
            continue;
          }
        }
        sourceNotesParts.push(`Meta: ${rawValue}`);
        continue;
      }

      // Section Start Directives
      if (dir === 'start_of_chorus' || dir === 'soc') {
        sectionCounter += 1;
        currentSection = {
          id: `sec-${sectionCounter}`,
          type: 'chorus',
          label: rawValue || 'Chorus',
          lines: [],
        };
        sections.push(currentSection);
        continue;
      }
      if (dir === 'start_of_verse' || dir === 'sov') {
        sectionCounter += 1;
        verseCounter += 1;
        currentSection = {
          id: `sec-${sectionCounter}`,
          type: 'verse',
          label: rawValue || `Verse ${verseCounter}`,
          lines: [],
        };
        sections.push(currentSection);
        continue;
      }
      if (dir === 'start_of_bridge' || dir === 'sob') {
        sectionCounter += 1;
        currentSection = {
          id: `sec-${sectionCounter}`,
          type: 'bridge',
          label: rawValue || 'Bridge',
          lines: [],
        };
        sections.push(currentSection);
        continue;
      }
      if (dir === 'start_of_intro' || dir === 'soi') {
        sectionCounter += 1;
        currentSection = {
          id: `sec-${sectionCounter}`,
          type: 'intro',
          label: rawValue || 'Intro',
          lines: [],
        };
        sections.push(currentSection);
        continue;
      }
      if (dir === 'start_of_outro' || dir === 'soo') {
        sectionCounter += 1;
        currentSection = {
          id: `sec-${sectionCounter}`,
          type: 'outro',
          label: rawValue || 'Outro',
          lines: [],
        };
        sections.push(currentSection);
        continue;
      }
      if (
        dir === 'start_of_pre_chorus' ||
        dir === 'start_of_tag' ||
        dir === 'start_of_interlude' ||
        dir === 'start_of_instrumental' ||
        dir === 'start_of_part' ||
        dir === 'sop'
      ) {
        sectionCounter += 1;
        const inferredType =
          dir === 'start_of_pre_chorus'
            ? 'pre-chorus'
            : dir === 'start_of_tag'
            ? 'tag'
            : dir === 'start_of_interlude'
            ? 'interlude'
            : dir === 'start_of_instrumental'
            ? 'instrumental'
            : rawValue
            ? inferSectionType(rawValue)
            : 'other';
        const defaultLabel =
          rawValue ||
          SECTION_TYPE_PRESETS.find((p) => p.type === inferredType)?.defaultLabel ||
          `Section ${sectionCounter}`;
        currentSection = {
          id: `sec-${sectionCounter}`,
          type: inferredType,
          label: defaultLabel,
          lines: [],
        };
        sections.push(currentSection);
        continue;
      }

      // Section End Directives
      if (
        dir === 'end_of_chorus' ||
        dir === 'eoc' ||
        dir === 'end_of_verse' ||
        dir === 'eov' ||
        dir === 'end_of_bridge' ||
        dir === 'eob' ||
        dir === 'end_of_intro' ||
        dir === 'eoi' ||
        dir === 'end_of_outro' ||
        dir === 'eoo' ||
        dir === 'end_of_pre_chorus' ||
        dir === 'end_of_tag' ||
        dir === 'end_of_interlude' ||
        dir === 'end_of_instrumental' ||
        dir === 'end_of_part' ||
        dir === 'eop'
      ) {
        currentSection = null;
        continue;
      }

      // Comment / Performance Note Directives
      if (
        dir === 'comment' ||
        dir === 'c' ||
        dir === 'comment_italic' ||
        dir === 'ci' ||
        dir === 'comment_box' ||
        dir === 'cb'
      ) {
        if (rawValue) {
          // Check if comment is actually a section label like `{c: Chorus}` or `{comment: Verse 1}`
          const inferredHeading = inferSectionType(rawValue);
          if (
            inferredHeading !== 'other' &&
            /^(intro|verse(\s+\d+)?|pre-?chorus(\s+\d+)?|chorus(\s+\d+)?|bridge(\s+\d+)?|tag|interlude|instrumental|outro|koro|talata(\s+\d+)?|tulay)$/i.test(
              rawValue.trim()
            ) &&
            (!currentSection || currentSection.lines.length > 0)
          ) {
            sectionCounter += 1;
            currentSection = {
              id: `sec-${sectionCounter}`,
              type: inferredHeading,
              label: rawValue.trim(),
              lines: [],
            };
            sections.push(currentSection);
          } else {
      const targetSec = ensureSection('verse');
      if (targetSec.lines.length === 0 && !targetSec.cue) {
        targetSec.cue = rawValue;
      } else {
        targetSec.lines.push({
          id: `line-${sectionCounter}-${targetSec.lines.length + 1}`,
          annotation: rawValue,
          segments: [{ text: '' }],
        });
      }
          }
        }
        continue;
      }

      // Chorus recall `{chorus}`
      if (dir === 'chorus') {
        sectionCounter += 1;
        currentSection = {
          id: `sec-${sectionCounter}`,
          type: 'chorus',
          label: rawValue || 'Chorus',
          cue: 'Repeat Chorus',
          lines: [{ id: `line-${sectionCounter}-1`, segments: [{ text: '' }] }],
        };
        sections.push(currentSection);
        currentSection = null;
        continue;
      }

      // Unsupported directive: warn and retain in sourceNotes so nothing is silently lost
      unsupportedDirectives.push(trimmed);
      warnings.push(
        `Line ${lineNum}: Unsupported ChordPro directive "${trimmed}" was retained in Song Notes.`
      );
      sourceNotesParts.push(`Directive (line ${lineNum}): ${trimmed}`);
      continue;
    }

    // Check for unclosed '{' directive on a single line
    if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      warnings.push(
        `Line ${lineNum}: Unclosed directive brace "${trimmed}". Treated as lyric text.`
      );
    }

    // Check if the line is a standalone section header like `[Verse 1]` or `Chorus:`
    const standaloneHeading = isStandaloneSectionHeading(trimmed);
    if (standaloneHeading) {
      sectionCounter += 1;
      currentSection = {
        id: `sec-${sectionCounter}`,
        type: standaloneHeading.type,
        label: standaloneHeading.label,
        lines: [],
      };
      sections.push(currentSection);
      continue;
    }

    // Blank line handling
    if (trimmed === '') {
      if (currentSection && currentSection.lines.length > 0) {
        currentSection.lines.push({
          id: `line-${sectionCounter}-${currentSection.lines.length + 1}`,
          segments: [{ text: '' }],
        });
      }
      continue;
    }

    // Normal lyric/chord line
    const targetSection = ensureSection('verse');
    const parsedLine = parseBracketedLineToSegments(rawLine, lineNum);
    if (parsedLine.warnings.length > 0) {
      warnings.push(...parsedLine.warnings);
    }

    // Check if the preceding line was a standalone `{comment: ...}` annotation line with empty text
    const prevLine =
      targetSection.lines.length > 0
        ? targetSection.lines[targetSection.lines.length - 1]
        : null;
    if (
      prevLine &&
      prevLine.annotation &&
      prevLine.segments.length === 1 &&
      !prevLine.segments[0].chord &&
      prevLine.segments[0].text === ''
    ) {
      prevLine.isInstrumental = parsedLine.isInstrumental;
      prevLine.segments = parsedLine.segments;
    } else {
      targetSection.lines.push({
        id: `line-${sectionCounter}-${targetSection.lines.length + 1}`,
        isInstrumental: parsedLine.isInstrumental,
        segments: parsedLine.segments,
      });
    }
  }

  // Trim trailing empty blank lines at the very end of each section while preserving internal blank lines
  for (const sec of sections) {
    while (
      sec.lines.length > 1 &&
      sec.lines[sec.lines.length - 1].segments.length === 1 &&
      !sec.lines[sec.lines.length - 1].segments[0].chord &&
      sec.lines[sec.lines.length - 1].segments[0].text === '' &&
      !sec.lines[sec.lines.length - 1].annotation
    ) {
      sec.lines.pop();
    }
  }

  const nonEmptySections = sections.filter(
    (sec) => sec.lines.length > 0 || Boolean(sec.cue)
  );

  if (nonEmptySections.length === 0) {
    nonEmptySections.push({
      id: 'sec-1',
      type: 'verse',
      label: 'Verse 1',
      lines: [
        {
          id: 'line-1-1',
          segments: [{ text: '' }],
        },
      ],
    });
    warnings.push(
      'No lyric or chord lines were found; created a starter Verse 1 section.'
    );
  }

  // Fallback title from filename or first lyric line if `{title: ...}` was omitted
  if (!title) {
    if (options?.fileName) {
      const baseName = options.fileName
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      if (baseName) {
        title = baseName;
        warnings.push(
          `No {title: ...} directive found; used filename "${title}" as the draft title.`
        );
      }
    }
    if (!title) {
      title = 'Untitled Custom Song';
      warnings.push(
        'No {title: ...} directive found; defaulted to "Untitled Custom Song". Please review before saving.'
      );
    }
  }

  // Infer original key from first valid chord if `{key: ...}` was omitted
  if (!originalKey) {
    outer: for (const sec of nonEmptySections) {
      for (const line of sec.lines) {
        for (const seg of line.segments) {
          if (seg.chord) {
            const parsedChord = parseChord(seg.chord);
            if (parsedChord) {
              const isMinor =
                parsedChord.suffix.startsWith('m') &&
                !parsedChord.suffix.startsWith('maj');
              originalKey = isMinor
                ? CANONICAL_MINOR_KEYS[parsedChord.pitchClass]
                : CANONICAL_MAJOR_KEYS[parsedChord.pitchClass];
              warnings.push(
                `No {key: ...} directive found; inferred original key "${originalKey}" from first chord "${seg.chord}".`
              );
              break outer;
            }
          }
        }
      }
    }
    if (!originalKey) {
      originalKey = 'C';
    }
  }

  const now = new Date().toISOString();
  const id = options?.existingId || createCustomSongId();
  const slug = createCustomSongSlug(title, id);

  const draft: SongRecord = {
    id,
    slug,
    sourceType: 'custom',
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(artist ? { artist } : {}),
    ...(writers.length > 0 ? { writers } : {}),
    language,
    category,
    originalKey,
    ...(tempoBpm !== undefined ? { tempoBpm } : {}),
    ...(timeSignature ? { timeSignature } : {}),
    ...(capo !== undefined ? { capo } : {}),
    contentStatus: 'original' as ContentStatus,
    ...(attribution ? { attribution } : {}),
    ...(sourceNotesParts.length > 0
      ? { sourceNotes: sourceNotesParts.join('\n') }
      : {}),
    ...(rightsNotes ? { rightsNotes } : {}),
    createdAt: options?.existingCreatedAt || now,
    updatedAt: now,
    importProvenance: {
      ...(options?.fileName ? { fileName: options.fileName } : {}),
      importedAt: now,
      format: 'chordpro',
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    sections: nonEmptySections,
  };

  return {
    ok: true,
    draft,
    warnings,
    unsupportedDirectives,
  };
}

function escapeDirectiveValue(value: string): string {
  return sanitizePlainText(value)
    .replace(/\n+/g, ' ')
    .replace(/[{}]/g, (ch) => (ch === '{' ? '(' : ')'))
    .trim();
}

/**
 * Generates a safe, readable `.cho` download filename from a song title.
 */
export function getChordProFilename(title: string): string {
  const safe = sanitizePlainText(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${safe || 'worship-song'}.cho`;
}

/**
 * Exports a `SongRecord` into standard ChordPro (`.cho`) text format.
 * By default, exports the stored/original key and chords (`semitones = 0`).
 * Never includes private app IDs or device metadata.
 */
export function exportSongToChordPro(
  song: SongRecord,
  options: ChordProExportOptions = {}
): string {
  const semitones = options.semitones ?? 0;
  const { song: targetSong, displayedKey } =
    semitones !== 0
      ? transposeSong(song, semitones, 'auto')
      : { song, displayedKey: song.originalKey };

  const lines: string[] = [];

  lines.push(`{title: ${escapeDirectiveValue(targetSong.title)}}`);
  if (targetSong.subtitle?.trim()) {
    lines.push(`{subtitle: ${escapeDirectiveValue(targetSong.subtitle)}}`);
  }
  if (targetSong.artist?.trim()) {
    lines.push(`{artist: ${escapeDirectiveValue(targetSong.artist)}}`);
  }
  if (targetSong.writers && targetSong.writers.length > 0) {
    lines.push(
      `{composer: ${escapeDirectiveValue(targetSong.writers.join(', '))}}`
    );
  }
  if (displayedKey?.trim()) {
    lines.push(`{key: ${escapeDirectiveValue(displayedKey)}}`);
  }
  if (targetSong.tempoBpm) {
    lines.push(`{tempo: ${targetSong.tempoBpm}}`);
  }
  if (targetSong.timeSignature?.trim()) {
    lines.push(`{time: ${escapeDirectiveValue(targetSong.timeSignature)}}`);
  }
  if (targetSong.capo !== undefined && targetSong.capo > 0) {
    lines.push(`{capo: ${targetSong.capo}}`);
  }
  if (targetSong.language?.code) {
    lines.push(
      `{meta: language ${escapeDirectiveValue(targetSong.language.code)}}`
    );
  }
  if (targetSong.category?.id) {
    lines.push(
      `{meta: category ${escapeDirectiveValue(targetSong.category.id)}}`
    );
  }
  if (targetSong.attribution?.trim()) {
    lines.push(
      `{copyright: ${escapeDirectiveValue(targetSong.attribution)}}`
    );
  }
  if (targetSong.rightsNotes?.trim()) {
    lines.push(
      `{meta: rights ${escapeDirectiveValue(targetSong.rightsNotes)}}`
    );
  }

  for (const section of targetSong.sections) {
    lines.push('');
    const safeLabel = escapeDirectiveValue(section.label);
    let startDir = 'start_of_part';
    let endDir = 'end_of_part';

    if (section.type === 'verse') {
      startDir = 'start_of_verse';
      endDir = 'end_of_verse';
    } else if (section.type === 'chorus') {
      startDir = 'start_of_chorus';
      endDir = 'end_of_chorus';
    } else if (section.type === 'bridge') {
      startDir = 'start_of_bridge';
      endDir = 'end_of_bridge';
    } else if (section.type === 'intro') {
      startDir = 'start_of_intro';
      endDir = 'end_of_intro';
    } else if (section.type === 'outro') {
      startDir = 'start_of_outro';
      endDir = 'end_of_outro';
    }

    lines.push(`{${startDir}: ${safeLabel}}`);
    if (section.cue?.trim()) {
      lines.push(`{comment: ${escapeDirectiveValue(section.cue)}}`);
    }

    for (const line of section.lines) {
      if (line.annotation?.trim()) {
        lines.push(`{comment: ${escapeDirectiveValue(line.annotation)}}`);
      }
      const bracketed = formatSegmentsToBracketedLine(line.segments);
      if (
        bracketed !== '' ||
        !line.annotation?.trim() ||
        line.segments.length > 1
      ) {
        lines.push(bracketed);
      }
    }

    lines.push(`{${endDir}}`);
  }

  lines.push('');
  return lines.join('\n');
}

export interface BuildCustomSongInput {
  existingSong?: SongRecord;
  existingSlugs?: Set<string>;
  title: string;
  subtitle?: string;
  artist?: string;
  writers?: string[];
  languageCode?: string;
  languageLabel?: string;
  categoryId?: SongCategoryId;
  categoryLabel?: string;
  originalKey?: string;
  tempoBpm?: number;
  timeSignature?: string;
  capo?: number;
  attribution?: string;
  sourceNotes?: string;
  rightsNotes?: string;
  rightsAcknowledged?: boolean;
  importProvenance?: SongRecord['importProvenance'];
  sections: SongSection[];
}

/**
 * Constructs a clean, immutable custom `SongRecord` while preserving `id`, `slug`, and `createdAt`
 * when editing an existing custom song, and strictly preventing any built-in catalog ID from being overwritten.
 */
export function buildCustomSongRecord(input: BuildCustomSongInput): SongRecord {
  const now = new Date().toISOString();
  const isEditingValidCustom =
    input.existingSong &&
    input.existingSong.sourceType === 'custom' &&
    !isBuiltInCatalogSongId(input.existingSong.id);

  const id = isEditingValidCustom
    ? input.existingSong!.id
    : createCustomSongId();

  const createdAt = isEditingValidCustom
    ? input.existingSong!.createdAt || now
    : now;

  const cleanTitle = sanitizePlainText(input.title).trim();
  const slug =
    isEditingValidCustom && input.existingSong!.slug
      ? input.existingSong!.slug
      : createCustomSongSlug(cleanTitle, id, input.existingSlugs);

  const langPreset = LANGUAGE_PRESETS.find(
    (l) => l.code === (input.languageCode || 'en')
  );
  const language: SongLanguage = langPreset ?? {
    code: input.languageCode?.trim() || 'other',
    label: input.languageLabel?.trim() || input.languageCode?.trim() || 'Other',
  };

  const catPreset = CATEGORY_PRESETS.find(
    (c) => c.id === (input.categoryId || 'contemporary-worship')
  );
  const category: SongCategory = catPreset ?? {
    id: (input.categoryId as SongCategoryId) || 'other',
    label: input.categoryLabel?.trim() || 'Other',
  };

  const rawKey = (input.originalKey ?? '').trim();
  const originalKey = rawKey && parseKey(rawKey) ? rawKey : 'C';

  const normalizedSections: SongSection[] = input.sections.map(
    (sec, secIdx) => ({
      id: sec.id || `sec-${secIdx + 1}`,
      type: sec.type || inferSectionType(sec.label || 'Verse'),
      label: sanitizePlainText(sec.label).trim() || `Section ${secIdx + 1}`,
      ...(sec.cue?.trim() ? { cue: sanitizePlainText(sec.cue).trim() } : {}),
      lines:
        sec.lines.length > 0
          ? sec.lines.map((line, lineIdx) => {
              const segments =
                line.segments && line.segments.length > 0
                  ? line.segments.map((seg) => ({
                      ...(seg.chord?.trim()
                        ? { chord: sanitizePlainText(seg.chord).trim() }
                        : {}),
                      text: sanitizePlainText(seg.text ?? ''),
                    }))
                  : [{ text: '' }];
              const hasAnyChord = segments.some((s) => Boolean(s.chord));
              const hasAnyLyric = segments.some((s) => s.text.trim() !== '');
              return {
                id: line.id || `line-${secIdx + 1}-${lineIdx + 1}`,
                ...(line.annotation?.trim()
                  ? { annotation: sanitizePlainText(line.annotation).trim() }
                  : {}),
                isInstrumental:
                  line.isInstrumental ?? (hasAnyChord && !hasAnyLyric),
                segments,
              };
            })
          : [
              {
                id: `line-${secIdx + 1}-1`,
                segments: [{ text: '' }],
              },
            ],
    })
  );

  return {
    id,
    slug,
    sourceType: 'custom',
    title: cleanTitle,
    ...(input.subtitle?.trim()
      ? { subtitle: sanitizePlainText(input.subtitle).trim() }
      : {}),
    ...(input.artist?.trim()
      ? { artist: sanitizePlainText(input.artist).trim() }
      : {}),
    ...(input.writers && input.writers.length > 0
      ? {
          writers: input.writers
            .map((w) => sanitizePlainText(w).trim())
            .filter(Boolean),
        }
      : {}),
    language,
    category,
    originalKey,
    ...(input.tempoBpm !== undefined && Number.isFinite(input.tempoBpm)
      ? { tempoBpm: Math.round(input.tempoBpm) }
      : {}),
    ...(input.timeSignature?.trim()
      ? { timeSignature: sanitizePlainText(input.timeSignature).trim() }
      : {}),
    ...(input.capo !== undefined && Number.isInteger(input.capo)
      ? { capo: input.capo }
      : {}),
    contentStatus: 'original',
    ...(input.attribution?.trim()
      ? { attribution: sanitizePlainText(input.attribution).trim() }
      : {}),
    ...(input.sourceNotes?.trim()
      ? { sourceNotes: sanitizePlainText(input.sourceNotes).trim() }
      : {}),
    ...(input.rightsNotes?.trim()
      ? { rightsNotes: sanitizePlainText(input.rightsNotes).trim() }
      : {}),
    rightsAcknowledged: Boolean(input.rightsAcknowledged),
    createdAt,
    updatedAt: now,
    ...(input.importProvenance
      ? { importProvenance: input.importProvenance }
      : isEditingValidCustom && input.existingSong?.importProvenance
      ? { importProvenance: input.existingSong.importProvenance }
      : {}),
    sections: normalizedSections,
  };
}
