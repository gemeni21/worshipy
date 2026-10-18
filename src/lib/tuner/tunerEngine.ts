/**
 * Guitar, Bass, and Chromatic Pitch Detection & Equal-Temperament Tuning Engine
 *
 * Pure, testable audio and music-theory utilities for Worship Music Companion MVP.
 * All audio processing runs locally in the browser; no audio is ever recorded or transmitted.
 */

export type TunerInstrumentMode = 'guitar' | 'bass' | 'chromatic';
export type TunerNoteSpelling = 'sharp' | 'flat';
export type TuningDirectionStatus = 'in-tune' | 'flat' | 'sharp';
export type TunerReadoutStatus =
  | 'idle'
  | 'listening'
  | 'no-clear-pitch'
  | 'in-tune'
  | 'flat'
  | 'sharp';

/**
 * Default concert pitch reference (A4 = 440 Hz, MIDI note 69).
 */
export const DEFAULT_A4_HZ = 440;
export const A4_MIDI_NUMBER = 69;

/**
 * Default tolerance in cents for considering a note "In tune" (inclusive: |cents| <= 5).
 */
export const DEFAULT_IN_TUNE_TOLERANCE_CENTS = 5;

/**
 * Practical frequency operating bounds covering 4/5-string bass (low B0/E1 ~30-41.2 Hz)
 * through high guitar frets (~1400 Hz).
 */
export const MIN_DETECTABLE_FREQUENCY_HZ = 30;
export const MAX_DETECTABLE_FREQUENCY_HZ = 1400;

export const SHARP_NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export const FLAT_NOTE_NAMES = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

export interface TuningStringPreset {
  id: string;
  /** String number in standard convention (e.g., 6 = low E2 on guitar, 1 = high E4) */
  stringNumber: number;
  label: string;
  noteName: string;
  octave: number;
  /** Full scientific pitch notation, e.g., "E2" */
  noteWithOctave: string;
  midiNote: number;
  /** Standard reference frequency in Hz at A4 = 440 Hz */
  frequencyHz: number;
}

/**
 * Standard 6-string guitar tuning preset in low-to-high pitch order:
 * E2, A2, D3, G3, B3, E4.
 */
export const STANDARD_GUITAR_STRINGS: readonly TuningStringPreset[] =
  Object.freeze([
    {
      id: 'guitar-6-E2',
      stringNumber: 6,
      label: '6th String (Low E)',
      noteName: 'E',
      octave: 2,
      noteWithOctave: 'E2',
      midiNote: 40,
      frequencyHz: 82.41,
    },
    {
      id: 'guitar-5-A2',
      stringNumber: 5,
      label: '5th String (A)',
      noteName: 'A',
      octave: 2,
      noteWithOctave: 'A2',
      midiNote: 45,
      frequencyHz: 110.0,
    },
    {
      id: 'guitar-4-D3',
      stringNumber: 4,
      label: '4th String (D)',
      noteName: 'D',
      octave: 3,
      noteWithOctave: 'D3',
      midiNote: 50,
      frequencyHz: 146.83,
    },
    {
      id: 'guitar-3-G3',
      stringNumber: 3,
      label: '3rd String (G)',
      noteName: 'G',
      octave: 3,
      noteWithOctave: 'G3',
      midiNote: 55,
      frequencyHz: 196.0,
    },
    {
      id: 'guitar-2-B3',
      stringNumber: 2,
      label: '2nd String (B)',
      noteName: 'B',
      octave: 3,
      noteWithOctave: 'B3',
      midiNote: 59,
      frequencyHz: 246.94,
    },
    {
      id: 'guitar-1-E4',
      stringNumber: 1,
      label: '1st String (High E)',
      noteName: 'E',
      octave: 4,
      noteWithOctave: 'E4',
      midiNote: 64,
      frequencyHz: 329.63,
    },
  ]);

/**
 * Standard 4-string bass tuning preset in low-to-high pitch order:
 * E1, A1, D2, G2.
 */
