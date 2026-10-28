'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { SongRecord } from '@/types/song';
import type { PersonalSetlist } from '@/types/song';
import type {
  CloudStorageConfig,
  SongSubmission,
  TeamPresenceRecord,
  UserCloudSyncPayload,
  UserProfile,
  WorshipGroup,
} from '@/types/auth';
import { apiUrl } from '@/lib/api/apiClient';
import { promptGoogleSignInPopup } from '@/lib/firebase/firebaseClient';
import { promptGoogleAccountPicker } from '@/lib/auth/googleOAuth';
import {
  createTeam,
  findUserTeamInFirestore,
  getCachedTeam,
  joinTeamByInviteCode,
  leaveTeam,
  sendTeamHeartbeat,
  setCachedTeam,
  subscribeToTeam,
  subscribeToTeamPresence,
  updateTeamBranding,
  publishTeamSetlist,
  clearTeamSetlist,
} from '@/lib/team/teamService';

interface AuthContextValue {
  user: UserProfile | null;
  isAdmin: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  loginWithGoogle: (
    email: string,
    displayName?: string,
    photoURL?: string,
    emailVerified?: boolean
  ) => Promise<UserProfile>;
  loginWithInstantEmail: (
    email: string,
    displayName?: string,
    churchName?: string,
    instrument?: string
  ) => Promise<UserProfile>;
  signInWithGoogle: (fallbackEmail?: string, fallbackName?: string) => Promise<UserProfile>;
  register: (params: {
    email: string;
    password: string;
    displayName: string;
    churchName?: string;
    instrument?: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  updateProfile: (
    updates: Partial<Pick<UserProfile, 'displayName' | 'churchName' | 'instrument' | 'cloudStorage'>>
  ) => Promise<UserProfile>;
  connectCloudStorage: (config: CloudStorageConfig) => Promise<void>;
  // Group / Worship Team Collaboration
  activeGroup: WorshipGroup | null;
  teamPresence: Record<string, TeamPresenceRecord>;
  onlineMembersCount: number;
  broadcastSongActivity: (songTitle: string) => void;
  createGroup: (name: string, churchName?: string) => Promise<WorshipGroup>;
  joinGroup: (inviteCode: string) => Promise<WorshipGroup>;
  leaveGroup: () => Promise<void>;
  updateTeamBranding: (updates: {
    customAppTitle?: string;
    customAppLogoUrl?: string;
    churchName?: string;
  }) => Promise<WorshipGroup>;
  publishActiveSetlistToTeam: (setlist: PersonalSetlist) => Promise<WorshipGroup>;
  clearActiveTeamSetlist: () => Promise<WorshipGroup>;
  refreshActiveGroup: () => Promise<void>;
  submissions: SongSubmission[];
  pendingApprovalsCount: number;
  refreshSubmissions: () => Promise<void>;
  submitSongForGlobal: (song: SongRecord, notes?: string) => Promise<SongSubmission>;
  reviewSubmission: (
    submissionId: string,
    status: 'approved' | 'rejected' | 'removed',
    adminNotes?: string
  ) => Promise<SongSubmission>;
  removeSongGlobally: (songId: string, reason?: string) => Promise<void>;
  restoreSongGlobally: (songId: string) => Promise<void>;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
  syncWithCloud: (localPayload: {
    customSongs: SongRecord[];
    setlists: unknown[];
    favorites: string[];
  }) => Promise<{ downloadedSongs?: SongRecord[]; lastSyncedAt: string } | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'worshipy_auth_token_v1';
const USER_CACHE_KEY = 'worshipy_user_cache_v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem(USER_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SongSubmission[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Helper to fetch with token
  const authFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const resolvedInput = typeof input === 'string' ? apiUrl(input) : input;
    return fetch(resolvedInput, { ...init, headers });
  }, []);

  // Fetch submissions (user sees theirs, admin sees all)
  const refreshSubmissions = useCallback(async () => {
    try {
      const res = await authFetch('/api/cloud/submissions');
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.warn('Could not refresh submissions:', err);
    }
  }, [authFetch]);

