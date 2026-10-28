'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Download,
  FolderHeart,
  Heart,
  ListMusic,
  Mic,
  Plus,
  Radio,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useIsMounted } from '@/hooks/useIsMounted';
import {
  getCatalogFilterOptions,
  resolveSongsByIds,
} from '@/lib/catalog/songCatalog';
import { SongRowCard } from '@/components/songs/SongRowCard';
import type { SongRecord } from '@/types/song';

function getDayPeriodGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

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

  const isMounted = useIsMounted();
  const greeting = isMounted ? getDayPeriodGreeting() : 'Welcome';

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
      {/* Modern Hero Greeting */}
      <section className="theme-card relative overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/20 shadow-xs">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Worship Companion MVP · 53 Anthems {customSongs.length > 0 ? `+ ${customSongs.length} Personal` : ''}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight" suppressHydrationWarning>
              {greeting}, Worship Leader
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-xl">
              Transpose chord charts instantly, sync your band in real time, and keep music stand charts readable without glare.
            </p>
          </div>

          {/* Quick Action Badges */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              href="/live"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <Radio className="w-4 h-4 animate-pulse" aria-hidden="true" />
              <span>Live Sync</span>
            </Link>
            <Link
              href="/my-songs"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--brand-accent)] text-xs sm:text-sm font-semibold transition-all cursor-pointer"
            >
              <FolderHeart className="w-4 h-4 text-[var(--brand-accent)]" aria-hidden="true" />
              <span>My Songs</span>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          role="search"
          aria-label="Search songs"
          className="relative z-10 flex flex-col sm:flex-row gap-2.5"
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
              placeholder="Search by song title, artist, language, or key (e.g. Goodness of God, Way Maker, G, Bb)..."
              aria-label="Search songs by title, artist, language, category, or key"
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm sm:text-base placeholder:text-[var(--text-secondary)] focus:bg-[var(--bg-surface)] focus:border-[var(--brand-accent)] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="h-12 px-6 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm sm:text-base transition-all cursor-pointer shadow-sm shrink-0 flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4 sm:hidden" />
            <span>Search Songs</span>
          </button>
        </form>

        {/* Popular Worship Search Suggestions */}
        <div className="relative z-10 flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-[var(--text-secondary)] font-medium">Popular:</span>
          {['Goodness of God', 'Way Maker', '10,000 Reasons', 'Gratitude', 'Salamat Panginoon'].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => router.push(`/songs?q=${encodeURIComponent(tag)}`)}
              className="px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--brand-surface)] text-[var(--text-secondary)] hover:text-[var(--brand-accent)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {/* Browse by Category Controls */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Browse Catalog by Category
          </h2>
          <Link
            href="/songs"
            className="text-xs font-semibold text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1"
          >
            <span>View All ({allSongs.length})</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {categories.map((cat) => {
            const count = allSongs.filter((s) => s.category.id === cat.id).length;
            return (
              <Link
                key={cat.id}
                href={`/songs?category=${encodeURIComponent(cat.id)}`}
                className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--brand-accent)] p-4 flex flex-col justify-between shadow-xs"
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
      </section>

      {/* Quick Utility Summary Bar: My Songs, Tuner, Live Sync, Personal Setlists & Offline Saved Songs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/my-songs"
          className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] flex items-center justify-between gap-4"
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
          href="/team"
          className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Users
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>Worship Team Hub</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Collaborate with your church band. Share custom arrangements, live rehearsal takes, and roster presence.
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 text-[var(--text-secondary)] shrink-0"
            aria-hidden="true"
          />
        </Link>

        <Link
          href="/live"
          className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] flex items-center justify-between gap-4"
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
          className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] flex items-center justify-between gap-4"
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

        {/* Practice Studio & Audio Review Card */}
        <Link
          href="/practice"
          className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Mic
                className="w-4 h-4 text-rose-400"
                aria-hidden="true"
              />
              <span>Practice Takes &amp; Audio Review</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Record rehearsal takes, review audio with scrubbable waveforms, speed controls, and notes directly on device.
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 text-[var(--text-secondary)] shrink-0"
            aria-hidden="true"
          />
        </Link>

        <Link
          href="/songs?offline=1"
          className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] flex items-center justify-between gap-4 sm:col-span-2"
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
            Select any song below to explore chord transposition,
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
            <span>Worship Song Catalog</span>
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
