/**
 * Worship Audio & Instrument Sound Synthesis Engine
 *
 * Pure Web Audio API tone generator for:
 * 1. Tuner reference pitch pipe & plucked string tones (Guitar E2-E4, Bass E1-G2, Chromatic)
 * 2. Authentic acoustic guitar chord strumming
 * 3. Piano chord voicing playback
 *
 * 100% offline, zero external audio samples or network latency.
 */

import {
  getGuitarChordDiagram,
  getPianoKeysForChord,
} from '../music/chordDiagrams.ts';

// Standard 6-string guitar open string frequencies at A4 = 440 Hz
export const GUITAR_OPEN_FREQUENCIES: readonly number[] = [
  82.4069,  // String 6 (Low E2)
  110.0,    // String 5 (A2)
  146.8324, // String 4 (D3)
  195.9977, // String 3 (G3)
  246.9417, // String 2 (B3)
  329.6276, // String 1 (High E4)
];

// Standard 4-string bass open string frequencies at A4 = 440 Hz
export const BASS_OPEN_FREQUENCIES: readonly number[] = [
  41.2034, // String 4 (Low E1)
  55.0,    // String 3 (A1)
  73.4162, // String 2 (D2)
  97.9989, // String 1 (G2)
];

// Note name to standard octave 4 semitone offset from C4 (0)
const NOTE_SEMITONES: Record<string, number> = {
  Cb: -1,
  C: 0,
  'B#': 12,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

/**
 * Calculates frequency for any note and octave at A4 = 440 Hz.
 */
export function noteToFrequency(noteName: string, octave: number = 4, referenceA4Hz: number = 440): number {
  const semitone = NOTE_SEMITONES[noteName] ?? 0;
  // MIDI note for C4 is 60, A4 is 69
  const midi = 12 + octave * 12 + semitone;
  return referenceA4Hz * Math.pow(2, (midi - 69) / 12);
}

/**
 * Calculates the exact frequencies for an acoustic guitar chord voicing.
 * Returns array of Hz frequencies for strings that are not muted ('x').
 */
export function getGuitarChordFrequencies(chordName: string): { stringNumber: number; fret: number; frequencyHz: number }[] {
  const diagram = getGuitarChordDiagram(chordName);
  if (!diagram) return [];

  const results: { stringNumber: number; fret: number; frequencyHz: number }[] = [];

  for (let i = 0; i < 6; i++) {
    const fret = diagram.frets[i];
    if (fret === 'x') continue;

    const baseFreq = GUITAR_OPEN_FREQUENCIES[i];
    const stringNumber = 6 - i;
    const freq = baseFreq * Math.pow(2, fret / 12);
    results.push({
      stringNumber,
      fret,
      frequencyHz: Math.round(freq * 100) / 100,
    });
  }

  return results;
}

let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }

  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }

  return sharedAudioContext;
}

export interface SoundPlaybackController {
  stop: () => void;
  isPlaying: boolean;
}

/**
 * Synthesizes a plucked acoustic instrument tone (guitar or bass)
 * with realistic dynamic harmonic decay and damping.
 */
export function playPluckedTone(
  frequencyHz: number,
  duration: number = 2.4,
  instrument: 'guitar' | 'bass' | 'piano' = 'guitar'
): SoundPlaybackController {
  const ctx = getAudioContext();
  if (!ctx) {
    return { stop: () => {}, isPlaying: false };
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  // Natural attack and acoustic decay envelope per instrument
  const peakVolume = instrument === 'bass' ? 0.45 : instrument === 'piano' ? 0.28 : 0.32;
  const attackTime = instrument === 'piano' ? 0.005 : 0.008;
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(peakVolume, now + attackTime);
  masterGain.gain.exponentialRampToValueAtTime(peakVolume * 0.42, now + (instrument === 'piano' ? 0.22 : 0.3));
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  // Dynamic low-pass filter to simulate string damping over time
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(
    instrument === 'bass' ? 1400 : instrument === 'piano' ? 4200 : 3800,
    now
  );
  filter.frequency.exponentialRampToValueAtTime(
    instrument === 'bass' ? 180 : instrument === 'piano' ? 550 : 500,
    now + duration
  );
  filter.connect(masterGain);

  // 1. Fundamental tone (triangle for guitar, warm sine for piano body)
  const osc1 = ctx.createOscillator();
  osc1.type = instrument === 'piano' ? 'sine' : 'triangle';
  osc1.frequency.setValueAtTime(frequencyHz, now);
  const osc1Gain = ctx.createGain();
  osc1Gain.gain.setValueAtTime(1.0, now);
  osc1.connect(osc1Gain);
  osc1Gain.connect(filter);

  // 2. 2nd Harmonic (or unison string chorusing for acoustic piano)
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(
    instrument === 'piano' ? frequencyHz + 0.9 : frequencyHz * 2,
    now
  );
  const osc2Gain = ctx.createGain();
  osc2Gain.gain.setValueAtTime(
    instrument === 'bass' ? 0.6 : instrument === 'piano' ? 0.42 : 0.35,
    now
  );
  osc2.connect(osc2Gain);
  osc2Gain.connect(filter);

  // 3. 3rd Harmonic (adds acoustic ring & piano octave resonance)
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(
    instrument === 'piano' ? frequencyHz * 2 : frequencyHz * 3,
    now
  );
  const osc3Gain = ctx.createGain();
  osc3Gain.gain.setValueAtTime(instrument === 'bass' ? 0.25 : 0.18, now);
  osc3.connect(osc3Gain);
  osc3Gain.connect(filter);

  const oscillators = [osc1, osc2, osc3];
  oscillators.forEach((osc) => {
    osc.start(now);
    osc.stop(now + duration + 0.1);
  });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      const stopNow = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(stopNow);
      masterGain.gain.setValueAtTime(masterGain.gain.value, stopNow);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, stopNow + 0.05);
      setTimeout(() => {
        oscillators.forEach((osc) => {
          try {
            osc.stop();
          } catch {}
        });
      }, 60);
    } catch {}
  };

  return { stop, isPlaying: true };
}

