'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Download,
  Edit3,
  FileCode2,
  FilePlus2,
  FileUp,
  FolderHeart,
  Heart,
  Info,
  Music,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { CustomSongEditor } from '@/components/songs/CustomSongEditor';
import {
  MAX_CHORDPRO_SIZE_BYTES,
  parseChordPro,
  SUPPORTED_CHORDPRO_EXTENSIONS,
  type ChordProParseResult,
} from '@/lib/chordpro/chordPro';
import { downloadSongAsChordPro } from '@/lib/chordpro/chordProDownload';
import { searchAndFilterSongs } from '@/lib/catalog/songCatalog';
import type { SongRecord } from '@/types/song';

const SAMPLE_CHORDPRO_TEXT = `{title: Sa Iyong Presensya (In Your Presence)}
{subtitle: Acoustic Worship Arrangement}
{artist: Local Church Music Ministry}
{composer: Elena Reyes, Marco Dizon}
{key: G}
{tempo: 74}
{time: 4/4}
{capo: 2}
{meta: language fil}
{meta: category filipino-worship}
{copyright: © 2026 Local Church Music Ministry (Original Composition)}

{start_of_intro: Intro}
{comment: Acoustic guitar & warm pad}
[G] [D/F#] [Em7] [Cadd9]
{end_of_intro}

{start_of_verse: Verse 1}
[G]Sa bawat umaga [D/F#]biyaya Mo'y tapat
[Em7]Puso nami'y umaawit [Cadd9]sa Iyong habag
[G]We gather in Your [D/F#]light today
[Am7]And lift our hands in [Dsus4]praise [D]
{end_of_verse}

{start_of_chorus: Chorus}
{comment: Full band enters}
[G]Tapat Ka Panginoon [D/F#]sa habang panahon
[Em7]Sa Iyong presensya [Cadd9]may kapayapaan ngayon
[G/B]Banal ang ngalan [C]Mo, [Dsus4]Hesus [G]
{end_of_chorus}

{start_of_bridge: Bridge}
{comment: Repeat twice — build gradually}
[Cadd9]Wala nang hihigit [D]sa pag-ibig Mo
[Em7]Ikaw ang sandigan [G/B]ng buhay ko
{end_of_bridge}`;

type WorkspaceMode = 'list' | 'create' | 'edit' | 'import' | 'edit-import';

