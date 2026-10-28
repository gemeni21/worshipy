import { NextRequest, NextResponse } from 'next/server';
import {
  getWorshipGroup,
  suggestSetlistForGroup,
  validateSessionToken,
} from '@/lib/cloud/cloudDb';

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

    return NextResponse.json(
      { suggestions: group.suggestedSetlists || [] },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch suggestions';
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(
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
        { error: 'Unauthorized. Please sign in to suggest a lineup.' },
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

    const body = await req.json().catch(() => ({}));
    const result = suggestSetlistForGroup(user.id, groupId, {
      setlist: body.setlist,
      note: body.note,
      targetServiceDate: body.targetServiceDate,
      clientGroupFallback: body.clientGroup,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { ok: true, group: result.group, suggestion: result.suggestion },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to suggest setlist';
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
