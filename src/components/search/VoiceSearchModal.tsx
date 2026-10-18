'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Mic,
  Music2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { searchAndFilterSongs } from '@/lib/catalog/songCatalog';
import { useVoiceSearch } from '@/lib/speech/useVoiceSearch';

interface VoiceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_VOICE_SUGGESTIONS = [
  'Goodness of God',
  'Way Maker',
  '10,000 Reasons',
  'Salamat Panginoon',
  'What a Beautiful Name',
  'Dakilang Katapatan',
  'Gratitude',
  'Tanging Pag-asa',
];

export function VoiceSearchModal({ isOpen, onClose }: VoiceSearchModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;
  return createPortal(<VoiceSearchDialog onClose={onClose} />, document.body);
}

function VoiceSearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { allAvailableSongs } = useApp();

  const [manualQuery, setManualQuery] = useState('');

  const {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    reset,
  } = useVoiceSearch();

  // Active query is either live transcript or manual query override
  const activeQuery = manualQuery || transcript;

  // Stop listening on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  // Escape key closes modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Real-time matched songs from the entire catalog and personal songs
  const matchedSongs = useMemo(() => {
    const trimmed = activeQuery.trim();
    if (!trimmed) return [];
    return searchAndFilterSongs(allAvailableSongs, { query: trimmed }).slice(0, 5);
  }, [allAvailableSongs, activeQuery]);

  const handleSelectSong = (slug: string) => {
    onClose();
    router.push(`/songs/${slug}`);
  };

  const handleApplySuggestion = (suggestion: string) => {
    stopListening();
    setManualQuery(suggestion);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-search-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200 cursor-pointer overscroll-contain"
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-white/20 dark:border-white/10 bg-[var(--bg-surface)]/95 backdrop-blur-2xl text-[var(--text-primary)] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh] cursor-auto overscroll-contain transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="relative flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500/20 via-emerald-500/20 to-indigo-500/20 text-[var(--brand-accent)] border border-[var(--brand-accent)]/20 flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="voice-search-title" className="text-base font-bold leading-tight flex items-center gap-2">
                <span>Voice Search</span>
                {isListening && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
              </h2>
              <span className="text-xs text-[var(--text-secondary)]">
                Speak a song title, artist, or worship lyric
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice search"
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Listening / Microphone Stage */}
        <div className="relative p-6 text-center space-y-4 border-b border-[var(--border-subtle)] bg-gradient-to-b from-[var(--bg-subtle)]/40 via-[var(--bg-surface)] to-[var(--bg-surface)]">
          {/* Subtle Ambient Radial Light */}
          <div
            className={`absolute top-0 left-1/2 -translate-x-1/2 w-72 h-36 rounded-full blur-3xl pointer-events-none transition-opacity duration-500 ${
              isListening ? 'opacity-30 bg-cyan-400' : 'opacity-10 bg-[var(--brand-accent)]'
            }`}
            aria-hidden="true"
          />

          <div className="relative inline-flex items-center justify-center">
            {/* Multi-Color Fluid Siri / Gemini Aurora Swirl when listening */}
            {isListening && (
              <>
                <div
                  className="absolute -inset-3.5 rounded-full bg-gradient-to-tr from-cyan-400 via-emerald-400 via-indigo-500 to-pink-500 opacity-60 blur-md animate-aurora-spin pointer-events-none"
                  aria-hidden="true"
                />
                <span
                  className="absolute -inset-1 rounded-full bg-gradient-to-tr from-cyan-400 via-emerald-400 to-pink-500 opacity-80 animate-pulse pointer-events-none"
                  aria-hidden="true"
                />
              </>
            )}

            <button
              type="button"
              onClick={() => {
                if (isListening) {
                  stopListening();
                } else {
                  setManualQuery('');
                  startListening();
                }
              }}
              title={isListening ? 'Tap to pause microphone' : 'Tap to start speaking'}
              aria-label={isListening ? 'Stop listening' : 'Start voice search'}
              className={`relative z-10 w-22 h-22 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-95 cursor-pointer shadow-xl ${
                isListening
                  ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white scale-105 shadow-emerald-500/40 ring-4 ring-white/30'
                  : 'bg-[var(--bg-surface)] border-2 border-[var(--brand-accent)]/80 text-[var(--brand-accent)] hover:border-[var(--brand-accent)] hover:scale-105 hover:shadow-lg shadow-black/10'
              }`}
            >
              <Mic className={`w-9 h-9 transition-transform ${isListening ? 'animate-pulse scale-110' : ''}`} aria-hidden="true" />
            </button>
          </div>

          <div>
            {/* Status indicator with dynamic 7-bar soundwave when active */}
            {isListening ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Listening... Speak now</span>
                </div>

                {/* 7-Bar Audio Soundwave Visualizer */}
                <div className="flex items-center justify-center gap-1.5 h-8 pt-1" aria-hidden="true">
                  <span className="w-1.5 rounded-full bg-gradient-to-t from-cyan-500 to-emerald-400 animate-wave-1" />
                  <span className="w-1.5 rounded-full bg-gradient-to-t from-emerald-500 to-teal-300 animate-wave-2" />
                  <span className="w-1.5 rounded-full bg-gradient-to-t from-indigo-500 to-cyan-400 animate-wave-3" />
                  <span className="w-1.5 rounded-full bg-gradient-to-t from-violet-500 to-pink-400 animate-wave-4" />
                  <span className="w-1.5 rounded-full bg-gradient-to-t from-pink-500 to-rose-400 animate-wave-5" />
                  <span className="w-1.5 rounded-full bg-gradient-to-t from-amber-400 to-emerald-400 animate-wave-6" />
                  <span className="w-1.5 rounded-full bg-gradient-to-t from-cyan-400 to-blue-500 animate-wave-7" />
                </div>
              </div>
            ) : (
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
                {activeQuery ? 'Speech Captured' : 'Tap to Speak'}
              </div>
            )}

            {/* Spoken Text Display */}
            <div className="mt-2 min-h-[2.5rem] flex items-center justify-center">
              {activeQuery ? (
                <div className="inline-block px-4 py-2 rounded-2xl bg-gradient-to-r from-[var(--brand-surface)] via-[var(--bg-subtle)] to-[var(--brand-surface)] border border-[var(--brand-accent)]/20 shadow-xs">
                  <p className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    &ldquo;{activeQuery}&rdquo;
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)] italic max-w-xs mx-auto">
                  {isSupported
                    ? 'Tap the microphone and speak your worship song title or lyrics...'
                    : 'Voice recognition is not available in this browser. You can search by typing below:'}
                </p>
              )}
            </div>
          </div>

          {/* Error notice if microphone denied or failed */}
          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5 text-left shadow-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="flex-1 space-y-1">
                <p className="font-medium">{error}</p>
                {isSupported && (
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      startListening();
                    }}
                    className="font-bold underline hover:no-underline cursor-pointer text-amber-800 dark:text-amber-200"
                  >
                    Retry Microphone
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick manual text edit so the user can always search by typing */}
          <div className="flex items-center gap-2 max-w-sm mx-auto">
            <div className="relative flex-1">
              <input
                type="text"
                value={activeQuery}
                onChange={(e) => {
                  stopListening();
                  setManualQuery(e.target.value);
                }}
                placeholder="Type song title, artist, or lyric..."
                className="w-full h-10 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] shadow-xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/40 focus:border-[var(--brand-accent)] transition-all"
              />
            </div>
            {activeQuery && (
              <button
                type="button"
                onClick={() => {
                  setManualQuery('');
                  reset();
                }}
                className="h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-300 cursor-pointer inline-flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain">
          {activeQuery ? (
            matchedSongs.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] px-1">
                  <span className="font-medium flex items-center gap-1.5">
                    <Music2 className="w-3.5 h-3.5 text-[var(--brand-accent)]" aria-hidden="true" />
                    <span>Found {matchedSongs.length} matching songs:</span>
                  </span>
                  <Link
                    href={`/songs?q=${encodeURIComponent(activeQuery)}`}
                    onClick={onClose}
                    className="text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1 font-semibold"
                  >
                    <span>View all</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </div>

                {matchedSongs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => handleSelectSong(song.slug)}
                    className="w-full text-left rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 hover:border-[var(--brand-accent)] hover:bg-[var(--brand-surface)]/25 hover:shadow-md transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm sm:text-base text-[var(--text-primary)] group-hover:text-[var(--brand-accent)] truncate transition-colors">
                        {song.title}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2 mt-1">
                        <span className="truncate">{song.artist || song.attribution || 'Unknown Artist'}</span>
                        <span>·</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md font-semibold text-[11px] bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/20">
                          Key of {song.originalKey}
                        </span>
                        <span>·</span>
                        <span className="text-[11px] text-[var(--text-muted)]">{song.language.label}</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/20 text-xs font-semibold group-hover:bg-[var(--brand-accent)] group-hover:text-white transition-all shadow-xs">
                      <span>Open</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center space-y-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  No song matches for &ldquo;{activeQuery}&rdquo;
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Try speaking a different song title, artist, or tap a suggestion below:
                </p>
              </div>
            )
          ) : (
            <div className="p-4 space-y-3">
              <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--brand-accent)]" aria-hidden="true" />
                <span>Popular Voice Searches:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {COMMON_VOICE_SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleApplySuggestion(sug)}
                    className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-xs font-medium hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] hover:bg-[var(--brand-surface)]/30 hover:scale-102 transition-all cursor-pointer shadow-2xs"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>Tap microphone or anywhere outside to cancel</span>
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
