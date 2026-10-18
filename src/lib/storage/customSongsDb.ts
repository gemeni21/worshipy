import { isBuiltInCatalogSongId } from '../catalog/songCatalog.ts';
import type { StorageOperationResult } from './offlineSongsDb.ts';
import type { SongRecord } from '../../types/song.ts';

const CUSTOM_DB_NAME = 'worship_companion_custom_songs_db';
const CUSTOM_DB_VERSION = 1;
const CUSTOM_STORE_NAME = 'custom_songs';
export const CUSTOM_SONGS_LOCALSTORAGE_KEY = 'wmc_custom_songs_v1';

// In-memory fallback store for headless/Node test environments when window is absent
let memoryCustomSongsStore: SongRecord[] = [];

function isIndexedDbSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'indexedDB' in window &&
    window.indexedDB !== null
  );
}

function isLocalStorageSupported(): boolean {
  return typeof window !== 'undefined' && 'localStorage' in window;
}

function openCustomSongsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(
        new Error('IndexedDB is not supported or is disabled in this browser.')
      );
      return;
    }

    try {
      const request = window.indexedDB.open(
        CUSTOM_DB_NAME,
        CUSTOM_DB_VERSION
      );

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CUSTOM_STORE_NAME)) {
          const store = db.createObjectStore(CUSTOM_STORE_NAME, {
            keyPath: 'id',
          });
          store.createIndex('by_slug', 'slug', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error ?? new Error('Failed to open custom songs database.')
        );
    } catch (err) {
      reject(
        err instanceof Error
          ? err
          : new Error('Failed to initialize custom songs IndexedDB.')
      );
    }
  });
}

function readLocalStorageMirror(): SongRecord[] {
  if (!isLocalStorageSupported()) {
    return [...memoryCustomSongsStore];
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_SONGS_LOCALSTORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as SongRecord[]).filter(
      (s) => s && typeof s.id === 'string' && !isBuiltInCatalogSongId(s.id)
    );
  } catch {
    return [];
  }
}

function writeLocalStorageMirror(songs: SongRecord[]): boolean {
  const sanitized = songs
    .filter((s) => s && typeof s.id === 'string' && !isBuiltInCatalogSongId(s.id))
    .map((s) => ({
      ...s,
      sourceType: 'custom' as const,
    }));

  memoryCustomSongsStore = sanitized;

  if (!isLocalStorageSupported()) {
    return true;
  }
  try {
    window.localStorage.setItem(
      CUSTOM_SONGS_LOCALSTORAGE_KEY,
      JSON.stringify(sanitized)
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronously reads custom songs from the localStorage mirror (useful for instant initial hydration).
 */
export function getCustomSongsSync(): SongRecord[] {
  const list = readLocalStorageMirror();
  return list.sort((a, b) =>
    (b.updatedAt ?? b.createdAt ?? '').localeCompare(
      a.updatedAt ?? a.createdAt ?? ''
    )
  );
}

/**
 * Loads all custom songs from IndexedDB (falling back to localStorage mirror if IndexedDB is unavailable).
 */
export async function getAllCustomSongsFromStorage(): Promise<SongRecord[]> {
  const mirrorSongs = readLocalStorageMirror();

  if (!isIndexedDbSupported()) {
    return mirrorSongs.sort((a, b) =>
      (b.updatedAt ?? b.createdAt ?? '').localeCompare(
        a.updatedAt ?? a.createdAt ?? ''
      )
    );
  }

  try {
    const db = await openCustomSongsDb();
    const idbRows = await new Promise<SongRecord[]>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_STORE_NAME, 'readonly');
      const store = tx.objectStore(CUSTOM_STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        resolve(((req.result as SongRecord[]) ?? []).filter(Boolean));
      };
      req.onerror = () =>
        reject(req.error ?? new Error('Failed to read custom songs.'));
    });

    // Merge IndexedDB and localStorage mirror by ID (keeping latest updatedAt)
    const byId = new Map<string, SongRecord>();
    for (const song of mirrorSongs) {
      if (!isBuiltInCatalogSongId(song.id)) {
        byId.set(song.id, { ...song, sourceType: 'custom' });
      }
    }
    for (const song of idbRows) {
      if (!isBuiltInCatalogSongId(song.id)) {
        const existing = byId.get(song.id);
        if (
          !existing ||
          (song.updatedAt ?? '') >= (existing.updatedAt ?? '')
        ) {
          byId.set(song.id, { ...song, sourceType: 'custom' });
        }
      }
    }

    const combined = Array.from(byId.values()).sort((a, b) =>
      (b.updatedAt ?? b.createdAt ?? '').localeCompare(
        a.updatedAt ?? a.createdAt ?? ''
      )
    );
    writeLocalStorageMirror(combined);
    return combined;
  } catch {
    return mirrorSongs.sort((a, b) =>
      (b.updatedAt ?? b.createdAt ?? '').localeCompare(
        a.updatedAt ?? a.createdAt ?? ''
      )
    );
  }
}

