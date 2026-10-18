import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCentsDifference,
  compareFrequencyToTargetString,
  DEFAULT_A4_HZ,
  DEFAULT_IN_TUNE_TOLERANCE_CENTS,
  detectPitchYin,
  frequencyToNearestNote,
  generateTestWaveform,
  getTuningStatus,
  midiToFrequency,
  noteToReferenceFrequency,
  PitchSmoother,
  STANDARD_BASS_STRINGS,
  STANDARD_GUITAR_STRINGS,
} from '../tunerEngine.ts';
import {
  checkBrowserAudioSupport,
  mapMicrophoneErrorToUserMessage,
  TunerAudioController,
  type MinimalAnalyserNode,
  type MinimalAudioContext,
  type MinimalMediaStream,
  type MinimalMediaStreamSourceNode,
  type MinimalMediaStreamTrack,
  type TunerErrorState,
  type TunerLifecycleState,
} from '../tunerController.ts';

describe('Tuner Pitch, Equal-Temperament Note Conversion & Cents Engine', () => {
  it('1. maps A4 = 440 Hz to A4 with 0 cents deviation and in-tune status', () => {
    const detected = frequencyToNearestNote(440);
    assert.ok(detected);
    assert.equal(detected.noteName, 'A');
    assert.equal(detected.octave, 4);
    assert.equal(detected.noteWithOctave, 'A4');
    assert.equal(detected.midiNote, 69);
    assert.equal(detected.referenceFrequencyHz, 440);
    assert.equal(detected.cents, 0);
    assert.equal(detected.status, 'in-tune');
    assert.equal(detected.statusLabel, 'In tune');
  });

  it('2. maps all standard 6-string guitar target notes (E2, A2, D3, G3, B3, E4) accurately', () => {
    const expectedOrder = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
    assert.deepEqual(
      STANDARD_GUITAR_STRINGS.map((s) => s.noteWithOctave),
      expectedOrder
    );

    for (const preset of STANDARD_GUITAR_STRINGS) {
      const refHz = noteToReferenceFrequency(
        preset.noteName,
        preset.octave,
        DEFAULT_A4_HZ
      );
      assert.ok(refHz !== null);
      assert.ok(
        Math.abs(refHz - preset.frequencyHz) < 0.02,
        `Expected ${preset.noteWithOctave} preset Hz (${preset.frequencyHz}) to match equal-tempered ${refHz}`
      );

      const detected = frequencyToNearestNote(preset.frequencyHz);
      assert.ok(detected);
      assert.equal(detected.noteWithOctave, preset.noteWithOctave);
      assert.equal(detected.noteName, preset.noteName);
      assert.equal(detected.octave, preset.octave);
      assert.equal(detected.status, 'in-tune');
      assert.ok(Math.abs(detected.cents) <= 0.2);
    }
  });

  it('3. maps all standard 4-string bass target notes (E1, A1, D2, G2) accurately, including low E1 (~41.20 Hz)', () => {
    const expectedOrder = ['E1', 'A1', 'D2', 'G2'];
    assert.deepEqual(
      STANDARD_BASS_STRINGS.map((s) => s.noteWithOctave),
      expectedOrder
    );

    const lowE1 = STANDARD_BASS_STRINGS[0];
    assert.equal(lowE1.noteWithOctave, 'E1');
    assert.equal(lowE1.midiNote, 28);

    for (const preset of STANDARD_BASS_STRINGS) {
      const refHz = noteToReferenceFrequency(
        preset.noteName,
        preset.octave,
        DEFAULT_A4_HZ
      );
      assert.ok(refHz !== null);
      assert.ok(Math.abs(refHz - preset.frequencyHz) < 0.02);

      const detected = frequencyToNearestNote(preset.frequencyHz);
      assert.ok(detected);
      assert.equal(detected.noteWithOctave, preset.noteWithOctave);
      assert.equal(detected.status, 'in-tune');
      assert.ok(Math.abs(detected.cents) <= 0.2);
    }
  });

  it('4. calculates flat (-) and sharp (+) cents signs and target-string comparisons accurately', () => {
    // 15 cents flat below A2 (110 Hz)
    const flatA2Hz = 110 * Math.pow(2, -15 / 1200);
    const flatDetected = frequencyToNearestNote(flatA2Hz);
    assert.ok(flatDetected);
    assert.equal(flatDetected.noteWithOctave, 'A2');
    assert.equal(flatDetected.cents, -15);
    assert.equal(flatDetected.status, 'flat');
    assert.equal(flatDetected.statusLabel, 'Too flat');

    // +18 cents sharp above A2 (110 Hz)
    const sharpA2Hz = 110 * Math.pow(2, 18 / 1200);
    const sharpDetected = frequencyToNearestNote(sharpA2Hz);
    assert.ok(sharpDetected);
    assert.equal(sharpDetected.noteWithOctave, 'A2');
    assert.equal(sharpDetected.cents, 18);
    assert.equal(sharpDetected.status, 'sharp');
    assert.equal(sharpDetected.statusLabel, 'Too sharp');

    // Compare against selected Guitar 5th string (A2)
    const guitarA2 = STANDARD_GUITAR_STRINGS[1];
    const cmp = compareFrequencyToTargetString(flatA2Hz, guitarA2);
    assert.ok(cmp);
    assert.equal(cmp.centsFromTarget, -15);
    assert.equal(cmp.status, 'flat');
    assert.equal(cmp.isNearTargetString, true);
  });

  it('5. enforces inclusive ±5 cents in-tune threshold consistently at exact boundaries', () => {
    assert.equal(DEFAULT_IN_TUNE_TOLERANCE_CENTS, 5);
    assert.equal(getTuningStatus(0), 'in-tune');
    assert.equal(getTuningStatus(-5.0), 'in-tune');
    assert.equal(getTuningStatus(5.0), 'in-tune');
    assert.equal(getTuningStatus(-5.1), 'flat');
    assert.equal(getTuningStatus(5.1), 'sharp');
  });

  it('6. handles invalid, non-positive, NaN, infinite, and out-of-range frequencies safely without throwing', () => {
    const invalidInputs = [
      0,
      -1,
      -440,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      10, // below MIN_DETECTABLE_FREQUENCY_HZ (30 Hz)
      5000, // above MAX_DETECTABLE_FREQUENCY_HZ (1400 Hz)
    ];

    for (const val of invalidInputs) {
      assert.equal(frequencyToNearestNote(val), null);
    }

    assert.equal(calculateCentsDifference(0, 440), null);
    assert.equal(calculateCentsDifference(440, -10), null);
    assert.equal(calculateCentsDifference(Number.NaN, 440), null);
    assert.equal(noteToReferenceFrequency('H', 4), null);
  });

  it('7. respects sharp and flat note-name spelling policies consistently', () => {
    // MIDI 61 = C#4 / Db4
    const cSharp4Hz = midiToFrequency(61, 440);
    const asSharp = frequencyToNearestNote(cSharp4Hz, { spelling: 'sharp' });
    const asFlat = frequencyToNearestNote(cSharp4Hz, { spelling: 'flat' });

    assert.ok(asSharp);
    assert.ok(asFlat);
    assert.equal(asSharp.noteWithOctave, 'C#4');
    assert.equal(asFlat.noteWithOctave, 'Db4');

    // MIDI 70 = A#4 / Bb4
    const bFlat4Hz = midiToFrequency(70, 440);
    assert.equal(
      frequencyToNearestNote(bFlat4Hz, { spelling: 'sharp' })?.noteWithOctave,
      'A#4'
    );
    assert.equal(
      frequencyToNearestNote(bFlat4Hz, { spelling: 'flat' })?.noteWithOctave,
      'Bb4'
    );
  });

  it('8. detects pitch accurately from synthetic waveforms across guitar and bass strings (including low Bass E1 with harmonics) and rejects silence/noise', () => {
    const sampleRate = 48000;

    // Test all 4 standard bass strings (E1 = 41.20 Hz, A1 = 55 Hz, D2 = 73.42 Hz, G2 = 98 Hz)
    // with realistic 2nd and 3rd harmonic overtones
    for (const bassString of STANDARD_BASS_STRINGS) {
      const exactHz = midiToFrequency(bassString.midiNote, 440);
      const waveform = generateTestWaveform({
        frequencyHz: exactHz,
        sampleRate,
        length: 8192,
        amplitude: 0.45,
        secondHarmonicRatio: 0.6,
        thirdHarmonicRatio: 0.3,
      });

      const yinResult = detectPitchYin(waveform, sampleRate);
      assert.ok(
        yinResult,
        `Expected YIN to detect bass string ${bassString.noteWithOctave} (${exactHz.toFixed(2)} Hz)`
      );
      const noteInfo = frequencyToNearestNote(yinResult.frequencyHz);
      assert.ok(noteInfo);
      assert.equal(noteInfo.noteWithOctave, bassString.noteWithOctave);
      assert.ok(
        Math.abs(noteInfo.cents) <= 1.5,
        `Expected < 1.5 cents error on ${bassString.noteWithOctave}, got ${noteInfo.cents} cents`
      );
    }

    // Test all 6 standard guitar strings (E2 through E4)
    for (const guitarString of STANDARD_GUITAR_STRINGS) {
      const exactHz = midiToFrequency(guitarString.midiNote, 440);
      const waveform = generateTestWaveform({
        frequencyHz: exactHz,
        sampleRate,
        length: 8192,
        amplitude: 0.4,
        secondHarmonicRatio: 0.4,
      });

      const yinResult = detectPitchYin(waveform, sampleRate);
      assert.ok(yinResult);
      const noteInfo = frequencyToNearestNote(yinResult.frequencyHz);
      assert.ok(noteInfo);
      assert.equal(noteInfo.noteWithOctave, guitarString.noteWithOctave);
      assert.ok(Math.abs(noteInfo.cents) <= 1.5);
    }

    // Silence must return null
    const silence = new Float32Array(8192);
    assert.equal(detectPitchYin(silence, sampleRate), null);

    // PitchSmoother reduces jitter and resets immediately on string switch
    const smoother = new PitchSmoother(5, 0.4);
    const s1 = smoother.push(110.0);
    const s2 = smoother.push(110.2);
    assert.ok(s1 === 110.0 && s2 > 110.0 && s2 < 110.2);
    // Switching to G3 (196 Hz) resets immediately without lagging in between
    const afterStringJump = smoother.push(196.0);
    assert.equal(afterStringJump, 196.0);
  });

  it('9. manages microphone tracks, AudioContext, and timers without resource leaks or duplicate streams on rapid start/stop', async () => {
    let createdStreams = 0;
    let stoppedTracks = 0;
    let closedContexts = 0;
    let clearedIntervals = 0;
    let trackListenersAdded = 0;
    let trackListenersRemoved = 0;

    const mockEnv = {
      isSecureContext: true,
      getUserMedia: async (): Promise<MinimalMediaStream> => {
        createdStreams++;
        await new Promise((r) => setTimeout(r, 10));
        const track: MinimalMediaStreamTrack = {
          stop: () => {
            stoppedTracks++;
          },
          addEventListener: () => {
            trackListenersAdded++;
          },
          removeEventListener: () => {
            trackListenersRemoved++;
          },
        };
        return {
          getTracks: () => [track],
        };
      },
      createAudioContext: (): MinimalAudioContext => {
        return {
          sampleRate: 48000,
          state: 'running',
          resume: async () => {},
          close: async () => {
            closedContexts++;
          },
          createAnalyser: (): MinimalAnalyserNode => ({
            fftSize: 8192,
            smoothingTimeConstant: 0,
            getFloatTimeDomainData: () => {},
            disconnect: () => {},
          }),
          createMediaStreamSource: (): MinimalMediaStreamSourceNode => ({
            connect: () => {},
            disconnect: () => {},
          }),
          addEventListener: () => {},
          removeEventListener: () => {},
        };
      },
      requestInterval: () => 12345,
      clearIntervalFn: () => {
        clearedIntervals++;
      },
    };

    const states: TunerLifecycleState[] = [];
    const controller = new TunerAudioController(
      {
        onLifecycleChange: (st) => states.push(st),
      },
      mockEnv
    );

    // Rapid concurrent start() calls must only open ONE stream
    const [r1, r2] = await Promise.all([
      controller.start(),
      controller.start(),
    ]);
    assert.equal(r1, true);
    assert.equal(r2, false);
    assert.equal(createdStreams, 1);
    assert.equal(controller.getState().lifecycleState, 'listening');

    // Stopping cleans up track, AudioContext, interval, and event listeners
    await controller.stop();
    assert.equal(controller.getState().lifecycleState, 'stopped');
    assert.equal(stoppedTracks, 1);
    assert.equal(closedContexts, 1);
    assert.equal(clearedIntervals, 1);
    assert.equal(trackListenersAdded, 1);
    assert.equal(trackListenersRemoved, 1);
  });

  it('10. surfaces clear recovery messages for permission denial, missing microphone, busy device, and insecure context', () => {
    const denied = mapMicrophoneErrorToUserMessage({
      name: 'NotAllowedError',
    });
    assert.equal(denied.code, 'PERMISSION_DENIED');
    assert.match(denied.message, /Microphone access was denied/i);

    const notFound = mapMicrophoneErrorToUserMessage({
      name: 'NotFoundError',
    });
    assert.equal(notFound.code, 'NO_MICROPHONE_FOUND');
    assert.match(notFound.message, /No microphone was found/i);

    const busy = mapMicrophoneErrorToUserMessage({
      name: 'NotReadableError',
    });
    assert.equal(busy.code, 'MICROPHONE_BUSY');
    assert.match(busy.message, /being used by another application/i);

    const insecure: TunerErrorState | null = checkBrowserAudioSupport({
      isSecureContext: false,
    });
    assert.ok(insecure);
    assert.equal(insecure.code, 'INSECURE_CONTEXT');
    assert.match(insecure.message, /secure context/i);
  });
});
