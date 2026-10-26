'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Rewind,
  Download,
  Trash2,
  Repeat,
  FileText,
  Save,
  Check,
  ExternalLink,
  Mic,
  UploadCloud,
  Link as LinkIcon,
  AlertCircle,
} from 'lucide-react';
import {
  PracticeTake,
  exportPracticeTake,
  updatePracticeTakeNotes,
} from '@/lib/audio/practiceStorage';

interface PracticeWaveformPlayerProps {
  take: PracticeTake;
  onDelete?: (id: string) => void;
  onNotesUpdated?: (id: string, notes: string) => void;
  compact?: boolean;
}

export function PracticeWaveformPlayer({
  take,
  onDelete,
  onNotesUpdated,
  compact = false,
}: PracticeWaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(take.durationSeconds || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Notes state
  const [notes, setNotes] = useState(take.notes || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedToast, setNotesSavedToast] = useState(false);

  // Maintain reliable audio source URL (blob object URL or external cloud streaming link)
  useEffect(() => {
    let activeUrl: string | null = null;

    if (take.blob && take.blob.size > 0) {
      try {
        activeUrl = URL.createObjectURL(take.blob);
        setAudioSrc(activeUrl);
      } catch (err) {
        console.error('Failed to create audio blob URL:', err);
        setAudioSrc(null);
      }
    } else if (take.audioUrl) {
      setAudioSrc(take.audioUrl);
    } else {
      setAudioSrc(null);
    }

    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [take.blob, take.audioUrl]);

  // Sync audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.preservesPitch = true;
    audio.playbackRate = playbackRate;
    audio.loop = isLooping;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      if (!audio.loop) {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    const handleError = () => {
      console.warn('Audio playback error on source:', audio.src);
      setPlaybackError(
        take.audioUrl && take.audioUrl.includes('drive.google.com')
          ? 'Google Drive audio link requires public access ("Anyone with the link can view").'
          : 'Unable to decode audio. Check file format or network permissions.'
      );
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [playbackRate, isLooping, take.audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      setPlaybackError('Audio player is still initializing...');
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setPlaybackError(null);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.error('Playback start failure:', err);
            setPlaybackError(
              err instanceof Error ? err.message : 'Audio playback blocked by browser.'
            );
            setIsPlaying(false);
          });
      }
    }
  }, [isPlaying]);

  const seekTo = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const effectiveDuration = duration > 0 ? duration : take.durationSeconds || 1;
    const target = Math.max(0, Math.min(effectiveDuration, fraction * effectiveDuration));
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(fraction);
  };

  const skipSeconds = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const effectiveDuration = duration > 0 ? duration : take.durationSeconds || 1;
    const target = Math.max(0, Math.min(effectiveDuration, audio.currentTime + seconds));
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 0.9, 1.0, 1.25];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    await updatePracticeTakeNotes(take.id, notes);
    setIsSavingNotes(false);
    setIsEditingNotes(false);
    setNotesSavedToast(true);
    onNotesUpdated?.(take.id, notes);
    setTimeout(() => setNotesSavedToast(false), 2000);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const peaks = take.waveformPeaks && take.waveformPeaks.length > 0
    ? take.waveformPeaks
    : Array(64).fill(0.3);

  const effectiveDuration = duration > 0 ? duration : take.durationSeconds || 1;
  const progressFraction = Math.max(0, Math.min(1, currentTime / effectiveDuration));

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm space-y-3">
      {/* Hidden audio element with reactive state src */}
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="auto"
        />
      )}

      {/* Header Info */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
              {take.songTitle}
            </span>

            {/* Source Type Badge */}
            {take.sourceType === 'upload' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">
                <UploadCloud className="w-3 h-3" />
                <span>Uploaded</span>
              </span>
            ) : take.sourceType === 'link' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/20">
                <LinkIcon className="w-3 h-3" />
                <span>Cloud Link</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                <Mic className="w-3 h-3" />
                <span>Mic Take</span>
              </span>
            )}

            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--brand-accent)]/15 text-[var(--brand-accent)] border border-[var(--brand-accent)]/20">
              Key of {take.key}
              {take.capo ? ` • Capo ${take.capo}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-[var(--text-secondary)]">
              {new Date(take.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {take.fileName && (
              <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[180px]">
                • {take.fileName}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {take.audioUrl && (
            <a
              href={take.audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Original Cloud Link"
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => exportPracticeTake(take)}
            title="Download / Export Audio"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(take.id)}
              title="Delete Take"
              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Playback Error Alert */}
      {playbackError && (
        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{playbackError}</span>
        </div>
      )}

      {/* Scrubbable Waveform */}
      <div
        onClick={handleWaveformClick}
        title="Click anywhere to seek"
        className="group relative h-12 flex items-center gap-[2px] px-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] cursor-pointer select-none overflow-hidden"
      >
        {/* Progress Fill Background Highlight */}
        <div
          className="absolute inset-y-0 left-0 bg-[var(--brand-accent)]/15 pointer-events-none transition-[width] duration-75"
          style={{ width: `${progressFraction * 100}%` }}
        />

        {/* Playhead Marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--brand-accent)] shadow-sm pointer-events-none transition-[left] duration-75"
          style={{ left: `${progressFraction * 100}%` }}
        />

        {/* Waveform Bars */}
        {peaks.map((val, idx) => {
          const barFraction = idx / peaks.length;
          const isPassed = barFraction <= progressFraction;
          const barHeightPct = Math.round(val * 100);

          return (
            <div
              key={idx}
              className="flex-1 flex items-center justify-center h-full pointer-events-none"
            >
              <div
                className={`w-full max-w-[4px] rounded-full transition-all duration-75 ${
                  isPassed
                    ? 'bg-[var(--brand-accent)] shadow-xs'
                    : 'bg-[var(--border-strong)] group-hover:bg-[var(--text-secondary)]/50'
                }`}
                style={{ height: `${Math.max(15, barHeightPct)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Transport Controls & Time */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          {/* 5s Rewind */}
          <button
            type="button"
            onClick={() => skipSeconds(-5)}
            title="Rewind 5s"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <Rewind className="w-4 h-4" />
          </button>

          {/* Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--brand-accent)] text-[#0c0c10] font-bold shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* 5s Fast Forward */}
          <button
            type="button"
            onClick={() => skipSeconds(5)}
            title="Forward 5s"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <FastForward className="w-4 h-4" />
          </button>

          {/* Speed Control Pill */}
          <button
            type="button"
            onClick={cycleSpeed}
            title="Cycle Speed (Pitch-Preserved)"
            className="ml-1 px-2 py-1 rounded-lg text-xs font-mono font-bold bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--brand-accent)]/50 transition-colors cursor-pointer"
          >
            {playbackRate}×
          </button>

          {/* Section Loop Toggle */}
          <button
            type="button"
            onClick={() => setIsLooping(!isLooping)}
            title={isLooping ? 'Disable Loop' : 'Enable Continuous Loop'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLooping
                ? 'bg-[var(--brand-accent)]/20 text-[var(--brand-accent)] border border-[var(--brand-accent)]/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Time Display */}
        <div className="font-mono text-xs text-[var(--text-secondary)] tracking-tight">
          <span className="text-[var(--text-primary)] font-semibold">
            {formatTime(currentTime)}
          </span>{' '}
          / {formatTime(effectiveDuration)}
        </div>
      </div>

      {/* Musician Notes Section */}
      {!compact && (
        <div className="pt-2 border-t border-[var(--border-subtle)]/70">
          {!isEditingNotes && !notes ? (
            <button
              type="button"
              onClick={() => setIsEditingNotes(true)}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--brand-accent)] transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Add practice notes (e.g. vocal harmonies, transition timing)...</span>
            </button>
          ) : isEditingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes on this take (e.g. bridge vocal transition was sharp, acoustic guitar strum clean)..."
                rows={2}
                className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--brand-accent)]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNotes(take.notes || '');
                    setIsEditingNotes(false);
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] hover:opacity-95 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3 h-3" />
                  <span>{isSavingNotes ? 'Saving...' : 'Save Notes'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setIsEditingNotes(true)}
              title="Click to edit notes"
              className="group flex items-start justify-between gap-2 p-2 rounded-xl bg-[var(--bg-subtle)]/60 hover:bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] cursor-pointer transition-colors"
            >
              <div className="flex items-start gap-1.5">
                <FileText className="w-3.5 h-3.5 mt-0.5 text-[var(--text-secondary)] shrink-0" />
                <p className="whitespace-pre-wrap">{notes}</p>
              </div>
              <span className="text-[10px] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity">
                Edit
              </span>
            </div>
          )}

          {notesSavedToast && (
            <div className="flex items-center gap-1 text-[11px] text-emerald-400 mt-1">
              <Check className="w-3 h-3" />
              <span>Notes updated</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
