/**
 * Local-First Practice Audio Storage Engine
 *
 * Persists rehearsal and practice take audio Blobs directly in client-side IndexedDB,
 * and manages cloud links (Google Drive, Dropbox, direct audio URLs) and file uploads.
 * Zero network latency, 100% offline-ready, zero cloud storage cost.
 */

export interface PracticeTake {
  id: string;
  songSlug: string;
  songTitle: string;
  songArtist?: string;
  key: string;
  capo?: number;
  durationSeconds: number;
  createdAt: number; // Unix timestamp ms
  blob?: Blob;
  audioUrl?: string; // Cloud streaming URL (Google Drive, Dropbox, direct link)
  sourceType?: 'recording' | 'upload' | 'link';
  fileName?: string;
  mimeType: string;
  notes?: string;
  waveformPeaks: number[]; // Normalized 0..1 values for visual playback scrubbing
  churchName?: string; // Church affiliation for team sharing
  createdBy?: string; // Submitter or musician name
  isLeaderTake?: boolean;
  instrumentTag?: string;
}

const DB_NAME = 'worship_companion_practice_db';
const DB_VERSION = 1;
const STORE_NAME = 'practice_takes';

export interface StorageResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function isPracticeDbSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
}

function openPracticeDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isPracticeDbSupported()) {
      reject(new Error('IndexedDB is not supported or is disabled in this browser.'));
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by_song_slug', 'songSlug', { unique: false });
          store.createIndex('by_created_at', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Failed to open practice audio database.'));
      };
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to initialize practice IndexedDB.'));
    }
  });
}

/**
 * Saves a recorded or uploaded practice take to IndexedDB.
 */
export async function savePracticeTake(take: PracticeTake): Promise<StorageResult<PracticeTake>> {
  if (!isPracticeDbSupported()) {
    return { ok: false, error: 'IndexedDB is not supported in this environment.' };
  }

  try {
    const db = await openPracticeDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const request = store.put(take);

      request.onsuccess = () => {
        resolve({ ok: true, data: take });
      };

      request.onerror = () => {
        resolve({
          ok: false,
          error: request.error?.message ?? 'Failed to write practice audio record.',
        });
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown storage error',
    };
  }
}

/**
 * Retrieves all practice takes recorded for a specific song, ordered most recent first.
 */
export async function getPracticeTakesForSong(songSlug: string): Promise<PracticeTake[]> {
  if (!isPracticeDbSupported() || !songSlug) return [];

  try {
    const db = await openPracticeDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_song_slug');
      const request = index.getAll(IDBKeyRange.only(songSlug));

      request.onsuccess = () => {
        const results = (request.result as PracticeTake[]) || [];
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };

      request.onerror = () => {
        resolve([]);
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return [];
  }
}

/**
 * Retrieves all practice takes across all songs.
 */
export async function getAllPracticeTakes(): Promise<PracticeTake[]> {
  if (!isPracticeDbSupported()) return [];

  try {
    const db = await openPracticeDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result as PracticeTake[]) || [];
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };

      request.onerror = () => {
        resolve([]);
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return [];
  }
}

/**
 * Deletes a practice take by ID.
 */
