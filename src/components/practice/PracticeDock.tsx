'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  Trash2,
  Check,
  History,
  X,
  Sparkles,
  AlertCircle,
  FileMusic,
  Upload,
  Link2,
} from 'lucide-react';
import {
  practiceAudioRecorder,
  PracticeRecorderState,
  PracticeRecordingResult,
} from '@/lib/audio/practiceRecorder';
import {
  PracticeTake,
  savePracticeTake,
  getPracticeTakesForSong,
  deletePracticeTake,
  transformCloudAudioUrl,
  extractAudioWaveformAndDuration,
} from '@/lib/audio/practiceStorage';
import { PracticeWaveformPlayer } from './PracticeWaveformPlayer';

interface PracticeDockProps {
  songSlug: string;
  songTitle: string;
  songArtist?: string;
  currentKey: string;
  currentCapo?: number;
}

export function PracticeDock({
  songSlug,
  songTitle,
  songArtist,
  currentKey,
  currentCapo = 0,
}: PracticeDockProps) {
  const [recorderState, setRecorderState] = useState<PracticeRecorderState>({
    status: 'idle',
    durationSeconds: 0,
    volumeLevel: 0,
  });

  const [takes, setTakes] = useState<PracticeTake[]>([]);
  const [pendingResult, setPendingResult] = useState<PracticeRecordingResult | null>(null);
  const [pendingTitle, setPendingTitle] = useState(songTitle);
  const [pendingNotes, setPendingNotes] = useState('');
  const [pendingCreatedAt, setPendingCreatedAt] = useState(0);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Link cloud audio modal state
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkNotesInput, setLinkNotesInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Subscribe to recorder engine state
  useEffect(() => {
    const unsub = practiceAudioRecorder.subscribe((state) => {
      setRecorderState(state);
    });
    return () => unsub();
  }, []);

  // Load past takes for this song
  const refreshTakes = useCallback(async () => {
    if (!songSlug) return;
    const loaded = await getPracticeTakesForSong(songSlug);
    setTakes(loaded);
  }, [songSlug]);

  useEffect(() => {
    let active = true;
    if (songSlug) {
      getPracticeTakesForSong(songSlug).then((loaded) => {
        if (active) {
          setTakes(loaded);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [songSlug]);

  // Start microphone recording
  const handleStart = async () => {
    setMicErrorMessage(null);
    try {
      await practiceAudioRecorder.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied or unavailable.';
      setMicErrorMessage(msg);
    }
  };

  const handlePauseToggle = () => {
    if (recorderState.status === 'recording') {
      practiceAudioRecorder.pause();
    } else if (recorderState.status === 'paused') {
      practiceAudioRecorder.resume();
    }
  };

  const handleStopAndReview = async () => {
    const res = await practiceAudioRecorder.stop();
    if (res && res.blob.size > 0) {
      setPendingResult(res);
      setPendingTitle(songTitle);
      setPendingNotes('');
      setPendingCreatedAt(Date.now());
    }
  };

  const handleDiscardCurrent = () => {
    practiceAudioRecorder.discard();
    setMicErrorMessage(null);
  };

  const handleSavePending = async () => {
    if (!pendingResult) return;
    setIsSaving(true);

    const newTake: PracticeTake = {
      id: `take_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      songSlug,
      songTitle: pendingTitle.trim() || songTitle,
      songArtist,
      key: currentKey,
      capo: currentCapo > 0 ? currentCapo : undefined,
      durationSeconds: pendingResult.durationSeconds,
      createdAt: Date.now(),
      blob: pendingResult.blob,
      sourceType: 'recording',
      mimeType: pendingResult.mimeType,
      notes: pendingNotes.trim() ? pendingNotes.trim() : undefined,
      waveformPeaks: pendingResult.waveformPeaks,
    };

    await savePracticeTake(newTake);
    setPendingResult(null);
    setPendingNotes('');
    setIsSaving(false);
    await refreshTakes();
  };

  // Upload local audio file
  const handleTriggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { durationSeconds, waveformPeaks } = await extractAudioWaveformAndDuration(file);

      const newTake: PracticeTake = {
        id: `take_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        songSlug,
        songTitle,
        songArtist,
        key: currentKey,
        capo: currentCapo > 0 ? currentCapo : undefined,
        durationSeconds,
        createdAt: Date.now(),
        blob: file,
        sourceType: 'upload',
        fileName: file.name,
        mimeType: file.type || 'audio/mpeg',
        notes: `Uploaded file: ${file.name}`,
        waveformPeaks,
      };

      await savePracticeTake(newTake);
      await refreshTakes();
      setShowHistoryModal(true);
    } catch (err) {
      console.error('File upload error:', err);
      setMicErrorMessage('Failed to read or process audio file.');
    } finally {
      setIsUploading(false);
    }
  };

  // Save linked cloud audio (Google Drive / Dropbox / URL)
  const handleSaveCloudLink = async () => {
    setLinkError(null);
    const trimmed = linkUrlInput.trim();
    if (!trimmed) {
      setLinkError('Please enter a valid audio link or Google Drive share URL.');
      return;
    }

    const transform = transformCloudAudioUrl(trimmed);
    if (!transform.streamUrl) {
      setLinkError('Invalid URL. Make sure it begins with https://.');
      return;
    }

    const providerLabel =
      transform.provider === 'gdrive'
        ? 'Google Drive Audio'
        : transform.provider === 'dropbox'
        ? 'Dropbox Audio'
        : transform.provider === 'onedrive'
        ? 'OneDrive Audio'
        : 'Web Audio Stream';

    const newTake: PracticeTake = {
      id: `take_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      songSlug,
      songTitle,
      songArtist,
      key: currentKey,
      capo: currentCapo > 0 ? currentCapo : undefined,
      durationSeconds: 180, // Default duration, dynamically resolved when played
      createdAt: Date.now(),
      audioUrl: transform.streamUrl,
      sourceType: 'link',
      fileName: providerLabel,
      mimeType: 'audio/mpeg',
      notes: linkNotesInput.trim() || `Linked via ${providerLabel}`,
      waveformPeaks: Array(64).fill(0.35),
    };

    await savePracticeTake(newTake);
    setShowLinkModal(false);
    setLinkUrlInput('');
    setLinkNotesInput('');
    await refreshTakes();
    setShowHistoryModal(true);
  };

  const handleDeleteTake = async (id: string) => {
    await deletePracticeTake(id);
    await refreshTakes();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isRecording = recorderState.status === 'recording';
  const isPaused = recorderState.status === 'paused';
  const isActive = isRecording || isPaused;

  return (
    <>
      {/* Hidden File Input for Audio Uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* 1. Floating Practice Dock (Bottom Center) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[calc(100%-2rem)] select-none">
        {/* Error Notification Bubble */}
        {micErrorMessage && (
          <div className="mb-2 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{micErrorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setMicErrorMessage(null)}
              className="p-1 rounded-md hover:bg-rose-500/20 text-rose-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ACTIVE RECORDING BAR */}
        {isActive ? (
          <div className="flex items-center justify-between gap-3 p-3 sm:px-4 rounded-2xl border border-rose-500/40 bg-[var(--bg-surface)]/95 shadow-2xl backdrop-blur-xl ring-2 ring-rose-500/20 transition-all">
            {/* Left: REC indicator & Timer */}
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center">
                <span
                  className={`w-3 h-3 rounded-full ${
                    isRecording ? 'bg-rose-500 animate-ping opacity-75' : 'bg-amber-500'
                  }`}
                />
                <span
                  className={`absolute w-2.5 h-2.5 rounded-full ${
                    isRecording ? 'bg-rose-500' : 'bg-amber-500'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center gap-1.5 font-mono text-sm font-extrabold text-[var(--text-primary)]">
                  <span>{formatTimer(recorderState.durationSeconds)}</span>
                  <span className="text-[10px] font-sans font-bold px-1.5 py-0.2 rounded uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/20">
                    {isPaused ? 'Paused' : 'REC'}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-secondary)]">
                  Key of {currentKey}
                  {currentCapo > 0 ? ` • Capo ${currentCapo}` : ''}
                </div>
              </div>
            </div>

            {/* Center: Live Audio VU Level Bars */}
            <div className="hidden sm:flex items-center gap-[3px] h-6 px-3 bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-subtle)]">
              {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, idx) => {
                const isLit = isRecording && recorderState.volumeLevel >= threshold * 0.7;
                return (
                  <div
                    key={idx}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      isLit
                        ? idx >= 3
                          ? 'bg-amber-400 h-5'
                          : 'bg-emerald-400 h-4'
                        : 'bg-[var(--border-strong)] h-1.5'
                    }`}
                  />
                );
              })}
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2">
              {/* Pause / Resume */}
              <button
                type="button"
                onClick={handlePauseToggle}
                title={isPaused ? 'Resume Recording' : 'Pause Recording'}
                className="p-2 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-subtle)]/80 text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
              </button>

              {/* Stop & Review */}
              <button
                type="button"
                onClick={handleStopAndReview}
                title="Finish & Review Practice Take"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-rose-500 hover:bg-rose-600 text-white shadow-md hover:scale-102 active:scale-98 transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Finish</span>
              </button>

              {/* Discard */}
              <button
                type="button"
                onClick={handleDiscardCurrent}
                title="Discard Take"
                className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* COLLAPSED FLOATING DOCK */
          <div className="flex items-center justify-between gap-2 p-2 px-3 sm:px-4 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 shadow-xl backdrop-blur-xl hover:border-[var(--brand-accent)]/50 transition-all">
            {/* Left: Quick Record Button */}
            <button
              type="button"
              data-practice-record-btn="true"
              onClick={handleStart}
              className="group flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--brand-accent)] transition-colors cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-rose-500/15 text-rose-500 border border-rose-500/30 group-hover:bg-rose-500 group-hover:text-white transition-all">
                <Mic className="w-3.5 h-3.5" />
              </div>
              <span className="hidden xs:inline">Record Take</span>
            </button>

            {/* Quick Upload Button */}
            <button
              type="button"
              onClick={handleTriggerUpload}
              disabled={isUploading}
              title="Upload Audio File (mp3, wav, m4a)"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--brand-accent)] border border-transparent transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isUploading ? 'Processing...' : 'Upload'}</span>
            </button>

            {/* Quick Link Cloud Audio Button */}
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              title="Link Google Drive or Cloud Audio"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--brand-accent)] border border-transparent transition-colors cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Link Cloud</span>
            </button>

            {/* Right: Key indicator & Past Takes Badge */}
            <div className="flex items-center gap-2 text-xs">
              <span className="hidden md:inline font-mono text-[11px] text-[var(--text-secondary)] px-2 py-0.5 rounded-md bg-[var(--bg-subtle)]">
                {currentKey}
                {currentCapo > 0 ? ` (Capo ${currentCapo})` : ''}
              </span>

              <button
                type="button"
                data-practice-takes-btn="true"
                onClick={() => setShowHistoryModal(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  takes.length > 0
                    ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10]'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>
                  {takes.length === 0 ? 'Takes' : `${takes.length} Take${takes.length > 1 ? 's' : ''}`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. PENDING REVIEW MODAL (Triggered immediately when take is finished) */}
      {pendingResult && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--brand-accent)]" />
                  Review Practice Take
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Key of {currentKey}
                  {currentCapo > 0 ? ` • Capo ${currentCapo}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingResult(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Song Title Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)] block">
                Song Title
              </label>
              <input
                type="text"
                value={pendingTitle}
                onChange={(e) => setPendingTitle(e.target.value)}
                placeholder="Song title..."
                className="w-full text-xs font-bold p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--brand-accent)]"
              />
            </div>

            {/* Audio Preview Waveform Player */}
            <PracticeWaveformPlayer
              take={{
                id: 'preview',
                songSlug,
                songTitle: pendingTitle.trim() || songTitle,
                songArtist,
                key: currentKey,
                capo: currentCapo > 0 ? currentCapo : undefined,
                durationSeconds: pendingResult.durationSeconds,
                createdAt: pendingCreatedAt,
                blob: pendingResult.blob,
                sourceType: 'recording',
                mimeType: pendingResult.mimeType,
                waveformPeaks: pendingResult.waveformPeaks,
              }}
              compact
            />

            {/* Musician Notes Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)] block">
                Practice Notes / Rehearsal Markers (Optional)
              </label>
              <textarea
                value={pendingNotes}
                onChange={(e) => setPendingNotes(e.target.value)}
                placeholder="e.g. vocal transition smooth, practice bridge acoustic strumming..."
                rows={2}
                className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--brand-accent)]"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingResult(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                Discard Take
              </button>
              <button
                type="button"
                onClick={handleSavePending}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[var(--brand-accent)] text-[#0c0c10] shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save to Practice Takes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. LINK CLOUD AUDIO MODAL (Google Drive, Dropbox, Direct URLs) */}
      {showLinkModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[var(--brand-accent)]" />
                  Link Cloud Practice Audio
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Connect Google Drive, Dropbox, or any web audio link to this song.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {linkError && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{linkError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Audio URL or Google Drive Link
                </label>
                <input
                  type="url"
                  value={linkUrlInput}
                  onChange={(e) => setLinkUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... or direct audio URL"
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--brand-accent)]"
                />
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Tip: For Google Drive, ensure sharing is set to &ldquo;Anyone with the link can view&rdquo;.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Notes / Label (Optional)
                </label>
                <input
                  type="text"
                  value={linkNotesInput}
                  onChange={(e) => setLinkNotesInput(e.target.value)}
                  placeholder="e.g. Band rehearsal full run-through from Oct 26"
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCloudLink}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--brand-accent)] text-[#0c0c10] shadow-sm hover:opacity-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save Audio Link</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. PRACTICE TAKES HISTORY DRAWER / MODAL */}
      {showHistoryModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/20">
                  <FileMusic className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                    Practice Takes
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {songTitle} • {takes.length} take{takes.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center gap-2 pb-1 border-b border-[var(--border-subtle)]/60 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowHistoryModal(false);
                  handleStart();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Record New</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerUpload}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] border border-[var(--border-subtle)] text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Audio</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowHistoryModal(false);
                  setShowLinkModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] border border-[var(--border-subtle)] text-[var(--text-primary)] transition-all cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Link Google Drive</span>
              </button>
            </div>

            {/* Takes List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {takes.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                    <Mic className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      No practice takes yet
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto mt-1">
                      Record a take with your mic, upload an audio file from your device, or paste a Google Drive link.
                    </p>
                  </div>
                </div>
              ) : (
                takes.map((take) => (
                  <PracticeWaveformPlayer
                    key={take.id}
                    take={take}
                    onDelete={handleDeleteTake}
                    onNotesUpdated={refreshTakes}
                    onTitleUpdated={refreshTakes}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Saved locally in device IndexedDB (100% offline)</span>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