  // Initial load: verify cached session
  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
          setIsAuthLoading(false);
          return;
        }

        const res = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.user) {
            // CRITICAL: Preserve existing groupId, groupName, and groupRole from local cache or current state
            const cachedGroup = getCachedTeam();
            const existingGroupId = data.user.groupId || user?.groupId || cachedGroup?.id;
            const existingGroupName = data.user.groupName || user?.groupName || cachedGroup?.name;
            const existingGroupRole =
              data.user.groupRole ||
              user?.groupRole ||
              (cachedGroup && cachedGroup.ownerId === data.user.id ? 'leader' : (cachedGroup ? 'member' : undefined));

            const fullUser: UserProfile = {
              ...data.user,
              groupId: existingGroupId,
              groupName: existingGroupName,
              groupRole: existingGroupRole,
            };

            setUser(fullUser);
            try {
              localStorage.setItem(USER_CACHE_KEY, JSON.stringify(fullUser));
            } catch {}

            if (cachedGroup) {
              setActiveGroup(cachedGroup);
            } else if (fullUser.id && !fullUser.groupId) {
              // Automatically check Firestore in background if not found locally
              findUserTeamInFirestore(fullUser.id)
                .then((foundTeam) => {
                  if (!cancelled && foundTeam) {
                    setActiveGroup(foundTeam);
                    const withTeam: UserProfile = {
                      ...fullUser,
                      groupId: foundTeam.id,
                      groupName: foundTeam.name,
                      groupRole: foundTeam.ownerId === fullUser.id ? 'leader' : 'member',
                    };
                    setUser(withTeam);
                    try {
                      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(withTeam));
                    } catch {}
                  }
                })
                .catch(() => {});
            }
          }
        } else {
          // If server responded with error (e.g. temporary serverless hiccup), preserve cached session
          const cached = localStorage.getItem(USER_CACHE_KEY);
          if (cached && !cancelled) {
            try {
              setUser(JSON.parse(cached));
            } catch {
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem(USER_CACHE_KEY);
            }
          }
        }
      } catch (err) {
        console.warn('Auth check fallback to cache:', err);
        const cached = localStorage.getItem(USER_CACHE_KEY);
        if (cached && !cancelled) {
          try {
            setUser(JSON.parse(cached));
          } catch {}
        }
      } finally {
        if (!cancelled) setIsAuthLoading(false);
      }
    };

    initAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh submissions whenever user changes
  useEffect(() => {
    let ignore = false;
    if (user) {
      authFetch('/api/cloud/submissions')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data?.submissions) {
            setSubmissions(data.submissions);
          }
        })
        .catch(() => {});
    }
    return () => {
      ignore = true;
    };
  }, [user, authFetch]);

  // Login
  const login = useCallback(
    async (email: string, password: string): Promise<UserProfile> => {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed.');
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.profile));
      setUser(data.profile);
      return data.profile;
    },
    []
  );

  // Register
  const register = useCallback(
    async (params: {
      email: string;
      password: string;
      displayName: string;
      churchName?: string;
      instrument?: string;
    }): Promise<UserProfile> => {
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.profile));
      setUser(data.profile);
      return data.profile;
    },
    []
  );

  // Logout
  const logout = useCallback(async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_CACHE_KEY);
    setUser(null);
    setSubmissions([]);
    setSyncStatus('idle');
  }, [authFetch]);

  // Update profile
  const updateProfile = useCallback(
    async (
      updates: Partial<Pick<UserProfile, 'displayName' | 'churchName' | 'instrument' | 'cloudStorage'>>
    ): Promise<UserProfile> => {
      const res = await authFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Profile update failed.');
      }

      setUser(data.profile);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.profile));
      return data.profile;
    },
    [authFetch]
  );

  // Connect Google Drive / cloud storage
  const connectCloudStorage = useCallback(
    async (config: CloudStorageConfig) => {
      await updateProfile({ cloudStorage: config });
    },
    [updateProfile]
  );

  // Google 1-Click Login or Register
  const loginWithGoogle = useCallback(
    async (
      email: string,
      displayName?: string,
      photoURL?: string,
      emailVerified?: boolean
    ): Promise<UserProfile> => {
      const res = await fetch(apiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName, photoURL, emailVerified }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google login failed.');
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    },
    []
  );

  // Instant Passwordless Email Login or Register (Zero credentials / Google setup needed)
  const loginWithInstantEmail = useCallback(
    async (
      email: string,
      displayName?: string,
      churchName?: string,
      instrument?: string
    ): Promise<UserProfile> => {
      const res = await fetch(apiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          displayName,
          churchName,
          instrument,
          emailVerified: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Instant email sign-in failed.');
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    },
    []
  );

  const signInWithGoogle = useCallback(
    async (fallbackEmail?: string, fallbackName?: string): Promise<UserProfile> => {
      try {
        if (fallbackEmail) {
          return await loginWithGoogle(fallbackEmail, fallbackName);
        }

        // 1. Try Google Identity Services (GIS) / Account Picker first (like Spotify)
        try {
          const googleUser = await promptGoogleAccountPicker();
          if (googleUser) {
            return await loginWithGoogle(
              googleUser.email,
              googleUser.displayName,
              googleUser.photoURL,
              googleUser.emailVerified
            );
          }
        } catch (pickerErr) {
          const pickerMsg = pickerErr instanceof Error ? pickerErr.message : '';
          if (pickerMsg === 'GOOGLE_CLIENT_ID_REQUIRED') {
            // Rethrow so AuthModal can prompt for Google Client ID setup
            throw pickerErr;
          }
          if (
            pickerMsg.toLowerCase().includes('popup_closed') ||
            pickerMsg.toLowerCase().includes('user_cancel') ||
            pickerMsg.toLowerCase().includes('closed')
          ) {
            throw pickerErr;
          }
          console.warn('Google Account Picker note:', pickerMsg);
        }

        // 2. Fall back to Firebase Google Auth popup if GIS is not configured or failed
        const fbUser = await promptGoogleSignInPopup();
        if (fbUser) {
          return await loginWithGoogle(fbUser.email, fbUser.displayName, fbUser.photoURL, true);
        }

        throw new Error('GOOGLE_AUTH_FAILED');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google authentication failed';
        throw new Error(msg);
      }
    },
    [loginWithGoogle]
  );

  // Group / Worship Team Collaboration
  const [activeGroup, setActiveGroup] = useState<WorshipGroup | null>(() => getCachedTeam());
  const [teamPresence, setTeamPresence] = useState<Record<string, TeamPresenceRecord>>({});

  const onlineMembersCount = useMemo(() => {
    return Object.values(teamPresence).filter((p) => p.online).length;
  }, [teamPresence]);

  const refreshActiveGroup = useCallback(async () => {
    const targetGroupId = user?.groupId || activeGroup?.id || getCachedTeam()?.id;
    if (!targetGroupId) return;

    try {
      const res = await authFetch(`/api/groups/${targetGroupId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.group) {
          setActiveGroup(data.group);
          setCachedTeam(data.group);
        }
      }
    } catch {
      // ignore
    }
  }, [user?.groupId, activeGroup?.id, authFetch]);

  // Derive authoritative team ID from state or localStorage
  const effectiveGroupId = user?.groupId || activeGroup?.id || getCachedTeam()?.id;

  // Real-time listener for group and member presence
  useEffect(() => {
    if (!effectiveGroupId) {
      setTeamPresence({});
      return;
    }

    // Keep user state in sync with effectiveGroupId if not set
    if (user && !user.groupId) {
      const cached = getCachedTeam();
      const isLeader = cached ? cached.ownerId === user.id : false;
      const syncedUser: UserProfile = {
        ...user,
        groupId: effectiveGroupId,
        groupName: cached?.name || user.groupName,
        groupRole: isLeader ? 'leader' : (user.groupRole || 'member'),
      };
      setUser(syncedUser);
      try {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(syncedUser));
      } catch {}
    }

    // 1. Subscribe to real-time group changes from Firestore
    const unsubGroup = subscribeToTeam(effectiveGroupId, (group) => {
      if (group) {
        setActiveGroup(group);
        setCachedTeam(group);
      }
    });

    // 2. Subscribe to real-time member presence
    const unsubPresence = subscribeToTeamPresence(effectiveGroupId, (presence) => {
      setTeamPresence(presence);
    });

    // 3. Send initial heartbeat
    if (user) {
      sendTeamHeartbeat(effectiveGroupId, user).catch(() => {});
    }

    // 4. Heartbeat loop while tab is open
    const interval = setInterval(() => {
      if (user && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        sendTeamHeartbeat(effectiveGroupId, user).catch(() => {});
      }
    }, 20000);

    return () => {
      unsubGroup();
      unsubPresence();
      clearInterval(interval);
    };
  }, [effectiveGroupId, user]);

  const broadcastSongActivity = useCallback(
    (songTitle: string) => {
      const targetId = user?.groupId || effectiveGroupId;
      if (targetId && user) {
        sendTeamHeartbeat(targetId, user, songTitle).catch(() => {});
      }
    },
    [user, effectiveGroupId]
  );

  const createGroup = useCallback(
    async (name: string, churchName?: string): Promise<WorshipGroup> => {
      if (!user) throw new Error('Please sign in to create a worship team.');
      const group = await createTeam(user, name, churchName);
      setActiveGroup(group);
      setCachedTeam(group);
      const updatedUser: UserProfile = {
        ...user,
        groupId: group.id,
        groupName: group.name,
        groupRole: 'leader',
      };
      setUser(updatedUser);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(updatedUser));
      return group;
    },
    [user]
  );

  const joinGroup = useCallback(
    async (inviteCode: string): Promise<WorshipGroup> => {
      if (!user) throw new Error('Please sign in to join a worship team.');
      const group = await joinTeamByInviteCode(user, inviteCode);
      setActiveGroup(group);
      setCachedTeam(group);
      const updatedUser: UserProfile = {
        ...user,
        groupId: group.id,
        groupName: group.name,
        groupRole: 'member',
      };
      setUser(updatedUser);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(updatedUser));
      return group;
    },
    [user]
  );

  const leaveGroup = useCallback(async (): Promise<void> => {
    if (!user) return;
    const currentGroupId = user.groupId || activeGroup?.id;
    if (currentGroupId) {
      await leaveTeam(currentGroupId, user.id);
    }
    setActiveGroup(null);
    setTeamPresence({});
    setCachedTeam(null);
    const updatedUser: UserProfile = {
      ...user,
      groupId: undefined,
      groupName: undefined,
      groupRole: undefined,
    };
    setUser(updatedUser);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(updatedUser));
  }, [user, activeGroup]);

  const handleUpdateTeamBranding = useCallback(
    async (updates: {
      customAppTitle?: string;
      customAppLogoUrl?: string;
      churchName?: string;
    }): Promise<WorshipGroup> => {
      const targetGroupId = activeGroup?.id || user?.groupId || getCachedTeam()?.id;
      if (!targetGroupId) {
        throw new Error('No active worship team found.');
      }
      const updated = await updateTeamBranding(targetGroupId, updates);
      setActiveGroup(updated);
      return updated;
    },
    [activeGroup?.id, user?.groupId]
  );

  // Publish Setlist Lineup to Team
  const handlePublishActiveSetlistToTeam = useCallback(
    async (setlist: PersonalSetlist): Promise<WorshipGroup> => {
      const targetGroupId = activeGroup?.id || user?.groupId || getCachedTeam()?.id;
      if (!targetGroupId) {
        throw new Error('No active worship team found.');
      }
      const activePayload = {
        id: setlist.id,
        name: setlist.name,
        ...(setlist.description ? { description: setlist.description } : {}),
        publishedAt: new Date().toISOString(),
        publishedBy: user?.id || 'leader',
        publishedByName: user?.displayName || user?.email?.split('@')[0] || 'Leader',
        items: setlist.items,
      };
      const updated = await publishTeamSetlist(targetGroupId, activePayload);
      setActiveGroup(updated);
      return updated;
    },
    [activeGroup?.id, user?.groupId, user?.id, user?.displayName, user?.email]
  );

  // Clear Active Team Setlist
  const handleClearActiveTeamSetlist = useCallback(async (): Promise<WorshipGroup> => {
    const targetGroupId = activeGroup?.id || user?.groupId || getCachedTeam()?.id;
    if (!targetGroupId) {
      throw new Error('No active worship team found.');
    }
    const updated = await clearTeamSetlist(targetGroupId);
    setActiveGroup(updated);
    return updated;
  }, [activeGroup?.id, user?.groupId]);

  // Submit song for Global Publishing
  const submitSongForGlobal = useCallback(
    async (song: SongRecord, notes?: string): Promise<SongSubmission> => {
      const res = await authFetch('/api/cloud/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song, submissionNotes: notes }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit song for publishing.');
      }

      await refreshSubmissions();
      return data.submission;
    },
    [authFetch, refreshSubmissions]
  );

  // Admin: Review submission (approve / reject / remove)
  const reviewSubmission = useCallback(
    async (
      submissionId: string,
      status: 'approved' | 'rejected' | 'removed',
      adminNotes?: string
    ): Promise<SongSubmission> => {
      const res = await authFetch(`/api/cloud/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNotes }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Review submission failed.');
      }

      await refreshSubmissions();
      return data.submission;
    },
    [authFetch, refreshSubmissions]
  );

  // Admin: Remove a song globally
  const removeSongGlobally = useCallback(
    async (songId: string, reason?: string) => {
      const res = await authFetch('/api/cloud/global-songs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, reason }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove song globally.');
      }

      await refreshSubmissions();
    },
    [authFetch, refreshSubmissions]
  );

  // Admin: Restore a song globally
  const restoreSongGlobally = useCallback(
    async (songId: string) => {
      const res = await authFetch('/api/cloud/global-songs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, action: 'restore' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore song globally.');
      }

      await refreshSubmissions();
    },
    [authFetch, refreshSubmissions]
  );

  // Cross-device sync
  const syncWithCloud = useCallback(
    async (localPayload: {
      customSongs: SongRecord[];
      setlists: unknown[];
      favorites: string[];
    }) => {
      if (!user) return null;
      setSyncStatus('syncing');

      try {
        // First, push local payload to cloud
        const pushRes = await authFetch('/api/cloud/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localPayload),
        });

        if (!pushRes.ok) {
          throw new Error('Failed to push sync data to cloud.');
        }

        // Second, retrieve full cloud sync state (for bidirectional multi-device sync)
        const getRes = await authFetch('/api/cloud/sync');
        if (!getRes.ok) {
          throw new Error('Failed to retrieve cloud sync data.');
        }

        const data: { syncData: UserCloudSyncPayload } = await getRes.json();
        setSyncStatus('synced');
        const timestamp = data.syncData?.lastSyncedAt || new Date().toISOString();
        setLastSyncedAt(timestamp);

        return {
          downloadedSongs: data.syncData?.customSongs || [],
          lastSyncedAt: timestamp,
        };
      } catch (err) {
        console.error('Cloud sync failure:', err);
        setSyncStatus('error');
        throw err;
      }
    },
    [user, authFetch]
  );

  const isAdmin = user?.role === 'admin';
  const pendingApprovalsCount = useMemo(() => {
    if (!isAdmin) return 0;
    return submissions.filter((s) => s.status === 'pending').length;
  }, [isAdmin, submissions]);

  const value = useMemo(
    () => ({
      user,
      isAdmin,
      isAuthLoading,
      login,
      loginWithGoogle,
      loginWithInstantEmail,
      signInWithGoogle,
      register,
      logout,
      updateProfile,
      connectCloudStorage,
      activeGroup,
      teamPresence,
      onlineMembersCount,
      broadcastSongActivity,
      createGroup,
      joinGroup,
      leaveGroup,
      updateTeamBranding: handleUpdateTeamBranding,
      publishActiveSetlistToTeam: handlePublishActiveSetlistToTeam,
      clearActiveTeamSetlist: handleClearActiveTeamSetlist,
      refreshActiveGroup,
      submissions,
      pendingApprovalsCount,
      refreshSubmissions,
      submitSongForGlobal,
      reviewSubmission,
      removeSongGlobally,
      restoreSongGlobally,
      syncStatus,
      lastSyncedAt,
      syncWithCloud,
    }),
    [
      user,
      isAdmin,
      isAuthLoading,
      login,
      loginWithGoogle,
      loginWithInstantEmail,
      signInWithGoogle,
      register,
      logout,
      updateProfile,
      connectCloudStorage,
      activeGroup,
      teamPresence,
      onlineMembersCount,
      broadcastSongActivity,
      createGroup,
      joinGroup,
      leaveGroup,
      handleUpdateTeamBranding,
      handlePublishActiveSetlistToTeam,
      handleClearActiveTeamSetlist,
      refreshActiveGroup,
      submissions,
      pendingApprovalsCount,
      refreshSubmissions,
      submitSongForGlobal,
      reviewSubmission,
      removeSongGlobally,
      restoreSongGlobally,
      syncStatus,
      lastSyncedAt,
      syncWithCloud,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
