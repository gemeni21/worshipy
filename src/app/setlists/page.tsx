'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Download,
  Edit3,
  Info,
  ListMusic,
  Loader2,
  Plus,
  Radio,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  formatSignedSemitones,
  transposeKey,
} from '@/lib/music/transposition';
import { SetlistDragReorderList } from '@/components/setlists/SetlistDragReorderList';
import type { SongRecord } from '@/types/song';

export default function SetlistsPage() {
  const {
    allAvailableSongs,
    getSongByIdOrSlug,
    setlists,
    createSetlist,
    deleteSetlist,
    renameSetlist,
    addSongToSetlist,
    removeSongFromSetlist,
    moveSongInSetlist,
    updateSetlistItems,
    isSongSavedOffline,
    saveBatchSongsOffline,
  } = useApp();

  const allSongs = allAvailableSongs;

  const [newSetlistName, setNewSetlistName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedSongBySetlist, setSelectedSongBySetlist] = useState<
    Record<string, string>
  >({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingSetlistId, setSavingSetlistId] = useState<string | null>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const handleSaveSetlistOffline = async (
    setlistId: string,
    setlistName: string,
    songs: SongRecord[]
  ) => {
    if (songs.length === 0) return;
    setSavingSetlistId(setlistId);
    try {
      const res = await saveBatchSongsOffline(songs);
      if (res.ok) {
        setStatusMessage(
          `Saved all ${songs.length} song${songs.length === 1 ? '' : 's'} from "${setlistName}" for offline use.`
        );
      } else {
        setStatusMessage(res.error || 'Could not save songs offline.');
      }
    } finally {
      setSavingSetlistId(null);
    }
  };

  const handleCreateSetlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetlistName.trim()) return;
    const created = createSetlist(newSetlistName);
    setNewSetlistName('');
    if (created) {
      setStatusMessage(`Created setlist "${created.name}".`);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      renameSetlist(id, editingName);
      setStatusMessage(`Renamed setlist to "${editingName.trim()}".`);
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleAddSong = (setlistId: string, setlistName: string) => {
    const targetSetlist = setlists.find((s) => s.id === setlistId);
    const existingIds = new Set(
      (targetSetlist?.items ?? []).map((i) => i.songId)
    );
    const firstUnaddedSong =
      allSongs.find((s) => !existingIds.has(s.id)) ?? allSongs[0];
    const chosenId =
      selectedSongBySetlist[setlistId] || firstUnaddedSong?.id || '';
    if (!chosenId) return;

    const chosenSong = getSongByIdOrSlug(chosenId);
    const res = addSongToSetlist(setlistId, chosenId);
    if (res.alreadyInSetlist) {
      setStatusMessage(
        `"${chosenSong?.title ?? chosenId}" is already in "${setlistName}".`
      );
    } else {
      setStatusMessage(
        `Added "${chosenSong?.title ?? chosenId}" to "${setlistName}".`
      );
      // Advance picker to the next song not yet in the setlist
      const nextUnadded = allSongs.find(
        (s) => s.id !== chosenId && !existingIds.has(s.id)
      );
      if (nextUnadded) {
        setSelectedSongBySetlist((prev) => ({
          ...prev,
          [setlistId]: nextUnadded.id,
        }));
      }
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          My Personal Setlists
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Organize and reorder songs for personal practice or service
          preparation.
        </p>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-xs sm:text-sm text-[var(--text-secondary)] flex items-start gap-2.5">
          <Info
            className="w-4 h-4 text-[var(--brand-accent)] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>
            <strong className="text-[var(--text-primary)]">
              Personal & Device-Local:
            </strong>{' '}
            Setlists created here are stored locally on this device for your own
            practice and performance. Team sharing and cloud sync are not part
            of this MVP.
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

      {/* Create New Setlist Form */}
      <section
        aria-label="Create a new personal setlist"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3"
      >
        <h2 className="text-base font-bold">Create a New Setlist</h2>
        <form
          onSubmit={handleCreateSetlist}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <label htmlFor="new-setlist-input" className="sr-only">
            Setlist Name
          </label>
          <input
            id="new-setlist-input"
            type="text"
            value={newSetlistName}
            onChange={(e) => setNewSetlistName(e.target.value)}
            placeholder="e.g., Sunday Morning Service, Acoustic Practice..."
            className="flex-1 h-11 px-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm sm:text-base focus:bg-[var(--bg-surface)]"
          />
          <button
            type="submit"
            disabled={!newSetlistName.trim()}
            className="h-11 px-5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 shadow-sm transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Create Setlist</span>
          </button>
        </form>
      </section>

      {/* Setlists List or Empty State */}
      {setlists.length > 0 ? (
        <div className="space-y-6">
          {setlists.map((setlist) => {
            const isEditing = editingId === setlist.id;
            const existingIds = new Set(setlist.items.map((i) => i.songId));
            const firstUnaddedSong =
              allSongs.find((s) => !existingIds.has(s.id)) ?? allSongs[0];
            const currentPickerSongId =
              selectedSongBySetlist[setlist.id] ?? firstUnaddedSong?.id ?? '';

            const setlistSongs = setlist.items
              .map((i) => getSongByIdOrSlug(i.songId))
              .filter((s): s is SongRecord => s !== undefined);
            const offlineCount = setlistSongs.filter((s) =>
              isSongSavedOffline(s.id)
            ).length;
            const allSavedOffline =
              setlistSongs.length > 0 && offlineCount === setlistSongs.length;

            return (
              <section
                key={setlist.id}
                aria-label={`Setlist ${setlist.name}`}
                className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs"
              >
                {/* Setlist Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 min-w-[14rem]">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        aria-label="Edit setlist name"
                        className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRename(setlist.id)}
                        className="px-3 h-9 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold cursor-pointer transition-all"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel rename"
                        className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <ListMusic
                        className="w-5 h-5 text-[var(--brand-accent)]"
                        aria-hidden="true"
                      />
                      <div>
                        <h2 className="text-lg font-bold">{setlist.name}</h2>
                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <span>
                            {setlist.items.length}{' '}
                            {setlist.items.length === 1 ? 'song' : 'songs'}
                          </span>
                          {setlistSongs.length > 0 && (
                            <>
                              <span>·</span>
                              {allSavedOffline ? (
                                <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                  <Check className="w-3 h-3" aria-hidden="true" />
                                  <span>Ready Offline</span>
                                </span>
                              ) : (
                                <span>
                                  {offlineCount}/{setlistSongs.length} offline
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {setlistSongs.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSaveSetlistOffline(
                            setlist.id,
                            setlist.name,
                            setlistSongs
                          )
                        }
                        disabled={savingSetlistId === setlist.id}
                        title={
                          allSavedOffline
                            ? 'All songs in this setlist are cached for offline use.'
                            : 'Download all songs in this setlist for offline stage use'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          allSavedOffline
                            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)]'
                        }`}
                      >
                        {savingSetlistId === setlist.id ? (
                          <Loader2
                            className="w-3.5 h-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : allSavedOffline ? (
                          <Check
                            className="w-3.5 h-3.5 text-emerald-500"
                            aria-hidden="true"
                          />
                        ) : (
                          <Download
                            className="w-3.5 h-3.5 text-[var(--brand-accent)]"
                            aria-hidden="true"
                          />
                        )}
                        <span>
                          {savingSetlistId === setlist.id
                            ? 'Saving...'
                            : allSavedOffline
                            ? 'Saved Offline'
                            : 'Save Setlist Offline'}
                        </span>
                      </button>
                    )}

                    {setlist.items.length > 0 && (
                      <Link
                        href={`/live?startSetlist=${encodeURIComponent(
                          setlist.id
                        )}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 text-xs font-semibold hover:opacity-95"
                      >
                        <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Start Live Sync</span>
                      </Link>
                    )}

                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() =>
                          handleStartRename(setlist.id, setlist.name)
                        }
                        aria-label={`Rename ${setlist.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-medium hover:border-[var(--border-strong)] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Rename</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete setlist "${setlist.name}" from this device?`
                          )
                        ) {
                          deleteSetlist(setlist.id);
                        }
                      }}
                      aria-label={`Delete ${setlist.name}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Setlist Song Items with Drag-to-Reorder */}
                {setlist.items.length > 0 ? (
                  <SetlistDragReorderList
                    setlistId={setlist.id}
                    setlistName={setlist.name}
                    items={setlist.items}
                    onReorder={(newItems) =>
                      updateSetlistItems(setlist.id, newItems)
                    }
                    onRemove={(index) =>
                      removeSongFromSetlist(setlist.id, index)
                    }
                    getSongByIdOrSlug={getSongByIdOrSlug}
                    isSongSavedOffline={isSongSavedOffline}
                  />
                ) : (
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] italic py-2">
                    This setlist has no songs yet. Add a song below or from any
                    song&apos;s detail page.
                  </p>
                )}

                {/* Quick Add Song to this Setlist */}
                <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <label
                    htmlFor={`add-song-select-${setlist.id}`}
                    className="text-xs font-medium text-[var(--text-secondary)] shrink-0"
                  >
                    Add Song:
                  </label>
                  <select
                    id={`add-song-select-${setlist.id}`}
                    value={currentPickerSongId}
                    onChange={(e) =>
                      setSelectedSongBySetlist((prev) => ({
                        ...prev,
                        [setlist.id]: e.target.value,
                      }))
                    }
                    className="flex-1 h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 text-sm cursor-pointer"
                  >
                    {allSongs.map((song) => {
                      const inList = existingIds.has(song.id);
                      return (
                        <option key={song.id} value={song.id}>
                          {song.title} ({song.originalKey} ·{' '}
                          {song.language.label})
                          {inList ? ' ✓ In Setlist' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleAddSong(setlist.id, setlist.name)}
                    className="h-10 px-4 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 hover:opacity-90 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Add to Setlist</span>
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="theme-card rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center mx-auto">
            <ListMusic className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold">No Personal Setlists Yet</h2>
          <p className="text-sm text-[var(--text-secondary)] mx-auto max-w-md">
            Create a setlist above (such as &ldquo;Sunday Service&rdquo; or
            &ldquo;Practice List&rdquo;) to group and reorder songs for quick
            access.
          </p>
        </div>
      )}
    </div>
  );
}
