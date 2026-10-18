'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Clock,
  Download,
  Heart,
  Info,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { resolveSongsByIds } from '@/lib/catalog/songCatalog';
import { SongRowCard } from '@/components/songs/SongRowCard';

export default function FavoritesPage() {
  const {
    allAvailableSongs,
    favorites,
    recentlyViewed,
    isSongSavedOffline,
    saveBatchSongsOffline,
    clearFavorites,
    clearRecentlyViewed,
  } = useApp();

  const favoriteSongs = resolveSongsByIds(favorites, allAvailableSongs);
  const recentSongs = resolveSongsByIds(recentlyViewed, allAvailableSongs);

  const [isSavingFavoritesOffline, setIsSavingFavoritesOffline] =
    useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const offlineFavoriteCount = favoriteSongs.filter((s) =>
    isSongSavedOffline(s.id)
  ).length;
  const allFavoritesOffline =
    favoriteSongs.length > 0 &&
    offlineFavoriteCount === favoriteSongs.length;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Favorites & History
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Quickly access your starred songs and recently opened chord charts.
        </p>

        {/* Device-local notice */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-xs sm:text-sm text-[var(--text-secondary)] flex items-start gap-2.5">
          <Info
            className="w-4 h-4 text-[var(--brand-accent)] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>
            <strong className="text-[var(--text-primary)]">
              Local to this device:
            </strong>{' '}
            Your favorites and recently viewed history are saved in this
            browser&apos;s storage and do not sync across other phones, tablets,
            or computers in this MVP.
          </span>
        </div>
      </header>

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl bg-[var(--brand-surface)] border border-[var(--brand-accent)]/30 text-[var(--brand-accent)] px-4 py-3 text-sm font-medium flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Favorites Section */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold inline-flex items-center gap-2">
              <Heart
                className="w-5 h-5 text-rose-500 fill-current"
                aria-hidden="true"
              />
              <span>Favorite Songs ({favoriteSongs.length})</span>
            </h2>
            {favoriteSongs.length > 0 && (
              <span className="text-xs text-[var(--text-secondary)]">
                · {allFavoritesOffline ? 'All ready offline' : `${offlineFavoriteCount}/${favoriteSongs.length} offline`}
              </span>
            )}
          </div>

          {favoriteSongs.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSavingFavoritesOffline}
                onClick={async () => {
                  setIsSavingFavoritesOffline(true);
                  try {
                    const res = await saveBatchSongsOffline(favoriteSongs);
                    if (res.ok) {
                      setStatusMessage(
                        `Saved all ${favoriteSongs.length} favorite songs for offline use.`
                      );
                    } else {
                      setStatusMessage(
                        res.error || 'Could not save favorites offline.'
                      );
                    }
                  } finally {
                    setIsSavingFavoritesOffline(false);
                  }
                }}
                title={
                  allFavoritesOffline
                    ? 'All favorites are saved for offline use.'
                    : 'Download all favorite songs for offline use'
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  allFavoritesOffline
                    ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)]'
                }`}
              >
                {isSavingFavoritesOffline ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : allFavoritesOffline ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                ) : (
                  <Download
                    className="w-3.5 h-3.5 text-[var(--brand-accent)]"
                    aria-hidden="true"
                  />
                )}
                <span>
                  {isSavingFavoritesOffline
                    ? 'Saving...'
                    : allFavoritesOffline
                    ? 'Favorites Offline'
                    : 'Save All Offline'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Clear all favorite songs stored on this device?'
                    )
                  ) {
                    clearFavorites();
                    setStatusMessage('Cleared all favorite songs.');
                  }
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-rose-500 transition-colors cursor-pointer px-2 py-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear Favorites</span>
              </button>
            </div>
          )}
        </div>

        {favoriteSongs.length > 0 ? (
          <div className="space-y-2.5">
            {favoriteSongs.map((song) => (
              <SongRowCard key={song.id} song={song} />
            ))}
          </div>
        ) : (
          <div className="theme-card rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
            <h3 className="text-base font-semibold">No Favorite Songs Yet</h3>
            <p className="text-sm text-[var(--text-secondary)] mx-auto max-w-md">
              Tap the heart icon on any song in the catalog or chord chart view
              to bookmark it here for quick access.
            </p>
            <Link
              href="/songs"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-sm font-bold shadow-sm transition-all"
            >
              Browse Song Catalog
            </Link>
          </div>
        )}
      </section>

      {/* Recently Viewed Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold inline-flex items-center gap-2">
            <Clock
              className="w-5 h-5 text-[var(--brand-accent)]"
              aria-hidden="true"
            />
            <span>Recently Viewed ({recentSongs.length})</span>
          </h2>

          {recentSongs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Clear your recently viewed song history on this device?'
                  )
                ) {
                  clearRecentlyViewed();
                }
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-rose-500 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {recentSongs.length > 0 ? (
          <div className="space-y-2.5">
            {recentSongs.map((song) => (
              <SongRowCard key={song.id} song={song} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 text-center space-y-2">
            <h3 className="text-sm font-semibold">No Recently Viewed Songs</h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mx-auto max-w-md">
              Songs you open will automatically appear here newest first.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
