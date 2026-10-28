import { NextRequest, NextResponse } from 'next/server';
import { getWorshipGroup, updateWorshipGroupBranding, validateSessionToken } from '@/lib/cloud/cloudDb';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const group = getWorshipGroup(groupId);

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found.' },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json({ group }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch group';
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const token =
      req.headers.get('Authorization')?.replace('Bearer ', '') ||
      req.cookies.get('worshipy_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    const user = validateSessionToken(token);
    if (!user) {
      return NextResponse.json(
        { error: 'Session expired. Please sign in again.' },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    const body = await req.json();
    const result = updateWorshipGroupBranding(user.id, groupId, body);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json({ group: result.group }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update group branding';
    return NextResponse.json({ error: msg }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
