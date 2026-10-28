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
  activeLiveSessionId?: string;
  activeLiveSessionJoinCode?: string;
  activeLiveSessionExpiresAt?: string;
  activeLiveSessionLeaderName?: string;
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
  lastSyncedAt: string;
}
