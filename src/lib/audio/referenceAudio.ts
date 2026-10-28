/**
 * Reference Audio & Rehearsal Link Engine
 *
 * Provides utilities for handling reference audio links (YouTube, Google Drive,
 * Dropbox, OneDrive, direct audio files) for setlist rehearsal and sifra.
 * Enables 100% free ($0.00 cloud storage) audio playback with waveform scrubbing.
 */

import { resolvePlaybackUrl } from './practiceStorage.ts';

/**
 * Extracts a YouTube 11-character video ID from any valid YouTube URL format.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 * - https://music.youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - Plain 11-character video IDs
 */
export function extractYouTubeVideoId(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // If already a raw 11-character ID (alphanumeric, -, _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const regExp = /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
  const match = trimmed.match(regExp);
  return match && match[1] ? match[1] : null;
}

export function isYouTubeUrl(url: string | undefined | null): boolean {
  return extractYouTubeVideoId(url) !== null;
}

export type ReferenceAudioSourceType = 'youtube' | 'gdrive' | 'dropbox' | 'onedrive' | 'direct' | 'none';

export function getAudioSourceType(url: string | undefined | null): ReferenceAudioSourceType {
  if (!url || !url.trim()) return 'none';
  const trimmed = url.trim();

  if (isYouTubeUrl(trimmed)) return 'youtube';
  if (trimmed.includes('drive.google.com') || trimmed.includes('drive.usercontent.google.com')) return 'gdrive';
  if (trimmed.includes('dropbox.com')) return 'dropbox';
  if (trimmed.includes('1drv.ms') || trimmed.includes('onedrive.live.com')) return 'onedrive';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) return 'direct';

  return 'none';
}

export function getAudioSourceLabel(url: string | undefined | null): string {
  const type = getAudioSourceType(url);
  switch (type) {
    case 'youtube':
      return 'YouTube (Audio Only)';
    case 'gdrive':
      return 'Google Drive Audio';
    case 'dropbox':
      return 'Dropbox Audio';
    case 'onedrive':
      return 'OneDrive Audio';
    case 'direct':
      return 'Direct Audio Stream';
    default:
      return 'Audio Link';
  }
}

/**
 * Resolves a reference URL to either a YouTube Video ID or a browser-playable audio URL
 */
export function resolveReferencePlayback(url: string | undefined | null): {
  type: 'youtube' | 'audio' | 'none';
  videoId?: string;
  streamUrl?: string;
  sourceType: ReferenceAudioSourceType;
} {
  const sourceType = getAudioSourceType(url);
  if (sourceType === 'none') {
    return { type: 'none', sourceType: 'none' };
  }

  if (sourceType === 'youtube') {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      return { type: 'youtube', videoId, sourceType: 'youtube' };
    }
  }

  const streamUrl = resolvePlaybackUrl(url);
  if (streamUrl) {
    return { type: 'audio', streamUrl, sourceType };
  }

  return { type: 'none', sourceType: 'none' };
}

/**
 * Generates deterministic visual waveform peaks (0.15 - 1.0) seeded by a URL or song title.
 * Models a realistic musical worship song dynamic envelope (intro, verse, chorus swells, bridge build, outro).
 */
export function generateDeterministicPeaks(seed: string, count = 48): number[] {
  let hash = 0;
  const str = seed || 'worshipy_reference_audio';
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const progress = i / count;
    // Musical dynamic curve: builds from intro into verse & chorus, reaches climax around 70-80% (bridge), fades at outro
    const arc =
      0.35 +
      0.28 * Math.sin(progress * Math.PI) +
      0.18 * Math.sin(progress * Math.PI * 3);
    const pseudoRandom = Math.abs(Math.sin((hash + i * 19) * 997)) * 0.32;
    const val = Math.max(0.18, Math.min(0.98, arc + pseudoRandom));
    peaks.push(Math.round(val * 100) / 100);
  }
  return peaks;
}

// Global YouTube IFrame API script loader with single-promise guarantee
let ytApiPromise: Promise<any> | null = null;

export function loadYouTubeIFrameApi(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window not available in SSR'));
  }

  const win = window as any;
  if (win.YT && win.YT.Player) {
    return Promise.resolve(win.YT);
  }

  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise((resolve, reject) => {
    // If tag doesn't exist, inject it
    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube IFrame Player API.'));
      };
      document.head.appendChild(tag);
    }

    const prevReady = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch {}
      }
      resolve(win.YT);
    };

    // Polling fallback in case onYouTubeIframeAPIReady fired before callback was attached
    const interval = setInterval(() => {
      if (win.YT && win.YT.Player) {
        clearInterval(interval);
        resolve(win.YT);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      if (win.YT && win.YT.Player) {
        resolve(win.YT);
      } else {
        ytApiPromise = null;
        reject(new Error('YouTube IFrame API load timeout.'));
      }
    }, 10000);
  });

  return ytApiPromise;
}
