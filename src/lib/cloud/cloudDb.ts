import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { SongRecord } from '@/types/song';
import type {
  RemovedGlobalSongRecord,
  SongSubmission,
  SubmissionStatus,
  UserCloudSyncPayload,
  UserProfile,
  UserRole,
} from '@/types/auth';

interface StoredUser {
  profile: UserProfile;
  passwordHash: string;
  salt: string;
}

interface StoredSession {
  token: string;
  userId: string;
  expiresAt: string;
}

interface CloudStoreSchema {
  users: Record<string, StoredUser>;
  sessions: Record<string, StoredSession>;
  userSyncData: Record<string, UserCloudSyncPayload>;
  submissions: Record<string, SongSubmission>;
  approvedGlobalSongs: Record<string, SongRecord>;
  removedGlobalSongs?: Record<string, RemovedGlobalSongRecord>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'cloud-store.json');

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function ensureDataStore(): CloudStoreSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed.removedGlobalSongs) parsed.removedGlobalSongs = {};
      return parsed;
    }
  } catch (err) {
    console.error('Error reading cloud store file, reinitializing default store:', err);
  }

  // Initial Seed Store with default Admin and Demo Leader
  const adminSalt = crypto.randomBytes(16).toString('hex');
  const adminId = 'user_admin_001';
  const adminUser: StoredUser = {
    profile: {
      id: adminId,
      email: 'admin@worshipy.app',
      displayName: 'Worshipy Admin',
      churchName: 'Central Worship Community',
      instrument: 'Worship Leader & Music Director',
      role: 'admin',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      cloudStorage: { provider: 'none' },
    },
    salt: adminSalt,
    passwordHash: hashPassword('admin123456', adminSalt),
  };

  const leaderSalt = crypto.randomBytes(16).toString('hex');
  const leaderId = 'user_leader_002';
  const leaderUser: StoredUser = {
    profile: {
      id: leaderId,
      email: 'worshipleader@church.com',
      displayName: 'David Worship',
      churchName: 'Grace Community Church',
      instrument: 'Acoustic Guitar / Lead Vocals',
      role: 'user',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      cloudStorage: { provider: 'none' },
    },
    salt: leaderSalt,
    passwordHash: hashPassword('password123', leaderSalt),
  };

  const initialStore: CloudStoreSchema = {
    users: {
      [adminUser.profile.email.toLowerCase()]: adminUser,
      [leaderUser.profile.email.toLowerCase()]: leaderUser,
    },
    sessions: {},
    userSyncData: {},
    submissions: {},
    approvedGlobalSongs: {},
    removedGlobalSongs: {},
  };

  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(initialStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write initial cloud store:', err);
  }

  return initialStore;
}

function saveStore(store: CloudStoreSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${STORE_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempFile, STORE_FILE);
  } catch (err) {
    console.error('Failed to persist cloud store:', err);
  }
}

// User Authentication & Management
export function findUserByEmail(email: string): UserProfile | null {
  const store = ensureDataStore();
  const normalized = email.toLowerCase().trim();
  const stored = store.users[normalized];
  return stored ? stored.profile : null;
}

export function findUserById(id: string): UserProfile | null {
  const store = ensureDataStore();
  for (const stored of Object.values(store.users)) {
    if (stored.profile.id === id) {
      return stored.profile;
    }
  }
  return null;
}

