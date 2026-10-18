'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Download,
  Filter,
  FolderHeart,
  Mic,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  getAllSongs,
  getCatalogFilterOptions,
  searchAndFilterSongs,
} from '@/lib/catalog/songCatalog';
import { SongRowCard } from '@/components/songs/SongRowCard';
import { VoiceSearchModal } from '@/components/search/VoiceSearchModal';

function SongsCatalogInner({
  initialQuery,
  initialLanguage,
  initialCategory,
  initialKey,
  initialSource,
  initialOfflineOnly,
}: {
  initialQuery: string;
  initialLanguage: string;
  initialCategory: string;
  initialKey: string;
  initialSource: 'all' | 'catalog' | 'custom';
  initialOfflineOnly: boolean;
}) {
  const { allAvailableSongs, customSongs, offlineEntries } = useApp();

  const builtInCount = getAllSongs().length;
  const allSongs = allAvailableSongs;
  const filterOptions = useMemo(
    () => getCatalogFilterOptions(allSongs),
    [allSongs]
  );

  const [query, setQuery] = useState(initialQuery);
  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [selectedSource, setSelectedSource] = useState<
    'all' | 'catalog' | 'custom'
  >(initialSource);
  const [offlineOnly, setOfflineOnly] = useState(initialOfflineOnly);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  const offlineIds = useMemo(
    () => new Set(offlineEntries.map((e) => e.songId)),
    [offlineEntries]
  );

  const filteredSongs = useMemo(
    () =>
      searchAndFilterSongs(allSongs, {
        query,
        language: selectedLanguage,
        category: selectedCategory,
        originalKey: selectedKey,
        sourceType: selectedSource,
        offlineOnly,
        offlineSongIds: offlineIds,
      }),
    [
      allSongs,
      query,
      selectedLanguage,
      selectedCategory,
      selectedKey,
      selectedSource,
      offlineOnly,
      offlineIds,
    ]
  );

  const hasActiveFilters =
    query.trim() !== '' ||
    selectedLanguage !== 'all' ||
    selectedCategory !== 'all' ||
    selectedKey !== 'all' ||
    selectedSource !== 'all' ||
    offlineOnly;

  const handleClearFilters = () => {
    setQuery('');
    setSelectedLanguage('all');
    setSelectedCategory('all');
    setSelectedKey('all');
    setSelectedSource('all');
    setOfflineOnly(false);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Song Catalog
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              <Sparkles
                className="w-3.5 h-3.5 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>
                Worship Catalog ({builtInCount})
                {customSongs.length > 0
                  ? ` + My Songs (${customSongs.length})`
                  : ''}
              </span>
            </span>
            <Link
              href="/my-songs"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:opacity-90"
            >
              <FolderHeart className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Manage My Songs ({customSongs.length})</span>
            </Link>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Search and filter across built-in catalog songs and your personal
          device-local songs by title, artist, language, category, or key.
        </p>
      </header>

      {/* Search & Filters Panel */}
      <section
        aria-label="Search and Filter Controls"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4"
      >
        {/* Search Input */}
        <div className="relative">
          <Search
            className="w-5 h-5 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, artist, writer, language, category, or key..."
            aria-label="Search catalog"
            className="w-full h-11 pl-11 pr-11 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm sm:text-base placeholder:text-[var(--text-secondary)] focus:bg-[var(--bg-surface)]"
          />
          <button
            type="button"
            onClick={() => setIsVoiceModalOpen(true)}
            title="Search songs by voice"
            aria-label="Voice search songs"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--brand-accent)] hover:bg-[var(--brand-surface)] transition-colors cursor-pointer"
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <VoiceSearchModal
          isOpen={isVoiceModalOpen}
          onClose={() => setIsVoiceModalOpen(false)}
        />

        {/* Filter Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label
              htmlFor="filter-source"
              className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
            >
              Song Source
            </label>
            <select
              id="filter-source"
              value={selectedSource}
              onChange={(e) =>
                setSelectedSource(
                  e.target.value as 'all' | 'catalog' | 'custom'
                )
              }
              className="w-full h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 text-sm font-medium cursor-pointer"
            >
              <option value="all">All Songs ({allSongs.length})</option>
              <option value="catalog">
                Built-In Catalog ({builtInCount})
              </option>
              <option value="custom">
                My Songs ({customSongs.length})
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-language"
              className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
            >
              Language
            </label>
            <select
              id="filter-language"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 text-sm font-medium cursor-pointer"
            >
              <option value="all">All Languages</option>
              {filterOptions.languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-category"
              className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
            >
              Category / Genre
            </label>
            <select
              id="filter-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 text-sm font-medium cursor-pointer"
            >
              <option value="all">All Categories</option>
              {filterOptions.categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-key"
              className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
            >
              Original Key
            </label>
            <select
              id="filter-key"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 text-sm font-mono font-semibold cursor-pointer"
            >
              <option value="all">All Keys</option>
              {filterOptions.keys.map((k) => (
                <option key={k} value={k}>
                  Key of {k}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => setOfflineOnly((v) => !v)}
              aria-pressed={offlineOnly}
              className={`h-10 px-3 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                offlineOnly
                  ? 'border-[var(--brand-accent)] bg-[var(--brand-surface)] text-[var(--brand-accent)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Saved Offline ({offlineEntries.length})</span>
            </button>
          </div>
        </div>

        {/* Active Filter Status & Clear Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
          <div className="inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Showing <strong>{filteredSongs.length}</strong> of{' '}
              {allSongs.length} songs
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 font-semibold text-[var(--brand-accent)] hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear search & filters</span>
            </button>
          )}
        </div>
      </section>

      {/* Results List or Empty State */}
      {filteredSongs.length > 0 ? (
        <div className="space-y-2.5">
          {filteredSongs.map((song) => (
            <SongRowCard key={song.id} song={song} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
          <h2 className="text-lg font-bold">No Matching Songs Found</h2>
          <p className="text-sm text-[var(--text-secondary)] mx-auto max-w-md">
            {offlineOnly && offlineEntries.length === 0
              ? 'You have not saved any songs for offline access yet. Open any song in the catalog and tap "Save Offline".'
              : 'No songs matched your current combination of search terms and filters.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--brand-accent)] text-[var(--bg-surface)] text-sm font-semibold cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SongsCatalogContent() {
  const searchParams = useSearchParams();
  const rawSource = searchParams.get('source');
  const initialSource =
    rawSource === 'catalog' || rawSource === 'custom' ? rawSource : 'all';
  return (
    <SongsCatalogInner
      key={searchParams.toString()}
      initialQuery={searchParams.get('q') ?? ''}
      initialLanguage={searchParams.get('language') ?? 'all'}
      initialCategory={searchParams.get('category') ?? 'all'}
      initialKey={searchParams.get('key') ?? 'all'}
      initialSource={initialSource}
      initialOfflineOnly={searchParams.get('offline') === '1'}
    />
  );
}

export default function SongsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
          Loading song catalog...
        </div>
      }
    >
      <SongsCatalogContent />
    </Suspense>
  );
}
