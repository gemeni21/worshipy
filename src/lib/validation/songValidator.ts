import { parseChord, parseKey } from '../music/transposition.ts';
import type { SongRecord } from '../../types/song.ts';

export interface SongValidationResult {
  valid: boolean;
  errors: string[];
}

const ALLOWED_NO_CHORD = new Set(['N.C.', 'N.C', 'NC', 'n.c.', 'nc', '-', '/', '|', '||']);

/**
 * Validates a single SongRecord to catch malformed metadata, missing sections,
 * or invalid chord symbols during development.
 */
export function validateSongRecord(record: unknown): SongValidationResult {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['Song record must be a non-null object.'] };
  }

  const song = record as Partial<SongRecord>;

  if (!song.id || typeof song.id !== 'string' || !song.id.trim()) {
    errors.push('Missing or invalid `id`.');
  }
  if (!song.slug || typeof song.slug !== 'string' || !/^[a-z0-9-]+$/.test(song.slug)) {
    errors.push(`Invalid or non-URL-safe \`slug\`: "${String(song.slug)}".`);
  }
  if (!song.title || typeof song.title !== 'string' || !song.title.trim()) {
    errors.push('Missing or invalid `title`.');
  }
  if (
    !song.language ||
    typeof song.language.code !== 'string' ||
    typeof song.language.label !== 'string'
  ) {
    errors.push('Missing or invalid `language` object ({ code, label }).');
  }
  if (
    !song.category ||
    typeof song.category.id !== 'string' ||
    typeof song.category.label !== 'string'
  ) {
    errors.push('Missing or invalid `category` object ({ id, label }).');
  }
  if (!song.originalKey || !parseKey(song.originalKey)) {
    errors.push(`Invalid \`originalKey\`: "${String(song.originalKey)}".`);
  }
  if (!Array.isArray(song.sections) || song.sections.length === 0) {
    errors.push('Song must contain at least one section in `sections`.');
  } else {
    song.sections.forEach((section, secIndex) => {
      if (!section.label || !section.label.trim()) {
        errors.push(`Section [${secIndex}] is missing a \`label\`.`);
      }
      if (!Array.isArray(section.lines) || section.lines.length === 0) {
        errors.push(`Section "${section.label || secIndex}" must contain at least one line.`);
      } else {
        section.lines.forEach((line, lineIndex) => {
          if (!Array.isArray(line.segments) || line.segments.length === 0) {
            errors.push(
              `Section "${section.label}", line [${lineIndex}] must contain at least one segment.`
            );
          } else {
            line.segments.forEach((seg, segIndex) => {
              if (typeof seg.text !== 'string') {
                errors.push(
                  `Section "${section.label}", line [${lineIndex}], segment [${segIndex}] is missing string \`text\`.`
                );
              }
              if (seg.chord !== undefined && seg.chord !== '') {
                const trimmedChord = seg.chord.trim();
                if (
                  !ALLOWED_NO_CHORD.has(trimmedChord) &&
                  !parseChord(trimmedChord)
                ) {
                  errors.push(
                    `Invalid chord token "${seg.chord}" in section "${section.label}", line [${lineIndex}], segment [${segIndex}].`
                  );
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
  };
}

/**
 * Validates an entire array of seed SongRecords, including uniqueness of IDs and slugs.
 */
export function validateSongCatalog(records: unknown[]): SongValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  records.forEach((record, index) => {
    const res = validateSongRecord(record);
    if (!res.valid) {
      res.errors.forEach((err) => errors.push(`Record [${index}]: ${err}`));
    } else {
      const song = record as SongRecord;
      if (seenIds.has(song.id)) {
        errors.push(`Duplicate song id: "${song.id}".`);
      }
      seenIds.add(song.id);

      if (seenSlugs.has(song.slug)) {
        errors.push(`Duplicate song slug: "${song.slug}".`);
      }
      seenSlugs.add(song.slug);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
