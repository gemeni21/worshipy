'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Info,
  Minus,
  Music,
  PenLine,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildCustomSongRecord,
  CATEGORY_PRESETS,
  formatSegmentsToBracketedLine,
  getSuggestedChordsForKey,
  inferSectionType,
  insertChordAtCursor,
  LANGUAGE_PRESETS,
  parseBracketedLineToSegments,
  SECTION_TYPE_PRESETS,
  validateCustomSongDraft,
} from '@/lib/chordpro/chordPro';
import {
  CANONICAL_MAJOR_KEYS,
  CANONICAL_MINOR_KEYS,
  formatSignedSemitones,
  normalizeSemitones,
  transposeSong,
} from '@/lib/music/transposition';
import type {
  ChordLyricSegment,
  SectionType,
  SongCategoryId,
  SongLine,
  SongRecord,
  SongSection,
} from '@/types/song';

interface EditableLineState {
  id: string;
  bracketText: string;
  annotation: string;
  isInstrumental: boolean;
  segments: ChordLyricSegment[];
  showSegmentEditor?: boolean;
}

interface EditableSectionState {
  id: string;
  type: SectionType;
  label: string;
  cue: string;
  lines: EditableLineState[];
}

export interface CustomSongEditorProps {
  initialSong?: SongRecord;
  isImportDraft?: boolean;
  importWarnings?: string[];
  existingCustomSongs: SongRecord[];
  onSave: (
    song: SongRecord,
    mode: 'save' | 'save-as-new'
  ) => Promise<{ ok: boolean; error?: string; song?: SongRecord }>;
  onCancel: () => void;
}

const ALL_KEY_CHOICES = [
  ...CANONICAL_MAJOR_KEYS,
  ...CANONICAL_MINOR_KEYS,
] as const;

const TIME_SIGNATURE_PRESETS = ['4/4', '3/4', '6/8', '2/4', '12/8', '2/2'] as const;

function createInitialSections(song?: SongRecord): EditableSectionState[] {
  if (song && song.sections && song.sections.length > 0) {
    return song.sections.map((sec, sIdx) => ({
      id: sec.id || `sec-${sIdx + 1}`,
      type: sec.type || inferSectionType(sec.label),
      label: sec.label || `Section ${sIdx + 1}`,
      cue: sec.cue ?? '',
      lines:
        sec.lines.length > 0
          ? sec.lines.map((line, lIdx) => {
              const segments =
                line.segments && line.segments.length > 0
                  ? line.segments.map((s) => ({ ...s }))
                  : [{ text: '' }];
              return {
                id: line.id || `line-${sIdx + 1}-${lIdx + 1}`,
                bracketText: formatSegmentsToBracketedLine(segments),
                annotation: line.annotation ?? '',
                isInstrumental: Boolean(line.isInstrumental),
                segments,
              };
            })
          : [
              {
                id: `line-${sIdx + 1}-1`,
                bracketText: '',
                annotation: '',
                isInstrumental: false,
                segments: [{ text: '' }],
              },
            ],
    }));
  }

  return [
    {
      id: 'sec-1',
      type: 'verse',
      label: 'Verse 1',
      cue: '',
      lines: [
        {
          id: 'line-1-1',
          bracketText: '[G]We gather in Your [D/F#]light today',
          annotation: '',
          isInstrumental: false,
          segments: [
            { chord: 'G', text: 'We gather in Your ' },
            { chord: 'D/F#', text: 'light today' },
          ],
        },
        {
          id: 'line-1-2',
          bracketText: '[Em7]With grateful hearts we [Cadd9]sing Your praise',
          annotation: '',
          isInstrumental: false,
          segments: [
            { chord: 'Em7', text: 'With grateful hearts we ' },
            { chord: 'Cadd9', text: 'sing Your praise' },
          ],
        },
      ],
    },
    {
      id: 'sec-2',
      type: 'chorus',
      label: 'Chorus',
      cue: 'Build warmly',
      lines: [
        {
          id: 'line-2-1',
          bracketText: '[C]Faithful forever, [G/B]Lord You reign',
          annotation: '',
          isInstrumental: false,
          segments: [
            { chord: 'C', text: 'Faithful forever, ' },
            { chord: 'G/B', text: 'Lord You reign' },
          ],
        },
      ],
    },
  ];
}

