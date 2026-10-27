'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clearAllOfflineSongs,
  getAllOfflineSongs,
  removeSongFromOffline,
  saveSongForOffline,
  saveBatchSongsForOffline,
  StorageOperationResult,
} from '@/lib/storage/offlineSongsDb';
import { apiUrl } from '@/lib/api/apiClient';
import {
  clearAllCustomSongsFromStorage,
  CUSTOM_SONGS_LOCALSTORAGE_KEY,
  deleteCustomSongFromStorage,
  getAllCustomSongsFromStorage,
  getCustomSongsSync,
  saveCustomSongToStorage,
} from '@/lib/storage/customSongsDb';
import {
  getAllSongs,
  isBuiltInCatalogSongId,
  mergeCatalogAndCustomSongs,
} from '@/lib/catalog/songCatalog';
import type {
  AccentColor,
  OfflineSongEntry,
  PersonalSetlist,
  SetlistItem,
  SongRecord,
  ThemePreference,
  UserSettings,
} from '@/types/song';

const STORAGE_KEYS = {
  FAVORITES: 'wmc_favorites_v1',
  RECENTS: 'wmc_recents_v1',
  SETLISTS: 'wmc_setlists_v1',
  SETTINGS: 'wmc_settings_v1',
  COLOR_SCHEME: 'color-scheme',
} as const;

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  accentColor: 'lime',
  chartFontSize: 'md',
  enharmonicPreference: 'auto',
};

interface AppContextValue {
  isHydrated: boolean;
  isOnline: boolean;
  simulateOffline: boolean;
  setSimulateOffline: (val: boolean) => void;
  effectiveOffline: boolean;
  storageWarning: string | null;
  customSongs: SongRecord[];
  globalApprovedSongs: SongRecord[];
  removedGlobalSongIds: string[];
  refreshGlobalSongs: () => Promise<void>;
  allAvailableSongs: SongRecord[];
  getSongByIdOrSlug: (idOrSlug: string) => SongRecord | undefined;
  saveCustomSong: (
    song: SongRecord
  ) => Promise<StorageOperationResult & { song?: SongRecord }>;
  deleteCustomSong: (songId: string) => Promise<StorageOperationResult>;
  clearCustomSongs: () => Promise<StorageOperationResult>;
  favorites: string[];
  isFavorite: (songId: string) => boolean;
  toggleFavorite: (songId: string) => void;
  recentlyViewed: string[];
  recordRecentlyViewed: (songId: string) => void;
  setlists: PersonalSetlist[];
  createSetlist: (name: string, description?: string) => PersonalSetlist | null;
  deleteSetlist: (setlistId: string) => void;
  renameSetlist: (setlistId: string, name: string) => void;
  addSongToSetlist: (
    setlistId: string,
    songId: string,
    preferredSemitones?: number
  ) => { ok: boolean; alreadyInSetlist?: boolean };
  removeSongFromSetlist: (setlistId: string, index: number) => void;
  moveSongInSetlist: (
    setlistId: string,
    fromIndex: number,
    direction: 'up' | 'down'
  ) => void;
  updateSetlistItems: (setlistId: string, items: SetlistItem[]) => void;
  offlineEntries: OfflineSongEntry[];
  isSongSavedOffline: (songId: string) => boolean;
  getOfflineSongRecord: (slugOrId: string) => SongRecord | undefined;
  saveSongOffline: (song: SongRecord) => Promise<StorageOperationResult>;
  saveBatchSongsOffline: (
    songs: SongRecord[]
  ) => Promise<{ ok: boolean; savedCount: number; error?: string }>;
  removeSongOffline: (
    songId: string,
    slug?: string
  ) => Promise<StorageOperationResult>;
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
  clearFavorites: () => void;
  clearRecentlyViewed: () => void;
  clearSetlists: () => void;
  clearOfflineDownloads: () => Promise<StorageOperationResult>;
  clearAllLocalData: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function applyColorSchemeToDocument(theme: ThemePreference) {
  if (typeof document === 'undefined') return;
  const metaValue = theme === 'system' ? 'light dark' : theme;
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="color-scheme"]'
  );
  if (!meta && document.head) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.appendChild(meta);
  }
  if (meta) {
    meta.content = metaValue;
  }

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = metaValue;

  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);

  const currentAccent = (root.getAttribute('data-accent') as AccentColor) || 'lime';
  applyAccentToDocument(currentAccent);

  try {
    if (theme === 'system') {
      window.localStorage.removeItem(STORAGE_KEYS.COLOR_SCHEME);
    } else {
      window.localStorage.setItem(STORAGE_KEYS.COLOR_SCHEME, theme);
    }
  } catch {
    // Ensure theme is applied to the document even if localStorage is blocked
  }
}

