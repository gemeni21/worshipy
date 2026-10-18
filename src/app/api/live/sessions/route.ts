import { NextRequest, NextResponse } from 'next/server';
import {
  createLiveSession,
  LiveSyncError,
} from '@/lib/live/liveSessionServer';
import type { CreateLiveSessionInput } from '@/types/live';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateLiveSessionInput;
    const result = createLiveSession(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof LiveSyncError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create live session.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