export const STANDARD_BASS_STRINGS: readonly TuningStringPreset[] =
  Object.freeze([
    {
      id: 'bass-4-E1',
      stringNumber: 4,
      label: '4th String (Low E)',
      noteName: 'E',
      octave: 1,
      noteWithOctave: 'E1',
      midiNote: 28,
      frequencyHz: 41.2,
    },
    {
      id: 'bass-3-A1',
      stringNumber: 3,
      label: '3rd String (A)',
      noteName: 'A',
      octave: 1,
      noteWithOctave: 'A1',
      midiNote: 33,
      frequencyHz: 55.0,
    },
    {
      id: 'bass-2-D2',
      stringNumber: 2,
      label: '2nd String (D)',
      noteName: 'D',
      octave: 2,
      noteWithOctave: 'D2',
      midiNote: 38,
      frequencyHz: 73.42,
    },
    {
      id: 'bass-1-G2',
      stringNumber: 1,
      label: '1st String (G)',
      noteName: 'G',
      octave: 2,
      noteWithOctave: 'G2',
      midiNote: 43,
      frequencyHz: 98.0,
    },
  ]);

export interface DetectedNoteInfo {
  noteName: string;
  octave: number;
  noteWithOctave: string;
  midiNote: number;
  measuredFrequencyHz: number;
  referenceFrequencyHz: number;
  /** Cents deviation from nearest equal-tempered note (-50 to +50) */
  cents: number;
  status: TuningDirectionStatus;
  statusLabel: 'In tune' | 'Too flat' | 'Too sharp';
}

export interface TargetStringComparison {
  targetString: TuningStringPreset;
  targetReferenceHz: number;
  measuredFrequencyHz: number;
  detectedNote: DetectedNoteInfo;
  /** Cents difference relative to the selected target string */
  centsFromTarget: number;
  /** Clamped meter value (-50 to +50) for visual gauge needle */
  clampedMeterCents: number;
  status: TuningDirectionStatus;
  statusLabel: 'In tune' | 'Too flat' | 'Too sharp';
  /** True when the detected pitch is within ±1 semitone (100 cents) of the target string */
  isNearTargetString: boolean;
}

/**
 * Checks whether a frequency is a finite number within the reliable tuner detection range.
 */
export function isValidDetectableFrequency(
  frequencyHz: number,
  minHz: number = MIN_DETECTABLE_FREQUENCY_HZ,
  maxHz: number = MAX_DETECTABLE_FREQUENCY_HZ
): boolean {
  return (
    typeof frequencyHz === 'number' &&
    Number.isFinite(frequencyHz) &&
    frequencyHz >= minHz &&
    frequencyHz <= maxHz
  );
}

/**
 * Converts a MIDI note number to its equal-tempered frequency in Hz.
 */
export function midiToFrequency(
  midiNote: number,
  a4Hz: number = DEFAULT_A4_HZ
): number {
  if (!Number.isFinite(midiNote) || !Number.isFinite(a4Hz) || a4Hz <= 0) {
    return NaN;
  }
  return a4Hz * Math.pow(2, (midiNote - A4_MIDI_NUMBER) / 12);
}

/**
 * Parses a pitch class name (e.g., "E", "F#", "Bb") and octave into a reference frequency in Hz.
 * Returns null for unrecognized note names or invalid octaves.
 */
export function noteToReferenceFrequency(
  noteName: string,
  octave: number,
  a4Hz: number = DEFAULT_A4_HZ
): number | null {
  if (
    typeof noteName !== 'string' ||
    !Number.isInteger(octave) ||
    octave < -1 ||
    octave > 9 ||
    !Number.isFinite(a4Hz) ||
    a4Hz <= 0
  ) {
    return null;
  }

  const trimmed = noteName.trim();
  const sharpIdx = SHARP_NOTE_NAMES.indexOf(
    trimmed as (typeof SHARP_NOTE_NAMES)[number]
  );
  const flatIdx = FLAT_NOTE_NAMES.indexOf(
    trimmed as (typeof FLAT_NOTE_NAMES)[number]
  );
  const pitchClass = sharpIdx !== -1 ? sharpIdx : flatIdx;
  if (pitchClass === -1) {
    return null;
  }

  const midiNote = (octave + 1) * 12 + pitchClass;
  return midiToFrequency(midiNote, a4Hz);
}

/**
 * Calculates the cents deviation between a measured frequency and a target reference frequency:
 * cents = 1200 * log2(measuredHz / targetHz)
 *
 * Returns null if either frequency is non-positive, NaN, or infinite.
 */