export function applyAccentToDocument(accent: AccentColor = 'lime') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-accent', accent);

  const isDark =
    root.classList.contains('dark') ||
    root.getAttribute('data-theme') === 'dark' ||
    (root.getAttribute('data-theme') !== 'light' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const PALETTES: Record<
    AccentColor,
    {
      accent: string;
      surface: string;
      chord: string;
      chordBg: string;
      accentText: string;
      glow: string;
    }
  > = {
    lime: {
      accent: isDark ? '#c8fc6c' : '#4d7c0f',
      surface: isDark ? 'rgba(200, 252, 108, 0.10)' : '#f7fee7',
      chord: isDark ? '#c8fc6c' : '#3f6212',
      chordBg: isDark ? 'rgba(200, 252, 108, 0.12)' : '#f7fee7',
      accentText: isDark ? '#0e1106' : '#ffffff',
      glow: isDark ? 'rgba(200, 252, 108, 0.20)' : 'rgba(77, 124, 15, 0.16)',
    },
    teal: {
      accent: isDark ? '#2dd4bf' : '#0f766e',
      surface: isDark ? '#134e4a' : '#f0fdfa',
      chord: isDark ? '#5eead4' : '#0f766e',
      chordBg: isDark ? 'rgba(20, 184, 166, 0.16)' : '#f0fdfa',
      accentText: '#ffffff',
      glow: isDark ? 'rgba(45, 212, 191, 0.24)' : 'rgba(15, 118, 110, 0.16)',
    },
    indigo: {
      accent: isDark ? '#818cf8' : '#4f46e5',
      surface: isDark ? '#312e81' : '#eef2ff',
      chord: isDark ? '#a5b4fc' : '#4f46e5',
      chordBg: isDark ? 'rgba(99, 102, 241, 0.16)' : '#eef2ff',
      accentText: '#ffffff',
      glow: isDark ? 'rgba(129, 140, 248, 0.24)' : 'rgba(79, 70, 229, 0.16)',
    },
    emerald: {
      accent: isDark ? '#34d399' : '#059669',
      surface: isDark ? '#064e3b' : '#ecfdf5',
      chord: isDark ? '#6ee7b7' : '#059669',
      chordBg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ecfdf5',
      accentText: '#ffffff',
      glow: isDark ? 'rgba(52, 211, 153, 0.24)' : 'rgba(5, 150, 105, 0.16)',
    },
    amber: {
      accent: isDark ? '#fbbf24' : '#d97706',
      surface: isDark ? '#78350f' : '#fffbeb',
      chord: isDark ? '#fcd34d' : '#b45309',
      chordBg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#fffbeb',
      accentText: isDark ? '#090d05' : '#ffffff',
      glow: isDark ? 'rgba(251, 191, 36, 0.24)' : 'rgba(217, 119, 6, 0.16)',
    },
  };

  const current = PALETTES[accent] || PALETTES.lime;
  root.style.setProperty('--brand-accent', current.accent);
  root.style.setProperty('--brand-surface', current.surface);
  root.style.setProperty('--chord-color', current.chord);
  root.style.setProperty('--chord-bg', current.chordBg);
  root.style.setProperty('--brand-accent-text', current.accentText);
  root.style.setProperty('--brand-accent-glow', current.glow);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const [customSongs, setCustomSongs] = useState<SongRecord[]>([]);
  const [globalApprovedSongs, setGlobalApprovedSongs] = useState<SongRecord[]>([]);
  const [removedGlobalSongIds, setRemovedGlobalSongIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [setlists, setSetlists] = useState<PersonalSetlist[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [offlineEntries, setOfflineEntries] = useState<OfflineSongEntry[]>([]);

  const refreshGlobalSongs = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/cloud/global-songs'));
      if (res.ok) {
        const data = await res.json();
        if (data?.songs && Array.isArray(data.songs)) {
          setGlobalApprovedSongs(data.songs);
        }
        if (data?.removedSongIds && Array.isArray(data.removedSongIds)) {
          setRemovedGlobalSongIds(data.removedSongIds);
        }
      }
    } catch (err) {
      console.warn('Could not refresh global approved songs:', err);
    }
  }, []);

  // Initial hydration from localStorage & IndexedDB + Service Worker registration
  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

      const loadedCustomSongs = getCustomSongsSync();
      const loadedFavs = safeReadJson<string[]>(STORAGE_KEYS.FAVORITES, []);
      const loadedRecents = safeReadJson<string[]>(STORAGE_KEYS.RECENTS, []);
      const loadedSetlists = safeReadJson<PersonalSetlist[]>(
        STORAGE_KEYS.SETLISTS,
        []
      );
      const loadedSettings = safeReadJson<Partial<UserSettings>>(
        STORAGE_KEYS.SETTINGS,
        {}
      );

      let storedScheme: ThemePreference | null = null;
      try {
        const rawScheme = window.localStorage.getItem(
          STORAGE_KEYS.COLOR_SCHEME
        );
        if (rawScheme === 'light' || rawScheme === 'dark') {
          storedScheme = rawScheme;
        }
      } catch {
        // ignore
      }

      const mergedSettings: UserSettings = {
        ...DEFAULT_SETTINGS,
        ...loadedSettings,
        ...(storedScheme ? { theme: storedScheme } : {}),
      };

      setCustomSongs(loadedCustomSongs);
      setFavorites(Array.isArray(loadedFavs) ? loadedFavs : []);
      setRecentlyViewed(Array.isArray(loadedRecents) ? loadedRecents : []);
      setSetlists(Array.isArray(loadedSetlists) ? loadedSetlists : []);
      setSettings(mergedSettings);
      applyColorSchemeToDocument(mergedSettings.theme);
      applyAccentToDocument(mergedSettings.accentColor || 'lime');
      setIsHydrated(true);
    });

    getAllCustomSongsFromStorage().then((storedCustom) => {
      if (!cancelled) {
        setCustomSongs(storedCustom);
      }
    });

    getAllOfflineSongs().then((entries) => {
      if (!cancelled) {
        setOfflineEntries(entries);
      }
    });

    fetch(apiUrl('/api/cloud/global-songs'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          if (data?.songs && Array.isArray(data.songs)) {
            setGlobalApprovedSongs(data.songs);
          }
          if (data?.removedSongIds && Array.isArray(data.removedSongIds)) {
            setRemovedGlobalSongIds(data.removedSongIds);
          }
        }
      })
      .catch(() => {});

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if ('caches' in window) {
        window.caches
          .keys()
          .then((keys) => {
            keys.forEach((key) => {
              if (key.endsWith('-v1') || key.endsWith('-v2')) {
                window.caches.delete(key).catch(() => {});
              }
            });
          })
          .catch(() => {});
      }
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {
          // Service worker registration is progressive enhancement
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for online/offline events, OS dark mode changes, & cross-tab storage synchronization
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.COLOR_SCHEME) {
        const val = event.newValue;
        const nextTheme: ThemePreference =
          val === 'light' || val === 'dark' ? val : 'system';
        setSettings((prev) => ({ ...prev, theme: nextTheme }));
        applyColorSchemeToDocument(nextTheme);
      } else if (event.key === STORAGE_KEYS.FAVORITES) {
        setFavorites(safeReadJson<string[]>(STORAGE_KEYS.FAVORITES, []));
      } else if (event.key === STORAGE_KEYS.SETLISTS) {
        setSetlists(safeReadJson<PersonalSetlist[]>(STORAGE_KEYS.SETLISTS, []));
      } else if (event.key === CUSTOM_SONGS_LOCALSTORAGE_KEY) {
        setCustomSongs(getCustomSongsSync());
      }
    };

    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    const handleSystemColorSchemeChange = () => {
      if (settings.theme === 'system') {
        applyColorSchemeToDocument('system');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorage);
    mq?.addEventListener('change', handleSystemColorSchemeChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorage);
      mq?.removeEventListener('change', handleSystemColorSchemeChange);
    };
  }, [settings.theme]);

  const isFavorite = useCallback(
    (songId: string) => favorites.includes(songId),
    [favorites]
  );

  const toggleFavorite = useCallback((songId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(songId)
        ? prev.filter((id) => id !== songId)
        : [songId, ...prev];
      if (!safeWriteJson(STORAGE_KEYS.FAVORITES, next)) {
        setStorageWarning(
          'Could not persist favorites to localStorage (storage may be full or restricted).'
        );
      }
      return next;
    });
  }, []);

  const recordRecentlyViewed = useCallback((songId: string) => {
    setRecentlyViewed((prev) => {
      const next = [songId, ...prev.filter((id) => id !== songId)].slice(0, 12);
      safeWriteJson(STORAGE_KEYS.RECENTS, next);
      return next;
    });
  }, []);

  const createSetlist = useCallback(
    (name: string, description?: string): PersonalSetlist | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const now = new Date().toISOString();
      const newSetlist: PersonalSetlist = {
        id: `setlist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        description: description?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        items: [],
      };

      setSetlists((prev) => {
        const next = [newSetlist, ...prev];
        if (!safeWriteJson(STORAGE_KEYS.SETLISTS, next)) {
          setStorageWarning('Could not save setlist to local storage.');
        }
        return next;
      });

      return newSetlist;
    },
    []
  );

  const deleteSetlist = useCallback((setlistId: string) => {
    setSetlists((prev) => {
      const next = prev.filter((s) => s.id !== setlistId);
      safeWriteJson(STORAGE_KEYS.SETLISTS, next);
      return next;
    });
  }, []);

  const renameSetlist = useCallback((setlistId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSetlists((prev) => {
      const next = prev.map((s) =>
        s.id === setlistId
          ? { ...s, name: trimmed, updatedAt: new Date().toISOString() }
          : s
      );
      safeWriteJson(STORAGE_KEYS.SETLISTS, next);
      return next;
    });
  }, []);

  const addSongToSetlist = useCallback(
    (
      setlistId: string,
      songId: string,
      preferredSemitones?: number
    ): { ok: boolean; alreadyInSetlist?: boolean } => {
      const targetSetlist = setlists.find((s) => s.id === setlistId);
      const alreadyExists = Boolean(
        targetSetlist?.items.some((item) => item.songId === songId)
      );

      setSetlists((prev) => {
        const next = prev.map((setlist) => {
          if (setlist.id !== setlistId) return setlist;
          if (setlist.items.some((item) => item.songId === songId)) {
            if (preferredSemitones !== undefined) {
              return {
                ...setlist,
                updatedAt: new Date().toISOString(),
                items: setlist.items.map((item) =>
                  item.songId === songId
                    ? {
                        ...item,
                        preferredSemitones:
                          preferredSemitones !== 0
                            ? preferredSemitones
                            : undefined,
                      }
                    : item
                ),
              };
            }
            return setlist;
          }
          return {
            ...setlist,
            updatedAt: new Date().toISOString(),
            items: [
              ...setlist.items,
              {
                songId,
                addedAt: new Date().toISOString(),
                ...(preferredSemitones !== undefined && preferredSemitones !== 0
                  ? { preferredSemitones }
                  : {}),
              },
            ],
          };
        });
        safeWriteJson(STORAGE_KEYS.SETLISTS, next);
        return next;
      });
      return { ok: true, alreadyInSetlist: alreadyExists };
    },
    [setlists]
  );

  const removeSongFromSetlist = useCallback(
    (setlistId: string, index: number) => {
      setSetlists((prev) => {
        const next = prev.map((setlist) => {
          if (setlist.id !== setlistId) return setlist;
          const items = setlist.items.filter((_, idx) => idx !== index);
          return {
            ...setlist,
            updatedAt: new Date().toISOString(),
            items,
          };
        });
        safeWriteJson(STORAGE_KEYS.SETLISTS, next);
        return next;
      });
    },
    []
  );

  const moveSongInSetlist = useCallback(
    (setlistId: string, fromIndex: number, direction: 'up' | 'down') => {
      setSetlists((prev) => {
        const next = prev.map((setlist) => {
          if (setlist.id !== setlistId) return setlist;
          const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
          if (toIndex < 0 || toIndex >= setlist.items.length) return setlist;

          const items = [...setlist.items];
          const [moved] = items.splice(fromIndex, 1);
          items.splice(toIndex, 0, moved);
          return {
            ...setlist,
            updatedAt: new Date().toISOString(),
            items,
          };
        });
        safeWriteJson(STORAGE_KEYS.SETLISTS, next);
        return next;
      });
    },
    []
  );

  const updateSetlistItems = useCallback(
    (setlistId: string, items: SetlistItem[]) => {
      setSetlists((prev) => {
        const next = prev.map((setlist) => {
          if (setlist.id !== setlistId) return setlist;
          return {
            ...setlist,
            updatedAt: new Date().toISOString(),
            items,
          };
        });
        safeWriteJson(STORAGE_KEYS.SETLISTS, next);
        return next;
      });
    },
    []
  );

  const isSongSavedOffline = useCallback(
    (songId: string) =>
      offlineEntries.some((entry) => entry.songId === songId),
    [offlineEntries]
  );

  const getOfflineSongRecord = useCallback(
    (slugOrId: string): SongRecord | undefined => {
      const found = offlineEntries.find(
        (entry) => entry.songId === slugOrId || entry.song.slug === slugOrId
      );
      return found?.song;
    },
    [offlineEntries]
  );

  const saveSongOffline = useCallback(
    async (song: SongRecord): Promise<StorageOperationResult> => {
      const res = await saveSongForOffline(song);
      if (res.ok) {
        const updated = await getAllOfflineSongs();
        setOfflineEntries(updated);
      } else if (res.error) {
        setStorageWarning(res.error);
      }
      return res;
    },
    []
  );

  const saveBatchSongsOffline = useCallback(
    async (
      songs: SongRecord[]
    ): Promise<{ ok: boolean; savedCount: number; error?: string }> => {
      const res = await saveBatchSongsForOffline(songs);
      if (res.ok) {
        const updated = await getAllOfflineSongs();
        setOfflineEntries(updated);
      } else if (res.error) {
        setStorageWarning(res.error);
      }
      return res;
    },
    []
  );

  const removeSongOffline = useCallback(
    async (
      songId: string,
      slug?: string
    ): Promise<StorageOperationResult> => {
      const res = await removeSongFromOffline(songId, slug);
      if (res.ok) {
        const updated = await getAllOfflineSongs();
        setOfflineEntries(updated);
      }
      return res;
    },
    []
  );

  const allAvailableSongs = useMemo(() => {
    const removedSet = new Set(removedGlobalSongIds);
    const combinedCatalog = getAllSongs().filter(
      (s) => !removedSet.has(s.id) && !removedSet.has(s.slug)
    );
    for (const gSong of globalApprovedSongs) {
      if (
        !removedSet.has(gSong.id) &&
        !removedSet.has(gSong.slug) &&
        !removedSet.has(gSong.id.replace(/^global_/, '')) &&
        !combinedCatalog.some((c) => c.id === gSong.id || c.slug === gSong.slug)
      ) {
        combinedCatalog.push(gSong);
      }
    }
    return mergeCatalogAndCustomSongs(customSongs, combinedCatalog);
  }, [customSongs, globalApprovedSongs, removedGlobalSongIds]);

  const getSongByIdOrSlug = useCallback(
    (idOrSlug: string): SongRecord | undefined => {
      return allAvailableSongs.find(
        (s) => s.id === idOrSlug || s.slug === idOrSlug
      );
    },
    [allAvailableSongs]
  );

  const saveCustomSong = useCallback(
    async (
      song: SongRecord
    ): Promise<StorageOperationResult & { song?: SongRecord }> => {
      const res = await saveCustomSongToStorage(song);
      if (res.ok) {
        const updatedList = await getAllCustomSongsFromStorage();
        setCustomSongs(updatedList);
        // If this custom song is also saved in offline storage, keep the offline copy up to date
        if (
          res.song &&
          offlineEntries.some((entry) => entry.songId === res.song!.id)
        ) {
          await saveSongForOffline(res.song);
          const updatedOffline = await getAllOfflineSongs();
          setOfflineEntries(updatedOffline);
        }
      } else if (res.error) {
        setStorageWarning(res.error);
      }
      return res;
    },
    [offlineEntries]
  );

  const deleteCustomSong = useCallback(
    async (songId: string): Promise<StorageOperationResult> => {
      if (!songId || isBuiltInCatalogSongId(songId)) {
        return {
          ok: false,
          error: 'Built-in catalog songs cannot be deleted.',
        };
      }

      const targetCustom = customSongs.find((s) => s.id === songId);
      const res = await deleteCustomSongFromStorage(songId);
      if (!res.ok) {
        if (res.error) setStorageWarning(res.error);
        return res;
      }

      const updatedCustom = await getAllCustomSongsFromStorage();
      setCustomSongs(updatedCustom);

      // Clean up references in favorites, recentlyViewed, setlists, and offline storage without corrupting unrelated items
      setFavorites((prev) => {
        if (!prev.includes(songId)) return prev;
        const next = prev.filter((id) => id !== songId);
        safeWriteJson(STORAGE_KEYS.FAVORITES, next);
        return next;
      });

      setRecentlyViewed((prev) => {
        if (!prev.includes(songId)) return prev;
        const next = prev.filter((id) => id !== songId);
        safeWriteJson(STORAGE_KEYS.RECENTS, next);
        return next;
      });

      setSetlists((prev) => {
        const hasRef = prev.some((sl) =>
          sl.items.some((item) => item.songId === songId)
        );
        if (!hasRef) return prev;
        const next = prev.map((sl) => ({
          ...sl,
          updatedAt: new Date().toISOString(),
          items: sl.items.filter((item) => item.songId !== songId),
        }));
        safeWriteJson(STORAGE_KEYS.SETLISTS, next);
        return next;
      });

      if (offlineEntries.some((entry) => entry.songId === songId)) {
        await removeSongFromOffline(songId, targetCustom?.slug);
        const updatedOffline = await getAllOfflineSongs();
        setOfflineEntries(updatedOffline);
      }

      return { ok: true };
    },
    [customSongs, offlineEntries]
  );

  const clearCustomSongs =
    useCallback(async (): Promise<StorageOperationResult> => {
      const customIds = new Set(customSongs.map((s) => s.id));
      const res = await clearAllCustomSongsFromStorage();
      if (res.ok) {
        setCustomSongs([]);
        if (customIds.size > 0) {
          setFavorites((prev) => {
            const next = prev.filter((id) => !customIds.has(id));
            safeWriteJson(STORAGE_KEYS.FAVORITES, next);
            return next;
          });
          setRecentlyViewed((prev) => {
            const next = prev.filter((id) => !customIds.has(id));
            safeWriteJson(STORAGE_KEYS.RECENTS, next);
            return next;
          });
          setSetlists((prev) => {
            const next = prev.map((sl) => ({
              ...sl,
              items: sl.items.filter((item) => !customIds.has(item.songId)),
            }));
            safeWriteJson(STORAGE_KEYS.SETLISTS, next);
            return next;
          });
        }
      }
      return res;
    }, [customSongs]);

  const updateSettings = useCallback((partial: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      safeWriteJson(STORAGE_KEYS.SETTINGS, next);
      if (partial.theme !== undefined) {
        applyColorSchemeToDocument(partial.theme);
      }
      if (partial.accentColor !== undefined) {
        applyAccentToDocument(partial.accentColor);
      }
      return next;
    });
  }, []);

  const clearFavorites = useCallback(() => {
    setFavorites([]);
    safeWriteJson(STORAGE_KEYS.FAVORITES, []);
  }, []);

  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
    safeWriteJson(STORAGE_KEYS.RECENTS, []);
  }, []);

  const clearSetlists = useCallback(() => {
    setSetlists([]);
    safeWriteJson(STORAGE_KEYS.SETLISTS, []);
  }, []);

  const clearOfflineDownloads =
    useCallback(async (): Promise<StorageOperationResult> => {
      const res = await clearAllOfflineSongs();
      if (res.ok) {
        setOfflineEntries([]);
      }
      return res;
    }, []);

  const clearAllLocalData = useCallback(async () => {
    setCustomSongs([]);
    setFavorites([]);
    setRecentlyViewed([]);
    setSetlists([]);
    setSettings(DEFAULT_SETTINGS);
    applyColorSchemeToDocument('system');
    try {
      window.localStorage.removeItem(STORAGE_KEYS.FAVORITES);
      window.localStorage.removeItem(STORAGE_KEYS.RECENTS);
      window.localStorage.removeItem(STORAGE_KEYS.SETLISTS);
      window.localStorage.removeItem(STORAGE_KEYS.SETTINGS);
      window.localStorage.removeItem(STORAGE_KEYS.COLOR_SCHEME);
      window.localStorage.removeItem(CUSTOM_SONGS_LOCALSTORAGE_KEY);
    } catch {
      // ignore
    }
    await clearAllCustomSongsFromStorage();
    await clearAllOfflineSongs();
    setOfflineEntries([]);
  }, []);

  const effectiveOffline = !isOnline || simulateOffline;

  const value = useMemo<AppContextValue>(
    () => ({
      isHydrated,
      isOnline,
      simulateOffline,
      setSimulateOffline,
      effectiveOffline,
      storageWarning,
      customSongs,
      globalApprovedSongs,
      removedGlobalSongIds,
      refreshGlobalSongs,
      allAvailableSongs,
      getSongByIdOrSlug,
      saveCustomSong,
      deleteCustomSong,
      clearCustomSongs,
      favorites,
      isFavorite,
      toggleFavorite,
      recentlyViewed,
      recordRecentlyViewed,
      setlists,
      createSetlist,
      deleteSetlist,
      renameSetlist,
      addSongToSetlist,
      removeSongFromSetlist,
      moveSongInSetlist,
      updateSetlistItems,
      offlineEntries,
      isSongSavedOffline,
      getOfflineSongRecord,
      saveSongOffline,
      saveBatchSongsOffline,
      removeSongOffline,
      settings,
      updateSettings,
      clearFavorites,
      clearRecentlyViewed,
      clearSetlists,
      clearOfflineDownloads,
      clearAllLocalData,
    }),
    [
      isHydrated,
      isOnline,
      simulateOffline,
      effectiveOffline,
      storageWarning,
      customSongs,
      globalApprovedSongs,
      removedGlobalSongIds,
      refreshGlobalSongs,
      allAvailableSongs,
      getSongByIdOrSlug,
      saveCustomSong,
      deleteCustomSong,
      clearCustomSongs,
      favorites,
      isFavorite,
      toggleFavorite,
      recentlyViewed,
      recordRecentlyViewed,
      setlists,
      createSetlist,
      deleteSetlist,
      renameSetlist,
      addSongToSetlist,
      removeSongFromSetlist,
      moveSongInSetlist,
      updateSetlistItems,
      offlineEntries,
      isSongSavedOffline,
      getOfflineSongRecord,
      saveSongOffline,
      saveBatchSongsOffline,
      removeSongOffline,
      settings,
      updateSettings,
      clearFavorites,
      clearRecentlyViewed,
      clearSetlists,
      clearOfflineDownloads,
      clearAllLocalData,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside an AppProvider');
  }
  return ctx;
}
