import type { SongRecord } from './song';

export type UserRole = 'admin' | 'user';

export interface CloudStorageConfig {
  provider: 'gdrive' | 'none';
  folderUrl?: string;
  folderName?: string;
  connectedAt?: string;
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
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

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
