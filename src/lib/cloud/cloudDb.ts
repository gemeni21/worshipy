import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { SongRecord } from '@/types/song';
import type {
  EmailNotificationRecord,
  GroupMember,
  RemovedGlobalSongRecord,
  SongSubmission,
  SubmissionStatus,
  UserCloudSyncPayload,
  UserProfile,
  UserRole,
  WorshipGroup,
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
  notifications?: EmailNotificationRecord[];
  groups?: Record<string, WorshipGroup>;
  revokedTokens?: Record<string, boolean>;
}

export const PRIMARY_ADMIN_EMAIL = 'gray2187@gmail.com';
export const PRIMARY_ADMIN_PASSWORD = 'ow62ET';

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  (process.env.NODE_ENV === 'production' && !process.env.ELECTRON_RUN_AS_NODE)
);

const BASE_DIR = process.env.WORSHIPY_USER_DATA || (isServerless ? os.tmpdir() : process.cwd());
const DATA_DIR = path.resolve(BASE_DIR, '.worshipy-data');
const STORE_FILE = path.join(DATA_DIR, 'cloud-store.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'worshipy_auth_secret_key_2026_salt';

let inMemoryStoreCache: CloudStoreSchema | null = null;

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function ensureDataStore(): CloudStoreSchema {
  if (inMemoryStoreCache) {
    return inMemoryStoreCache;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed: CloudStoreSchema = JSON.parse(raw);
      if (!parsed.removedGlobalSongs) parsed.removedGlobalSongs = {};
      if (!parsed.notifications) parsed.notifications = [];
      if (!parsed.groups) parsed.groups = {};

      // Ensure primary admin gray2187@gmail.com is seeded with admin privileges and user's requested password
      const grayKey = PRIMARY_ADMIN_EMAIL.toLowerCase();
      const existingGray = parsed.users[grayKey];
      if (!existingGray || existingGray.profile.role !== 'admin') {
        const salt = crypto.randomBytes(16).toString('hex');
        parsed.users[grayKey] = {
          profile: {
            id: 'user_admin_gray',
            email: PRIMARY_ADMIN_EMAIL,
            displayName: 'Gray (Admin)',
            churchName: 'Central Worship Community',
            instrument: 'Worship Director & Song Curator',
            role: 'admin',
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
            cloudStorage: { provider: 'none' },
          },
          salt,
          passwordHash: hashPassword(PRIMARY_ADMIN_PASSWORD, salt),
        };
        try {
          fs.writeFileSync(STORE_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
        } catch {}
      }

      inMemoryStoreCache = parsed;
      return parsed;
    }
  } catch (err) {
    console.warn('Notice: Reading cloud store file fallback:', err);
  }

  // Initial Seed Store with Primary Admin gray2187@gmail.com, secondary admin, and Demo Leader
  const graySalt = crypto.randomBytes(16).toString('hex');
  const grayAdminUser: StoredUser = {
    profile: {
      id: 'user_admin_gray',
      email: PRIMARY_ADMIN_EMAIL,
      displayName: 'Gray (Admin)',
      churchName: 'Central Worship Community',
      instrument: 'Worship Director & Song Curator',
      role: 'admin',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      cloudStorage: { provider: 'none' },
    },
    salt: graySalt,
    passwordHash: hashPassword(PRIMARY_ADMIN_PASSWORD, graySalt),
  };

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
      [grayAdminUser.profile.email.toLowerCase()]: grayAdminUser,
      [adminUser.profile.email.toLowerCase()]: adminUser,
      [leaderUser.profile.email.toLowerCase()]: leaderUser,
    },
    sessions: {},
    userSyncData: {},
    submissions: {},
    approvedGlobalSongs: {},
    removedGlobalSongs: {},
    notifications: [],
    groups: {},
  };

  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(initialStore, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Notice: Using in-memory store for serverless initial store:', err);
  }

  inMemoryStoreCache = initialStore;
  return initialStore;
}

