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
import type {
  CloudStorageConfig,
  SongSubmission,
  UserCloudSyncPayload,
  UserProfile,
} from '@/types/auth';

interface AuthContextValue {
  user: UserProfile | null;
  isAdmin: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
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
  const [user, setUser] = useState<UserProfile | null>(null);
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
    return fetch(input, { ...init, headers });
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

        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.user) {
            setUser(data.user);
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.user));
          }
        } else {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_CACHE_KEY);
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
      const res = await fetch('/api/auth/login', {
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
      const res = await fetch('/api/auth/register', {
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
      register,
      logout,
      updateProfile,
      connectCloudStorage,
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
      register,
      logout,
      updateProfile,
      connectCloudStorage,
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
