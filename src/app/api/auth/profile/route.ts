import { NextRequest, NextResponse } from 'next/server';
import { updateUserProfile, validateSessionToken } from '@/lib/cloud/cloudDb';

export async function PATCH(req: NextRequest) {
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
    const updates = await req.json();
    const updated = updateUserProfile(user.id, updates);
    return NextResponse.json({ profile: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update profile.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
