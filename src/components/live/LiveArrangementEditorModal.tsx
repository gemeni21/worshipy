'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Check,
  Copy,
  Edit3,
  FileCode2,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
  Radio,
} from 'lucide-react';
import {
  exportSongToChordPro,
  getSuggestedChordsForKey,
  insertChordAtCursor,
  parseBracketedLineToSegments,
  parseChordPro,
} from '@/lib/chordpro/chordPro';
import {
  convertDisplayedSongToBaseChordPro,
  formatSongLineForQuickEdit,
} from '@/lib/chordpro/liveArrangement';
import type { SectionType, SongLine, SongRecord, SongSection } from '@/types/song';

interface LiveArrangementEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The base song in its originalKey (semitones = 0) */
  baseSong: SongRecord;
  /** The currently displayed song (already resolved with any existing override and transposed to displayedKey) */
  displayedSong: SongRecord;
  /** Current semitone offset of displayedSong relative to baseSong.originalKey */
  displayedSemitones: number;
  /** Current displayed concert key (e.g. 'A', 'Bb') */
  displayedKey: string;
  /** Existing arrangement note if an override is already active */
  initialArrangementNote?: string;
  /** Whether an override is currently active for this song */
  hasActiveOverride: boolean;
  /** Broadcasts the updated base-key ChordPro override to all connected band members */
  onBroadcastOverride: (payload: {
    songId: string;
    chordPro: string;
    arrangementNote?: string;
  }) => Promise<void> | void;
  /** Reverts the song back to its original catalog chart for all connected band members */
  onRevertToOriginal: (songId: string) => Promise<void> | void;
  /** Saves a copy of this custom arrangement into the user's personal custom songs library */
  onSaveCopyToMySongs?: (customSong: SongRecord) => Promise<void> | void;
  /** Custom primary button label (defaults to "Broadcast Live to Band") */
  primaryActionLabel?: string;
  /** Optional callback to propose this arrangement to the Worship Leader for approval */
  onProposeToLeader?: (payload: {
    songId: string;
    chordPro: string;
    arrangementNote?: string;
  }) => Promise<void> | void;
  /** Optional custom label for the Propose to Leader button */
  proposeActionLabel?: string;
  /** Optional status of the member's latest proposal to the Worship Leader */
  latestProposalStatus?: 'pending' | 'approved' | 'declined';
  /** Optional feedback note from the Worship Leader */
  latestProposalReviewNote?: string;
  /** Optional callback to close/dismiss the member's proposal status notification */
  onDismissProposal?: () => Promise<void> | void;
}

interface EditableSectionDraft {
  id: string;
  type: SectionType;
  label: string;
  cue: string;
  lines: Array<{
    bracketedText: string;
    annotation: string;
  }>;
}

const SECTION_TYPE_PRESETS: Array<{ type: SectionType; label: string; cue: string }> = [
  { type: 'intro', label: 'Intro', cue: 'Instrumental intro' },
  { type: 'verse', label: 'Verse', cue: 'Soft & reflective' },
  { type: 'pre-chorus', label: 'Pre-Chorus', cue: 'Build dynamics' },
  { type: 'chorus', label: 'Chorus', cue: 'Full band' },
  { type: 'bridge', label: 'Bridge', cue: 'Driving build' },
  { type: 'tag', label: 'Tag / Vamp', cue: 'Repeat as led' },
  { type: 'interlude', label: 'Instrumental', cue: 'Spontaneous / lead guitar' },
  { type: 'outro', label: 'Outro', cue: 'Ring out & resolve' },
];

function songToEditableSections(song: SongRecord): EditableSectionDraft[] {
  return song.sections.map((sec) => ({
    id: sec.id,
    type: sec.type,
    label: sec.label,
    cue: sec.cue || '',
    lines: sec.lines.map((line) => ({
      bracketedText: formatSongLineForQuickEdit(line),
      annotation: line.annotation || '',
    })),
  }));
}

