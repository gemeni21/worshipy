'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Download,
  FolderHeart,
  Gauge,
  Heart,
  ListMusic,
  Mic,
  Plus,
  Radio,
  Search,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useIsMounted } from '@/hooks/useIsMounted';
import {
  getCatalogFilterOptions,
  resolveSongsByIds,
} from '@/lib/catalog/songCatalog';
import { SongRowCard } from '@/components/songs/SongRowCard';
import type { SongRecord } from '@/types/song';

function getNextSundayInfo(): { dateLabel: string; isTodaySunday: boolean } {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const isTodaySunday = day === 0;
  const daysUntilSunday = isTodaySunday ? 0 : 7 - day;
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + daysUntilSunday);

  const formatted = targetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return {
    dateLabel: isTodaySunday ? `Today (Sunday, ${formatted})` : `This Sunday, ${formatted}`,
    isTodaySunday,
  };
}

function getDayPeriodGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [createdStarterToast, setCreatedStarterToast] = useState(false);

  const {
    allAvailableSongs,
    customSongs,
    favorites,
    recentlyViewed,
    setlists,
    offlineEntries,
    createSetlist,
    addSongToSetlist,
  } = useApp();

  const allSongs = allAvailableSongs;
  const { categories } = getCatalogFilterOptions(allSongs);

  const recentSongs = resolveSongsByIds(recentlyViewed, allSongs).slice(0, 4);
  const favoriteSongs = resolveSongsByIds(favorites, allSongs).slice(0, 4);
  const featuredSongs = allSongs.slice(0, 4);

  const isMounted = useIsMounted();
  const sundayInfo = isMounted
    ? getNextSundayInfo()
    : { dateLabel: 'This Sunday', isTodaySunday: false };
  const greeting = isMounted ? getDayPeriodGreeting() : 'Welcome';

  // Find either a setlist explicitly with "sunday" in its name, or default to the first setlist
  const sundaySetlist = useMemo(() => {
    if (setlists.length === 0) return null;
    const found = setlists.find((s) => s.name.toLowerCase().includes('sunday'));
    return found || setlists[0];
  }, [setlists]);

  // Resolve songs inside the active spotlight setlist
  const spotlightSongs = useMemo(() => {
    if (!sundaySetlist) return [];
    return sundaySetlist.items
      .map((item) => allSongs.find((s) => s.id === item.songId))
      .filter(Boolean) as SongRecord[];
  }, [sundaySetlist, allSongs]);

  // Key sequence flow e.g. "G → G → D → G"
  const keyFlow = useMemo(() => {
    if (spotlightSongs.length === 0) return '';
    return spotlightSongs.map((s) => s.originalKey).join(' → ');
  }, [spotlightSongs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/songs?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/songs');
    }
  };

  const handleQuickCreateSundaySetlist = () => {
    const created = createSetlist(
      'Sunday Service Worship',
      'Curated worship setlist for upcoming Sunday service'
    );
    if (created) {
      const demoIds = ['song-01', 'song-02', 'song-04', 'song-03'];
      demoIds.forEach((id) => {
        const s = allSongs.find((song) => song.id === id);
        if (s) {
          addSongToSetlist(created.id, s.id);
        }
      });
      setCreatedStarterToast(true);
      setTimeout(() => setCreatedStarterToast(false), 4500);
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

      {/* "This Sunday's Setlist" Spotlight Card */}
      <section className="theme-card relative overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-7 shadow-lg space-y-5">
        {/* Toast confirmation when starter setlist created */}
        {createdStarterToast && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Created &quot;Sunday Service Worship&quot; with 4 curated worship anthems!</span>
            </div>
            <Link href="/setlists" className="underline hover:opacity-80">
              View Setlists
            </Link>
          </div>
        )}

        {/* Spotlight Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 shadow-xs">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span suppressHydrationWarning>{sundayInfo.dateLabel}</span>
              </span>
              <span className="text-xs font-semibold text-[var(--text-secondary)] hidden sm:inline">
                Spotlight Setlist
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {sundaySetlist ? sundaySetlist.name : "This Sunday's Setlist"}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              {sundaySetlist
                ? `${spotlightSongs.length} ${spotlightSongs.length === 1 ? 'song' : 'songs'} queued for service${
                    keyFlow ? ` · Flow: ${keyFlow}` : ''
                  }`
                : 'No setlist created yet. Plan your Sunday worship service with curated anthems or custom charts.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {sundaySetlist ? (
              <>
                <Link
                  href="/live"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
                >
                  <Radio className="w-4 h-4 animate-pulse" aria-hidden="true" />
                  <span>Launch Live Sync</span>
                </Link>
                <Link
                  href="/setlists"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-surface)] text-[var(--text-primary)] font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  <ListMusic className="w-4 h-4 text-[var(--brand-accent)]" aria-hidden="true" />
                  <span>Edit</span>
                </Link>
              </>
            ) : (
              <button
                type="button"
                onClick={handleQuickCreateSundaySetlist}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/40 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>1-Click Create Sunday Setlist</span>
              </button>
            )}
          </div>
        </div>

        {/* Songs in Sunday Setlist */}
        {sundaySetlist && spotlightSongs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {spotlightSongs.map((song, idx) => (
              <Link
                key={song.id + idx}
                href={`/songs/${song.slug}`}
                className="theme-card group flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] shadow-xs transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-[var(--brand-accent)] transition-colors truncate">
                      {song.title}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {song.artist || 'Worship Leader'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] font-mono font-bold text-xs">
                    {song.originalKey}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--brand-accent)] group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        ) : !sundaySetlist ? (
          /* Starter Setlist Preview with 1-Click Setup */
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { title: 'Goodness of God', artist: 'Bethel Music', key: 'G', slug: 'goodness-of-god' },
                { title: 'Way Maker', artist: 'Sinach / Leeland', key: 'G', slug: 'way-maker' },
                { title: '10,000 Reasons', artist: 'Matt Redman', key: 'G', slug: '10000-reasons' },
                { title: 'What a Beautiful Name', artist: 'Hillsong Worship', key: 'D', slug: 'what-a-beautiful-name' },
              ].map((song, idx) => (
                <div
                  key={song.slug}
                  className="theme-card flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-surface)]/70 border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-secondary)]"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="w-5 h-5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] font-mono font-bold text-[0.6875rem] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)] truncate">{song.title}</span>
                    <span className="truncate hidden sm:inline">• {song.artist}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] font-mono font-bold text-[var(--text-primary)] text-[0.6875rem]">
                    Key {song.key}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[var(--text-secondary)]">
              <span>Tap above to populate this setlist automatically, or build one from your custom library.</span>
              <Link href="/setlists" className="font-semibold text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1">
                <span>Go to Setlists Manager</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 space-y-2">
            <p className="text-sm text-[var(--text-secondary)]">
              This setlist is currently empty. Add songs from the catalog or your custom library.
            </p>
            <Link
              href="/songs"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-accent)] hover:underline"
            >
              <span>Browse Song Catalog to Add Charts</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
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
          href="/tuner"
          className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 hover:border-[var(--brand-accent)] flex items-center justify-between gap-4"
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
