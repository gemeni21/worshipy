import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase/firebaseClient.ts';
import { apiUrl } from '../api/apiClient.ts';
import type {
  ArrangementInstrumentScope,
  GroupMember,
  TeamArrangementSuggestion,
  TeamPracticeTake,
  TeamPresenceRecord,
  TeamSongArrangement,
  UserProfile,
  WorshipGroup,
  TeamActiveSetlist,
  TeamSetlistSuggestion,
} from '../../types/auth.ts';

const LOCAL_GROUP_CACHE_KEY = 'worshipy_cached_group';
const PRESENCE_HEARTBEAT_MS = 20000; // 20 seconds
const ONLINE_THRESHOLD_MS = 50000; // 50 seconds

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem('worshipy_auth_token_v1') ||
    localStorage.getItem('worshipy_token') ||
    null
  );
}

export function setSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('worshipy_auth_token_v1', token);
    localStorage.setItem('worshipy_token', token);
  } catch {}
}

// Local storage helper
export function getCachedTeam(): WorshipGroup | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_GROUP_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedTeam(group: WorshipGroup | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (group) {
      localStorage.setItem(LOCAL_GROUP_CACHE_KEY, JSON.stringify(group));
    } else {
      localStorage.removeItem(LOCAL_GROUP_CACHE_KEY);
    }
  } catch {}
}

// ============================================================================
// TEAM HUB ANTI-FLICKER RECONCILIATION
// ============================================================================

/**
 * Deterministic, key-order-independent serialization (drops `undefined` values and internal
 * transport/Firestore-mirror metadata) so two payloads with identical UI content always
 * compare equal regardless of which source (server API, Firestore snapshot, cache) produced them.
 */
const IGNORED_TEAM_SERIALIZE_KEYS = new Set([
  'serverRevision',
  'memberIds',
  'memberUids',
  'updatedAt',
]);

export function stableSerializeTeam(value: unknown): string {
  const seen = new WeakSet<object>();
  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map((item) => (item === undefined ? null : normalize(item)));
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as Record<string, unknown>).sort()) {
      if (IGNORED_TEAM_SERIALIZE_KEYS.has(key)) continue;
      let child = (v as Record<string, unknown>)[key];
      if (child === undefined || child === null) continue;
      if (key === 'practiceTakes' && Array.isArray(child)) {
        const userTakes = child.filter(
          (t: any) =>
            t &&
            typeof t.id === 'string' &&
            !t.id.startsWith('__wmc_') &&
            t.songId !== '__system_meta__'
        );
        if (userTakes.length === 0) continue;
        child = userTakes;
      }
      out[key] = normalize(child);
    }
    return out;
  };
  return JSON.stringify(normalize(value));
}

/** True when two team payloads carry identical content (ignores key order / undefined). */
export function areTeamGroupsEquivalent(
  a: WorshipGroup | null | undefined,
  b: WorshipGroup | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return stableSerializeTeam(a) === stableSerializeTeam(b);
}

const highestServerRevisionByGroup = new Map<string, number>();

/**
 * Returns true when a server-API payload is OLDER than a revision we have already applied.
 * On hosted (serverless) Cloud Hubs, consecutive polls can land on different instances that
 * hold different copies of the group; without this guard the Team Hub flip-flops between
 * versions every poll. Payloads without a revision (legacy servers) are never stale.
 */
export function isStaleServerGroupPayload(group: WorshipGroup | null | undefined): boolean {
  if (!group?.id || typeof group.serverRevision !== 'number') return false;
  let highest = highestServerRevisionByGroup.get(group.id);
  if (highest === undefined) {
    const cached = getCachedTeam();
    highest =
      cached?.id === group.id && typeof cached.serverRevision === 'number'
        ? cached.serverRevision
        : 0;
    highestServerRevisionByGroup.set(group.id, highest);
  }
  if (group.serverRevision < highest) return true;
  if (group.serverRevision > highest) {
    highestServerRevisionByGroup.set(group.id, group.serverRevision);
  }
  return false;
}

/** Test-only helper to reset revision tracking between scenarios. */
export function resetServerRevisionTrackingForTest(): void {
  highestServerRevisionByGroup.clear();
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Creates a new Worship Group in Firestore with sync to server API
 */
export async function createTeam(
  user: UserProfile,
  name: string,
  churchName?: string
): Promise<WorshipGroup> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Please enter a team name.');

  const db = getFirebaseFirestore();
  const token = getSessionToken();
  let finalGroup: WorshipGroup | null = null;

  // 1. Sync with server to get canonical group and update HMAC session token
  try {
    const res = await fetch(apiUrl('/api/groups/create'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: trimmedName, churchName: churchName?.trim() || user.churchName }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        setSessionToken(data.token);
      }
      if (data.group) {
        finalGroup = data.group;
      }
    } else {
      const data = await res.json().catch(() => null);
      if (data?.error && data.error.includes('already a member')) {
        throw new Error(data.error);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already a member')) {
      throw err;
    }
    console.warn('Server group create note, proceeding with fallback:', err);
  }

  // 2. Fallback to client-generated group if server was unreachable
  if (!finalGroup) {
    const now = new Date().toISOString();
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const inviteCode = generateInviteCode();
    const newMember: GroupMember = {
      userId: user.id,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      role: 'leader',
      instrument: user.instrument || 'Worship Leader',
      photoURL: user.photoURL,
      joinedAt: now,
    };
    finalGroup = {
      id: groupId,
      name: trimmedName,
      churchName: churchName?.trim() || user.churchName,
      inviteCode,
      ownerId: user.id,
      createdAt: now,
      members: [newMember],
    };
  }

  // 3. Write to Firestore so real-time roster & presence listeners work across all devices
  if (db && finalGroup) {
    try {
      const groupRef = doc(db, 'groups', finalGroup.id);
      await setDoc(
        groupRef,
        {
          id: finalGroup.id,
          name: finalGroup.name,
          churchName: finalGroup.churchName || null,
          inviteCode: finalGroup.inviteCode,
          ownerId: finalGroup.ownerId,
          createdAt: finalGroup.createdAt,
          members: finalGroup.members,
          memberIds: finalGroup.members.map((m) => m.userId),
        },
        { merge: true }
      );
    } catch (firestoreErr) {
      console.warn('Firestore group write note:', firestoreErr);
    }
  }

  setCachedTeam(finalGroup);
  return finalGroup;
}

/**
 * Joins a team using a 6-character invite code
 */
