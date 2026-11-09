'use client';

import React, { useState } from 'react';
import {
  X,
  Trash2,
  AlertTriangle,
  Loader2,
  Music,
  ShieldAlert,
} from 'lucide-react';
import type { SongRecord } from '@/types/song';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';

interface AdminDeleteSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: SongRecord | null;
  onDeleted?: (song: SongRecord) => void;
}

export function AdminDeleteSongModal({
  isOpen,
  onClose,
  song,
  onDeleted,
}: AdminDeleteSongModalProps) {
  const { removeSongGlobally, isAdmin } = useAuth();
  const { deleteCustomSong, refreshGlobalSongs } = useApp();

  const [reason, setReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !song) return null;

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Admin privileges are required to delete songs.');
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      // 1. If it is a local custom song, remove from local storage
      if (song.sourceType === 'custom') {
        try {
          await deleteCustomSong(song.id);
        } catch (localErr) {
          console.warn('Local custom song deletion note:', localErr);
        }
      }

      // 2. Remove globally from Cloud Firestore & server catalog
      await removeSongGlobally(song.id, reason.trim() || undefined);

      // 3. Refresh global songs list in AppContext
      await refreshGlobalSongs();

      if (onDeleted) {
        onDeleted(song);
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete song.';
      setError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      data-testid="admin-delete-song-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-rose-500/30 bg-[#101014] p-6 sm:p-8 shadow-2xl shadow-rose-950/20">
        {/* Close Button */}
        <button
          type="button"
          data-testid="admin-delete-song-modal-close-btn"
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-5 right-5 p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer disabled:opacity-50"
          title="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-500 flex items-center justify-center shrink-0">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[0.6875rem] font-bold uppercase tracking-wider mb-1">
              <ShieldAlert className="w-3 h-3" />
              <span>Admin Action</span>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              Delete Song from Catalog
            </h3>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="mb-5 p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <strong className="text-amber-300 font-semibold block mb-0.5">
              Warning: Administrator Removal
            </strong>
            Deleting this song will remove it from the public catalog and hide it
            across all connected devices, worship teams, and live sync sessions.
          </div>
        </div>

        {/* Song Info Card */}
        <div className="mb-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
              <Music className="w-4 h-4 text-[var(--brand-accent)] shrink-0" />
              <span>{song.title}</span>
            </div>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--border-subtle)] font-bold">
              Key of {song.originalKey}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            {(song.artist || song.attribution) && (
              <span>{song.artist || song.attribution}</span>
            )}
            {song.language?.label && (
              <>
                <span>•</span>
                <span>{song.language.label}</span>
              </>
            )}
            {song.category?.label && (
              <>
                <span>•</span>
                <span>{song.category.label}</span>
              </>
            )}
            <span className="px-1.5 py-0.2 rounded bg-[var(--bg-subtle)] text-[0.6875rem] font-semibold uppercase">
              {song.sourceType === 'custom' ? 'My Song' : 'Catalog Song'}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleConfirmDelete} className="space-y-4">
          <div>
            <label
              htmlFor="admin-delete-reason"
              className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5"
            >
              Reason for Removal (Optional)
            </label>
            <input
              id="admin-delete-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate song, copyrighted material, incorrect chord chart..."
              disabled={isDeleting}
              className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/60 focus:border-rose-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="admin-confirm-delete-song-btn"
              disabled={isDeleting}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-950/40 disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting Song...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Confirm Delete Song</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
