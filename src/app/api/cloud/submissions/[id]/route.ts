import { NextRequest, NextResponse } from 'next/server';
import { getSubmissionById, reviewSongSubmission, validateSessionToken } from '@/lib/cloud/cloudDb';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const submission = getSubmissionById(id);
  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  // Only admin or the author can view
  if (user.role !== 'admin' && submission.submittedBy.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ submission });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token =
    req.headers.get('Authorization')?.replace('Bearer ', '') ||
    req.cookies.get('worshipy_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = validateSessionToken(token);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin privileges required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { status, adminNotes } = body;

    if (status !== 'approved' && status !== 'rejected' && status !== 'removed') {
      return NextResponse.json({ error: 'Status must be approved, rejected, or removed.' }, { status: 400 });
    }

    const updated = reviewSongSubmission({
      submissionId: id,
      adminUserId: user.id,
      status,
      adminNotes,
    });

    return NextResponse.json({ submission: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Review update failed.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
