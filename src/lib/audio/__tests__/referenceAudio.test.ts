import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeVideoId,
  isYouTubeUrl,
  getAudioSourceType,
  getAudioSourceLabel,
  resolveReferencePlayback,
  generateDeterministicPeaks,
} from '../referenceAudio.ts';

describe('Reference Audio & YouTube Link Engine', () => {
  it('1. correctly extracts YouTube video IDs from various URL formats', () => {
    const testCases: [string, string][] = [
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'dQw4w9WgXcQ'],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ?t=43s', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/v/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=xyz123', 'dQw4w9WgXcQ'],
      ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'], // raw 11-char ID
    ];

    for (const [url, expectedId] of testCases) {
      assert.equal(
        extractYouTubeVideoId(url),
        expectedId,
        `Failed to extract ID from: ${url}`
      );
      assert.equal(isYouTubeUrl(url), true, `Failed isYouTubeUrl for: ${url}`);
    }
  });

  it('2. safely returns null for non-YouTube URLs or invalid strings', () => {
    assert.equal(extractYouTubeVideoId(null), null);
    assert.equal(extractYouTubeVideoId(''), null);
    assert.equal(extractYouTubeVideoId('   '), null);
    assert.equal(
      extractYouTubeVideoId(
        'https://drive.google.com/file/d/1B2C3D4E5F6G7H8I9J0K/view?usp=sharing'
      ),
      null
    );
    assert.equal(
      extractYouTubeVideoId('https://www.dropbox.com/s/12345/song.mp3?dl=0'),
      null
    );
    assert.equal(extractYouTubeVideoId('https://example.com/audio.mp3'), null);
    assert.equal(isYouTubeUrl('https://example.com/song.mp3'), false);
  });

  it('3. accurately classifies source types and user-facing labels', () => {
    assert.equal(
      getAudioSourceType('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'youtube'
    );
    assert.equal(
      getAudioSourceLabel('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'YouTube (Audio Only)'
    );

    assert.equal(
      getAudioSourceType('https://drive.google.com/file/d/1B2C3D/view'),
      'gdrive'
    );
    assert.equal(
      getAudioSourceLabel('https://drive.google.com/file/d/1B2C3D/view'),
      'Google Drive Audio'
    );

    assert.equal(
      getAudioSourceType('https://www.dropbox.com/s/xyz/take.mp3?dl=0'),
      'dropbox'
    );
    assert.equal(
      getAudioSourceLabel('https://www.dropbox.com/s/xyz/take.mp3?dl=0'),
      'Dropbox Audio'
    );

    assert.equal(
      getAudioSourceType('https://1drv.ms/u/s!Ambc...'),
      'onedrive'
    );

    assert.equal(
      getAudioSourceType('https://cdn.example.com/audio/praise.mp3'),
      'direct'
    );

    assert.equal(getAudioSourceType(''), 'none');
    assert.equal(getAudioSourceType(null), 'none');
  });

  it('4. resolves reference playback config for YouTube and cloud streams', () => {
    const ytRes = resolveReferencePlayback('https://youtu.be/dQw4w9WgXcQ');
    assert.equal(ytRes.type, 'youtube');
    assert.equal(ytRes.videoId, 'dQw4w9WgXcQ');

    const gDriveRes = resolveReferencePlayback(
      'https://drive.google.com/file/d/1A2B3C4D5E/view?usp=sharing'
    );
    assert.equal(gDriveRes.type, 'audio');
    assert.equal(gDriveRes.sourceType, 'gdrive');
    assert.match(gDriveRes.streamUrl || '', /\/api\/audio\/stream\?id=1A2B3C4D5E/);

    const emptyRes = resolveReferencePlayback('');
    assert.equal(emptyRes.type, 'none');
  });

  it('5. produces deterministic, bounded visual waveform peaks', () => {
    const peaksA = generateDeterministicPeaks('https://youtu.be/dQw4w9WgXcQ', 48);
    const peaksB = generateDeterministicPeaks('https://youtu.be/dQw4w9WgXcQ', 48);

    assert.equal(peaksA.length, 48);
    assert.deepEqual(peaksA, peaksB, 'Same URL must produce identical waveform peaks');

    for (const val of peaksA) {
      assert.ok(val >= 0.15 && val <= 1.0, `Peak value ${val} must be in [0.15, 1.0]`);
    }

    const peaksDiff = generateDeterministicPeaks('https://youtu.be/another_video', 48);
    assert.notDeepEqual(peaksA, peaksDiff, 'Different URLs should have distinct waveform shapes');
  });
});
