import { NextRequest, NextResponse } from 'next/server';
import { getActiveSessionInfo } from '@/lib/live/liveSessionServer';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const groupId = searchParams.get('groupId') || undefined;
    const joinCode = searchParams.get('joinCode') || undefined;
    const sessionId = searchParams.get('sessionId') || undefined;

    const result = getActiveSessionInfo({ groupId, joinCode, sessionId });
    return NextResponse.json(result, { status: 200, headers: NO_CACHE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to query active live session';
    return NextResponse.json(
      { active: false, error: msg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
