import { NextRequest, NextResponse } from 'next/server';
import { listSubmissions, submitSongForGlobalPublishing, validateSessionToken } from '@/lib/cloud/cloudDb';
import type { SubmissionStatus } from '@/types/auth';

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
  const filter = user.role === 'admin' ? { status } : { userId: user.id, status };
  const submissions = listSubmissions(filter);

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

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Submission failed.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
