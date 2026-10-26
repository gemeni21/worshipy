'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Mic,
  Search,
  BookOpen,
  FileMusic,
  Clock,
  Sparkles,
  ArrowRight,
  Music2,
  Trash2,
  Filter,
  Upload,
  Link2,
  X,
  Check,
  AlertCircle,
  Plus,
} from 'lucide-react';
import {
  PracticeTake,
  getAllPracticeTakes,
  deletePracticeTake,
  savePracticeTake,
  transformCloudAudioUrl,
  extractAudioWaveformAndDuration,
} from '@/lib/audio/practiceStorage';
import { getAllSongs } from '@/lib/catalog/songCatalog';
import { PracticeWaveformPlayer } from '@/components/practice/PracticeWaveformPlayer';

export default function PracticeStudioPage() {
  const [takes, setTakes] = useState<PracticeTake[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSongFilter, setSelectedSongFilter] = useState<string>('all');

  // Modals & Upload State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedSongSlug, setSelectedSongSlug] = useState('goodness-of-god');
  const [selectedSongKey, setSelectedSongKey] = useState('G');

  // Link Modal Inputs
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNotes, setLinkNotes] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  // Upload Modal State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState('');
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const catalogSongs = useMemo(() => getAllSongs(), []);

  const loadAll = async () => {
    setIsLoading(true);
    const all = await getAllPracticeTakes();
    setTakes(all);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleDeleteTake = async (id: string) => {
    await deletePracticeTake(id);
    await loadAll();
  };

  // Distinct songs that have takes
  const uniqueSongs = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }>();
    takes.forEach((t) => {
      if (!map.has(t.songSlug)) {
        map.set(t.songSlug, { slug: t.songSlug, title: t.songTitle });
      }
    });
    return Array.from(map.values());
  }, [takes]);

  // Filtered takes
  const filteredTakes = useMemo(() => {
    return takes.filter((take) => {
      const matchSearch =
        searchQuery.trim() === '' ||
        take.songTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        take.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (take.notes && take.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchSong =
        selectedSongFilter === 'all' || take.songSlug === selectedSongFilter;

      return matchSearch && matchSong;
    });
  }, [takes, searchQuery, selectedSongFilter]);

  // Total rehearsal time in minutes & seconds
  const totalSeconds = useMemo(() => {
    return takes.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
  }, [takes]);

  const formatTotalTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    if (mins === 0) return `${remainingSecs}s`;
    return `${mins}m ${remainingSecs}s`;
  };

  // Handle Cloud Link Save
  const handleSaveCloudLink = async () => {
    setLinkError(null);
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      setLinkError('Please enter an audio link or Google Drive share URL.');
      return;
    }

    const transform = transformCloudAudioUrl(trimmed);
    if (!transform.streamUrl) {
      setLinkError('Invalid URL. Make sure it begins with https://.');
      return;
    }

    const song = catalogSongs.find((s) => s.slug === selectedSongSlug);
    const songTitle = song ? song.title : 'Custom Practice';
    const songArtist = song?.artist;

    const providerLabel =
      transform.provider === 'gdrive'
        ? 'Google Drive'
        : transform.provider === 'dropbox'
        ? 'Dropbox'
        : 'Cloud Audio';

    const newTake: PracticeTake = {
      id: `take_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      songSlug: selectedSongSlug,
      songTitle,
      songArtist,
      key: selectedSongKey,
      durationSeconds: 180,
      createdAt: Date.now(),
      audioUrl: transform.streamUrl,
      sourceType: 'link',
      fileName: `${providerLabel} Audio Link`,
      mimeType: 'audio/mpeg',
      notes: linkNotes.trim() || `Linked via ${providerLabel}`,
      waveformPeaks: Array(64).fill(0.35),
    };

    await savePracticeTake(newTake);
    setShowLinkModal(false);
    setLinkUrl('');
    setLinkNotes('');
    await loadAll();
  };

  // Handle File Upload Save
  const handleSaveUpload = async () => {
    if (!uploadFile) {
      setUploadError('Please select an audio file to upload.');
      return;
    }

    setIsProcessingUpload(true);
    setUploadError(null);

    try {
      const { durationSeconds, waveformPeaks } = await extractAudioWaveformAndDuration(uploadFile);
      const song = catalogSongs.find((s) => s.slug === selectedSongSlug);
      const songTitle = song ? song.title : 'Custom Practice';
      const songArtist = song?.artist;

      const newTake: PracticeTake = {
        id: `take_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        songSlug: selectedSongSlug,
        songTitle,
        songArtist,
        key: selectedSongKey,
        durationSeconds,
        createdAt: Date.now(),
        blob: uploadFile,
        sourceType: 'upload',
        fileName: uploadFile.name,
        mimeType: uploadFile.type || 'audio/mpeg',
        notes: uploadNotes.trim() || `Uploaded file: ${uploadFile.name}`,
        waveformPeaks,
      };

      await savePracticeTake(newTake);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadNotes('');
      await loadAll();
    } catch (err) {
      console.error('Upload processing error:', err);
      setUploadError('Failed to read or decode audio file.');
    } finally {
      setIsProcessingUpload(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/25 mb-2">
            <Mic className="w-3.5 h-3.5" />
            <span>Practice & Rehearsal Studio</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">
            Practice Takes
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Review recorded audio, upload rehearsal takes, or link Google Drive audio directly to your songs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Upload Button */}
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--brand-accent)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] transition-all cursor-pointer shadow-sm"
          >
            <Upload className="w-4 h-4 text-blue-400" />
            <span>Upload Audio</span>
          </button>

          {/* Link Cloud Button */}
          <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--brand-accent)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] transition-all cursor-pointer shadow-sm"
          >
            <Link2 className="w-4 h-4 text-purple-400" />
            <span>Link Google Drive</span>
          </button>

          {/* Pick Song Button */}
          <Link
            href="/songs"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-xs sm:text-sm shadow-sm transition-all"
          >
            <BookOpen className="w-4 h-4" />
            <span>Songs Catalog</span>
          </Link>
        </div>
      </div>

      {/* Practice Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <Mic className="w-4 h-4 text-rose-400" />
            <span>Recorded Takes</span>
          </div>
          <div className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
            {takes.length}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <Music2 className="w-4 h-4 text-[var(--brand-accent)]" />
            <span>Songs Practiced</span>
          </div>
          <div className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
            {uniqueSongs.length}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Total Practice Time</span>
          </div>
          <div className="text-2xl font-extrabold text-[var(--text-primary)] mt-1">
            {formatTotalTime(totalSeconds)}
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      {takes.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by song name, key, or notes..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-accent)]"
            />
          </div>

          {/* Song Dropdown Filter */}
          {uniqueSongs.length > 1 && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
              <select
                value={selectedSongFilter}
                onChange={(e) => setSelectedSongFilter(e.target.value)}
                className="text-xs p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)] cursor-pointer"
              >
                <option value="all">All Songs ({takes.length})</option>
                {uniqueSongs.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Takes List / Empty State */}
      {isLoading ? (
        <div className="p-12 text-center text-sm text-[var(--text-secondary)]">
          Loading your practice recordings...
        </div>
      ) : takes.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-4">
          <div className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <Mic className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-lg font-extrabold text-[var(--text-primary)]">
              No practice takes yet
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              You can record directly with your microphone while reading chords, upload an audio file from your phone or laptop, or link a Google Drive rehearsal recording.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--bg-subtle)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] text-[var(--text-primary)]"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>Upload Audio</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--bg-subtle)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] text-[var(--text-primary)]"
            >
              <Link2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Link Google Drive</span>
            </button>
            <Link
              href="/songs/goodness-of-god"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--brand-accent)] text-[#0c0c10] shadow-sm hover:opacity-95"
            >
              <span>Practice &ldquo;Goodness of God&rdquo;</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : filteredTakes.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm text-[var(--text-secondary)]">
          No practice takes match your search query &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTakes.map((take) => (
            <div key={take.id} className="relative">
              <PracticeWaveformPlayer
                take={take}
                onDelete={handleDeleteTake}
                onNotesUpdated={loadAll}
              />
              <div className="mt-1 flex items-center justify-end px-2">
                <Link
                  href={`/songs/${take.songSlug}`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--brand-accent)] hover:underline"
                >
                  <span>Open Chord Chart</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* UPLOAD AUDIO MODAL */}
      {showUploadModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" />
                Upload Practice Audio
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {uploadError && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="space-y-3">
              {/* Song Selector */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Assign to Song
                </label>
                <select
                  value={selectedSongSlug}
                  onChange={(e) => {
                    setSelectedSongSlug(e.target.value);
                    const s = catalogSongs.find((song) => song.slug === e.target.value);
                    if (s) setSelectedSongKey(s.originalKey);
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)] cursor-pointer"
                >
                  {catalogSongs.map((song) => (
                    <option key={song.slug} value={song.slug}>
                      {song.title} ({song.originalKey})
                    </option>
                  ))}
                </select>
              </div>

              {/* Key Practiced */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Key Practiced
                </label>
                <input
                  type="text"
                  value={selectedSongKey}
                  onChange={(e) => setSelectedSongKey(e.target.value)}
                  placeholder="e.g. G, Bb, D"
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              {/* File Drop / Select Area */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Audio File (.mp3, .wav, .m4a, .webm, .aac)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setUploadFile(f);
                  }}
                  className="w-full text-xs p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[var(--brand-accent)] file:text-[#0c0c10] cursor-pointer"
                />
                {uploadFile && (
                  <p className="text-[11px] text-emerald-400 font-medium">
                    Selected: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Practice Notes (Optional)
                </label>
                <input
                  type="text"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="e.g. rehearsal take 1, acoustic guitar practice..."
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                }}
                className="px-3 py-1.5 rounded-xl text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUpload}
                disabled={!uploadFile || isProcessingUpload}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--brand-accent)] text-[#0c0c10] shadow-sm hover:opacity-95 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isProcessingUpload ? 'Decoding...' : 'Save Upload'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LINK CLOUD AUDIO MODAL */}
      {showLinkModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                <Link2 className="w-4 h-4 text-purple-400" />
                Link Google Drive or Cloud Audio
              </h3>
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
              {/* Song Selector */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Assign to Song
                </label>
                <select
                  value={selectedSongSlug}
                  onChange={(e) => {
                    setSelectedSongSlug(e.target.value);
                    const s = catalogSongs.find((song) => song.slug === e.target.value);
                    if (s) setSelectedSongKey(s.originalKey);
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)] cursor-pointer"
                >
                  {catalogSongs.map((song) => (
                    <option key={song.slug} value={song.slug}>
                      {song.title} ({song.originalKey})
                    </option>
                  ))}
                </select>
              </div>

              {/* Audio URL */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Audio URL or Google Drive Share Link
                </label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... or audio URL"
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-accent)]"
                />
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Supports Google Drive, Dropbox, OneDrive, and direct audio files (.mp3, .wav, .m4a).
                </p>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Notes / Label (Optional)
                </label>
                <input
                  type="text"
                  value={linkNotes}
                  onChange={(e) => setLinkNotes(e.target.value)}
                  placeholder="e.g. Sunday rehearsal run-through..."
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-accent)]"
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
    </div>
  );
}
