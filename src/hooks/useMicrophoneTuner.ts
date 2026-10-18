'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TunerAudioController,
  type TunerErrorState,
  type TunerFrameSample,
  type TunerLifecycleState,
} from '@/lib/tuner/tunerController';
import {
  compareFrequencyToTargetString,
  DEFAULT_A4_HZ,
  DEFAULT_IN_TUNE_TOLERANCE_CENTS,
  findClosestPresetString,
  frequencyToNearestNote,
  STANDARD_BASS_STRINGS,
  STANDARD_GUITAR_STRINGS,
  type DetectedNoteInfo,
  type TargetStringComparison,
  type TunerInstrumentMode,
  type TunerNoteSpelling,
  type TuningStringPreset,
} from '@/lib/tuner/tunerEngine';

export interface UseMicrophoneTunerReturn {
  lifecycleState: TunerLifecycleState;
  errorState: TunerErrorState | null;
  instrumentMode: TunerInstrumentMode;
  setInstrumentMode: (mode: TunerInstrumentMode) => void;
  noteSpelling: TunerNoteSpelling;
  setNoteSpelling: (spelling: TunerNoteSpelling) => void;
  activePresets: readonly TuningStringPreset[];
  selectedString: TuningStringPreset;
  setSelectedStringId: (id: string) => void;
  autoMatchString: boolean;
  setAutoMatchString: (enabled: boolean) => void;
  detectedNote: DetectedNoteInfo | null;
  targetComparison: TargetStringComparison | null;
  confidence: number;
  rms: number;
  isNoisyOrAmbiguous: boolean;
  inTuneToleranceCents: number;
  referenceA4Hz: number;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

/**
 * React hook encapsulating the local microphone pitch-detection pipeline,
 * instrument mode / string selection, and guaranteed cleanup on unmount.
 */
export function useMicrophoneTuner(): UseMicrophoneTunerReturn {
  const [lifecycleState, setLifecycleState] =
    useState<TunerLifecycleState>('idle');
  const [errorState, setErrorState] = useState<TunerErrorState | null>(null);

  const [instrumentMode, setInstrumentModeState] =
    useState<TunerInstrumentMode>('guitar');
  const [noteSpelling, setNoteSpelling] = useState<TunerNoteSpelling>('sharp');
  const [selectedGuitarStringId, setSelectedGuitarStringId] = useState<string>(
    STANDARD_GUITAR_STRINGS[0].id
  );
  const [selectedBassStringId, setSelectedBassStringId] = useState<string>(
    STANDARD_BASS_STRINGS[0].id
  );
  const [autoMatchString, setAutoMatchString] = useState<boolean>(false);

  const [currentFrame, setCurrentFrame] = useState<TunerFrameSample>({
    pitch: null,
    rms: 0,
    isNoisyOrAmbiguous: false,
  });

  const controllerRef = useRef<TunerAudioController | null>(null);
  const instrumentModeRef = useRef<TunerInstrumentMode>(instrumentMode);
  const autoMatchRef = useRef<boolean>(autoMatchString);

  useEffect(() => {
    instrumentModeRef.current = instrumentMode;
  }, [instrumentMode]);

  useEffect(() => {
    autoMatchRef.current = autoMatchString;
  }, [autoMatchString]);

  // Ensure controller is cleanly stopped and destroyed when component unmounts or page changes
  useEffect(() => {
    const controller = new TunerAudioController({
      onLifecycleChange: (nextState, nextError) => {
        setLifecycleState(nextState);
        setErrorState(nextError);
        if (nextState !== 'listening') {
          setCurrentFrame({
            pitch: null,
            rms: 0,
            isNoisyOrAmbiguous: false,
          });
        }
      },
      onFrame: (sample) => {
        setCurrentFrame(sample);

        // Optional convenience: auto-highlight closest string only when explicitly enabled
        // and confidence is very high (>= 0.90)
        if (
          autoMatchRef.current &&
          sample.pitch &&
          sample.pitch.confidence >= 0.9
        ) {
          const mode = instrumentModeRef.current;
          if (mode === 'guitar') {
            const closest = findClosestPresetString(
              sample.pitch.frequencyHz,
              STANDARD_GUITAR_STRINGS
            );
            if (closest) {
              setSelectedGuitarStringId(closest.id);
            }
          } else if (mode === 'bass') {
            const closest = findClosestPresetString(
              sample.pitch.frequencyHz,
              STANDARD_BASS_STRINGS
            );
            if (closest) {
              setSelectedBassStringId(closest.id);
            }
          }
        }
      },
    });

    controllerRef.current = controller;

    return () => {
      void controller.stop();
      controllerRef.current = null;
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!controllerRef.current) return;
    await controllerRef.current.start();
  }, []);

  const stopListening = useCallback(async () => {
    if (!controllerRef.current) return;
    await controllerRef.current.stop();
  }, []);

  const setInstrumentMode = useCallback((mode: TunerInstrumentMode) => {
    setInstrumentModeState(mode);
  }, []);

  const activePresets =
    instrumentMode === 'bass'
      ? STANDARD_BASS_STRINGS
      : STANDARD_GUITAR_STRINGS;

  const selectedString =
    instrumentMode === 'bass'
      ? STANDARD_BASS_STRINGS.find((s) => s.id === selectedBassStringId) ??
        STANDARD_BASS_STRINGS[0]
      : STANDARD_GUITAR_STRINGS.find((s) => s.id === selectedGuitarStringId) ??
        STANDARD_GUITAR_STRINGS[0];

  const setSelectedStringId = useCallback(
    (id: string) => {
      if (instrumentMode === 'bass') {
        setSelectedBassStringId(id);
      } else {
        setSelectedGuitarStringId(id);
      }
    },
    [instrumentMode]
  );

  const measuredHz = currentFrame.pitch?.frequencyHz ?? null;

  const detectedNote =
    measuredHz !== null
      ? frequencyToNearestNote(measuredHz, {
          a4Hz: DEFAULT_A4_HZ,
          spelling: noteSpelling,
          toleranceCents: DEFAULT_IN_TUNE_TOLERANCE_CENTS,
        })
      : null;

  const targetComparison =
    measuredHz !== null && instrumentMode !== 'chromatic'
      ? compareFrequencyToTargetString(measuredHz, selectedString, {
          a4Hz: DEFAULT_A4_HZ,
          spelling: noteSpelling,
          toleranceCents: DEFAULT_IN_TUNE_TOLERANCE_CENTS,
        })
      : null;

  return {
    lifecycleState,
    errorState,
    instrumentMode,
    setInstrumentMode,
    noteSpelling,
    setNoteSpelling,
    activePresets,
    selectedString,
    setSelectedStringId,
    autoMatchString,
    setAutoMatchString,
    detectedNote,
    targetComparison,
    confidence: currentFrame.pitch?.confidence ?? 0,
    rms: currentFrame.rms,
    isNoisyOrAmbiguous: currentFrame.isNoisyOrAmbiguous,
    inTuneToleranceCents: DEFAULT_IN_TUNE_TOLERANCE_CENTS,
    referenceA4Hz: DEFAULT_A4_HZ,
    startListening,
    stopListening,
  };
}
