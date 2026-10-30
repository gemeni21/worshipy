'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
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
  Mic,
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
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { apiUrl } from '@/lib/api/apiClient';
import { downloadSongAsChordPro } from '@/lib/chordpro/chordProDownload';
import {
  getSuggestedChordsForKey,
  insertChordAtCursor,
} from '@/lib/chordpro/chordPro';
import { ChordInspectorModal } from '@/components/music/ChordInspectorModal';
import { LiveArrangementEditorModal } from '@/components/live/LiveArrangementEditorModal';
import { PracticeDock } from '@/components/practice/PracticeDock';
import {
  appendChordToSongSectionLine,
  convertDisplayedSongToBaseChordPro,
  formatSongLineForQuickEdit,
  getPersonalInstrumentArrangements,
  insertChordAtLyricPositionInSong,
  nudgeChordByWordInSongSectionLine,
  removePersonalInstrumentArrangement,
  replaceChordInSongSectionLine,
  resolveLayeredSongArrangement,
  resolveSongWithLiveOverride,
  savePersonalInstrumentArrangement,
  splitSegmentTextIntoTappableWords,
  updateLineInSongSection,
  type PreferredArrangementLayerMode,
} from '@/lib/chordpro/liveArrangement';
import {
  dismissTeamSongArrangement,
  getCachedTeam,
  getSessionToken,
  proposeTeamSongArrangement,
  removeTeamSongArrangementDirect,
  reviewTeamSongArrangement,
  saveTeamSongArrangementDirect,
  subscribeToTeam,
} from '@/lib/team/teamService';
import type {
  TeamArrangementSuggestion,
  TeamSongArrangement,
  WorshipGroup,
} from '@/types/auth';
import type { InstrumentViewMode } from '@/types/live';
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
    refreshGlobalSongs,
    settings,
    updateSettings,
    saveCustomSong,
  } = useApp();

  const { user, activeGroup, isAdmin, removeSongGlobally } = useAuth();
  const [showAdminRemoveModal, setShowAdminRemoveModal] = useState(false);
  const [adminRemoveReason, setAdminRemoveReason] = useState('');
  const [isAdminRemoving, setIsAdminRemoving] = useState(false);

  // Rehearse Ahead of Time: Personal Instrument & Church Arrangement state
  const [rehearsalInstrument, setRehearsalInstrument] =
    useState<InstrumentViewMode>('guitar');
  const [personalArrangements, setPersonalArrangements] = useState<
    Record<string, TeamSongArrangement>
  >(() => getPersonalInstrumentArrangements());
  const [preferredLayer, setPreferredLayer] =
    useState<PreferredArrangementLayerMode>('auto');
  const [showInstrumentArrangeModal, setShowInstrumentArrangeModal] =
    useState(false);

  // Quick-Tap Edit Chords & Lyrics outside of Live Sync
  const [isQuickEditMode, setIsQuickEditMode] = useState(false);
  const [activeChordEditTarget, setActiveChordEditTarget] = useState<{
    sectionId: string;
    lineIndex: number;
    segmentIndex: number;
    charOffset: number;
    targetWord?: string;
    currentChord: string;
    isTrailing?: boolean;
  } | null>(null);
  const [customChordInput, setCustomChordInput] = useState('');
  const [activeLineEditTarget, setActiveLineEditTarget] = useState<{
    sectionId: string;
    lineIndex: number;
    bracketedText: string;
    annotation: string;
  } | null>(null);
  const inlineLineInputRef = useRef<HTMLInputElement | null>(null);
  const inlineLineCursorRef = useRef<number | null>(null);

  // Member Submission & Leader Review state on the Song Page
  const [liveGroup, setLiveGroup] = useState<WorshipGroup | null>(
    () => activeGroup || getCachedTeam()
  );
  const [proposalNoteInput, setProposalNoteInput] = useState('');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [previewingProposalId, setPreviewingProposalId] = useState<
    string | null
  >(null);
  const [isArrangementBannerHidden, setIsArrangementBannerHidden] =
    useState(false);

  const effectiveGroup = liveGroup || activeGroup || getCachedTeam();
  const groupIdToSubscribe = activeGroup?.id || user?.groupId || liveGroup?.id;

  useEffect(() => {
    if (!groupIdToSubscribe) return;
    const unsub = subscribeToTeam(groupIdToSubscribe, (updated) => {
      if (updated) {
        setLiveGroup(updated);
      }
    });
    return () => unsub();
  }, [groupIdToSubscribe]);

  const isGroupLeader = Boolean(
    isAdmin ||
      user?.role === 'admin' ||
      (user?.id && effectiveGroup?.ownerId === user.id) ||
      (user?.id &&
        effectiveGroup?.members?.some(
          (m) => m.userId === user.id && m.role === 'leader'
        ))
  );

  // Resolve song from custom songs, built-in catalog, or offline IndexedDB
  const offlineCopy = getOfflineSongRecord(slug);
  const resolvedSong = getSongByIdOrSlug(slug);
  const baseCatalogSong = useMemo(() => {
    if (effectiveOffline) {
      if (offlineCopy) return offlineCopy;
      if (resolvedSong?.sourceType === 'custom') return resolvedSong;
      return undefined;
    }
    return resolvedSong ?? initialSong ?? offlineCopy;
  }, [effectiveOffline, initialSong, offlineCopy, resolvedSong]);

  const layeredRehearsalResult = useMemo(() => {
    if (!baseCatalogSong) return null;
    return resolveLayeredSongArrangement({
      baseSong: baseCatalogSong,
      instrument: rehearsalInstrument,
      personalArrangements,
      groupArrangements: effectiveGroup?.songArrangements,
      preferredLayer,
    });
  }, [
    baseCatalogSong,
    rehearsalInstrument,
    personalArrangements,
    effectiveGroup?.songArrangements,
    preferredLayer,
  ]);

  const songSuggestions = useMemo(() => {
    if (!baseCatalogSong || !effectiveGroup?.suggestedArrangements) return [];
    return effectiveGroup.suggestedArrangements.filter(
      (s) => s.songId === baseCatalogSong.id
    );
  }, [baseCatalogSong, effectiveGroup?.suggestedArrangements]);

  const pendingSongProposals = useMemo(
    () => songSuggestions.filter((s) => s.status === 'pending'),
    [songSuggestions]
  );

  const myLatestProposalForInstrument = useMemo(() => {
    if (!songSuggestions.length) return null;
    const matching = songSuggestions.filter(
      (s) =>
        s.instrument === rehearsalInstrument &&
        (!user?.id ||
          s.suggestedBy === user.id ||
          s.suggestedBy === 'local-user')
    );
    return matching.length > 0 ? matching[0] : null;
  }, [songSuggestions, rehearsalInstrument, user?.id]);

  const previewedProposal = useMemo(
    () =>
      previewingProposalId
        ? songSuggestions.find((s) => s.id === previewingProposalId) ?? null
        : null,
    [previewingProposalId, songSuggestions]
  );

  const activeSourceSong = useMemo(() => {
    if (previewedProposal && baseCatalogSong) {
      return resolveSongWithLiveOverride(baseCatalogSong, {
        songId: baseCatalogSong.id,
        instrument: previewedProposal.instrument,
        chordPro: previewedProposal.chordPro,
        arrangementNote: previewedProposal.arrangementNote,
        updatedAt: previewedProposal.suggestedAt,
        updatedBy: previewedProposal.suggestedByName,
      });
    }
    return layeredRehearsalResult?.song ?? baseCatalogSong;
  }, [previewedProposal, baseCatalogSong, layeredRehearsalResult?.song]);

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
      const rawPerf = params.get('perf');
      if (rawPerf === 'true' || rawPerf === '1') {
        queueMicrotask(() => {
          setIsPerformanceMode(true);
        });
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm shadow-sm transition-all"
          >
            View Saved Offline Songs
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium"
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-sm font-bold shadow-sm transition-all"
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

  const handleAdminConfirmRemove = async () => {
    if (!activeSourceSong) return;
    setIsAdminRemoving(true);
    try {
      await removeSongGlobally(activeSourceSong.id, adminRemoveReason);
      setShowAdminRemoveModal(false);
      setAdminRemoveReason('');
      await refreshGlobalSongs();
      setFeedbackBanner({
        type: 'success',
        message: `"${activeSourceSong.title}" has been removed globally from the catalog.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove song globally.';
      setFeedbackBanner({
        type: 'error',
        message: msg,
      });
    } finally {
      setIsAdminRemoving(false);
    }
  };

  const jumpToSection = (index: number) => {
    if (index < 0 || index >= displaySong.sections.length) return;
    setActiveSectionIndex(index);
    const el = sectionRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const diatonicSuggestionsForDisplayedKey =
    getSuggestedChordsForKey(displayedKey);

  const applyRehearsalArrangementChange = (
    baseChordPro: string,
    arrangementNote?: string
  ) => {
    if (!baseCatalogSong) return;
    setPreviewingProposalId(null);
    setIsArrangementBannerHidden(false);
    const nextPersonal = savePersonalInstrumentArrangement({
      songId: baseCatalogSong.id,
      songTitle: baseCatalogSong.title,
      instrument: rehearsalInstrument,
      chordPro: baseChordPro,
      arrangementNote:
        arrangementNote ||
        proposalNoteInput.trim() ||
        layeredRehearsalResult?.activeOverride?.arrangementNote ||
        (isGroupLeader
          ? `Leader ${rehearsalInstrument} arrangement`
          : `My ${rehearsalInstrument} rehearsal chords`),
      updatedBy: user?.id || 'local-user',
      updatedByName: user?.displayName || 'Musician',
    });
    setPersonalArrangements(nextPersonal);
    setPreferredLayer('auto');
    setFeedbackBanner({
      type: 'success',
      message: isGroupLeader
        ? `Saved draft to your ${rehearsalInstrument.toUpperCase()} chords. Click "Publish to Church" in the banner above when ready to share with your team.`
        : `Saved to your Personal ${rehearsalInstrument.toUpperCase()} Chords! Ready to submit to your Worship Leader for approval whenever you're done.`,
    });
  };

  const handleInlineChordChange = (
    sectionId: string,
    lineIndex: number,
    segmentIndex: number,
    newConcertChord: string,
    charOffset: number = 0,
    isTrailing: boolean = false
  ) => {
    if (!baseCatalogSong || !displaySong) return;
    let updatedDisplayedSong = displaySong;
    if (isTrailing) {
      updatedDisplayedSong = appendChordToSongSectionLine(
        displaySong,
        sectionId,
        lineIndex,
        newConcertChord
      );
    } else if (charOffset > 0) {
      updatedDisplayedSong = insertChordAtLyricPositionInSong(
        displaySong,
        sectionId,
        lineIndex,
        segmentIndex,
        charOffset,
        newConcertChord
      );
    } else {
      updatedDisplayedSong = replaceChordInSongSectionLine(
        displaySong,
        sectionId,
        lineIndex,
        segmentIndex,
        newConcertChord
      );
    }
    const baseChordPro = convertDisplayedSongToBaseChordPro(
      updatedDisplayedSong,
      baseCatalogSong,
      normalizedSemitones
    );
    setActiveChordEditTarget(null);
    setCustomChordInput('');
    applyRehearsalArrangementChange(baseChordPro);
  };

  const handleNudgeChord = (
    sectionId: string,
    lineIndex: number,
    segmentIndex: number,
    direction: 'left' | 'right'
  ) => {
    if (!baseCatalogSong || !displaySong) return;
    const { song: updatedDisplayedSong, newSegmentIndex } =
      nudgeChordByWordInSongSectionLine(
        displaySong,
        sectionId,
        lineIndex,
        segmentIndex,
        direction
      );
    const baseChordPro = convertDisplayedSongToBaseChordPro(
      updatedDisplayedSong,
      baseCatalogSong,
      normalizedSemitones
    );
    setActiveChordEditTarget((prev) =>
      prev
        ? {
            ...prev,
            segmentIndex: newSegmentIndex,
            charOffset: 0,
            targetWord: undefined,
          }
        : null
    );
    applyRehearsalArrangementChange(baseChordPro);
  };

  const handleInlineLineSave = () => {
    if (!activeLineEditTarget || !baseCatalogSong || !displaySong) return;
    const updatedDisplayedSong = updateLineInSongSection(
      displaySong,
      activeLineEditTarget.sectionId,
      activeLineEditTarget.lineIndex,
      activeLineEditTarget.bracketedText,
      activeLineEditTarget.annotation
    );
    const baseChordPro = convertDisplayedSongToBaseChordPro(
      updatedDisplayedSong,
      baseCatalogSong,
      normalizedSemitones
    );
    setActiveLineEditTarget(null);
    applyRehearsalArrangementChange(baseChordPro);
  };

  const handleProposeCurrentArrangementToLeader = async () => {
    if (!effectiveGroup?.id || !baseCatalogSong || !displaySong) return;
    setIsSubmittingProposal(true);
    try {
      const chordProToSend =
        layeredRehearsalResult?.activeOverride?.chordPro ||
        convertDisplayedSongToBaseChordPro(
          displaySong,
          baseCatalogSong,
          normalizedSemitones
        );
      const noteToSend =
        proposalNoteInput.trim() ||
        layeredRehearsalResult?.activeOverride?.arrangementNote ||
        `${user?.displayName || 'Musician'}'s ${rehearsalInstrument} arrangement`;

      const { group: updatedGroup } = await proposeTeamSongArrangement(
        effectiveGroup.id,
        {
          songId: baseCatalogSong.id,
          songTitle: baseCatalogSong.title,
          instrument: rehearsalInstrument,
          chordPro: chordProToSend,
          arrangementNote: noteToSend,
        }
      );
      setLiveGroup(updatedGroup);
      setProposalNoteInput('');
      setFeedbackBanner({
        type: 'success',
        message: `Submitted your ${rehearsalInstrument.toUpperCase()} chords & lyrics to ${effectiveGroup.name} Leader for approval!`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Could not submit arrangement proposal to Worship Leader.',
      });
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handlePublishDirectToChurch = async (
    targetScope: InstrumentViewMode
  ) => {
    if (!effectiveGroup?.id || !baseCatalogSong || !displaySong) return;
    setIsSubmittingProposal(true);
    try {
      const chordProToSave =
        layeredRehearsalResult?.activeOverride?.chordPro ||
        convertDisplayedSongToBaseChordPro(
          displaySong,
          baseCatalogSong,
          normalizedSemitones
        );
      const noteToSave =
        proposalNoteInput.trim() ||
        layeredRehearsalResult?.activeOverride?.arrangementNote ||
        `Leader ${targetScope} arrangement`;

      const { group: updatedGroup } = await saveTeamSongArrangementDirect(
        effectiveGroup.id,
        {
          songId: baseCatalogSong.id,
          songTitle: baseCatalogSong.title,
          instrument: targetScope,
          chordPro: chordProToSave,
          arrangementNote: noteToSave,
        }
      );
      setLiveGroup(updatedGroup);

      // Promote personal draft into the published Church Group arrangement so the draft prompt disappears cleanly
      let nextPersonal = removePersonalInstrumentArrangement(
        baseCatalogSong.id,
        rehearsalInstrument
      );
      if (targetScope !== rehearsalInstrument) {
        nextPersonal = removePersonalInstrumentArrangement(
          baseCatalogSong.id,
          targetScope
        );
      }
      setPersonalArrangements(nextPersonal);
      setProposalNoteInput('');
      setIsQuickEditMode(false);
      setActiveChordEditTarget(null);
      setActiveLineEditTarget(null);
      setIsArrangementBannerHidden(true);

      setFeedbackBanner({
        type: 'success',
        message:
          targetScope === 'general'
            ? `Published arrangement directly to ${effectiveGroup.name} (Entire Church Team)!`
            : `Published arrangement directly to ${effectiveGroup.name} (${targetScope.toUpperCase()} Chords)!`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Could not publish arrangement to church group.',
      });
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleResetChurchArrangement = async () => {
    if (!effectiveGroup?.id || !baseCatalogSong || !layeredRehearsalResult) return;
    const targetScope: InstrumentViewMode =
      layeredRehearsalResult.activeLayer === 'group-band'
        ? 'general'
        : rehearsalInstrument;
    setIsSubmittingProposal(true);
    try {
      const { group: updatedGroup } = await removeTeamSongArrangementDirect(
        effectiveGroup.id,
        {
          songId: baseCatalogSong.id,
          instrument: targetScope,
        }
      );
      setLiveGroup(updatedGroup);
      setFeedbackBanner({
        type: 'success',
        message: `Reset ${effectiveGroup.name}'s ${
          targetScope === 'general' ? 'Entire Team' : targetScope.toUpperCase()
        } arrangement back to the original catalog chart.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Could not reset church arrangement.',
      });
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleLeaderReviewProposalOnSongPage = async (
    proposal: TeamArrangementSuggestion,
    decision: 'approve' | 'decline',
    approvedScope?: InstrumentViewMode
  ) => {
    if (!effectiveGroup?.id) return;
    setIsSubmittingProposal(true);
    try {
      const { group: updatedGroup } = await reviewTeamSongArrangement(
        effectiveGroup.id,
        proposal.id,
        decision,
        {
          targetScope: approvedScope ?? proposal.instrument,
          fallbackSuggestion: proposal,
        }
      );
      setLiveGroup(updatedGroup);
      if (previewingProposalId === proposal.id) {
        setPreviewingProposalId(null);
      }
      setFeedbackBanner({
        type: 'success',
        message:
          decision === 'approve'
            ? `Approved ${proposal.suggestedByName}'s arrangement for ${
                (approvedScope ?? proposal.instrument) === 'general'
                  ? 'Entire Church Team (Church Group Only)'
                  : `${(approvedScope ?? proposal.instrument).toUpperCase()} Only (Church Group Only)`
              }!`
            : `Declined ${proposal.suggestedByName}'s arrangement proposal.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Could not review arrangement proposal.',
      });
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleAskAdminToPublishGlobally = async () => {
    if (!baseCatalogSong || !layeredRehearsalResult?.activeOverride) return;
    const authToken = getSessionToken();
    if (!authToken) {
      setFeedbackBanner({
        type: 'error',
        message:
          'Please sign in with your Worship Leader account to ask the Admin for permission to publish this Church Group arrangement globally.',
      });
      return;
    }

    setIsSubmittingProposal(true);
    try {
      const arrangedBaseSong = resolveSongWithLiveOverride(
        baseCatalogSong,
        layeredRehearsalResult.activeOverride
      );
      const churchLabel =
        effectiveGroup?.churchName ||
        effectiveGroup?.name ||
        user?.churchName ||
        'Church Team';
      const submittedSong = {
        ...arrangedBaseSong,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(apiUrl('/api/cloud/submissions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          song: submittedSong,
          submissionNotes: `Global Publish Permission Request from Leader (${churchLabel})${
            layeredRehearsalResult.activeOverride.arrangementNote
              ? ` — "${layeredRehearsalResult.activeOverride.arrangementNote}"`
              : ''
          }`,
        }),
      });
      if (res.ok) {
        setFeedbackBanner({
          type: 'success',
          message:
            'Permission request sent to Admin! Your arrangement remains scoped to your Church Group until the Admin approves it for the Global Catalog.',
        });
      } else {
        const errData = await res.json().catch(() => null);
        setFeedbackBanner({
          type: 'error',
          message:
            errData?.error ||
            'Could not send global publishing permission request to Admin.',
        });
      }
    } catch {
      setFeedbackBanner({
        type: 'error',
        message: 'Could not send global publishing permission request to Admin.',
      });
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleDismissMemberArrangementProposal = async (proposalId: string) => {
    if (!effectiveGroup?.id || !proposalId) return;
    setIsSubmittingProposal(true);
    try {
      const res = await dismissTeamSongArrangement(effectiveGroup.id, proposalId);
      if (res.group) {
        setLiveGroup(res.group);
      } else if (effectiveGroup) {
        setLiveGroup({
          ...effectiveGroup,
          suggestedArrangements: (effectiveGroup.suggestedArrangements || []).filter(
            (a) => a.id !== proposalId
          ),
        });
      }
      setFeedbackBanner({
        type: 'success',
        message: 'Closed arrangement proposal notification.',
      });
    } catch {
      setFeedbackBanner({
        type: 'error',
        message: 'Could not close arrangement proposal.',
      });
    } finally {
      setIsSubmittingProposal(false);
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
            ? 'bg-[var(--bg-canvas)] text-[var(--text-primary)]'
            : 'bg-stone-50 text-slate-950'
        }`}
      >
        {/* Compact Sticky Performance Header */}
        <header
          className={`sticky top-0 z-20 border-b px-4 py-2.5 backdrop-blur-md ${
            perfDarkSurface
              ? 'bg-[var(--bg-surface)]/95 border-[var(--border-subtle)]'
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
                    ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30'
                    : 'bg-[var(--brand-accent)] text-[var(--brand-accent-text)]'
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
                    ? 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]'
                    : 'border-stone-300 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleStepSemitone(-1)}
                  aria-label="Transpose down 1 semitone"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-[var(--brand-accent)]/20 font-bold cursor-pointer"
                >
                  <Minus className="w-4 h-4" aria-hidden="true" />
                </button>
                <select
                  aria-label="Select target key in performance mode"
                  value={normalizedSemitones}
                  onChange={(e) => handleSelectTargetKey(Number(e.target.value))}
                  className="h-9 px-2 font-mono font-bold text-sm rounded bg-transparent text-[var(--brand-accent)] cursor-pointer focus:outline-none"
                >
                  {keyOptions.map((opt) => (
                    <option
                      key={opt.semitonesFromOriginal}
                      value={opt.semitonesFromOriginal}
                      className="bg-[#14141a] text-white"
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
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-[var(--brand-accent)]/20 font-bold cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
                {isTransposed && (
                  <button
                    type="button"
                    onClick={handleResetKey}
                    title={`Reset to original key (${activeSourceSong.originalKey})`}
                    className="px-2 h-9 text-xs font-semibold text-[var(--brand-accent)] hover:underline cursor-pointer"
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
                    ? 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]'
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
                    ? 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]'
                    : 'border-stone-300 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsAutoScrolling((v) => !v)}
                  aria-pressed={isAutoScrolling}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded hover:bg-[var(--brand-accent)]/20 cursor-pointer"
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
                      className="bg-[#14141a] text-white"
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
                    ? 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]'
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
                        ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] font-bold ring-1 ring-[var(--brand-accent)]/30'
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
                    ? 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--brand-accent)]'
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
                className={`theme-card rounded-2xl p-4 sm:p-6 border transition-all ${
                  perfDarkSurface
                    ? 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-2 border-b border-current/10">
                  <h2 className="font-bold uppercase tracking-wider text-sm sm:text-base text-[var(--brand-accent)]">
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
                                className="px-2.5 py-1 rounded-lg bg-[var(--chord-bg)] text-[var(--chord-color)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] cursor-pointer transition-colors"
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
                                        ? 'var(--chord-color)'
                                        : '#3f6212',
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
                                      ? 'var(--text-primary)'
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

          {/* Floating Practice Audio Recording & Review Dock */}
          {displaySong && (
            <PracticeDock
              songSlug={displaySong.slug}
              songTitle={displaySong.title}
              songArtist={displaySong.artist}
              currentKey={displayedKey}
              currentCapo={selectedCapo}
            />
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // NORMAL SONG DETAIL / CHORD CHART VIEW
  // ============================================================================
  return (
    <div className="space-y-5 pb-28">
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

      {/* Quick-Tap Edit Mode Helper Bar on Regular Song Page */}
      {isQuickEditMode && (
        <div
          data-testid="song-quick-edit-helper-banner"
          className="rounded-2xl border-2 border-[var(--brand-accent)] bg-[var(--brand-surface)] p-4 space-y-2.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-[var(--brand-accent)] text-sm">
                <Sparkles className="w-4 h-4" />
                <span>
                  Quick-Tap Edit Mode Active · Editing Your{' '}
                  {rehearsalInstrument === 'general'
                    ? 'General Song Chart'
                    : `${rehearsalInstrument.toUpperCase()} Chords`}
                </span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold">
                Saves automatically to your device &amp; carries over to Live Sync
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowInstrumentArrangeModal(true)}
                className="px-2.5 py-1 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--bg-surface)] text-[var(--brand-accent)] font-bold cursor-pointer"
              >
                Open Full ChordPro Studio
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickEditMode(false);
                  setActiveChordEditTarget(null);
                  setActiveLineEditTarget(null);
                }}
                className="px-2.5 py-1 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] font-bold cursor-pointer"
              >
                Done Quick-Editing
              </button>
            </div>
          </div>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            • <strong>Tap any word in the lyrics</strong> below to place a chord right above that word ·{' '}
            <strong>Tap any existing chord</strong> to swap it, remove it, or slide it{' '}
            <strong>← Word Left / Word Right →</strong> ·{' '}
            <strong>Tap &ldquo;Edit Words &amp; Chords&rdquo;</strong> on any line to rewrite lyrics or insert{' '}
            <code className="font-mono text-[var(--brand-accent)]">[Chord]</code> tokens freely.
          </p>
        </div>
      )}

      {/* Leader Previewing a Member Proposal Banner */}
      {previewedProposal && (
        <div
          data-testid="song-leader-preview-proposal-banner"
          className="rounded-2xl border-2 border-amber-500 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-1">
            <div className="font-bold text-amber-400 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>
                Previewing {previewedProposal.suggestedByName}&apos;s Proposed{' '}
                {previewedProposal.instrument.toUpperCase()} Arrangement
              </span>
            </div>
            {previewedProposal.arrangementNote && (
              <p className="text-[var(--text-secondary)]">
                Member Note: &ldquo;{previewedProposal.arrangementNote}&rdquo;
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSubmittingProposal}
              onClick={() =>
                handleLeaderReviewProposalOnSongPage(
                  previewedProposal,
                  'approve',
                  previewedProposal.instrument
                )
              }
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-[#0c0c10] font-bold cursor-pointer disabled:opacity-50"
            >
              Approve for {previewedProposal.instrument.toUpperCase()} Only
            </button>
            <button
              type="button"
              disabled={isSubmittingProposal}
              onClick={() =>
                handleLeaderReviewProposalOnSongPage(
                  previewedProposal,
                  'approve',
                  'general'
                )
              }
              className="px-3 py-1.5 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] font-bold cursor-pointer disabled:opacity-50"
            >
              Approve for Entire Church Team
            </button>
            <button
              type="button"
              disabled={isSubmittingProposal}
              onClick={() =>
                handleLeaderReviewProposalOnSongPage(
                  previewedProposal,
                  'decline'
                )
              }
              className="px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-400 font-semibold cursor-pointer disabled:opacity-50"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => setPreviewingProposalId(null)}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-semibold cursor-pointer"
            >
              Exit Preview
            </button>
          </div>
        </div>
      )}

      {/* Pending Member Proposals for This Song (Visible to Worship Leader right on the Song Page) */}
      {isGroupLeader && pendingSongProposals.length > 0 && !previewedProposal && (
        <div
          data-testid="song-leader-pending-proposals-card"
          className="rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-4 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-amber-400 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>
                {pendingSongProposals.length} Member Arrangement Proposal
                {pendingSongProposals.length === 1 ? '' : 's'} Waiting for Your
                Approval
              </span>
            </span>
            <Link
              href="/team"
              className="text-amber-400 underline font-semibold"
            >
              View All in Team Hub
            </Link>
          </div>
          <div className="space-y-2">
            {pendingSongProposals.map((prop) => (
              <div
                key={prop.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">
                      {prop.suggestedByName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                      {prop.instrument === 'general'
                        ? 'Full Band Chart'
                        : `${prop.instrument} Chords`}
                    </span>
                  </div>
                  {prop.arrangementNote && (
                    <p className="text-[var(--text-secondary)]">
                      &ldquo;{prop.arrangementNote}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    data-testid={`song-preview-proposal-${prop.id}`}
                    onClick={() => setPreviewingProposalId(prop.id)}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] font-bold cursor-pointer"
                  >
                    Preview on Chart
                  </button>
                  <button
                    type="button"
                    data-testid={`song-approve-proposal-instrument-${prop.id}`}
                    disabled={isSubmittingProposal}
                    onClick={() =>
                      handleLeaderReviewProposalOnSongPage(
                        prop,
                        'approve',
                        prop.instrument
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-[#0c0c10] font-bold cursor-pointer disabled:opacity-50"
                  >
                    Approve for {prop.instrument.toUpperCase()} Only
                  </button>
                  <button
                    type="button"
                    data-testid={`song-approve-proposal-general-${prop.id}`}
                    disabled={isSubmittingProposal}
                    onClick={() =>
                      handleLeaderReviewProposalOnSongPage(
                        prop,
                        'approve',
                        'general'
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] font-bold cursor-pointer disabled:opacity-50"
                  >
                    Approve for Entire Church Team
                  </button>
                  <button
                    type="button"
                    data-testid={`song-decline-proposal-${prop.id}`}
                    disabled={isSubmittingProposal}
                    onClick={() =>
                      handleLeaderReviewProposalOnSongPage(prop, 'decline')
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-400 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Rehearsal / Church Instrument Arrangement Banner + Submit for Leader Approval */}
      {layeredRehearsalResult &&
        layeredRehearsalResult.activeLayer !== 'catalog' &&
        !isArrangementBannerHidden && (
          <div
            data-testid="rehearsal-arrangement-banner"
            className="rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] p-4 space-y-3 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-bold text-[var(--brand-accent)]">
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {layeredRehearsalResult.activeLayer === 'personal-instrument'
                      ? isGroupLeader
                        ? `Unpublished ${rehearsalInstrument.toUpperCase()} Draft Active`
                        : `My Rehearsal ${rehearsalInstrument.toUpperCase()} Chords & Lyrics Active (Auto-carries over into Live Sync!)`
                      : layeredRehearsalResult.activeLayer === 'group-band'
                      ? `Church Group Full Band Arrangement Active (Church Only)`
                      : `Church Group ${rehearsalInstrument.toUpperCase()} Arrangement Active (Church Only)`}
                  </span>
                </span>
                {layeredRehearsalResult.activeOverride?.arrangementNote && (
                  <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-semibold">
                    “{layeredRehearsalResult.activeOverride.arrangementNote}”
                  </span>
                )}
                {!isGroupLeader && myLatestProposalForInstrument && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      data-testid="song-member-proposal-status-badge"
                      className={`px-2.5 py-0.5 rounded-full font-bold ${
                        myLatestProposalForInstrument.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : myLatestProposalForInstrument.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      }`}
                    >
                      {myLatestProposalForInstrument.status === 'pending'
                        ? 'Pending Leader Approval'
                        : myLatestProposalForInstrument.status === 'approved'
                        ? 'Approved by Leader (Church Group)'
                        : 'Declined by Leader'}
                    </span>
                    <button
                      type="button"
                      data-testid="song-dismiss-member-proposal-btn"
                      onClick={() =>
                        handleDismissMemberArrangementProposal(
                          myLatestProposalForInstrument.id
                        )
                      }
                      title="Close this proposal status"
                      className="px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <X className="w-3 h-3" />
                      <span>Close</span>
                    </button>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isGroupLeader &&
                  layeredRehearsalResult.activeLayer !==
                    'personal-instrument' && (
                    <button
                      type="button"
                      data-testid="song-leader-ask-admin-global-btn"
                      disabled={isSubmittingProposal}
                      onClick={handleAskAdminToPublishGlobally}
                      className="px-2.5 py-1 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--bg-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                      title="Ask Admin for permission to publish this Church Group arrangement globally"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>
                        {isSubmittingProposal
                          ? 'Requesting Admin Approval...'
                          : 'Ask Admin to Publish Globally'}
                      </span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() =>
                    setPreferredLayer((prev) =>
                      prev === 'catalog' ? 'auto' : 'catalog'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-semibold cursor-pointer"
                >
                  {preferredLayer === 'catalog'
                    ? `View ${rehearsalInstrument.toUpperCase()} Chords`
                    : 'Compare with Original Chart'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickEditMode((prev) => !prev)}
                  className="px-2.5 py-1 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--bg-surface)] text-[var(--brand-accent)] font-bold cursor-pointer"
                >
                  {isQuickEditMode ? 'Exit Quick-Tap Edit' : 'Quick-Tap Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInstrumentArrangeModal(true)}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-bold text-[var(--brand-accent)] cursor-pointer"
                >
                  Full Studio
                </button>
                {layeredRehearsalResult.activeLayer === 'personal-instrument' &&
                  baseCatalogSong && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = removePersonalInstrumentArrangement(
                          baseCatalogSong.id,
                          rehearsalInstrument
                        );
                        setPersonalArrangements(next);
                        setFeedbackBanner({
                          type: 'success',
                          message: `Reset your ${rehearsalInstrument.toUpperCase()} draft back to the active chart.`,
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 font-semibold cursor-pointer"
                    >
                      {isGroupLeader ? 'Discard Draft' : 'Reset My Chords'}
                    </button>
                  )}
                {isGroupLeader &&
                  layeredRehearsalResult.activeLayer !==
                    'personal-instrument' && (
                    <button
                      type="button"
                      data-testid="song-leader-reset-church-chart-btn"
                      disabled={isSubmittingProposal}
                      onClick={handleResetChurchArrangement}
                      className="px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 font-semibold cursor-pointer disabled:opacity-50"
                      title="Revert Church Group arrangement back to the original catalog chart"
                    >
                      Reset Church Chart
                    </button>
                  )}
                <button
                  type="button"
                  data-testid="close-rehearsal-arrangement-banner-btn"
                  onClick={() => setIsArrangementBannerHidden(true)}
                  title="Close arrangement options banner"
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Worship Leader Direct Church Group Publish Row (when Leader has an unpublished draft) */}
            {effectiveGroup?.id &&
              isGroupLeader &&
              layeredRehearsalResult.activeLayer === 'personal-instrument' &&
              layeredRehearsalResult.activeOverride && (
                <div className="pt-2.5 border-t border-[var(--border-subtle)]/70 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                  <input
                    type="text"
                    aria-label="Arrangement note for your church team"
                    value={proposalNoteInput}
                    onChange={(e) => setProposalNoteInput(e.target.value)}
                    placeholder={`Optional arrangement note for ${effectiveGroup.name} (e.g. Acoustic intro, build on Bridge)...`}
                    className="w-full lg:flex-1 min-w-[240px] h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                  />
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {rehearsalInstrument !== 'general' && (
                      <button
                        type="button"
                        data-testid="song-leader-publish-instrument-btn"
                        disabled={isSubmittingProposal}
                        onClick={() =>
                          handlePublishDirectToChurch(rehearsalInstrument)
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0c0c10] font-bold cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingProposal
                          ? 'Publishing...'
                          : `Publish to Church ${rehearsalInstrument.toUpperCase()} (Church Only)`}
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="song-leader-publish-general-btn"
                      disabled={isSubmittingProposal}
                      onClick={() => handlePublishDirectToChurch('general')}
                      className="px-3.5 py-2 rounded-xl bg-[var(--brand-accent)] hover:opacity-95 text-[#0c0c10] font-bold cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingProposal
                        ? 'Publishing...'
                        : 'Publish to Entire Church Team (Church Only)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsArrangementBannerHidden(true)}
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Close</span>
                    </button>
                  </div>
                </div>
              )}

            {/* Band Member Submit for Worship Leader Approval Row */}
            {effectiveGroup?.id &&
              !isGroupLeader &&
              layeredRehearsalResult.activeLayer === 'personal-instrument' &&
              layeredRehearsalResult.activeOverride &&
              !(
                myLatestProposalForInstrument?.status === 'pending' &&
                myLatestProposalForInstrument.chordPro ===
                  layeredRehearsalResult.activeOverride.chordPro
              ) && (
                <div className="pt-2.5 border-t border-[var(--border-subtle)]/70 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                  <input
                    type="text"
                    aria-label="Note for Worship Leader about your chord or lyric changes"
                    value={proposalNoteInput}
                    onChange={(e) => setProposalNoteInput(e.target.value)}
                    placeholder={`Optional note for ${effectiveGroup.name} Leader (e.g. Added passing chords in Verse 2)...`}
                    className="w-full lg:flex-1 min-w-[240px] h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                  />
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid="song-submit-for-leader-approval-btn"
                      disabled={isSubmittingProposal}
                      onClick={handleProposeCurrentArrangementToLeader}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0c0c10] font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {isSubmittingProposal
                          ? 'Submitting...'
                          : myLatestProposalForInstrument?.status === 'pending'
                          ? 'Update Proposal for Leader'
                          : 'Submit to Worship Leader for Approval'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsArrangementBannerHidden(true)}
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Close</span>
                    </button>
                  </div>
                </div>
              )}

            {/* Declined Proposal Notice with Close Button inside Rehearsal Banner */}
            {!isGroupLeader && myLatestProposalForInstrument?.status === 'declined' && (
              <div
                data-testid="song-declined-proposal-notice"
                className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-rose-300 flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5 text-rose-400" />
                    <span>
                      Your {rehearsalInstrument.toUpperCase()} arrangement proposal was declined by the Worship Leader
                    </span>
                  </div>
                  {myLatestProposalForInstrument.reviewNote && (
                    <p className="text-[var(--text-secondary)]">
                      Leader feedback: &ldquo;{myLatestProposalForInstrument.reviewNote}&rdquo;
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  data-testid="song-close-declined-proposal-btn"
                  onClick={() =>
                    handleDismissMemberArrangementProposal(
                      myLatestProposalForInstrument.id
                    )
                  }
                  className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            )}
          </div>
        )}

      {/* Standalone Declined / Approved Proposal Card when viewing catalog layer without local override */}
      {(!layeredRehearsalResult ||
        layeredRehearsalResult.activeLayer === 'catalog') &&
        myLatestProposalForInstrument && (
          <div
            data-testid="song-standalone-member-proposal-card"
            className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 text-xs ${
              myLatestProposalForInstrument.status === 'declined'
                ? 'border-rose-500/40 bg-rose-500/10'
                : myLatestProposalForInstrument.status === 'approved'
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-amber-500/40 bg-amber-500/10'
            }`}
          >
            <div className="space-y-0.5">
              <div className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span>
                  Your {rehearsalInstrument.toUpperCase()} Arrangement Proposal:
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-bold ${
                    myLatestProposalForInstrument.status === 'pending'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : myLatestProposalForInstrument.status === 'approved'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  {myLatestProposalForInstrument.status === 'pending'
                    ? 'Pending Leader Approval'
                    : myLatestProposalForInstrument.status === 'approved'
                    ? 'Approved by Leader'
                    : 'Declined by Leader'}
                </span>
              </div>
              {myLatestProposalForInstrument.reviewNote && (
                <p className="text-[var(--text-secondary)]">
                  Leader feedback: &ldquo;{myLatestProposalForInstrument.reviewNote}&rdquo;
                </p>
              )}
            </div>
            <button
              type="button"
              data-testid="song-standalone-dismiss-proposal-btn"
              onClick={() =>
                handleDismissMemberArrangementProposal(
                  myLatestProposalForInstrument.id
                )
              }
              className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
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
      <header className="theme-card rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-7 space-y-4 shadow-sm">
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
            {/* Record Practice Take Action */}
            <button
              type="button"
              onClick={() => {
                const recBtn = document.querySelector('[data-practice-record-btn]') as HTMLButtonElement | null;
                if (recBtn) {
                  recBtn.click();
                } else {
                  const takesBtn = document.querySelector('[data-practice-takes-btn]') as HTMLButtonElement | null;
                  if (takesBtn) takesBtn.click();
                }
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 font-bold text-sm shadow-sm transition-all cursor-pointer min-h-[2.75rem]"
              title="Record audio practice take for this song"
            >
              <Mic className="w-4 h-4" aria-hidden="true" />
              <span>Record Practice Take</span>
            </button>

            {/* Enter Performance Mode */}
            <button
              type="button"
              onClick={() => setIsPerformanceMode(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm shadow-sm transition-all cursor-pointer min-h-[2.75rem]"
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--brand-accent)]/35 bg-[var(--brand-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm shadow-sm transition-all min-h-[2.75rem]"
            >
              <Radio className="w-4 h-4 animate-pulse" aria-hidden="true" />
              <span>Start Live Sync</span>
            </Link>

            {/* Rehearse Ahead of Time: Quick-Tap Edit Chords & Lyrics + Customize Instrument Chords */}
            <div className="inline-flex flex-wrap items-center rounded-xl border border-[var(--brand-accent)]/35 bg-[var(--bg-subtle)] p-1 gap-1 min-h-[2.75rem]">
              <select
                aria-label="Rehearsal instrument arrangement target"
                value={rehearsalInstrument}
                onChange={(e) => {
                  setRehearsalInstrument(e.target.value as InstrumentViewMode);
                  setActiveChordEditTarget(null);
                  setActiveLineEditTarget(null);
                }}
                className="h-8 px-2 rounded-lg bg-[var(--bg-surface)] text-xs font-bold text-[var(--brand-accent)] cursor-pointer"
              >
                <option value="guitar">Guitar Chords</option>
                <option value="keyboard">Keyboard Chords</option>
                <option value="bass">Bass Chords</option>
                <option value="general">General Chart</option>
              </select>
              <button
                type="button"
                data-testid="song-quick-tap-edit-toggle"
                onClick={() => {
                  setIsQuickEditMode((prev) => !prev);
                  setActiveChordEditTarget(null);
                  setActiveLineEditTarget(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isQuickEditMode
                    ? 'bg-[var(--brand-accent)] text-[#0c0c10]'
                    : 'bg-[var(--brand-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10]'
                }`}
                title="Tap any word or chord directly on the chart to add, change, slide, or edit chords & lyrics!"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>
                  {isQuickEditMode
                    ? 'Quick-Tap Edit: ON'
                    : 'Quick-Tap Edit Chords & Lyrics'}
                </span>
              </button>
              <button
                type="button"
                data-testid="rehearsal-customize-instrument-chords-btn"
                onClick={() => setShowInstrumentArrangeModal(true)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Open full ChordPro Studio modal for your instrument"
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                <span>Full Studio</span>
              </button>
              {isArrangementBannerHidden &&
                layeredRehearsalResult &&
                layeredRehearsalResult.activeLayer !== 'catalog' && (
                  <button
                    type="button"
                    data-testid="song-reopen-arrangement-banner-btn"
                    onClick={() => setIsArrangementBannerHidden(false)}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    title="Show active arrangement options"
                  >
                    <span>Arrangement Options</span>
                  </button>
                )}
            </div>

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
                        className="px-3 py-1.5 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold disabled:opacity-40 cursor-pointer shadow-sm"
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

            {/* Admin Remove Globally Action */}
            {isAdmin && activeSourceSong.sourceType !== 'custom' && (
              <button
                type="button"
                onClick={() => {
                  setAdminRemoveReason('');
                  setShowAdminRemoveModal(true);
                }}
                title="Admin only: Remove this song globally from the public catalog"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold transition-colors cursor-pointer min-h-[2.75rem]"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>Remove Globally (Admin)</span>
              </button>
            )}
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
        className="theme-card sticky top-[3.5rem] md:top-2 z-20 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-md p-3 sm:p-4 shadow-sm space-y-3"
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
            className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 scroll-mt-40 shadow-xs"
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
                const isEditingThisLine =
                  isQuickEditMode &&
                  activeLineEditTarget?.sectionId === section.id &&
                  activeLineEditTarget?.lineIndex === lineIndex;

                const renderChordPickerPopover = () => {
                  const isTarget =
                    isQuickEditMode &&
                    activeChordEditTarget?.sectionId === section.id &&
                    activeChordEditTarget?.lineIndex === lineIndex;

                  if (!isTarget || !activeChordEditTarget) return null;

                  const {
                    segmentIndex: segIdx,
                    charOffset,
                    targetWord,
                    currentChord,
                    isTrailing,
                  } = activeChordEditTarget;

                  const headerLabel = isTrailing
                    ? `Add Chord at End of Line (Key of ${displayedKey})`
                    : charOffset > 0 && targetWord
                    ? `Add Chord Above "${targetWord}" (Key of ${displayedKey})`
                    : currentChord
                    ? `Chord "${currentChord}"${
                        targetWord ? ` on "${targetWord}"` : ''
                      } (Key of ${displayedKey})`
                    : `Add Chord${
                        targetWord ? ` Above "${targetWord}"` : ''
                      } (Key of ${displayedKey})`;

                  return (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      data-testid="song-inline-chord-picker-popover"
                      className="mt-1.5 mb-2 p-3.5 rounded-xl border-2 border-[var(--brand-accent)] bg-[var(--bg-surface)] shadow-xl space-y-2.5 z-30 max-w-lg"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--brand-accent)]">
                          {headerLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveChordEditTarget(null)}
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          Close
                        </button>
                      </div>

                      {/* 1-Tap Diatonic Chord Buttons */}
                      <div className="flex flex-wrap gap-1.5">
                        {diatonicSuggestionsForDisplayedKey.map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() =>
                              handleInlineChordChange(
                                section.id,
                                lineIndex,
                                segIdx,
                                sug,
                                charOffset,
                                Boolean(isTrailing)
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs border cursor-pointer transition-colors ${
                              sug === currentChord &&
                              charOffset === 0 &&
                              !isTrailing
                                ? 'bg-[var(--brand-accent)] text-[#0c0c10] border-[var(--brand-accent)]'
                                : 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10]'
                            }`}
                          >
                            {sug}
                          </button>
                        ))}
                        {currentChord && charOffset === 0 && !isTrailing && (
                          <button
                            type="button"
                            onClick={() =>
                              handleInlineChordChange(
                                section.id,
                                lineIndex,
                                segIdx,
                                '',
                                0,
                                false
                              )
                            }
                            className="px-2.5 py-1 rounded-lg font-sans font-semibold text-xs border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                          >
                            Remove Chord
                          </button>
                        )}
                      </div>

                      {/* Word Nudge Controls (Move Chord Left / Right Across Lyrics) + Edit Words Shortcut */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]">
                        {currentChord &&
                        charOffset === 0 &&
                        !isTrailing &&
                        !instrumental ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                              Position:
                            </span>
                            <button
                              type="button"
                              data-testid="song-nudge-chord-left-btn"
                              onClick={() =>
                                handleNudgeChord(
                                  section.id,
                                  lineIndex,
                                  segIdx,
                                  'left'
                                )
                              }
                              className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              title="Slide this chord one word to the left"
                            >
                              <ArrowLeft className="w-3 h-3" />
                              <span>Word Left</span>
                            </button>
                            <button
                              type="button"
                              data-testid="song-nudge-chord-right-btn"
                              onClick={() =>
                                handleNudgeChord(
                                  section.id,
                                  lineIndex,
                                  segIdx,
                                  'right'
                                )
                              }
                              className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              title="Slide this chord one word to the right"
                            >
                              <span>Word Right</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            Tap any chord above to place it right here
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const bracketed = formatSongLineForQuickEdit(line);
                            setActiveChordEditTarget(null);
                            inlineLineCursorRef.current = bracketed.length;
                            setActiveLineEditTarget({
                              sectionId: section.id,
                              lineIndex,
                              bracketedText: bracketed,
                              annotation: line.annotation || '',
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Lyrics &amp; Chords Text</span>
                        </button>
                      </div>

                      {/* Custom Chord Symbol Input */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          type="text"
                          aria-label="Custom chord symbol"
                          value={customChordInput}
                          onChange={(e) => setCustomChordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (
                              e.key === 'Enter' &&
                              customChordInput.trim()
                            ) {
                              e.preventDefault();
                              handleInlineChordChange(
                                section.id,
                                lineIndex,
                                segIdx,
                                customChordInput.trim(),
                                charOffset,
                                Boolean(isTrailing)
                              );
                            }
                          }}
                          placeholder="Custom chord (e.g. D/F#, Asus4, Bm7)"
                          className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] font-mono text-xs"
                        />
                        <button
                          type="button"
                          disabled={!customChordInput.trim()}
                          onClick={() =>
                            handleInlineChordChange(
                              section.id,
                              lineIndex,
                              segIdx,
                              customChordInput.trim(),
                              charOffset,
                              Boolean(isTrailing)
                            )
                          }
                          className="px-3 h-8 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] font-bold text-xs cursor-pointer disabled:opacity-40"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  );
                };

                if (isEditingThisLine && activeLineEditTarget) {
                  return (
                    <div
                      key={lineIndex}
                      onClick={(e) => e.stopPropagation()}
                      className="p-3.5 rounded-xl border-2 border-[var(--brand-accent)] bg-[var(--bg-subtle)] space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--brand-accent)]">
                          Edit Line #{lineIndex + 1} — Click anywhere in the
                          lyrics below &amp; tap a +{displayedKey} chord to
                          insert at your cursor:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {diatonicSuggestionsForDisplayedKey.map((chord) => (
                            <button
                              key={chord}
                              type="button"
                              onClick={() => {
                                const inputEl = inlineLineInputRef.current;
                                const curPos =
                                  inputEl?.selectionStart ??
                                  inlineLineCursorRef.current ??
                                  activeLineEditTarget.bracketedText.length;
                                const { nextText, nextCursor } =
                                  insertChordAtCursor(
                                    activeLineEditTarget.bracketedText,
                                    curPos,
                                    chord
                                  );
                                inlineLineCursorRef.current = nextCursor;
                                setActiveLineEditTarget((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        bracketedText: nextText,
                                      }
                                    : null
                                );
                                window.requestAnimationFrame(() => {
                                  if (inlineLineInputRef.current) {
                                    inlineLineInputRef.current.focus();
                                    inlineLineInputRef.current.setSelectionRange(
                                      nextCursor,
                                      nextCursor
                                    );
                                  }
                                });
                              }}
                              className="px-2 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-mono font-bold text-[11px] cursor-pointer transition-colors"
                              title={`Insert [${chord}] at cursor position`}
                            >
                              +{chord}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        ref={inlineLineInputRef}
                        type="text"
                        aria-label="Edit line chords and lyrics"
                        value={activeLineEditTarget.bracketedText}
                        onClick={(e) => {
                          inlineLineCursorRef.current =
                            e.currentTarget.selectionStart;
                        }}
                        onKeyUp={(e) => {
                          inlineLineCursorRef.current =
                            e.currentTarget.selectionStart;
                        }}
                        onChange={(e) => {
                          inlineLineCursorRef.current =
                            e.target.selectionStart;
                          setActiveLineEditTarget((prev) =>
                            prev
                              ? { ...prev, bracketedText: e.target.value }
                              : null
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleInlineLineSave();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setActiveLineEditTarget(null);
                          }
                        }}
                        placeholder="Type lyrics and place chords in brackets like [G]Amazing [D/F#]grace"
                        className="w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-mono text-xs sm:text-sm"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <input
                          type="text"
                          aria-label="Optional line performance cue"
                          value={activeLineEditTarget.annotation}
                          onChange={(e) =>
                            setActiveLineEditTarget((prev) =>
                              prev
                                ? { ...prev, annotation: e.target.value }
                                : null
                            )
                          }
                          placeholder="Optional cue above line (e.g. Build on drums, A cappella)"
                          className="flex-1 min-w-[180px] h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveLineEditTarget(null)}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleInlineLineSave}
                            className="px-3.5 py-1.5 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] text-xs font-bold cursor-pointer"
                          >
                            Save Line Update
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (instrumental) {
                  const isPopoverOnThisLine =
                    isQuickEditMode &&
                    activeChordEditTarget?.sectionId === section.id &&
                    activeChordEditTarget?.lineIndex === lineIndex;
                  return (
                    <div
                      key={lineIndex}
                      className="chart-line-scroll py-1"
                    >
                      <div className="inline-flex flex-wrap items-center gap-2.5 font-mono font-bold">
                        <span className="text-xs font-sans font-medium uppercase tracking-wider text-[var(--text-secondary)] mr-1">
                          Chords:
                        </span>
                        {line.segments.map((seg, segIdx) => (
                          <button
                            key={segIdx}
                            type="button"
                            onClick={(e) => {
                              if (isQuickEditMode) {
                                e.stopPropagation();
                                setCustomChordInput(seg.chord || '');
                                setActiveChordEditTarget({
                                  sectionId: section.id,
                                  lineIndex,
                                  segmentIndex: segIdx,
                                  charOffset: 0,
                                  currentChord: seg.chord || '',
                                });
                              } else if (seg.chord) {
                                setInspectedChord(seg.chord);
                              }
                            }}
                            className={`px-3 py-1 rounded-lg bg-[var(--chord-bg)] text-[var(--chord-color)] border transition-colors cursor-pointer ${
                              isQuickEditMode
                                ? 'border-[var(--brand-accent)] hover:bg-[var(--brand-surface)]'
                                : 'border-[var(--border-subtle)] hover:border-[var(--brand-accent)]'
                            }`}
                            title={
                              isQuickEditMode
                                ? 'Tap to change or remove chord'
                                : seg.chord
                                ? `Inspect ${seg.chord} chord diagram & fingering`
                                : undefined
                            }
                          >
                            | {formatChordDisplay(seg.chord) || 'N.C.'}
                          </button>
                        ))}
                        <span className="text-[var(--text-secondary)]">|</span>
                        {isQuickEditMode && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomChordInput('');
                                setActiveChordEditTarget({
                                  sectionId: section.id,
                                  lineIndex,
                                  segmentIndex: line.segments.length,
                                  charOffset: 0,
                                  currentChord: '',
                                  isTrailing: true,
                                });
                              }}
                              className="px-2 py-0.5 rounded-md border border-dashed border-[var(--brand-accent)]/60 bg-[var(--brand-surface)] text-[var(--brand-accent)] font-mono text-[11px] font-bold cursor-pointer"
                              title="Add another chord to this progression"
                            >
                              + Add Chord
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveChordEditTarget(null);
                                setActiveLineEditTarget({
                                  sectionId: section.id,
                                  lineIndex,
                                  bracketedText:
                                    formatSongLineForQuickEdit(line),
                                  annotation: line.annotation || '',
                                });
                              }}
                              className="px-2 py-0.5 rounded-md border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] font-sans text-[11px] font-semibold cursor-pointer"
                            >
                              Edit Chords &amp; Lyrics
                            </button>
                          </>
                        )}
                      </div>
                      {isPopoverOnThisLine && renderChordPickerPopover()}
                    </div>
                  );
                }

                const isPopoverOnThisLine =
                  isQuickEditMode &&
                  activeChordEditTarget?.sectionId === section.id &&
                  activeChordEditTarget?.lineIndex === lineIndex;

                return (
                  <div key={lineIndex} className="chart-line-scroll">
                    {line.annotation && (
                      <div className="text-xs italic text-[var(--text-secondary)] mb-1">
                        ({line.annotation})
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="chart-line-segments items-end">
                        {line.segments.map((seg, segIdx) => {
                          const displayChord = formatChordDisplay(seg.chord);
                          const wordTokens = isQuickEditMode
                            ? splitSegmentTextIntoTappableWords(seg.text || '')
                            : [];
                          const firstWordText =
                            wordTokens.find((w) => w.word)?.word ||
                            seg.text?.trim().split(/\s+/)[0];

                          return (
                            <span key={segIdx} className="chart-segment">
                              {isQuickEditMode ? (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCustomChordInput(seg.chord || '');
                                    setActiveChordEditTarget({
                                      sectionId: section.id,
                                      lineIndex,
                                      segmentIndex: segIdx,
                                      charOffset: 0,
                                      targetWord: firstWordText,
                                      currentChord: seg.chord || '',
                                    });
                                  }}
                                  className="chart-chord-row px-1 rounded border border-dashed border-[var(--brand-accent)]/50 hover:bg-[var(--brand-surface)] cursor-pointer"
                                  title="Tap to change, move (←/→), or remove chord here"
                                >
                                  {seg.chord ? displayChord : '+chord'}
                                </span>
                              ) : seg.chord ? (
                                <button
                                  type="button"
                                  onClick={() => setInspectedChord(seg.chord!)}
                                  className="chart-chord-row chart-chord-btn text-left"
                                  title={`Inspect ${seg.chord} chord diagram & fingering`}
                                >
                                  {displayChord}
                                </button>
                              ) : (
                                <span className="chart-chord-row">
                                  {'\u00A0'}
                                </span>
                              )}
                              <span className="chart-lyric-row">
                                {isQuickEditMode && wordTokens.length > 0 ? (
                                  wordTokens.map((tok, wIdx) => {
                                    if (!tok.word) {
                                      return (
                                        <span key={wIdx}>
                                          {tok.trailingSpace}
                                        </span>
                                      );
                                    }
                                    const isSelectedWord =
                                      isPopoverOnThisLine &&
                                      activeChordEditTarget?.segmentIndex ===
                                        segIdx &&
                                      activeChordEditTarget?.charOffset ===
                                        tok.charOffset;
                                    return (
                                      <React.Fragment key={wIdx}>
                                        <span
                                          data-testid={`song-tappable-lyric-word-${section.id}-${lineIndex}-${segIdx}-${wIdx}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const existingChordHere =
                                              tok.charOffset === 0
                                                ? seg.chord || ''
                                                : '';
                                            setCustomChordInput(
                                              existingChordHere
                                            );
                                            setActiveChordEditTarget({
                                              sectionId: section.id,
                                              lineIndex,
                                              segmentIndex: segIdx,
                                              charOffset: tok.charOffset,
                                              targetWord: tok.word,
                                              currentChord: existingChordHere,
                                            });
                                          }}
                                          title={`Tap "${tok.word}" to place a chord right above this word or edit lyrics`}
                                          className={`rounded px-0.5 -mx-0.5 transition-colors cursor-pointer ${
                                            isSelectedWord
                                              ? 'bg-[var(--brand-accent)] text-[#0c0c10] font-bold'
                                              : 'hover:bg-[var(--brand-surface)] hover:text-[var(--brand-accent)] underline decoration-dotted decoration-[var(--brand-accent)]/45 underline-offset-4'
                                          }`}
                                        >
                                          {tok.word}
                                        </span>
                                        {tok.trailingSpace}
                                      </React.Fragment>
                                    );
                                  })
                                ) : (
                                  seg.text || '\u00A0'
                                )}
                              </span>
                            </span>
                          );
                        })}

                        {/* Trailing +end chord button at the end of the lyric line */}
                        {isQuickEditMode && (
                          <span className="chart-segment ml-1.5">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomChordInput('');
                                setActiveChordEditTarget({
                                  sectionId: section.id,
                                  lineIndex,
                                  segmentIndex: line.segments.length,
                                  charOffset: 0,
                                  currentChord: '',
                                  isTrailing: true,
                                });
                              }}
                              title="Add a chord at the end of this line"
                              className="chart-chord-row px-1.5 rounded border border-dashed border-[var(--brand-accent)]/50 hover:bg-[var(--brand-surface)] text-[11px] cursor-pointer"
                            >
                              +end chord
                            </span>
                            <span className="chart-lyric-row">{'\u00A0'}</span>
                          </span>
                        )}
                      </div>

                      {isQuickEditMode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveChordEditTarget(null);
                            const bracketed = formatSongLineForQuickEdit(line);
                            inlineLineCursorRef.current = bracketed.length;
                            setActiveLineEditTarget({
                              sectionId: section.id,
                              lineIndex,
                              bracketedText: bracketed,
                              annotation: line.annotation || '',
                            });
                          }}
                          className="shrink-0 mt-1 px-2 py-0.5 rounded-md border border-[var(--brand-accent)]/45 bg-[var(--brand-surface)] text-[var(--brand-accent)] text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                          title="Rewrite lyrics or insert [Chord] tokens anywhere in this line"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Words &amp; Chords</span>
                        </button>
                      )}
                    </div>
                    {isPopoverOnThisLine && renderChordPickerPopover()}
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

      {/* Rehearse Ahead of Time: Personal Instrument Arrangement Studio Modal */}
      {baseCatalogSong && displaySong && (
        <LiveArrangementEditorModal
          isOpen={showInstrumentArrangeModal}
          onClose={() => setShowInstrumentArrangeModal(false)}
          baseSong={baseCatalogSong}
          displayedSong={displaySong}
          displayedSemitones={semitones}
          displayedKey={displayedKey}
          initialArrangementNote={
            layeredRehearsalResult?.activeOverride?.arrangementNote
          }
          hasActiveOverride={Boolean(
            layeredRehearsalResult &&
              layeredRehearsalResult.activeLayer !== 'catalog'
          )}
          primaryActionLabel={
            isGroupLeader && effectiveGroup?.id
              ? 'Publish to Entire Church Team (Church Only)'
              : `Save to My ${rehearsalInstrument.toUpperCase()} Chords`
          }
          onBroadcastOverride={async ({ chordPro, arrangementNote }) => {
            if (isGroupLeader && effectiveGroup?.id) {
              const { group: updatedGroup } = await saveTeamSongArrangementDirect(
                effectiveGroup.id,
                {
                  songId: baseCatalogSong.id,
                  songTitle: baseCatalogSong.title,
                  instrument: 'general',
                  chordPro,
                  arrangementNote:
                    arrangementNote || 'Leader church arrangement',
                }
              );
              setLiveGroup(updatedGroup);
              const nextPersonal = removePersonalInstrumentArrangement(
                baseCatalogSong.id,
                rehearsalInstrument
              );
              setPersonalArrangements(nextPersonal);
              setPreferredLayer('auto');
              setIsQuickEditMode(false);
              setIsArrangementBannerHidden(true);
              setFeedbackBanner({
                type: 'success',
                message: `Published arrangement directly to ${effectiveGroup.name} (Entire Church Team)!`,
              });
              return;
            }
            const next = savePersonalInstrumentArrangement({
              songId: baseCatalogSong.id,
              songTitle: baseCatalogSong.title,
              instrument: rehearsalInstrument,
              chordPro,
              arrangementNote:
                arrangementNote || `My ${rehearsalInstrument} rehearsal chords`,
              updatedBy: user?.id || 'local-user',
              updatedByName: user?.displayName || 'Musician',
            });
            setPersonalArrangements(next);
            setPreferredLayer('auto');
            setFeedbackBanner({
              type: 'success',
              message: `Saved to your Personal ${rehearsalInstrument.toUpperCase()} Chords! These chords will automatically carry over when you join Live Sync.`,
            });
          }}
          onRevertToOriginal={async (targetSongId) => {
            if (
              isGroupLeader &&
              effectiveGroup?.id &&
              layeredRehearsalResult &&
              layeredRehearsalResult.activeLayer !== 'personal-instrument' &&
              layeredRehearsalResult.activeLayer !== 'catalog'
            ) {
              await handleResetChurchArrangement();
              return;
            }
            const next = removePersonalInstrumentArrangement(
              targetSongId,
              rehearsalInstrument
            );
            setPersonalArrangements(next);
            setFeedbackBanner({
              type: 'success',
              message: `Reset your personal ${rehearsalInstrument.toUpperCase()} chords back to the original chart.`,
            });
          }}
          onProposeToLeader={
            effectiveGroup?.id
              ? isGroupLeader
                ? rehearsalInstrument !== 'general'
                  ? async ({ chordPro, arrangementNote }) => {
                      const { group: updatedGroup } =
                        await saveTeamSongArrangementDirect(effectiveGroup.id, {
                          songId: baseCatalogSong.id,
                          songTitle: baseCatalogSong.title,
                          instrument: rehearsalInstrument,
                          chordPro,
                          arrangementNote:
                            arrangementNote ||
                            `Leader ${rehearsalInstrument} arrangement`,
                        });
                      setLiveGroup(updatedGroup);
                      const nextPersonal = removePersonalInstrumentArrangement(
                        baseCatalogSong.id,
                        rehearsalInstrument
                      );
                      setPersonalArrangements(nextPersonal);
                      setPreferredLayer('auto');
                      setIsQuickEditMode(false);
                      setIsArrangementBannerHidden(true);
                      setFeedbackBanner({
                        type: 'success',
                        message: `Published arrangement directly to ${effectiveGroup.name} (${rehearsalInstrument.toUpperCase()} Chords)!`,
                      });
                    }
                  : undefined
                : async ({ chordPro, arrangementNote }) => {
                    const next = savePersonalInstrumentArrangement({
                      songId: baseCatalogSong.id,
                      songTitle: baseCatalogSong.title,
                      instrument: rehearsalInstrument,
                      chordPro,
                      arrangementNote:
                        arrangementNote ||
                        `My ${rehearsalInstrument} rehearsal chords`,
                      updatedBy: user?.id || 'local-user',
                      updatedByName: user?.displayName || 'Musician',
                    });
                    setPersonalArrangements(next);
                    const { group: updatedGroup } =
                      await proposeTeamSongArrangement(effectiveGroup.id, {
                        songId: baseCatalogSong.id,
                        songTitle: baseCatalogSong.title,
                        instrument: rehearsalInstrument,
                        chordPro,
                        arrangementNote,
                      });
                    setLiveGroup(updatedGroup);
                    setFeedbackBanner({
                      type: 'success',
                      message: `Saved & proposed your ${rehearsalInstrument.toUpperCase()} arrangement to your Worship Leader!`,
                    });
                  }
              : undefined
          }
          proposeActionLabel={
            isGroupLeader
              ? `Publish to Church ${rehearsalInstrument.toUpperCase()} (Church Only)`
              : `Submit ${rehearsalInstrument.toUpperCase()} Chords to Leader`
          }
          latestProposalStatus={myLatestProposalForInstrument?.status}
          latestProposalReviewNote={myLatestProposalForInstrument?.reviewNote}
          onDismissProposal={
            myLatestProposalForInstrument
              ? async () => {
                  await handleDismissMemberArrangementProposal(
                    myLatestProposalForInstrument.id
                  );
                }
              : undefined
          }
          onSaveCopyToMySongs={async (customSong) => {
            await saveCustomSong(customSong);
          }}
        />
      )}

      {/* Floating Practice Audio Recording & Review Dock */}
      {displaySong && (
        <PracticeDock
          songSlug={displaySong.slug}
          songTitle={displaySong.title}
          songArtist={displaySong.artist}
          currentKey={displayedKey}
          currentCapo={selectedCapo}
        />
      )}

      {/* Admin Global Song Removal Modal */}
      {showAdminRemoveModal && activeSourceSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-rose-500/30 bg-[#101014] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              <span>Remove Song Globally</span>
            </h3>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Are you sure you want to remove <strong className="text-[var(--text-primary)]">&ldquo;{activeSourceSong.title}&rdquo;</strong> from the global public catalog?
              It will immediately disappear from the public catalog for all users worldwide.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Reason for Removal (Logged in admin records)
              </label>
              <textarea
                rows={3}
                value={adminRemoveReason}
                onChange={(e) => setAdminRemoveReason(e.target.value)}
                placeholder="e.g. Inappropriate lyrics, chord inaccuracy, or duplicate."
                className="w-full p-3 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-rose-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowAdminRemoveModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdminConfirmRemove}
                disabled={isAdminRemoving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-rose-600/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isAdminRemoving ? 'Removing...' : 'Confirm Global Removal'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