/**
 * Continuous pitch-pipe reference tone for hands-free tuning.
 * Soft sine wave with gentle gain to avoid listener fatigue.
 */
export function playContinuousReferenceTone(
  frequencyHz: number,
  volume: number = 0.2
): SoundPlaybackController {
  const ctx = getAudioContext();
  if (!ctx) {
    return { stop: () => {}, isPlaying: false };
  }

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.05);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequencyHz, now);
  osc.connect(gain);
  osc.start(now);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      const stopNow = ctx.currentTime;
      gain.gain.cancelScheduledValues(stopNow);
      gain.gain.setValueAtTime(gain.gain.value, stopNow);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopNow + 0.05);
      setTimeout(() => {
        try {
          osc.stop();
        } catch {}
      }, 60);
    } catch {}
  };

  return { stop, isPlaying: true };
}

/**
 * Plays an authentic acoustic guitar chord with an expressive ~35ms downward strum.
 */
export function playGuitarChord(
  chordName: string,
  strumSpeedMs: number = 38
): SoundPlaybackController {
  const chordStrings = getGuitarChordFrequencies(chordName);
  if (chordStrings.length === 0) {
    return { stop: () => {}, isPlaying: false };
  }

  const controllers: SoundPlaybackController[] = [];
  const timeoutIds: ReturnType<typeof setTimeout>[] = [];

  chordStrings.forEach((item, idx) => {
    const delay = idx * strumSpeedMs;
    const tid = setTimeout(() => {
      // Bass strings ring slightly longer (~2.8s) than treble strings (~2.2s)
      const duration = 2.2 + (6 - item.stringNumber) * 0.12;
      const ctrl = playPluckedTone(item.frequencyHz, duration, 'guitar');
      controllers.push(ctrl);
    }, delay);
    timeoutIds.push(tid);
  });

  const stop = () => {
    timeoutIds.forEach(clearTimeout);
    controllers.forEach((c) => c.stop());
  };

  return { stop, isPlaying: true };
}

/**
 * Plays a rich piano chord voicing with warm harmonics and simultaneous note strike.
 */
export function playPianoChord(chordName: string, keyContext?: string): SoundPlaybackController {
  const piano = getPianoKeysForChord(chordName, keyContext);
  if (!piano || piano.notes.length === 0) {
    return { stop: () => {}, isPlaying: false };
  }

  const ctx = getAudioContext();
  if (!ctx) {
    return { stop: () => {}, isPlaying: false };
  }

  const controllers: SoundPlaybackController[] = [];
  const timeoutIds: ReturnType<typeof setTimeout>[] = [];

  // Left hand bass note (octave 2 or 3)
  if (piano.leftHandBass) {
    const bassFreq = noteToFrequency(piano.leftHandBass, 2);
    controllers.push(playPluckedTone(bassFreq, 3.0, 'bass'));
  }

  // Right hand chord tones (octave 4)
  piano.notes.forEach((noteName, idx) => {
    // Distribute chord tones across octave 3 and 4
    const octave = idx === 0 ? 3 : 4;
    const freq = noteToFrequency(noteName, octave);
    // Slight humanization: 3ms stagger
    const tid = setTimeout(() => {
      controllers.push(playPluckedTone(freq, 2.5, 'piano'));
    }, idx * 3);
    timeoutIds.push(tid);
  });

  const stop = () => {
    timeoutIds.forEach(clearTimeout);
    controllers.forEach((c) => c.stop());
  };

  return { stop, isPlaying: true };
}
