import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { SongRecord } from '@/types/song';
import type {
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
      return JSON.parse(raw);
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
  status: 'approved' | 'rejected';
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
      language: { code: 'fil', label: 'Filipino / Tagalog' },
      category: { id: 'filipino-worship', label: 'Filipino Worship' },
      originalKey: 'G',
      sections: [],
      ...submission.song,
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
  } else if (params.status === 'rejected') {
    // If rejected, ensure it is removed from global if previously approved
    const publishedId = `global_${submission.song.id}`;
    if (store.approvedGlobalSongs[publishedId]) {
      delete store.approvedGlobalSongs[publishedId];
    }
  }

  saveStore(store);
  return submission;
}

export function getApprovedGlobalSongs(): SongRecord[] {
  const store = ensureDataStore();
  return Object.values(store.approvedGlobalSongs);
}