export function calculateCentsDifference(
  measuredHz: number,
  targetHz: number
): number | null {
  if (
    typeof measuredHz !== 'number' ||
    typeof targetHz !== 'number' ||
    !Number.isFinite(measuredHz) ||
    !Number.isFinite(targetHz) ||
    measuredHz <= 0 ||
    targetHz <= 0
  ) {
    return null;
  }

  const rawCents = 1200 * Math.log2(measuredHz / targetHz);
  // Round to 1 decimal place and normalize -0 to 0
  const rounded = Math.round(rawCents * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Evaluates whether a cents offset is 'in-tune', 'flat', or 'sharp'.
 * Boundary rule: inclusive of ±toleranceCents (default ±5 cents is 'in-tune').
 */
export function getTuningStatus(
  cents: number,
  toleranceCents: number = DEFAULT_IN_TUNE_TOLERANCE_CENTS
): TuningDirectionStatus {
  const tol = Math.abs(toleranceCents);
  if (Math.abs(cents) <= tol) {
    return 'in-tune';
  }
  return cents < -tol ? 'flat' : 'sharp';
}

export function getTuningStatusLabel(
  status: TuningDirectionStatus
): 'In tune' | 'Too flat' | 'Too sharp' {
  if (status === 'in-tune') return 'In tune';
  if (status === 'flat') return 'Too flat';
  return 'Too sharp';
}

/**
 * Converts a measured frequency in Hz to the nearest equal-tempered note, octave,
 * reference frequency, cents deviation, and tuning status.
 *
 * Returns null if the frequency is invalid or outside the reliable detection bounds.
 */
export function frequencyToNearestNote(
  frequencyHz: number,
  options?: {
    a4Hz?: number;
    spelling?: TunerNoteSpelling;
    toleranceCents?: number;
    minHz?: number;
    maxHz?: number;
  }
): DetectedNoteInfo | null {
  const a4Hz = options?.a4Hz ?? DEFAULT_A4_HZ;
  const spelling = options?.spelling ?? 'sharp';
  const toleranceCents =
    options?.toleranceCents ?? DEFAULT_IN_TUNE_TOLERANCE_CENTS;
  const minHz = options?.minHz ?? MIN_DETECTABLE_FREQUENCY_HZ;
  const maxHz = options?.maxHz ?? MAX_DETECTABLE_FREQUENCY_HZ;

  if (
    !isValidDetectableFrequency(frequencyHz, minHz, maxHz) ||
    !Number.isFinite(a4Hz) ||
    a4Hz <= 0
  ) {
    return null;
  }

  const exactMidi = A4_MIDI_NUMBER + 12 * Math.log2(frequencyHz / a4Hz);
  const nearestMidi = Math.round(exactMidi);

  const pitchClass = ((nearestMidi % 12) + 12) % 12;
  const octave = Math.floor(nearestMidi / 12) - 1;
  const noteNames = spelling === 'flat' ? FLAT_NOTE_NAMES : SHARP_NOTE_NAMES;
  const noteName = noteNames[pitchClass];
  const noteWithOctave = `${noteName}${octave}`;

  const referenceFrequencyHz = midiToFrequency(nearestMidi, a4Hz);
  const cents = calculateCentsDifference(frequencyHz, referenceFrequencyHz);
  if (cents === null) {
    return null;
  }

  const status = getTuningStatus(cents, toleranceCents);
  return {
    noteName,
    octave,
    noteWithOctave,
    midiNote: nearestMidi,
    measuredFrequencyHz: Math.round(frequencyHz * 100) / 100,
    referenceFrequencyHz: Math.round(referenceFrequencyHz * 100) / 100,
    cents,
    status,
    statusLabel: getTuningStatusLabel(status),
  };
}

/**
 * Compares a measured frequency against a specific selected guitar or bass target string.
 */
export function compareFrequencyToTargetString(
  frequencyHz: number,
  targetString: TuningStringPreset,
  options?: {
    a4Hz?: number;
    spelling?: TunerNoteSpelling;
    toleranceCents?: number;
  }
): TargetStringComparison | null {
  const a4Hz = options?.a4Hz ?? DEFAULT_A4_HZ;
  const toleranceCents =
    options?.toleranceCents ?? DEFAULT_IN_TUNE_TOLERANCE_CENTS;

  const detectedNote = frequencyToNearestNote(frequencyHz, options);
  if (!detectedNote) {
    return null;
  }

  const exactTargetHz = midiToFrequency(targetString.midiNote, a4Hz);
  const centsFromTarget = calculateCentsDifference(frequencyHz, exactTargetHz);
  if (centsFromTarget === null) {
    return null;
  }

  const status = getTuningStatus(centsFromTarget, toleranceCents);
  const clampedMeterCents = Math.max(-50, Math.min(50, centsFromTarget));

  return {
    targetString,
    targetReferenceHz: Math.round(exactTargetHz * 100) / 100,
    measuredFrequencyHz: detectedNote.measuredFrequencyHz,
    detectedNote,
    centsFromTarget,
    clampedMeterCents,
    status,
    statusLabel: getTuningStatusLabel(status),
    isNearTargetString: Math.abs(centsFromTarget) <= 100,
  };
}

/**
 * Finds the closest string in a preset list for a measured frequency.
 */
export function findClosestPresetString(
  frequencyHz: number,
  presets: readonly TuningStringPreset[],
  a4Hz: number = DEFAULT_A4_HZ
): TuningStringPreset | null {
  if (!isValidDetectableFrequency(frequencyHz) || presets.length === 0) {
    return null;
  }

  let closest = presets[0];
  let smallestAbsCents = Infinity;

  for (const preset of presets) {
    const refHz = midiToFrequency(preset.midiNote, a4Hz);
    const cents = calculateCentsDifference(frequencyHz, refHz);
    if (cents !== null && Math.abs(cents) < smallestAbsCents) {
      smallestAbsCents = Math.abs(cents);
      closest = preset;
    }
  }

  return closest;
}

// ============================================================================
// TIME-DOMAIN YIN PITCH DETECTION ALGORITHM
// ============================================================================

export interface YinPitchDetectionResult {
  frequencyHz: number;
  /** Confidence / periodicity score in [0, 1] */
  confidence: number;
  /** Root-mean-square amplitude of the analyzed buffer */
  rms: number;
}

export interface YinOptions {
  /** Minimum RMS level required before attempting pitch detection (default: 0.008) */
  minRms?: number;
  /** YIN CMND dip threshold (default: 0.15) */
  yinThreshold?: number;
  /** Minimum periodicity confidence required to report a pitch (default: 0.80) */
  minConfidence?: number;
  /** Minimum detectable frequency in Hz (default: 30 Hz, safely below Bass E1 = 41.2 Hz) */
  minFrequencyHz?: number;
  /** Maximum detectable frequency in Hz (default: 1400 Hz) */
  maxFrequencyHz?: number;
}

/**
 * Computes the root-mean-square (RMS) amplitude of a time-domain buffer.
 */
export function calculateRms(buffer: Float32Array): number {
  if (!buffer || buffer.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i];
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / buffer.length);
}

/**
 * Estimates fundamental frequency f0 from a time-domain audio buffer using the YIN algorithm
 * (De Cheveigné & Kawahara, 2002) with parabolic lag interpolation and sub-octave harmonic checks.
 *
 * Returns null when signal is too quiet, noisy, polyphonic/ambiguous, or outside reliable range.
 */
export function detectPitchYin(
  buffer: Float32Array,
  sampleRate: number,
  options?: YinOptions
): YinPitchDetectionResult | null {
  if (
    !buffer ||
    buffer.length < 512 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0
  ) {
    return null;
  }

  const minRms = options?.minRms ?? 0.008;
  const yinThreshold = options?.yinThreshold ?? 0.15;
  const minConfidence = options?.minConfidence ?? 0.8;
  const minFreq = options?.minFrequencyHz ?? MIN_DETECTABLE_FREQUENCY_HZ;
  const maxFreq = options?.maxFrequencyHz ?? MAX_DETECTABLE_FREQUENCY_HZ;

  const rms = calculateRms(buffer);
  if (!Number.isFinite(rms) || rms < minRms) {
    return null;
  }

  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxTauLimit = Math.ceil(sampleRate / minFreq);
  const halfBuffer = Math.floor(buffer.length / 2);
  const maxTau = Math.min(maxTauLimit, halfBuffer - 1);

  if (maxTau <= minTau) {
    return null;
  }

  const integrationWindow = halfBuffer;
  const yinBuffer = new Float32Array(maxTau + 1);
  yinBuffer[0] = 1;

  let runningSum = 0;

  // Steps 1 & 2: Difference function d(tau) and Cumulative Mean Normalized Difference d'(tau)
  for (let tau = 1; tau <= maxTau; tau++) {
    let diffSum = 0;
    for (let i = 0; i < integrationWindow; i++) {
      const delta = buffer[i] - buffer[i + tau];
      diffSum += delta * delta;
    }
    runningSum += diffSum;
    if (runningSum === 0) {
      yinBuffer[tau] = 1;
    } else {
      yinBuffer[tau] = (diffSum * tau) / runningSum;
    }
  }

  // Step 3: Absolute threshold search (selects the shortest frequency / fundamental period first)
  let selectedTau = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yinBuffer[tau] < yinThreshold) {
      while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      selectedTau = tau;
      break;
    }
  }

  // Fallback to global minimum if no dip crossed yinThreshold, provided periodicity is still strong
  if (selectedTau === -1) {
    let minVal = Infinity;
    let minIdx = -1;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (yinBuffer[tau] < minVal) {
        minVal = yinBuffer[tau];
        minIdx = tau;
      }
    }
    if (minIdx !== -1 && minVal <= 1 - minConfidence) {
      selectedTau = minIdx;
    } else {
      return null;
    }
  }

  const confidence = Math.max(0, Math.min(1, 1 - yinBuffer[selectedTau]));
  if (confidence < minConfidence) {
    return null;
  }

  // Step 4: Parabolic interpolation around selectedTau for sub-sample precision
  let refinedTau = selectedTau;
  if (selectedTau > 1 && selectedTau < maxTau) {
    const s0 = yinBuffer[selectedTau - 1];
    const s1 = yinBuffer[selectedTau];
    const s2 = yinBuffer[selectedTau + 1];
    const denominator = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denominator) > 1e-9) {
      const adjustment = (s2 - s0) / denominator;
      if (Math.abs(adjustment) < 1) {
        refinedTau = selectedTau + adjustment;
      }
    }
  }

  const frequencyHz = sampleRate / refinedTau;
  if (!isValidDetectableFrequency(frequencyHz, minFreq, maxFreq)) {
    return null;
  }

  return {
    frequencyHz,
    confidence: Math.round(confidence * 1000) / 1000,
    rms: Math.round(rms * 10000) / 10000,
  };
}