export default function MySongsPage() {
  const {
    customSongs,
    saveCustomSong,
    deleteCustomSong,
    isFavorite,
    toggleFavorite,
    isSongSavedOffline,
  } = useApp();

  const [mode, setMode] = useState<WorkspaceMode>('list');
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Status banner
  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // ChordPro Import Modal / Panel State
  const [chordProText, setChordProText] = useState('');
  const [importedFileName, setImportedFileName] = useState<string | undefined>(
    undefined
  );
  const [fileReadError, setFileReadError] = useState<string | null>(null);
  const [importRightsChecked, setImportRightsChecked] = useState(false);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Draft passed from ChordPro Import -> Manual Editor
  const [importedDraftRecord, setImportedDraftRecord] =
    useState<SongRecord | null>(null);
  const [importedDraftWarnings, setImportedDraftWarnings] = useState<string[]>(
    []
  );

  // Support ?edit=<songId> or ?action=create or ?action=import from URL on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const editParam = params.get('edit');
      const actionParam = params.get('action');
      if (editParam) {
        const found = customSongs.find(
          (s) => s.id === editParam || s.slug === editParam
        );
        if (found) {
          queueMicrotask(() => {
            setEditingSongId(found.id);
            setMode('edit');
          });
        }
      } else if (actionParam === 'create') {
        queueMicrotask(() => setMode('create'));
      } else if (actionParam === 'import') {
        queueMicrotask(() => setMode('import'));
      }
    } catch {
      // ignore
    }
  }, [customSongs]);

  // Auto-dismiss transient success banners
  useEffect(() => {
    if (!banner || banner.type === 'error') return;
    const timer = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const filteredCustomSongs = useMemo(
    () =>
      searchAndFilterSongs(customSongs, {
        query: searchQuery,
        sourceType: 'custom',
      }),
    [customSongs, searchQuery]
  );

  const editingSong = useMemo(
    () => customSongs.find((s) => s.id === editingSongId),
    [customSongs, editingSongId]
  );

  // Live ChordPro parse preview when in 'import' mode
  const parsedImportPreview = useMemo((): ChordProParseResult | null => {
    if (mode !== 'import' || !chordProText.trim()) return null;
    return parseChordPro(chordProText, { fileName: importedFileName });
  }, [mode, chordProText, importedFileName]);

  const duplicateExistingForImport = useMemo(() => {
    const draftTitle = parsedImportPreview?.draft?.title?.trim().toLowerCase();
    if (!draftTitle) return undefined;
    return customSongs.find(
      (s) => s.title.trim().toLowerCase() === draftTitle
    );
  }, [parsedImportPreview, customSongs]);

  const handleFileUploadChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFileReadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      setFileReadError(
        `The selected file "${file.name}" is empty (0 bytes). Choose a file containing ChordPro text.`
      );
      return;
    }

    if (file.size > MAX_CHORDPRO_SIZE_BYTES) {
      setFileReadError(
        `The file "${file.name}" (${Math.round(
          file.size / 1024
        )} KB) exceeds the ${Math.round(
          MAX_CHORDPRO_SIZE_BYTES / 1024
        )} KB size limit.`
      );
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const text = decoder.decode(buffer);
      setImportedFileName(file.name);
      setChordProText(text);
    } catch {
      setFileReadError(
        `Could not read "${file.name}" as UTF-8 text. Please ensure the file is a plain-text ChordPro (.cho, .chopro, .crd, .pro, .txt) file.`
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleOpenImportInEditor = () => {
    if (!parsedImportPreview?.ok || !parsedImportPreview.draft) return;
    setImportedDraftRecord({
      ...parsedImportPreview.draft,
      rightsAcknowledged: importRightsChecked,
    });
    setImportedDraftWarnings(parsedImportPreview.warnings);
    setMode('edit-import');
  };

  const handleDirectSaveImportedSong = async (
    replaceExistingSong?: SongRecord
  ) => {
    if (!parsedImportPreview?.ok || !parsedImportPreview.draft) return;
    if (!importRightsChecked) {
      setFileReadError(
        'Please acknowledge the content and rights responsibility checkbox before saving this imported song.'
      );
      return;
    }

    setIsSavingImport(true);
    setFileReadError(null);

    try {
      const draft = parsedImportPreview.draft;
      const finalRecord: SongRecord = replaceExistingSong
        ? {
            ...draft,
            id: replaceExistingSong.id,
            slug: replaceExistingSong.slug,
            createdAt: replaceExistingSong.createdAt || draft.createdAt,
            updatedAt: new Date().toISOString(),
            rightsAcknowledged: true,
          }
        : {
            ...draft,
            rightsAcknowledged: true,
          };

      const res = await saveCustomSong(finalRecord);
      if (res.ok && res.song) {
        setChordProText('');
        setImportedFileName(undefined);
        setImportRightsChecked(false);
        setMode('list');
        setBanner({
          type: 'success',
          message: replaceExistingSong
            ? `Updated "${res.song.title}" from imported ChordPro.`
            : `Imported and saved "${res.song.title}" to My Songs on this device.`,
        });
      } else {
        setFileReadError(
          res.error ?? 'Failed to save imported song to local storage.'
        );
      }
    } finally {
      setIsSavingImport(false);
    }
  };

  const handleSaveFromEditor = async (
    song: SongRecord
  ): Promise<{ ok: boolean; error?: string; song?: SongRecord }> => {
    const res = await saveCustomSong(song);
    if (res.ok && res.song) {
      setMode('list');
      setEditingSongId(null);
      setImportedDraftRecord(null);
      setImportedDraftWarnings([]);
      setBanner({
        type: 'success',
        message: `Saved "${res.song.title}" to My Songs on this device.`,
      });
    }
    return res;
  };

  const handleDeleteSong = async (song: SongRecord) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Delete personal song "${song.title}" from this device? This will also remove it from your local favorites, setlists, and offline cache. Built-in catalog songs are never affected.`
      )
    ) {
      return;
    }

    const res = await deleteCustomSong(song.id);
    if (res.ok) {
      setBanner({
        type: 'success',
        message: `Deleted "${song.title}" from My Songs on this device.`,
      });
    } else {
      setBanner({
        type: 'error',
        message: res.error ?? 'Could not delete custom song.',
      });
    }
  };

  const handleExportSong = (song: SongRecord) => {
    const res = downloadSongAsChordPro(song);
    if (res.ok) {
      setBanner({
        type: 'success',
        message: `Exported "${song.title}" as "${res.filename}" (original stored key: ${song.originalKey}).`,
      });
    } else {
      setBanner({
        type: 'error',
        message: res.error ?? 'Failed to export ChordPro file.',
      });
    }
  };

  // ============================================================================
  // RENDER: MANUAL EDITOR (CREATE / EDIT / REVIEW IMPORT)
  // ============================================================================
  if (mode === 'create' || mode === 'edit' || mode === 'edit-import') {
    const targetInitialSong =
      mode === 'edit'
        ? editingSong
        : mode === 'edit-import'
        ? importedDraftRecord ?? undefined
        : undefined;

    return (
      <div className="space-y-6">
        <CustomSongEditor
          key={
            mode === 'edit'
              ? `edit-${editingSongId}`
              : mode === 'edit-import'
              ? `import-${importedDraftRecord?.id}`
              : 'create-new'
          }
          initialSong={targetInitialSong}
          isImportDraft={mode === 'edit-import'}
          importWarnings={mode === 'edit-import' ? importedDraftWarnings : []}
          existingCustomSongs={customSongs}
          onSave={handleSaveFromEditor}
          onCancel={() => {
            setMode('list');
            setEditingSongId(null);
            setImportedDraftRecord(null);
            setImportedDraftWarnings([]);
          }}
        />
      </div>
    );
  }

  // ============================================================================
  // RENDER: CHORDPRO IMPORT WORKSPACE
  // ============================================================================
  if (mode === 'import') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <header className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
              <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>ChordPro Import (.cho, .chopro, .crd, .chord, .pro)</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Import a ChordPro Song
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Select a local ChordPro file or paste ChordPro text below to
              preview its structure, chords, and lyrics before saving.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setMode('list');
              setFileReadError(null);
            }}
            className="h-10 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Back to My Songs</span>
          </button>
        </header>

        {fileReadError && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2.5"
          >
            <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>{fileReadError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: File Upload & Paste Textarea */}
          <section className="lg:col-span-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold">
                1. Upload File or Paste ChordPro Text
              </h2>
              <button
                type="button"
                onClick={() => {
                  setFileReadError(null);
                  setImportedFileName('sa-iyong-presensya-sample.cho');
                  setChordProText(SAMPLE_CHORDPRO_TEXT);
                }}
                className="text-xs font-semibold text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Load Sample ChordPro</span>
              </button>
            </div>

            {/* File Picker */}
            <div className="rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)] p-4 text-center space-y-2">
              <input
                ref={fileInputRef}
                id="chordpro-file-input"
                type="file"
                accept={SUPPORTED_CHORDPRO_EXTENSIONS.join(',')}
                onChange={handleFileUploadChange}
                className="sr-only"
              />
              <label
                htmlFor="chordpro-file-input"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand-accent)] text-[var(--bg-surface)] text-xs sm:text-sm font-semibold cursor-pointer hover:opacity-95"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>Choose Local ChordPro File</span>
              </label>
              <p className="text-xs text-[var(--text-secondary)]">
                Supports <code className="font-mono">.cho</code>,{' '}
                <code className="font-mono">.chopro</code>,{' '}
                <code className="font-mono">.crd</code>,{' '}
                <code className="font-mono">.chord</code>,{' '}
                <code className="font-mono">.pro</code>, or{' '}
                <code className="font-mono">.txt</code> (up to 256 KB)
              </p>
              {importedFileName && (
                <p className="text-xs font-semibold text-[var(--brand-accent)]">
                  Loaded file: {importedFileName}
                </p>
              )}
            </div>

            {/* Paste Area */}
            <div>
              <label
                htmlFor="chordpro-paste-textarea"
                className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5"
              >
                ChordPro Source Text
              </label>
              <textarea
                id="chordpro-paste-textarea"
                rows={14}
                value={chordProText}
                onChange={(e) => {
                  setFileReadError(null);
                  setChordProText(e.target.value);
                }}
                placeholder={`{title: Amazing Grace}\n{key: G}\n{tempo: 72}\n{time: 3/4}\n\n{start_of_verse: Verse 1}\n[G]Amazing grace how [C]sweet the [G]sound\nThat saved a wretch like [D]me\n{end_of_verse}`}
                className="w-full p-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] font-mono text-xs sm:text-sm leading-relaxed focus:bg-[var(--bg-surface)]"
              />
            </div>

            {/* Supported Directives Reference */}
            <div className="rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-3.5 text-xs text-[var(--text-secondary)] space-y-1">
              <div className="font-semibold text-[var(--text-primary)]">
                Supported ChordPro Subset:
              </div>
              <p>
                Inline chords <code className="font-mono">[G]</code>,{' '}
                <code className="font-mono">[D/F#]</code>,{' '}
                <code className="font-mono">[Cadd9]</code>; metadata{' '}
                <code className="font-mono">
                  {'{title}'}, {'{subtitle}'}, {'{artist}'}, {'{composer}'},{' '}
                  {'{lyricist}'}, {'{key}'}, {'{tempo}'}, {'{time}'}, {'{capo}'}
                </code>
                ; sections{' '}
                <code className="font-mono">
                  {'{start_of_verse}'} / {'{sov}'}, {'{start_of_chorus}'} /{' '}
                  {'{soc}'}, {'{start_of_bridge}'} / {'{sob}'}
                </code>
                ; and comments <code className="font-mono">{'{comment: ...}'}</code>.
                Unrecognized directives are flagged and preserved in Song Notes.
              </p>
            </div>
          </section>

          {/* Right: Live Parsed Preview & Save Actions */}
          <section
            aria-label="Imported Song Preview"
            className="lg:col-span-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
          >
            <h2 className="text-base font-bold">
              2. Parsed Song Preview & Validation
            </h2>

            {!chordProText.trim() ? (
              <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)] p-8 text-center space-y-2 text-xs sm:text-sm text-[var(--text-secondary)]">
                <p className="font-semibold text-[var(--text-primary)]">
                  No ChordPro Content Loaded Yet
                </p>
                <p>
                  Choose a local <code className="font-mono">.cho</code> file,
                  paste ChordPro text on the left, or click{' '}
                  <strong>Load Sample ChordPro</strong> to see an instant preview.
                </p>
              </div>
            ) : parsedImportPreview && !parsedImportPreview.ok ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs sm:text-sm text-rose-700 dark:text-rose-300 font-medium"
              >
                {parsedImportPreview.error}
              </div>
            ) : parsedImportPreview?.draft ? (
              <div className="space-y-4">
                {/* Warnings / Unsupported Directives */}
                {parsedImportPreview.warnings.length > 0 && (
                  <div
                    role="status"
                    className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-1.5 text-xs text-amber-900 dark:text-amber-200"
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle
                        className="w-4 h-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>
                        Import Notices ({parsedImportPreview.warnings.length})
                      </span>
                    </div>
                    <ul className="list-disc pl-4 space-y-1">
                      {parsedImportPreview.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Parsed Metadata Header */}
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-bold">
                        {parsedImportPreview.draft.title}
                      </h3>
                      {parsedImportPreview.draft.subtitle && (
                        <p className="text-xs text-[var(--text-secondary)]">
                          {parsedImportPreview.draft.subtitle}
                        </p>
                      )}
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] font-mono font-bold text-xs">
                      Key: {parsedImportPreview.draft.originalKey}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                    {parsedImportPreview.draft.artist && (
                      <span>Artist: {parsedImportPreview.draft.artist}</span>
                    )}
                    {parsedImportPreview.draft.writers &&
                      parsedImportPreview.draft.writers.length > 0 && (
                        <span>
                          · Writers:{' '}
                          {parsedImportPreview.draft.writers.join(', ')}
                        </span>
                      )}
                    {parsedImportPreview.draft.tempoBpm && (
                      <span>· {parsedImportPreview.draft.tempoBpm} BPM</span>
                    )}
                    {parsedImportPreview.draft.timeSignature && (
                      <span>· {parsedImportPreview.draft.timeSignature}</span>
                    )}
                    {parsedImportPreview.draft.capo !== undefined &&
                      parsedImportPreview.draft.capo > 0 && (
                        <span>· Capo {parsedImportPreview.draft.capo}</span>
                      )}
                  </div>
                </div>

                {/* Parsed Sections Preview */}
                <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
                  {parsedImportPreview.draft.sections.map((sec) => (
                    <div
                      key={sec.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand-accent)]">
                          {sec.label}
                        </span>
                        {sec.cue && (
                          <span className="text-xs italic text-[var(--text-secondary)]">
                            {sec.cue}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 overflow-x-auto">
                        {sec.lines.map((line, lIdx) => (
                          <div key={line.id ?? lIdx} className="space-y-0.5">
                            {line.annotation && (
                              <div className="text-xs italic text-[var(--text-secondary)]">
                                [{line.annotation}]
                              </div>
                            )}
                            <div className="flex flex-wrap items-end leading-snug">
                              {line.segments.map((seg, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="inline-flex flex-col mr-1.5 min-w-[1.25rem]"
                                >
                                  <span className="font-mono font-bold text-xs text-[var(--chord-color)] min-h-[1rem] whitespace-pre">
                                    {seg.chord || '\u00A0'}
                                  </span>
                                  <span className="text-xs sm:text-sm text-[var(--text-primary)] whitespace-pre">
                                    {seg.text || '\u00A0'}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Duplicate Custom Song Handling */}
                {duplicateExistingForImport && (
                  <div className="rounded-xl border border-[var(--brand-accent)] bg-[var(--brand-surface)] p-3.5 text-xs space-y-1.5">
                    <div className="font-bold text-[var(--text-primary)]">
                      A personal song titled &ldquo;
                      {duplicateExistingForImport.title}&rdquo; already exists in
                      My Songs.
                    </div>
                    <p className="text-[var(--text-secondary)]">
                      We never overwrite existing songs automatically. You can
                      save this import as a separate new song, replace your
                      existing personal song, or open it in the editor first.
                    </p>
                  </div>
                )}

                {/* Rights Acknowledgment */}
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3.5 space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={importRightsChecked}
                      onChange={(e) => {
                        setImportRightsChecked(e.target.checked);
                        if (fileReadError) setFileReadError(null);
                      }}
                      className="mt-0.5 w-4 h-4 rounded accent-[var(--brand-accent)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--text-primary)] leading-relaxed">
                      <strong>Rights & Privacy Notice:</strong> I confirm I am
                      responsible for having the right to store and use these
                      lyrics and chords on this device.
                    </span>
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleOpenImportInEditor}
                    className="h-10 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" aria-hidden="true" />
                    <span>Edit Draft Before Saving</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingImport}
                    onClick={() => handleDirectSaveImportedSong(undefined)}
                    className="h-10 px-5 rounded-xl bg-[var(--brand-accent)] text-[var(--bg-surface)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {duplicateExistingForImport
                        ? 'Save as New Song'
                        : 'Save Imported Song'}
                    </span>
                  </button>

                  {duplicateExistingForImport && (
                    <button
                      type="button"
                      disabled={isSavingImport}
                      onClick={() =>
                        handleDirectSaveImportedSong(duplicateExistingForImport)
                      }
                      className="h-10 px-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs font-semibold hover:bg-amber-500/20 cursor-pointer"
                    >
                      Replace Existing &ldquo;
                      {duplicateExistingForImport.title}&rdquo;
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: MY SONGS LANDING PAGE (LIST VIEW)
  // ============================================================================
  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight inline-flex items-center gap-2.5">
              <FolderHeart
                className="w-7 h-7 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>My Songs</span>
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Create your own worship chord charts, import or export ChordPro (
              <code className="font-mono">.cho</code>) files, and transpose them
              with the built-in engine.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setBanner(null);
                setMode('import');
              }}
              className="h-11 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--brand-accent)] text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <FileUp
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>Import ChordPro</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBanner(null);
                setEditingSongId(null);
                setMode('create');
              }}
              className="h-11 px-5 rounded-xl bg-[var(--brand-accent)] text-[var(--bg-surface)] text-xs sm:text-sm font-semibold inline-flex items-center gap-2 hover:opacity-95 transition-opacity cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Create Song</span>
            </button>
          </div>
        </div>

        {/* Device-Local Storage & Rights Explanation */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-xs sm:text-sm text-[var(--text-secondary)] flex items-start gap-2.5">
          <Info
            className="w-4 h-4 text-[var(--brand-accent)] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div>
            <strong className="text-[var(--text-primary)]">
              Stored Locally on This Device (Basic MVP):
            </strong>{' '}
            Personal songs stay separate from the built-in catalog and are saved
            privately in this browser&apos;s storage (IndexedDB + localStorage).
            They do not sync across other devices. Use{' '}
            <strong>Export .cho</strong> to back up or move your personal charts.
          </div>
        </div>
      </header>

      {/* Status Confirmation / Error Banner */}
      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 ${
            banner.type === 'error'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss message"
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search within Personal Songs (shown when user has at least 1 song) */}
      {customSongs.length > 0 && (
        <section
          aria-label="Search Personal Songs"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
        >
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your personal songs by title, artist, writer, attribution, or key..."
              aria-label="Search personal songs"
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm focus:bg-[var(--bg-surface)]"
            />
          </div>
          <div className="text-xs text-[var(--text-secondary)] font-medium shrink-0">
            Showing <strong>{filteredCustomSongs.length}</strong> of{' '}
            {customSongs.length} personal{' '}
            {customSongs.length === 1 ? 'song' : 'songs'}
          </div>
        </section>
      )}

      {/* Personal Songs List or Empty State */}
      {customSongs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 sm:p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--brand-surface)] text-[var(--brand-accent)] flex items-center justify-center mx-auto">
            <FilePlus2 className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-lg font-bold">
              You Haven&apos;t Created Any Personal Songs Yet
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Add original church songs, hymns, or arrangements that aren&apos;t
              in the built-in demo catalog. Every song you create supports instant
              key transposition, Performance Mode, personal setlists, and
              offline saving.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setMode('create')}
              className="h-11 px-5 rounded-xl bg-[var(--brand-accent)] text-[var(--bg-surface)] text-sm font-semibold inline-flex items-center gap-2 hover:opacity-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Create Your First Song</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('import')}
              className="h-11 px-5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>Import ChordPro (.cho)</span>
            </button>
          </div>
        </section>
      ) : filteredCustomSongs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
          <h2 className="text-base font-bold">
            No Personal Songs Match &ldquo;{searchQuery}&rdquo;
          </h2>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs font-semibold text-[var(--brand-accent)] hover:underline cursor-pointer"
          >
            Clear search filter
          </button>
        </section>
      ) : (
        <div className="space-y-3">
          {filteredCustomSongs.map((song) => {
            const favored = isFavorite(song.id);
            const savedOffline = isSongSavedOffline(song.id);
            const updatedDateLabel = song.updatedAt
              ? new Date(song.updatedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : null;

            return (
              <div
                key={song.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[var(--border-strong)] transition-colors"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/songs/${song.slug}`}
                      className="font-bold text-base sm:text-lg text-[var(--text-primary)] hover:text-[var(--brand-accent)] transition-colors truncate"
                    >
                      {song.title}
                    </Link>

                    <span className="text-[0.6875rem] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                      My Song
                    </span>

                    {savedOffline && (
                      <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                        <CheckCircle2
                          className="w-3 h-3 text-[var(--brand-accent)]"
                          aria-hidden="true"
                        />
                        <span>Offline</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                    {(song.artist || song.attribution) && (
                      <span className="font-medium text-[var(--text-primary)]">
                        {song.artist || song.attribution}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-primary)] font-medium">
                      {song.language.label}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)]">
                      {song.category.label}
                    </span>
                    {song.tempoBpm && (
                      <span className="inline-flex items-center gap-1">
                        <Music className="w-3 h-3" aria-hidden="true" />
                        {song.tempoBpm} BPM
                        {song.timeSignature ? ` · ${song.timeSignature}` : ''}
                      </span>
                    )}
                    {updatedDateLabel && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" aria-hidden="true" />
                        <span>Updated {updatedDateLabel}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div
                    title={`Original Key: ${song.originalKey}`}
                    className="flex flex-col items-center justify-center min-w-[2.75rem] h-10 px-2.5 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--border-subtle)]"
                  >
                    <span className="text-[0.625rem] uppercase tracking-wider leading-none opacity-80">
                      Key
                    </span>
                    <span className="font-mono font-bold text-sm leading-tight">
                      {song.originalKey}
                    </span>
                  </div>

                  <Link
                    href={`/songs/${song.slug}`}
                    className="h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open Chart</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setBanner(null);
                      setEditingSongId(song.id);
                      setMode('edit');
                    }}
                    aria-label={`Edit ${song.title}`}
                    className="h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportSong(song)}
                    aria-label={`Export ${song.title} as ChordPro .cho file`}
                    className="h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Export .cho</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFavorite(song.id)}
                    aria-label={
                      favored
                        ? `Remove ${song.title} from favorites`
                        : `Add ${song.title} to favorites`
                    }
                    aria-pressed={favored}
                    className={`w-10 h-10 rounded-lg border inline-flex items-center justify-center transition-colors cursor-pointer ${
                      favored
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Heart
                      className={`w-4 h-4 ${favored ? 'fill-current' : ''}`}
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteSong(song)}
                    aria-label={`Delete ${song.title}`}
                    className="h-10 px-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