function editableSectionsToSong(
  baseDisplayedSong: SongRecord,
  editableSections: EditableSectionDraft[]
): SongRecord {
  const sections: SongSection[] = editableSections
    .map((sec, idx) => {
      const parsedLines: SongLine[] = sec.lines
        .map((l, lIdx) => {
          const parsed = parseBracketedLineToSegments(l.bracketedText);
          const cleanAnnotation = l.annotation.trim();
          return {
            id: `line-${idx + 1}-${lIdx + 1}`,
            isInstrumental: parsed.isInstrumental,
            segments: parsed.segments,
            ...(cleanAnnotation ? { annotation: cleanAnnotation } : {}),
          };
        })
        .filter(
          (l) =>
            l.segments.some((s) => Boolean(s.chord && s.chord.trim())) ||
            l.segments.some((s) => s.text.trim().length > 0)
        );

      return {
        id: sec.id || `sec-${idx + 1}`,
        type: sec.type,
        label: sec.label.trim() || `Section ${idx + 1}`,
        ...(sec.cue.trim() ? { cue: sec.cue.trim() } : {}),
        lines:
          parsedLines.length > 0
            ? parsedLines
            : [
                {
                  id: `line-${idx + 1}-1`,
                  isInstrumental: false,
                  segments: [{ text: '' }],
                },
              ],
      };
    })
    .filter((s) => s.lines.length > 0);

  return {
    ...baseDisplayedSong,
    sections: sections.length > 0 ? sections : baseDisplayedSong.sections,
  };
}