export async function joinTeamByInviteCode(
  user: UserProfile,
  inviteCode: string
): Promise<WorshipGroup> {
  const normalizedCode = inviteCode.trim().toUpperCase();
  if (!normalizedCode) throw new Error('Please enter an invite code.');

  const db = getFirebaseFirestore();
  const token = getSessionToken();
  let foundGroup: WorshipGroup | null = null;
  let targetDocId = '';

  // 1. First look up team in Firestore
  if (db) {
    try {
      const q = query(
        collection(db, 'groups'),
        where('inviteCode', '==', normalizedCode),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        targetDocId = docSnap.id;
        foundGroup = { id: docSnap.id, ...docSnap.data() } as WorshipGroup;
      }
    } catch (err) {
      console.warn('Firestore join lookup note:', err);
    }
  }

  // 2. Sync with server API to update user session token and resolve server store
  try {
    const res = await fetch(apiUrl('/api/groups/join'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ inviteCode: normalizedCode }),
    });
    const data = await res.json();
    if (res.ok && data.group) {
      if (data.token) {
        setSessionToken(data.token);
      }
      if (!foundGroup) {
        foundGroup = data.group;
        targetDocId = data.group.id;
      }
    } else if (!foundGroup && !res.ok) {
      throw new Error(data.error || 'No worship team found with that invite code.');
    }
  } catch (apiErr) {
    if (!foundGroup) {
      throw apiErr instanceof Error ? apiErr : new Error('Team not found with that invite code.');
    }
  }

  if (!foundGroup) {
    throw new Error('No worship team found with that invite code. Please verify the code with your worship leader.');
  }

  // 3. Update membership in Firestore for real-time sync across band members
  if (db) {
    const docId = targetDocId || foundGroup.id;
    const existingIndex = foundGroup.members.findIndex((m) => m.userId === user.id);
    if (existingIndex === -1) {
      const newMember: GroupMember = {
        userId: user.id,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        role: 'member',
        instrument: user.instrument || 'Musician',
        photoURL: user.photoURL,
        joinedAt: new Date().toISOString(),
      };
      const updatedMembers = [...foundGroup.members, newMember];
      foundGroup.members = updatedMembers;

      try {
        await updateDoc(doc(db, 'groups', docId), {
          members: updatedMembers,
          memberIds: updatedMembers.map((m) => m.userId),
        });
      } catch (err) {
        console.warn('Firestore member update note:', err);
      }

      // Sync full member roster with server API so polling keeps everyone
      fetch(apiUrl(`/api/groups/${foundGroup.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          members: updatedMembers,
          groupName: foundGroup.name,
          inviteCode: foundGroup.inviteCode,
        }),
      }).catch(() => {});
    } else {
      // Sync document structure if needed
      try {
        await setDoc(
          doc(db, 'groups', docId),
          {
            id: foundGroup.id,
            name: foundGroup.name,
            churchName: foundGroup.churchName || null,
            inviteCode: foundGroup.inviteCode,
            ownerId: foundGroup.ownerId,
            createdAt: foundGroup.createdAt,
            members: foundGroup.members,
            memberIds: foundGroup.members.map((m) => m.userId),
          },
          { merge: true }
        );
      } catch {}
    }
  }

  setCachedTeam(foundGroup);
  return foundGroup;
}

/**
 * Leaves a team
 */
export async function leaveTeam(groupId: string, userId: string): Promise<void> {
  const db = getFirebaseFirestore();
  const token = getSessionToken();

  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      const snap = await getDoc(groupRef);
      if (snap.exists()) {
        const data = snap.data() as WorshipGroup;
        const updatedMembers = data.members.filter((m) => m.userId !== userId);
        if (updatedMembers.length === 0) {
          await deleteDoc(groupRef);
        } else {
          const isLeader = data.ownerId === userId;
          const newOwnerId = isLeader ? updatedMembers[0].userId : data.ownerId;
          if (isLeader) {
            updatedMembers[0].role = 'leader';
          }
          await updateDoc(groupRef, {
            members: updatedMembers,
            memberIds: updatedMembers.map((m) => m.userId),
            ownerId: newOwnerId,
          });
        }
      }
    } catch (err) {
      console.warn('Firestore leave note:', err);
    }
  }

  // Sync with server API
  try {
    const res = await fetch(apiUrl('/api/groups/leave'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        setSessionToken(data.token);
      }
    }
  } catch {}

  setCachedTeam(null);
}

export const TEAM_SYNC_CHANNEL_NAME = 'wmc_team_sync_channel';
export const SETLIST_META_TAKE_ID = '__team_active_setlist_meta__';
export const SETLIST_SUGGESTIONS_META_TAKE_ID = '__team_setlist_suggestions_meta__';
export const LIVE_SESSION_META_TAKE_ID = '__team_active_live_session_meta__';

export function broadcastTeamSync(group: WorshipGroup): void {
  try {
    if (typeof window !== 'undefined') {
      if ('BroadcastChannel' in window) {
        const ch = new BroadcastChannel(TEAM_SYNC_CHANNEL_NAME);
        ch.postMessage({ type: 'GROUP_UPDATED', group });
        ch.close();
      }
      window.dispatchEvent(new CustomEvent('wmc_team_sync', { detail: group }));
    }
  } catch {}
}

/**
 * Updates church branding (custom app title, logo, and church name) for a worship team
 */
export async function updateTeamBranding(
  groupId: string,
  updates: {
    customAppTitle?: string;
    customAppLogoUrl?: string;
    churchName?: string;
  }
): Promise<WorshipGroup> {
  const db = getFirebaseFirestore();
  const token = getSessionToken();
  const current = getCachedTeam();

  const updatedGroup: WorshipGroup = {
    ...(current || {
      id: groupId,
      name: 'Worship Team',
      inviteCode: '',
      ownerId: '',
      createdAt: new Date().toISOString(),
      members: [],
    }),
    ...(updates.customAppTitle !== undefined ? { customAppTitle: updates.customAppTitle || undefined } : {}),
    ...(updates.customAppLogoUrl !== undefined ? { customAppLogoUrl: updates.customAppLogoUrl || undefined } : {}),
    ...(updates.churchName !== undefined ? { churchName: updates.churchName || undefined } : {}),
  };

  // 1. Immediately update local cache and broadcast across all tabs
  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  // 2. Write to Cloud Firestore
  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      await setDoc(
        groupRef,
        {
          ...(updates.customAppTitle !== undefined ? { customAppTitle: updates.customAppTitle || null } : {}),
          ...(updates.customAppLogoUrl !== undefined ? { customAppLogoUrl: updates.customAppLogoUrl || null } : {}),
          ...(updates.churchName !== undefined ? { churchName: updates.churchName || null } : {}),
        },
        { merge: true }
      );
    } catch (firestoreErr: unknown) {
      console.warn('Firestore branding update note:', firestoreErr);
    }
  }

  // 3. Sync to server API
  try {
    const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        ...updates,
        groupName: current?.name,
        inviteCode: current?.inviteCode,
        members: current?.members,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        setCachedTeam(data.group);
        broadcastTeamSync(data.group);
        return data.group;
      }
    }
  } catch (err) {
    console.warn('Server group branding sync note:', err);
  }

  return updatedGroup;
}

export const DISMISSED_SUGGESTIONS_KEY = 'worshipy_dismissed_suggestions';

export function getDismissedSuggestionIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_SUGGESTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch {}
  return new Set();
}

export function recordDismissedSuggestionId(suggestionId: string): void {
  if (typeof window === 'undefined' || !suggestionId) return;
  try {
    const current = getDismissedSuggestionIds();
    current.add(suggestionId);
    const trimmed = Array.from(current).slice(-100);
    localStorage.setItem(DISMISSED_SUGGESTIONS_KEY, JSON.stringify(trimmed));
  } catch {}
}

/**
 * Merges incoming and current setlist suggestions with terminal state invariance & tombstone protection:
 * 1. Once a suggestion reaches 'approved' or 'declined', stale responses (e.g. 'pending')
 *    can never demote or resurrect it back to 'pending'.
 * 2. If a suggestion's setlist matches the active team lineup, it is normalized to 'approved'.
 * 3. Dismissed or deleted suggestions are never resurrected from older local caches.
 */
export function mergeSuggestedSetlists(
  incoming?: TeamSetlistSuggestion[],
  current?: TeamSetlistSuggestion[],
  activeSetlist?: TeamActiveSetlist | null,
  explicitDismissedIds?: string[] | Set<string>
): TeamSetlistSuggestion[] {
  const dismissedIds = getDismissedSuggestionIds();
  if (explicitDismissedIds) {
    if (Array.isArray(explicitDismissedIds)) {
      for (const id of explicitDismissedIds) dismissedIds.add(id);
    } else {
      for (const id of explicitDismissedIds) dismissedIds.add(id);
    }
  }

  const isDismissed = (item?: TeamSetlistSuggestion) => {
    return !item || !item.id || dismissedIds.has(item.id);
  };

  const cleanIncoming = (incoming || []).filter((item) => !isDismissed(item));
  const cleanCurrent = (current || []).filter((item) => !isDismissed(item));

  const isActiveLineupMatch = (item: TeamSetlistSuggestion) => {
    if (!activeSetlist || !item?.setlist) return false;
    if (activeSetlist.id && item.setlist.id === activeSetlist.id) return true;
    if (
      activeSetlist.name &&
      item.setlist.name &&
      activeSetlist.name.trim().toLowerCase() === item.setlist.name.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  };

  const normalizeItem = (item: TeamSetlistSuggestion): TeamSetlistSuggestion => {
    if (isActiveLineupMatch(item) && item.status !== 'declined') {
      return { ...item, status: 'approved' };
    }
    return item;
  };

  if (cleanIncoming.length === 0 && cleanCurrent.length === 0) return [];
  if (cleanIncoming.length === 0 && !incoming) return cleanCurrent.map(normalizeItem);
  if (cleanCurrent.length === 0 && !current) return cleanIncoming.map(normalizeItem);

  const map = new Map<string, TeamSetlistSuggestion>();

  const getPriority = (status?: string) => {
    if (status === 'approved' || status === 'declined') return 2;
    return 1;
  };

  // 1. Seed with incoming items
  for (const item of cleanIncoming) {
    if (item && item.id) {
      if (isActiveLineupMatch(item) && item.status !== 'declined') {
        map.set(item.id, { ...item, status: 'approved' });
      } else {
        map.set(item.id, item);
      }
    }
  }

  // 2. Reconcile with current items
  for (const item of cleanCurrent) {
    if (!item || !item.id) continue;
    const existing = map.get(item.id);
    if (!existing) {
      // If incoming was provided (even if empty), an item missing from incoming was deleted/dismissed.
      // Only keep it if it is a fresh optimistic suggestion (created within last 30s) and pending.
      const isFreshOptimistic =
        item.status === 'pending' &&
        item.suggestedAt &&
        Date.now() - new Date(item.suggestedAt).getTime() < 30000;

      if (!incoming || isFreshOptimistic) {
        if (isActiveLineupMatch(item) && item.status !== 'declined') {
          map.set(item.id, { ...item, status: 'approved' });
        } else {
          map.set(item.id, item);
        }
      }
    } else {
      const existingPri = getPriority(existing.status);
      const itemPri = getPriority(item.status);

      let mergedItem: TeamSetlistSuggestion;
      if (itemPri > existingPri) {
        // Current is approved/declined while incoming is pending -> retain terminal resolved status!
        mergedItem = { ...existing, ...item };
      } else if (existingPri > itemPri) {
        // Incoming is approved/declined while current was pending -> retain incoming terminal status
        mergedItem = { ...item, ...existing };
      } else {
        // Same priority: prefer the one with later timestamp
        const itemTime = item.reviewedAt || item.suggestedAt || '';
        const existTime = existing.reviewedAt || existing.suggestedAt || '';
        if (itemTime >= existTime) {
          mergedItem = { ...existing, ...item };
        } else {
          mergedItem = { ...item, ...existing };
        }
      }

      if (isActiveLineupMatch(mergedItem) && mergedItem.status !== 'declined') {
        mergedItem.status = 'approved';
      }

      map.set(item.id, mergedItem);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.suggestedAt || 0).getTime() - new Date(a.suggestedAt || 0).getTime()
  );
}

/**
 * Merges incoming and current song arrangement suggestions with terminal state invariance
 * and tombstone (`getDismissedSuggestionIds()`) protection.
 */
export function mergeSuggestedArrangements(
  incoming?: TeamArrangementSuggestion[],
  current?: TeamArrangementSuggestion[],
  explicitDismissedIds?: string[] | Set<string>
): TeamArrangementSuggestion[] {
  const dismissedIds = getDismissedSuggestionIds();
  if (explicitDismissedIds) {
    for (const id of explicitDismissedIds) dismissedIds.add(id);
  }

  const isDismissed = (item?: TeamArrangementSuggestion) =>
    !item || !item.id || dismissedIds.has(item.id);

  const cleanIncoming = (incoming || []).filter((item) => !isDismissed(item));
  const cleanCurrent = (current || []).filter((item) => !isDismissed(item));

  if (cleanIncoming.length === 0 && cleanCurrent.length === 0) return [];
  if (cleanIncoming.length === 0 && !incoming) return cleanCurrent;
  if (cleanCurrent.length === 0 && !current) return cleanIncoming;

  const map = new Map<string, TeamArrangementSuggestion>();
  const getPriority = (status?: string) =>
    status === 'approved' || status === 'declined' ? 2 : 1;

  for (const item of cleanIncoming) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }

  for (const item of cleanCurrent) {
    if (!item || !item.id) continue;
    const existing = map.get(item.id);
    if (!existing) {
      const isFreshOptimistic =
        item.status === 'pending' &&
        item.suggestedAt &&
        Date.now() - new Date(item.suggestedAt).getTime() < 30000;
      if (!incoming || isFreshOptimistic) {
        map.set(item.id, item);
      }
    } else {
      const existingPri = getPriority(existing.status);
      const itemPri = getPriority(item.status);
      if (itemPri > existingPri) {
        map.set(item.id, { ...existing, ...item });
      } else if (existingPri > itemPri) {
        map.set(item.id, { ...item, ...existing });
      } else {
        const itemTime = item.reviewedAt || item.suggestedAt || '';
        const existTime = existing.reviewedAt || existing.suggestedAt || '';
        map.set(
          item.id,
          itemTime >= existTime ? { ...existing, ...item } : { ...item, ...existing }
        );
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.suggestedAt || 0).getTime() - new Date(a.suggestedAt || 0).getTime()
  );
}

/**
 * Canonical reconciliation of an incoming `WorshipGroup` (from server API, Firestore snapshot,
 * BroadcastChannel, or cache) with the existing cached/active group. Strips Firestore-internal
 * fields (`memberIds`, `memberUids`, `updatedAt`, system meta-takes) so all sources converge on
 * a single identical representation without triggering re-render ping-pong.
 */
export function reconcileTeamGroup(
  fresh: WorshipGroup,
  currentCached?: WorshipGroup | null
): WorshipGroup {
  const sameGroup = Boolean(currentCached && currentCached.id === fresh.id);

  // 1. Union-merge roster members by userId so polling or partial snapshots never drop musicians
  const memberMap = new Map<string, GroupMember>();
  if (sameGroup && Array.isArray(currentCached?.members)) {
    for (const m of currentCached.members) {
      if (m && m.userId) memberMap.set(m.userId, m);
    }
  }
  if (Array.isArray(fresh.members)) {
    for (const m of fresh.members) {
      if (!m || !m.userId) continue;
      const prev = memberMap.get(m.userId);
      memberMap.set(m.userId, prev ? { ...prev, ...m } : m);
    }
  }
  const mergedMembers = Array.from(memberMap.values());

  // 2. Preserve activeSetlist when omitted (`undefined`), honor explicit clear (`null`)
  let effectiveSetlist: TeamActiveSetlist | undefined = fresh.activeSetlist ?? undefined;
  if (fresh.activeSetlist === null) {
    effectiveSetlist = undefined;
  } else if (fresh.activeSetlist === undefined && sameGroup) {
    effectiveSetlist = currentCached?.activeSetlist ?? undefined;
  }

  // 3. Reconcile suggestedSetlists with terminal state invariance & tombstone protection
  const effectiveSuggestions = mergeSuggestedSetlists(
    fresh.suggestedSetlists,
    sameGroup ? currentCached?.suggestedSetlists : undefined,
    effectiveSetlist ?? null
  );

  // 4. Reconcile songArrangements & suggestedArrangements
  const effectiveSongArrangements: Record<string, TeamSongArrangement> | undefined =
    fresh.songArrangements !== undefined
      ? fresh.songArrangements
      : sameGroup
      ? currentCached?.songArrangements
      : undefined;

  const effectiveSuggestedArrangements = mergeSuggestedArrangements(
    fresh.suggestedArrangements,
    sameGroup ? currentCached?.suggestedArrangements : undefined
  );

  // 5. Filter out system `__wmc_*` meta-takes from practiceTakes
  const rawTakes =
    fresh.practiceTakes !== undefined
      ? fresh.practiceTakes
      : sameGroup
      ? currentCached?.practiceTakes
      : undefined;
  const cleanPracticeTakes = Array.isArray(rawTakes)
    ? rawTakes.filter(
        (t) =>
          t &&
          typeof t.id === 'string' &&
          !t.id.startsWith('__wmc_') &&
          t.songId !== '__system_meta__'
      )
    : undefined;

  // 6. Normalize optional strings (`null` or `""` -> `undefined`)
  const churchName =
    fresh.churchName !== undefined
      ? fresh.churchName || undefined
      : sameGroup
      ? currentCached?.churchName || undefined
      : undefined;
  const customAppTitle =
    fresh.customAppTitle !== undefined
      ? fresh.customAppTitle || undefined
      : sameGroup
      ? currentCached?.customAppTitle || undefined
      : undefined;
  const customAppLogoUrl =
    fresh.customAppLogoUrl !== undefined
      ? fresh.customAppLogoUrl || undefined
      : sameGroup
      ? currentCached?.customAppLogoUrl || undefined
      : undefined;

  // 7. Carry monotonic serverRevision forward
  const freshRev = typeof fresh.serverRevision === 'number' ? fresh.serverRevision : undefined;
  const cachedRev =
    sameGroup && typeof currentCached?.serverRevision === 'number'
      ? currentCached.serverRevision
      : undefined;
  const effectiveRevision =
    freshRev !== undefined && cachedRev !== undefined
      ? Math.max(freshRev, cachedRev)
      : freshRev ?? cachedRev;

  const canonical: WorshipGroup = {
    id: fresh.id,
    name: fresh.name || (sameGroup ? currentCached?.name : '') || 'Worship Team',
    ...(churchName ? { churchName } : {}),
    ...(customAppTitle ? { customAppTitle } : {}),
    ...(customAppLogoUrl ? { customAppLogoUrl } : {}),
    inviteCode: fresh.inviteCode || (sameGroup ? currentCached?.inviteCode : '') || '',
    ownerId: fresh.ownerId || (sameGroup ? currentCached?.ownerId : '') || '',
    createdAt: fresh.createdAt || (sameGroup ? currentCached?.createdAt : '') || '',
    members: mergedMembers,
    ...(cleanPracticeTakes && cleanPracticeTakes.length > 0
      ? { practiceTakes: cleanPracticeTakes }
      : {}),
    ...(effectiveSetlist ? { activeSetlist: effectiveSetlist } : {}),
    suggestedSetlists: effectiveSuggestions,
    ...(effectiveSongArrangements ? { songArrangements: effectiveSongArrangements } : {}),
    ...(effectiveSuggestedArrangements.length > 0 || fresh.suggestedArrangements !== undefined
      ? { suggestedArrangements: effectiveSuggestedArrangements }
      : {}),
    ...(fresh.activeLiveSessionId ? { activeLiveSessionId: fresh.activeLiveSessionId } : {}),
    ...(fresh.activeLiveSessionJoinCode
      ? { activeLiveSessionJoinCode: fresh.activeLiveSessionJoinCode }
      : {}),
    ...(fresh.activeLiveSessionExpiresAt
      ? { activeLiveSessionExpiresAt: fresh.activeLiveSessionExpiresAt }
      : {}),
    ...(fresh.activeLiveSessionLeaderName
      ? { activeLiveSessionLeaderName: fresh.activeLiveSessionLeaderName }
      : {}),
    ...(effectiveRevision !== undefined ? { serverRevision: effectiveRevision } : {}),
  };

  return canonical;
}

export function sanitizeActiveSetlistForFirestore(setlist: any): TeamActiveSetlist | null {
  if (!setlist || typeof setlist !== 'object' || !setlist.id || !setlist.name) {
    return null;
  }
  const cleanItems = (Array.isArray(setlist.items) ? setlist.items : [])
    .slice(0, 100)
    .map((item: any) => ({
      songId: String(item.songId || '').slice(0, 128),
      ...(item.songTitle ? { songTitle: String(item.songTitle).slice(0, 200) } : {}),
      ...(item.songArtist ? { songArtist: String(item.songArtist).slice(0, 200) } : {}),
      ...(item.addedAt ? { addedAt: String(item.addedAt) } : {}),
      ...(item.notes ? { notes: String(item.notes).slice(0, 1000) } : {}),
      ...(typeof item.preferredSemitones === 'number' ? { preferredSemitones: item.preferredSemitones } : {}),
      ...(item.referenceAudioUrl ? { referenceAudioUrl: String(item.referenceAudioUrl).slice(0, 2048) } : {}),
    }));

  const clean: TeamActiveSetlist = {
    id: String(setlist.id).slice(0, 128),
    name: String(setlist.name).slice(0, 100),
    publishedAt: String(setlist.publishedAt || setlist.createdAt || new Date().toISOString()),
    publishedBy: String(setlist.publishedBy || 'leader').slice(0, 128),
    items: cleanItems,
    ...(setlist.description ? { description: String(setlist.description).slice(0, 1000) } : {}),
    ...(setlist.publishedByName ? { publishedByName: String(setlist.publishedByName).slice(0, 100) } : {}),
    ...(setlist.createdAt ? { createdAt: String(setlist.createdAt) } : {}),
    ...(setlist.updatedAt ? { updatedAt: String(setlist.updatedAt) } : {}),
  };
  return clean;
}

/**
 * Publishes an active setlist (lineup) to the team in Firestore, local cache, and server
 */
export async function publishTeamSetlist(
  groupId: string,
  setlist: TeamActiveSetlist
): Promise<WorshipGroup> {
  const db = getFirebaseFirestore();
  const token = getSessionToken();
  const current = getCachedTeam();

  const updatedGroup: WorshipGroup = {
    ...(current || {
      id: groupId,
      name: 'Worship Team',
      inviteCode: '',
      ownerId: '',
      createdAt: new Date().toISOString(),
      members: [],
    }),
    activeSetlist: setlist,
  };

  // 1. Immediately update local cache and broadcast across tabs
  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  // 2. Sync to authoritative server API first
  try {
    const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        activeSetlist: setlist,
        groupName: current?.name,
        inviteCode: current?.inviteCode,
        members: current?.members,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        setCachedTeam(data.group);
        broadcastTeamSync(data.group);
      }
    }
  } catch (err) {
    console.warn('Server publish setlist sync note:', err);
  }

  // 3. Write to Firestore with practiceTakes meta-take fallback
  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      const cleanItems = (setlist.items || []).map((item) => ({
        songId: item.songId,
        addedAt: item.addedAt,
        ...(item.preferredSemitones !== undefined ? { preferredSemitones: item.preferredSemitones } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
        ...(item.referenceAudioUrl ? { referenceAudioUrl: item.referenceAudioUrl } : {}),
      }));

      const metaTake: TeamPracticeTake = {
        id: SETLIST_META_TAKE_ID,
        songId: '__system_meta__',
        songTitle: 'Upcoming Setlist Lineup',
        title: setlist.name,
        authorName: setlist.publishedByName || 'Leader',
        authorId: setlist.publishedBy,
        createdAt: setlist.publishedAt,
        durationSeconds: 0,
        notes: JSON.stringify({
          ...setlist,
          items: cleanItems,
        }),
      };

      const existingTakes = (current?.practiceTakes || []).filter(
        (t) => t.id !== SETLIST_META_TAKE_ID
      );
      const combinedTakes = [metaTake, ...existingTakes].slice(0, 50);

      try {
        await setDoc(
          groupRef,
          {
            activeSetlist: {
              id: setlist.id,
              name: setlist.name,
              ...(setlist.description ? { description: setlist.description } : {}),
              publishedAt: setlist.publishedAt,
              publishedBy: setlist.publishedBy,
              ...(setlist.publishedByName ? { publishedByName: setlist.publishedByName } : {}),
              items: cleanItems,
            },
            practiceTakes: combinedTakes,
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore publish setlist primary write note:', err);
        // Fallback for deployed Firestore rules: update allowed practiceTakes array alone
        try {
          await updateDoc(groupRef, {
            practiceTakes: combinedTakes,
          });
        } catch (fallbackErr) {
          console.warn('Firestore publish setlist fallback note:', fallbackErr);
        }
      }
    } catch (outerErr) {
      console.warn('Firestore publish setlist outer note:', outerErr);
    }
  }

  return updatedGroup;
}

export async function clearTeamSetlist(groupId: string): Promise<WorshipGroup> {
  const db = getFirebaseFirestore();
  const token = getSessionToken();
  const current = getCachedTeam();

  const updatedGroup: WorshipGroup = {
    ...(current || {
      id: groupId,
      name: 'Worship Team',
      inviteCode: '',
      ownerId: '',
      createdAt: new Date().toISOString(),
      members: [],
    }),
    activeSetlist: null as any,
  };

  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  try {
    const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        activeSetlist: null,
        groupName: current?.name,
        inviteCode: current?.inviteCode,
        members: current?.members,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        data.group.activeSetlist = null;
        setCachedTeam(data.group);
        broadcastTeamSync(data.group);
      }
    }
  } catch {}

  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      let existingTakes: any[] = current?.practiceTakes || [];
      try {
        const snap = await getDoc(groupRef);
        if (snap.exists() && Array.isArray(snap.data()?.practiceTakes)) {
          existingTakes = snap.data().practiceTakes;
        }
      } catch {}
      const cleanTakes = existingTakes.filter(
        (t: any) => t.id !== SETLIST_META_TAKE_ID
      );
      try {
        await updateDoc(groupRef, {
          activeSetlist: null,
          practiceTakes: cleanTakes,
        });
      } catch (err) {
        console.warn('Firestore clear setlist primary write note:', err);
        try {
          await updateDoc(groupRef, {
            activeSetlist: null,
          });
        } catch (fallbackErr) {
          console.warn('Firestore clear setlist fallback note:', fallbackErr);
        }
      }
    } catch (outerErr) {
      console.warn('Firestore clear setlist outer note:', outerErr);
    }
  }

  return updatedGroup;
}

export const clearTeamActiveSetlist = clearTeamSetlist;

async function syncSuggestionsToFirestore(
  db: any,
  groupId: string,
  group: WorshipGroup,
  action?: 'approve' | 'decline'
) {
  if (!db || !groupId) return;
  try {
    const groupRef = doc(db, 'groups', groupId);

    // 1. Strictly sanitize suggestions to match firestore.rules
    const cleanSuggestions: TeamSetlistSuggestion[] = (group.suggestedSetlists || []).map((s) => ({
      id: s.id,
      setlist: {
        id: s.setlist.id,
        name: s.setlist.name,
        ...(s.setlist.description ? { description: s.setlist.description } : {}),
        publishedAt: s.setlist.publishedAt || new Date().toISOString(),
        publishedBy: s.setlist.publishedBy || s.suggestedBy,
        ...(s.setlist.publishedByName ? { publishedByName: s.setlist.publishedByName } : {}),
        ...(s.setlist.createdAt ? { createdAt: s.setlist.createdAt } : {}),
        ...(s.setlist.updatedAt ? { updatedAt: s.setlist.updatedAt } : {}),
        items: (s.setlist.items || []).map((item) => ({
          songId: item.songId,
          addedAt: item.addedAt || new Date().toISOString(),
          ...(item.preferredSemitones !== undefined ? { preferredSemitones: item.preferredSemitones } : {}),
          ...(item.notes ? { notes: item.notes } : {}),
          ...(item.referenceAudioUrl ? { referenceAudioUrl: item.referenceAudioUrl } : {}),
        })),
      },
      suggestedBy: s.suggestedBy,
      suggestedByName: s.suggestedByName,
      ...(s.suggestedByRole ? { suggestedByRole: s.suggestedByRole } : {}),
      suggestedAt: s.suggestedAt,
      ...(s.targetServiceDate ? { targetServiceDate: s.targetServiceDate } : {}),
      ...(s.note ? { note: s.note } : {}),
      status: s.status,
      ...(s.reviewedBy ? { reviewedBy: s.reviewedBy } : {}),
      ...(s.reviewedByName ? { reviewedByName: s.reviewedByName } : {}),
      ...(s.reviewedAt ? { reviewedAt: s.reviewedAt } : {}),
      ...(s.reviewNote ? { reviewNote: s.reviewNote } : {}),
    }));

    // 2. Strictly sanitize activeSetlist to match isValidActiveSetlist in firestore.rules
    let cleanActiveSetlist: TeamActiveSetlist | undefined;
    if (action === 'approve' && group.activeSetlist) {
      cleanActiveSetlist = sanitizeActiveSetlistForFirestore(group.activeSetlist) || undefined;
    }

    const metaPayload: Record<string, any> = {
      suggestedSetlists: cleanSuggestions,
    };
    if (cleanActiveSetlist) {
      metaPayload.activeSetlist = cleanActiveSetlist;
    }

    const suggestionsMetaTake: TeamPracticeTake = {
      id: SETLIST_SUGGESTIONS_META_TAKE_ID,
      songId: '__system_meta__',
      songTitle: 'Lineup Suggestions',
      title: `${cleanSuggestions.length} Lineup Proposals`,
      authorName: 'System',
      authorId: 'system',
      createdAt: new Date().toISOString(),
      durationSeconds: 0,
      notes: JSON.stringify(cleanSuggestions),
    };

    const existingTakes = (group.practiceTakes || []).filter(
      (t: TeamPracticeTake) =>
        t.id !== SETLIST_SUGGESTIONS_META_TAKE_ID &&
        (action !== 'approve' || t.id !== SETLIST_META_TAKE_ID)
    );

    const newTakes: TeamPracticeTake[] = [suggestionsMetaTake];
    if (cleanActiveSetlist) {
      newTakes.push({
        id: SETLIST_META_TAKE_ID,
        songId: '__system_meta__',
        songTitle: 'Upcoming Setlist Lineup',
        title: cleanActiveSetlist.name,
        authorName: cleanActiveSetlist.publishedByName || 'Leader',
        authorId: cleanActiveSetlist.publishedBy,
        createdAt: cleanActiveSetlist.publishedAt,
        durationSeconds: 0,
        notes: JSON.stringify(cleanActiveSetlist),
      });
    }

    const combinedTakes = [...newTakes, ...existingTakes].slice(0, 50);
    metaPayload.practiceTakes = combinedTakes;
    group.practiceTakes = combinedTakes;
    setCachedTeam(group);
    broadcastTeamSync(group);

    try {
      await setDoc(groupRef, metaPayload, { merge: true });
    } catch {
      try {
        await updateDoc(groupRef, {
          suggestedSetlists: cleanSuggestions,
          practiceTakes: combinedTakes,
          ...(cleanActiveSetlist ? { activeSetlist: cleanActiveSetlist } : {}),
        });
      } catch {}
    }
  } catch (outerErr) {
    console.warn('syncSuggestionsToFirestore note:', outerErr);
  }
}

export async function proposeTeamSetlist(
  groupId: string,
  setlist: TeamActiveSetlist,
  note?: string,
  targetServiceDate?: string
): Promise<{ ok: boolean; group?: WorshipGroup; suggestion?: TeamSetlistSuggestion; error?: string }> {
  const token = getSessionToken();
  const db = getFirebaseFirestore();
  const current = getCachedTeam();

  try {
    const res = await fetch(apiUrl(`/api/groups/${groupId}/suggestions`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        setlist,
        note,
        targetServiceDate,
        clientGroup: current,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        setCachedTeam(data.group);
        broadcastTeamSync(data.group);
        await syncSuggestionsToFirestore(db, groupId, data.group);
        return { ok: true, group: data.group, suggestion: data.suggestion };
      }
    }
  } catch (err) {
    console.warn('Server propose suggestion note:', err);
  }

  // Resilient Local & Firestore Fallback
  if (setlist && Array.isArray(setlist.items) && setlist.items.length > 0) {
    const now = new Date().toISOString();
    const fallbackSuggestionId = `sugg_${Date.now()}_local`;
    const newSuggestion: TeamSetlistSuggestion = {
      id: fallbackSuggestionId,
      setlist: {
        ...setlist,
        publishedAt: now,
        publishedBy: setlist.publishedBy || 'local_user',
        publishedByName: setlist.publishedByName || 'Vocalist / Member',
      },
      suggestedBy: setlist.publishedBy || 'local_user',
      suggestedByName: setlist.publishedByName || 'Vocalist / Member',
      suggestedByRole: 'Vocalist / Member',
      suggestedAt: now,
      targetServiceDate: targetServiceDate?.trim() || undefined,
      note: note?.trim() || undefined,
      status: 'pending',
    };

    const existing = Array.isArray(current?.suggestedSetlists) ? current.suggestedSetlists : [];
    const fallbackGroup: WorshipGroup = {
      ...(current || {
        id: groupId,
        name: 'Worship Team',
        inviteCode: '',
        ownerId: '',
        createdAt: now,
        members: [],
      }),
      suggestedSetlists: [newSuggestion, ...existing].slice(0, 20),
    };

    setCachedTeam(fallbackGroup);
    broadcastTeamSync(fallbackGroup);
    await syncSuggestionsToFirestore(db, groupId, fallbackGroup);
    return { ok: true, group: fallbackGroup, suggestion: newSuggestion };
  }

  return { ok: false, error: 'Setlist must contain at least one song.' };
}

export async function reviewTeamSetlistSuggestion(
  groupId: string,
  suggestionId: string,
  action: 'approve' | 'decline',
  reviewNote?: string
): Promise<{ ok: boolean; group?: WorshipGroup; error?: string }> {
  const token = getSessionToken();
  const db = getFirebaseFirestore();
  const current = getCachedTeam();

  const existingSuggestions = Array.isArray(current?.suggestedSetlists)
    ? [...current.suggestedSetlists]
    : [];
  const targetIdx = existingSuggestions.findIndex((s) => s.id === suggestionId);
  const targetSuggestion = targetIdx !== -1 ? existingSuggestions[targetIdx] : null;

  try {
    const res = await fetch(
      apiUrl(`/api/groups/${groupId}/suggestions/${encodeURIComponent(suggestionId)}`),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          reviewNote,
          clientGroup: current,
          suggestion: targetSuggestion,
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        setCachedTeam(data.group);
        broadcastTeamSync(data.group);
        await syncSuggestionsToFirestore(db, groupId, data.group, action);
        return { ok: true, group: data.group };
      }
    }
  } catch (err) {
    console.warn('Server review suggestion note:', err);
  }

  // Resilient Local & Firestore Fallback (never leave the leader stuck or show "team not found")
  if (targetSuggestion) {
    const now = new Date().toISOString();
    const updatedSuggestion: TeamSetlistSuggestion = {
      ...targetSuggestion,
      status: action === 'approve' ? 'approved' : 'declined',
      reviewedAt: now,
      ...(reviewNote ? { reviewNote: reviewNote.trim() } : {}),
    };
    existingSuggestions[targetIdx] = updatedSuggestion;

    const fallbackGroup: WorshipGroup = {
      ...(current || {
        id: groupId,
        name: 'Worship Team',
        inviteCode: '',
        ownerId: '',
        createdAt: now,
        members: [],
      }),
      suggestedSetlists: existingSuggestions,
      ...(action === 'approve'
        ? {
            activeSetlist: {
              id: targetSuggestion.setlist.id,
              name: targetSuggestion.setlist.name,
              ...(targetSuggestion.setlist.description ? { description: targetSuggestion.setlist.description } : {}),
              publishedAt: now,
              publishedBy: targetSuggestion.suggestedBy,
              publishedByName: targetSuggestion.suggestedByName,
              items: targetSuggestion.setlist.items || [],
            },
          }
        : {}),
    };

    setCachedTeam(fallbackGroup);
    broadcastTeamSync(fallbackGroup);
    await syncSuggestionsToFirestore(db, groupId, fallbackGroup, action);
    return { ok: true, group: fallbackGroup };
  }

  return { ok: false, error: 'Suggestion not found.' };
}

export async function deleteTeamSetlistSuggestion(
  groupId: string,
  suggestionId: string
): Promise<{ ok: boolean; group?: WorshipGroup; error?: string }> {
  // Immediately record tombstone so background polling and caches drop it at once
  recordDismissedSuggestionId(suggestionId);

  const token = getSessionToken();
  const db = getFirebaseFirestore();
  const current = getCachedTeam();

  try {
    const res = await fetch(
      apiUrl(`/api/groups/${groupId}/suggestions/${encodeURIComponent(suggestionId)}`),
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          clientGroup: current,
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        setCachedTeam(data.group);
        broadcastTeamSync(data.group);
        await syncSuggestionsToFirestore(db, groupId, data.group);
        return { ok: true, group: data.group };
      }
    }
  } catch (err) {
    console.warn('Server delete suggestion note:', err);
  }

  // Resilient Local & Firestore Fallback
  if (current && Array.isArray(current.suggestedSetlists)) {
    const updatedSuggestions = current.suggestedSetlists.filter((s) => s.id !== suggestionId);
    const fallbackGroup: WorshipGroup = {
      ...current,
      suggestedSetlists: updatedSuggestions,
    };
    setCachedTeam(fallbackGroup);
    broadcastTeamSync(fallbackGroup);
    await syncSuggestionsToFirestore(db, groupId, fallbackGroup);
    return { ok: true, group: fallbackGroup };
  }

  return { ok: true };
}

export async function setTeamActiveLiveSession(
  groupId: string,
  sessionInfo: {
    sessionId: string;
    joinCode: string;
    expiresAt: string;
    leaderName: string;
  }
): Promise<void> {
  const db = getFirebaseFirestore();
  const token = getSessionToken();
  const current = getCachedTeam();

  const updatedGroup: WorshipGroup = {
    ...(current || {
      id: groupId,
      name: 'Worship Team',
      inviteCode: '',
      ownerId: '',
      createdAt: new Date().toISOString(),
      members: [],
    }),
    activeLiveSessionId: sessionInfo.sessionId,
    activeLiveSessionJoinCode: sessionInfo.joinCode,
    activeLiveSessionExpiresAt: sessionInfo.expiresAt,
    activeLiveSessionLeaderName: sessionInfo.leaderName,
    activeSetlist: current?.activeSetlist,
    suggestedSetlists: current?.suggestedSetlists,
  };

  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  try {
    const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        activeLiveSessionId: sessionInfo.sessionId,
        activeLiveSessionJoinCode: sessionInfo.joinCode,
        activeLiveSessionExpiresAt: sessionInfo.expiresAt,
        activeLiveSessionLeaderName: sessionInfo.leaderName,
        activeSetlist: current?.activeSetlist,
        suggestedSetlists: current?.suggestedSetlists,
        groupName: current?.name,
        inviteCode: current?.inviteCode,
        members: current?.members,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        const mergedGroup = {
          ...data.group,
          activeSetlist: data.group.activeSetlist || current?.activeSetlist,
          suggestedSetlists: mergeSuggestedSetlists(
            data.group.suggestedSetlists,
            current?.suggestedSetlists
          ),
        };
        setCachedTeam(mergedGroup);
        broadcastTeamSync(mergedGroup);
      }
    }
  } catch (err) {
    console.warn('Server set live session note:', err);
  }

  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      const metaTake: TeamPracticeTake = {
        id: LIVE_SESSION_META_TAKE_ID,
        songId: '__system_meta__',
        songTitle: 'Active Live Session',
        title: sessionInfo.joinCode,
        authorName: sessionInfo.leaderName,
        authorId: 'leader',
        createdAt: new Date().toISOString(),
        durationSeconds: 0,
        notes: JSON.stringify(sessionInfo),
      };

      // Ensure SETLIST_META_TAKE_ID is preserved
      let cleanSetlistMeta = (current?.practiceTakes || []).find(
        (t) => t.id === SETLIST_META_TAKE_ID
      );
      if (!cleanSetlistMeta && current?.activeSetlist) {
        cleanSetlistMeta = {
          id: SETLIST_META_TAKE_ID,
          songId: '__system_meta__',
          songTitle: 'Upcoming Setlist Lineup',
          title: current.activeSetlist.name,
          authorName: current.activeSetlist.publishedByName || 'Leader',
          authorId: current.activeSetlist.publishedBy,
          createdAt: current.activeSetlist.publishedAt,
          durationSeconds: 0,
          notes: JSON.stringify(current.activeSetlist),
        };
      }

      // Ensure suggestions meta-take is preserved with latest current suggestions
      let cleanSuggestionsMeta = (current?.practiceTakes || []).find(
        (t) => t.id === SETLIST_SUGGESTIONS_META_TAKE_ID
      );
      if (Array.isArray(current?.suggestedSetlists) && current.suggestedSetlists.length > 0) {
        cleanSuggestionsMeta = {
          id: SETLIST_SUGGESTIONS_META_TAKE_ID,
          songId: '__system_meta__',
          songTitle: 'Lineup Suggestions',
          title: `${current.suggestedSetlists.length} Lineup Proposals`,
          authorName: 'System',
          authorId: 'system',
          createdAt: new Date().toISOString(),
          durationSeconds: 0,
          notes: JSON.stringify(current.suggestedSetlists),
        };
      }

      const existingTakes = (current?.practiceTakes || []).filter(
        (t) =>
          t.id !== LIVE_SESSION_META_TAKE_ID &&
          t.id !== SETLIST_META_TAKE_ID &&
          t.id !== SETLIST_SUGGESTIONS_META_TAKE_ID
      );
      const combinedTakes = [
        metaTake,
        ...(cleanSetlistMeta ? [cleanSetlistMeta] : []),
        ...(cleanSuggestionsMeta ? [cleanSuggestionsMeta] : []),
        ...existingTakes,
      ].slice(0, 50);

      const cleanActiveSetlist = sanitizeActiveSetlistForFirestore(current?.activeSetlist);

      const firestorePayload: any = {
        activeLiveSessionId: sessionInfo.sessionId,
        activeLiveSessionJoinCode: sessionInfo.joinCode,
        activeLiveSessionExpiresAt: sessionInfo.expiresAt,
        activeLiveSessionLeaderName: sessionInfo.leaderName,
        practiceTakes: combinedTakes,
      };
      if (cleanActiveSetlist) {
        firestorePayload.activeSetlist = cleanActiveSetlist;
      }
      if (Array.isArray(current?.suggestedSetlists) && current.suggestedSetlists.length > 0) {
        firestorePayload.suggestedSetlists = current.suggestedSetlists;
      }

      try {
        await setDoc(groupRef, firestorePayload, { merge: true });
      } catch (err) {
        console.warn('Firestore set live session primary write note:', err);
        try {
          // Resilient fallback: write ONLY the live session attributes to guarantee live sync is never blocked
          await updateDoc(groupRef, {
            activeLiveSessionId: sessionInfo.sessionId,
            activeLiveSessionJoinCode: sessionInfo.joinCode,
            activeLiveSessionExpiresAt: sessionInfo.expiresAt,
            activeLiveSessionLeaderName: sessionInfo.leaderName,
          });
        } catch (fallbackErr) {
          console.warn('Firestore set live session fallback note:', fallbackErr);
        }
      }
    } catch (outerErr) {
      console.warn('Firestore set live session outer note:', outerErr);
    }
  }
}

export async function clearTeamActiveLiveSession(groupId: string): Promise<void> {
  const db = getFirebaseFirestore();
  const token = getSessionToken();
  const current = getCachedTeam();

  const updatedGroup: WorshipGroup = {
    ...(current || {
      id: groupId,
      name: 'Worship Team',
      inviteCode: '',
      ownerId: '',
      createdAt: new Date().toISOString(),
      members: [],
    }),
    activeLiveSessionId: undefined,
    activeLiveSessionJoinCode: undefined,
    activeLiveSessionExpiresAt: undefined,
    activeLiveSessionLeaderName: undefined,
    activeSetlist: current?.activeSetlist,
    suggestedSetlists: current?.suggestedSetlists,
  };

  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  try {
    const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        activeLiveSessionId: null,
        activeLiveSessionJoinCode: null,
        activeLiveSessionExpiresAt: null,
        activeLiveSessionLeaderName: null,
        activeSetlist: current?.activeSetlist,
        suggestedSetlists: current?.suggestedSetlists,
        groupName: current?.name,
        inviteCode: current?.inviteCode,
        members: current?.members,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        const mergedGroup = {
          ...data.group,
          activeSetlist: data.group.activeSetlist || current?.activeSetlist,
          suggestedSetlists: mergeSuggestedSetlists(
            data.group.suggestedSetlists,
            current?.suggestedSetlists
          ),
        };
        setCachedTeam(mergedGroup);
        broadcastTeamSync(mergedGroup);
      }
    }
  } catch {}

  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);

      let cleanSuggestionsMeta = (current?.practiceTakes || []).find(
        (t) => t.id === SETLIST_SUGGESTIONS_META_TAKE_ID
      );
      if (Array.isArray(current?.suggestedSetlists) && current.suggestedSetlists.length > 0) {
        cleanSuggestionsMeta = {
          id: SETLIST_SUGGESTIONS_META_TAKE_ID,
          songId: '__system_meta__',
          songTitle: 'Lineup Suggestions',
          title: `${current.suggestedSetlists.length} Lineup Proposals`,
          authorName: 'System',
          authorId: 'system',
          createdAt: new Date().toISOString(),
          durationSeconds: 0,
          notes: JSON.stringify(current.suggestedSetlists),
        };
      }

      const cleanTakes = (current?.practiceTakes || []).filter(
        (t) =>
          t.id !== LIVE_SESSION_META_TAKE_ID &&
          t.id !== SETLIST_SUGGESTIONS_META_TAKE_ID
      );
      if (cleanSuggestionsMeta) {
        cleanTakes.unshift(cleanSuggestionsMeta);
      }

      const cleanActiveSetlist = sanitizeActiveSetlistForFirestore(current?.activeSetlist);

      const firestorePayload: any = {
        activeLiveSessionId: null,
        activeLiveSessionJoinCode: null,
        activeLiveSessionExpiresAt: null,
        activeLiveSessionLeaderName: null,
        practiceTakes: cleanTakes,
      };
      if (cleanActiveSetlist) {
        firestorePayload.activeSetlist = cleanActiveSetlist;
      }
      if (Array.isArray(current?.suggestedSetlists) && current.suggestedSetlists.length > 0) {
        firestorePayload.suggestedSetlists = current.suggestedSetlists;
      }
      try {
        await updateDoc(groupRef, firestorePayload);
      } catch (err) {
        console.warn('Firestore clear live session primary write note:', err);
        try {
          // Resilient fallback: clear the live session attributes specifically
          await updateDoc(groupRef, {
            activeLiveSessionId: null,
            activeLiveSessionJoinCode: null,
            activeLiveSessionExpiresAt: null,
            activeLiveSessionLeaderName: null,
            practiceTakes: cleanTakes,
          });
        } catch (fallbackErr) {
          console.warn('Firestore clear live session fallback note:', fallbackErr);
        }
      }
    } catch (outerErr) {
      console.warn('Firestore clear live session outer note:', outerErr);
    }
  }
}

/**
 * Subscribes to real-time updates for a team document across server, Firestore, and tabs
 */
export function subscribeToTeam(
  groupId: string,
  onUpdate: (group: WorshipGroup | null) => void
): Unsubscribe {
  let isDisposed = false;
  let lastKnownSerialized = '';

  const applyUpdate = (
    fresh: WorshipGroup | null,
    source: 'cache' | 'server' | 'firestore' | 'broadcast' = 'broadcast'
  ) => {
    if (isDisposed) return;
    if (!fresh) {
      onUpdate(null);
      return;
    }

    // ANTI-FLICKER: Ignore stale copies served by a different (older) server instance
    if (source === 'server' && isStaleServerGroupPayload(fresh)) {
      return;
    }

    const currentCached = getCachedTeam();
    const mergedGroup = reconcileTeamGroup(fresh, currentCached);

    // Key-order-independent comparison: only re-render when content truly changed
    const serialized = stableSerializeTeam(mergedGroup);
    if (serialized !== lastKnownSerialized) {
      lastKnownSerialized = serialized;
      setCachedTeam(mergedGroup);
      onUpdate(mergedGroup);
    }
  };

  // 1. Initial cached value
  const initialCached = getCachedTeam();
  if (initialCached && initialCached.id === groupId) {
    applyUpdate(initialCached, 'cache');
  }

  // 2. Fetch fresh state from authoritative server API immediately
  let isFetchInFlight = false;
  const fetchServerGroup = async () => {
    if (isDisposed || !groupId || isFetchInFlight) return;
    isFetchInFlight = true;
    try {
      const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.group) {
          applyUpdate(data.group, 'server');
        }
      }
    } catch {
    } finally {
      isFetchInFlight = false;
    }
  };
  fetchServerGroup();

  // 3. Fast polling loop (every 2.5s) to guarantee multi-device sync
  const pollInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchServerGroup();
    }
  }, 2500);

  // 4. Instant revalidation on focus & visibility
  const handleFocus = () => fetchServerGroup();
  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fetchServerGroup();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // 5. BroadcastChannel for sub-10ms cross-tab updates
  let broadcastChannel: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel(TEAM_SYNC_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'GROUP_UPDATED' && event.data?.group?.id === groupId) {
          applyUpdate(event.data.group);
        }
      };
    } catch {}
  }

  // 6. Custom Event & Storage listener for same-device cross-tab sync
  const handleCustomSync = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && detail.id === groupId) {
      applyUpdate(detail);
    }
  };
  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'worshipy_cached_team' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed.id === groupId) {
          applyUpdate(parsed);
        }
      } catch {}
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('wmc_team_sync', handleCustomSync);
    window.addEventListener('storage', handleStorage);
  }

  // 7. Cloud Firestore onSnapshot with practiceTakes meta-take extraction
  let unsubFirestore = () => {};
  const db = getFirebaseFirestore();
  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      unsubFirestore = onSnapshot(
        groupRef,
        (snap) => {
          if (!snap.exists()) {
            return;
          }
          const firestoreData = snap.data();
          const cached = getCachedTeam();

          let activeSetlist = firestoreData.activeSetlist;
          let suggestedSetlists = firestoreData.suggestedSetlists;
          let activeLiveSessionId = firestoreData.activeLiveSessionId;
          let activeLiveSessionJoinCode = firestoreData.activeLiveSessionJoinCode;
          let activeLiveSessionExpiresAt = firestoreData.activeLiveSessionExpiresAt;
          let activeLiveSessionLeaderName = firestoreData.activeLiveSessionLeaderName;

          // Meta-take fallback: only parse if activeSetlist is undefined (not explicitly null or set)
          if (firestoreData.activeSetlist === undefined && Array.isArray(firestoreData.practiceTakes)) {
            const setlistMeta = firestoreData.practiceTakes.find(
              (t: any) => t.id === SETLIST_META_TAKE_ID
            );
            if (setlistMeta?.notes) {
              try {
                activeSetlist = JSON.parse(setlistMeta.notes);
              } catch {}
            }
          }

          if (Array.isArray(firestoreData.practiceTakes)) {
            // Meta-take fallback: only parse if suggestedSetlists is undefined in Firestore doc
            if (firestoreData.suggestedSetlists === undefined) {
              const suggestionsMeta = firestoreData.practiceTakes.find(
                (t: any) => t.id === SETLIST_SUGGESTIONS_META_TAKE_ID
              );
              if (suggestionsMeta?.notes) {
                try {
                  const parsedSuggestions = JSON.parse(suggestionsMeta.notes);
                  if (Array.isArray(parsedSuggestions)) {
                    suggestedSetlists = parsedSuggestions;
                  }
                } catch {}
              }
            }

            const liveMeta = firestoreData.practiceTakes.find(
              (t: any) => t.id === LIVE_SESSION_META_TAKE_ID
            );
            if (liveMeta?.notes && !activeLiveSessionId) {
              try {
                const parsedLive = JSON.parse(liveMeta.notes);
                activeLiveSessionId = parsedLive.sessionId;
                activeLiveSessionJoinCode = parsedLive.joinCode;
                activeLiveSessionExpiresAt = parsedLive.expiresAt;
                activeLiveSessionLeaderName = parsedLive.leaderName;
              } catch {}
            }
          }

          const group: WorshipGroup = {
            id: snap.id,
            ...firestoreData,
            // Keep `undefined` when the Firestore doc simply lacks the field (e.g. a mirror write was
            // rejected) so we never treat "missing" as an explicit clear. An explicit clear is
            // written as `null` and is still honored.
            activeSetlist: activeSetlist !== undefined ? activeSetlist : undefined,
            suggestedSetlists: suggestedSetlists || undefined,
            activeLiveSessionId: activeLiveSessionId || undefined,
            activeLiveSessionJoinCode: activeLiveSessionJoinCode || undefined,
            activeLiveSessionExpiresAt: activeLiveSessionExpiresAt || undefined,
            activeLiveSessionLeaderName: activeLiveSessionLeaderName || undefined,
            customAppTitle:
              firestoreData.customAppTitle !== undefined
                ? (firestoreData.customAppTitle || undefined)
                : cached?.customAppTitle,
            customAppLogoUrl:
              firestoreData.customAppLogoUrl !== undefined
                ? (firestoreData.customAppLogoUrl || undefined)
                : cached?.customAppLogoUrl,
            churchName:
              firestoreData.churchName !== undefined
                ? (firestoreData.churchName || undefined)
                : cached?.churchName,
          } as WorshipGroup;

          applyUpdate(group, 'firestore');
        },
        (err) => {
          console.warn('Team snapshot listener note:', err);
        }
      );
    } catch {}
  }

  return () => {
    isDisposed = true;
    clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('wmc_team_sync', handleCustomSync);
      window.removeEventListener('storage', handleStorage);
    }
    if (broadcastChannel) {
      try {
        broadcastChannel.close();
      } catch {}
    }
    unsubFirestore();
  };
}

/**
 * Real-time Team Member Presence Tracking
 */
export function subscribeToTeamPresence(
  groupId: string,
  onUpdate: (presence: Record<string, TeamPresenceRecord>) => void
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db || !groupId) {
    return () => {};
  }

  let lastPresenceSignature = '';
  const presenceCol = collection(db, 'groups', groupId, 'presence');
  return onSnapshot(
    presenceCol,
    (snapshot) => {
      const result: Record<string, TeamPresenceRecord> = {};
      const signatureMap: Record<string, unknown> = {};
      const now = Date.now();

      snapshot.docs.forEach((d) => {
        const data = d.data() as TeamPresenceRecord;
        const lastSeenMs = new Date(data.lastSeen).getTime();
        const isActuallyOnline = Boolean(data.online && now - lastSeenMs < ONLINE_THRESHOLD_MS);

        result[d.id] = {
          ...data,
          online: isActuallyOnline,
        };
        // Ignore `lastSeen` timestamp jitter in signature so 20s heartbeats don't cause re-renders
        signatureMap[d.id] = {
          userId: data.userId || d.id,
          displayName: data.displayName || '',
          instrument: data.instrument || '',
          photoURL: data.photoURL || '',
          online: isActuallyOnline,
          currentSong: data.currentSong || '',
        };
      });

      const nextSignature = stableSerializeTeam(signatureMap);
      if (nextSignature !== lastPresenceSignature) {
        lastPresenceSignature = nextSignature;
        onUpdate(result);
      }
    },
    (err) => {
      console.warn('Presence listener note:', err);
    }
  );
}

/**
 * Heartbeat function to announce the user is currently online in the team
 */
export async function sendTeamHeartbeat(
  groupId: string,
  user: UserProfile,
  currentSong?: string
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !groupId || !user?.id) return;

  const presenceDoc = doc(db, 'groups', groupId, 'presence', user.id);
  const now = new Date().toISOString();

  try {
    await setDoc(
      presenceDoc,
      {
        userId: user.id,
        displayName: user.displayName || user.email.split('@')[0],
        instrument: user.instrument || 'Musician',
        ...(user.photoURL ? { photoURL: user.photoURL } : {}),
        online: true,
        lastSeen: now,
        ...(currentSong ? { currentSong } : {}),
      },
      { merge: true }
    );
  } catch {}
}

/**
 * Shared Team Practice Takes
 */
export function subscribeToSharedPracticeTakes(
  groupId: string,
  onUpdate: (takes: TeamPracticeTake[]) => void
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db || !groupId) {
    return () => {};
  }

  let lastTakesSerialized = '';
  const takesCol = collection(db, 'groups', groupId, 'practiceTakes');
  const q = query(takesCol, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const takes: TeamPracticeTake[] = [];
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (d.id.startsWith('__wmc_') || data?.songId === '__system_meta__') {
          return;
        }
        takes.push({ id: d.id, ...data } as TeamPracticeTake);
      });
      const nextSerialized = stableSerializeTeam(takes);
      if (nextSerialized !== lastTakesSerialized) {
        lastTakesSerialized = nextSerialized;
        onUpdate(takes);
      }
    },
    (err) => {
      console.warn('Practice takes listener note:', err);
    }
  );
}

export async function sharePracticeTakeToTeam(
  groupId: string,
  take: TeamPracticeTake
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !groupId) throw new Error('Firestore database is not available.');

  // Clean undefined properties so Firestore never throws unsupported field value error
  const cleanTake: Record<string, unknown> = {
    id: take.id,
    groupId,
    songId: take.songId,
    songTitle: take.songTitle,
    title: take.title,
    authorName: take.authorName,
    authorId: take.authorId,
    createdAt: take.createdAt,
    durationSeconds: Math.max(0, Math.round(take.durationSeconds || 180)),
  };

  if (take.audioUrl && take.audioUrl.trim()) cleanTake.audioUrl = take.audioUrl.trim();
  if (take.notes && take.notes.trim()) cleanTake.notes = take.notes.trim();
  if (take.instrumentTag && take.instrumentTag.trim()) cleanTake.instrumentTag = take.instrumentTag.trim();
  if (take.isLeaderTake !== undefined) cleanTake.isLeaderTake = Boolean(take.isLeaderTake);

  const takeRef = doc(db, 'groups', groupId, 'practiceTakes', take.id);
  await setDoc(takeRef, cleanTake);
}

export async function deleteSharedPracticeTake(
  groupId: string,
  takeId: string
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !groupId) return;

  const takeRef = doc(db, 'groups', groupId, 'practiceTakes', takeId);
  await deleteDoc(takeRef);
}

/**
 * Automatically restores a user's team from Firestore if local cache is absent or out of sync
 */
export async function findUserTeamInFirestore(
  userId: string,
  userEmail?: string
): Promise<WorshipGroup | null> {
  const db = getFirebaseFirestore();
  if (!db || (!userId && !userEmail)) return null;

  try {
    // 1. Check if user is in any team's memberIds array
    if (userId) {
      const q1 = query(
        collection(db, 'groups'),
        where('memberIds', 'array-contains', userId),
        limit(1)
      );
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        const docSnap = snap1.docs[0];
        const group = { id: docSnap.id, ...docSnap.data() } as WorshipGroup;
        setCachedTeam(group);
        return group;
      }

      // 2. Fallback: check if user is the owner of a team
      const q2 = query(
        collection(db, 'groups'),
        where('ownerId', '==', userId),
        limit(1)
      );
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        const docSnap = snap2.docs[0];
        const group = { id: docSnap.id, ...docSnap.data() } as WorshipGroup;
        setCachedTeam(group);
        return group;
      }
    }

    // 3. Fallback: scan recent groups in Firestore checking members array for email or owner
    const q3 = query(collection(db, 'groups'), limit(50));
    const snap3 = await getDocs(q3);
    const normalizedEmail = userEmail?.toLowerCase().trim();

    for (const docSnap of snap3.docs) {
      const data = docSnap.data();
      const isOwner = Boolean(userId && data.ownerId === userId);
      const isMember =
        Array.isArray(data.members) &&
        data.members.some(
          (m: any) =>
            (userId && m.userId === userId) ||
            (normalizedEmail && m.email && m.email.toLowerCase() === normalizedEmail)
        );

      if (isOwner || isMember) {
        const group = { id: docSnap.id, ...data } as WorshipGroup;
        setCachedTeam(group);
        return group;
      }
    }
  } catch (err) {
    console.warn('Firestore user team lookup note:', err);
  }

  return null;
}

/**
 * Proposes a customized instrument or band song arrangement to the Worship Leader for approval.
 */
export async function proposeTeamSongArrangement(
  groupId: string,
  input: {
    songId: string;
    songTitle: string;
    instrument: ArrangementInstrumentScope;
    chordPro: string;
    arrangementNote?: string;
  }
): Promise<{
  group: WorshipGroup;
  suggestion: TeamArrangementSuggestion;
}> {
  const token = getSessionToken();
  const cached = getCachedTeam();
  const db = getFirebaseFirestore();

  const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: 'propose-arrangement',
      ...input,
      clientGroupFallback: cached?.id === groupId ? cached : undefined,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.group) {
    throw new Error(data?.error || 'Failed to propose song arrangement to leader.');
  }

  const updatedGroup: WorshipGroup = data.group;
  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        suggestedArrangements: updatedGroup.suggestedArrangements || [],
      });
    } catch {
      // Ignore Firestore mirror error if offline
    }
  }

  return {
    group: updatedGroup,
    suggestion: data.suggestion,
  };
}

/**
 * Leader approval or decline of a member's proposed song arrangement.
 */
export async function reviewTeamSongArrangement(
  groupId: string,
  suggestionId: string,
  decision: 'approve' | 'decline',
  options?: {
    targetScope?: ArrangementInstrumentScope;
    reviewNote?: string;
    fallbackSuggestion?: TeamArrangementSuggestion;
  }
): Promise<{
  group: WorshipGroup;
  approvedArrangement?: TeamSongArrangement;
  suggestion?: TeamArrangementSuggestion;
}> {
  const token = getSessionToken();
  const cached = getCachedTeam();
  const db = getFirebaseFirestore();

  const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: 'review-arrangement',
      suggestionId,
      decision,
      targetScope: options?.targetScope,
      reviewNote: options?.reviewNote,
      fallbackSuggestion: options?.fallbackSuggestion,
      clientGroupFallback: cached?.id === groupId ? cached : undefined,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.group) {
    throw new Error(data?.error || 'Failed to review arrangement proposal.');
  }

  const updatedGroup: WorshipGroup = data.group;
  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        songArrangements: updatedGroup.songArrangements || {},
        suggestedArrangements: updatedGroup.suggestedArrangements || [],
      });
    } catch {
      // Ignore Firestore mirror error if offline
    }
  }

  return {
    group: updatedGroup,
    approvedArrangement: data.approvedArrangement,
    suggestion: data.suggestion,
  };
}

/**
 * Dismisses / closes a member's arrangement proposal (e.g., after it has been declined or approved by the Leader, or withdrawn).
 */
export async function dismissTeamSongArrangement(
  groupId: string,
  suggestionId: string
): Promise<{ ok: boolean; group?: WorshipGroup; error?: string }> {
  recordDismissedSuggestionId(suggestionId);

  const token = getSessionToken();
  const current = getCachedTeam();
  const db = getFirebaseFirestore();

  try {
    const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action: 'dismiss-arrangement',
        suggestionId,
        clientGroupFallback: current?.id === groupId ? current : undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.group) {
        const updatedGroup: WorshipGroup = {
          ...data.group,
          suggestedArrangements: Array.isArray(data.group.suggestedArrangements)
            ? data.group.suggestedArrangements.filter(
                (a: TeamArrangementSuggestion) => a.id !== suggestionId
              )
            : [],
        };
        setCachedTeam(updatedGroup);
        broadcastTeamSync(updatedGroup);
        if (db && groupId) {
          try {
            const groupRef = doc(db, 'groups', groupId);
            await updateDoc(groupRef, {
              suggestedArrangements: updatedGroup.suggestedArrangements || [],
            });
          } catch {}
        }
        return { ok: true, group: updatedGroup };
      }
    }
  } catch (err) {
    console.warn('Server dismiss arrangement proposal note:', err);
  }

  // Resilient Local & Firestore Fallback
  if (current && Array.isArray(current.suggestedArrangements)) {
    const updatedArrangements = current.suggestedArrangements.filter(
      (a) => a.id !== suggestionId
    );
    const fallbackGroup: WorshipGroup = {
      ...current,
      suggestedArrangements: updatedArrangements,
    };
    setCachedTeam(fallbackGroup);
    broadcastTeamSync(fallbackGroup);
    if (db && groupId) {
      try {
        const groupRef = doc(db, 'groups', groupId);
        await updateDoc(groupRef, {
          suggestedArrangements: updatedArrangements,
        });
      } catch {}
    }
    return { ok: true, group: fallbackGroup };
  }

  return { ok: true };
}

/**
 * Directly saves a Worship Leader's arrangement to the Church Group (`group.songArrangements`).
 */
export async function saveTeamSongArrangementDirect(
  groupId: string,
  input: {
    songId: string;
    songTitle?: string;
    instrument: ArrangementInstrumentScope;
    chordPro: string;
    arrangementNote?: string;
  }
): Promise<{
  group: WorshipGroup;
  arrangement: TeamSongArrangement;
}> {
  const token = getSessionToken();
  const cached = getCachedTeam();
  const db = getFirebaseFirestore();

  const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: 'save-group-arrangement',
      ...input,
      clientGroupFallback: cached?.id === groupId ? cached : undefined,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.group) {
    throw new Error(data?.error || 'Failed to save church song arrangement.');
  }

  const updatedGroup: WorshipGroup = data.group;
  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        songArrangements: updatedGroup.songArrangements || {},
      });
    } catch {
      // Ignore Firestore mirror error if offline
    }
  }

  return {
    group: updatedGroup,
    arrangement: data.arrangement,
  };
}

/**
 * Resets / removes a Church Group song arrangement back to the original catalog chart.
 */
export async function removeTeamSongArrangementDirect(
  groupId: string,
  input: {
    songId: string;
    instrument: ArrangementInstrumentScope;
  }
): Promise<{
  group: WorshipGroup;
}> {
  const token = getSessionToken();
  const cached = getCachedTeam();
  const db = getFirebaseFirestore();

  const res = await fetch(apiUrl(`/api/groups/${groupId}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: 'remove-group-arrangement',
      ...input,
      clientGroupFallback: cached?.id === groupId ? cached : undefined,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.group) {
    throw new Error(data?.error || 'Failed to reset church song arrangement.');
  }

  const updatedGroup: WorshipGroup = data.group;
  setCachedTeam(updatedGroup);
  broadcastTeamSync(updatedGroup);

  if (db && groupId) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        songArrangements: updatedGroup.songArrangements || {},
      });
    } catch {
      // Ignore Firestore mirror error if offline
    }
  }

  return {
    group: updatedGroup,
  };
}
