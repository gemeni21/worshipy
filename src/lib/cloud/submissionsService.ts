/**
 * Worshipy - Cloud Firestore Submissions Service
 *
 * Provides real-time, cross-container synchronization for song submissions
 * between church leaders/members and platform administrators.
 * Seamlessly pairs with the Next.js API routes, ensuring instant multi-device
 * synchronization on serverless platforms (e.g., Vercel) while maintaining
 * offline resilience.
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase/firebaseClient.ts';
import type { SongSubmission, SubmissionStatus } from '@/types/auth';
import type { SongRecord } from '@/types/song';

/**
 * Strips undefined properties so Firestore JavaScript SDK does not reject document writes,
 * and ensures only allowed fields per firestore.rules are submitted.
 */
export function sanitizeSubmissionForFirestore(
  submission: Partial<SongSubmission>
): Record<string, unknown> {
  const allowed = [
    'id',
    'songId',
    'song',
    'submittedBy',
    'status',
    'submittedAt',
    'reviewedAt',
    'reviewedBy',
    'adminNotes',
    'submissionNotes',
  ] as const;

  const raw: Record<string, unknown> = {};
  for (const key of allowed) {
    const val = (submission as Record<string, unknown>)[key];
    if (val !== undefined && val !== null) {
      raw[key] = val;
    }
  }

  // Deep clone to strip any inner undefined object properties
  return JSON.parse(JSON.stringify(raw));
}

/**
 * Persists a song submission directly to Cloud Firestore.
 */
export async function saveSubmissionToFirestore(
  submission: SongSubmission
): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db || !submission.id) return false;

  try {
    const docRef = doc(db, 'submissions', submission.id);
    const sanitized = sanitizeSubmissionForFirestore(submission);
    await setDoc(docRef, sanitized, { merge: true });
    return true;
  } catch (err) {
    console.warn('[Firestore] Failed to save song submission:', err);
    return false;
  }
}

/**
 * Fetches all song submissions from Cloud Firestore.
 * For admins: returns all submissions.
 * For regular users: returns only submissions authored by the user.
 */
export async function fetchSubmissionsFromFirestore(params: {
  isAdmin: boolean;
  userId?: string;
}): Promise<SongSubmission[]> {
  const db = getFirebaseFirestore();
  if (!db) return [];

  try {
    const colRef = collection(db, 'submissions');
    const snapshot = await getDocs(colRef);
    const results: SongSubmission[] = [];

    snapshot.forEach((d) => {
      const data = d.data() as SongSubmission;
      if (!data || !data.id || !data.song) return;

      if (params.isAdmin) {
        results.push(data);
      } else if (params.userId && data.submittedBy?.userId === params.userId) {
        results.push(data);
      }
    });

    // Sort newest first
    results.sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
    return results;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch song submissions:', err);
    return [];
  }
}

/**
 * Listens in real-time to submissions from Cloud Firestore.
 * Ensures the Admin Portal and User Library react instantly to submissions.
 */
export function subscribeToSubmissions(params: {
  isAdmin: boolean;
  userId?: string;
  onUpdate: (subs: SongSubmission[]) => void;
}): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    return () => {};
  }

  try {
    const colRef = collection(db, 'submissions');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const results: SongSubmission[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as SongSubmission;
          if (!data || !data.id || !data.song) return;

          if (params.isAdmin) {
            results.push(data);
          } else if (
            params.userId &&
            data.submittedBy?.userId === params.userId
          ) {
            results.push(data);
          }
        });

        results.sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime()
        );
        params.onUpdate(results);
      },
      (err) => {
        console.warn('[Firestore] Submissions subscription error:', err);
      }
    );
  } catch (err) {
    console.warn('[Firestore] Could not set up submissions subscription:', err);
    return () => {};
  }
}

/**
 * Updates a submission status in Cloud Firestore (approve, reject, remove).
 */