export function LiveArrangementEditorModal({
  isOpen,
  onClose,
  baseSong,
  displayedSong,
  displayedSemitones,
  displayedKey,
  initialArrangementNote = '',
  hasActiveOverride,
  onBroadcastOverride,
  onRevertToOriginal,
  onSaveCopyToMySongs,
  primaryActionLabel,
  onProposeToLeader,
  proposeActionLabel,
  latestProposalStatus,
  latestProposalReviewNote,
  onDismissProposal,
}: LiveArrangementEditorModalProps) {
  const [activeTab, setActiveTab] = useState<'visual' | 'chordpro'>('visual');
  const [sectionsDraft, setSectionsDraft] = useState<EditableSectionDraft[]>([]);
  const [rawChordPro, setRawChordPro] = useState<string>('');
  const [arrangementNote, setArrangementNote] = useState<string>(initialArrangementNote);
  const [focusedTarget, setFocusedTarget] = useState<{
    secIdx: number;
    lineIdx: number;
  } | null>(null);
  const lineInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lineCursorMapRef = useRef<Record<string, number>>({});
  const rawChordProTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rawChordProCursorRef = useRef<number | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [savedCopySuccess, setSavedCopySuccess] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Initialize state when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSectionsDraft(songToEditableSections(displayedSong));
    const displayedChordPro = exportSongToChordPro(
      { ...displayedSong, originalKey: displayedKey },
      { semitones: 0 }
    );
    setRawChordPro(displayedChordPro);
    setArrangementNote(initialArrangementNote || '');
    setActiveTab('visual');
    setParseError(null);
    setSavedCopySuccess(false);
    setFocusedTarget({ secIdx: 0, lineIdx: 0 });
  }, [isOpen, displayedSong, displayedKey, initialArrangementNote]);

  const diatonicChords = useMemo(
    () => getSuggestedChordsForKey(displayedKey),
    [displayedKey]
  );

  if (!isOpen) return null;

  const handleSwitchTab = (nextTab: 'visual' | 'chordpro') => {
    setParseError(null);
    if (nextTab === activeTab) return;

    if (nextTab === 'chordpro') {
      // Sync visual sections -> rawChordPro in displayedKey
      const builtSong = editableSectionsToSong(displayedSong, sectionsDraft);
      const cp = exportSongToChordPro(
        { ...builtSong, originalKey: displayedKey },
        { semitones: 0 }
      );
      setRawChordPro(cp);
      setActiveTab('chordpro');
    } else {
      // Sync rawChordPro -> visual sections
      const parsed = parseChordPro(rawChordPro, {
        existingId: displayedSong.id,
      });
      if (!parsed.ok || !parsed.draft) {
        setParseError(
          parsed.error || 'Could not parse ChordPro text.'
        );
        return;
      }
      setSectionsDraft(songToEditableSections(parsed.draft));
      setActiveTab('visual');
    }
  };

  const buildCurrentEditedDisplayedSong = (): SongRecord | null => {
    if (activeTab === 'visual') {
      return editableSectionsToSong(displayedSong, sectionsDraft);
    }
    const parsed = parseChordPro(rawChordPro, {
      existingId: displayedSong.id,
      existingCreatedAt: displayedSong.createdAt,
    });
    if (!parsed.ok || !parsed.draft || parsed.draft.sections.length === 0) {
      setParseError(
        parsed.error ||
          'Please include at least one valid section or lyric/chord line.'
      );
      return null;
    }
    return {
      ...displayedSong,
      sections: parsed.draft.sections,
    };
  };

  const handleBroadcastLive = async () => {
    setParseError(null);
    const editedDisplayed = buildCurrentEditedDisplayedSong();
    if (!editedDisplayed) return;

    setIsBroadcasting(true);
    try {
      const baseChordPro = convertDisplayedSongToBaseChordPro(
        editedDisplayed,
        baseSong,
        displayedSemitones
      );
      await onBroadcastOverride({
        songId: baseSong.id,
        chordPro: baseChordPro,
        arrangementNote: arrangementNote.trim() || undefined,
      });
      onClose();
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleProposeToLeaderClick = async () => {
    if (!onProposeToLeader) return;
    setParseError(null);
    const editedDisplayed = buildCurrentEditedDisplayedSong();
    if (!editedDisplayed) return;

    setIsProposing(true);
    try {
      const baseChordPro = convertDisplayedSongToBaseChordPro(
        editedDisplayed,
        baseSong,
        displayedSemitones
      );
      await onProposeToLeader({
        songId: baseSong.id,
        chordPro: baseChordPro,
        arrangementNote: arrangementNote.trim() || undefined,
      });
      onClose();
    } finally {
      setIsProposing(false);
    }
  };

  const handleSaveToMySongs = async () => {
    if (!onSaveCopyToMySongs) return;
    setParseError(null);
    const editedDisplayed = buildCurrentEditedDisplayedSong();
    if (!editedDisplayed) return;

    const customId = `custom-live-${baseSong.slug}-${Date.now().toString(36)}`;
    const noteSuffix = arrangementNote.trim()
      ? ` (${arrangementNote.trim()})`
      : ` (Live in ${displayedKey})`;
    const customRecord: SongRecord = {
      ...editedDisplayed,
      id: customId,
      slug: customId,
      sourceType: 'custom',
      title: `${baseSong.title}${noteSuffix}`,
      originalKey: displayedKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await onSaveCopyToMySongs(customRecord);
    setSavedCopySuccess(true);
    window.setTimeout(() => setSavedCopySuccess(false), 3000);
  };

  const handleInsertChordToken = (chord: string) => {
    if (activeTab === 'chordpro') {
      const textareaEl = rawChordProTextareaRef.current;
      const curPos =
        textareaEl?.selectionStart ??
        rawChordProCursorRef.current ??
        rawChordPro.length;
      const { nextText, nextCursor } = insertChordAtCursor(
        rawChordPro,
        curPos,
        chord
      );
      rawChordProCursorRef.current = nextCursor;
      setRawChordPro(nextText);
      window.requestAnimationFrame(() => {
        if (rawChordProTextareaRef.current) {
          rawChordProTextareaRef.current.focus();
          rawChordProTextareaRef.current.setSelectionRange(
            nextCursor,
            nextCursor
          );
        }
      });
      return;
    }

    const target = focusedTarget ?? { secIdx: 0, lineIdx: 0 };
    const key = `${target.secIdx}:${target.lineIdx}`;
    const inputEl = lineInputRefs.current[key];
    const currentLineText =
      sectionsDraft[target.secIdx]?.lines[target.lineIdx]?.bracketedText ?? '';
    const curPos =
      inputEl?.selectionStart ??
      lineCursorMapRef.current[key] ??
      currentLineText.length;

    const { nextText, nextCursor } = insertChordAtCursor(
      currentLineText,
      curPos,
      chord
    );
    lineCursorMapRef.current[key] = nextCursor;

    setSectionsDraft((prev) =>
      prev.map((sec, sIdx) => {
        if (sIdx !== target.secIdx) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line, lIdx) => {
            if (lIdx !== target.lineIdx) return line;
            return {
              ...line,
              bracketedText: nextText,
            };
          }),
        };
      })
    );

    window.requestAnimationFrame(() => {
      const el = lineInputRefs.current[key];
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const handleAddSection = (preset: {
    type: SectionType;
    label: string;
    cue: string;
  }) => {
    const nextIndex = sectionsDraft.length + 1;
    const sameTypeCount = sectionsDraft.filter((s) => s.type === preset.type).length;
    const numberedLabel =
      preset.type === 'verse' || preset.type === 'bridge' || preset.type === 'chorus'
        ? `${preset.label}${sameTypeCount > 0 ? ` ${sameTypeCount + 1}` : ''}`
        : preset.label;

    const newSec: EditableSectionDraft = {
      id: `sec-live-${Date.now().toString(36)}-${nextIndex}`,
      type: preset.type,
      label: numberedLabel,
      cue: preset.cue,
      lines: [
        {
          bracketedText: `[${diatonicChords[0] || displayedKey}]`,
          annotation: '',
        },
      ],
    };

    setSectionsDraft((prev) => [...prev, newSec]);
    setFocusedTarget({ secIdx: sectionsDraft.length, lineIdx: 0 });
  };

  const handleDuplicateSection = (secIdx: number) => {
    const source = sectionsDraft[secIdx];
    if (!source) return;
    const copy: EditableSectionDraft = {
      ...source,
      id: `sec-live-${Date.now().toString(36)}-${secIdx + 1}`,
      label: `${source.label} (Repeat)`,
      lines: source.lines.map((l) => ({ ...l })),
    };
    const next = [...sectionsDraft];
    next.splice(secIdx + 1, 0, copy);
    setSectionsDraft(next);
  };

  const handleRemoveSection = (secIdx: number) => {
    if (sectionsDraft.length <= 1) return;
    setSectionsDraft((prev) => prev.filter((_, idx) => idx !== secIdx));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Live Arrangement Chords and Lyrics Studio"
    >
      <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 bg-[var(--bg-subtle)]">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--brand-accent)]">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Real-Time Live Arrangement Studio</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold">
              Arrange Chords &amp; Lyrics · {displayedSong.title} (Key of {displayedKey})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close live arrangement editor"
            className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diatonic Chord Quick-Insert Bar & Mode Tabs */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)] mr-1">
              Insert {displayedKey} Chords:
            </span>
            {diatonicChords.map((chord) => (
              <button
                key={chord}
                type="button"
                onClick={() => handleInsertChordToken(chord)}
                className="px-2.5 py-1 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-mono font-bold text-xs cursor-pointer transition-colors"
                title={`Insert [${chord}] at active line`}
              >
                +{chord}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-xs">
            <button
              type="button"
              onClick={() => handleSwitchTab('visual')}
              className={`px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'visual'
                  ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Visual Section Editor</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTab('chordpro')}
              className={`px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'chordpro'
                  ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Raw ChordPro Text</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {parseError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-400 font-medium"
            >
              {parseError}
            </div>
          )}

          {latestProposalStatus === 'declined' && (
            <div
              data-testid="modal-declined-proposal-banner"
              className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="font-bold text-rose-300 flex items-center gap-1.5">
                  <X className="w-4 h-4 text-rose-400" />
                  <span>Proposal Declined by Worship Leader</span>
                </div>
                <p className="text-[var(--text-secondary)]">
                  {latestProposalReviewNote
                    ? `Leader feedback: “${latestProposalReviewNote}”`
                    : 'Your personal rehearsal chords are still saved for you. You can close this notice or adjust your chords and resubmit.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onDismissProposal && (
                  <button
                    type="button"
                    data-testid="modal-close-declined-proposal-btn"
                    onClick={async () => {
                      await onDismissProposal();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Close</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Arrangement Note for Band Banner */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3.5 space-y-1.5">
            <label
              htmlFor="live-arrangement-note-input"
              className="block text-xs font-bold text-[var(--brand-accent)] uppercase tracking-wider"
            >
              Band Arrangement Note / Cue (Shown at top of everyone&apos;s chart)
            </label>
            <input
              id="live-arrangement-note-input"
              type="text"
              value={arrangementNote}
              onChange={(e) => setArrangementNote(e.target.value)}
              placeholder="e.g. Acoustic start on Verse 1 • Repeat Bridge 3x • Spontaneous Tag at end"
              className="w-full h-10 px-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs sm:text-sm"
            />
          </div>

          {activeTab === 'visual' ? (
            <div className="space-y-4">
              {sectionsDraft.map((sec, secIdx) => (
                <div
                  key={sec.id}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
                      <input
                        type="text"
                        aria-label={`Section ${secIdx + 1} label`}
                        value={sec.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSectionsDraft((prev) =>
                            prev.map((s, idx) =>
                              idx === secIdx ? { ...s, label: val } : s
                            )
                          );
                        }}
                        className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-bold text-xs sm:text-sm text-[var(--brand-accent)] w-40"
                        placeholder="Section Label (e.g. Bridge)"
                      />
                      <input
                        type="text"
                        aria-label={`Section ${secIdx + 1} performance cue`}
                        value={sec.cue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSectionsDraft((prev) =>
                            prev.map((s, idx) =>
                              idx === secIdx ? { ...s, cue: val } : s
                            )
                          );
                        }}
                        className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs flex-1 min-w-[160px]"
                        placeholder="Performance cue (e.g. Drums build, Worship Leader only)"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDuplicateSection(secIdx)}
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        title="Duplicate this section (e.g. Repeat Chorus or Bridge)"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Repeat Section</span>
                      </button>
                      {sectionsDraft.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSection(secIdx)}
                          className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-rose-400 hover:border-rose-500/40 cursor-pointer"
                          title="Delete section"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lines inside section */}
                  <div className="space-y-2">
                    {sec.lines.map((line, lineIdx) => (
                      <div
                        key={lineIdx}
                        className="flex items-center gap-2"
                      >
                        <input
                          ref={(el) => {
                            lineInputRefs.current[`${secIdx}:${lineIdx}`] = el;
                          }}
                          type="text"
                          aria-label={`${sec.label} line ${lineIdx + 1}`}
                          value={line.bracketedText}
                          onFocus={(e) => {
                            setFocusedTarget({ secIdx, lineIdx });
                            if (e.currentTarget.selectionStart !== null) {
                              lineCursorMapRef.current[
                                `${secIdx}:${lineIdx}`
                              ] = e.currentTarget.selectionStart;
                            }
                          }}
                          onClick={(e) => {
                            setFocusedTarget({ secIdx, lineIdx });
                            if (e.currentTarget.selectionStart !== null) {
                              lineCursorMapRef.current[
                                `${secIdx}:${lineIdx}`
                              ] = e.currentTarget.selectionStart;
                            }
                          }}
                          onKeyUp={(e) => {
                            if (e.currentTarget.selectionStart !== null) {
                              lineCursorMapRef.current[
                                `${secIdx}:${lineIdx}`
                              ] = e.currentTarget.selectionStart;
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (e.target.selectionStart !== null) {
                              lineCursorMapRef.current[
                                `${secIdx}:${lineIdx}`
                              ] = e.target.selectionStart;
                            }
                            setSectionsDraft((prev) =>
                              prev.map((s, sIdx) => {
                                if (sIdx !== secIdx) return s;
                                return {
                                  ...s,
                                  lines: s.lines.map((l, lIdx) =>
                                    lIdx === lineIdx
                                      ? { ...l, bracketedText: val }
                                      : l
                                  ),
                                };
                              })
                            );
                          }}
                          placeholder="Click anywhere in the words and tap a +Chord button above, e.g. [G]Way maker [D]miracle worker"
                          className="flex-1 h-10 px-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-mono text-xs sm:text-sm focus:border-[var(--brand-accent)]"
                        />
                        {sec.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSectionsDraft((prev) =>
                                prev.map((s, sIdx) => {
                                  if (sIdx !== secIdx) return s;
                                  return {
                                    ...s,
                                    lines: s.lines.filter(
                                      (_, lIdx) => lIdx !== lineIdx
                                    ),
                                  };
                                })
                              );
                            }}
                            aria-label="Delete line"
                            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-rose-400 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setSectionsDraft((prev) =>
                          prev.map((s, sIdx) => {
                            if (sIdx !== secIdx) return s;
                            return {
                              ...s,
                              lines: [
                                ...s.lines,
                                { bracketedText: '', annotation: '' },
                              ],
                            };
                          })
                        );
                        setFocusedTarget({
                          secIdx,
                          lineIdx: sec.lines.length,
                        });
                      }}
                      className="text-xs font-semibold text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1 pt-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Line to {sec.label}</span>
                    </button>
                  </div>
                </div>
              ))}

              {/* Quick-Add Section Bar */}
              <div className="rounded-2xl border border-dashed border-[var(--border-strong)] p-4 space-y-2.5">
                <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  + Add New Section to Song Structure:
                </span>
                <div className="flex flex-wrap gap-2">
                  {SECTION_TYPE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleAddSection(preset)}
                      className="px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand-accent)] border border-[var(--border-subtle)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">
                Edit raw ChordPro in the current displayed key (
                <strong>Key of {displayedKey}</strong>). Place chords in square
                brackets like <code>[G]Amazing [C]grace</code>. When broadcast,
                all band members and capo/instrument views will automatically
                sync.
              </p>
              <textarea
                ref={rawChordProTextareaRef}
                aria-label="Raw ChordPro arrangement editor"
                value={rawChordPro}
                onClick={(e) => {
                  rawChordProCursorRef.current = e.currentTarget.selectionStart;
                }}
                onKeyUp={(e) => {
                  rawChordProCursorRef.current = e.currentTarget.selectionStart;
                }}
                onChange={(e) => {
                  rawChordProCursorRef.current = e.target.selectionStart;
                  setRawChordPro(e.target.value);
                }}
                rows={16}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 font-mono text-xs sm:text-sm leading-relaxed focus:bg-[var(--bg-surface)]"
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveOverride && (
              <button
                type="button"
                onClick={async () => {
                  await onRevertToOriginal(baseSong.id);
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Revert to Original Chart</span>
              </button>
            )}

            {onSaveCopyToMySongs && (
              <button
                type="button"
                onClick={handleSaveToMySongs}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {savedCopySuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">
                      Saved to My Songs!
                    </span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                    <span>Save Copy to My Songs</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            {onProposeToLeader && (
              <button
                type="button"
                disabled={isProposing || isBroadcasting}
                onClick={handleProposeToLeaderClick}
                data-testid="propose-arrangement-to-leader-btn"
                className="px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-[#0c0c10] font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {isProposing
                    ? 'Sending Proposal...'
                    : proposeActionLabel || 'Propose to Worship Leader'}
                </span>
              </button>
            )}
            <button
              type="button"
              disabled={isBroadcasting || isProposing}
              onClick={handleBroadcastLive}
              data-testid="broadcast-live-arrangement-btn"
              className="px-5 py-2.5 rounded-xl bg-[var(--brand-accent)] text-[#0c0c10] font-bold text-xs sm:text-sm shadow-md hover:opacity-95 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Radio className="w-4 h-4 animate-pulse" />
              <span>
                {isBroadcasting
                  ? 'Saving...'
                  : primaryActionLabel || 'Broadcast Live to Band'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
