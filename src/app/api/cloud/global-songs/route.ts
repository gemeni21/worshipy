import { NextRequest, NextResponse } from 'next/server';
import {
  getApprovedGlobalSongs,
  getRemovedGlobalSongIds,
  getRemovedGlobalSongs,
  isDefaultAdminEmail,
  removeSongGlobally,
  restoreSongGlobally,
  validateSessionToken,
} from '@/lib/cloud/cloudDb';
import {
  fetchGlobalSongsFromFirestore,
  fetchSubmissionsFromFirestore,
  saveSubmissionToFirestore,
  updateSubmissionInFirestore,
} from '@/lib/cloud/submissionsService';
import type { SongSubmission } from '@/types/auth';
import type { SongRecord } from '@/types/song';

export async function GET() {
  const localSongs = getApprovedGlobalSongs();
  const localRemovedIds = getRemovedGlobalSongIds();
  const removedSongs = getRemovedGlobalSongs();

  // Fetch approved & removed global songs from Firestore (cross-container sync on Vercel)
  const { approvedSongs: firestoreSongs, removedSongIds: firestoreRemovedIds } =
    await fetchGlobalSongsFromFirestore();

  const songMap = new Map<string, SongRecord>();
  for (const s of localSongs) {
    if (s?.id) songMap.set(s.id, s);
  }
  for (const s of firestoreSongs) {
    if (s?.id) songMap.set(s.id, s);
  }

  const removedSet = new Set([...localRemovedIds, ...firestoreRemovedIds]);

  return NextResponse.json({
    songs: Array.from(songMap.values()),
    removedSongIds: Array.from(removedSet),
    removedSongs,
  });
}

export async function DELETE(req: NextRequest) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.cookies.get('worshipy_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized: Sign in required.' }, { status: 401 });
  }

  const user = validateSessionToken(token);
  const isAdmin = user ? user.role === 'admin' || isDefaultAdminEmail(user.email) : false;
  if (!user || !isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden: Admin privileges are strictly required to remove songs globally.' },
      { status: 403 }
    );
  }

  try {
    let songId: string | null = null;
    let reason: string | undefined = undefined;

    const url = new URL(req.url);
    const querySongId = url.searchParams.get('songId');

    if (querySongId) {
      songId = querySongId;
      reason = url.searchParams.get('reason') || undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      songId = body.songId;
      reason = body.reason;
    }

    if (!songId) {
      return NextResponse.json({ error: 'Song ID or slug is required.' }, { status: 400 });
    }

    const result = removeSongGlobally({
      adminUserId: user.id,
      songIdOrSlug: songId,
      reason,
    });

    // Also persist removal to Cloud Firestore so all Vercel instances and devices sync in real-time
    try {
      const cleanId = songId.replace(/^global_/, '');
      const firestoreSubs = await fetchSubmissionsFromFirestore({ isAdmin: true });
      const matched = firestoreSubs.find(
        (s) =>
          s.songId === songId ||
          s.songId === cleanId ||
          s.song?.id === songId ||
          s.song?.id === cleanId
      );
      if (matched) {
        await updateSubmissionInFirestore({
          submissionId: matched.id,
          status: 'removed',
          adminNotes: reason,
          reviewedBy: {
            userId: user.id,
            email: user.email,
            displayName: user.displayName,
          },
        });
      } else {
        const removedDoc: SongSubmission = {
          id: `sub_removed_${cleanId}`,
          songId: cleanId,
          song: {
            id: cleanId,
            title: result.removedRecord.title || cleanId,
            slug: result.removedRecord.slug || cleanId,
            sourceType: 'catalog',
            originalKey: 'G',
            sections: [],
            language: { code: 'fil', label: 'Filipino / Tagalog' },
            category: { id: 'contemporary-worship', label: 'Contemporary Worship' },
            contentStatus: 'authorized',
            attribution: 'Removed by Admin',
            updatedAt: new Date().toISOString(),
          },
          submittedBy: {
            userId: user.id,
            email: user.email,
            displayName: user.displayName,
          },
          status: 'removed',
          submittedAt: new Date().toISOString(),
          reviewedAt: new Date().toISOString(),
          reviewedBy: {
            userId: user.id,
            email: user.email,
            displayName: user.displayName,
          },
          adminNotes: reason,
        };
        await saveSubmissionToFirestore(removedDoc);
      }
    } catch (fsErr) {
      console.warn('Firestore removal sync note:', fsErr);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to remove song globally.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.cookies.get('worshipy_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized: Sign in required.' }, { status: 401 });
  }

  const user = validateSessionToken(token);
  const isAdmin = user ? user.role === 'admin' || isDefaultAdminEmail(user.email) : false;
  if (!user || !isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden: Admin privileges are strictly required to manage global songs.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { songId, action } = body;

    if (!songId) {
      return NextResponse.json({ error: 'Song ID or slug is required.' }, { status: 400 });
    }

    if (action === 'restore') {
      const result = restoreSongGlobally({
        adminUserId: user.id,
        songIdOrSlug: songId,
      });

      // Also persist restore to Cloud Firestore
      try {
        const cleanId = songId.replace(/^global_/, '');
        const firestoreSubs = await fetchSubmissionsFromFirestore({ isAdmin: true });
        const matched = firestoreSubs.find(
          (s) =>
            s.songId === songId ||
            s.songId === cleanId ||
            s.song?.id === songId ||
            s.song?.id === cleanId
        );
        if (matched) {
          await updateSubmissionInFirestore({
            submissionId: matched.id,
            status: 'approved',
            adminNotes: 'Restored to global catalog by administrator.',
            reviewedBy: {
              userId: user.id,
              email: user.email,
              displayName: user.displayName,
            },
          });
        }
      } catch (fsErr) {
        console.warn('Firestore restore sync note:', fsErr);
      }

      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to modify global song.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