export async function updateSubmissionInFirestore(params: {
  submissionId: string;
  status: SubmissionStatus;
  adminNotes?: string;
  reviewedBy?: { userId: string; email: string; displayName: string };
}): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db || !params.submissionId) return false;

  try {
    const docRef = doc(db, 'submissions', params.submissionId);
    const updates: Partial<SongSubmission> = {
      status: params.status,
      reviewedAt: new Date().toISOString(),
      ...(params.reviewedBy ? { reviewedBy: params.reviewedBy } : {}),
      ...(params.adminNotes !== undefined
        ? { adminNotes: params.adminNotes }
        : {}),
    };

    const sanitized = sanitizeSubmissionForFirestore(updates);
    await updateDoc(docRef, sanitized);
    return true;
  } catch (err) {
    console.warn('[Firestore] Failed to update submission:', err);
    return false;
  }
}

/**
 * Fetches all approved and removed global songs directly from Cloud Firestore submissions.
 */
export async function fetchGlobalSongsFromFirestore(): Promise<{
  approvedSongs: SongRecord[];
  removedSongIds: string[];
}> {
  const db = getFirebaseFirestore();
  if (!db) {
    return { approvedSongs: [], removedSongIds: [] };
  }

  try {
    const colRef = collection(db, 'submissions');
    const snapshot = await getDocs(colRef);
    const approvedSongsMap = new Map<string, SongRecord>();
    const removedSongIds = new Set<string>();

    snapshot.forEach((d) => {
      const sub = d.data() as SongSubmission;
      if (!sub || !sub.song) return;

      if (sub.status === 'approved') {
        const pubSong: SongRecord = {
          ...sub.song,
          id: sub.song.id.startsWith('global_')
            ? sub.song.id
            : `global_${sub.song.id}`,
          sourceType: 'catalog',
          attribution:
            sub.song.attribution ||
            `Contributed by ${sub.submittedBy?.displayName || 'Community'}`,
        };
        approvedSongsMap.set(pubSong.id, pubSong);
      } else if (sub.status === 'removed') {
        removedSongIds.add(sub.songId);
        if (sub.song?.id) {
          removedSongIds.add(sub.song.id);
          removedSongIds.add(`global_${sub.song.id}`);
        }
      }
    });

    return {
      approvedSongs: Array.from(approvedSongsMap.values()),
      removedSongIds: Array.from(removedSongIds),
    };
  } catch (err) {
    console.warn('[Firestore] Failed to fetch global songs from submissions:', err);
    return { approvedSongs: [], removedSongIds: [] };
  }
}

/**
 * Listens to all approved and removed global songs derived from Firestore submissions in real-time.
 */
export function subscribeToGlobalSongsFromSubmissions(
  onUpdate: (data: { approvedSongs: SongRecord[]; removedSongIds: string[] }) => void
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    return () => {};
  }

  try {
    const colRef = collection(db, 'submissions');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const approvedSongsMap = new Map<string, SongRecord>();
        const removedSongIds = new Set<string>();

        snapshot.forEach((d) => {
          const sub = d.data() as SongSubmission;
          if (!sub || !sub.song) return;

          if (sub.status === 'approved') {
            const pubSong: SongRecord = {
              ...sub.song,
              id: sub.song.id.startsWith('global_')
                ? sub.song.id
                : `global_${sub.song.id}`,
              sourceType: 'catalog',
              attribution:
                sub.song.attribution ||
                `Contributed by ${sub.submittedBy?.displayName || 'Community'}`,
            };
            approvedSongsMap.set(pubSong.id, pubSong);
          } else if (sub.status === 'removed') {
            removedSongIds.add(sub.songId);
            if (sub.song?.id) {
              removedSongIds.add(sub.song.id);
              removedSongIds.add(`global_${sub.song.id}`);
            }
          }
        });

        onUpdate({
          approvedSongs: Array.from(approvedSongsMap.values()),
          removedSongIds: Array.from(removedSongIds),
        });
      },
      (err) => {
        console.warn('[Firestore] Global songs subscription error:', err);
      }
    );
  } catch (err) {
    console.warn('[Firestore] Could not subscribe to global songs:', err);
    return () => {};
  }
}
