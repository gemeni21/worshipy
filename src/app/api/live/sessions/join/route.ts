import { NextRequest, NextResponse } from 'next/server';
import {
  joinLiveSession,
  LiveSyncError,
} from '@/lib/live/liveSessionServer';
import type { JoinLiveSessionInput } from '@/types/live';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as JoinLiveSessionInput;
    const result = joinLiveSession(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof LiveSyncError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to join live session.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
