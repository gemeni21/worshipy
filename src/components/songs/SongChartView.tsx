'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  FileCode2,
  FolderHeart,
  Guitar,
  Heart,
  ListPlus,
  Maximize2,
  Minimize2,
  Minus,
  Pause,
  Play,
  Plus,
  Printer,
  Radio,
  RotateCcw,
  Sparkles,
  Sun,
  Moon,
  Trash2,
  Type,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { downloadSongAsChordPro } from '@/lib/chordpro/chordProDownload';
import { ChordInspectorModal } from '@/components/music/ChordInspectorModal';
import {
  getGuitarCapoSuggestions,
  getCapoRelativeChord,
} from '@/lib/music/instrumentGuidance';
import {
  formatSignedSemitones,
  getDestinationKeyOptions,
  normalizeSemitones,
  transposeSong,
} from '@/lib/music/transposition';
import type {
  ChartFontSize,
  EnharmonicPreference,
  SongLine,
  SongRecord,
} from '@/types/song';

interface SongChartViewProps {
  initialSong?: SongRecord;
  slug: string;
}

const FONT_SIZE_CLASSES: Record<
  ChartFontSize,
  { normal: string; performance: string; label: string }
> = {
  sm: {
    normal: 'text-sm',
    performance: 'text-base sm:text-lg',
    label: 'S',
  },
  md: {
    normal: 'text-base',
    performance: 'text-lg sm:text-xl',
    label: 'M',
  },
  lg: {
    normal: 'text-lg',
    performance: 'text-xl sm:text-2xl',
    label: 'L',
  },
  xl: {
    normal: 'text-xl',
    performance: 'text-2xl sm:text-3xl',
    label: 'XL',
  },
};

function isLineInstrumental(line: SongLine): boolean {
  if (line.isInstrumental) return true;
  return line.segments.every((seg) => seg.text.trim() === '');
}

