export type LanguageCode = 'en' | 'fil' | string;

export interface SongLanguage {
  code: LanguageCode;
  label: string;
}

export type SongCategoryId =
  | 'contemporary-worship'
  | 'hymn'
  | 'gospel'
  | 'filipino-worship'
  | 'other';

export interface SongCategory {
  id: SongCategoryId;
  label: string;
}

export type ContentStatus =
  | 'demo'
  | 'original'
  | 'authorized'
  | 'public-domain'
  | 'other';

export type SongDifficulty = 'easy' | 'intermediate' | 'advanced';

export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'interlude'
  | 'tag'
  | 'instrumental'
  | 'outro'
  | 'other';

export interface ChordLyricSegment {
  /** Optional chord symbol positioned above the lyric fragment (e.g., "G", "D/F#", "N.C.") */
  chord?: string;
  /** Lyric fragment associated with this chord (may be empty for chord-only/instrumental measures) */
  text: string;
}

export interface SongLine {
  id?: string;
  /** Optional performance note or cue for this specific line (never transposed) */
  annotation?: string;
  /** True if this line consists purely of chords without sung lyrics */
  isInstrumental?: boolean;
  segments: ChordLyricSegment[];
}

export interface SongSection {
  id: string;
  type: SectionType;
  /** Display label such as "Intro", "Verse 1", "Chorus", "Tulay (Bridge)" */
  label: string;
  /** Optional section-level performance cue (never transposed) */
  cue?: string;
  lines: SongLine[];
}

export type SongSourceType = 'catalog' | 'custom';

export interface SongImportProvenance {
  fileName?: string;
  importedAt: string;
  format: 'chordpro';
  warnings?: string[];
}

export interface SongRecord {
  id: string;
  slug: string;
  /** Distinguishes built-in seed catalog songs from user-created local songs */
  sourceType?: SongSourceType;
  title: string;
  subtitle?: string;
  artist?: string;
  writers?: string[];
  language: SongLanguage;
  category: SongCategory;
  /** Musical key such as "G", "D", "Bb", "Am", "F#m" */
  originalKey: string;
  tempoBpm?: number;
  timeSignature?: string;
  capo?: number;
  difficulty?: SongDifficulty;
  /**
   * Internal content tracking status.
   * NOTE: Does not imply legal clearance merely because a record has a label.
   */
  contentStatus: ContentStatus;
  attribution?: string;
  sourceNotes?: string;
  rightsNotes?: string;
  rightsAcknowledged?: boolean;
  createdAt?: string;
  updatedAt?: string;
  importProvenance?: SongImportProvenance;
  sections: SongSection[];
}

export type EnharmonicPreference = 'auto' | 'sharp' | 'flat';

export type ChartFontSize = 'sm' | 'md' | 'lg' | 'xl';

export type ChartColumnsPreference = '1' | '2';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface UserSettings {
  theme: ThemePreference;
  chartFontSize: ChartFontSize;
  enharmonicPreference: EnharmonicPreference;
  chartColumns?: ChartColumnsPreference;
}

export interface SetlistItem {
  songId: string;
  addedAt: string;
  /** Optional preferred transposition semitone offset for this song in this setlist */
  preferredSemitones?: number;
  notes?: string;
}

export interface PersonalSetlist {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  items: SetlistItem[];
}

export interface OfflineSongEntry {
  songId: string;
  savedAt: string;
  version: number;
  song: SongRecord;
}
