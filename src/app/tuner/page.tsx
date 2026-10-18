'use client';

import React from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Gauge,
  Guitar,
  Info,
  Mic,
  MicOff,
  Music,
  ShieldCheck,
  Sliders,
  Square,
  Volume2,
} from 'lucide-react';
import { useMicrophoneTuner } from '@/hooks/useMicrophoneTuner';
import type { TunerInstrumentMode } from '@/lib/tuner/tunerEngine';

function formatSignedCents(cents: number): string {
  if (Object.is(cents, -0) || cents === 0) return '0.0¢';
  return cents > 0 ? `+${cents.toFixed(1)}¢` : `${cents.toFixed(1)}¢`;
}

export default function TunerPage() {
  const {
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
    confidence,
    isNoisyOrAmbiguous,
    inTuneToleranceCents,
    referenceA4Hz,
    startListening,
    stopListening,
  } = useMicrophoneTuner();

  const isListening = lifecycleState === 'listening';
  const isRequesting = lifecycleState === 'requesting-permission';

  // Determine the active cents & tuning status for the primary gauge:
  // - In Chromatic mode (or when targetComparison is unavailable), gauge reflects nearest equal-tempered note.
  // - In Guitar/Bass mode when the detected pitch is near the selected target string (within ±100 cents),
  //   gauge reflects exact cents deviation from the selected target string. Otherwise it reflects nearest note
  //   while the Target String panel clearly shows the full semitone/cent distance to the selected string.
  const activeCents =
    instrumentMode !== 'chromatic' &&
    targetComparison &&
    targetComparison.isNearTargetString
      ? targetComparison.centsFromTarget
      : detectedNote?.cents ?? null;

  const activeDirectionStatus =
    instrumentMode !== 'chromatic' &&
    targetComparison &&
    targetComparison.isNearTargetString
      ? targetComparison.status
      : detectedNote?.status ?? null;

  const clampedNeedleCents =
    activeCents !== null ? Math.max(-50, Math.min(50, activeCents)) : 0;
  // Convert [-50, +50] cents to [0%, 100%] horizontal needle position
  const needlePercent = ((clampedNeedleCents + 50) / 100) * 100;

  // Derive clear status copy as required by specification
  let statusBannerText = 'Microphone permission is needed to use the tuner.';
  let statusSubText =
    'Press Start Listening below and play one string at a time.';

  if (isRequesting) {
    statusBannerText = 'Requesting microphone permission...';
    statusSubText =
      'Please allow microphone access in your browser prompt to start pitch detection.';
  } else if (lifecycleState === 'stopped') {
    statusBannerText = 'Tuner stopped. Press Start Listening to resume.';
    statusSubText =
      'Microphone capture has been completely turned off on this device.';
  } else if (lifecycleState === 'interrupted') {
    statusBannerText = 'Tuner paused. Press Start Listening to resume.';
    statusSubText =
      errorState?.message ??
      'Audio input was interrupted when the tab backgrounded or device changed.';
  } else if (lifecycleState === 'error' && errorState) {
    statusBannerText = errorState.message;
    statusSubText = errorState.recoveryHint;
  } else if (isListening) {
    if (!detectedNote) {
      statusBannerText = isNoisyOrAmbiguous
        ? 'No clear pitch detected'
        : 'Listening — No clear pitch detected';
      statusSubText = isNoisyOrAmbiguous
        ? 'Background noise or multiple sounding strings detected. Mute other strings and pluck a single string clearly.'
        : 'Pluck a single string and let the note ring near your microphone.';
    } else if (activeDirectionStatus === 'in-tune') {
      statusBannerText = 'In tune';
      statusSubText = `Within ±${inTuneToleranceCents}¢ tolerance (${formatSignedCents(
        activeCents ?? 0
      )})`;
    } else if (activeDirectionStatus === 'flat') {
      statusBannerText = 'Too flat';
      statusSubText = `Pitch is ${formatSignedCents(
        activeCents ?? 0
      )} below target — tighten string slightly to raise pitch.`;
    } else if (activeDirectionStatus === 'sharp') {
      statusBannerText = 'Too sharp';
      statusSubText = `Pitch is ${formatSignedCents(
        activeCents ?? 0
      )} above target — loosen string slightly to lower pitch.`;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
            <Gauge className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Guitar, Bass & Chromatic Tuner · A4 = {referenceA4Hz} Hz
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Tuner
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Tune your guitar or bass using live microphone pitch detection. All
            audio is processed locally in your browser and is never recorded or
            sent to a server.
          </p>
        </div>

        {/* Start Listening / Stop Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {!isListening ? (
            <button
              type="button"
              onClick={startListening}
              disabled={isRequesting}
              data-testid="tuner-start-button"
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm sm:text-base shadow-sm transition-all cursor-pointer min-h-[3.25rem]"
            >
              <Mic className="w-5 h-5" aria-hidden="true" />
              <span>
                {isRequesting ? 'Requesting Mic...' : 'Start Listening'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopListening}
              data-testid="tuner-stop-button"
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm sm:text-base shadow-sm transition-colors cursor-pointer min-h-[3.25rem]"
            >
              <Square className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </header>

      {/* Error / Permission Recovery Alert */}
      {(lifecycleState === 'error' || lifecycleState === 'interrupted') &&
        errorState && (
          <div
            role="alert"
            data-testid="tuner-error-alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-rose-800 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h2 className="font-bold text-sm sm:text-base">
                  {errorState.title}
                </h2>
                <p className="text-xs sm:text-sm">{errorState.message}</p>
                <p className="text-xs opacity-90">{errorState.recoveryHint}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={startListening}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold shrink-0 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

      {/* Instrument Mode & Note Spelling Controls */}
      <section
        aria-label="Instrument and Tuning Mode"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Instrument Mode Toggle: Guitar | Bass | Chromatic */}
          <div
            role="group"
            aria-label="Select instrument mode"
            className="inline-flex flex-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 gap-1"
          >
            {(
              [
                { id: 'guitar', label: 'Guitar (6-String)', icon: Guitar },
                { id: 'bass', label: 'Bass (4-String)', icon: Sliders },
                { id: 'chromatic', label: 'Chromatic', icon: Music },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = instrumentMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInstrumentMode(id as TunerInstrumentMode)}
                  aria-pressed={active}
                  data-testid={`mode-${id}`}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[2.75rem] ${
                    active
                      ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] font-bold ring-1 ring-[var(--brand-accent)]/30 shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Note Spelling & Auto-Select String Helpers */}
          <div className="flex flex-wrap items-center gap-3">
            {instrumentMode !== 'chromatic' && (
              <label className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoMatchString}
                  onChange={(e) => setAutoMatchString(e.target.checked)}
                  className="rounded border-[var(--border-strong)] accent-[var(--brand-accent)] w-4 h-4"
                />
                <span>Auto-select closest string</span>
              </label>
            )}

            <div
              role="group"
              aria-label="Note accidental spelling"
              className="inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-xs"
            >
              <button
                type="button"
                onClick={() => setNoteSpelling('sharp')}
                aria-pressed={noteSpelling === 'sharp'}
                className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer ${
                  noteSpelling === 'sharp'
                    ? 'bg-[var(--bg-surface)] text-[var(--brand-accent)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Sharps (♯)
              </button>
              <button
                type="button"
                onClick={() => setNoteSpelling('flat')}
                aria-pressed={noteSpelling === 'flat'}
                className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer ${
                  noteSpelling === 'flat'
                    ? 'bg-[var(--bg-surface)] text-[var(--brand-accent)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Flats (♭)
              </button>
            </div>
          </div>
        </div>

        {/* String Selector Row (shown for Guitar and Bass modes in low-to-high order) */}
        {instrumentMode !== 'chromatic' && (
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {instrumentMode === 'guitar'
                  ? 'Standard 6-String Guitar Tuning (Low to High)'
                  : 'Standard 4-String Bass Tuning (Low to High)'}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                Tap a string to lock target reference
              </span>
            </div>

            <div
              role="group"
              aria-label="Target string selection"
              className={`grid gap-2.5 ${
                instrumentMode === 'guitar'
                  ? 'grid-cols-3 sm:grid-cols-6'
                  : 'grid-cols-2 sm:grid-cols-4'
              }`}
            >
              {activePresets.map((preset) => {
                const isSelected = preset.id === selectedString.id;
                const isDetectedMatch =
                  isListening &&
                  detectedNote?.noteWithOctave === preset.noteWithOctave;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedStringId(preset.id)}
                    aria-pressed={isSelected}
                    data-testid={`string-select-${preset.noteWithOctave}`}
                    className={`rounded-xl border p-3 text-center transition-all cursor-pointer min-h-[4.25rem] flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? 'border-2 border-[var(--brand-accent)] bg-[var(--brand-surface)] text-[var(--brand-accent)] shadow-xs'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      String {preset.stringNumber}
                    </span>
                    <span className="font-mono font-bold text-lg sm:text-xl leading-tight">
                      {preset.noteWithOctave}
                    </span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                      {preset.frequencyHz.toFixed(2)} Hz
                    </span>
                    {isDetectedMatch && (
                      <span className="mt-0.5 text-[0.625rem] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        Detected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Main Tuner Display & Visual Cents Meter */}
      <section
        aria-label="Pitch Readout and Visual Cents Meter"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 space-y-6"
      >
        {/* Top Listening Status Pill + ActiveStatus Copy */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2">
            {isListening ? (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                <span
                  className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                  aria-hidden="true"
                />
                <span>Listening Live</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Microphone Off</span>
              </span>
            )}

            {isListening && detectedNote && (
              <span className="text-xs font-mono text-[var(--text-secondary)]">
                Confidence: {Math.round(confidence * 100)}%
              </span>
            )}
          </div>

          <div className="text-xs font-medium text-[var(--text-secondary)]">
            In-Tune Tolerance: ±{inTuneToleranceCents} cents
          </div>
        </div>

        {/* Prominent Detected Note & Frequency Display */}
        <div className="text-center space-y-2 py-2">
          <div
            data-testid="tuner-detected-note"
            className={`font-mono font-extrabold text-6xl sm:text-7xl tracking-tight transition-colors ${
              !detectedNote
                ? 'text-[var(--text-secondary)] opacity-45'
                : activeDirectionStatus === 'in-tune'
                ? 'text-emerald-600 dark:text-emerald-400'
                : activeDirectionStatus === 'flat'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {detectedNote ? detectedNote.noteWithOctave : '--'}
          </div>

          <div
            data-testid="tuner-measured-hz"
            className="font-mono text-base sm:text-lg font-semibold text-[var(--text-secondary)]"
          >
            {detectedNote
              ? `${detectedNote.measuredFrequencyHz.toFixed(1)} Hz (Nearest Ref: ${detectedNote.referenceFrequencyHz.toFixed(
                  1
                )} Hz)`
              : '---.- Hz'}
          </div>

          {/* Explicit Status Badge (Color + Icon + Text — never color alone) */}
          <div className="pt-2 flex flex-col items-center gap-1">
            <div
              role="status"
              aria-live="polite"
              data-testid="tuner-status-badge"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm sm:text-base font-bold border ${
                !isListening
                  ? 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                  : !detectedNote
                  ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border-[var(--border-strong)]'
                  : activeDirectionStatus === 'in-tune'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                  : activeDirectionStatus === 'flat'
                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40'
                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40'
              }`}
            >
              {isListening && detectedNote && activeDirectionStatus === 'in-tune' && (
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              {isListening && detectedNote && activeDirectionStatus === 'flat' && (
                <ArrowDown className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              {isListening && detectedNote && activeDirectionStatus === 'sharp' && (
                <ArrowUp className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              <span>{statusBannerText}</span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-xl">
              {statusSubText}
            </p>
          </div>
        </div>

        {/* Visual Cents Meter Centered at Zero (-50¢ Flat to +50¢ Sharp) */}
        <div
          aria-label="Visual Cents Tuning Meter"
          className="space-y-2 max-w-2xl mx-auto pt-2"
        >
          {/* Meter Labels: Flat (-50¢) | Center (0¢ In Tune) | Sharp (+50¢) */}
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Flat (♭) -50¢</span>
            </span>
            <span className="text-emerald-700 dark:text-emerald-400">
              0¢ In Tune (±{inTuneToleranceCents}¢)
            </span>
            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
              <span>Sharp (♯) +50¢</span>
              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </div>

          {/* Gauge Track */}
          <div className="relative h-10 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] overflow-hidden">
            {/* In-Tune Center Safe Zone (±5 cents = 10% width centered at 50%) */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-[45%] width-[10%] w-[10%] bg-emerald-500/20 border-x border-emerald-500/40"
            />

            {/* Center Zero Tick Line */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-emerald-600 dark:bg-emerald-400"
            />

            {/* Tick Marks at -25¢ and +25¢ */}
            <div
              aria-hidden="true"
              className="absolute inset-y-2 left-1/4 w-px bg-[var(--border-strong)]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-2 left-3/4 w-px bg-[var(--border-strong)]"
            />

            {/* Needle Indicator */}
            <div
              data-testid="tuner-meter-needle"
              style={{ left: `${needlePercent}%` }}
              className={`absolute top-1 bottom-1 -translate-x-1/2 w-3 rounded-full transition-all duration-100 flex items-center justify-center shadow-md ${
                !detectedNote
                  ? 'bg-slate-400/50 dark:bg-slate-600/50'
                  : activeDirectionStatus === 'in-tune'
                  ? 'bg-emerald-500 ring-4 ring-emerald-500/30'
                  : activeDirectionStatus === 'flat'
                  ? 'bg-amber-500 ring-4 ring-amber-500/30'
                  : 'bg-rose-500 ring-4 ring-rose-500/30'
              }`}
            />
          </div>

          {/* Scale Numbers */}
          <div className="flex justify-between font-mono text-[0.6875rem] text-[var(--text-secondary)] px-1">
            <span>-50¢</span>
            <span>-25¢</span>
            <span className="font-bold text-[var(--text-primary)]">0¢</span>
            <span>+25¢</span>
            <span>+50¢</span>
          </div>
        </div>

        {/* Non-alarming Background Noise / Polyphonic String Notice */}
        {isListening && isNoisyOrAmbiguous && (
          <div
            role="status"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-xs sm:text-sm text-[var(--text-secondary)] flex items-center gap-2.5 max-w-2xl mx-auto"
          >
            <Volume2
              className="w-4 h-4 text-[var(--brand-accent)] shrink-0"
              aria-hidden="true"
            />
            <span>
              Multiple strings or room noise detected. Mute unused strings with
              your palm and pluck a single string for a steady reading.
            </span>
          </div>
        )}
      </section>

      {/* Selected Target-String Comparison Card (Guitar & Bass Modes) */}
      {instrumentMode !== 'chromatic' && (
        <section
          aria-label="Selected Target String Comparison"
          data-testid="tuner-target-string-card"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-bold">
              Selected String Reference & Comparison
            </h2>
            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              {selectedString.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-3.5">
              <span className="block text-xs text-[var(--text-secondary)]">
                Selected String
              </span>
              <span className="font-bold text-sm sm:text-base mt-0.5 block">
                String {selectedString.stringNumber}
              </span>
            </div>

            <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-3.5">
              <span className="block text-xs text-[var(--text-secondary)]">
                Target Note
              </span>
              <span
                data-testid="target-string-note"
                className="font-mono font-bold text-lg text-[var(--brand-accent)] mt-0.5 block"
              >
                {selectedString.noteWithOctave}
              </span>
            </div>

            <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-3.5">
              <span className="block text-xs text-[var(--text-secondary)]">
                Target Frequency
              </span>
              <span
                data-testid="target-string-hz"
                className="font-mono font-bold text-base mt-0.5 block"
              >
                {selectedString.frequencyHz.toFixed(2)} Hz
              </span>
            </div>

            <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-3.5">
              <span className="block text-xs text-[var(--text-secondary)]">
                Detected Note
              </span>
              <span className="font-mono font-bold text-base mt-0.5 block">
                {detectedNote ? detectedNote.noteWithOctave : '--'}
              </span>
            </div>

            <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-3.5 col-span-2 sm:col-span-1">
              <span className="block text-xs text-[var(--text-secondary)]">
                Cents vs. Target
              </span>
              <span
                data-testid="target-cents-diff"
                className={`font-mono font-bold text-base mt-0.5 block ${
                  !targetComparison
                    ? 'text-[var(--text-secondary)]'
                    : targetComparison.status === 'in-tune'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : targetComparison.status === 'flat'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {targetComparison
                  ? `${formatSignedCents(targetComparison.centsFromTarget)} (${
                      targetComparison.statusLabel
                    })`
                  : '--'}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Instructions & Microphone Privacy Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section
          aria-label="Tuning Tips"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-2.5"
        >
          <div className="inline-flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
            <Info
              className="w-4 h-4 text-[var(--brand-accent)]"
              aria-hidden="true"
            />
            <h2>How to Get the Best Tuning Reading</h2>
          </div>
          <ul className="text-xs sm:text-sm text-[var(--text-secondary)] space-y-1.5 list-disc list-inside">
            <li>Tune in a quiet room away from loud speakers or fans.</li>
            <li>
              Pluck <strong>one string at a time</strong> and mute the other
              strings with your hand.
            </li>
            <li>
              Let the note ring steadily for 1–2 seconds rather than plucking
              rapidly.
            </li>
            <li>
              For acoustic instruments or low bass strings (such as{' '}
              <code className="font-mono">E1</code> at 41.2 Hz), move your
              instrument closer to the device microphone.
            </li>
          </ul>
        </section>

        <section
          aria-label="Microphone Privacy and Limitations"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-2.5"
        >
          <div className="inline-flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
            <ShieldCheck
              className="w-4 h-4 text-[var(--brand-accent)]"
              aria-hidden="true"
            />
            <h2>Microphone Privacy & Practical Notes</h2>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            Microphone audio is analyzed strictly in real time inside your
            browser using the Web Audio API. Audio is{' '}
            <strong>never recorded, saved, or uploaded</strong> to any server,
            and the microphone stream is immediately closed when you press{' '}
            <strong>Stop</strong> or leave this screen.
          </p>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Built-in device microphones vary in low-frequency sensitivity. While
            designed for rehearsal and worship prep, this browser tuner is not a
            substitute for a dedicated hardware pedal or clip-on strobe tuner on
            a loud stage.
          </p>
        </section>
      </div>
    </div>
  );
}
