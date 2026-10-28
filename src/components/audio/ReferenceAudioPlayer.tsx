'use client';

import React, { useEffect, useRef, useState, useCallback, useId } from 'react';
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  Repeat,
  Volume2,
  Volume1,
  VolumeX,
  ExternalLink,
  AlertCircle,
  Music2,
  Loader2,
} from 'lucide-react';
import {
  resolveReferencePlayback,
  generateDeterministicPeaks,
  loadYouTubeIFrameApi,
  getAudioSourceLabel,
  ReferenceAudioSourceType,
} from '@/lib/audio/referenceAudio';

interface ReferenceAudioPlayerProps {
  url: string;
  songTitle?: string;
  onClose?: () => void;
  compact?: boolean;
}

export function ReferenceAudioPlayer({
  url,
  songTitle,
  compact = false,
}: ReferenceAudioPlayerProps) {
  const componentId = useId().replace(/:/g, '_');
  const ytContainerId = `worshipy_yt_player_${componentId}`;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLooping, setIsLooping] = useState(false);
  const isLoopingRef = useRef(false);
  isLoopingRef.current = isLooping;

  const [volume, setVolume] = useState<number>(() => {
    if (typeof window === 'undefined') return 1.0;
    try {
      const saved = localStorage.getItem('worshipy_ref_volume');
      if (saved !== null) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 0 && val <= 1) return val;
      }
    } catch {}
    return 1.0;
  });
  const [isMuted, setIsMuted] = useState(false);
  const prevVolumeRef = useRef<number>(volume);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Resolved playback config
  const playbackConfig = resolveReferencePlayback(url);
  const isYouTube = playbackConfig.type === 'youtube';
  const audioSrc = playbackConfig.type === 'audio' ? playbackConfig.streamUrl : null;
  const sourceLabel = getAudioSourceLabel(url);

  // Deterministic waveform peaks
  const peaks = generateDeterministicPeaks(url + (songTitle || ''), compact ? 36 : 64);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ----------------------------------------------------
  // YouTube IFrame Player Setup
  // ----------------------------------------------------
  useEffect(() => {
    if (!isYouTube || !playbackConfig.videoId) return;

    let destroyed = false;
    let localPlayer: any = null;

    setPlaybackError(null);
    setIsBuffering(true);
    setCurrentTime(0);
    setDuration(0);

    loadYouTubeIFrameApi()
      .then((YT) => {
        if (destroyed) return;

        localPlayer = new YT.Player(ytContainerId, {
          videoId: playbackConfig.videoId,
          height: '1',
          width: '1',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            onReady: (event: any) => {
              if (destroyed) {
                try {
                  event.target.destroy();
                } catch {}
                return;
              }
              ytPlayerRef.current = event.target;
              setIsBuffering(false);
              const dur = event.target.getDuration();
              if (dur && dur > 0) setDuration(dur);
              event.target.setVolume(Math.round(volume * 100));
            },
            onStateChange: (event: any) => {
              // 1: PLAYING, 2: PAUSED, 0: ENDED, 3: BUFFERING
              if (event.data === 1) {
                setIsPlaying(true);
                setIsBuffering(false);
                const dur = event.target.getDuration();
                if (dur && dur > 0) setDuration(dur);
              } else if (event.data === 2) {
                setIsPlaying(false);
                setIsBuffering(false);
              } else if (event.data === 0) {
                if (isLoopingRef.current) {
                  event.target.seekTo(0, true);
                  event.target.playVideo();
                } else {
                  setIsPlaying(false);
                  setCurrentTime(0);
                }
              } else if (event.data === 3) {
                setIsBuffering(true);
              }
            },
            onError: (event: any) => {
              setIsBuffering(false);
              setIsPlaying(false);
              console.warn('YouTube Player error code:', event.data);
              if (event.data === 101 || event.data === 150) {
                setPlaybackError(
                  'This YouTube video has playback restrictions set by its owner. Click "Open Original Link" to listen directly on YouTube.'
                );
              } else {
                setPlaybackError('Unable to play audio from this YouTube link. Please verify the URL.');
              }
            },
          },
        });
      })
      .catch((err) => {
        if (!destroyed) {
          setIsBuffering(false);
          setPlaybackError('Failed to initialize YouTube audio engine.');
        }
      });

    return () => {
      destroyed = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (localPlayer) {
        try {
          localPlayer.destroy();
        } catch {}
      }
      ytPlayerRef.current = null;
    };
  }, [isYouTube, playbackConfig.videoId, ytContainerId]);

  // YouTube polling interval to update time readout & duration
  useEffect(() => {
    if (!isYouTube || !isPlaying) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(() => {
      if (!ytPlayerRef.current || isScrubbing) return;
      try {
        const cur = ytPlayerRef.current.getCurrentTime();
        if (Number.isFinite(cur)) {
          setCurrentTime(cur);
        }
        const dur = ytPlayerRef.current.getDuration();
        if (Number.isFinite(dur) && dur > 0 && Math.abs(dur - duration) > 0.5) {
          setDuration(dur);
        }
      } catch {}
    }, 100);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isYouTube, isPlaying, isScrubbing, duration]);

  // ----------------------------------------------------
  // Playback Control Actions
  // ----------------------------------------------------
  const togglePlay = useCallback(() => {
    setPlaybackError(null);
    if (isYouTube) {
      const yt = ytPlayerRef.current;
      if (!yt) return;
      if (isPlaying) {
        yt.pauseVideo();
      } else {
        yt.playVideo();
      }
    } else {
      const audio = audioRef.current;
      if (!audio) return;
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch((err) => {
          console.warn('Audio play error:', err);
          setPlaybackError('Playback was interrupted or blocked. Click to retry.');
        });
      }
    }
  }, [isYouTube, isPlaying]);

  const seekTo = useCallback(
    (fraction: number) => {
      const targetTime = Math.max(0, Math.min(duration, fraction * duration));
      setCurrentTime(targetTime);

      if (isYouTube) {
        if (ytPlayerRef.current?.seekTo) {
          ytPlayerRef.current.seekTo(targetTime, true);
        }
      } else if (audioRef.current) {
        audioRef.current.currentTime = targetTime;
      }
    },
    [duration, isYouTube]
  );

  const skipSeconds = useCallback(
    (delta: number) => {
      const target = Math.max(0, Math.min(duration || 0, currentTime + delta));
      setCurrentTime(target);

      if (isYouTube) {
        if (ytPlayerRef.current?.seekTo) {
          ytPlayerRef.current.seekTo(target, true);
        }
      } else if (audioRef.current) {
        audioRef.current.currentTime = target;
      }
    },
    [currentTime, duration, isYouTube]
  );

  const cycleSpeed = useCallback(() => {
    const speeds = [0.75, 0.9, 1.0, 1.25];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackRate(nextSpeed);

    if (isYouTube && ytPlayerRef.current?.setPlaybackRate) {
      ytPlayerRef.current.setPlaybackRate(nextSpeed);
    } else if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  }, [playbackRate, isYouTube]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVol = Math.max(0, Math.min(1, parseFloat(e.target.value)));
    setVolume(nextVol);
    if (nextVol > 0 && isMuted) {
      setIsMuted(false);
    }

    if (isYouTube && ytPlayerRef.current?.setVolume) {
      ytPlayerRef.current.setVolume(Math.round(nextVol * 100));
    } else if (audioRef.current) {
      audioRef.current.volume = nextVol;
    }

    try {
      localStorage.setItem('worshipy_ref_volume', nextVol.toString());
    } catch {}
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      const restored = prevVolumeRef.current > 0 ? prevVolumeRef.current : 1.0;
      setVolume(restored);
      if (isYouTube && ytPlayerRef.current?.unMute) {
        ytPlayerRef.current.unMute();
        ytPlayerRef.current.setVolume(Math.round(restored * 100));
      } else if (audioRef.current) {
        audioRef.current.volume = restored;
      }
    } else {
      prevVolumeRef.current = volume;
      setIsMuted(true);
      if (isYouTube && ytPlayerRef.current?.mute) {
        ytPlayerRef.current.mute();
      } else if (audioRef.current) {
        audioRef.current.volume = 0;
      }
    }
  };

  // ----------------------------------------------------
  // Interactive Waveform Scrubbing Handlers
  // ----------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsScrubbing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    calculateScrubPosition(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    calculateScrubPosition(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const calculateScrubPosition = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!waveformRef.current || duration <= 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const fraction = x / rect.width;
    seekTo(fraction);
  };

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressFraction = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 sm:p-4 shadow-sm space-y-3 transition-all select-none">
      {/* Offscreen / Headless YouTube Player Container (strictly audio, NO video visible) */}
      {isYouTube && (
        <div
          className="sr-only pointer-events-none absolute w-[1px] h-[1px] -left-[9999px] top-0 overflow-hidden opacity-0"
          aria-hidden="true"
          tabIndex={-1}
        >
          <div id={ytContainerId} />
        </div>
      )}

      {/* Cloud & Direct HTML5 Audio Player */}
      {!isYouTube && audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="auto"
          onTimeUpdate={(e) => {
            const audio = e.currentTarget;
            if (audio && !isScrubbing) {
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
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            if (!isLooping) {
              setIsPlaying(false);
              setCurrentTime(0);
              if (audioRef.current) audioRef.current.currentTime = 0;
            }
          }}
          onError={() => {
            setPlaybackError(
              url.includes('drive.google.com')
                ? 'Google Drive audio requires public access ("Anyone with the link can view").'
                : 'Unable to decode audio. Please verify the URL or format.'
            );
            setIsPlaying(false);
          }}
        />
      )}

      {/* Header Info: Track Name + Audio Source Badge + External Link */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shrink-0">
            <Music2 className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            {songTitle && (
              <h4 className="font-bold text-xs sm:text-sm text-[var(--text-primary)] truncate">
                {songTitle}
              </h4>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--brand-accent)]/10 text-[var(--brand-accent)] border border-[var(--brand-accent)]/20">
                {sourceLabel}
              </span>
              {isBuffering && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>Loading...</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open original link in new tab"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Playback Error Alert */}
      {playbackError && (
        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span className="flex-1">{playbackError}</span>
        </div>
      )}

      {/* Interactive Drag-and-Click Waveform Scrubber */}
      <div
        ref={waveformRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek reference audio timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
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
        title="Click or drag anywhere across the waveform to seek"
        className="group relative h-12 sm:h-14 flex items-center gap-[2.5px] px-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)]/40 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20 cursor-pointer select-none overflow-hidden transition-colors touch-none"
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
      <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* 5s Rewind */}
          <button
            type="button"
            onClick={() => skipSeconds(-5)}
            title="Rewind 5s (Arrow Left)"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <Rewind className="w-4 h-4" />
          </button>

          {/* Play/Pause Main Button */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={isBuffering && !isPlaying}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-[var(--brand-accent)] text-[#0c0c10] font-bold shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer ${
              isPlaying ? 'ring-4 ring-[var(--brand-accent)]/30' : ''
            }`}
          >
            {isBuffering && !isPlaying ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#0c0c10]" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* 5s Fast Forward */}
          <button
            type="button"
            onClick={() => skipSeconds(5)}
            title="Forward 5s (Arrow Right)"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <FastForward className="w-4 h-4" />
          </button>

          {/* Speed Multiplier Cycle */}
          <button
            type="button"
            onClick={cycleSpeed}
            title="Cycle Playback Speed (0.75x, 0.9x, 1.0x, 1.25x)"
            className="px-2 py-1 rounded-lg text-xs font-mono font-bold bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--brand-accent)]/40 border border-[var(--border-subtle)] transition-colors cursor-pointer"
          >
            {playbackRate}x
          </button>

          {/* Loop Toggle */}
          <button
            type="button"
            onClick={() => setIsLooping(!isLooping)}
            title={isLooping ? 'Looping enabled' : 'Looping disabled'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLooping
                ? 'bg-[var(--brand-accent)]/20 text-[var(--brand-accent)] border border-[var(--brand-accent)]/30'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Right side: Volume and Time Readout */}
        <div className="flex items-center gap-2.5">
          {/* Volume Control */}
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Volume"
              className="w-14 h-1 accent-[var(--brand-accent)] cursor-pointer"
            />
          </div>

          {/* Time Readout */}
          <div className="font-mono text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-subtle)] px-2 py-1 rounded-md border border-[var(--border-subtle)]">
            <span className="text-[var(--text-primary)]">{formatTime(currentTime)}</span>
            <span className="mx-1 text-[var(--text-secondary)]/60">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