export async function deletePracticeTake(id: string): Promise<StorageResult> {
  if (!isPracticeDbSupported()) {
    return { ok: false, error: 'IndexedDB is not supported.' };
  }

  try {
    const db = await openPracticeDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve({ ok: true });
      };

      request.onerror = () => {
        resolve({
          ok: false,
          error: request.error?.message ?? 'Failed to delete practice take.',
        });
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Updates musician review notes on an existing take.
 */
export async function updatePracticeTakeNotes(id: string, notes: string): Promise<StorageResult> {
  if (!isPracticeDbSupported()) {
    return { ok: false, error: 'IndexedDB is not supported.' };
  }

  try {
    const db = await openPracticeDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const take = getReq.result as PracticeTake | undefined;
        if (!take) {
          resolve({ ok: false, error: 'Practice take not found.' });
          return;
        }

        take.notes = notes;
        const putReq = store.put(take);
        putReq.onsuccess = () => resolve({ ok: true });
        putReq.onerror = () =>
          resolve({ ok: false, error: putReq.error?.message ?? 'Failed to update notes.' });
      };

      getReq.onerror = () => {
        resolve({ ok: false, error: getReq.error?.message ?? 'Failed to find record.' });
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Updates the song title (and optional song slug/artist) on an existing take.
 */
export async function updatePracticeTakeTitle(
  id: string,
  newTitle: string,
  newSlug?: string,
  newArtist?: string
): Promise<StorageResult> {
  const trimmedTitle = newTitle.trim();
  if (!trimmedTitle) {
    return { ok: false, error: 'Song title cannot be empty.' };
  }

  if (!isPracticeDbSupported()) {
    return { ok: false, error: 'IndexedDB is not supported.' };
  }

  try {
    const db = await openPracticeDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const take = getReq.result as PracticeTake | undefined;
        if (!take) {
          resolve({ ok: false, error: 'Practice take not found.' });
          return;
        }

        take.songTitle = trimmedTitle;
        if (newSlug) {
          take.songSlug = newSlug;
        }
        if (newArtist !== undefined) {
          take.songArtist = newArtist;
        }

        const putReq = store.put(take);
        putReq.onsuccess = () => resolve({ ok: true });
        putReq.onerror = () =>
          resolve({ ok: false, error: putReq.error?.message ?? 'Failed to update song title.' });
      };

      getReq.onerror = () => {
        resolve({ ok: false, error: getReq.error?.message ?? 'Failed to find record.' });
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Transforms standard cloud share URLs (Google Drive, Dropbox, OneDrive) into direct audio streaming links.
 */
export interface CloudAudioTransform {
  streamUrl: string;
  provider: 'gdrive' | 'dropbox' | 'onedrive' | 'direct' | 'unknown';
  originalUrl: string;
  suggestedName?: string;
}

/**
 * Resolves any audio URL (including legacy direct Google Drive links, Dropbox, or OneDrive)
 * into a reliable, same-origin streaming proxy URL to prevent CORS and CORP NotSupportedError blocks.
 */
export function resolvePlaybackUrl(audioUrl: string | undefined | null): string | null {
  if (!audioUrl) return null;
  const trimmed = audioUrl.trim();
  if (!trimmed) return null;

  // Local blobs or already proxied endpoints are used directly
  if (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/api/audio/stream')
  ) {
    return trimmed;
  }

  // Google Drive URL or ID
  const gDriveMatch =
    trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);

  if (gDriveMatch && gDriveMatch[1]) {
    return `/api/audio/stream?id=${encodeURIComponent(gDriveMatch[1])}&provider=gdrive`;
  }

  // Dropbox Sharing Link
  if (trimmed.includes('dropbox.com')) {
    let streamUrl = trimmed;
    if (streamUrl.includes('dl=0')) {
      streamUrl = streamUrl.replace('dl=0', 'raw=1');
    } else if (!streamUrl.includes('raw=1')) {
      streamUrl += (streamUrl.includes('?') ? '&' : '?') + 'raw=1';
    }
    return `/api/audio/stream?url=${encodeURIComponent(streamUrl)}&provider=dropbox`;
  }

  // OneDrive Sharing Link
  if (trimmed.includes('1drv.ms') || trimmed.includes('onedrive.live.com')) {
    const streamUrl = trimmed.replace('/view.aspx', '/download.aspx');
    return `/api/audio/stream?url=${encodeURIComponent(streamUrl)}&provider=onedrive`;
  }

  return trimmed;
}

export function transformCloudAudioUrl(rawUrl: string): CloudAudioTransform {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { streamUrl: '', provider: 'unknown', originalUrl: '' };
  }

  // 1. Google Drive Sharing Link
  // Handles:
  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // https://drive.google.com/open?id=FILE_ID
  const gDriveMatch =
    trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);

  if (gDriveMatch && gDriveMatch[1]) {
    const fileId = gDriveMatch[1];
    return {
      streamUrl: `/api/audio/stream?id=${encodeURIComponent(fileId)}&provider=gdrive`,
      provider: 'gdrive',
      originalUrl: trimmed,
      suggestedName: 'Google Drive Audio',
    };
  }

  // 2. Dropbox Sharing Link
  if (trimmed.includes('dropbox.com')) {
    let streamUrl = trimmed;
    if (streamUrl.includes('dl=0')) {
      streamUrl = streamUrl.replace('dl=0', 'raw=1');
    } else if (!streamUrl.includes('raw=1')) {
      streamUrl += (streamUrl.includes('?') ? '&' : '?') + 'raw=1';
    }
    return {
      streamUrl: `/api/audio/stream?url=${encodeURIComponent(streamUrl)}&provider=dropbox`,
      provider: 'dropbox',
      originalUrl: trimmed,
      suggestedName: 'Dropbox Audio',
    };
  }

  // 3. OneDrive Sharing Link
  if (trimmed.includes('1drv.ms') || trimmed.includes('onedrive.live.com')) {
    const streamUrl = trimmed.replace('/view.aspx', '/download.aspx');
    return {
      streamUrl: `/api/audio/stream?url=${encodeURIComponent(streamUrl)}&provider=onedrive`,
      provider: 'onedrive',
      originalUrl: trimmed,
      suggestedName: 'OneDrive Audio',
    };
  }

  // 4. Direct audio file URL (.mp3, .m4a, .wav, .webm, etc.)
  if (/\.(mp3|wav|m4a|aac|ogg|webm|flac)($|\?)/i.test(trimmed)) {
    return {
      streamUrl: trimmed,
      provider: 'direct',
      originalUrl: trimmed,
    };
  }

  return {
    streamUrl: trimmed,
    provider: 'unknown',
    originalUrl: trimmed,
  };
}

/**
 * Extracts duration and calculates 64-bar normalized waveform peaks from an uploaded audio File or Blob.
 */
export async function extractAudioWaveformAndDuration(
  file: Blob | File
): Promise<{ durationSeconds: number; waveformPeaks: number[] }> {
  if (typeof window === 'undefined') {
    return { durationSeconds: 0, waveformPeaks: generateSyntheticPeaks(64) };
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (AudioCtx) {
    try {
      const audioCtx = new AudioCtx();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const duration = Math.round(audioBuffer.duration);
      const rawData = audioBuffer.getChannelData(0);
      const targetCount = 64;
      const blockSize = Math.floor(rawData.length / targetCount);
      const peaks: number[] = [];

      for (let i = 0; i < targetCount; i++) {
        const start = i * blockSize;
        let max = 0.1;
        for (let j = 0; j < blockSize; j += 15) {
          const val = Math.abs(rawData[start + j] || 0);
          if (val > max) max = val;
        }
        peaks.push(Math.round(Math.min(1.0, Math.max(0.12, max * 1.4)) * 100) / 100);
      }

      await audioCtx.close();
      return { durationSeconds: Math.max(1, duration), waveformPeaks: peaks };
    } catch {
      // Fall through to HTML5 Audio element
    }
  }

  // Fallback using HTML5 Audio
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';

    audio.onloadedmetadata = () => {
      const duration = Math.round(audio.duration || 60);
      URL.revokeObjectURL(url);
      resolve({
        durationSeconds: Math.max(1, duration),
        waveformPeaks: generateSyntheticPeaks(64),
      });
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        durationSeconds: 60,
        waveformPeaks: generateSyntheticPeaks(64),
      });
    };

    audio.src = url;
  });
}

function generateSyntheticPeaks(count: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const val = 0.2 + 0.45 * Math.abs(Math.sin((i / count) * Math.PI * 3.5));
    result.push(Math.round(val * 100) / 100);
  }
  return result;
}

/**
 * Triggers a browser download/export of the practice take audio file or opens link.
 */
export function exportPracticeTake(take: PracticeTake): void {
  if (typeof window === 'undefined') return;

  if (take.blob) {
    const url = URL.createObjectURL(take.blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;

    const dateStr = new Date(take.createdAt).toISOString().split('T')[0];
    const safeTitle = take.songTitle.replace(/[/\\?%*:|"<>]/g, '_');
    const ext = take.mimeType.includes('mp4') || take.mimeType.includes('m4a')
      ? 'm4a'
      : take.mimeType.includes('mp3')
      ? 'mp3'
      : take.mimeType.includes('wav')
      ? 'wav'
      : 'webm';
    a.download = `${safeTitle} (Key of ${take.key}) - Practice ${dateStr}.${ext}`;

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  } else if (take.audioUrl) {
    window.open(take.audioUrl, '_blank', 'noopener,noreferrer');
  }
}
