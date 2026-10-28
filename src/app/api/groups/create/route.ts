import { NextRequest, NextResponse } from 'next/server';
import { createWorshipGroup, generateUserSessionToken, validateSessionToken } from '@/lib/cloud/cloudDb';

export async function POST(req: NextRequest) {
  try {
    const token =
      req.headers.get('Authorization')?.replace('Bearer ', '') ||
      req.cookies.get('worshipy_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const user = validateSessionToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 });
    }

    const body = await req.json();
    const { name, churchName } = body;

    const result = createWorshipGroup(user.id, name, churchName);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Generate fresh HMAC session token containing newly bound groupId
    const updatedToken = generateUserSessionToken(user.id);

    return NextResponse.json({ group: result.group, token: updatedToken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create group';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
