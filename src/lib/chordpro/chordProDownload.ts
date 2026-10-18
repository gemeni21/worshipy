import {
  exportSongToChordPro,
  getChordProFilename,
  type ChordProExportOptions,
} from './chordPro.ts';
import type { SongRecord } from '../../types/song.ts';

export interface ChordProDownloadResult {
  ok: boolean;
  filename?: string;
  content?: string;
  error?: string;
}

/**
 * Prepares a valid ChordPro `.cho` string and triggers a browser file download.
 * Defaults to exporting the stored/original chart (semitones = 0).
 */
export function downloadSongAsChordPro(
  song: SongRecord,
  options: ChordProExportOptions = {}
): ChordProDownloadResult {
  if (!song || !song.title || !Array.isArray(song.sections)) {
    return {
      ok: false,
      error: 'Cannot export an invalid or empty song record.',
    };
  }

  try {
    const content = exportSongToChordPro(song, options);
    const filename = getChordProFilename(song.title);

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return {
        ok: true,
        filename,
        content,
      };
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    window.setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 1000);

    return {
      ok: true,
      filename,
      content,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Could not download ChordPro file: ${err.message}`
          : 'Browser blocked or failed to download the ChordPro (.cho) file.',
    };
  }
}