export function registerUser(params: {
  email: string;
  password: string;
  displayName: string;
  churchName?: string;
  instrument?: string;
  role?: UserRole;
}): { profile: UserProfile; token: string } {
  const store = ensureDataStore();
  const normalizedEmail = params.email.toLowerCase().trim();

  if (store.users[normalizedEmail]) {
    throw new Error('An account with this email address already exists.');
  }

  if (params.password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(params.password, salt);
  const now = new Date().toISOString();
  const userId = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const profile: UserProfile = {
    id: userId,
    email: normalizedEmail,
    displayName: params.displayName.trim() || normalizedEmail.split('@')[0],
    churchName: params.churchName?.trim() || undefined,
    instrument: params.instrument?.trim() || 'Worship Leader',
    role: params.role || (normalizedEmail === 'admin@worshipy.app' ? 'admin' : 'user'),
    createdAt: now,
    lastActiveAt: now,
    cloudStorage: { provider: 'none' },
  };

  store.users[normalizedEmail] = {
    profile,
    salt,
    passwordHash,
  };

  const token = createSessionForUser(store, userId);
  saveStore(store);

  return { profile, token };
}

export function verifyUserLogin(email: string, password: string): { profile: UserProfile; token: string } {
  const store = ensureDataStore();
  const normalizedEmail = email.toLowerCase().trim();
  const stored = store.users[normalizedEmail];

  if (!stored) {
    throw new Error('Invalid email or password.');
  }

  const calculatedHash = hashPassword(password, stored.salt);
  if (calculatedHash !== stored.passwordHash) {
    throw new Error('Invalid email or password.');
  }

  stored.profile.lastActiveAt = new Date().toISOString();
  const token = createSessionForUser(store, stored.profile.id);
  saveStore(store);

  return { profile: stored.profile, token };
}

function createSessionForUser(store: CloudStoreSchema, userId: string): string {
  const token = `wsess_${crypto.randomBytes(32).toString('hex')}`;
  // Sessions valid for 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  store.sessions[token] = {
    token,
    userId,
    expiresAt,
  };
  return token;
}

export function validateSessionToken(token: string): UserProfile | null {
  if (!token) return null;
  const store = ensureDataStore();
  const session = store.sessions[token];

  if (!session) return null;

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    delete store.sessions[token];
    saveStore(store);
    return null;
  }

  return findUserById(session.userId);
}

export function revokeSession(token: string): void {
  const store = ensureDataStore();
  if (store.sessions[token]) {
    delete store.sessions[token];
    saveStore(store);
  }
}

export function updateUserProfile(
  userId: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'churchName' | 'instrument' | 'cloudStorage'>>
): UserProfile {
  const store = ensureDataStore();
  let targetUser: StoredUser | null = null;

  for (const stored of Object.values(store.users)) {
    if (stored.profile.id === userId) {
      targetUser = stored;
      break;
    }
  }

  if (!targetUser) {
    throw new Error('User not found.');
  }

  if (updates.displayName !== undefined) targetUser.profile.displayName = updates.displayName.trim();
  if (updates.churchName !== undefined) targetUser.profile.churchName = updates.churchName.trim();
  if (updates.instrument !== undefined) targetUser.profile.instrument = updates.instrument.trim();
  if (updates.cloudStorage !== undefined) targetUser.profile.cloudStorage = updates.cloudStorage;
  targetUser.profile.lastActiveAt = new Date().toISOString();

  saveStore(store);
  return targetUser.profile;
}

// User Cross-Device Sync Storage
export function saveUserSync(userId: string, payload: UserCloudSyncPayload): UserCloudSyncPayload {
  const store = ensureDataStore();
  store.userSyncData[userId] = {
    ...payload,
    lastSyncedAt: new Date().toISOString(),
  };
  saveStore(store);
  return store.userSyncData[userId];
}

export function getUserSync(userId: string): UserCloudSyncPayload | null {
  const store = ensureDataStore();
  return store.userSyncData[userId] || null;
}

