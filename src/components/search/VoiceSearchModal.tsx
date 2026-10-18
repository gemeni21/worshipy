'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
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
  if (!isOpen) return null;
  return <VoiceSearchDialog onClose={onClose} />;
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

  // Auto-start listening on mount if supported, stop on unmount
  useEffect(() => {
    if (isSupported) {
      startListening();
    }
    return () => {
      stopListening();
    };
  }, [isSupported, startListening, stopListening]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] flex items-center justify-center">
              <Volume2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="voice-search-title" className="text-base font-bold leading-tight">
                Voice Search
              </h2>
              <span className="text-xs text-[var(--text-secondary)]">
                Speak a song title, artist, or lyric
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
        <div className="p-6 text-center space-y-4 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40">
          <div className="relative inline-flex items-center justify-center">
            {/* Animated Ripple Wave when active */}
            {isListening && (
              <span
                className="absolute inset-0 rounded-full bg-[var(--brand-accent)]/30 animate-voice-ring"
                aria-hidden="true"
              />
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
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all transform active:scale-95 cursor-pointer shadow-lg ${
                isListening
                  ? 'bg-[var(--brand-accent)] text-[var(--bg-surface)] scale-105 shadow-[var(--brand-accent)]/40'
                  : 'bg-[var(--bg-surface)] border-2 border-[var(--brand-accent)] text-[var(--brand-accent)] hover:bg-[var(--brand-surface)]'
              }`}
            >
              {isListening ? (
                <Mic className="w-9 h-9 animate-pulse" aria-hidden="true" />
              ) : (
                <MicOff className="w-9 h-9 opacity-80" aria-hidden="true" />
              )}
            </button>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
              {isListening ? 'Listening...' : activeQuery ? 'Speech Captured' : 'Ready'}
            </div>

            {/* Spoken Text Display */}
            <div className="mt-2 min-h-[2.5rem] flex items-center justify-center">
              {activeQuery ? (
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] px-4">
                  &ldquo;{activeQuery}&rdquo;
                </p>
              ) : (
                <p className="text-sm text-[var(--text-secondary)] italic max-w-xs mx-auto">
                  {isSupported
                    ? 'Speak clearly into your microphone...'
                    : 'Web Speech is not supported in this browser. You can type below.'}
                </p>
              )}
            </div>
          </div>

          {/* Error notice if microphone denied or failed */}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2 text-left"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick manual text edit if the user wants to tweak the transcript */}
          <div className="flex items-center gap-2 max-w-sm mx-auto">
            <div className="relative flex-1">
              <input
                type="text"
                value={activeQuery}
                onChange={(e) => {
                  stopListening();
                  setManualQuery(e.target.value);
                }}
                placeholder="Or edit search text..."
                className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
              />
            </div>
            {activeQuery && (
              <button
                type="button"
                onClick={() => {
                  setManualQuery('');
                  reset();
                }}
                className="h-9 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:text-rose-500 cursor-pointer inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeQuery ? (
            matchedSongs.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] px-1">
                  <span>Found {matchedSongs.length} matching songs:</span>
                  <Link
                    href={`/songs?q=${encodeURIComponent(activeQuery)}`}
                    onClick={onClose}
                    className="text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1 font-medium"
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
                    className="w-full text-left rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 hover:border-[var(--brand-accent)] hover:bg-[var(--brand-surface)]/20 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm sm:text-base text-[var(--text-primary)] group-hover:text-[var(--brand-accent)] truncate">
                        {song.title}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2 mt-0.5">
                        <span className="truncate">{song.artist || song.attribution || 'Unknown Artist'}</span>
                        <span>·</span>
                        <span className="font-semibold text-[var(--brand-accent)]">Key of {song.originalKey}</span>
                        <span>·</span>
                        <span>{song.language.label}</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/20 text-xs font-semibold group-hover:bg-[var(--brand-accent)] group-hover:text-[var(--bg-surface)] transition-colors">
                      <span>Open</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
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
                  Try saying a different song title, artist, or tap a suggestion below:
                </p>
              </div>
            )
          ) : (
            <div className="p-4 space-y-3">
              <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Popular Voice Searches:
              </div>
              <div className="flex flex-wrap gap-2">
                {COMMON_VOICE_SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleApplySuggestion(sug)}
                    className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-medium hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] transition-colors cursor-pointer"
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
