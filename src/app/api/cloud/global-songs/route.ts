import { NextRequest, NextResponse } from 'next/server';
import {
  getApprovedGlobalSongs,
  getRemovedGlobalSongIds,
  getRemovedGlobalSongs,
  removeSongGlobally,
  restoreSongGlobally,
  validateSessionToken,
} from '@/lib/cloud/cloudDb';

export async function GET() {
  const songs = getApprovedGlobalSongs();
  const removedSongIds = getRemovedGlobalSongIds();
  const removedSongs = getRemovedGlobalSongs();
  return NextResponse.json({ songs, removedSongIds, removedSongs });
}

export async function DELETE(req: NextRequest) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.cookies.get('worshipy_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized: Sign in required.' }, { status: 401 });
  }

  const user = validateSessionToken(token);
  if (!user || user.role !== 'admin') {
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
  if (!user || user.role !== 'admin') {
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
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update song.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
