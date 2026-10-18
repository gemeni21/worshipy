import rawDemoSongs from '../../data/demo-songs.json' with { type: 'json' };
import { validateSongCatalog } from '../validation/songValidator.ts';
import type { SongCategory, SongLanguage, SongRecord } from '../../types/song.ts';

export interface SongFilterCriteria {
  query?: string;
  language?: string;
  category?: string;
  originalKey?: string;
  sourceType?: 'all' | 'catalog' | 'custom';
  offlineOnly?: boolean;
  offlineSongIds?: Set<string> | string[];
}

// Validate seed records on module load during development
const validation = validateSongCatalog(rawDemoSongs as unknown[]);
if (!validation.valid && process.env.NODE_ENV !== 'production') {
  console.warn('Song catalog seed validation warnings:', validation.errors);
}

const CATALOG: readonly SongRecord[] = Object.freeze(
  (rawDemoSongs as SongRecord[]).map((song) =>
    Object.freeze({
      ...song,
      sourceType: song.sourceType ?? ('catalog' as const),
    })
  )
);

/**
 * Returns all songs in the built-in catalog.
 */
export function getAllSongs(): readonly SongRecord[] {
  return CATALOG;
}

/**
 * Returns true if the given song ID belongs to a built-in catalog song.
 */
export function isBuiltInCatalogSongId(id: string): boolean {
  return CATALOG.some((song) => song.id === id);
}

/**
 * Merges built-in catalog songs and device-local custom songs without duplicates.
 * Built-in catalog songs always take precedence for their own IDs/slugs and are never overwritten.
 */
export function mergeCatalogAndCustomSongs(
  customSongs: readonly SongRecord[] = [],
  catalogSongs: readonly SongRecord[] = CATALOG
): SongRecord[] {
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const merged: SongRecord[] = [];

  for (const song of catalogSongs) {
    seenIds.add(song.id);
    seenSlugs.add(song.slug);
    merged.push(song);
  }

  for (const custom of customSongs) {
    if (!custom || !custom.id || seenIds.has(custom.id)) {
      continue;
    }
    const safeSlug = seenSlugs.has(custom.slug)
      ? `${custom.slug}-${custom.id.slice(-6).toLowerCase()}`
      : custom.slug;
    seenIds.add(custom.id);
    seenSlugs.add(safeSlug);
    merged.push({
      ...custom,
      slug: safeSlug,
      sourceType: 'custom',
    });
  }

  return merged;
}

/**
 * Finds a song by its URL slug across the given list (defaults to built-in catalog).
 */
export function getSongBySlug(
  slug: string,
  songs: readonly SongRecord[] = CATALOG
): SongRecord | undefined {
  return songs.find((song) => song.slug === slug);
}

/**
 * Finds a song by its unique ID across the given list (defaults to built-in catalog).
 */
export function getSongById(
  id: string,
  songs: readonly SongRecord[] = CATALOG
): SongRecord | undefined {
  return songs.find((song) => song.id === id);
}

/**
 * Resolves an array of song IDs into available SongRecords, safely skipping
 * any deleted or unavailable IDs without crashing. Notice that duplicate IDs in input
 * are deduplicated in the returned array.
 */
export function resolveSongsByIds(
  ids: string[],
  fallbackCatalog: readonly SongRecord[] = CATALOG
): SongRecord[] {
  const byId = new Map(fallbackCatalog.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const result: SongRecord[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const found = byId.get(id);
    if (found) {
      seen.add(id);
      result.push(found);
    }
  }
  return result;
}

/**
 * Searches and filters songs across title, artist, writers, attribution, language, category, and key.
 */
export function searchAndFilterSongs(
  songs: readonly SongRecord[],
  criteria: SongFilterCriteria
): SongRecord[] {
  const normalizedQuery = (criteria.query ?? '').trim().toLowerCase();
  const languageFilter = (criteria.language ?? '').trim().toLowerCase();
  const categoryFilter = (criteria.category ?? '').trim().toLowerCase();
  const keyFilter = (criteria.originalKey ?? '').trim().toLowerCase();
  const sourceFilter = criteria.sourceType ?? 'all';

  const offlineSet = criteria.offlineSongIds
    ? criteria.offlineSongIds instanceof Set
      ? criteria.offlineSongIds
      : new Set(criteria.offlineSongIds)
    : null;

  return songs.filter((song) => {
    const effectiveSource = song.sourceType ?? 'catalog';
    if (sourceFilter !== 'all' && effectiveSource !== sourceFilter) {
      return false;
    }

    if (criteria.offlineOnly && offlineSet && !offlineSet.has(song.id)) {
      return false;
    }

    if (
      languageFilter &&
      languageFilter !== 'all' &&
      song.language.code.toLowerCase() !== languageFilter &&
      song.language.label.toLowerCase() !== languageFilter
    ) {
      return false;
    }

    if (
      categoryFilter &&
      categoryFilter !== 'all' &&
      song.category.id.toLowerCase() !== categoryFilter &&
      song.category.label.toLowerCase() !== categoryFilter
    ) {
      return false;
    }

    if (
      keyFilter &&
      keyFilter !== 'all' &&
      song.originalKey.toLowerCase() !== keyFilter
    ) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchableFields = [
      song.title,
      song.subtitle ?? '',
      song.artist ?? '',
      song.attribution ?? '',
      ...(song.writers ?? []),
      song.language.label,
      song.language.code,
      song.category.label,
      song.category.id,
      song.originalKey,
      `key of ${song.originalKey}`,
      effectiveSource === 'custom' ? 'my song personal song custom' : '',
    ]
      .join(' ')
      .toLowerCase();

    return searchableFields.includes(normalizedQuery);
  });
}

/**
 * Extracts distinct languages, categories, and keys from the catalog for filter controls.
 */
export function getCatalogFilterOptions(
  songs: readonly SongRecord[] = CATALOG
): {
  languages: SongLanguage[];
  categories: SongCategory[];
  keys: string[];
} {
  const langMap = new Map<string, SongLanguage>();
  const catMap = new Map<string, SongCategory>();
  const keySet = new Set<string>();

  for (const song of songs) {
    if (!langMap.has(song.language.code)) {
      langMap.set(song.language.code, song.language);
    }
    if (!catMap.has(song.category.id)) {
      catMap.set(song.category.id, song.category);
    }
    if (song.originalKey) {
      keySet.add(song.originalKey);
    }
  }

  return {
    languages: Array.from(langMap.values()),
    categories: Array.from(catMap.values()),
    keys: Array.from(keySet),
  };
}