export function SongChartView({ initialSong, slug }: SongChartViewProps) {
  const {
    isHydrated,
    effectiveOffline,
    getSongByIdOrSlug,
    isFavorite,
    toggleFavorite,
    recordRecentlyViewed,
    setlists,
    createSetlist,
    addSongToSetlist,
    isSongSavedOffline,
    getOfflineSongRecord,
    saveSongOffline,
    removeSongOffline,
    settings,
    updateSettings,
  } = useApp();

  // Resolve song from custom songs, built-in catalog, or offline IndexedDB
  const offlineCopy = getOfflineSongRecord(slug);
  const resolvedSong = getSongByIdOrSlug(slug);
  const activeSourceSong = useMemo(() => {
    if (effectiveOffline) {
      if (offlineCopy) return offlineCopy;
      if (resolvedSong?.sourceType === 'custom') return resolvedSong;
      return undefined;
    }
    return resolvedSong ?? initialSong ?? offlineCopy;
  }, [effectiveOffline, initialSong, offlineCopy, resolvedSong]);

  const [semitones, setSemitones] = useState<number>(0);
  const [spellingOverride, setSpellingOverride] =
    useState<EnharmonicPreference | null>(null);
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [perfDarkSurface, setPerfDarkSurface] = useState(true);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  // Chord Inspector & Capo State
  const [inspectedChord, setInspectedChord] = useState<string | null>(null);
  const [selectedCapo, setSelectedCapo] = useState<number>(0);
  const [capoDisplayMode, setCapoDisplayMode] = useState<
    'concert' | 'capo' | 'both'
  >('concert');

  // Setlist modal/popover state
  const [showSetlistMenu, setShowSetlistMenu] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSavingOffline, setIsSavingOffline] = useState(false);

  // Auto-scroll state in Performance Mode
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(2); // 1 (slow) to 5 (fast)

  // Screen Wake Lock state in Performance Mode
  const [wakeLockStatus, setWakeLockStatus] = useState<
    'inactive' | 'active' | 'unsupported' | 'denied'
  >('inactive');

  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const setlistMenuRef = useRef<HTMLDivElement | null>(null);

  const effectiveSpelling: EnharmonicPreference =
    spellingOverride ?? settings.enharmonicPreference;

  // Apply optional ?semitones= query parameter when navigating from a personal setlist
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const rawSemis = params.get('semitones');
      if (rawSemis !== null && rawSemis.trim() !== '') {
        const parsed = Number(rawSemis);
        if (Number.isFinite(parsed)) {
          queueMicrotask(() => {
            setSemitones(normalizeSemitones(parsed));
          });
        }
      }
    } catch {
      // ignore
    }
  }, [slug]);

  // Record recently viewed when song opens
  useEffect(() => {
    if (isHydrated && activeSourceSong) {
      recordRecentlyViewed(activeSourceSong.id);
    }
  }, [isHydrated, activeSourceSong, recordRecentlyViewed]);

  // Auto-clear transient feedback banners
  useEffect(() => {
    if (!feedbackBanner) return;
    const timer = window.setTimeout(() => setFeedbackBanner(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedbackBanner]);

  // Escape key or click outside exits Performance Mode or closes setlist menu
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSetlistMenu) {
          setShowSetlistMenu(false);
        } else if (isPerformanceMode) {
          setIsPerformanceMode(false);
          setIsAutoScrolling(false);
        }
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (
        showSetlistMenu &&
        setlistMenuRef.current &&
        e.target instanceof Node &&
        !setlistMenuRef.current.contains(e.target)
      ) {
        setShowSetlistMenu(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [isPerformanceMode, showSetlistMenu]);

  // Auto-scroll effect
  useEffect(() => {
    if (!isPerformanceMode || !isAutoScrolling) return;
    const pixelsPerTick = scrollSpeed * 0.65;
    const interval = window.setInterval(() => {
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setIsAutoScrolling(false);
      } else {
        window.scrollBy({ top: pixelsPerTick, behavior: 'auto' });
      }
    }, 30);

    return () => window.clearInterval(interval);
  }, [isPerformanceMode, isAutoScrolling, scrollSpeed]);

  // Screen Wake Lock management in Performance Mode
  useEffect(() => {
    if (!isPerformanceMode) {
      return;
    }

    let wakeLockSentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function requestWakeLock() {
      if (
        typeof navigator === 'undefined' ||
        !('wakeLock' in navigator) ||
        !navigator.wakeLock
      ) {
        if (!cancelled) setWakeLockStatus('unsupported');
        return;
      }

      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        if (!cancelled) {
          setWakeLockStatus('active');
        }
        wakeLockSentinel.addEventListener('release', () => {
          if (!cancelled) setWakeLockStatus('inactive');
        });
      } catch {
        if (!cancelled) setWakeLockStatus('denied');
      }
    }

    requestWakeLock();

    return () => {
      cancelled = true;
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [isPerformanceMode]);

  // Transposition & Capo Calculation
  const transposed = useMemo(() => {
    if (!activeSourceSong) return null;
    return transposeSong(activeSourceSong, semitones, effectiveSpelling);
  }, [activeSourceSong, semitones, effectiveSpelling]);

  const displaySong = transposed?.song;
  const displayedKey = transposed?.displayedKey ?? '';
  const normalizedSemitones = transposed?.normalizedSemitones ?? 0;

  const keyOptions = useMemo(() => {
    if (!activeSourceSong) return [];
    return getDestinationKeyOptions(
      activeSourceSong.originalKey,
      effectiveSpelling
    );
  }, [activeSourceSong, effectiveSpelling]);

  const isTransposed =
    normalizedSemitones !== 0 ||
    (spellingOverride !== null && spellingOverride !== 'auto');

  const favored = activeSourceSong ? isFavorite(activeSourceSong.id) : false;
  const savedOffline = activeSourceSong
    ? isSongSavedOffline(activeSourceSong.id)
    : false;

  const capoSuggestions = useMemo(
    () => (displayedKey ? getGuitarCapoSuggestions(displayedKey) : []),
    [displayedKey]
  );

  const formatChordDisplay = useCallback(
    (chordToken: string | undefined): string | undefined => {
      if (!chordToken) return undefined;
      if (!selectedCapo || selectedCapo <= 0 || capoDisplayMode === 'concert') {
        return chordToken;
      }
      const targetShapeContext = capoSuggestions[0]?.shapeKey;
      const capoChord = getCapoRelativeChord(
        chordToken,
        selectedCapo,
        targetShapeContext
      );
      if (capoDisplayMode === 'capo') {
        return capoChord;
      }
      return `${chordToken} (${capoChord})`;
    },
    [selectedCapo, capoDisplayMode, capoSuggestions]
  );

  // Offline unavailable state
  if (effectiveOffline && !activeSourceSong) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-10 text-center space-y-4 my-6">
        <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <WifiOff className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold">
          Song Unavailable Offline
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] mx-auto max-w-md">
          This song chart was not saved for offline use on this device before
          losing network connectivity. Only explicitly saved songs are available
          offline.
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/songs?offline=1"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--brand-accent)] text-[var(--bg-surface)] font-semibold text-sm"
          >
            View Saved Offline Songs
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!activeSourceSong || !displaySong) {
    if (!isHydrated) {
      return (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
          Loading song chart...
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-4">
        <h1 className="text-xl font-bold">Song Not Found</h1>
        <p className="text-sm text-[var(--text-secondary)] mx-auto">
          The requested song could not be found in the catalog or in My Songs on
          this device.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/songs"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-accent)] text-[var(--bg-surface)] text-sm font-semibold"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Browse Song Catalog
          </Link>
          <Link
            href="/my-songs"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium"
          >
            <FolderHeart className="w-4 h-4" aria-hidden="true" />
            Open My Songs
          </Link>
        </div>
      </div>
    );
  }

  const handleStepSemitone = (delta: number) => {
    setSemitones((prev) => normalizeSemitones(prev + delta));
  };

  const handleSelectTargetKey = (targetSemitones: number) => {
    setSemitones(normalizeSemitones(targetSemitones));
  };

  const handleResetKey = () => {
    setSemitones(0);
    setSpellingOverride(null);
  };

  const handleOfflineToggle = async () => {
    setIsSavingOffline(true);
    try {
      if (savedOffline) {
        const res = await removeSongOffline(
          activeSourceSong.id,
          activeSourceSong.slug
        );
        if (res.ok) {
          setFeedbackBanner({
            type: 'success',
            message:
              'Offline copy removed from this device. Your favorites and setlists were kept.',
          });
        } else {
          setFeedbackBanner({
            type: 'error',
            message: res.error ?? 'Could not remove offline copy.',
          });
        }
      } else {
        const res = await saveSongOffline(activeSourceSong);
        if (res.ok) {
          setFeedbackBanner({
            type: 'success',
            message: `"${activeSourceSong.title}" saved to this device for offline access.`,
          });
        } else {
          setFeedbackBanner({
            type: 'error',
            message:
              res.error ?? 'Failed to save song for offline use.',
          });
        }
      }
    } finally {
      setIsSavingOffline(false);
    }
  };

  const handleAddToExistingSetlist = (setlistId: string, setlistName: string) => {
    const res = addSongToSetlist(
      setlistId,
      activeSourceSong.id,
      normalizedSemitones
    );
    setShowSetlistMenu(false);
    if (res.alreadyInSetlist) {
      setFeedbackBanner({
        type: 'success',
        message:
          normalizedSemitones !== 0
            ? `Updated "${activeSourceSong.title}" in "${setlistName}" to Key of ${displayedKey} (${formatSignedSemitones(
                normalizedSemitones
              )}).`
            : `"${activeSourceSong.title}" is already in "${setlistName}".`,
      });
    } else {
      setFeedbackBanner({
        type: 'success',
        message: `Added "${activeSourceSong.title}"${
          normalizedSemitones !== 0 ? ` (Key of ${displayedKey})` : ''
        } to "${setlistName}".`,
      });
    }
  };

  const handleCreateAndAddSetlist = (e: React.FormEvent) => {
    e.preventDefault();
    const created = createSetlist(newSetlistName);
    if (!created) return;
    addSongToSetlist(created.id, activeSourceSong.id, normalizedSemitones);
    setNewSetlistName('');
    setShowSetlistMenu(false);
    setFeedbackBanner({
      type: 'success',
      message: `Created setlist "${created.name}" and added "${activeSourceSong.title}".`,
    });
  };

  const jumpToSection = (index: number) => {
    if (index < 0 || index >= displaySong.sections.length) return;
    setActiveSectionIndex(index);
    const el = sectionRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const fontSizeConfig = FONT_SIZE_CLASSES[settings.chartFontSize];

  // ============================================================================
  // PERFORMANCE MODE VIEW
  // ============================================================================
  if (isPerformanceMode) {
    return (
      <div
        data-performance-mode="true"
        className={`fixed inset-0 z-50 overflow-y-auto transition-colors ${
          perfDarkSurface
            ? 'bg-slate-950 text-slate-50'
            : 'bg-stone-50 text-slate-950'
        }`}
      >
        {/* Compact Sticky Performance Header */}
        <header
          className={`sticky top-0 z-20 border-b px-4 py-2.5 backdrop-blur-md ${
            perfDarkSurface
              ? 'bg-slate-950/95 border-slate-800'
              : 'bg-stone-50/95 border-stone-200'
          }`}
        >
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
            {/* Title + Key Badge */}
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="font-bold text-base sm:text-lg truncate">
                {displaySong.title}
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono font-bold text-sm ${
                  perfDarkSurface
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    : 'bg-teal-700 text-white'
                }`}
              >
                Key: {displayedKey}
                {normalizedSemitones !== 0 && (
                  <span className="text-xs opacity-80">
                    ({formatSignedSemitones(normalizedSemitones)})
                  </span>
                )}
              </span>
            </div>

            {/* Quick Transposition + Section Nav + AutoScroll + Exit */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Quick Transposition Controls */}
              <div
                role="group"
                aria-label="Quick Transpose Controls"
                className={`inline-flex items-center rounded-lg border p-0.5 ${
                  perfDarkSurface
                    ? 'border-slate-800 bg-slate-900'
                    : 'border-stone-300 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleStepSemitone(-1)}
                  aria-label="Transpose down 1 semitone"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-teal-500/20 font-bold cursor-pointer"
                >
                  <Minus className="w-4 h-4" aria-hidden="true" />
                </button>
                <select
                  aria-label="Select target key in performance mode"
                  value={normalizedSemitones}
                  onChange={(e) => handleSelectTargetKey(Number(e.target.value))}
                  className={`h-9 px-2 font-mono font-bold text-sm rounded bg-transparent cursor-pointer focus:outline-none ${
                    perfDarkSurface ? 'text-teal-300' : 'text-teal-800'
                  }`}
                >
                  {keyOptions.map((opt) => (
                    <option
                      key={opt.semitonesFromOriginal}
                      value={opt.semitonesFromOriginal}
                      className="bg-slate-900 text-white"
                    >
                      {opt.key}
                      {opt.semitonesFromOriginal === 0
                        ? ' (Orig)'
                        : ` (${formatSignedSemitones(opt.semitonesFromOriginal)})`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleStepSemitone(1)}
                  aria-label="Transpose up 1 semitone"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-teal-500/20 font-bold cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
                {isTransposed && (
                  <button
                    type="button"
                    onClick={handleResetKey}
                    title={`Reset to original key (${activeSourceSong.originalKey})`}
                    className="px-2 h-9 text-xs font-semibold text-amber-400 hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Section Prev / Next Navigation */}
              <div
                role="group"
                aria-label="Section Navigation"
                className={`inline-flex items-center rounded-lg border p-0.5 ${
                  perfDarkSurface
                    ? 'border-slate-800 bg-slate-900'
                    : 'border-stone-300 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => jumpToSection(activeSectionIndex - 1)}
                  disabled={activeSectionIndex <= 0}
                  aria-label="Previous section"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md disabled:opacity-35 cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="px-2 text-xs font-medium hidden sm:inline">
                  Sec {activeSectionIndex + 1}/{displaySong.sections.length}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToSection(activeSectionIndex + 1)}
                  disabled={
                    activeSectionIndex >= displaySong.sections.length - 1
                  }
                  aria-label="Next section"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md disabled:opacity-35 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Auto-scroll Controls */}
              <div
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${
                  perfDarkSurface
                    ? 'border-slate-800 bg-slate-900'
                    : 'border-stone-300 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsAutoScrolling((v) => !v)}
                  aria-pressed={isAutoScrolling}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded hover:bg-teal-500/20 cursor-pointer"
                >
                  {isAutoScrolling ? (
                    <>
                      <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Scroll</span>
                    </>
                  )}
                </button>
                <label className="sr-only" htmlFor="perf-scroll-speed">
                  Scroll Speed
                </label>
                <select
                  id="perf-scroll-speed"
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(Number(e.target.value))}
                  className="text-xs bg-transparent font-mono cursor-pointer focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map((spd) => (
                    <option
                      key={spd}
                      value={spd}
                      className="bg-slate-900 text-white"
                    >
                      {spd}x
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Size Cycle */}
              <div
                role="group"
                aria-label="Performance Font Size"
                className={`hidden sm:inline-flex items-center rounded-lg border p-0.5 ${
                  perfDarkSurface
                    ? 'border-slate-800 bg-slate-900'
                    : 'border-stone-300 bg-white'
                }`}
              >
                {(['sm', 'md', 'lg', 'xl'] as ChartFontSize[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => updateSettings({ chartFontSize: sz })}
                    aria-pressed={settings.chartFontSize === sz}
                    className={`px-2 py-1 text-xs font-semibold rounded cursor-pointer ${
                      settings.chartFontSize === sz
                        ? 'bg-teal-600 text-white'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    {FONT_SIZE_CLASSES[sz].label}
                  </button>
                ))}
              </div>

              {/* Light / Dark Surface Toggle */}
              <button
                type="button"
                onClick={() => setPerfDarkSurface((d) => !d)}
                aria-label={
                  perfDarkSurface
                    ? 'Switch performance mode to high-contrast light surface'
                    : 'Switch performance mode to dark stage surface'
                }
                className={`w-10 h-10 inline-flex items-center justify-center rounded-lg border cursor-pointer ${
                  perfDarkSurface
                    ? 'border-slate-800 bg-slate-900 text-amber-300'
                    : 'border-stone-300 bg-white text-slate-800'
                }`}
              >
                {perfDarkSurface ? (
                  <Sun className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Moon className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {/* Exit Performance Mode */}
              <button
                type="button"
                onClick={() => {
                  setIsPerformanceMode(false);
                  setIsAutoScrolling(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" aria-hidden="true" />
                <span>Exit</span>
              </button>
            </div>
          </div>
        </header>

        {/* Performance Chart Body */}
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-75">
            <div>
              Original Key: <strong>{activeSourceSong.originalKey}</strong>
              {displaySong.tempoBpm ? ` · ${displaySong.tempoBpm} BPM` : ''}
              {displaySong.timeSignature
                ? ` · ${displaySong.timeSignature}`
                : ''}
              {selectedCapo > 0 ? ` · Capo ${selectedCapo}` : ''}
            </div>
            <div>
              {wakeLockStatus === 'active' && (
                <span>Screen Wake Lock: Active</span>
              )}
              {wakeLockStatus === 'unsupported' && (
                <span>
                  Screen Wake Lock: Not supported by this browser (adjust device
                  auto-lock if needed)
                </span>
              )}
              {wakeLockStatus === 'denied' && (
                <span>Screen Wake Lock: Restricted by browser settings</span>
              )}
            </div>
          </div>

          <div className={`${fontSizeConfig.performance} space-y-8`}>
            {displaySong.sections.map((section, secIndex) => (
              <section
                key={section.id}
                ref={(el) => {
                  sectionRefs.current[secIndex] = el;
                }}
                onClick={() => setActiveSectionIndex(secIndex)}
                className={`rounded-xl p-4 sm:p-6 border transition-colors ${
                  perfDarkSurface
                    ? 'bg-slate-900/70 border-slate-800'
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-2 border-b border-current/10">
                  <h2 className="font-bold uppercase tracking-wider text-sm sm:text-base text-teal-400">
                    {section.label}
                  </h2>
                  {section.cue && (
                    <span className="text-xs italic opacity-75">
                      {section.cue}
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  {section.lines.map((line, lineIndex) => {
                    const instrumental = isLineInstrumental(line);
                    if (instrumental) {
                      return (
                        <div
                          key={lineIndex}
                          className="chart-line-scroll py-1"
                        >
                          <div className="inline-flex items-center gap-3 font-mono font-bold">
                            <span className="text-xs uppercase tracking-wider opacity-60 font-sans">
                              [Instrumental]
                            </span>
                            {line.segments.map((seg, segIdx) => (
                              <button
                                key={segIdx}
                                type="button"
                                onClick={() =>
                                  seg.chord && setInspectedChord(seg.chord)
                                }
                                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                                  perfDarkSurface
                                    ? 'bg-teal-500/15 text-teal-300 hover:bg-teal-500/30'
                                    : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
                                }`}
                                title={
                                  seg.chord
                                    ? `Inspect ${seg.chord} chord diagram`
                                    : undefined
                                }
                              >
                                | {formatChordDisplay(seg.chord) || 'N.C.'}
                              </button>
                            ))}
                            <span className="opacity-50">|</span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={lineIndex} className="chart-line-scroll">
                        {line.annotation && (
                          <div className="text-xs italic opacity-70 mb-1">
                            ({line.annotation})
                          </div>
                        )}
                        <div className="chart-line-segments">
                          {line.segments.map((seg, segIdx) => {
                            const displayChord = formatChordDisplay(seg.chord);
                            return (
                              <span key={segIdx} className="chart-segment">
                                {seg.chord ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setInspectedChord(seg.chord!)
                                    }
                                    className="chart-chord-row chart-chord-btn text-left"
                                    style={{
                                      color: perfDarkSurface
                                        ? '#5eead4'
                                        : '#0f766e',
                                    }}
                                    title={`Inspect ${seg.chord} chord diagram & fingering`}
                                  >
                                    {displayChord}
                                  </button>
                                ) : (
                                  <span className="chart-chord-row">
                                    {'\u00A0'}
                                  </span>
                                )}
                                <span
                                  className="chart-lyric-row"
                                  style={{
                                    color: perfDarkSurface
                                    ? '#f8fafc'
                                    : '#0f172a',
                                }}
                              >
                                {seg.text || '\u00A0'}
                              </span>
                            </span>
                          );
                        })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // NORMAL SONG DETAIL / CHORD CHART VIEW
  // ============================================================================
  return (
    <div className="space-y-5">
      {/* Top Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/songs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>All Songs</span>
          </Link>
          {activeSourceSong.sourceType === 'custom' && (
            <Link
              href="/my-songs"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-accent)] hover:underline"
            >
              <FolderHeart className="w-4 h-4" aria-hidden="true" />
              <span>My Songs</span>
            </Link>
          )}
        </div>

        {activeSourceSong.sourceType === 'custom' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
            <FolderHeart className="w-3.5 h-3.5" aria-hidden="true" />
            <span>My Song · Stored on This Device</span>
          </span>
        ) : activeSourceSong.contentStatus === 'demo' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--brand-accent)]" aria-hidden="true" />
            <span>Original Demo Song Record</span>
          </span>
        ) : null}
      </div>

      {/* Feedback Banner (Offline save / Setlist confirmation) */}
      {feedbackBanner && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl px-4 py-3 text-sm font-medium border flex items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border-[var(--brand-accent)]/30'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
          }`}
        >
          <span>{feedbackBanner.message}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dedicated Print Sheet Music Header */}
      <div className="hidden print:block mb-6 pb-3 border-b-2 border-black">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-extrabold text-black">{displaySong.title}</h1>
            <p className="text-sm text-stone-700 font-medium">
              {displaySong.artist || 'Traditional'}
              {displaySong.writers?.length ? ` · Written by ${displaySong.writers.join(', ')}` : ''}
            </p>
          </div>
          <div className="text-right text-xs font-mono text-stone-800 space-y-0.5">
            <div>Key: <strong>{displayedKey}</strong> {isTransposed ? `(Orig: ${activeSourceSong.originalKey})` : ''}</div>
            {displaySong.tempoBpm ? <div>Tempo: {displaySong.tempoBpm} BPM</div> : null}
            {displaySong.timeSignature ? <div>Meter: {displaySong.timeSignature}</div> : null}
            {selectedCapo > 0 ? <div>Capo: Fret {selectedCapo}</div> : null}
          </div>
        </div>
      </div>

      {/* Song Header Card */}
      <header className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {displaySong.sourceType === 'custom' && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
                  My Song
                </span>
              )}
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-primary)]">
                {displaySong.language.label}
              </span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                {displaySong.category.label}
              </span>
              {typeof displaySong.capo === 'number' && displaySong.capo > 0 && (
                <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-primary)]">
                  Capo {displaySong.capo}
                </span>
              )}
              {savedOffline && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  Saved Offline
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {displaySong.title}
            </h1>

            {displaySong.subtitle && (
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                {displaySong.subtitle}
              </p>
            )}

            {(displaySong.artist ||
              (displaySong.writers && displaySong.writers.length > 0)) && (
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                {displaySong.artist || ''}
                {displaySong.artist &&
                displaySong.writers &&
                displaySong.writers.length > 0
                  ? ' · '
                  : ''}
                {displaySong.writers && displaySong.writers.length > 0
                  ? `Written by ${displaySong.writers.join(', ')}`
                  : ''}
              </p>
            )}

            {displaySong.attribution && (
              <p className="text-xs text-[var(--text-secondary)]">
                {displaySong.attribution}
              </p>
            )}
          </div>

          {/* Primary Actions Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Enter Performance Mode */}
            <button
              type="button"
              onClick={() => setIsPerformanceMode(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand-accent)] text-[var(--bg-surface)] font-semibold text-sm hover:opacity-95 transition-opacity cursor-pointer min-h-[2.75rem]"
            >
              <Maximize2 className="w-4 h-4" aria-hidden="true" />
              <span>Performance Mode</span>
            </button>

            {/* Edit Custom Song */}
            {activeSourceSong.sourceType === 'custom' && (
              <Link
                href={`/my-songs?edit=${encodeURIComponent(
                  activeSourceSong.id
                )}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--brand-accent)] text-sm font-medium transition-colors min-h-[2.75rem]"
              >
                <Edit3 className="w-4 h-4" aria-hidden="true" />
                <span>Edit Song</span>
              </Link>
            )}

            {/* Print or Save as PDF */}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--brand-accent)] text-sm font-medium transition-colors cursor-pointer min-h-[2.75rem]"
              title="Print clean chord sheet or export to PDF"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span>Print Sheet</span>
            </button>

            {/* Export ChordPro (.cho) */}
            <button
              type="button"
              onClick={() => {
                const filename = downloadSongAsChordPro(activeSourceSong);
                setFeedbackBanner({
                  type: 'success',
                  message: `Exported "${activeSourceSong.title}" as ${filename} (stored original key ${activeSourceSong.originalKey}).`,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--brand-accent)] text-sm font-medium transition-colors cursor-pointer min-h-[2.75rem]"
            >
              <FileCode2 className="w-4 h-4" aria-hidden="true" />
              <span>Export .cho</span>
            </button>

            {/* Start Live Sync Session from this Song */}
            <Link
              href={`/live?startSong=${encodeURIComponent(
                activeSourceSong.id
              )}&semitones=${normalizedSemitones}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] font-semibold text-sm hover:opacity-95 transition-opacity min-h-[2.75rem]"
            >
              <Radio className="w-4 h-4" aria-hidden="true" />
              <span>Start Live Sync</span>
            </Link>

            {/* Save / Remove Offline Copy */}
            <button
              type="button"
              disabled={isSavingOffline}
              onClick={handleOfflineToggle}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer min-h-[2.75rem] ${
                savedOffline
                  ? 'border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
              }`}
            >
              {savedOffline ? (
                <>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>Remove Offline Copy</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Save Offline</span>
                </>
              )}
            </button>

            {/* Add to Personal Setlist */}
            <div ref={setlistMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowSetlistMenu((prev) => !prev)}
                aria-expanded={showSetlistMenu}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--border-strong)] text-sm font-medium transition-colors cursor-pointer min-h-[2.75rem]"
              >
                <ListPlus className="w-4 h-4" aria-hidden="true" />
                <span>Add to Setlist</span>
              </button>

              {showSetlistMenu && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-xl p-4 z-30 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-sm">
                      Add to Personal Setlist
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowSetlistMenu(false)}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      Close
                    </button>
                  </div>

                  {setlists.length > 0 ? (
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {setlists.map((list) => (
                        <button
                          key={list.id}
                          type="button"
                          onClick={() =>
                            handleAddToExistingSetlist(list.id, list.name)
                          }
                          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[var(--bg-subtle)] flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span className="font-medium truncate">
                            {list.name}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {list.items.length} songs
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)]">
                      No personal setlists yet. Create your first one below:
                    </p>
                  )}

                  <form
                    onSubmit={handleCreateAndAddSetlist}
                    className="pt-2 border-t border-[var(--border-subtle)] space-y-2"
                  >
                    <label
                      htmlFor="quick-setlist-name"
                      className="block text-xs font-medium text-[var(--text-secondary)]"
                    >
                      New Setlist Name
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="quick-setlist-name"
                        type="text"
                        value={newSetlistName}
                        onChange={(e) => setNewSetlistName(e.target.value)}
                        placeholder="e.g. Sunday Service"
                        className="flex-1 min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={!newSetlistName.trim()}
                        className="px-3 py-1.5 rounded-lg bg-[var(--brand-accent)] text-[var(--bg-surface)] text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Favorite Button */}
            <button
              type="button"
              onClick={() => toggleFavorite(activeSourceSong.id)}
              aria-label={
                favored ? 'Remove from favorites' : 'Add to favorites'
              }
              aria-pressed={favored}
              className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border transition-colors cursor-pointer ${
                favored
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Heart
                className={`w-5 h-5 ${favored ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Metadata Pills Row */}
        <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs sm:text-sm">
          <div className="rounded-lg bg-[var(--bg-subtle)] px-3 py-2">
            <span className="text-[var(--text-secondary)] block text-xs">
              Original Key
            </span>
            <span className="font-mono font-bold text-base">
              {activeSourceSong.originalKey}
            </span>
          </div>

          <div
            className={`rounded-lg px-3 py-2 border ${
              isTransposed
                ? 'bg-[var(--brand-surface)] border-[var(--brand-accent)]/40 text-[var(--brand-accent)]'
                : 'bg-[var(--bg-subtle)] border-transparent'
            }`}
          >
            <span className="block text-xs opacity-80">Displayed Key</span>
            <span className="font-mono font-bold text-base">
              {displayedKey}
              {normalizedSemitones !== 0 && (
                <span className="ml-1.5 text-xs font-normal">
                  ({formatSignedSemitones(normalizedSemitones)} st)
                </span>
              )}
            </span>
          </div>

          <div className="rounded-lg bg-[var(--bg-subtle)] px-3 py-2">
            <span className="text-[var(--text-secondary)] block text-xs">
              Tempo
            </span>
            <span className="font-semibold text-base">
              {displaySong.tempoBpm ? `${displaySong.tempoBpm} BPM` : '—'}
            </span>
          </div>

          <div className="rounded-lg bg-[var(--bg-subtle)] px-3 py-2">
            <span className="text-[var(--text-secondary)] block text-xs">
              Time Signature
            </span>
            <span className="font-semibold text-base">
              {displaySong.timeSignature || '—'}
            </span>
          </div>
        </div>
      </header>

      {/* Compact Transposition & Chart Controls Toolbar */}
      <section
        aria-label="Chord Transposition and Chart Controls"
        className="sticky top-[3.5rem] md:top-2 z-20 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)]/95 backdrop-blur-md p-3 sm:p-4 shadow-sm space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Semitone Stepper + Current Key Display + Destination Key Selector */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div
              role="group"
              aria-label="Transpose by semitone"
              className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1"
            >
              <button
                type="button"
                onClick={() => handleStepSemitone(-1)}
                aria-label="Transpose down 1 semitone"
                className="w-10 h-10 inline-flex items-center justify-center rounded-lg bg-[var(--bg-surface)] hover:border-[var(--brand-accent)] border border-transparent font-bold transition-colors cursor-pointer"
              >
                <Minus className="w-4 h-4" aria-hidden="true" />
              </button>

              <div className="px-3 text-center min-w-[4.75rem]">
                <span className="block text-[0.625rem] uppercase tracking-wider text-[var(--text-secondary)]">
                  Current Key
                </span>
                <span
                  data-testid="current-key-display"
                  className="font-mono font-bold text-base text-[var(--brand-accent)]"
                >
                  {displayedKey}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleStepSemitone(1)}
                aria-label="Transpose up 1 semitone"
                className="w-10 h-10 inline-flex items-center justify-center rounded-lg bg-[var(--bg-surface)] hover:border-[var(--brand-accent)] border border-transparent font-bold transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Destination Key Selector */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="destination-key-select"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                Target Key:
              </label>
              <select
                id="destination-key-select"
                value={normalizedSemitones}
                onChange={(e) => handleSelectTargetKey(Number(e.target.value))}
                className="h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 font-mono font-semibold text-sm cursor-pointer"
              >
                {keyOptions.map((opt) => (
                  <option
                    key={opt.semitonesFromOriginal}
                    value={opt.semitonesFromOriginal}
                  >
                    {opt.key}
                    {opt.semitonesFromOriginal === 0
                      ? ' (Original)'
                      : ` (${formatSignedSemitones(opt.semitonesFromOriginal)})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset to Original Key Action */}
            <button
              type="button"
              onClick={handleResetKey}
              disabled={!isTransposed}
              className={`inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl text-xs sm:text-sm font-semibold border transition-colors ${
                isTransposed
                  ? 'border-[var(--brand-accent)] bg-[var(--brand-surface)] text-[var(--brand-accent)] cursor-pointer hover:opacity-90'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset to Original ({activeSourceSong.originalKey})</span>
            </button>

            {/* Guitar Capo Selector & Display Mode */}
            <div className="flex flex-wrap items-center gap-2 border-l border-[var(--border-subtle)] pl-2 sm:pl-3">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="song-capo-select"
                  className="text-xs font-medium text-[var(--text-secondary)] inline-flex items-center gap-1"
                >
                  <Guitar className="w-3.5 h-3.5 text-[var(--brand-accent)]" aria-hidden="true" />
                  <span>Capo:</span>
                </label>
                <select
                  id="song-capo-select"
                  value={selectedCapo}
                  onChange={(e) => setSelectedCapo(Number(e.target.value))}
                  className="h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 text-xs font-semibold cursor-pointer"
                >
                  <option value={0}>No Capo</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((fret) => (
                    <option key={fret} value={fret}>
                      Capo {fret}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCapo > 0 && (
                <div
                  role="group"
                  aria-label="Capo chord display mode"
                  className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => setCapoDisplayMode('concert')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      capoDisplayMode === 'concert'
                        ? 'bg-[var(--bg-surface)] text-[var(--brand-accent)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Concert
                  </button>
                  <button
                    type="button"
                    onClick={() => setCapoDisplayMode('capo')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      capoDisplayMode === 'capo'
                        ? 'bg-[var(--bg-surface)] text-[var(--brand-accent)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Capo Shapes
                  </button>
                  <button
                    type="button"
                    onClick={() => setCapoDisplayMode('both')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      capoDisplayMode === 'both'
                        ? 'bg-[var(--bg-surface)] text-[var(--brand-accent)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Both
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Enharmonic Spelling + Font Size Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sharp / Flat Preference */}
            <div
              role="group"
              aria-label="Accidental spelling preference"
              className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-xs"
            >
              {(
                [
                  { id: 'auto', label: 'Auto' },
                  { id: 'sharp', label: '♯' },
                  { id: 'flat', label: '♭' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSpellingOverride(item.id)}
                  aria-pressed={effectiveSpelling === item.id}
                  title={`Chord spelling: ${item.id}`}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                    effectiveSpelling === item.id
                      ? 'bg-[var(--bg-surface)] text-[var(--brand-accent)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Font Size Control */}
            <div
              role="group"
              aria-label="Chart font size"
              className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-xs"
            >
              <span className="px-2 text-[var(--text-secondary)] inline-flex items-center">
                <Type className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              {(['sm', 'md', 'lg', 'xl'] as ChartFontSize[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => updateSettings({ chartFontSize: sz })}
                  aria-pressed={settings.chartFontSize === sz}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                    settings.chartFontSize === sz
                      ? 'bg-[var(--bg-surface)] text-[var(--brand-accent)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {FONT_SIZE_CLASSES[sz].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section Quick-Jump Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-[var(--border-subtle)] text-xs">
          <span className="text-[var(--text-secondary)] font-medium shrink-0 mr-1">
            Jump:
          </span>
          {displaySong.sections.map((section, idx) => (
            <button
              key={section.id}
              type="button"
              onClick={() => jumpToSection(idx)}
              className="px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand-accent)] font-medium shrink-0 transition-colors cursor-pointer"
            >
              {section.label}
            </button>
          ))}
        </div>
      </section>

      {/* Main Song Chord Chart Sections */}
      <article
        aria-label="Song Chord Chart"
        className={`${fontSizeConfig.normal} space-y-6`}
      >
        {displaySong.sections.map((section, secIndex) => (
          <section
            key={section.id}
            ref={(el) => {
              sectionRefs.current[secIndex] = el;
            }}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 scroll-mt-40"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-2.5 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--brand-accent)]">
                {section.label}
              </h2>
              {section.cue && (
                <span className="text-xs italic text-[var(--text-secondary)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded-md">
                  {section.cue}
                </span>
              )}
            </div>

            <div className="space-y-4">
              {section.lines.map((line, lineIndex) => {
                const instrumental = isLineInstrumental(line);

                if (instrumental) {
                  return (
                    <div
                      key={lineIndex}
                      className="chart-line-scroll py-1"
                    >
                      <div className="inline-flex items-center gap-2.5 font-mono font-bold">
                        <span className="text-xs font-sans font-medium uppercase tracking-wider text-[var(--text-secondary)] mr-1">
                          Chords:
                        </span>
                        {line.segments.map((seg, segIdx) => (
                          <button
                            key={segIdx}
                            type="button"
                            onClick={() =>
                              seg.chord && setInspectedChord(seg.chord)
                            }
                            className="px-3 py-1 rounded-lg bg-[var(--chord-bg)] text-[var(--chord-color)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] transition-colors cursor-pointer"
                            title={
                              seg.chord
                                ? `Inspect ${seg.chord} chord diagram & fingering`
                                : undefined
                            }
                          >
                            | {formatChordDisplay(seg.chord) || 'N.C.'}
                          </button>
                        ))}
                        <span className="text-[var(--text-secondary)]">|</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={lineIndex} className="chart-line-scroll">
                    {line.annotation && (
                      <div className="text-xs italic text-[var(--text-secondary)] mb-1">
                        ({line.annotation})
                      </div>
                    )}
                    <div className="chart-line-segments">
                      {line.segments.map((seg, segIdx) => {
                        const displayChord = formatChordDisplay(seg.chord);
                        return (
                          <span key={segIdx} className="chart-segment">
                            {seg.chord ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setInspectedChord(seg.chord!)
                                }
                                className="chart-chord-row chart-chord-btn text-left"
                                title={`Inspect ${seg.chord} chord diagram & fingering`}
                              >
                                {displayChord}
                              </button>
                            ) : (
                              <span className="chart-chord-row">{'\u00A0'}</span>
                            )}
                            <span className="chart-lyric-row">
                              {seg.text || '\u00A0'}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </article>

      {/* Source & Attribution Footer */}
      <footer className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-2">
        <div>
          {displaySong.sourceType === 'custom' ? (
            <>
              <strong className="text-[var(--text-primary)]">
                My Song (Device-Local):
              </strong>{' '}
              {displaySong.sourceNotes ||
                'Personal song chart stored locally on this device.'}
              {displaySong.rightsNotes ? ` · ${displaySong.rightsNotes}` : ''}
            </>
          ) : (
            <>
              <strong className="text-[var(--text-primary)]">
                Catalog Status:
              </strong>{' '}
              {displaySong.contentStatus.toUpperCase()} —{' '}
              {displaySong.sourceNotes ||
                'Original demo chart for testing transposition and layout.'}
            </>
          )}
        </div>
        <div>
          Transposition changes only the displayed chart and never modifies the
          source song record.
        </div>
      </footer>

      {/* Interactive Chord Inspector Modal */}
      {inspectedChord && (
        <ChordInspectorModal
          chord={inspectedChord}
          onClose={() => setInspectedChord(null)}
          keyContext={displayedKey}
        />
      )}
    </div>
  );
}
