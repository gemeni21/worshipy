import type { OfflineSongEntry, SongRecord } from '../../types/song.ts';

const DB_NAME = 'worship_companion_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_songs';
const OFFLINE_CACHE_NAME = 'wmc-pages-cache-v3';

export interface StorageOperationResult {
  ok: boolean;
  error?: string;
}

export interface BatchStorageOperationResult {
  ok: boolean;
  savedCount: number;
  error?: string;
}

function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error('IndexedDB is not supported or is disabled in this browser.'));
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'songId' });
          store.createIndex('by_slug', 'song.slug', { unique: true });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Failed to open offline song database.'));
      };
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to initialize IndexedDB.'));
    }
  });
}

/**
 * Retrieves all offline-saved song entries from IndexedDB.
 */
export async function getAllOfflineSongs(): Promise<OfflineSongEntry[]> {
  if (!isIndexedDbSupported()) return [];

  try {
    const db = await openDatabase();
    return await new Promise<OfflineSongEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows = (req.result as OfflineSongEntry[]) ?? [];
        rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        resolve(rows);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to read offline songs.'));
    });
  } catch {
    return [];
  }
}

/**
 * Retrieves a single offline song record by its slug from IndexedDB.
 */
export async function getOfflineSongBySlug(slug: string): Promise<SongRecord | null> {
  const entries = await getAllOfflineSongs();
  const match = entries.find((item) => item.song.slug === slug);
  return match ? match.song : null;
}

/**
 * Saves a song's full structured chart and metadata into IndexedDB and pre-caches
 * its route in Cache Storage when available so it can be opened without a network connection.
 */
export async function saveSongForOffline(
  song: SongRecord
): Promise<StorageOperationResult> {
  if (!isIndexedDbSupported()) {
    return {
      ok: false,
      error:
        'Offline storage (IndexedDB) is unavailable in this browser or private browsing mode.',
    };
  }

  try {
    const db = await openDatabase();
    const entry: OfflineSongEntry = {
      songId: song.id,
      savedAt: new Date().toISOString(),
      version: 1,
      song: JSON.parse(JSON.stringify(song)) as SongRecord,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        const err = tx.error || req.error;
        if (err && err.name === 'QuotaExceededError') {
          reject(new Error('Device storage quota exceeded. Free up space and try again.'));
        } else {
          reject(err ?? new Error('Failed to write song to offline storage.'));
        }
      };
      tx.onabort = () => {
        reject(new Error('Offline storage transaction was aborted.'));
      };
    });

    // Best-effort pre-cache of the song detail route and app shell in Cache Storage
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await window.caches.open(OFFLINE_CACHE_NAME);
        const urlsToCache = [`/songs/${song.slug}`, '/songs', '/'];
        await Promise.allSettled(
          urlsToCache.map((url) =>
            fetch(url, { credentials: 'same-origin' }).then((res) => {
              if (res.ok) {
                return cache.put(url, res.clone());
              }
            })
          )
        );
      } catch {
        // IndexedDB record succeeded; Cache API is progressive enhancement
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not save song for offline use due to a storage error.',
    };
  }
}

/**
 * Saves multiple songs in a single IndexedDB transaction and pre-caches routes in Cache Storage.
 */
export async function saveBatchSongsForOffline(
  songs: SongRecord[]
): Promise<BatchStorageOperationResult> {
  if (!isIndexedDbSupported()) {
    return {
      ok: false,
      savedCount: 0,
      error: 'Offline storage (IndexedDB) is unavailable in this browser.',
    };
  }

  if (!songs || songs.length === 0) {
    return { ok: true, savedCount: 0 };
  }

  try {
    const db = await openDatabase();
    const now = new Date().toISOString();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const song of songs) {
        const entry: OfflineSongEntry = {
          songId: song.id,
          savedAt: now,
          version: 1,
          song: JSON.parse(JSON.stringify(song)) as SongRecord,
        };
        store.put(entry);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        const err = tx.error;
        if (err && err.name === 'QuotaExceededError') {
          reject(new Error('Device storage quota exceeded. Free up space and try again.'));
        } else {
          reject(err ?? new Error('Failed to write batch songs to offline storage.'));
        }
      };
      tx.onabort = () => {
        reject(new Error('Batch offline storage transaction was aborted.'));
      };
    });

    // Best-effort cache pre-fetching in Cache Storage
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await window.caches.open(OFFLINE_CACHE_NAME);
        const urlsToCache = ['/songs', '/'];
        for (const song of songs) {
          urlsToCache.push(`/songs/${song.slug}`);
        }
        await Promise.allSettled(
          urlsToCache.map((url) =>
            fetch(url, { credentials: 'same-origin' }).then((res) => {
              if (res.ok) {
                return cache.put(url, res.clone());
              }
            })
          )
        );
      } catch {
        // Cache API is progressive enhancement
      }
    }

    return { ok: true, savedCount: songs.length };
  } catch (err) {
    return {
      ok: false,
      savedCount: 0,
      error:
        err instanceof Error
          ? err.message
          : 'Could not complete batch offline save due to a storage error.',
    };
  }
}

/**
 * Removes an offline song copy from IndexedDB without affecting favorites or setlists.
 */
export async function removeSongFromOffline(
  songId: string,
  slug?: string
): Promise<StorageOperationResult> {
  if (!isIndexedDbSupported()) {
    return { ok: false, error: 'IndexedDB is unavailable in this browser.' };
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(songId);

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('Failed to remove offline song record.'));
    });

    if (slug && typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await window.caches.open(OFFLINE_CACHE_NAME);
        await cache.delete(`/songs/${slug}`);
      } catch {
        // Ignore cache cleanup errors
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to remove offline copy.',
    };
  }
}

/**
 * Clears all offline song records from IndexedDB and Cache Storage.
 */
export async function clearAllOfflineSongs(): Promise<StorageOperationResult> {
  if (!isIndexedDbSupported()) {
    return { ok: true };
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('Failed to clear offline song storage.'));
    });

    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        await window.caches.delete(OFFLINE_CACHE_NAME);
      } catch {
        // Ignore cache deletion errors
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to clear offline downloads.',
    };
  }
}
