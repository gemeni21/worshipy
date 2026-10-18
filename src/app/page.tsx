'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Clock,
  Download,
  FolderHeart,
  Gauge,
  Heart,
  ListMusic,
  Radio,
  Search,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  getCatalogFilterOptions,
  resolveSongsByIds,
} from '@/lib/catalog/songCatalog';
import { SongRowCard } from '@/components/songs/SongRowCard';

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const {
    allAvailableSongs,
    customSongs,
    favorites,
    recentlyViewed,
    setlists,
    offlineEntries,
  } = useApp();

  const allSongs = allAvailableSongs;
  const { categories } = getCatalogFilterOptions(allSongs);

  const recentSongs = resolveSongsByIds(recentlyViewed, allSongs).slice(0, 4);
  const favoriteSongs = resolveSongsByIds(favorites, allSongs).slice(0, 4);
  const featuredSongs = allSongs.slice(0, 4);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/songs?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/songs');
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero & Prominent Search */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-8 space-y-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Demo Catalog MVP · 10 Original English & Filipino Songs
              {customSongs.length > 0
                ? ` + ${customSongs.length} Personal ${
                    customSongs.length === 1 ? 'Song' : 'Songs'
                  }`
                : ''}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Find a song, transpose instantly, and play with clarity.
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)]">
            Search chord charts by title, artist, language, category, or key.
            All personal songs, favorites, setlists, and offline charts stay
            stored on this device.
          </p>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          role="search"
          aria-label="Search songs"
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Search
              className="w-5 h-5 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by song title, artist, Filipino/English, or key (e.g. G, Bb, F#m)..."
              aria-label="Search songs by title, artist, language, category, or key"
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm sm:text-base placeholder:text-[var(--text-secondary)] focus:bg-[var(--bg-surface)]"
            />
          </div>
          <button
            type="submit"
            className="h-12 px-6 rounded-xl bg-[var(--brand-accent)] text-[var(--bg-surface)] font-semibold text-sm sm:text-base hover:opacity-95 transition-opacity cursor-pointer shrink-0"
          >
            Search Songs
          </button>
        </form>

        {/* Browse by Category Controls */}
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Browse by Category
            </h2>
            <Link
              href="/songs"
              className="text-xs font-semibold text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1"
            >
              <span>View Full Catalog ({allSongs.length})</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {categories.map((cat) => {
              const count = allSongs.filter(
                (s) => s.category.id === cat.id
              ).length;
              return (
                <Link
                  key={cat.id}
                  href={`/songs?category=${encodeURIComponent(cat.id)}`}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] px-3.5 py-3 transition-colors flex flex-col justify-between"
                >
                  <span className="font-semibold text-sm text-[var(--text-primary)]">
                    {cat.label}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] mt-1">
                    {count} {count === 1 ? 'song' : 'songs'}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quick Utility Summary Bar: My Songs, Tuner, Live Sync, Personal Setlists & Offline Saved Songs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/my-songs"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] transition-colors flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <FolderHeart
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>My Songs &amp; ChordPro</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {customSongs.length === 0
                ? 'Create custom worship charts manually or import/export ChordPro (.cho) files on this device.'
                : `${customSongs.length} personal ${
                    customSongs.length === 1 ? 'song' : 'songs'
                  } stored on this device. Create, edit, or import/export ChordPro.`}
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 text-[var(--text-secondary)] shrink-0"
            aria-hidden="true"
          />
        </Link>

        <Link
          href="/tuner"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] transition-colors flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Gauge
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>Instrument Tuner</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Tune guitar, bass, ukulele, or chromatic pitch using your
              device&apos;s microphone or reference tones.
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 text-[var(--text-secondary)] shrink-0"
            aria-hidden="true"
          />
        </Link>

        <Link
          href="/live"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] transition-colors flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Radio
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>Live Sync Session</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Lead or join a real-time worship session with synchronized song,
              official key, and section cues.
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 text-[var(--text-secondary)] shrink-0"
            aria-hidden="true"
          />
        </Link>

        <Link
          href="/setlists"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] transition-colors flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <ListMusic
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>Personal Setlists</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {setlists.length === 0
                ? 'Create local setlists for Sunday services or personal practice.'
                : `${setlists.length} personal ${
                    setlists.length === 1 ? 'setlist' : 'setlists'
                  } saved on this device.`}
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 text-[var(--text-secondary)] shrink-0"
            aria-hidden="true"
          />
        </Link>

        <Link
          href="/songs?offline=1"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] transition-colors flex items-center justify-between gap-4 sm:col-span-2"
        >
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Download
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>Saved for Offline Use</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {offlineEntries.length === 0
                ? 'Open any song and tap "Save Offline" to keep its chart available without internet.'
                : `${offlineEntries.length} ${
                    offlineEntries.length === 1 ? 'song' : 'songs'
                  } ready for offline access.`}
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 text-[var(--text-secondary)] shrink-0"
            aria-hidden="true"
          />
        </Link>
      </section>

      {/* New User Empty State when neither Favorites nor Recents exist yet */}
      {recentSongs.length === 0 && favoriteSongs.length === 0 && (
        <section className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 text-center space-y-2">
          <h2 className="text-base font-bold">Welcome to Your Local Library</h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mx-auto max-w-lg">
            You haven&apos;t opened or favorited any songs on this device yet.
            Select any demo song below to explore chord transposition,
            Performance Mode, and offline saving.
          </p>
        </section>
      )}

      {/* Recently Viewed Songs (when available) */}
      {recentSongs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold inline-flex items-center gap-2">
              <Clock
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>Recently Viewed</span>
            </h2>
            <Link
              href="/favorites"
              className="text-xs font-semibold text-[var(--brand-accent)] hover:underline"
            >
              View History & Favorites
            </Link>
          </div>
          <div className="space-y-2.5">
            {recentSongs.map((song) => (
              <SongRowCard key={song.id} song={song} />
            ))}
          </div>
        </section>
      )}

      {/* Favorite Songs (when available) */}
      {favoriteSongs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold inline-flex items-center gap-2">
              <Heart
                className="w-4 h-4 text-rose-500"
                aria-hidden="true"
              />
              <span>Favorite Songs</span>
            </h2>
            <Link
              href="/favorites"
              className="text-xs font-semibold text-[var(--brand-accent)] hover:underline"
            >
              See All ({favorites.length})
            </Link>
          </div>
          <div className="space-y-2.5">
            {favoriteSongs.map((song) => (
              <SongRowCard key={song.id} song={song} />
            ))}
          </div>
        </section>
      )}

      {/* Featured Catalog Starter List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold inline-flex items-center gap-2">
            <BookOpen
              className="w-4 h-4 text-[var(--brand-accent)]"
              aria-hidden="true"
            />
            <span>Starter Demo Catalog</span>
          </h2>
          <Link
            href="/songs"
            className="text-xs font-semibold text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1"
          >
            <span>Browse All {allSongs.length} Songs</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div className="space-y-2.5">
          {featuredSongs.map((song) => (
            <SongRowCard key={song.id} song={song} />
          ))}
        </div>
      </section>
    </div>
  );
}
