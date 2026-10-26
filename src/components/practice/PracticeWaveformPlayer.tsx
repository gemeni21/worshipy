'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
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
  Volume2,
} from 'lucide-react';
import {
  PracticeTake,
  exportPracticeTake,
  updatePracticeTakeNotes,
  resolvePlaybackUrl,
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
  const waveformRef = useRef<HTMLDivElement | null>(null);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(take.durationSeconds || 0);
  const durationRef = useRef<number>(take.durationSeconds || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Sync duration state & ref when take changes
  useEffect(() => {
    if (take.durationSeconds && take.durationSeconds > 0) {
      setDuration(take.durationSeconds);
      durationRef.current = take.durationSeconds;
    }
  }, [take.durationSeconds, take.id]);

  // Decode audio buffer duration if blob exists but duration is uncalculated/zero
  useEffect(() => {
    if (take.blob && (!take.durationSeconds || take.durationSeconds <= 0)) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        take.blob
          .arrayBuffer()
          .then((buf) => ctx.decodeAudioData(buf))
          .then((decoded) => {
            if (decoded && decoded.duration > 0) {
              setDuration(decoded.duration);
              durationRef.current = decoded.duration;
            }
            ctx.close();
          })
          .catch(() => {
            ctx.close();
          });
      }
    }
  }, [take.blob, take.durationSeconds]);

  // Notes state
  const [notes, setNotes] = useState(take.notes || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedToast, setNotesSavedToast] = useState(false);

  // Maintain reliable audio source URL
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
      const resolved = resolvePlaybackUrl(take.audioUrl);
      setAudioSrc(resolved);
    } else {
      setAudioSrc(null);
    }

    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [take.blob, take.audioUrl]);

  // Keep audio playback properties in sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.preservesPitch = true;
    audio.playbackRate = playbackRate;
    audio.loop = isLooping;
  }, [playbackRate, isLooping, audioSrc]);

  // Ultra-smooth 60fps playhead animation loop during playback
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;

    const tick = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        setCurrentTime(audio.currentTime);

        // Dynamically correct WebM Infinite duration or missing duration if needed
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          if (audio.duration !== durationRef.current) {
            durationRef.current = audio.duration;
            setDuration(audio.duration);
          }
        } else if (audio.currentTime > durationRef.current) {
          const nextDur = Math.ceil(audio.currentTime);
          durationRef.current = nextDur;
          setDuration(nextDur);
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Effective duration calculation
  const effectiveDuration = useMemo(() => {
    if (Number.isFinite(duration) && duration > 0) {
      return Math.max(duration, currentTime);
    }
    if (Number.isFinite(take.durationSeconds) && take.durationSeconds > 0) {
      return Math.max(take.durationSeconds, currentTime);
    }
    return Math.max(1, currentTime);
  }, [duration, take.durationSeconds, currentTime]);

  const progressFraction = Math.max(0, Math.min(1, currentTime / effectiveDuration));

  // Transport toggle
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      setPlaybackError('Audio player initializing, please try again in a moment...');
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setPlaybackError(null);
      audio.preservesPitch = true;
      audio.playbackRate = playbackRate;
      audio.loop = isLooping;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.error('Playback start failure:', err);
            const msg = err instanceof Error ? err.message : '';
            if (msg.includes('NotSupportedError') || msg.includes('not supported')) {
              setPlaybackError(
                take.audioUrl && (take.audioUrl.includes('drive.google.com') || take.audioUrl.includes('drive.usercontent.google.com') || audioSrc?.includes('provider=gdrive'))
                  ? 'Unable to play Google Drive audio: please verify that the file sharing permissions in Google Drive are set to "Anyone with the link can view".'
                  : 'Audio format or stream is not supported by your browser.'
              );
            } else if (msg.includes('NotAllowedError')) {
              setPlaybackError('Browser audio autoplay blocked. Tap Play to listen.');
            } else {
              setPlaybackError(msg || 'Audio playback failed to start.');
            }
            setIsPlaying(false);
          });
      }
    }
  }, [isPlaying, playbackRate, isLooping]);

  const seekTo = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, Math.min(effectiveDuration, fraction * effectiveDuration));
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(fraction);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    seekFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      seekFromPointer(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const skipSeconds = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
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
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const peaks = take.waveformPeaks && take.waveformPeaks.length > 0
    ? take.waveformPeaks
    : Array(64).fill(0.3);

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm space-y-3 transition-all">
      {/* Audio Element with direct React event bindings */}
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="auto"
          onTimeUpdate={(e) => {
            const audio = e.currentTarget;
            if (audio) {
              setCurrentTime(audio.currentTime);
              if (Number.isFinite(audio.duration) && audio.duration > 0) {
                setDuration(audio.duration);
              }
            }
          }}
          onLoadedMetadata={(e) => {
            const audio = e.currentTarget;
            if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
              setDuration(audio.duration);
            }
          }}
          onDurationChange={(e) => {
            const audio = e.currentTarget;
            if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
              setDuration(audio.duration);
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            if (!isLooping) {
              setIsPlaying(false);
              setCurrentTime(0);
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
              }
            }
          }}
          onError={() => {
            console.warn('Audio playback error on source:', audioSrc);
            setPlaybackError(
              take.audioUrl && (take.audioUrl.includes('drive.google.com') || take.audioUrl.includes('drive.usercontent.google.com') || audioSrc?.includes('provider=gdrive'))
                ? 'Google Drive audio requires public access ("Anyone with the link can view").'
                : 'Unable to decode audio. Check file format or network permissions.'
            );
            setIsPlaying(false);
          }}
        />
      )}

      {/* Header Info */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm text-[var(--text-primary)] truncate">
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

            {isPlaying && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full animate-pulse">
                <Volume2 className="w-3 h-3" />
                <span>Playing</span>
              </span>
            )}
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
              <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[200px]">
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

      {/* Interactive Drag-and-Click Waveform Scrubber */}
      <div
        ref={waveformRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek audio timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(effectiveDuration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(effectiveDuration)}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            skipSeconds(5);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            skipSeconds(-5);
          } else if (e.key === 'Home') {
            e.preventDefault();
            seekTo(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            seekTo(1);
          } else if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            togglePlay();
          }
        }}
        title="Click or drag anywhere to seek (or use Arrow keys)"
        className="group relative h-14 flex items-center gap-[2.5px] px-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)]/40 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 cursor-pointer select-none overflow-hidden transition-colors touch-none"
      >
        {/* Dynamic Waveform Progress Background Fill */}
        <div
          className={`absolute inset-y-0 left-0 bg-[var(--brand-accent)]/15 pointer-events-none ${
            isPlaying ? 'transition-none' : 'transition-[width] duration-100 ease-out'
          }`}
          style={{ width: `${progressFraction * 100}%` }}
        />

        {/* Floating Playhead Needle with Top & Bottom Beads */}
        <div
          className={`absolute inset-y-0 w-0.5 bg-[var(--brand-accent)] shadow-md pointer-events-none z-10 ${
            isPlaying ? 'transition-none' : 'transition-[left] duration-100 ease-out'
          }`}
          style={{ left: `${progressFraction * 100}%` }}
        >
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-[var(--brand-accent)] shadow-sm" />
          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-full bg-[var(--brand-accent)] shadow-sm" />
        </div>

        {/* Waveform Sound Bars */}
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
                    ? 'bg-[var(--brand-accent)] shadow-[0_0_8px_rgba(var(--brand-accent-rgb),0.5)]'
                    : 'bg-[var(--border-strong)] group-hover:bg-[var(--text-secondary)]/40'
                }`}
                style={{ height: `${Math.max(14, barHeightPct)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Transport Controls & Time Readout */}
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

          {/* Play/Pause Main Button */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={`w-10 h-10 rounded-full flex items-center justify-center bg-[var(--brand-accent)] text-[#0c0c10] font-bold shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer ${
              isPlaying ? 'ring-4 ring-[var(--brand-accent)]/30' : ''
            }`}
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

          {/* Pitch-Preserved Speed Control Pill */}
          <button
            type="button"
            onClick={cycleSpeed}
            title="Cycle Speed (Pitch-Preserved)"
            className="ml-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--brand-accent)]/50 transition-colors cursor-pointer"
          >
            {playbackRate}×
          </button>

          {/* Continuous Loop Toggle */}
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

        {/* Real-time Current Time / Total Duration */}
        <div className="font-mono text-xs text-[var(--text-secondary)] tracking-tight">
          <span className="text-[var(--text-primary)] font-bold">
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
