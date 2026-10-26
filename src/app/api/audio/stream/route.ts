import { NextRequest, NextResponse } from 'next/server';

/**
 * Universal Cloud Audio Streaming Proxy
 *
 * Resolves CORS and Cross-Origin-Resource-Policy (CORP) restrictions from cloud providers
 * like Google Drive, Dropbox, and OneDrive, and forwards HTTP Range requests for seamless
 * native audio seeking and scrubbing.
 */
export async function GET(req: NextRequest) {
  return handleAudioStream(req, false);
}

export async function HEAD(req: NextRequest) {
  return handleAudioStream(req, true);
}

async function handleAudioStream(req: NextRequest, isHead: boolean) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');
    const rawUrl = searchParams.get('url');

    let targetUrl: string | null = null;

    // 1. Google Drive by ID or URL
    const gDriveId =
      id ||
      (rawUrl
        ? rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
          rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]
        : null);

    if (gDriveId) {
      targetUrl = `https://drive.usercontent.google.com/download?id=${gDriveId}&export=download&confirm=t`;
    } else if (rawUrl) {
      targetUrl = rawUrl;
    }

    if (!targetUrl) {
      return NextResponse.json(
        { error: 'Missing required "url" or "id" parameter.' },
        { status: 400 }
      );
    }

    // 2. Prepare headers with Range forwarding
    const forwardHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: '*/*',
    };

    const clientRange = req.headers.get('range');
    if (clientRange) {
      forwardHeaders['Range'] = clientRange;
    }

    // 3. Fetch from remote cloud provider
    const upstream = await fetch(targetUrl, {
      method: isHead ? 'HEAD' : 'GET',
      headers: forwardHeaders,
      redirect: 'follow',
    });

    // 4. Validate upstream response
    if (upstream.status === 404) {
      return NextResponse.json(
        { error: 'Audio file not found. Please verify the sharing link.' },
        { status: 404 }
      );
    }

    if (upstream.status === 403) {
      return NextResponse.json(
        {
          error:
            'Cloud file is private or restricted. In Google Drive, ensure general access is set to "Anyone with the link can view".',
        },
        { status: 403 }
      );
    }

    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';

    // If Google Drive returns HTML, it usually indicates a login screen, permissions error, or quota exceeded
    if (contentType.includes('text/html') && !isHead) {
      return NextResponse.json(
        {
          error:
            'Unable to stream audio from Google Drive. Ensure the file sharing is set to "Anyone with the link" and the file is an audio format (.mp3, .m4a, .wav).',
        },
        { status: 400 }
      );
    }

    // 5. Construct streaming response headers
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType.startsWith('text/') ? 'audio/mpeg' : contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range');
    responseHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
    responseHeaders.set('Content-Disposition', 'inline');
    responseHeaders.set('Cache-Control', 'public, max-age=3600');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    if (isHead) {
      return new Response(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'digest' in err &&
      (err as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED'
    ) {
      throw err;
    }
    console.error('Audio streaming proxy error:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Internal error while streaming audio from remote source.',
      },
      { status: 500 }
    );
  }
}
