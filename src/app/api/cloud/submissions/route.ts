import { NextRequest, NextResponse } from 'next/server';
import {
  isDefaultAdminEmail,
  listSubmissions,
  submitSongForGlobalPublishing,
  validateSessionToken,
} from '@/lib/cloud/cloudDb';
import {
  fetchSubmissionsFromFirestore,
  saveSubmissionToFirestore,
} from '@/lib/cloud/submissionsService';
import type { SongSubmission, SubmissionStatus } from '@/types/auth';

export async function GET(req: NextRequest) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.cookies.get('worshipy_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = validateSessionToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = (url.searchParams.get('status') as SubmissionStatus) || undefined;

  // Admins see all submissions; regular users only see their own
  const isAdmin = user.role === 'admin' || isDefaultAdminEmail(user.email);

  // 1. Fetch from Firestore (cross-container persistent storage on Vercel)
  const firestoreSubs = await fetchSubmissionsFromFirestore({
    isAdmin,
    userId: user.id,
  });

  // 2. Fetch from local store
  const localFilter = isAdmin ? { status } : { userId: user.id, status };
  const localSubs = listSubmissions(localFilter);

  // 3. Merge both sources
  const subMap = new Map<string, SongSubmission>();
  for (const s of localSubs) {
    if (s?.id) subMap.set(s.id, s);
  }
  for (const s of firestoreSubs) {
    if (s?.id) subMap.set(s.id, s);
  }

  let submissions = Array.from(subMap.values());
  if (status) {
    submissions = submissions.filter((s) => s.status === status);
  }
  submissions.sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  return NextResponse.json({ submissions });
}

export async function POST(req: NextRequest) {
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.cookies.get('worshipy_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = validateSessionToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { song, submissionNotes } = body;

    if (!song || !song.title) {
      return NextResponse.json({ error: 'Invalid song data.' }, { status: 400 });
    }

    const submission = submitSongForGlobalPublishing({
      userId: user.id,
      song,
      submissionNotes,
    });

    // Also persist to Cloud Firestore for cross-container availability on Vercel
    await saveSubmissionToFirestore(submission);

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Submission failed.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
