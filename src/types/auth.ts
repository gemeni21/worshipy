import type { SongRecord, SetlistItem } from './song';

export type UserRole = 'admin' | 'user';

export interface CloudStorageConfig {
  provider: 'gdrive' | 'none';
  folderUrl?: string;
  folderName?: string;
  connectedAt?: string;
}

export interface GroupMember {
  userId: string;
  email: string;
  displayName: string;
  instrument?: string;
  photoURL?: string;
  role: 'leader' | 'member';
  joinedAt: string;
}

export interface TeamPresenceRecord {
  userId: string;
  displayName: string;
  instrument?: string;
  photoURL?: string;
  online: boolean;
  lastSeen: string;
  currentSong?: string;
}

export interface TeamPracticeTake {
  id: string;
  songId: string;
  songTitle: string;
  title: string;
  authorName: string;
  authorId: string;
  createdAt: string;
  durationSeconds: number;
  audioUrl?: string;
  notes?: string;
  instrumentTag?: string;
  isLeaderTake?: boolean;
}

export interface TeamActiveSetlist {
  id: string;
  name: string;
  description?: string;
  publishedAt: string;
  publishedBy: string;
  publishedByName?: string;
  items: SetlistItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamSetlistSuggestion {
  id: string;
  setlist: TeamActiveSetlist;
  suggestedBy: string;
  suggestedByName: string;
  suggestedByRole?: string;
  suggestedAt: string;
  targetServiceDate?: string;
  note?: string;
  status: 'pending' | 'approved' | 'declined';
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export type ArrangementInstrumentScope = 'general' | 'guitar' | 'keyboard' | 'bass';

export interface TeamSongArrangement {
  /** Composite key: `${songId}:${instrument}` */
  id: string;
  songId: string;
  songTitle?: string;
  instrument: ArrangementInstrumentScope;
  /** ChordPro stored in the song's base originalKey (semitones = 0) */
  chordPro: string;
  arrangementNote?: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName?: string;
}

export interface TeamArrangementSuggestion {
  id: string;
  songId: string;
  songTitle: string;
  instrument: ArrangementInstrumentScope;
  /** ChordPro stored in the song's base originalKey (semitones = 0) */
  chordPro: string;
  arrangementNote?: string;
  suggestedBy: string;
  suggestedByName: string;
  suggestedByInstrument?: string;
  suggestedAt: string;
  status: 'pending' | 'approved' | 'declined';
  approvedScope?: ArrangementInstrumentScope;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface WorshipGroup {
  id: string;
  name: string;
  churchName?: string;
  customAppTitle?: string;
  customAppLogoUrl?: string;
  inviteCode: string; // 6-character unique code e.g. "D7FLWV"
  ownerId: string;
  createdAt: string;
  members: GroupMember[];
  practiceTakes?: TeamPracticeTake[];
  activeSetlist?: TeamActiveSetlist;
  suggestedSetlists?: TeamSetlistSuggestion[];
  /** Approved church-group song arrangements keyed by `${songId}:${instrument}` */
  songArrangements?: Record<string, TeamSongArrangement>;
  /** Member-proposed song arrangements awaiting leader review */
  suggestedArrangements?: TeamArrangementSuggestion[];
  activeLiveSessionId?: string;
  activeLiveSessionJoinCode?: string;
  activeLiveSessionExpiresAt?: string;
  activeLiveSessionLeaderName?: string;
  /**
   * Monotonic server-side revision (epoch ms) stamped by the Cloud Hub whenever this
   * group's content changes. Clients use it to ignore stale copies served by other
   * (serverless) instances so the Team Hub never flip-flops between versions.
   */
  serverRevision?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  churchName?: string;
  instrument?: string; // e.g., 'Worship Leader', 'Acoustic Guitar', 'Keys / Piano', 'Bass', 'Vocalist', 'Drums'
  role: UserRole;
  createdAt: string;
  lastActiveAt: string;
  cloudStorage?: CloudStorageConfig;
  groupId?: string;
  groupName?: string;
  groupRole?: 'leader' | 'member';
  photoURL?: string;
  emailVerified?: boolean;
  authProvider?: 'google' | 'password';
}

export interface EmailNotificationRecord {
  id: string;
  to: string;
  from: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  sentAt: string;
  type: 'song_submission' | 'song_resubmission' | 'admin_alert';
  status: 'sent' | 'queued' | 'simulated';
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'removed';

export interface RemovedGlobalSongRecord {
  id: string;
  slug: string;
  title: string;
  artist?: string;
  removedAt: string;
  removedBy: {
    userId: string;
    email: string;
    displayName: string;
  };
  reason?: string;
}

export interface SongSubmission {
  id: string;
  songId: string;
  song: SongRecord;
  submittedBy: {
    userId: string;
    email: string;
    displayName: string;
    churchName?: string;
  };
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: {
    userId: string;
    email: string;
    displayName: string;
  };
  adminNotes?: string;
  submissionNotes?: string;
}

export interface UserCloudSyncPayload {
  customSongs: SongRecord[];
  setlists: unknown[];
  favorites: string[];
  personalArrangements?: Record<string, TeamSongArrangement>;
  lastSyncedAt: string;
}
