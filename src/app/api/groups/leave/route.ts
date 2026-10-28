import { NextRequest, NextResponse } from 'next/server';
import { generateUserSessionToken, leaveWorshipGroup, validateSessionToken } from '@/lib/cloud/cloudDb';

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

    const result = leaveWorshipGroup(user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Generate fresh HMAC session token with cleared groupId
    const updatedToken = generateUserSessionToken(user.id);

    return NextResponse.json({ success: true, token: updatedToken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to leave group';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
