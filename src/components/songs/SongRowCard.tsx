'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Heart, Music } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { SongRecord } from '@/types/song';

interface SongRowCardProps {
  song: SongRecord;
  compact?: boolean;
  rightSlot?: React.ReactNode;
}

export function SongRowCard({
  song,
  compact = false,
  rightSlot,
}: SongRowCardProps) {
  const { isFavorite, toggleFavorite, isSongSavedOffline } = useApp();
  const favored = isFavorite(song.id);
  const savedOffline = isSongSavedOffline(song.id);

  return (
    <div className="group relative flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3.5 hover:border-[var(--border-strong)] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Link
            href={`/songs/${song.slug}`}
            className="font-semibold text-base sm:text-[1.0625rem] text-[var(--text-primary)] hover:text-[var(--brand-accent)] transition-colors truncate focus:outline-none after:absolute after:inset-0 after:z-0"
          >
            {song.title}
          </Link>

          {song.sourceType === 'custom' && (
            <span
              title="Personal song stored locally on this device"
              className="text-[0.6875rem] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]"
            >
              My Song
            </span>
          )}

          {song.contentStatus === 'demo' && song.sourceType !== 'custom' && (
            <span
              title="Original fictional demo song for testing"
              className="text-[0.6875rem] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
            >
              Demo
            </span>
          )}

          {savedOffline && (
            <span
              title="Saved on this device for offline access"
              className="inline-flex items-center gap-1 text-[0.6875rem] font-medium px-2 py-0.5 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]"
            >
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              <span>Offline</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-[var(--text-secondary)]">
          {(song.artist || song.attribution) && (
            <span className="truncate">{song.artist || song.attribution}</span>
          )}

          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-primary)] font-medium">
            {song.language.label}
          </span>

          <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
            {song.category.label}
          </span>

          {!compact && song.tempoBpm && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <Music className="w-3 h-3" aria-hidden="true" />
              {song.tempoBpm} BPM
              {song.timeSignature ? ` · ${song.timeSignature}` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-2 shrink-0">
        <div
          title={`Original Key: ${song.originalKey}`}
          className="flex flex-col items-center justify-center min-w-[2.75rem] h-10 px-2.5 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--border-subtle)]"
        >
          <span className="text-[0.625rem] uppercase tracking-wider leading-none opacity-80">
            Key
          </span>
          <span className="font-mono font-bold text-sm leading-tight">
            {song.originalKey}
          </span>
        </div>

        {rightSlot}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFavorite(song.id);
          }}
          aria-label={
            favored
              ? `Remove ${song.title} from favorites`
              : `Add ${song.title} to favorites`
          }
          aria-pressed={favored}
          className={`inline-flex items-center justify-center w-11 h-11 rounded-lg border transition-colors cursor-pointer ${
            favored
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
              : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Heart
            className={`w-5 h-5 ${favored ? 'fill-current' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