export function CustomSongEditor({
  initialSong,
  isImportDraft = false,
  importWarnings = [],
  existingCustomSongs,
  onSave,
  onCancel,
}: CustomSongEditorProps) {
  const isEditingExisting = Boolean(
    initialSong && !isImportDraft && initialSong.sourceType === 'custom'
  );

  // Primary Metadata
  const [title, setTitle] = useState(initialSong?.title ?? '');
  const [titleTouched, setTitleTouched] = useState(false);
  const [artist, setArtist] = useState(initialSong?.artist ?? '');
  const [originalKey, setOriginalKey] = useState(
    initialSong?.originalKey ?? 'G'
  );
  const [languageCode, setLanguageCode] = useState(
    initialSong?.language.code ?? 'en'
  );
  const [customLanguageLabel, setCustomLanguageLabel] = useState(
    initialSong?.language.label ?? ''
  );
  const [categoryId, setCategoryId] = useState<SongCategoryId>(
    initialSong?.category.id ?? 'contemporary-worship'
  );

  // Advanced Metadata
  const [showAdvancedMeta, setShowAdvancedMeta] = useState(
    Boolean(
      initialSong?.subtitle ||
        (initialSong?.writers && initialSong.writers.length > 0) ||
        initialSong?.tempoBpm ||
        initialSong?.timeSignature ||
        initialSong?.capo ||
        initialSong?.attribution ||
        initialSong?.sourceNotes ||
        initialSong?.rightsNotes
    )
  );
  const [subtitle, setSubtitle] = useState(initialSong?.subtitle ?? '');
  const [writersInput, setWritersInput] = useState(
    initialSong?.writers?.join(', ') ?? ''
  );
  const [tempoInput, setTempoInput] = useState(
    initialSong?.tempoBpm ? String(initialSong.tempoBpm) : ''
  );
  const [tempoTouched, setTempoTouched] = useState(false);
  const [timeSignature, setTimeSignature] = useState(
    initialSong?.timeSignature ?? '4/4'
  );
  const [capoInput, setCapoInput] = useState(
    initialSong?.capo !== undefined ? String(initialSong.capo) : ''
  );
  const [attribution, setAttribution] = useState(
    initialSong?.attribution ?? ''
  );
  const [sourceNotes, setSourceNotes] = useState(
    initialSong?.sourceNotes ?? ''
  );
  const [rightsNotes, setRightsNotes] = useState(
    initialSong?.rightsNotes ?? ''
  );
  const [rightsAcknowledged, setRightsAcknowledged] = useState(
    Boolean(initialSong?.rightsAcknowledged || isEditingExisting)
  );

  // Sections & Lines
  const [sections, setSections] = useState<EditableSectionState[]>(() =>
    createInitialSections(initialSong)
  );
  const [isDirty, setIsDirty] = useState(isImportDraft);

  // Focused line & cursor position for one-tap chord insertion
  const [activeLineCursor, setActiveLineCursor] = useState<{
    sectionId: string;
    lineId: string;
    cursor: number;
  } | null>(null);
  const [customChordToInsert, setCustomChordToInsert] = useState('');
  const lineInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Mobile Tab ('edit' | 'preview') & Preview Transposition State
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [previewSemitones, setPreviewSemitones] = useState(0);

  // Saving & Error State
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const suggestedChords = useMemo(
    () => getSuggestedChordsForKey(originalKey),
    [originalKey]
  );

  // Build current live SongRecord draft for validation & preview
  const currentDraftRecord = useMemo((): SongRecord => {
    const parsedTempo =
      tempoInput.trim() !== '' ? Number(tempoInput.trim()) : undefined;
    const parsedCapo =
      capoInput.trim() !== '' ? Number(capoInput.trim()) : undefined;
    const writers = writersInput
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    const existingSlugs = new Set(
      existingCustomSongs
        .filter((s) => s.id !== initialSong?.id)
        .map((s) => s.slug)
    );

    const mappedSections: SongSection[] = sections.map((sec) => ({
      id: sec.id,
      type: sec.type,
      label: sec.label,
      ...(sec.cue.trim() ? { cue: sec.cue.trim() } : {}),
      lines: sec.lines.map(
        (line): SongLine => ({
          id: line.id,
          ...(line.annotation.trim()
            ? { annotation: line.annotation.trim() }
            : {}),
          isInstrumental: line.isInstrumental,
          segments: line.segments,
        })
      ),
    }));

    return buildCustomSongRecord({
      existingSong: isEditingExisting ? initialSong : undefined,
      existingSlugs,
      title: title || 'Untitled Song',
      subtitle,
      artist,
      writers,
      languageCode,
      languageLabel:
        languageCode === 'other' ? customLanguageLabel || 'Other' : undefined,
      categoryId,
      originalKey,
      tempoBpm: parsedTempo,
      timeSignature,
      capo: parsedCapo,
      attribution,
      sourceNotes,
      rightsNotes,
      rightsAcknowledged,
      importProvenance: initialSong?.importProvenance,
      sections: mappedSections,
    });
  }, [
    tempoInput,
    capoInput,
    writersInput,
    existingCustomSongs,
    initialSong,
    sections,
    isEditingExisting,
    title,
    subtitle,
    artist,
    languageCode,
    customLanguageLabel,
    categoryId,
    originalKey,
    timeSignature,
    attribution,
    sourceNotes,
    rightsNotes,
    rightsAcknowledged,
  ]);

  const validation = useMemo(
    () =>
      validateCustomSongDraft({
        ...currentDraftRecord,
        title: title.trim(),
        tempoBpm:
          tempoInput.trim() !== '' ? Number(tempoInput.trim()) : undefined,
        capo: capoInput.trim() !== '' ? Number(capoInput.trim()) : undefined,
      }),
    [currentDraftRecord, title, tempoInput, capoInput]
  );

  // Check if another custom song already has a matching title
  const duplicateTitleCustomSong = useMemo(() => {
    const clean = title.trim().toLowerCase();
    if (!clean) return undefined;
    return existingCustomSongs.find(
      (s) =>
        s.id !== (isEditingExisting ? initialSong?.id : undefined) &&
        s.title.trim().toLowerCase() === clean
    );
  }, [title, existingCustomSongs, isEditingExisting, initialSong?.id]);

  // Transposed preview song
  const {
    song: previewSong,
    displayedKey: previewDisplayedKey,
    normalizedSemitones: previewNormalizedSemitones,
  } = useMemo(
    () => transposeSong(currentDraftRecord, previewSemitones, 'auto'),
    [currentDraftRecord, previewSemitones]
  );

  // Section Manipulation Handlers
  const handleAddSection = (presetType: SectionType = 'verse') => {
    setIsDirty(true);
    setSections((prev) => {
      const nextIndex = prev.length + 1;
      const sameTypeCount = prev.filter((s) => s.type === presetType).length;
      const preset = SECTION_TYPE_PRESETS.find((p) => p.type === presetType);
      let label = preset ? preset.defaultLabel : `Section ${nextIndex}`;
      if (presetType === 'verse') {
        label = `Verse ${sameTypeCount + 1}`;
      } else if (sameTypeCount > 0 && presetType !== 'other') {
        label = `${preset?.defaultLabel ?? 'Section'} ${sameTypeCount + 1}`;
      }

      const newSecId = `sec-${Date.now().toString(36)}-${nextIndex}`;
      const newLineId = `line-${Date.now().toString(36)}-1`;
      return [
        ...prev,
        {
          id: newSecId,
          type: presetType,
          label,
          cue: '',
          lines: [
            {
              id: newLineId,
              bracketText: '',
              annotation: '',
              isInstrumental: presetType === 'instrumental' || presetType === 'intro',
              segments: [{ text: '' }],
            },
          ],
        },
      ];
    });
  };

  const handleUpdateSectionMeta = (
    sectionId: string,
    patch: Partial<Pick<EditableSectionState, 'label' | 'type' | 'cue'>>
  ) => {
    setIsDirty(true);
    setSections((prev) =>
      prev.map((sec) => (sec.id === sectionId ? { ...sec, ...patch } : sec))
    );
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    setIsDirty(true);
    setSections((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
  };

  const handleDuplicateSection = (index: number) => {
    setIsDirty(true);
    setSections((prev) => {
      const source = prev[index];
      if (!source) return prev;
      const stamp = Date.now().toString(36);
      const duplicated: EditableSectionState = {
        ...source,
        id: `sec-${stamp}-${prev.length + 1}`,
        label: `${source.label} (Copy)`,
        lines: source.lines.map((l, lIdx) => ({
          ...l,
          id: `line-${stamp}-${lIdx + 1}`,
          segments: l.segments.map((seg) => ({ ...seg })),
        })),
      };
      const copy = [...prev];
      copy.splice(index + 1, 0, duplicated);
      return copy;
    });
  };

  const handleDeleteSection = (index: number) => {
    const target = sections[index];
    if (!target) return;
    const hasContent = target.lines.some(
      (l) => l.bracketText.trim() !== '' || l.annotation.trim() !== ''
    );
    if (
      hasContent &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `Delete section "${target.label}" and all of its lines?`
      )
    ) {
      return;
    }
    setIsDirty(true);
    setSections((prev) => {
      if (prev.length <= 1) {
        // Keep at least one section
        return [
          {
            id: 'sec-1',
            type: 'verse',
            label: 'Verse 1',
            cue: '',
            lines: [
              {
                id: 'line-1-1',
                bracketText: '',
                annotation: '',
                isInstrumental: false,
                segments: [{ text: '' }],
              },
            ],
          },
        ];
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  // Line Manipulation Handlers
  const handleLineBracketTextChange = (
    sectionId: string,
    lineId: string,
    nextBracketText: string
  ) => {
    setIsDirty(true);
    const parsed = parseBracketedLineToSegments(nextBracketText);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line) =>
            line.id === lineId
              ? {
                  ...line,
                  bracketText: nextBracketText,
                  isInstrumental: parsed.isInstrumental,
                  segments: parsed.segments,
                }
              : line
          ),
        };
      })
    );
  };

  const handleInsertChordIntoActiveLine = (chordSymbol: string) => {
    const trimmed = chordSymbol.trim();
    if (!trimmed) return;

    // Default to first section/line if no line was focused yet
    const targetSecId = activeLineCursor?.sectionId ?? sections[0]?.id;
    const targetSec =
      sections.find((s) => s.id === targetSecId) ?? sections[0];
    if (!targetSec) return;
    const targetLine =
      targetSec.lines.find((l) => l.id === activeLineCursor?.lineId) ??
      targetSec.lines[0];
    if (!targetLine) return;

    const cursor =
      activeLineCursor?.lineId === targetLine.id
        ? activeLineCursor.cursor
        : targetLine.bracketText.length;

    const { nextText, nextCursor } = insertChordAtCursor(
      targetLine.bracketText,
      cursor,
      trimmed
    );

    handleLineBracketTextChange(targetSec.id, targetLine.id, nextText);
    setActiveLineCursor({
      sectionId: targetSec.id,
      lineId: targetLine.id,
      cursor: nextCursor,
    });

    // Restore focus and cursor in the line input
    const inputEl = lineInputRefs.current[targetLine.id];
    if (inputEl) {
      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.setSelectionRange(nextCursor, nextCursor);
      });
    }
  };

  const handleSegmentUpdate = (
    sectionId: string,
    lineId: string,
    segIndex: number,
    patch: Partial<ChordLyricSegment>
  ) => {
    setIsDirty(true);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line) => {
            if (line.id !== lineId) return line;
            const nextSegments = line.segments.map((seg, idx) =>
              idx === segIndex
                ? {
                    ...seg,
                    ...patch,
                    chord:
                      patch.chord !== undefined
                        ? patch.chord.trim() || undefined
                        : seg.chord,
                  }
                : seg
            );
            const hasAnyChord = nextSegments.some((s) => Boolean(s.chord));
            const hasAnyLyric = nextSegments.some(
              (s) => s.text.trim().length > 0
            );
            return {
              ...line,
              segments: nextSegments,
              isInstrumental: hasAnyChord && !hasAnyLyric,
              bracketText: formatSegmentsToBracketedLine(nextSegments),
            };
          }),
        };
      })
    );
  };

  const handleAddSegmentToLine = (sectionId: string, lineId: string) => {
    setIsDirty(true);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line) => {
            if (line.id !== lineId) return line;
            const nextSegments = [
              ...line.segments,
              { chord: originalKey || 'G', text: ' ' },
            ];
            return {
              ...line,
              segments: nextSegments,
              bracketText: formatSegmentsToBracketedLine(nextSegments),
            };
          }),
        };
      })
    );
  };

  const handleRemoveSegmentFromLine = (
    sectionId: string,
    lineId: string,
    segIndex: number
  ) => {
    setIsDirty(true);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line) => {
            if (line.id !== lineId) return line;
            const filtered = line.segments.filter((_, idx) => idx !== segIndex);
            const nextSegments =
              filtered.length > 0 ? filtered : [{ text: '' }];
            return {
              ...line,
              segments: nextSegments,
              bracketText: formatSegmentsToBracketedLine(nextSegments),
            };
          }),
        };
      })
    );
  };

  const handleToggleSegmentEditor = (sectionId: string, lineId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line) =>
            line.id === lineId
              ? { ...line, showSegmentEditor: !line.showSegmentEditor }
              : line
          ),
        };
      })
    );
  };

  const handleLineAnnotationChange = (
    sectionId: string,
    lineId: string,
    annotation: string
  ) => {
    setIsDirty(true);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((line) =>
            line.id === lineId ? { ...line, annotation } : line
          ),
        };
      })
    );
  };

  const handleAddLine = (sectionId: string, afterLineIndex?: number) => {
    setIsDirty(true);
    const newLineId = `line-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const newLine: EditableLineState = {
          id: newLineId,
          bracketText: '',
          annotation: '',
          isInstrumental: false,
          segments: [{ text: '' }],
        };
        const copy = [...sec.lines];
        const insertIdx =
          afterLineIndex !== undefined ? afterLineIndex + 1 : copy.length;
        copy.splice(insertIdx, 0, newLine);
        return { ...sec, lines: copy };
      })
    );
  };

  const handleMoveLine = (
    sectionId: string,
    lineIndex: number,
    direction: 'up' | 'down'
  ) => {
    setIsDirty(true);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const targetIndex = direction === 'up' ? lineIndex - 1 : lineIndex + 1;
        if (targetIndex < 0 || targetIndex >= sec.lines.length) return sec;
        const copy = [...sec.lines];
        const [moved] = copy.splice(lineIndex, 1);
        copy.splice(targetIndex, 0, moved);
        return { ...sec, lines: copy };
      })
    );
  };

  const handleDeleteLine = (sectionId: string, lineIndex: number) => {
    setIsDirty(true);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        if (sec.lines.length <= 1) {
          return {
            ...sec,
            lines: [
              {
                id: sec.lines[0]?.id || 'line-1',
                bracketText: '',
                annotation: '',
                isInstrumental: false,
                segments: [{ text: '' }],
              },
            ],
          };
        }
        return {
          ...sec,
          lines: sec.lines.filter((_, idx) => idx !== lineIndex),
        };
      })
    );
  };

  const handleSubmit = async (
    e: React.FormEvent,
    mode: 'save' | 'save-as-new' = 'save'
  ) => {
    e.preventDefault();
    setTitleTouched(true);
    setTempoTouched(true);
    setSubmitError(null);

    if (!validation.valid) {
      setSubmitError(validation.errors.join(' '));
      return;
    }

    if (!rightsAcknowledged) {
      setSubmitError(
        'Please acknowledge the content and rights responsibility checkbox before saving.'
      );
      return;
    }

    setIsSaving(true);
    try {
      const existingSlugs = new Set(
        existingCustomSongs
          .filter(
            (s) =>
              s.id !==
              (mode === 'save' && isEditingExisting
                ? initialSong?.id
                : undefined)
          )
          .map((s) => s.slug)
      );

      const finalSong = buildCustomSongRecord({
        existingSong:
          mode === 'save' && isEditingExisting ? initialSong : undefined,
        existingSlugs,
        title: title.trim(),
        subtitle,
        artist,
        writers: writersInput
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean),
        languageCode,
        languageLabel:
          languageCode === 'other' ? customLanguageLabel || 'Other' : undefined,
        categoryId,
        originalKey,
        tempoBpm:
          tempoInput.trim() !== '' ? Number(tempoInput.trim()) : undefined,
        timeSignature,
        capo: capoInput.trim() !== '' ? Number(capoInput.trim()) : undefined,
        attribution,
        sourceNotes,
        rightsNotes,
        rightsAcknowledged,
        importProvenance: initialSong?.importProvenance,
        sections: currentDraftRecord.sections,
      });

      const res = await onSave(finalSong, mode);
      if (!res.ok) {
        setSubmitError(res.error ?? 'Failed to save custom song.');
      } else {
        setIsDirty(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelClick = () => {
    if (
      isDirty &&
      typeof window !== 'undefined' &&
      !window.confirm(
        'Discard unsaved changes to this song chart?'
      )
    ) {
      return;
    }
    onCancel();
  };

  const showTitleError = titleTouched && !title.trim();
  const showTempoError =
    tempoTouched &&
    tempoInput.trim() !== '' &&
    (!Number.isFinite(Number(tempoInput)) ||
      Number(tempoInput) < 20 ||
      Number(tempoInput) > 320);

  return (
    <form
      onSubmit={(e) => handleSubmit(e, 'save')}
      noValidate
      className="space-y-6"
    >
      {/* Top Action Header */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {isImportDraft
                ? 'Imported ChordPro Draft — Review & Edit Before Saving'
                : isEditingExisting
                ? 'Editing Personal Song (Device-Local)'
                : 'New Personal Song (Device-Local)'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {isImportDraft
              ? `Review Imported Song: ${title || 'Untitled'}`
              : isEditingExisting
              ? `Edit Song: ${initialSong?.title}`
              : 'Create a Personal Song Chart'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleCancelClick}
            className="h-10 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Cancel</span>
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="h-10 px-5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            <span>
              {isSaving
                ? 'Saving...'
                : isEditingExisting
                ? 'Save Changes'
                : 'Save to My Songs'}
            </span>
          </button>
        </div>
      </div>

      {/* Import Warnings or Malformed Chord Warnings */}
      {(importWarnings.length > 0 || validation.chordWarnings.length > 0) && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2 text-xs sm:text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              Chart Review Notes (
              {importWarnings.length + validation.chordWarnings.length})
            </span>
          </div>
          <p className="text-xs opacity-90">
            Your text was preserved safely without deleting any lyrics or lines.
            Review the items below if you want all chords to transpose
            automatically:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            {importWarnings.map((w, idx) => (
              <li key={`imp-${idx}`}>{w}</li>
            ))}
            {validation.chordWarnings.map((cw, idx) => (
              <li key={`cw-${idx}`}>{cw.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Duplicate Title Notice */}
      {duplicateTitleCustomSong && (
        <div
          role="status"
          className="rounded-2xl border border-[var(--brand-accent)] bg-[var(--brand-surface)] p-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm"
        >
          <div className="flex items-start gap-2.5">
            <Info
              className="w-4 h-4 text-[var(--brand-accent)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <strong className="text-[var(--text-primary)]">
                Similar title already in My Songs:
              </strong>{' '}
              <span className="text-[var(--text-secondary)]">
                You already have a personal song titled &ldquo;
                {duplicateTitleCustomSong.title}&rdquo;. Saving will create a
                separate custom song with its own unique ID unless you cancel
                and edit the existing song.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Submission Validation Error Banner */}
      {submitError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2.5"
        >
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Mobile Edit / Live Preview Switcher */}
      <div
        role="tablist"
        aria-label="Editor and Preview Mode"
        className="lg:hidden grid grid-cols-2 gap-2 p-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] sticky top-14 z-20"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'edit'}
          onClick={() => setMobileTab('edit')}
          className={`h-10 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
            mobileTab === 'edit'
              ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <PenLine className="w-4 h-4" aria-hidden="true" />
          <span>Edit Chart ({sections.length} Sections)</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'preview'}
          onClick={() => setMobileTab('preview')}
          className={`h-10 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
            mobileTab === 'preview'
              ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Eye className="w-4 h-4" aria-hidden="true" />
          <span>Live Chart Preview</span>
        </button>
      </div>

      {/* Main Split Workspace (Desktop 12-Col Grid / Mobile Tabbed) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Metadata + Section & Line Editor */}
        <div
          className={`lg:col-span-7 space-y-6 ${
            mobileTab === 'preview' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* 1. Song Metadata Card */}
          <fieldset className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
            <legend className="text-base font-bold px-1">
              1. Song Details & Key
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Song Title (Required) */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="song-title-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1"
                >
                  Song Title <span className="text-rose-500">*</span>
                </label>
                <input
                  id="song-title-input"
                  name="title"
                  type="text"
                  required
                  value={title}
                  onBlur={() => setTitleTouched(true)}
                  onChange={(e) => {
                    setIsDirty(true);
                    setTitle(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  aria-invalid={showTitleError ? 'true' : 'false'}
                  aria-describedby="song-title-help"
                  placeholder="e.g., Great Is Your Faithfulness / Tapat Kailanpaman"
                  className={`w-full h-11 px-3.5 rounded-xl border bg-[var(--bg-subtle)] text-base font-medium focus:bg-[var(--bg-surface)] ${
                    showTitleError
                      ? 'border-rose-500'
                      : 'border-[var(--border-strong)]'
                  }`}
                />
                {showTitleError ? (
                  <p
                    id="song-title-help"
                    className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium"
                  >
                    Please enter a song title before saving.
                  </p>
                ) : (
                  <p
                    id="song-title-help"
                    className="text-xs text-[var(--text-secondary)] mt-1"
                  >
                    Required. Saved locally on this device with a unique personal song ID.
                  </p>
                )}
              </div>

              {/* Artist / Attribution */}
              <div>
                <label
                  htmlFor="song-artist-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1"
                >
                  Artist / Ministry (Optional)
                </label>
                <input
                  id="song-artist-input"
                  name="artist"
                  type="text"
                  value={artist}
                  onChange={(e) => {
                    setIsDirty(true);
                    setArtist(e.target.value);
                  }}
                  placeholder="e.g., Hope Chapel Worship"
                  className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm sm:text-base focus:bg-[var(--bg-surface)]"
                />
              </div>

              {/* Original Key */}
              <div>
                <label
                  htmlFor="song-key-select"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1"
                >
                  Original Key
                </label>
                <select
                  id="song-key-select"
                  name="originalKey"
                  value={originalKey}
                  onChange={(e) => {
                    setIsDirty(true);
                    setOriginalKey(e.target.value);
                    setPreviewSemitones(0);
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm sm:text-base font-mono font-bold cursor-pointer"
                >
                  {ALL_KEY_CHOICES.map((k) => (
                    <option key={k} value={k}>
                      Key of {k}
                    </option>
                  ))}
                </select>
              </div>

              {/* Language */}
              <div>
                <label
                  htmlFor="song-language-select"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1"
                >
                  Language
                </label>
                <select
                  id="song-language-select"
                  name="language"
                  value={languageCode}
                  onChange={(e) => {
                    setIsDirty(true);
                    setLanguageCode(e.target.value);
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm sm:text-base cursor-pointer"
                >
                  {LANGUAGE_PRESETS.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
                {languageCode === 'other' && (
                  <input
                    type="text"
                    value={customLanguageLabel}
                    onChange={(e) => {
                      setIsDirty(true);
                      setCustomLanguageLabel(e.target.value);
                    }}
                    placeholder="Specify language name..."
                    aria-label="Custom language name"
                    className="mt-2 w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm"
                  />
                )}
              </div>

              {/* Category / Genre */}
              <div>
                <label
                  htmlFor="song-category-select"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1"
                >
                  Category / Genre
                </label>
                <select
                  id="song-category-select"
                  name="category"
                  value={categoryId}
                  onChange={(e) => {
                    setIsDirty(true);
                    setCategoryId(e.target.value as SongCategoryId);
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm sm:text-base cursor-pointer"
                >
                  {CATEGORY_PRESETS.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Expandable Advanced Metadata */}
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                aria-expanded={showAdvancedMeta}
                aria-controls="advanced-metadata-panel"
                onClick={() => setShowAdvancedMeta((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--brand-accent)] hover:underline cursor-pointer"
              >
                {showAdvancedMeta ? (
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                )}
                <span>
                  {showAdvancedMeta
                    ? 'Hide Advanced Metadata (Writers, Tempo, Time, Capo, Notes)'
                    : 'Show Advanced Metadata (Writers, Tempo, Time, Capo, Notes)'}
                </span>
              </button>

              {showAdvancedMeta && (
                <div
                  id="advanced-metadata-panel"
                  className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4"
                >
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="song-writers-input"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      Writers / Composers (comma-separated)
                    </label>
                    <input
                      id="song-writers-input"
                      name="writers"
                      type="text"
                      value={writersInput}
                      onChange={(e) => {
                        setIsDirty(true);
                        setWritersInput(e.target.value);
                      }}
                      placeholder="e.g., Maria Santos, David Cruz"
                      className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="song-subtitle-input"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      Subtitle (Optional)
                    </label>
                    <input
                      id="song-subtitle-input"
                      name="subtitle"
                      type="text"
                      value={subtitle}
                      onChange={(e) => {
                        setIsDirty(true);
                        setSubtitle(e.target.value);
                      }}
                      placeholder="e.g., Acoustic Arrangement"
                      className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="song-tempo-input"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      Tempo (BPM)
                    </label>
                    <input
                      id="song-tempo-input"
                      name="tempoBpm"
                      type="text"
                      inputMode="numeric"
                      value={tempoInput}
                      onBlur={() => setTempoTouched(true)}
                      onChange={(e) => {
                        setIsDirty(true);
                        setTempoInput(e.target.value);
                      }}
                      aria-invalid={showTempoError ? 'true' : 'false'}
                      placeholder="e.g., 72"
                      className={`w-full h-10 px-3 rounded-xl border bg-[var(--bg-subtle)] text-sm font-mono ${
                        showTempoError
                          ? 'border-rose-500'
                          : 'border-[var(--border-subtle)]'
                      }`}
                    />
                    {showTempoError && (
                      <p className="text-xs text-rose-500 mt-1">
                        Enter 20–320 BPM.
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="song-time-select"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      Time Signature
                    </label>
                    <select
                      id="song-time-select"
                      name="timeSignature"
                      value={timeSignature}
                      onChange={(e) => {
                        setIsDirty(true);
                        setTimeSignature(e.target.value);
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-mono cursor-pointer"
                    >
                      <option value="">Not specified</option>
                      {TIME_SIGNATURE_PRESETS.map((ts) => (
                        <option key={ts} value={ts}>
                          {ts}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="song-capo-input"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      Recommended Capo (0–12)
                    </label>
                    <input
                      id="song-capo-input"
                      name="capo"
                      type="text"
                      inputMode="numeric"
                      value={capoInput}
                      onChange={(e) => {
                        setIsDirty(true);
                        setCapoInput(e.target.value);
                      }}
                      placeholder="e.g., 2"
                      className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-mono"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="song-attribution-input"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      Attribution / Copyright Line (Optional)
                    </label>
                    <input
                      id="song-attribution-input"
                      name="attribution"
                      type="text"
                      value={attribution}
                      onChange={(e) => {
                        setIsDirty(true);
                        setAttribution(e.target.value);
                      }}
                      placeholder="e.g., © 2026 Local Church Music Ministry · Used by permission"
                      className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="song-notes-textarea"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      Song Source / Arrangement Notes (Optional)
                    </label>
                    <textarea
                      id="song-notes-textarea"
                      name="sourceNotes"
                      rows={2}
                      value={sourceNotes}
                      onChange={(e) => {
                        setIsDirty(true);
                        setSourceNotes(e.target.value);
                      }}
                      placeholder="Arrangement notes, hymnal reference, or rehearsal instructions..."
                      className="w-full p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="song-rights-textarea"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      Rights & Permission Notes (Optional)
                    </label>
                    <input
                      id="song-rights-textarea"
                      name="rightsNotes"
                      type="text"
                      value={rightsNotes}
                      onChange={(e) => {
                        setIsDirty(true);
                        setRightsNotes(e.target.value);
                      }}
                      placeholder="e.g., Original church composition / Public domain hymn"
                      className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          {/* 2. Quick One-Tap Chord Inserter Palette */}
          <section
            aria-label="Quick Chord Inserter"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                <Music
                  className="w-4 h-4 text-[var(--brand-accent)]"
                  aria-hidden="true"
                />
                <span>
                  One-Tap Chord Palette (Key of {originalKey})
                </span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                Place cursor in any line below, then tap a chord to insert{' '}
                <code className="font-mono">[Chord]</code>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {suggestedChords.map((chord) => (
                <button
                  key={chord}
                  type="button"
                  onClick={() => handleInsertChordIntoActiveLine(chord)}
                  className="h-9 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--brand-surface)] text-[var(--brand-accent)] font-mono font-bold text-xs sm:text-sm hover:opacity-90 cursor-pointer"
                >
                  +{chord}
                </button>
              ))}

              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="text"
                  value={customChordToInsert}
                  onChange={(e) => setCustomChordToInsert(e.target.value)}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Custom (e.g. D/F#)"
                  aria-label="Custom chord symbol to insert at cursor"
                  className="h-9 w-36 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] font-mono text-xs sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customChordToInsert.trim()) {
                      handleInsertChordIntoActiveLine(customChordToInsert);
                      setCustomChordToInsert('');
                    }
                  }}
                  className="h-9 px-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-semibold hover:border-[var(--brand-accent)] cursor-pointer"
                >
                  Insert
                </button>
              </div>
            </div>
          </section>

          {/* 3. Song Sections & Lines Editor */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold">
                2. Song Sections, Chords & Lyrics ({sections.length})
              </h3>
              <span className="text-xs text-[var(--text-secondary)]">
                Use <code className="font-mono">[Chord]lyric</code> or open{' '}
                <strong>Segment Editor</strong> on any line
              </span>
            </div>

            {sections.map((sec, secIdx) => (
              <div
                key={sec.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4"
              >
                {/* Section Header Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[14rem]">
                    <select
                      aria-label={`Section ${secIdx + 1} type`}
                      value={sec.type}
                      onChange={(e) => {
                        const nextType = e.target.value as SectionType;
                        handleUpdateSectionMeta(sec.id, { type: nextType });
                      }}
                      className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold uppercase tracking-wider cursor-pointer"
                    >
                      {SECTION_TYPE_PRESETS.map((p) => (
                        <option key={p.type} value={p.type}>
                          {p.defaultLabel}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={sec.label}
                      onChange={(e) =>
                        handleUpdateSectionMeta(sec.id, {
                          label: e.target.value,
                        })
                      }
                      aria-label={`Section ${secIdx + 1} display label`}
                      placeholder="Section Label (e.g. Verse 1, Chorus)"
                      className="h-9 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm font-bold flex-1 min-w-[9rem]"
                    />
                  </div>

                  {/* Section Reorder / Duplicate / Delete */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveSection(secIdx, 'up')}
                      disabled={secIdx === 0}
                      title="Move section up"
                      aria-label={`Move ${sec.label} up`}
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] inline-flex items-center justify-center disabled:opacity-40 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSection(secIdx, 'down')}
                      disabled={secIdx === sections.length - 1}
                      title="Move section down"
                      aria-label={`Move ${sec.label} down`}
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] inline-flex items-center justify-center disabled:opacity-40 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateSection(secIdx)}
                      title="Duplicate section"
                      aria-label={`Duplicate ${sec.label}`}
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] inline-flex items-center justify-center hover:text-[var(--brand-accent)] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSection(secIdx)}
                      title="Delete section"
                      aria-label={`Delete ${sec.label}`}
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-rose-500 inline-flex items-center justify-center hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Section Performance Cue */}
                <div>
                  <input
                    type="text"
                    value={sec.cue}
                    onChange={(e) =>
                      handleUpdateSectionMeta(sec.id, { cue: e.target.value })
                    }
                    placeholder="Optional section cue or performance instruction (e.g., Softly on acoustic, Repeat 2x)..."
                    aria-label={`${sec.label} performance cue`}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs italic"
                  />
                </div>

                {/* Lines inside Section */}
                <div className="space-y-3">
                  {sec.lines.map((line, lineIdx) => (
                    <div
                      key={line.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 space-y-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[var(--text-secondary)] w-6 shrink-0">
                          L{lineIdx + 1}
                        </span>

                        <input
                          ref={(el) => {
                            lineInputRefs.current[line.id] = el;
                          }}
                          type="text"
                          value={line.bracketText}
                          onFocus={(e) =>
                            setActiveLineCursor({
                              sectionId: sec.id,
                              lineId: line.id,
                              cursor:
                                e.currentTarget.selectionStart ??
                                line.bracketText.length,
                            })
                          }
                          onClick={(e) =>
                            setActiveLineCursor({
                              sectionId: sec.id,
                              lineId: line.id,
                              cursor:
                                e.currentTarget.selectionStart ??
                                line.bracketText.length,
                            })
                          }
                          onKeyUp={(e) =>
                            setActiveLineCursor({
                              sectionId: sec.id,
                              lineId: line.id,
                              cursor:
                                e.currentTarget.selectionStart ??
                                line.bracketText.length,
                            })
                          }
                          onChange={(e) => {
                            const nextVal = e.target.value;
                            const nextPos =
                              e.target.selectionStart ?? nextVal.length;
                            handleLineBracketTextChange(
                              sec.id,
                              line.id,
                              nextVal
                            );
                            setActiveLineCursor({
                              sectionId: sec.id,
                              lineId: line.id,
                              cursor: nextPos,
                            });
                          }}
                          placeholder="e.g., [G]Amazing grace how [C]sweet the [G]sound (or chord-only: [G] [D/F#] [Em7] [C])"
                          aria-label={`${sec.label} line ${
                            lineIdx + 1
                          } chords and lyrics`}
                          className="flex-1 h-10 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm sm:text-base font-mono"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            handleToggleSegmentEditor(sec.id, line.id)
                          }
                          title="Toggle visual chord/lyric segment blocks"
                          className={`h-9 px-2.5 rounded-lg border text-xs font-semibold shrink-0 cursor-pointer ${
                            line.showSegmentEditor
                              ? 'border-[var(--brand-accent)] bg-[var(--brand-surface)] text-[var(--brand-accent)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                          }`}
                        >
                          Segments ({line.segments.length})
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleMoveLine(sec.id, lineIdx, 'up')
                          }
                          disabled={lineIdx === 0}
                          aria-label={`Move line ${lineIdx + 1} up`}
                          className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] inline-flex items-center justify-center disabled:opacity-40 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleMoveLine(sec.id, lineIdx, 'down')
                          }
                          disabled={lineIdx === sec.lines.length - 1}
                          aria-label={`Move line ${lineIdx + 1} down`}
                          className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] inline-flex items-center justify-center disabled:opacity-40 cursor-pointer"
                        >
                          <ArrowDown
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLine(sec.id, lineIdx)}
                          aria-label={`Delete line ${lineIdx + 1}`}
                          className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-rose-500 inline-flex items-center justify-center hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      {/* Optional Line Performance Note */}
                      <div className="flex flex-wrap items-center gap-2 pl-8">
                        <input
                          type="text"
                          value={line.annotation}
                          onChange={(e) =>
                            handleLineAnnotationChange(
                              sec.id,
                              line.id,
                              e.target.value
                            )
                          }
                          placeholder="Optional line cue (e.g., Repeat 2x, Acapella)..."
                          aria-label={`${sec.label} line ${
                            lineIdx + 1
                          } performance note`}
                          className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs italic"
                        />
                        {line.isInstrumental && (
                          <span className="text-[0.6875rem] font-semibold px-2 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                            Instrumental / Chord-Only Line
                          </span>
                        )}
                      </div>

                      {/* Structured Segment Editor (No Bracket Typing Needed!) */}
                      {line.showSegmentEditor && (
                        <div className="pl-8 pt-2 border-t border-[var(--border-subtle)] space-y-2">
                          <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center justify-between">
                            <span>
                              Visual Segment Editor — Edit each chord and its
                              attached lyric phrase independently:
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleAddSegmentToLine(sec.id, line.id)
                              }
                              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-accent)] hover:underline cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Add Segment</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {line.segments.map((seg, segIdx) => (
                              <div
                                key={`${line.id}-seg-${segIdx}`}
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 flex items-center gap-2"
                              >
                                <div className="w-20 shrink-0">
                                  <label className="block text-[0.625rem] uppercase font-bold text-[var(--brand-accent)]">
                                    Chord
                                  </label>
                                  <input
                                    type="text"
                                    value={seg.chord ?? ''}
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    onChange={(e) =>
                                      handleSegmentUpdate(
                                        sec.id,
                                        line.id,
                                        segIdx,
                                        { chord: e.target.value }
                                      )
                                    }
                                    placeholder="e.g. G"
                                    aria-label={`Line ${lineIdx + 1} segment ${
                                      segIdx + 1
                                    } chord`}
                                    className="w-full h-8 px-2 rounded border border-[var(--border-strong)] bg-[var(--bg-subtle)] font-mono font-bold text-xs text-[var(--chord-color)]"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <label className="block text-[0.625rem] uppercase font-bold text-[var(--text-secondary)]">
                                    Lyric Text
                                  </label>
                                  <input
                                    type="text"
                                    value={seg.text}
                                    onChange={(e) =>
                                      handleSegmentUpdate(
                                        sec.id,
                                        line.id,
                                        segIdx,
                                        { text: e.target.value }
                                      )
                                    }
                                    placeholder="Lyric phrase..."
                                    aria-label={`Line ${lineIdx + 1} segment ${
                                      segIdx + 1
                                    } lyric`}
                                    className="w-full h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveSegmentFromLine(
                                      sec.id,
                                      line.id,
                                      segIdx
                                    )
                                  }
                                  aria-label={`Remove segment ${segIdx + 1}`}
                                  className="w-7 h-7 rounded text-[var(--text-secondary)] hover:text-rose-500 inline-flex items-center justify-center shrink-0 mt-3 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => handleAddLine(sec.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-dashed border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--brand-accent)] hover:border-[var(--brand-accent)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Add Line to {sec.label}</span>
                  </button>
                </div>
              </div>
            ))}

            {/* Add Section Bar */}
            <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Add Song Section
              </div>
              <div className="flex flex-wrap gap-2">
                {SECTION_TYPE_PRESETS.map((preset) => (
                  <button
                    key={preset.type}
                    type="button"
                    onClick={() => handleAddSection(preset.type)}
                    className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus
                      className="w-3.5 h-3.5 text-[var(--brand-accent)]"
                      aria-hidden="true"
                    />
                    <span>{preset.defaultLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Content & Rights Responsibility Notice */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert
                className="w-5 h-5 text-[var(--brand-accent)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1 text-xs sm:text-sm">
                <h3 className="font-bold text-[var(--text-primary)]">
                  Content Responsibility & Device-Local Privacy
                </h3>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Personal songs are stored privately on this device only and
                  are never uploaded to a public catalog. Creating or importing
                  a song chart does not grant copyright ownership or legal
                  clearance. You are responsible for ensuring you have the right
                  to store and use any lyrics, chords, and arrangements you add.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-3 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                name="rightsAcknowledged"
                checked={rightsAcknowledged}
                onChange={(e) => {
                  setIsDirty(true);
                  setRightsAcknowledged(e.target.checked);
                  if (submitError) setSubmitError(null);
                }}
                className="mt-0.5 w-4 h-4 rounded accent-[var(--brand-accent)] cursor-pointer"
              />
              <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)]">
                I understand that I am responsible for having the right to store
                and use the lyrics and chord chart provided here on this device.
              </span>
            </label>
          </div>

          {/* Bottom Save / Cancel Bar */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancelClick}
              className="h-11 px-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-11 px-6 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>
                {isSaving
                  ? 'Saving...'
                  : isEditingExisting
                  ? 'Save Song Changes'
                  : 'Save to My Songs'}
              </span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Rendered Chord Chart Preview (with Transposition Test) */}
        <aside
          aria-label="Live Rendered Chord Chart Preview"
          className={`lg:col-span-5 lg:sticky lg:top-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 ${
            mobileTab === 'edit' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--brand-accent)] block">
                Live Chart Preview
              </span>
              <h3 className="text-lg font-bold leading-snug">
                {previewSong.title || 'Untitled Song'}
              </h3>
              {previewSong.subtitle && (
                <p className="text-xs text-[var(--text-secondary)]">
                  {previewSong.subtitle}
                </p>
              )}
            </div>

            {/* Test Transpose Controls in Preview */}
            <div className="flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1">
              <button
                type="button"
                onClick={() =>
                  setPreviewSemitones((s) => normalizeSemitones(s - 1))
                }
                aria-label="Preview transpose down 1 semitone"
                className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] inline-flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span className="px-2 font-mono font-bold text-xs text-[var(--brand-accent)]">
                Key: {previewDisplayedKey}
                {previewNormalizedSemitones !== 0 &&
                  ` (${formatSignedSemitones(previewNormalizedSemitones)})`}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPreviewSemitones((s) => normalizeSemitones(s + 1))
                }
                aria-label="Preview transpose up 1 semitone"
                className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] inline-flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              {previewNormalizedSemitones !== 0 && (
                <button
                  type="button"
                  onClick={() => setPreviewSemitones(0)}
                  title="Reset preview to original key"
                  className="px-2 h-8 text-[0.6875rem] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Orig ({currentDraftRecord.originalKey})</span>
                </button>
              )}
            </div>
          </div>

          {/* Preview Metadata Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            {previewSong.artist && (
              <span className="font-medium text-[var(--text-primary)]">
                {previewSong.artist}
              </span>
            )}
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)]">
              {previewSong.language.label}
            </span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)]">
              {previewSong.category.label}
            </span>
            {previewSong.tempoBpm && (
              <span className="font-mono">{previewSong.tempoBpm} BPM</span>
            )}
            {previewSong.timeSignature && (
              <span className="font-mono">{previewSong.timeSignature}</span>
            )}
            {previewSong.capo !== undefined && previewSong.capo > 0 && (
              <span className="font-mono text-[var(--brand-accent)] font-semibold">
                Capo {previewSong.capo}
              </span>
            )}
          </div>

          {previewNormalizedSemitones !== 0 && (
            <div className="rounded-lg bg-[var(--brand-surface)] px-3 py-1.5 text-xs text-[var(--brand-accent)] flex items-center justify-between">
              <span>
                Previewing transposed to <strong>{previewDisplayedKey}</strong>.
                Saved chart stays in original key{' '}
                <strong>{currentDraftRecord.originalKey}</strong>.
              </span>
            </div>
          )}

          {/* Rendered Sections */}
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {previewSong.sections.map((section) => (
              <div
                key={section.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand-accent)]">
                    {section.label}
                  </span>
                  {section.cue && (
                    <span className="text-xs italic text-[var(--text-secondary)]">
                      {section.cue}
                    </span>
                  )}
                </div>

                <div className="space-y-2 overflow-x-auto">
                  {section.lines.map((line, lIdx) => {
                    const isChordOnly =
                      line.isInstrumental ||
                      (line.segments.some((s) => Boolean(s.chord)) &&
                        line.segments.every((s) => s.text.trim() === ''));

                    return (
                      <div key={line.id ?? lIdx} className="space-y-0.5">
                        {line.annotation && (
                          <div className="text-xs italic text-[var(--text-secondary)]">
                            [{line.annotation}]
                          </div>
                        )}

                        {isChordOnly ? (
                          <div className="flex flex-wrap items-center gap-2 py-0.5">
                            {line.segments
                              .filter((s) => Boolean(s.chord))
                              .map((seg, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--chord-color)]"
                                >
                                  {seg.chord}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-end leading-snug">
                            {line.segments.map((seg, sIdx) => (
                              <span
                                key={sIdx}
                                className="inline-flex flex-col mr-1.5 min-w-[1.25rem]"
                              >
                                <span className="font-mono font-bold text-xs sm:text-sm text-[var(--chord-color)] min-h-[1.125rem] whitespace-pre">
                                  {seg.chord || '\u00A0'}
                                </span>
                                <span className="text-sm text-[var(--text-primary)] whitespace-pre">
                                  {seg.text || '\u00A0'}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {previewSong.attribution && (
            <div className="pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              {previewSong.attribution}
            </div>
          )}
        </aside>
      </div>
    </form>
  );
}
