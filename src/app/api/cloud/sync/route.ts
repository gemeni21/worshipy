import { NextRequest, NextResponse } from 'next/server';
import { getUserSync, saveUserSync, validateSessionToken } from '@/lib/cloud/cloudDb';

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

  const syncData = getUserSync(user.id);
  return NextResponse.json({ syncData });
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
    const payload = await req.json();
    const saved = saveUserSync(user.id, payload);
    return NextResponse.json({ success: true, syncData: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
