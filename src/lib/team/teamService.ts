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
 * Creates a new Worship Group in Firestore with fallback to Local API
 */
export async function createTeam(
  user: UserProfile,
  name: string,
  churchName?: string
): Promise<WorshipGroup> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Please enter a team name.');

  const db = getFirebaseFirestore();
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

  const newGroup: WorshipGroup = {
    id: groupId,
    name: trimmedName,
    churchName: churchName?.trim() || user.churchName,
    inviteCode,
    ownerId: user.id,
    createdAt: now,
    members: [newMember],
  };

  if (db) {
    try {
      const groupRef = doc(db, 'groups', groupId);
      await setDoc(groupRef, {
        ...newGroup,
        memberIds: [user.id],
        serverCreatedAt: serverTimestamp(),
      });
    } catch (firestoreErr) {
      console.warn('Firestore write note, ensuring fallback:', firestoreErr);
    }
  }

  // Also sync with server endpoint to update stateless session token
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('worshipy_token') : null;
    const res = await fetch('/api/groups/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: trimmedName, churchName: newGroup.churchName }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('worshipy_token', data.token);
      }
    }
  } catch {}

  setCachedTeam(newGroup);
  return newGroup;
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
  let foundGroup: WorshipGroup | null = null;
  let targetDocId = '';

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

  // If not found in Firestore yet, try server API
  if (!foundGroup) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('worshipy_token') : null;
    const res = await fetch('/api/groups/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ inviteCode: normalizedCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Team not found with that invite code.');
    }
    if (data.token) {
      localStorage.setItem('worshipy_token', data.token);
    }
    foundGroup = data.group;
  } else if (db && targetDocId) {
    // Add user to Firestore group members
    const existingIndex = foundGroup.members.findIndex((m) => m.userId === user.id);
    if (existingIndex === -1) {
      const newMember: GroupMember = {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        role: 'member',
        instrument: user.instrument || 'Musician',
        photoURL: user.photoURL,
        joinedAt: new Date().toISOString(),
      };
      const updatedMembers = [...foundGroup.members, newMember];
      foundGroup.members = updatedMembers;

      try {
        await updateDoc(doc(db, 'groups', targetDocId), {
          members: updatedMembers,
          memberIds: updatedMembers.map((m) => m.userId),
        });
      } catch (err) {
        console.warn('Firestore member update note:', err);
      }
    }

    // Update server session token
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('worshipy_token') : null;
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ inviteCode: normalizedCode }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('worshipy_token', data.token);
        }
      }
    } catch {}
  }

  if (!foundGroup) {
    throw new Error('Unable to join team. Please check the code.');
  }

  setCachedTeam(foundGroup);
  return foundGroup;
}

/**
 * Leaves a team
 */
export async function leaveTeam(groupId: string, userId: string): Promise<void> {
  const db = getFirebaseFirestore();
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('worshipy_token') : null;
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
        localStorage.setItem('worshipy_token', data.token);
      }
    }
  } catch {}

  setCachedTeam(null);
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