// Global Song Submissions & Curation System
export function submitSongForGlobalPublishing(params: {
  userId: string;
  song: SongRecord;
  submissionNotes?: string;
}): SongSubmission {
  const store = ensureDataStore();
  const user = findUserById(params.userId);
  if (!user) {
    throw new Error('User account not found.');
  }

  const submissionId = `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  const submission: SongSubmission = {
    id: submissionId,
    songId: params.song.id,
    song: {
      ...params.song,
      sourceType: 'custom',
    },
    submittedBy: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      churchName: user.churchName,
    },
    status: 'pending',
    submittedAt: now,
    submissionNotes: params.submissionNotes?.trim() || undefined,
  };

  store.submissions[submissionId] = submission;
  saveStore(store);
  return submission;
}

export function listSubmissions(filter?: {
  userId?: string;
  status?: SubmissionStatus;
}): SongSubmission[] {
  const store = ensureDataStore();
  let list = Object.values(store.submissions);

  if (filter?.userId) {
    list = list.filter((s) => s.submittedBy.userId === filter.userId);
  }
  if (filter?.status) {
    list = list.filter((s) => s.status === filter.status);
  }

  // Sort newest first
  return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

export function getSubmissionById(id: string): SongSubmission | null {
  const store = ensureDataStore();
  return store.submissions[id] || null;
}

export function reviewSongSubmission(params: {
  submissionId: string;
  adminUserId: string;
  status: 'approved' | 'rejected' | 'removed';
  adminNotes?: string;
}): SongSubmission {
  const store = ensureDataStore();
  const admin = findUserById(params.adminUserId);
  if (!admin || admin.role !== 'admin') {
    throw new Error('Unauthorized: Admin privileges required to review submissions.');
  }

  const submission = store.submissions[params.submissionId];
  if (!submission) {
    throw new Error('Submission not found.');
  }

  const now = new Date().toISOString();
  submission.status = params.status;
  submission.reviewedAt = now;
  submission.reviewedBy = {
    userId: admin.id,
    email: admin.email,
    displayName: admin.displayName,
  };
  submission.adminNotes = params.adminNotes?.trim() || undefined;

  // If approved, publish directly into the Global Approved Catalog!
  if (params.status === 'approved') {
    const publishedSong: SongRecord = {
      ...submission.song,
      language: submission.song.language || { code: 'fil', label: 'Filipino / Tagalog' },
      category: submission.song.category || { id: 'filipino-worship', label: 'Filipino Worship' },
      originalKey: submission.song.originalKey || 'G',
      sections: submission.song.sections || [],
      id: `global_${submission.song.id}`,
      slug: submission.song.slug || `global-${submission.song.id}`,
      sourceType: 'catalog',
      contentStatus: 'authorized',
      attribution: `Contributed by ${submission.submittedBy.displayName}${
        submission.submittedBy.churchName ? ` (${submission.submittedBy.churchName})` : ''
      }`,
      rightsAcknowledged: true,
      updatedAt: now,
    };

    store.approvedGlobalSongs[publishedSong.id] = publishedSong;
  } else if (params.status === 'rejected' || params.status === 'removed') {
    // If rejected or removed, ensure it is removed from global if previously approved
    const publishedId = `global_${submission.song.id}`;
    for (const [key, val] of Object.entries(store.approvedGlobalSongs)) {
      if (
        key === publishedId ||
        key === submission.song.id ||
        key === submission.song.slug ||
        val.id === publishedId ||
        val.id === submission.song.id ||
        val.slug === submission.song.slug
      ) {
        delete store.approvedGlobalSongs[key];
      }
    }
  }

  saveStore(store);
  return submission;
}

export function removeSongGlobally(params: {
  adminUserId: string;
  songIdOrSlug: string;
  reason?: string;
}): { success: boolean; removedRecord: RemovedGlobalSongRecord } {
  const store = ensureDataStore();
  if (!store.removedGlobalSongs) store.removedGlobalSongs = {};

  const admin = findUserById(params.adminUserId);
  if (!admin || admin.role !== 'admin') {
    throw new Error('Unauthorized: Admin privileges required to remove songs globally.');
  }

  const targetKey = params.songIdOrSlug.trim();
  const now = new Date().toISOString();

  let songTitle = targetKey;
  let songSlug = targetKey;
  let songArtist: string | undefined = undefined;

  // 1. Remove from approvedGlobalSongs if present
  const matchedApprovedEntry = Object.entries(store.approvedGlobalSongs).find(([key, song]) => {
    return (
      key === targetKey ||
      key === `global_${targetKey}` ||
      song.id === targetKey ||
      song.slug === targetKey ||
      song.id === `global_${targetKey}`
    );
  });

  if (matchedApprovedEntry) {
    const [key, approvedSong] = matchedApprovedEntry;
    songTitle = approvedSong.title;
    songSlug = approvedSong.slug;
    songArtist = approvedSong.artist;
    delete store.approvedGlobalSongs[key];
  }

  // 2. Mark any matching submissions as removed
  for (const sub of Object.values(store.submissions)) {
    if (
      sub.songId === targetKey ||
      sub.song.id === targetKey ||
      sub.song.slug === targetKey ||
      `global_${sub.songId}` === targetKey ||
      `global_${sub.song.id}` === targetKey
    ) {
      sub.status = 'removed';
      sub.reviewedAt = now;
      sub.reviewedBy = {
        userId: admin.id,
        email: admin.email,
        displayName: admin.displayName,
      };
      sub.adminNotes = params.reason?.trim() || 'Removed from global catalog by administrator.';
      songTitle = sub.song.title;
      songSlug = sub.song.slug;
      songArtist = sub.song.artist;
    }
  }

  // 3. Add to removedGlobalSongs index
  const removedRecord: RemovedGlobalSongRecord = {
    id: targetKey,
    slug: songSlug,
    title: songTitle,
    artist: songArtist,
    removedAt: now,
    removedBy: {
      userId: admin.id,
      email: admin.email,
      displayName: admin.displayName,
    },
    reason: params.reason?.trim() || 'Removed from global catalog by administrator.',
  };

  store.removedGlobalSongs[targetKey] = removedRecord;
  if (songSlug && songSlug !== targetKey) {
    store.removedGlobalSongs[songSlug] = removedRecord;
  }

  saveStore(store);
  return { success: true, removedRecord };
}

export function restoreSongGlobally(params: {
  adminUserId: string;
  songIdOrSlug: string;
}): { success: boolean; restoredSongId: string } {
  const store = ensureDataStore();
  if (!store.removedGlobalSongs) store.removedGlobalSongs = {};

  const admin = findUserById(params.adminUserId);
  if (!admin || admin.role !== 'admin') {
    throw new Error('Unauthorized: Admin privileges required to restore songs globally.');
  }

  const targetKey = params.songIdOrSlug.trim();
  delete store.removedGlobalSongs[targetKey];

  // If it was a submission, restore status to approved and re-insert into approvedGlobalSongs
  for (const sub of Object.values(store.submissions)) {
    if (
      sub.songId === targetKey ||
      sub.song.id === targetKey ||
      sub.song.slug === targetKey ||
      `global_${sub.songId}` === targetKey ||
      `global_${sub.song.id}` === targetKey
    ) {
      sub.status = 'approved';
      sub.reviewedAt = new Date().toISOString();
      sub.reviewedBy = {
        userId: admin.id,
        email: admin.email,
        displayName: admin.displayName,
      };
      sub.adminNotes = 'Restored to global catalog by administrator.';

      const publishedSong: SongRecord = {
        ...sub.song,
        language: sub.song.language || { code: 'fil', label: 'Filipino / Tagalog' },
        category: sub.song.category || { id: 'filipino-worship', label: 'Filipino Worship' },
        originalKey: sub.song.originalKey || 'G',
        sections: sub.song.sections || [],
        id: `global_${sub.song.id}`,
        slug: sub.song.slug || `global-${sub.song.id}`,
        sourceType: 'catalog',
        contentStatus: 'authorized',
        attribution: `Contributed by ${sub.submittedBy.displayName}${
          sub.submittedBy.churchName ? ` (${sub.submittedBy.churchName})` : ''
        }`,
        rightsAcknowledged: true,
        updatedAt: new Date().toISOString(),
      };

      store.approvedGlobalSongs[publishedSong.id] = publishedSong;
      if (sub.song.slug) {
        delete store.removedGlobalSongs[sub.song.slug];
      }
    }
  }

  saveStore(store);
  return { success: true, restoredSongId: targetKey };
}

export function getRemovedGlobalSongs(): RemovedGlobalSongRecord[] {
  const store = ensureDataStore();
  const seenIds = new Set<string>();
  const list: RemovedGlobalSongRecord[] = [];
  for (const record of Object.values(store.removedGlobalSongs || {})) {
    if (!seenIds.has(record.id)) {
      seenIds.add(record.id);
      list.push(record);
    }
  }
  return list.sort((a, b) => new Date(b.removedAt).getTime() - new Date(a.removedAt).getTime());
}

export function getRemovedGlobalSongIds(): string[] {
  const store = ensureDataStore();
  return Object.keys(store.removedGlobalSongs || {});
}

export function getApprovedGlobalSongs(): SongRecord[] {
  const store = ensureDataStore();
  const removedIds = new Set(Object.keys(store.removedGlobalSongs || {}));
  return Object.values(store.approvedGlobalSongs).filter((song) => {
    return (
      !removedIds.has(song.id) &&
      !removedIds.has(song.slug) &&
      !removedIds.has(song.id.replace(/^global_/, ''))
    );
  });
}
