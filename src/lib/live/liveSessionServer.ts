import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { getAllSongs, getSongById, getSongBySlug } from '../catalog/songCatalog.ts';
import { normalizeSemitones } from '../music/transposition.ts';
import { findGroupByActiveLiveSession, getWorshipGroup, setGroupLiveSession } from '../cloud/cloudDb.ts';

function findSongByIdOrSlug(idOrSlug?: string) {
  if (!idOrSlug) return undefined;
  return getSongById(idOrSlug) ?? getSongBySlug(idOrSlug);
}
import type {
  CreateLiveSessionInput,
  CreateLiveSessionResponse,
  InstrumentViewMode,
  JoinLiveSessionInput,
  JoinLiveSessionResponse,
  LiveParticipant,
  LiveSessionSnapshot,
  LiveStreamEventType,
  LiveStreamMessage,
  UpdateSharedStateInput,
} from '../../types/live.ts';

const DEFAULT_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const STALE_THRESHOLD_MS = 35 * 1000; // 35 seconds without heartbeat -> reconnecting
const DISCONNECT_THRESHOLD_MS = 90 * 1000; // 90 seconds -> disconnected

export class LiveSyncError extends Error {
  statusCode: number;
  code: string;
  latestSession?: LiveSessionSnapshot;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    latestSession?: LiveSessionSnapshot
  ) {
    super(message);
    this.name = 'LiveSyncError';
    this.statusCode = statusCode;
    this.code = code;
    this.latestSession = latestSession;
  }
}

interface InternalSessionRecord extends LiveSessionSnapshot {
  inviteTokenVersion: number;
}

type StreamSubscriber = (msg: LiveStreamMessage) => void;

interface GlobalLiveStore {
  sessions: Map<string, InternalSessionRecord>;
  subscribers: Map<string, Set<StreamSubscriber>>;
  activeStreamCounts: Map<string, number>; // key: `${sessionId}:${participantId}`
  initializedFromDisk: boolean;
}

declare global {
  var __wmcLiveStore: GlobalLiveStore | undefined;
}

function getSecretKey(): string {
  return (
    process.env.LIVE_SYNC_SECRET ||
    'wmc-dev-only-hmac-secret-replace-in-production-2026'
  );
}

export function isUsingDefaultDevSecret(): boolean {
  return !process.env.LIVE_SYNC_SECRET;
}

function getPersistenceFilePath(): string {
  if (process.env.WORSHIPY_TEST_PERSIST_PATH) {
    return process.env.WORSHIPY_TEST_PERSIST_PATH;
  }
  return path.join(process.cwd(), '.data', 'live-sessions.json');
}

function getStore(): GlobalLiveStore {
  if (!globalThis.__wmcLiveStore) {
    globalThis.__wmcLiveStore = {
      sessions: new Map(),
      subscribers: new Map(),
      activeStreamCounts: new Map(),
      initializedFromDisk: false,
    };
  }

  const store = globalThis.__wmcLiveStore;
  if (!store.initializedFromDisk) {
    store.initializedFromDisk = true;
    try {
      const filePath = getPersistenceFilePath();
      if (fs.existsSync(/* turbopackIgnore: true */ filePath)) {
        const raw = fs.readFileSync(/* turbopackIgnore: true */ filePath, 'utf8');
        const parsed = JSON.parse(raw) as InternalSessionRecord[];
        if (Array.isArray(parsed)) {
          for (const rec of parsed) {
            store.sessions.set(rec.sessionId, rec);
          }
        }
      }
    } catch {
      // Ignore disk hydration errors in restricted environments
    }
  }

  return store;
}

/**
 * Re-synchronizes memory with disk storage across multi-process Next.js server workers.
 */
export function syncStoreFromDisk(): void {
  try {
    const store = getStore();
    const filePath = getPersistenceFilePath();
    if (fs.existsSync(/* turbopackIgnore: true */ filePath)) {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ filePath, 'utf8');
      const parsed = JSON.parse(raw) as InternalSessionRecord[];
      if (Array.isArray(parsed)) {
        for (const rec of parsed) {
          const existing = store.sessions.get(rec.sessionId);
          if (!existing || rec.revision > existing.revision) {
            store.sessions.set(rec.sessionId, rec);
          }
        }
      }
    }
  } catch {
    // Non-fatal in read-only filesystems
  }
}

