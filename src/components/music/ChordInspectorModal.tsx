'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Guitar, Piano, Music, X, Volume2, VolumeX } from 'lucide-react';
import {
  getGuitarChordDiagram,
  getPianoKeysForChord,
  GuitarChordDiagram,
} from '@/lib/music/chordDiagrams';
import { getBassGuidanceForChord } from '@/lib/music/instrumentGuidance';
import {
  playGuitarChord,
  playPianoChord,
  type SoundPlaybackController,
} from '@/lib/audio/soundEngine';

interface ChordInspectorModalProps {
  chord: string | null;
  onClose: () => void;
  keyContext?: string;
}

export function ChordInspectorModal({
  chord,
  onClose,
  keyContext,
}: ChordInspectorModalProps) {
  const [activeSound, setActiveSound] = useState<'guitar' | 'piano' | null>(null);
  const soundControllerRef = useRef<SoundPlaybackController | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      soundControllerRef.current?.stop();
    };
  }, [onClose]);

  if (!chord || chord === 'N.C.') return null;

  const handlePlayGuitar = () => {
    soundControllerRef.current?.stop();
    setActiveSound('guitar');
    const ctrl = playGuitarChord(chord);
    soundControllerRef.current = ctrl;
    setTimeout(() => {
      setActiveSound((prev) => (prev === 'guitar' ? null : prev));
    }, 2500);
  };

  const handlePlayPiano = () => {
    soundControllerRef.current?.stop();
    setActiveSound('piano');
    const ctrl = playPianoChord(chord, keyContext);
    soundControllerRef.current = ctrl;
    setTimeout(() => {
      setActiveSound((prev) => (prev === 'piano' ? null : prev));
    }, 2500);
  };

  const handleStopSound = () => {
    soundControllerRef.current?.stop();
    setActiveSound(null);
  };

  const guitar = getGuitarChordDiagram(chord);
  const piano = getPianoKeysForChord(chord, keyContext);
  const bass = getBassGuidanceForChord(chord, 'auto', keyContext);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chord Inspector: ${chord}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleStopSound();
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl sm:text-3xl font-extrabold text-[var(--chord-color)]">
              {chord}
            </span>
            {bass?.isSlashInversion && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Slash Inversion
              </span>
            )}

            {/* Quick Strum Audio Trigger */}
            <button
              type="button"
              onClick={activeSound ? handleStopSound : handlePlayGuitar}
              aria-label={activeSound ? 'Stop chord audio' : `Hear ${chord} chord sound`}
              data-testid="chord-hear-sound-btn"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                activeSound === 'guitar'
                  ? 'bg-[var(--brand-accent)] text-[#0c0c10] animate-pulse ring-2 ring-[var(--brand-accent)]/40'
                  : 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10]'
              }`}
            >
              {activeSound === 'guitar' ? (
                <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{activeSound === 'guitar' ? 'Playing...' : 'Hear Chord'}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              handleStopSound();
              onClose();
            }}
            aria-label="Close chord inspector"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Notes & Formula */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-[var(--bg-subtle)] p-3 rounded-xl border border-[var(--border-subtle)]">
          <div className="space-y-0.5">
            <span className="text-[var(--text-secondary)] uppercase tracking-wider block font-medium">
              Chord Tones
            </span>
            <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
              {piano.notes.length > 0 ? piano.notes.join(' · ') : chord}
            </span>
          </div>
          {bass && (
            <div className="space-y-0.5 border-l border-[var(--border-subtle)] pl-3">
              <span className="text-[var(--text-secondary)] uppercase tracking-wider block font-medium">
                Bass Note
              </span>
              <span className="font-mono font-bold text-sm text-[var(--brand-accent)]">
                {bass.primaryBass} {bass.isSlashInversion ? `(over ${bass.chordRoot})` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Tabbed Views: Guitar & Keyboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Guitar Diagram Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 space-y-3 flex flex-col items-center">
            <div className="w-full flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <Guitar className="w-4 h-4 text-[var(--brand-accent)]" aria-hidden="true" />
                <span>Guitar Voicing</span>
              </span>
              {guitar && guitar.baseFret > 1 && (
                <span className="font-mono text-[var(--text-primary)]">
                  Fret {guitar.baseFret}
                </span>
              )}
            </div>

            {guitar ? (
              <GuitarFretboardSVG diagram={guitar} />
            ) : (
              <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
                Standard movable shape
              </div>
            )}

            <button
              type="button"
              onClick={handlePlayGuitar}
              className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeSound === 'guitar'
                  ? 'bg-[var(--brand-accent)] text-[#0c0c10] font-bold'
                  : 'bg-[var(--bg-surface)] hover:bg-[var(--brand-surface)] text-[var(--text-primary)] hover:text-[var(--brand-accent)] border border-[var(--border-subtle)]'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{activeSound === 'guitar' ? 'Strumming Guitar...' : 'Strum Guitar Voicing'}</span>
            </button>
          </div>

          {/* Keyboard Voicing Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 space-y-3 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <Piano className="w-4 h-4 text-[var(--brand-accent)]" aria-hidden="true" />
                <span>Piano Voicing</span>
              </span>
              <span className="text-[0.6875rem] text-[var(--brand-accent)]">
                LH Bass: {piano.leftHandBass || 'Root'}
              </span>
            </div>

            <PianoKeyboardSVG keys={piano.keys} />

            <button
              type="button"
              onClick={handlePlayPiano}
              className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeSound === 'piano'
                  ? 'bg-[var(--brand-accent)] text-[#0c0c10] font-bold'
                  : 'bg-[var(--bg-surface)] hover:bg-[var(--brand-surface)] text-[var(--text-primary)] hover:text-[var(--brand-accent)] border border-[var(--border-subtle)]'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{activeSound === 'piano' ? 'Playing Piano...' : 'Play Piano Voicing'}</span>
            </button>

            <p className="text-[0.6875rem] text-center text-[var(--text-secondary)]">
              Left hand holds bass note ({piano.leftHandBass || 'root'}); right hand plays chord tones.
            </p>
          </div>
        </div>

        {/* Bass Guidance Box */}
        {bass && (
          <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-subtle)]/70 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-[var(--brand-accent)] shrink-0" aria-hidden="true" />
              <span>
                <strong>Bass:</strong> Root <strong className="font-mono text-[var(--text-primary)]">{bass.chordRoot}</strong>
                {bass.isSlashInversion && (
                  <> · Play inverted bass on <strong className="font-mono text-[var(--brand-accent)]">{bass.primaryBass}</strong></>
                )}
                {' · '}Fifth <strong className="font-mono text-[var(--text-primary)]">{bass.fifthNote}</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Clean SVG Guitar Fretboard
 */
function GuitarFretboardSVG({ diagram }: { diagram: GuitarChordDiagram }) {
  const numFrets = 4;
  const stringX = [18, 38, 58, 78, 98, 118]; // 6 strings
  const fretY = [35, 60, 85, 110, 135]; // nut + 4 frets

  const stringLabels = ['E', 'A', 'D', 'G', 'B', 'e'];

  return (
    <svg
      viewBox="0 0 140 160"
      className="w-36 h-40 select-none"
      aria-label={`Guitar chord diagram for ${diagram.chord}`}
    >
      {/* Nut / Base Fret indicator */}
      {diagram.baseFret === 1 ? (
        <line
          x1={stringX[0]}
          y1={fretY[0]}
          x2={stringX[5]}
          y2={fretY[0]}
          stroke="currentColor"
          strokeWidth="4"
          className="text-[var(--text-primary)]"
        />
      ) : (
        <>
          <line
            x1={stringX[0]}
            y1={fretY[0]}
            x2={stringX[5]}
            y2={fretY[0]}
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-[var(--border-strong)]"
          />
          <text
            x="4"
            y={fretY[0] + 16}
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
            className="fill-[var(--text-secondary)]"
          >
            {diagram.baseFret}fr
          </text>
        </>
      )}

      {/* Horizontal Frets */}
      {fretY.slice(1).map((y, idx) => (
        <line
          key={idx}
          x1={stringX[0]}
          y1={y}
          x2={stringX[5]}
          y2={y}
          stroke="currentColor"
          strokeWidth="1"
          className="text-[var(--border-subtle)]"
        />
      ))}

      {/* Vertical Strings */}
      {stringX.map((x, idx) => (
        <line
          key={idx}
          x1={x}
          y1={fretY[0]}
          x2={x}
          y2={fretY[fretY.length - 1]}
          stroke="currentColor"
          strokeWidth={idx === 0 || idx === 1 ? '1.5' : '1'}
          className="text-[var(--text-secondary)]"
        />
      ))}

      {/* Muted (X) or Open (O) indicators above nut */}
      {diagram.frets.map((fretVal, strIdx) => {
        const x = stringX[strIdx];
        if (fretVal === 'x') {
          return (
            <text
              key={strIdx}
              x={x}
              y="20"
              textAnchor="middle"
              fontSize="12"
              fontFamily="monospace"
              fontWeight="bold"
              className="fill-rose-500"
            >
              ×
            </text>
          );
        }
        if (fretVal === 0 || fretVal === diagram.baseFret - 1) {
          return (
            <circle
              key={strIdx}
              cx={x}
              cy="16"
              r="4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-[var(--brand-accent)]"
            />
          );
        }
        return null;
      })}

      {/* Pressed Frets (Dots) */}
      {diagram.frets.map((fretVal, strIdx) => {
        if (typeof fretVal !== 'number' || fretVal <= 0) return null;
        // Relative fret from baseFret
        const relFret = fretVal >= diagram.baseFret ? fretVal - diagram.baseFret + 1 : fretVal;
        if (relFret < 1 || relFret > numFrets) return null;

        const cx = stringX[strIdx];
        const cy = (fretY[relFret - 1] + fretY[relFret]) / 2;
        const finger = diagram.fingers?.[strIdx];

        return (
          <g key={strIdx}>
            <circle
              cx={cx}
              cy={cy}
              r="7"
              fill="currentColor"
              className="text-[var(--brand-accent)]"
            />
            {finger && (
              <text
                x={cx}
                y={cy + 3.5}
                textAnchor="middle"
                fontSize="9"
                fontWeight="bold"
                className="fill-[var(--bg-surface)]"
              >
                {finger}
              </text>
            )}
          </g>
        );
      })}

      {/* Bottom String Labels */}
      {stringLabels.map((lbl, idx) => (
        <text
          key={idx}
          x={stringX[idx]}
          y="152"
          textAnchor="middle"
          fontSize="9"
          className="fill-[var(--text-secondary)]"
        >
          {lbl}
        </text>
      ))}
    </svg>
  );
}

/**
 * 2-Octave Mini Piano SVG
 */
function PianoKeyboardSVG({ keys }: { keys: ReturnType<typeof getPianoKeysForChord>['keys'] }) {
  const whiteKeys = keys.filter((k) => !k.isBlack);
  const whiteKeyWidth = 14;
  const whiteKeyHeight = 58;
  const blackKeyWidth = 8.5;
  const blackKeyHeight = 36;

  // Compute X position for black keys
  const blackKeyOffsets: Record<number, number> = {
    1: 10,   // C#
    3: 24,   // D#
    6: 52,   // F#
    8: 66,   // G#
    10: 80,  // A#
    13: 108, // C# oct 2
    15: 122, // D# oct 2
    18: 150, // F# oct 2
    20: 164, // G# oct 2
    22: 178, // A# oct 2
  };

  return (
    <svg
      viewBox="0 0 200 68"
      className="w-48 h-18 select-none"
      aria-label="Piano keyboard chord voicing diagram"
    >
      {/* White Keys */}
      {whiteKeys.map((k, idx) => {
        const x = idx * whiteKeyWidth + 2;
        return (
          <rect
            key={idx}
            x={x}
            y="2"
            width={whiteKeyWidth - 1}
            height={whiteKeyHeight}
            rx="1.5"
            fill={
              k.isBass
                ? 'var(--brand-surface)'
                : k.isChordTone
                ? 'var(--chord-bg)'
                : 'white'
            }
            stroke="currentColor"
            strokeWidth="1"
            className="text-stone-300 dark:text-stone-700"
          />
        );
      })}

      {/* Black Keys */}
      {keys.map((k, idx) => {
        if (!k.isBlack) return null;
        const x = blackKeyOffsets[idx] ?? 0;
        return (
          <rect
            key={idx}
            x={x}
            y="2"
            width={blackKeyWidth}
            height={blackKeyHeight}
            rx="1"
            fill={
              k.isBass
                ? 'var(--brand-accent)'
                : k.isChordTone
                ? 'var(--chord-color)'
                : '#1e293b'
            }
            stroke="#0f172a"
            strokeWidth="0.75"
          />
        );
      })}

      {/* Markers / Dots on active white keys */}
      {whiteKeys.map((k, idx) => {
        if (!k.isChordTone && !k.isBass) return null;
        const cx = idx * whiteKeyWidth + whiteKeyWidth / 2 + 1.5;
        const cy = whiteKeyHeight - 8;
        return (
          <circle
            key={idx}
            cx={cx}
            cy={cy}
            r="3.5"
            fill={k.isBass ? 'var(--brand-accent)' : 'var(--chord-color)'}
          />
        );
      })}
    </svg>
  );
}
