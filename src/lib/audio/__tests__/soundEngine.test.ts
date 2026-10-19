import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GUITAR_OPEN_FREQUENCIES,
  BASS_OPEN_FREQUENCIES,
  noteToFrequency,
  getGuitarChordFrequencies,
  playPluckedTone,
  playContinuousReferenceTone,
  playGuitarChord,
  playPianoChord,
} from '../soundEngine.ts';

describe('Worship Audio & Sound Synthesis Engine', () => {
  it('1. verifies standard 6-string guitar open string frequencies', () => {
    assert.equal(GUITAR_OPEN_FREQUENCIES.length, 6);
    // E2 ~ 82.41 Hz
    assert.ok(Math.abs(GUITAR_OPEN_FREQUENCIES[0] - 82.41) < 0.05);
    // A2 = 110.00 Hz
    assert.ok(Math.abs(GUITAR_OPEN_FREQUENCIES[1] - 110.0) < 0.01);
    // D3 ~ 146.83 Hz
    assert.ok(Math.abs(GUITAR_OPEN_FREQUENCIES[2] - 146.83) < 0.05);
    // G3 ~ 196.00 Hz
    assert.ok(Math.abs(GUITAR_OPEN_FREQUENCIES[3] - 196.0) < 0.05);
    // B3 ~ 246.94 Hz
    assert.ok(Math.abs(GUITAR_OPEN_FREQUENCIES[4] - 246.94) < 0.05);
    // E4 ~ 329.63 Hz
    assert.ok(Math.abs(GUITAR_OPEN_FREQUENCIES[5] - 329.63) < 0.05);
  });

  it('2. verifies standard 4-string bass open string frequencies', () => {
    assert.equal(BASS_OPEN_FREQUENCIES.length, 4);
    // E1 ~ 41.20 Hz
    assert.ok(Math.abs(BASS_OPEN_FREQUENCIES[0] - 41.20) < 0.05);
    // A1 = 55.00 Hz
    assert.ok(Math.abs(BASS_OPEN_FREQUENCIES[1] - 55.0) < 0.01);
    // D2 ~ 73.42 Hz
    assert.ok(Math.abs(BASS_OPEN_FREQUENCIES[2] - 73.42) < 0.05);
    // G2 ~ 98.00 Hz
    assert.ok(Math.abs(BASS_OPEN_FREQUENCIES[3] - 98.0) < 0.05);
  });

  it('3. calculates exact note frequencies with A4 = 440 Hz reference', () => {
    // A4 must be exactly 440.00 Hz
    assert.ok(Math.abs(noteToFrequency('A', 4, 440) - 440.0) < 0.01);
    // A3 must be octave down = 220.00 Hz
    assert.ok(Math.abs(noteToFrequency('A', 3, 440) - 220.0) < 0.01);
    // Middle C (C4) ~ 261.63 Hz
    assert.ok(Math.abs(noteToFrequency('C', 4, 440) - 261.63) < 0.05);
    // E2 ~ 82.41 Hz
    assert.ok(Math.abs(noteToFrequency('E', 2, 440) - 82.41) < 0.05);
  });

  it('4. calculates guitar chord frequencies for standard worship chords', () => {
    // G Major: [3, 2, 0, 0, 3, 3] or [3, 2, 0, 0, 0, 3] -> 6 strings active
    const gFrequencies = getGuitarChordFrequencies('G');
    assert.equal(gFrequencies.length, 6);
    // Low G on 6th string (3rd fret of E2: 82.41 * 2^(3/12) ~ 98.00 Hz)
    assert.ok(Math.abs(gFrequencies[0].frequencyHz - 98.0) < 0.2);

    // C Major: ['x', 3, 2, 0, 1, 0] -> 5 strings active (6th muted)
    const cFrequencies = getGuitarChordFrequencies('C');
    assert.equal(cFrequencies.length, 5);
    assert.equal(cFrequencies[0].stringNumber, 5); // Starts on 5th string (C3 ~ 130.81 Hz)
    assert.ok(Math.abs(cFrequencies[0].frequencyHz - 130.81) < 0.2);

    // D Major: ['x', 'x', 0, 2, 3, 2] -> 4 strings active (6th & 5th muted)
    const dFrequencies = getGuitarChordFrequencies('D');
    assert.equal(dFrequencies.length, 4);
    assert.equal(dFrequencies[0].stringNumber, 4); // Starts on 4th string (D3 = 146.83 Hz)
    assert.ok(Math.abs(dFrequencies[0].frequencyHz - 146.83) < 0.2);
  });

  it('5. handles unknown or non-chord names gracefully', () => {
    const empty = getGuitarChordFrequencies('NON_EXISTENT_CHORD_XYZ');
    assert.deepEqual(empty, []);
  });

  it('6. safely handles playback calls in Node/SSR environment without throwing', () => {
    // In Node (where window.AudioContext is undefined), calls must return valid no-op controllers
    const pluck = playPluckedTone(440);
    assert.equal(typeof pluck.stop, 'function');
    pluck.stop();

    const continuous = playContinuousReferenceTone(440);
    assert.equal(typeof continuous.stop, 'function');
    continuous.stop();

    const chord = playGuitarChord('G');
    assert.equal(typeof chord.stop, 'function');
    chord.stop();

    const piano = playPianoChord('C');
    assert.equal(typeof piano.stop, 'function');
    piano.stop();
  });
});