function reconstituteSessionFromTeamGroup(
  group: any,
  sessionId: string,
  joinCode: string
): InternalSessionRecord {
  const nowIso = new Date().toISOString();
  const leaderMember = (group.members || []).find((m: any) => m.role === 'leader');
  const leaderName =
    group.activeLiveSessionLeaderName ||
    leaderMember?.displayName ||
    'Worship Leader';
  const leaderUserId = group.ownerId || leaderMember?.userId || 'leader_user';
  const allSongs = getAllSongs();
  const firstSong =
    group.activeSetlist?.items?.[0]
      ? findSongByIdOrSlug(group.activeSetlist.items[0].songId) ?? allSongs[0]
      : allSongs[0];
  const firstSection = firstSong?.sections?.[0] ?? { id: 'sec-1', label: 'Verse 1', type: 'verse' };

  return {
    sessionId,
    joinCode,
    title: group.activeSetlist?.name ? `${group.activeSetlist.name} Live` : `${group.name} Live Stage`,
    leaderId: leaderUserId,
    leaderName,
    coLeaderIds: [],
    groupId: group.id,
    createdAt: nowIso,
    expiresAt:
      group.activeLiveSessionExpiresAt ||
      new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString(),
    status: 'active',
    inviteTokenVersion: 1,
    revision: 1,
    sharedState: {
      songId: firstSong?.id || 'song-1',
      songSlug: firstSong?.slug || 'song-1',
      arrangementId: 'default',
      officialSemitones: normalizeSemitones(group.activeSetlist?.items?.[0]?.preferredSemitones ?? 0),
      enharmonicPreference: 'auto',
      activeSectionId: firstSection.id,
      activeSectionLabel: firstSection.label,
      activeLineIndex: 0,
      setlistSongIds: group.activeSetlist?.items?.map((i: any) => i.songId) ?? [firstSong?.id || 'song-1'],
      updatedAt: nowIso,
      updatedBy: leaderUserId,
    },
    participants: [
      {
        id: leaderUserId,
        name: leaderName,
        role: 'leader',
        instrument: 'general',
        connectionState: 'connected',
        joinedAt: nowIso,
        lastSeenAt: nowIso,
      },
    ],
  };
}

function getSessionRecord(sessionId: string): InternalSessionRecord | undefined {
  const store = getStore();
  let record = store.sessions.get(sessionId);
  if (!record) {
    syncStoreFromDisk();
    record = store.sessions.get(sessionId);
  }
  if (!record) {
    try {
      const group = findGroupByActiveLiveSession(sessionId);
      if (group && group.activeLiveSessionId === sessionId) {
        const isExpired =
          group.activeLiveSessionExpiresAt &&
          new Date(group.activeLiveSessionExpiresAt).getTime() <= Date.now();
        if (!isExpired && group.activeLiveSessionJoinCode) {
          const recovered = reconstituteSessionFromTeamGroup(
            group,
            sessionId,
            group.activeLiveSessionJoinCode
          );
          store.sessions.set(sessionId, recovered);
          persistStoreToDisk();
          record = recovered;
        }
      }
    } catch {}
  }
  return record;
}

function findSessionByJoinCode(cleanCode: string): InternalSessionRecord | undefined {
  const store = getStore();
  // Prefer active session first to avoid matching ended historical sessions
  let record = Array.from(store.sessions.values()).find(
    (s) => s.status === 'active' && s.joinCode.toUpperCase() === cleanCode
  );
  if (!record) {
    syncStoreFromDisk();
    record = Array.from(store.sessions.values()).find(
      (s) => s.status === 'active' && s.joinCode.toUpperCase() === cleanCode
    );
  }
  if (!record) {
    record = Array.from(store.sessions.values()).find(
      (s) => s.joinCode.toUpperCase() === cleanCode
    );
  }
  if (!record) {
    try {
      const group = findGroupByActiveLiveSession(cleanCode);
      if (
        group &&
        group.activeLiveSessionId &&
        group.activeLiveSessionJoinCode?.toUpperCase() === cleanCode
      ) {
        const isExpired =
          group.activeLiveSessionExpiresAt &&
          new Date(group.activeLiveSessionExpiresAt).getTime() <= Date.now();
        if (!isExpired) {
          const recovered = reconstituteSessionFromTeamGroup(
            group,
            group.activeLiveSessionId,
            group.activeLiveSessionJoinCode
          );
          store.sessions.set(group.activeLiveSessionId, recovered);
          persistStoreToDisk();
          record = recovered;
        }
      }
    } catch {}
  }
  return record;
}

function persistStoreToDisk(): void {
  if (process.env.WMC_DISABLE_DISK_PERSIST === '1') return;
  try {
    const store = getStore();
    const filePath = getPersistenceFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Merge existing records from disk so multi-worker server instances never delete each other's sessions
    const sessionMap = new Map<string, InternalSessionRecord>();
    if (fs.existsSync(/* turbopackIgnore: true */ filePath)) {
      try {
        const raw = fs.readFileSync(/* turbopackIgnore: true */ filePath, 'utf8');
        const parsed = JSON.parse(raw) as InternalSessionRecord[];
        if (Array.isArray(parsed)) {
          for (const rec of parsed) {
            sessionMap.set(rec.sessionId, rec);
          }
        }
      } catch {}
    }

    // Merge in-memory sessions into disk map, preserving newer revisions
    for (const memRec of store.sessions.values()) {
      const existing = sessionMap.get(memRec.sessionId);
      if (!existing || memRec.revision >= existing.revision) {
        sessionMap.set(memRec.sessionId, memRec);
      }
    }

    // Synchronize memory store with all merged records
    for (const [sid, diskRec] of sessionMap.entries()) {
      if (!store.sessions.has(sid)) {
        store.sessions.set(sid, diskRec);
      }
    }

    const records = Array.from(sessionMap.values());
    const tempFile = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(tempFile, JSON.stringify(records, null, 2), 'utf8');
    try {
      fs.renameSync(tempFile, filePath);
    } catch {
      fs.copyFileSync(tempFile, filePath);
      try {
        fs.unlinkSync(tempFile);
      } catch {}
    }
  } catch {
    // Non-fatal in read-only filesystems
  }
}

