import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPracticeDbSupported,
  getPracticeTakesForSong,
  getAllPracticeTakes,
  savePracticeTake,
  deletePracticeTake,
  updatePracticeTakeNotes,
  transformCloudAudioUrl,
  type PracticeTake,
} from '../practiceStorage.ts';
import { PracticeAudioRecorder } from '../practiceRecorder.ts';

describe('Practice Audio Storage & Recording Engine', () => {
  it('1. handles practice storage operations safely in Node / SSR environment without throwing', async () => {
    assert.equal(isPracticeDbSupported(), false);

    const songTakes = await getPracticeTakesForSong('goodness-of-god');
    assert.deepEqual(songTakes, []);

    const allTakes = await getAllPracticeTakes();
    assert.deepEqual(allTakes, []);

    const mockTake: PracticeTake = {
      id: 'test-123',
      songSlug: 'goodness-of-god',
      songTitle: 'Goodness of God',
      key: 'G',
      durationSeconds: 45,
      createdAt: Date.now(),
      blob: new Blob([]),
      mimeType: 'audio/webm',
      waveformPeaks: [0.2, 0.5, 0.8],
    };

    const saveRes = await savePracticeTake(mockTake);
    assert.equal(saveRes.ok, false);
    assert.ok(saveRes.error?.includes('IndexedDB is not supported'));

    const delRes = await deletePracticeTake('test-123');
    assert.equal(delRes.ok, false);

    const updateRes = await updatePracticeTakeNotes('test-123', 'Great vocal take!');
    assert.equal(updateRes.ok, false);
  });

  it('2. resamples and normalizes waveform peaks correctly', () => {
    const recorder = new PracticeAudioRecorder();

    // Empty or missing peaks should return targetCount of baseline heights
    const emptyPeaks = recorder.normalizeWaveformPeaks([]);
    assert.equal(emptyPeaks.length, 64);
    assert.ok(emptyPeaks.every((p) => p >= 0.12 && p <= 1.0));

    // Array of variable raw peaks
    const rawSamples = [0.05, 0.2, 0.4, 0.85, 0.95, 0.3, 0.1, 0.6, 0.75, 0.15];
    const normalized = recorder.normalizeWaveformPeaks(rawSamples, 10);
    assert.equal(normalized.length, 10);
    assert.ok(normalized.every((p) => p >= 0.12 && p <= 1.0));

    // Peak values should reflect input amplitude
    assert.ok(normalized[4] >= 0.8, 'High amplitude input should produce high normalized peak');
  });

  it('3. manages subscriber lifecycle and initial state correctly', () => {
    const recorder = new PracticeAudioRecorder();
    let stateUpdates = 0;
    let latestStatus = '';

    const unsubscribe = recorder.subscribe((state) => {
      stateUpdates++;
      latestStatus = state.status;
    });

    assert.equal(latestStatus, 'idle');
    assert.equal(stateUpdates, 1);

    const state = recorder.getState();
    assert.equal(state.status, 'idle');
    assert.equal(state.durationSeconds, 0);
    assert.equal(state.volumeLevel, 0);

    unsubscribe();
  });

  it('4. throws clear friendly error when starting recording without browser mediaDevices', async () => {
    const recorder = new PracticeAudioRecorder();
    await assert.rejects(
      async () => {
        await recorder.start();
      },
      {
        message: /Audio recording is not supported in this browser/,
      }
    );
  });

  it('5. transforms Google Drive, Dropbox, and cloud audio links to direct streaming endpoints', () => {
    // Google Drive share link
    const gDrive1 = transformCloudAudioUrl(
      'https://drive.google.com/file/d/1XyZ9abc123DEF456/view?usp=sharing'
    );
    assert.equal(gDrive1.provider, 'gdrive');
    assert.equal(
      gDrive1.streamUrl,
      'https://drive.google.com/uc?export=download&id=1XyZ9abc123DEF456'
    );

    // Google Drive open?id link
    const gDrive2 = transformCloudAudioUrl('https://drive.google.com/open?id=MY_FILE_ID_789');
    assert.equal(gDrive2.provider, 'gdrive');
    assert.equal(
      gDrive2.streamUrl,
      'https://drive.google.com/uc?export=download&id=MY_FILE_ID_789'
    );

    // Dropbox dl=0 link
    const dropbox = transformCloudAudioUrl('https://www.dropbox.com/s/xyz123/rehearsal.mp3?dl=0');
    assert.equal(dropbox.provider, 'dropbox');
    assert.equal(dropbox.streamUrl, 'https://www.dropbox.com/s/xyz123/rehearsal.mp3?raw=1');

    // Direct MP3 URL
    const direct = transformCloudAudioUrl('https://cdn.example.com/audio/practice-take.mp3');
    assert.equal(direct.provider, 'direct');
    assert.equal(direct.streamUrl, 'https://cdn.example.com/audio/practice-take.mp3');

    // Empty or invalid URL
    const empty = transformCloudAudioUrl('   ');
    assert.equal(empty.provider, 'unknown');
    assert.equal(empty.streamUrl, '');
  });
});