function saveStore(store: CloudStoreSchema): void {
  inMemoryStoreCache = store;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${STORE_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempFile, STORE_FILE);
  } catch (err) {
    console.warn('Notice: In-memory store cached, file write note:', err);
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
  const existingUser = store.users[normalizedEmail];

  if (params.password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  // If primary admin gray2187@gmail.com registers or updates password, update credentials cleanly
  if (existingUser && normalizedEmail === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    const salt = crypto.randomBytes(16).toString('hex');
    existingUser.salt = salt;
    existingUser.passwordHash = hashPassword(params.password, salt);
    existingUser.profile.displayName = params.displayName.trim() || existingUser.profile.displayName;
    if (params.churchName) existingUser.profile.churchName = params.churchName.trim();
    if (params.instrument) existingUser.profile.instrument = params.instrument.trim();
    existingUser.profile.role = 'admin';
    existingUser.profile.lastActiveAt = new Date().toISOString();

    const token = createSessionForUser(store, existingUser.profile.id);
    saveStore(store);
    return { profile: existingUser.profile, token };
  }

  // If existing user already has an account, reject with clear message
  if (existingUser) {
    throw new Error('An account with this email address already exists.');
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
    role: params.role || (normalizedEmail === PRIMARY_ADMIN_EMAIL.toLowerCase() || normalizedEmail === 'admin@worshipy.app' ? 'admin' : 'user'),
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
    throw new Error('No account found with this email. Click "Create Account" below to register in 1 step.');
  }

  const calculatedHash = hashPassword(password, stored.salt);
  let isPasswordValid = calculatedHash === stored.passwordHash;

  // Primary admin fallback check for seeded password
  if (!isPasswordValid && normalizedEmail === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    if (password === PRIMARY_ADMIN_PASSWORD) {
      isPasswordValid = true;
    }
  }

  if (!isPasswordValid) {
    throw new Error('Invalid email or password.');
  }

  stored.profile.lastActiveAt = new Date().toISOString();
  const token = createSessionForUser(store, stored.profile.id);
  saveStore(store);

  return { profile: stored.profile, token };
}

export function generateUserSessionToken(userId: string): string {
  const store = ensureDataStore();
  return createSessionForUser(store, userId);
}

function createSessionForUser(store: CloudStoreSchema, userId: string): string {
  const user = findUserById(userId);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Create HMAC-signed stateless session token so cross-container requests on Vercel never desync
  const payload = {
    uid: userId,
    em: user?.email || '',
    dn: user?.displayName || '',
    rl: user?.role || 'user',
    ch: user?.churchName || '',
    in: user?.instrument || '',
    gid: user?.groupId || '',
    gn: user?.groupName || '',
    gr: user?.groupRole || '',
    exp: expiresAt,
  };
  const jsonStr = JSON.stringify(payload);
  const b64 = Buffer.from(jsonStr).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  const token = `wsess_${b64}.${sig}`;

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

  if (store.revokedTokens && store.revokedTokens[token]) {
    return null;
  }

  // 1. In-store session lookup
  const session = store.sessions[token];
  if (session) {
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      delete store.sessions[token];
      saveStore(store);
      return null;
    }
    const found = findUserById(session.userId);
    if (found) return found;
  }

  // 2. Stateless HMAC verification (crucial for cross-container serverless lambdas on Vercel)
  if (token.startsWith('wsess_')) {
    const raw = token.slice(6);
    const parts = raw.split('.');
    if (parts.length === 2) {
      const [b64, sig] = parts;
      const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
      if (sig === expectedSig) {
        try {
          const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
          if (payload.uid && payload.exp && new Date(payload.exp).getTime() > Date.now()) {
            let user = findUserById(payload.uid);
            if (!user && payload.em) {
              // Automatically restore user in this container's store!
              const emailKey = payload.em.toLowerCase().trim();
              const salt = crypto.randomBytes(16).toString('hex');
              const profile: UserProfile = {
                id: payload.uid,
                email: payload.em,
                displayName: payload.dn || payload.em.split('@')[0],
                role: payload.rl || (emailKey === PRIMARY_ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user'),
                churchName: payload.ch || undefined,
                instrument: payload.in || undefined,
                groupId: payload.gid || undefined,
                groupName: payload.gn || undefined,
                groupRole: payload.gr || undefined,
                createdAt: new Date().toISOString(),
                lastActiveAt: new Date().toISOString(),
                cloudStorage: { provider: 'none' },
              };
              store.users[emailKey] = {
                profile,
                salt,
                passwordHash: '',
              };
              user = profile;
              saveStore(store);
            }
            return user;
          }
        } catch {}
      }
    }
  }

  return null;
}

export function revokeSession(token: string): void {
  const store = ensureDataStore();
  if (!store.revokedTokens) store.revokedTokens = {};
  store.revokedTokens[token] = true;
  if (store.sessions[token]) {
    delete store.sessions[token];
  }
  saveStore(store);
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

// Admin Email Notification System
export function dispatchAdminEmailNotification(payload: {
  type: 'song_submission' | 'song_resubmission' | 'admin_alert';
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): EmailNotificationRecord {
  const store = ensureDataStore();
  if (!store.notifications) store.notifications = [];

  const notification: EmailNotificationRecord = {
    id: `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    to: PRIMARY_ADMIN_EMAIL,
    from: 'notifications@worshipy.app',
    subject: payload.subject,
    bodyText: payload.bodyText,
    bodyHtml: payload.bodyHtml,
    sentAt: new Date().toISOString(),
    type: payload.type,
    status: 'sent',
  };

  store.notifications.unshift(notification);
  if (store.notifications.length > 100) {
    store.notifications = store.notifications.slice(0, 100);
  }

  saveStore(store);

  // Console telemetry for email dispatch
  console.log(`[EMAIL DISPATCHED] To: ${PRIMARY_ADMIN_EMAIL} | Subject: ${payload.subject}`);
  return notification;
}

export function getAdminNotifications(): EmailNotificationRecord[] {
  const store = ensureDataStore();
  return store.notifications || [];
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

  // Dispatch email notification to admin gray2187@gmail.com
  try {
    dispatchAdminEmailNotification({
      type: 'song_submission',
      subject: `[Worshipy Song Review] New submission: "${submission.song.title}" from ${submission.submittedBy.displayName}`,
      bodyText: [
        `Hello Admin (${PRIMARY_ADMIN_EMAIL}),`,
        '',
        `A new worship song arrangement has been submitted for global publishing on Worshipy:`,
        '',
        `• Song Title: ${submission.song.title}`,
        `• Artist / Attribution: ${submission.song.artist || submission.song.attribution || 'Unknown'}`,
        `• Original Key: ${submission.song.originalKey}`,
        `• Submitting Leader: ${submission.submittedBy.displayName} (${submission.submittedBy.email})`,
        `• Church: ${submission.submittedBy.churchName || 'Not specified'}`,
        `• Submitter's Notes: ${submission.submissionNotes || 'No notes provided'}`,
        `• Sections: ${submission.song.sections?.length || 0} sections`,
        '',
        `Please sign in at https://localhost:3000/admin with ${PRIMARY_ADMIN_EMAIL} to review chords, verify voicing accuracy, and publish to the global catalog.`,
        '',
        `— Worshipy Curation Dispatcher`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('Failed to dispatch admin notification:', err);
  }

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

// ============================================================================
// WORSHIP GROUP & TEAM COLLABORATION ENGINE
// ============================================================================

function generateGroupInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createWorshipGroup(
  userId: string,
  name: string,
  churchName?: string
): { ok: boolean; group?: WorshipGroup; error?: string } {
  const store = ensureDataStore();
  if (!store.groups) store.groups = {};

  const user = Object.values(store.users).find((u) => u.profile.id === userId);
  if (!user) {
    return { ok: false, error: 'User not found. Please sign in to create a worship team.' };
  }

  // Strict User Rule: If user is ALREADY in a group, they cannot create another group unless they leave first
  if (user.profile.groupId && store.groups[user.profile.groupId]) {
    const existingGroup = store.groups[user.profile.groupId];
    return {
      ok: false,
      error: `You are already a member of "${existingGroup.name}". You cannot create another group unless you leave your current group first.`,
    };
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, error: 'Please enter a valid worship team name.' };
  }

  let inviteCode = generateGroupInviteCode();
  while (Object.values(store.groups).some((g) => g.inviteCode === inviteCode)) {
    inviteCode = generateGroupInviteCode();
  }

  const groupId = `group_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const newGroup: WorshipGroup = {
    id: groupId,
    name: trimmedName,
    churchName: churchName?.trim() || user.profile.churchName,
    inviteCode,
    ownerId: userId,
    createdAt: now,
    members: [
      {
        userId: user.profile.id,
        email: user.profile.email,
        displayName: user.profile.displayName,
        role: 'leader',
        joinedAt: now,
      },
    ],
  };

  store.groups[groupId] = newGroup;

  user.profile.groupId = groupId;
  user.profile.groupName = trimmedName;
  user.profile.groupRole = 'leader';
  user.profile.lastActiveAt = now;

  saveStore(store);
  return { ok: true, group: newGroup };
}

export function joinWorshipGroupByCode(
  userId: string,
  inviteCode: string
): { ok: boolean; group?: WorshipGroup; error?: string } {
  const store = ensureDataStore();
  if (!store.groups) store.groups = {};

  const user = Object.values(store.users).find((u) => u.profile.id === userId);
  if (!user) {
    return { ok: false, error: 'User not found. Please sign in to join a worship team.' };
  }

  const normalizedCode = inviteCode.trim().toUpperCase();

  // If user is already in a group:
  if (user.profile.groupId && store.groups[user.profile.groupId]) {
    const existingGroup = store.groups[user.profile.groupId];
    // Smooth re-entry if testing with their own team's code
    if (existingGroup.inviteCode.toUpperCase() === normalizedCode) {
      return { ok: true, group: existingGroup };
    }
    return {
      ok: false,
      error: `You are already a member of "${existingGroup.name}". You must leave this group before joining another team.`,
    };
  }

  const targetGroup = Object.values(store.groups).find(
    (g) => g.inviteCode.toUpperCase() === normalizedCode
  );

  if (!targetGroup) {
    return { ok: false, error: 'No worship team found with that invite code. Please verify the code with your worship leader.' };
  }

  const now = new Date().toISOString();

  if (!targetGroup.members.some((m) => m.userId === userId)) {
    targetGroup.members.push({
      userId: user.profile.id,
      email: user.profile.email,
      displayName: user.profile.displayName,
      role: 'member',
      joinedAt: now,
    });
  }

  user.profile.groupId = targetGroup.id;
  user.profile.groupName = targetGroup.name;
  user.profile.groupRole = 'member';
  user.profile.lastActiveAt = now;

  saveStore(store);
  return { ok: true, group: targetGroup };
}

export function leaveWorshipGroup(userId: string): { ok: boolean; error?: string } {
  const store = ensureDataStore();
  if (!store.groups) store.groups = {};

  const user = Object.values(store.users).find((u) => u.profile.id === userId);
  if (!user) {
    return { ok: false, error: 'User not found.' };
  }

  if (!user.profile.groupId) {
    return { ok: true };
  }

  const groupId = user.profile.groupId;
  const group = store.groups[groupId];

  if (group) {
    group.members = group.members.filter((m) => m.userId !== userId);

    if (group.members.length === 0) {
      delete store.groups[groupId];
    } else if (group.ownerId === userId) {
      group.ownerId = group.members[0].userId;
      group.members[0].role = 'leader';
      const newOwner = Object.values(store.users).find((u) => u.profile.id === group.ownerId);
      if (newOwner) {
        newOwner.profile.groupRole = 'leader';
      }
    }
  }

  user.profile.groupId = undefined;
  user.profile.groupName = undefined;
  user.profile.groupRole = undefined;
  user.profile.lastActiveAt = new Date().toISOString();

  saveStore(store);
  return { ok: true };
}

export function getWorshipGroup(groupId: string): WorshipGroup | null {
  const store = ensureDataStore();
  if (!store.groups) return null;
  return store.groups[groupId] || null;
}

export function updateWorshipGroupBranding(
  userId: string,
  groupId: string,
  updates: {
    customAppTitle?: string;
    customAppLogoUrl?: string;
    churchName?: string;
  }
): { ok: boolean; group?: WorshipGroup; error?: string } {
  const store = ensureDataStore();
  if (!store.groups) store.groups = {};

  const group = store.groups[groupId];
  if (!group) {
    return { ok: false, error: 'Worship team not found.' };
  }

  if (group.ownerId !== userId) {
    return { ok: false, error: 'Only the team creator or leader can customize the church branding.' };
  }

  if (updates.customAppTitle !== undefined) {
    group.customAppTitle = updates.customAppTitle ? updates.customAppTitle.trim() : undefined;
  }
  if (updates.customAppLogoUrl !== undefined) {
    group.customAppLogoUrl = updates.customAppLogoUrl ? updates.customAppLogoUrl.trim() : undefined;
  }
  if (updates.churchName !== undefined) {
    group.churchName = updates.churchName ? updates.churchName.trim() : undefined;
  }

  saveStore(store);
  return { ok: true, group };
}

export function findWorshipGroupByCode(code: string): WorshipGroup | null {
  const store = ensureDataStore();
  if (!store.groups) return null;
  const normalized = code.trim().toUpperCase();
  return Object.values(store.groups).find((g) => g.inviteCode.toUpperCase() === normalized) || null;
}

// Google & Instant Email 1-Click Authentication
export function loginOrRegisterWithGoogle(googleUser: {
  email: string;
  displayName?: string;
  photoURL?: string;
  emailVerified?: boolean;
  churchName?: string;
  instrument?: string;
}): { user: UserProfile; token: string } {
  const store = ensureDataStore();
  const emailKey = googleUser.email.trim().toLowerCase();
  const now = new Date().toISOString();

  let storedUser = store.users[emailKey];

  if (!storedUser) {
    const userId = `user_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const role: UserRole = emailKey === PRIMARY_ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';

    storedUser = {
      profile: {
        id: userId,
        email: googleUser.email.trim(),
        displayName: googleUser.displayName?.trim() || googleUser.email.split('@')[0],
        churchName: googleUser.churchName?.trim() || undefined,
        instrument: googleUser.instrument?.trim() || undefined,
        role,
        createdAt: now,
        lastActiveAt: now,
        photoURL: googleUser.photoURL,
        emailVerified: googleUser.emailVerified ?? true,
        authProvider: 'google',
        cloudStorage: { provider: 'none' },
      },
      salt,
      passwordHash: hashPassword(crypto.randomBytes(32).toString('hex'), salt),
    };
    store.users[emailKey] = storedUser;
  } else {
    storedUser.profile.lastActiveAt = now;
    storedUser.profile.emailVerified = true;
    storedUser.profile.authProvider = 'google';
    if (googleUser.displayName && (!storedUser.profile.displayName || storedUser.profile.displayName === emailKey)) {
      storedUser.profile.displayName = googleUser.displayName.trim();
    }
    if (googleUser.churchName && !storedUser.profile.churchName) {
      storedUser.profile.churchName = googleUser.churchName.trim();
    }
    if (googleUser.instrument && !storedUser.profile.instrument) {
      storedUser.profile.instrument = googleUser.instrument.trim();
    }
    if (googleUser.photoURL) {
      storedUser.profile.photoURL = googleUser.photoURL;
    }
    if (emailKey === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
      storedUser.profile.role = 'admin';
    }
  }

  const token = createSessionForUser(store, storedUser.profile.id);
  saveStore(store);
  return { user: storedUser.profile, token };
}