function signPayload(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', getSecretKey())
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function verifySignedPayload<T>(token: string): T | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;

  const expectedSig = crypto
    .createHmac('sha256', getSecretKey())
    .update(data)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const json = Buffer.from(data, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

interface ParticipantTokenPayload {
  kind: 'participant';
  sessionId: string;
  participantId: string;
  issuedAt: number;
}

interface InviteTokenPayload {
  kind: 'invite';
  sessionId: string;
  joinCode: string;
  expiresAt: number;
  version: number;
}

export function createParticipantToken(
  sessionId: string,
  participantId: string
): string {
  const payload: ParticipantTokenPayload = {
    kind: 'participant',
    sessionId,
    participantId,
    issuedAt: Date.now(),
  };
  return signPayload(payload);
}

export function verifyParticipantToken(
  token: string,
  expectedSessionId?: string
): ParticipantTokenPayload | null {
  const parsed = verifySignedPayload<ParticipantTokenPayload>(token);
  if (!parsed || parsed.kind !== 'participant') return null;
  if (expectedSessionId && parsed.sessionId !== expectedSessionId) return null;
  return parsed;
}

export function createInviteToken(session: InternalSessionRecord): string {
  const payload: InviteTokenPayload = {
    kind: 'invite',
    sessionId: session.sessionId,
    joinCode: session.joinCode,
    expiresAt: new Date(session.expiresAt).getTime(),
    version: session.inviteTokenVersion,
  };
  return signPayload(payload);
}

export function verifyInviteToken(token: string): InviteTokenPayload | null {
  const parsed = verifySignedPayload<InviteTokenPayload>(token);
  if (!parsed || parsed.kind !== 'invite') return null;
  return parsed;
}

function generateJoinCode(existingCodes: Set<string>): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      const idx = crypto.randomInt(0, alphabet.length);
      code += alphabet[idx];
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function sanitizeSnapshot(record: InternalSessionRecord): LiveSessionSnapshot {
  const now = Date.now();
  const store = getStore();

  const participants: LiveParticipant[] = record.participants.map((p) => {
    const streamKey = `${record.sessionId}:${p.id}`;
    const hasActiveStream = (store.activeStreamCounts.get(streamKey) ?? 0) > 0;
    const elapsed = now - new Date(p.lastSeenAt).getTime();

    let connectionState = p.connectionState;
    if (p.connectionState !== 'disconnected') {
      if (hasActiveStream || elapsed <= STALE_THRESHOLD_MS) {
        connectionState = 'connected';
      } else if (elapsed <= DISCONNECT_THRESHOLD_MS) {
        connectionState = 'reconnecting';
      } else {
        connectionState = 'disconnected';
      }
    }

    return {
      ...p,
      connectionState,
    };
  });

  return {
    sessionId: record.sessionId,
    joinCode: record.joinCode,
    title: record.title,
    status: record.status,
    revision: record.revision,
    leaderId: record.leaderId,
    leaderName: record.leaderName,
    coLeaderIds: [...record.coLeaderIds],
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    ...(record.endedAt ? { endedAt: record.endedAt } : {}),
    ...(record.groupId ? { groupId: record.groupId } : {}),
    sharedState: {
      ...record.sharedState,
      setlistSongIds: [...record.sharedState.setlistSongIds],
    },
    participants,
  };
}

function broadcastSessionEvent(
  sessionId: string,
  type: LiveStreamEventType
): void {
  const store = getStore();
  const record = store.sessions.get(sessionId);
  if (!record) return;

  const subs = store.subscribers.get(sessionId);
  if (!subs || subs.size === 0) return;

  const snapshot = sanitizeSnapshot(record);
  const message: LiveStreamMessage = {
    type,
    revision: snapshot.revision,
    timestamp: new Date().toISOString(),
    session: snapshot,
  };

  for (const listener of subs) {
    try {
      listener(message);
    } catch {
      // Ignore closed subscriber errors
    }
  }
}

/**
 * Starts a new authoritative leader-led Live Sync session.
 */
export function createLiveSession(
  input: CreateLiveSessionInput
): CreateLiveSessionResponse {
  const leaderName = (input.leaderName ?? '').trim();
  if (!leaderName) {
    throw new LiveSyncError(
      'Leader display name is required to start a live session.',
      400,
      'INVALID_INPUT'
    );
  }

  const allSongs = getAllSongs();
  const initialSong =
    findSongByIdOrSlug(input.initialSongId) ?? allSongs[0];
  if (!initialSong) {
    throw new LiveSyncError(
      'Cannot start session: no valid song found.',
      400,
      'SONG_NOT_FOUND'
    );
  }

  const store = getStore();
  const activeCodes = new Set(
    Array.from(store.sessions.values())
      .filter((s) => s.status === 'active')
      .map((s) => s.joinCode)
  );

  const sessionId = `live-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const participantId = `usr-${crypto.randomBytes(5).toString('hex')}`;
  const joinCode = generateJoinCode(activeCodes);

  const nowIso = new Date().toISOString();
  const ttl =
    typeof input.ttlMs === 'number' ? input.ttlMs : DEFAULT_SESSION_TTL_MS;
  const expiresAtIso = new Date(Date.now() + ttl).toISOString();

  const firstSection = initialSong.sections[0] ?? {
    id: 'sec-1',
    label: 'Section 1',
  };

  const setlistIds =
    Array.isArray(input.setlistSongIds) && input.setlistSongIds.length > 0
      ? Array.from(new Set([initialSong.id, ...input.setlistSongIds]))
      : allSongs.slice(0, 5).map((s) => s.id);

  const record: InternalSessionRecord = {
    sessionId,
    joinCode,
    title: input.title?.trim() || `${leaderName}'s Worship Session`,
    status: 'active',
    revision: 1,
    leaderId: participantId,
    leaderName,
    coLeaderIds: [],
    groupId: input.groupId,
    createdAt: nowIso,
    expiresAt: expiresAtIso,
    inviteTokenVersion: 1,
    sharedState: {
      songId: initialSong.id,
      songSlug: initialSong.slug,
      arrangementId: 'default',
      officialSemitones: normalizeSemitones(input.initialSemitones ?? 0),
      enharmonicPreference: input.enharmonicPreference ?? 'auto',
      activeSectionId: firstSection.id,
      activeSectionLabel: firstSection.label,
      activeLineIndex: 0,
      setlistSongIds: setlistIds,
      updatedAt: nowIso,
      updatedBy: participantId,
    },
    participants: [
      {
        id: participantId,
        name: leaderName,
        role: 'leader',
        instrument: input.instrument ?? 'general',
        connectionState: 'connected',
        joinedAt: nowIso,
        lastSeenAt: nowIso,
      },
    ],
  };

  store.sessions.set(sessionId, record);
  persistStoreToDisk();

  if (input.groupId) {
    try {
      setGroupLiveSession(input.groupId, {
        sessionId,
        joinCode,
        expiresAt: expiresAtIso,
        leaderName,
      });
    } catch {}
  }

  const participantToken = createParticipantToken(sessionId, participantId);
  const inviteToken = createInviteToken(record);
  const snapshot = sanitizeSnapshot(record);

  return {
    session: snapshot,
    participantId,
    participantToken,
    inviteToken,
    joinUrl: `/live?code=${encodeURIComponent(joinCode)}&invite=${encodeURIComponent(inviteToken)}`,
  };
}

/**
 * Joins an existing live session via join code or signed invite token.
 * Rejects invalid codes, expired invitations, or ended sessions.
 */
export function joinLiveSession(
  input: JoinLiveSessionInput
): JoinLiveSessionResponse {
  const participantName = (input.participantName ?? '').trim();
  if (!participantName) {
    throw new LiveSyncError(
      'Please enter your display name to join the live session.',
      400,
      'INVALID_NAME'
    );
  }

  const store = getStore();
  let targetSession: InternalSessionRecord | undefined;

  if (input.inviteToken) {
    const verifiedInvite = verifyInviteToken(input.inviteToken);
    if (!verifiedInvite) {
      throw new LiveSyncError(
        'Invalid or tampered invitation link.',
        401,
        'INVALID_INVITE_TOKEN'
      );
    }
    if (Date.now() > verifiedInvite.expiresAt) {
      throw new LiveSyncError(
        'This session invitation has expired. Ask the worship leader for a fresh link or code.',
        410,
        'INVITATION_EXPIRED'
      );
    }

    targetSession = getSessionRecord(verifiedInvite.sessionId);
    if (
      !targetSession ||
      targetSession.inviteTokenVersion !== verifiedInvite.version
    ) {
      throw new LiveSyncError(
        'This invitation link has been revoked or replaced by the leader.',
        410,
        'INVITATION_REVOKED'
      );
    }
  } else if (input.joinCode || input.sessionId) {
    if (input.sessionId) {
      const candidate = getSessionRecord(input.sessionId);
      if (candidate && candidate.status === 'active') {
        targetSession = candidate;
      }
    }
    if (!targetSession && input.joinCode) {
      const cleanCode = input.joinCode.trim().toUpperCase();
      targetSession = findSessionByJoinCode(cleanCode);
    }
    if (!targetSession && input.sessionId) {
      targetSession = getSessionRecord(input.sessionId);
    }
    if (!targetSession) {
      const codeOrId = input.joinCode ? `join code "${input.joinCode.trim().toUpperCase()}"` : 'session ID';
      throw new LiveSyncError(
        `No live session found matching ${codeOrId}.`,
        404,
        'SESSION_NOT_FOUND'
      );
    }
  } else {
    throw new LiveSyncError(
      'Provide a join code, session ID, or invitation token to join.',
      400,
      'MISSING_JOIN_CREDENTIALS'
    );
  }

  if (targetSession.status === 'ended') {
    throw new LiveSyncError(
      'This live worship session has already ended.',
      410,
      'SESSION_ENDED'
    );
  }

  if (Date.now() > new Date(targetSession.expiresAt).getTime()) {
    throw new LiveSyncError(
      'This live session invitation has expired.',
      410,
      'INVITATION_EXPIRED'
    );
  }

  const nowIso = new Date().toISOString();
  const cleanName = participantName.trim();
  const isLeaderMatch =
    Boolean(input.isLeader) ||
    cleanName.toLowerCase() === targetSession.leaderName.trim().toLowerCase();

  let effectiveParticipantId: string;
  let effectiveParticipant: LiveParticipant;

  if (isLeaderMatch && targetSession.leaderId) {
    // 1. Leader Reconnect / Reclaim
    const existingLeader = targetSession.participants.find(
      (p) => p.id === targetSession.leaderId
    );
    if (existingLeader) {
      effectiveParticipantId = existingLeader.id;
      existingLeader.connectionState = 'connected';
      existingLeader.lastSeenAt = nowIso;
      if (input.instrument) {
        existingLeader.instrument = input.instrument;
      }
      effectiveParticipant = existingLeader;
    } else {
      effectiveParticipantId = targetSession.leaderId;
      effectiveParticipant = {
        id: effectiveParticipantId,
        name: cleanName,
        role: 'leader',
        instrument: input.instrument ?? 'general',
        connectionState: 'connected',
        joinedAt: nowIso,
        lastSeenAt: nowIso,
      };
      targetSession.participants.push(effectiveParticipant);
    }
  } else {
    // 2. Member Reconnect by Name or Fresh Join
    const existingMember = targetSession.participants.find(
      (p) =>
        p.id !== targetSession.leaderId &&
        p.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (existingMember) {
      effectiveParticipantId = existingMember.id;
      existingMember.connectionState = 'connected';
      existingMember.lastSeenAt = nowIso;
      if (input.instrument) {
        existingMember.instrument = input.instrument;
      }
      effectiveParticipant = existingMember;
    } else {
      effectiveParticipantId = `usr-${crypto.randomBytes(5).toString('hex')}`;
      effectiveParticipant = {
        id: effectiveParticipantId,
        name: cleanName,
        role: 'member',
        instrument: input.instrument ?? 'general',
        connectionState: 'connected',
        joinedAt: nowIso,
        lastSeenAt: nowIso,
      };
      targetSession.participants.push(effectiveParticipant);
    }
  }

  persistStoreToDisk();
  broadcastSessionEvent(targetSession.sessionId, 'presence_updated');

  const participantToken = createParticipantToken(
    targetSession.sessionId,
    effectiveParticipantId
  );

  return {
    session: sanitizeSnapshot(targetSession),
    participantId: effectiveParticipantId,
    participantToken,
  };
}

/**
 * Searches for an active live session associated with a specific worship group.
 */
export function findActiveSessionByGroupId(groupId: string): InternalSessionRecord | undefined {
  if (!groupId) return undefined;
  const store = getStore();
  const now = Date.now();

  const isSessionActive = (s: InternalSessionRecord) =>
    s.status === 'active' &&
    (!s.expiresAt || new Date(s.expiresAt).getTime() > now);

  // 1. Look in memory for direct groupId match
  for (const s of store.sessions.values()) {
    if (s.groupId === groupId && isSessionActive(s)) {
      return s;
    }
  }

  // 2. Sync from disk and re-check
  syncStoreFromDisk();
  for (const s of store.sessions.values()) {
    if (s.groupId === groupId && isSessionActive(s)) {
      return s;
    }
  }

  // 3. Fallback: check group from cloud store
  try {
    const group = getWorshipGroup(groupId) || findGroupByActiveLiveSession(groupId);
    if (group && group.activeLiveSessionId) {
      const session = getSessionRecord(group.activeLiveSessionId);
      if (session && isSessionActive(session)) {
        session.groupId = groupId;
        return session;
      }
    }
  } catch {}

  return undefined;
}

/**
 * Returns discovery info for active live sessions by groupId, joinCode, or sessionId.
 */
export function getActiveSessionInfo(query: {
  groupId?: string;
  joinCode?: string;
  sessionId?: string;
}): { active: boolean; session?: LiveSessionSnapshot } {
  let record: InternalSessionRecord | undefined;
  if (query.groupId) {
    record = findActiveSessionByGroupId(query.groupId);
  }
  if (!record && query.joinCode) {
    record = findSessionByJoinCode(query.joinCode.trim().toUpperCase());
  }
  if (!record && query.sessionId) {
    record = getSessionRecord(query.sessionId);
  }
  if (record && record.status === 'active') {
    const isExpired =
      record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now();
    if (!isExpired) {
      return { active: true, session: sanitizeSnapshot(record) };
    }
  }
  return { active: false };
}

/**
 * Retrieves the latest authoritative snapshot for a connected participant (used on initial load and reconnect).
 */
export function getLiveSessionSnapshot(
  sessionId: string,
  participantToken: string
): {
  session: LiveSessionSnapshot;
  participant: LiveParticipant;
  inviteToken?: string;
} {
  const verified = verifyParticipantToken(participantToken, sessionId);
  if (!verified) {
    throw new LiveSyncError(
      'Unauthorized: valid session membership token required.',
      401,
      'UNAUTHORIZED'
    );
  }

  const record = getSessionRecord(sessionId);
  if (!record) {
    throw new LiveSyncError(
      'Live session not found.',
      404,
      'SESSION_NOT_FOUND'
    );
  }

  const participant = record.participants.find(
    (p) => p.id === verified.participantId
  );
  if (!participant) {
    throw new LiveSyncError(
      'You are not a registered participant of this live session.',
      403,
      'NOT_IN_SESSION'
    );
  }

  // Mark participant seen on snapshot fetch (reconnection recovery)
  participant.lastSeenAt = new Date().toISOString();
  participant.connectionState = 'connected';
  persistStoreToDisk();
  broadcastSessionEvent(sessionId, 'presence_updated');

  const snapshot = sanitizeSnapshot(record);
  const updatedParticipant =
    snapshot.participants.find((p) => p.id === participant.id) ?? participant;

  const isLeaderOrCoLeader =
    record.leaderId === participant.id ||
    record.coLeaderIds.includes(participant.id);

  return {
    session: snapshot,
    participant: updatedParticipant,
    ...(isLeaderOrCoLeader ? { inviteToken: createInviteToken(record) } : {}),
  };
}

/**
 * Authoritative state update: strictly restricted to the session Leader or an authorized Co-Leader.
 * Enforces monotonic revision numbers and prevents stale overwrites.
 */
export function updateLiveSessionState(
  sessionId: string,
  participantToken: string,
  input: UpdateSharedStateInput
): LiveSessionSnapshot {
  const verified = verifyParticipantToken(participantToken, sessionId);
  if (!verified) {
    throw new LiveSyncError(
      'Unauthorized: invalid or missing participant token.',
      401,
      'UNAUTHORIZED'
    );
  }

  const record = getSessionRecord(sessionId);
  if (!record) {
    throw new LiveSyncError(
      'Live session not found.',
      404,
      'SESSION_NOT_FOUND'
    );
  }

  if (record.status === 'ended') {
    throw new LiveSyncError(
      'Cannot update state: this live session has ended.',
      410,
      'SESSION_ENDED'
    );
  }

  const caller = record.participants.find(
    (p) => p.id === verified.participantId
  );
  const isAuthorizedLeader =
    caller &&
    (record.leaderId === caller.id ||
      record.coLeaderIds.includes(caller.id));

  if (!isAuthorizedLeader) {
    throw new LiveSyncError(
      'Forbidden: only the worship leader or an authorized co-leader may modify the official session state.',
      403,
      'FORBIDDEN_NOT_LEADER'
    );
  }

  // Optimistic concurrency / revision ordering check
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision < record.revision
  ) {
    throw new LiveSyncError(
      `Outdated revision (${input.expectedRevision} < current ${record.revision}). Rejecting stale update.`,
      409,
      'STALE_REVISION',
      sanitizeSnapshot(record)
    );
  }

  const currentState = record.sharedState;
  let targetSong = input.songId
    ? findSongByIdOrSlug(input.songId)
    : findSongByIdOrSlug(currentState.songId);
  if (!targetSong) {
    targetSong = findSongByIdOrSlug(currentState.songId) ?? getAllSongs()[0];
  }

  const songChanged =
    input.songId !== undefined && targetSong.id !== currentState.songId;

  const nextSemitones =
    input.officialSemitones !== undefined
      ? normalizeSemitones(input.officialSemitones)
      : songChanged
      ? 0
      : currentState.officialSemitones;

  const nextSpelling =
    input.enharmonicPreference !== undefined
      ? input.enharmonicPreference
      : currentState.enharmonicPreference;

  let nextSection = targetSong.sections[0] ?? {
    id: 'sec-1',
    label: 'Section 1',
  };

  if (input.activeSectionId) {
    const secId = input.activeSectionId;
    const secIdLower = secId.toLowerCase();
    const matchedSection = targetSong.sections.find(
      (s) =>
        s.id === secId ||
        s.label.toLowerCase() === secIdLower ||
        s.type.toLowerCase() === secIdLower
    );
    if (matchedSection) {
      nextSection = matchedSection;
    } else {
      nextSection = {
        id: secId,
        label: input.activeSectionLabel ?? secId,
      } as (typeof targetSong.sections)[number];
    }
  } else if (!songChanged) {
    const existingSection = targetSong.sections.find(
      (s) => s.id === currentState.activeSectionId
    );
    if (existingSection) {
      nextSection = existingSection;
    }
  }

  const nextSetlist =
    Array.isArray(input.setlistSongIds) && input.setlistSongIds.length > 0
      ? input.setlistSongIds
      : currentState.setlistSongIds.includes(targetSong.id)
      ? currentState.setlistSongIds
      : [...currentState.setlistSongIds, targetSong.id];

  const nowIso = new Date().toISOString();
  caller.lastSeenAt = nowIso;
  caller.connectionState = 'connected';

  record.revision += 1;
  record.sharedState = {
    songId: targetSong.id,
    songSlug: targetSong.slug,
    arrangementId: 'default',
    officialSemitones: nextSemitones,
    enharmonicPreference: nextSpelling,
    activeSectionId: nextSection.id,
    activeSectionLabel: nextSection.label,
    activeLineIndex:
      typeof input.activeLineIndex === 'number' ? input.activeLineIndex : 0,
    setlistSongIds: nextSetlist,
    updatedAt: nowIso,
    updatedBy: caller.id,
  };

  persistStoreToDisk();
  broadcastSessionEvent(sessionId, 'state_updated');

  return sanitizeSnapshot(record);
}

/**
 * Transfers primary leadership or toggles co-leader authorization.
 * Strictly restricted to the current primary Leader.
 */
export function transferSessionLeadership(
  sessionId: string,
  participantToken: string,
  targetParticipantId: string,
  action: 'make-leader' | 'toggle-co-leader' = 'make-leader'
): LiveSessionSnapshot {
  const verified = verifyParticipantToken(participantToken, sessionId);
  if (!verified) {
    throw new LiveSyncError('Unauthorized token.', 401, 'UNAUTHORIZED');
  }

  const record = getSessionRecord(sessionId);
  if (!record) {
    throw new LiveSyncError('Session not found.', 404, 'SESSION_NOT_FOUND');
  }

  if (record.status === 'ended') {
    throw new LiveSyncError('Session has already ended.', 410, 'SESSION_ENDED');
  }

  if (record.leaderId !== verified.participantId) {
    throw new LiveSyncError(
      'Forbidden: only the primary worship leader can transfer leadership or manage co-leaders.',
      403,
      'FORBIDDEN_PRIMARY_LEADER_ONLY'
    );
  }

  const target = record.participants.find((p) => p.id === targetParticipantId);
  if (!target) {
    throw new LiveSyncError(
      'Target participant is not in this session.',
      404,
      'PARTICIPANT_NOT_FOUND'
    );
  }

  if (action === 'make-leader') {
    const previousLeaderId = record.leaderId;
    record.leaderId = target.id;
    record.leaderName = target.name;
    record.coLeaderIds = record.coLeaderIds.filter((id) => id !== target.id);
    if (!record.coLeaderIds.includes(previousLeaderId)) {
      record.coLeaderIds.push(previousLeaderId);
    }

    record.participants = record.participants.map((p) => {
      if (p.id === target.id) return { ...p, role: 'leader' };
      if (p.id === previousLeaderId) return { ...p, role: 'co-leader' };
      return p;
    });
  } else {
    // Toggle co-leader
    if (target.id === record.leaderId) {
      return sanitizeSnapshot(record);
    }
    const isCoLeader = record.coLeaderIds.includes(target.id);
    if (isCoLeader) {
      record.coLeaderIds = record.coLeaderIds.filter((id) => id !== target.id);
      target.role = 'member';
    } else {
      record.coLeaderIds.push(target.id);
      target.role = 'co-leader';
    }
  }

  record.revision += 1;
  persistStoreToDisk();
  broadcastSessionEvent(sessionId, 'leadership_transferred');

  return sanitizeSnapshot(record);
}

/**
 * Updates a participant's own instrument view mode or presence status without altering the shared musical state.
 */
export function updateParticipantPresence(
  sessionId: string,
  participantToken: string,
  updates: {
    instrument?: InstrumentViewMode;
    connectionState?: 'connected' | 'reconnecting' | 'disconnected';
  }
): LiveSessionSnapshot {
  const verified = verifyParticipantToken(participantToken, sessionId);
  if (!verified) {
    throw new LiveSyncError('Unauthorized token.', 401, 'UNAUTHORIZED');
  }

  const record = getSessionRecord(sessionId);
  if (!record) {
    throw new LiveSyncError('Session not found.', 404, 'SESSION_NOT_FOUND');
  }

  const store = getStore();
  const participant = record.participants.find(
    (p) => p.id === verified.participantId
  );
  if (!participant) {
    throw new LiveSyncError(
      'Participant not found in session.',
      403,
      'NOT_IN_SESSION'
    );
  }

  const prevInstrument = participant.instrument;
  const prevConnectionState = participant.connectionState;

  participant.lastSeenAt = new Date().toISOString();
  if (updates.instrument) {
    participant.instrument = updates.instrument;
  }
  if (updates.connectionState) {
    participant.connectionState = updates.connectionState;
  } else {
    participant.connectionState = 'connected';
  }

  const hasMeaningfulChange =
    (updates.instrument && updates.instrument !== prevInstrument) ||
    participant.connectionState !== prevConnectionState;

  // Persist and broadcast if instrument or connection state transitioned;
  // keep routine heartbeats lightweight in-memory to prevent disk/network thrashing
  if (hasMeaningfulChange) {
    persistStoreToDisk();
    broadcastSessionEvent(sessionId, 'presence_updated');
  }

  return sanitizeSnapshot(record);
}

/**
 * Safely ends the live session. Only the primary leader may end the session.
 */
export function endLiveSession(
  sessionId: string,
  participantToken?: string,
  options?: { isAuthorizedLeader?: boolean }
): LiveSessionSnapshot {
  const record = getSessionRecord(sessionId);
  if (!record) {
    throw new LiveSyncError('Session not found.', 404, 'SESSION_NOT_FOUND');
  }

  let isAuthorized = Boolean(options?.isAuthorizedLeader);
  if (!isAuthorized && participantToken) {
    const verified = verifyParticipantToken(participantToken, sessionId);
    if (verified && record.leaderId === verified.participantId) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    throw new LiveSyncError(
      'Forbidden: only the worship leader may end the live session.',
      403,
      'FORBIDDEN_PRIMARY_LEADER_ONLY'
    );
  }

  record.status = 'ended';
  record.endedAt = new Date().toISOString();
  record.revision += 1;

  if (record.groupId) {
    try {
      setGroupLiveSession(record.groupId, null);
    } catch {}
  }

  persistStoreToDisk();
  broadcastSessionEvent(sessionId, 'session_ended');

  return sanitizeSnapshot(record);
}

/**
 * Subscribes a connected client to real-time session events (used by the SSE stream route).
 */
export function subscribeToLiveSession(
  sessionId: string,
  participantToken: string,
  onEvent: StreamSubscriber
): {
  initialSnapshot: LiveSessionSnapshot;
  unsubscribe: () => void;
} {
  const verified = verifyParticipantToken(participantToken, sessionId);
  if (!verified) {
    throw new LiveSyncError('Unauthorized stream token.', 401, 'UNAUTHORIZED');
  }

  const record = getSessionRecord(sessionId);
  if (!record) {
    throw new LiveSyncError('Session not found.', 404, 'SESSION_NOT_FOUND');
  }

  const store = getStore();
  const participant = record.participants.find(
    (p) => p.id === verified.participantId
  );
  if (!participant) {
    throw new LiveSyncError(
      'Participant not registered in this session.',
      403,
      'NOT_IN_SESSION'
    );
  }

  const streamKey = `${sessionId}:${participant.id}`;
  store.activeStreamCounts.set(
    streamKey,
    (store.activeStreamCounts.get(streamKey) ?? 0) + 1
  );

  participant.lastSeenAt = new Date().toISOString();
  participant.connectionState = 'connected';

  let sessionSubs = store.subscribers.get(sessionId);
  if (!sessionSubs) {
    sessionSubs = new Set();
    store.subscribers.set(sessionId, sessionSubs);
  }
  sessionSubs.add(onEvent);

  broadcastSessionEvent(sessionId, 'presence_updated');

  const unsubscribe = () => {
    const currentSubs = store.subscribers.get(sessionId);
    if (currentSubs) {
      currentSubs.delete(onEvent);
    }

    const prevCount = store.activeStreamCounts.get(streamKey) ?? 1;
    const nextCount = Math.max(0, prevCount - 1);
    if (nextCount === 0) {
      store.activeStreamCounts.delete(streamKey);
      const currentRecord = store.sessions.get(sessionId);
      const currentParticipant = currentRecord?.participants.find(
        (p) => p.id === participant.id
      );
      if (
        currentParticipant &&
        currentParticipant.connectionState === 'connected'
      ) {
        currentParticipant.connectionState = 'reconnecting';
        broadcastSessionEvent(sessionId, 'presence_updated');
      }
    } else {
      store.activeStreamCounts.set(streamKey, nextCount);
    }
  };

  return {
    initialSnapshot: sanitizeSnapshot(record),
    unsubscribe,
  };
}

/**
 * Resets the in-memory session store for isolated automated test runs.
 */
export function clearAllLiveSessionsForTest(): void {
  const store = getStore();
  store.sessions.clear();
  store.subscribers.clear();
  store.activeStreamCounts.clear();
}

