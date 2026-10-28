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
import { getFirebaseFirestore } from '@/lib/firebase/firebaseClient';
import type {
  GroupMember,
  TeamPracticeTake,
  TeamPresenceRecord,
  UserProfile,
  WorshipGroup,
} from '@/types/auth';

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
    const res = await fetch('/api/groups/create', {
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
    const res = await fetch('/api/groups/join', {
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
    const res = await fetch('/api/groups/leave', {
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

  // 1. Sync to server API
  const res = await fetch(`/api/groups/${groupId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(updates),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update church branding');
  }

  const updatedGroup: WorshipGroup = data.group;

  // 2. Sync to Firestore for real-time distribution across all band members
  if (db && updatedGroup) {
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
    } catch (firestoreErr) {
      console.warn('Firestore branding update note:', firestoreErr);
    }
  }

  setCachedTeam(updatedGroup);
  return updatedGroup;
}

/**
 * Subscribes to real-time updates for a team document
 */
export function subscribeToTeam(
  groupId: string,
  onUpdate: (group: WorshipGroup | null) => void
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db || !groupId) {
    // If Firestore is not ready, return cached or fetch via API once
    const cached = getCachedTeam();
    if (cached && cached.id === groupId) {
      onUpdate(cached);
    }
    return () => {};
  }

  const groupRef = doc(db, 'groups', groupId);
  return onSnapshot(
    groupRef,
    (snap) => {
      if (snap.exists()) {
        const group = { id: snap.id, ...snap.data() } as WorshipGroup;
        setCachedTeam(group);
        onUpdate(group);
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.warn('Team snapshot listener note:', err);
      // Fallback to cache on error
      const cached = getCachedTeam();
      if (cached) onUpdate(cached);
    }
  );
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

  const presenceCol = collection(db, 'groups', groupId, 'presence');
  return onSnapshot(
    presenceCol,
    (snapshot) => {
      const result: Record<string, TeamPresenceRecord> = {};
      const now = Date.now();

      snapshot.docs.forEach((d) => {
        const data = d.data() as TeamPresenceRecord;
        const lastSeenMs = new Date(data.lastSeen).getTime();
        const isActuallyOnline = Boolean(data.online && now - lastSeenMs < ONLINE_THRESHOLD_MS);

        result[d.id] = {
          ...data,
          online: isActuallyOnline,
        };
      });

      onUpdate(result);
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
        photoURL: user.photoURL || undefined,
        online: true,
        lastSeen: now,
        currentSong: currentSong || undefined,
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

  const takesCol = collection(db, 'groups', groupId, 'practiceTakes');
  const q = query(takesCol, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const takes: TeamPracticeTake[] = [];
      snapshot.docs.forEach((d) => {
        takes.push({ id: d.id, ...d.data() } as TeamPracticeTake);
      });
      onUpdate(takes);
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

  const takeRef = doc(db, 'groups', groupId, 'practiceTakes', take.id);
  await setDoc(takeRef, take);
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
export async function findUserTeamInFirestore(userId: string): Promise<WorshipGroup | null> {
  const db = getFirebaseFirestore();
  if (!db || !userId) return null;

  try {
    // 1. Check if user is in any team's memberIds array
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
  } catch (err) {
    console.warn('Firestore user team lookup note:', err);
  }

  return null;
}