/**
 * Persists a custom song to IndexedDB and mirrors it to localStorage.
 * Strictly refuses to overwrite any built-in catalog song ID.
 */
export async function saveCustomSongToStorage(
  song: SongRecord
): Promise<StorageOperationResult & { song?: SongRecord }> {
  if (!song || !song.id || typeof song.id !== 'string') {
    return { ok: false, error: 'Invalid song ID.' };
  }

  if (isBuiltInCatalogSongId(song.id)) {
    return {
      ok: false,
      error:
        'Cannot overwrite a built-in catalog song. Save as a personal custom song with a distinct ID.',
    };
  }

  const recordToSave: SongRecord = JSON.parse(
    JSON.stringify({
      ...song,
      sourceType: 'custom',
    })
  ) as SongRecord;

  // Update localStorage/memory mirror immediately
  const existing = readLocalStorageMirror().filter(
    (s) => s.id !== recordToSave.id
  );
  const updatedList = [recordToSave, ...existing].sort((a, b) =>
    (b.updatedAt ?? b.createdAt ?? '').localeCompare(
      a.updatedAt ?? a.createdAt ?? ''
    )
  );
  const mirrorOk = writeLocalStorageMirror(updatedList);

  if (!isIndexedDbSupported()) {
    if (!mirrorOk) {
      return {
        ok: false,
        error:
          'Could not save custom song: browser storage is unavailable or full.',
      };
    }
    return { ok: true, song: recordToSave };
  }

  try {
    const db = await openCustomSongsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CUSTOM_STORE_NAME);
      const req = store.put(recordToSave);

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        const err = tx.error || req.error;
        if (err && err.name === 'QuotaExceededError') {
          reject(
            new Error(
              'Device storage quota exceeded. Free up space and try again.'
            )
          );
        } else {
          reject(err ?? new Error('Failed to write custom song to storage.'));
        }
      };
      tx.onabort = () =>
        reject(new Error('Custom song storage transaction was aborted.'));
    });

    return { ok: true, song: recordToSave };
  } catch (err) {
    if (mirrorOk) {
      // Fallback succeeded in localStorage even if IndexedDB failed
      return { ok: true, song: recordToSave };
    }
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to save custom song to local device storage.',
    };
  }
}

/**
 * Deletes a single custom song by ID from IndexedDB and localStorage mirror.
 * Strictly refuses to delete built-in catalog songs.
 */
export async function deleteCustomSongFromStorage(
  songId: string
): Promise<StorageOperationResult> {
  if (!songId || isBuiltInCatalogSongId(songId)) {
    return {
      ok: false,
      error: 'Built-in catalog songs cannot be deleted.',
    };
  }

  const remaining = readLocalStorageMirror().filter((s) => s.id !== songId);
  writeLocalStorageMirror(remaining);

  if (!isIndexedDbSupported()) {
    return { ok: true };
  }

  try {
    const db = await openCustomSongsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CUSTOM_STORE_NAME);
      store.delete(songId);

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('Failed to delete custom song.'));
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to delete custom song from IndexedDB.',
    };
  }
}

/**
 * Clears all custom songs from IndexedDB and localStorage mirror.
 */
export async function clearAllCustomSongsFromStorage(): Promise<StorageOperationResult> {
  memoryCustomSongsStore = [];
  if (isLocalStorageSupported()) {
    try {
      window.localStorage.removeItem(CUSTOM_SONGS_LOCALSTORAGE_KEY);
    } catch {
      // ignore
    }
  }

  if (!isIndexedDbSupported()) {
    return { ok: true };
  }

  try {
    const db = await openCustomSongsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CUSTOM_STORE_NAME);
      store.clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('Failed to clear custom songs.'));
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to clear custom songs storage.',
    };
  }
}
