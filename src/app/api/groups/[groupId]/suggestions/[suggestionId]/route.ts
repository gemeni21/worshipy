import { NextRequest, NextResponse } from 'next/server';
import {
  reviewSetlistSuggestion,
  deleteSetlistSuggestion,
  validateSessionToken,
} from '@/lib/cloud/cloudDb';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string; suggestionId: string }> }
) {
  try {
    const { groupId, suggestionId } = await params;
    const token =
      req.headers.get('Authorization')?.replace('Bearer ', '') ||
      req.cookies.get('worshipy_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to review lineups.' },
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
    const action = body.action as 'approve' | 'decline';
    if (action !== 'approve' && action !== 'decline') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "decline".' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const result = reviewSetlistSuggestion(
      user.id,
      groupId,
      suggestionId,
      action,
      body.reviewNote,
      body.clientGroup,
      body.suggestion
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { ok: true, group: result.group },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to review setlist suggestion';
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string; suggestionId: string }> }
) {
  try {
    const { groupId, suggestionId } = await params;
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

    const body = await req.json().catch(() => ({}));
    const result = deleteSetlistSuggestion(user.id, groupId, suggestionId, body.clientGroup);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { ok: true, group: result.group },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete suggestion';
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
