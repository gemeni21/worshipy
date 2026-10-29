import { NextRequest, NextResponse } from 'next/server';
import {
  LiveSyncError,
  subscribeToLiveSession,
} from '@/lib/live/liveSessionServer';
import type { LiveStreamMessage } from '@/types/live';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const authHeader = req.headers.get('authorization');
    const token =
      authHeader && authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : req.nextUrl.searchParams.get('token') ?? '';

    const encoder = new TextEncoder();
    let cleanupFn: (() => void) | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Immediate flush byte so EventSource onopen triggers instantaneously
        try {
          controller.enqueue(encoder.encode(': stream-ready\n\n'));
        } catch {}

        const sendEvent = (msg: LiveStreamMessage) => {
          try {
            const payload = `data: ${JSON.stringify(msg)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch {
            // Stream closed
          }
        };

        const { initialSnapshot, unsubscribe } = subscribeToLiveSession(
          sessionId,
          token,
          (msg) => {
            sendEvent(msg);
          }
        );

        // Send initial snapshot immediately upon connection
        sendEvent({
          type: 'snapshot',
          revision: initialSnapshot.revision,
          timestamp: new Date().toISOString(),
          session: initialSnapshot,
        });

        const heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          } catch {
            clearInterval(heartbeatTimer);
          }
        }, 12000);

        cleanupFn = () => {
          clearInterval(heartbeatTimer);
          unsubscribe();
        };

        req.signal.addEventListener('abort', () => {
          if (cleanupFn) {
            cleanupFn();
            cleanupFn = null;
          }
          try {
            controller.close();
          } catch {
            // Ignore already closed
          }
        });
      },
      cancel() {
        if (cleanupFn) {
          cleanupFn();
          cleanupFn = null;
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    if (err instanceof LiveSyncError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to establish live session stream.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
