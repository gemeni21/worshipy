import { NextRequest, NextResponse } from 'next/server';
import {
  endLiveSession,
  getLiveSessionSnapshot,
  LiveSyncError,
  proposeLiveSessionArrangement,
  reviewLiveSessionArrangement,
  transferSessionLeadership,
  updateLiveSessionState,
  updateParticipantPresence,
} from '@/lib/live/liveSessionServer';
import { validateSessionToken } from '@/lib/cloud/cloudDb';
import type {
  InstrumentViewMode,
  ParticipantConnectionState,
  UpdateSharedStateInput,
} from '@/types/live';

function extractParticipantToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.nextUrl.searchParams.get('token') ?? '';
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const token = extractParticipantToken(req);
    const snapshot = getLiveSessionSnapshot(sessionId, token);
    return NextResponse.json(snapshot, { status: 200 });
  } catch (err) {
    if (err instanceof LiveSyncError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          ...(err.latestSession ? { session: err.latestSession } : {}),
        },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to load live session snapshot.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

interface PatchSessionBody {
  action:
    | 'update-state'
    | 'transfer-leadership'
    | 'update-presence'
    | 'propose-arrangement'
    | 'review-arrangement'
    | 'end-session';
  state?: UpdateSharedStateInput;
  targetParticipantId?: string;
  leadershipAction?: 'make-leader' | 'toggle-co-leader';
  instrument?: InstrumentViewMode;
  connectionState?: ParticipantConnectionState;
  proposal?: {
    songId: string;
    songTitle?: string;
    instrument?: InstrumentViewMode;
    chordPro: string;
    arrangementNote?: string;
  };
  review?: {
    proposalId: string;
    decision: 'approve' | 'decline';
    approvedScope?: InstrumentViewMode;
    reviewNote?: string;
    saveToChurchGroup?: boolean;
  };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const token = extractParticipantToken(req);
    const body = (await req.json()) as PatchSessionBody;

    if (body.action === 'update-state') {
      const stateInput = body.state ?? (body as any).statePatch ?? {};
      const updated = updateLiveSessionState(
        sessionId,
        token,
        stateInput
      );
      return NextResponse.json({ session: updated }, { status: 200 });
    }

    if (body.action === 'transfer-leadership') {
      if (!body.targetParticipantId) {
        return NextResponse.json(
          {
            error: 'targetParticipantId is required.',
            code: 'INVALID_INPUT',
          },
          { status: 400 }
        );
      }
      const updated = transferSessionLeadership(
        sessionId,
        token,
        body.targetParticipantId,
        body.leadershipAction ?? 'make-leader'
      );
      return NextResponse.json({ session: updated }, { status: 200 });
    }

    if (body.action === 'update-presence') {
      const updated = updateParticipantPresence(sessionId, token, {
        instrument: body.instrument,
        connectionState: body.connectionState,
      });
      return NextResponse.json({ session: updated }, { status: 200 });
    }

    if (body.action === 'propose-arrangement') {
      if (!body.proposal || !body.proposal.songId || !body.proposal.chordPro) {
        return NextResponse.json(
          {
            error: 'proposal.songId and proposal.chordPro are required.',
            code: 'INVALID_INPUT',
          },
          { status: 400 }
        );
      }
      const res = proposeLiveSessionArrangement(sessionId, token, body.proposal);
      return NextResponse.json(res, { status: 200 });
    }

    if (body.action === 'review-arrangement') {
      if (!body.review || !body.review.proposalId || !body.review.decision) {
        return NextResponse.json(
          {
            error: 'review.proposalId and review.decision are required.',
            code: 'INVALID_INPUT',
          },
          { status: 400 }
        );
      }
      const updated = reviewLiveSessionArrangement(sessionId, token, body.review);
      return NextResponse.json({ session: updated }, { status: 200 });
    }

    if (body.action === 'end-session') {
      let isLeaderUser = false;
      if (token) {
        const user = validateSessionToken(token);
        if (user && (user.groupRole === 'leader' || user.role === 'admin')) {
          isLeaderUser = true;
        }
      }
      const updated = endLiveSession(sessionId, token, {
        isAuthorizedLeader: isLeaderUser,
      });
      return NextResponse.json({ session: updated }, { status: 200 });
    }

    return NextResponse.json(
      { error: 'Unsupported action.', code: 'INVALID_ACTION' },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof LiveSyncError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          ...(err.latestSession ? { session: err.latestSession } : {}),
        },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to process live session update.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