/**
 * Generates a synthetic sine or harmonic test waveform for unit testing the pitch detector.
 */
export function generateTestWaveform(options: {
  frequencyHz: number;
  sampleRate?: number;
  length?: number;
  amplitude?: number;
  secondHarmonicRatio?: number;
  thirdHarmonicRatio?: number;
}): Float32Array {
  const sampleRate = options.sampleRate ?? 48000;
  const length = options.length ?? 8192;
  const amplitude = options.amplitude ?? 0.5;
  const h2 = options.secondHarmonicRatio ?? 0;
  const h3 = options.thirdHarmonicRatio ?? 0;
  const f0 = options.frequencyHz;

  const buffer = new Float32Array(length);
  const twoPiF = (2 * Math.PI * f0) / sampleRate;

  for (let i = 0; i < length; i++) {
    const phase = twoPiF * i;
    const raw =
      Math.sin(phase) + h2 * Math.sin(2 * phase) + h3 * Math.sin(3 * phase);
    buffer[i] = amplitude * raw;
  }
  return buffer;
}

/**
 * Smooths consecutive frequency readings using a small median + exponential moving average window
 * so the tuner needle is steady on a sustained note but jumps immediately when changing strings.
 */
export class PitchSmoother {
  private history: number[] = [];
  private smoothedHz: number | null = null;
  private readonly windowSize: number;
  private readonly alpha: number;

  constructor(windowSize: number = 5, alpha: number = 0.38) {
    this.windowSize = Math.max(1, windowSize);
    this.alpha = Math.max(0.05, Math.min(1, alpha));
  }

  push(frequencyHz: number): number {
    if (this.smoothedHz !== null) {
      const jumpCents = calculateCentsDifference(frequencyHz, this.smoothedHz);
      // If the player plucks a different string (> 120 cents away), reset immediately
      if (jumpCents === null || Math.abs(jumpCents) > 120) {
        this.reset();
      }
    }

    this.history.push(frequencyHz);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }

    const sorted = [...this.history].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    if (this.smoothedHz === null) {
      this.smoothedHz = median;
    } else {
      this.smoothedHz =
        this.alpha * median + (1 - this.alpha) * this.smoothedHz;
    }

    return this.smoothedHz;
  }

  reset(): void {
    this.history = [];
    this.smoothedHz = null;
  }
}
