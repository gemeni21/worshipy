'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, GripVertical, Trash2 } from 'lucide-react';
import {
  formatSignedSemitones,
  transposeKey,
} from '@/lib/music/transposition';
import type { SetlistItem, SongRecord } from '@/types/song';

interface SetlistDragReorderListProps {
  setlistId: string;
  setlistName: string;
  items: SetlistItem[];
  onReorder: (newItems: SetlistItem[]) => void;
  onRemove: (index: number) => void;
  getSongByIdOrSlug: (idOrSlug: string) => SongRecord | undefined;
  isSongSavedOffline: (songId: string) => boolean;
}

interface DragState {
  activeKey: string;
  initialSlot: number;
  grabOffset: number;
  currentY: number;
  isKeyboard: boolean;
}

const ROW_HEIGHT = 72; // px
const ROW_GAP = 8; // px
const STEP = ROW_HEIGHT + ROW_GAP; // 80px

// Stable unique identifier for setlist item
function getItemKey(item: SetlistItem, fallbackIdx: number): string {
  return item.addedAt
    ? `${item.songId}__${item.addedAt}`
    : `${item.songId}__${fallbackIdx}`;
}

export function SetlistDragReorderList({
  setlistId,
  setlistName,
  items,
  onReorder,
  onRemove,
  getSongByIdOrSlug,
  isSongSavedOffline,
}: SetlistDragReorderListProps) {
  const listId = useId();
  const listRef = useRef<HTMLOListElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const dragPointerIdRef = useRef<number | null>(null);

  // Local state holding the current ordered items
  const [currentOrder, setCurrentOrder] = useState<SetlistItem[]>(items);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  // Backup of order before a keyboard or pointer drag session begins
  const preDragOrderRef = useRef<SetlistItem[]>(items);

  // Keep local items synchronized with props when not actively dragging
  useEffect(() => {
    if (!dragState) {
      setCurrentOrder(items);
      preDragOrderRef.current = items;
    }
  }, [items, dragState]);

  // Handle pointer down on drag grip handle
  const handlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    key: string,
    slot: number
  ) => {
    // Only respond to primary mouse button or touch/pen
    if (e.button !== 0) return;

    const rowEl = rowRefs.current.get(key);
    const containerEl = listRef.current;
    if (!rowEl || !containerEl) return;

    // Capture pointer
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragPointerIdRef.current = e.pointerId;
    } catch {
      // ignore
    }

    const rowRect = rowEl.getBoundingClientRect();
    const grabOffset = e.clientY - rowRect.top;
    const initialTranslateY = slot * STEP;

    preDragOrderRef.current = currentOrder;

    setDragState({
      activeKey: key,
      initialSlot: slot,
      grabOffset,
      currentY: initialTranslateY,
      isKeyboard: false,
    });

    const item = currentOrder[slot];
    const song = item ? getSongByIdOrSlug(item.songId) : null;
    const songName = song?.title ?? 'Song';

    setLiveAnnouncement(
      `Picked up ${songName}, position ${slot + 1} of ${
        currentOrder.length
      }. Drag up or down to reorder.`
    );
  };

  // Handle pointer move during drag
  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.isKeyboard) return;
    if (!listRef.current) return;

    const containerRect = listRef.current.getBoundingClientRect();
    const pointerYInContainer = e.clientY - containerRect.top;
    const rawY = pointerYInContainer - dragState.grabOffset;

    const maxTranslateY = Math.max(0, (currentOrder.length - 1) * STEP);
    const clampedY = Math.max(0, Math.min(rawY, maxTranslateY));

    // Compute target slot with Math.round(y / step)
    const targetSlot = Math.max(
      0,
      Math.min(currentOrder.length - 1, Math.round(clampedY / STEP))
    );

    const currentSlot = currentOrder.findIndex(
      (item, idx) => getItemKey(item, idx) === dragState.activeKey
    );

    if (targetSlot !== currentSlot && currentSlot !== -1) {
      // Splice row to that slot in the order array and re-place every other row
      const newOrder = [...currentOrder];
      const [moved] = newOrder.splice(currentSlot, 1);
      newOrder.splice(targetSlot, 0, moved);

      setCurrentOrder(newOrder);

      const song = getSongByIdOrSlug(moved.songId);
      const songName = song?.title ?? 'Song';
      setLiveAnnouncement(
        `${songName}, position ${targetSlot + 1} of ${newOrder.length}`
      );
    }

    setDragState((prev) =>
      prev ? { ...prev, currentY: clampedY } : null
    );
  };

  // Handle pointer up or lost capture
  const handlePointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.isKeyboard) return;

    try {
      if (
        dragPointerIdRef.current !== null &&
        e.currentTarget.hasPointerCapture(dragPointerIdRef.current)
      ) {
        e.currentTarget.releasePointerCapture(dragPointerIdRef.current);
      }
    } catch {
      // ignore
    }
    dragPointerIdRef.current = null;

    const finalSlot = currentOrder.findIndex(
      (item, idx) => getItemKey(item, idx) === dragState.activeKey
    );
    const movedItem = currentOrder[finalSlot];
    const song = movedItem ? getSongByIdOrSlug(movedItem.songId) : null;
    const songName = song?.title ?? 'Song';

    setLiveAnnouncement(
      `Dropped ${songName} at position ${finalSlot + 1} of ${
        currentOrder.length
      }.`
    );

    setDragState(null);

    // Commit changes to parent & AppContext
    onReorder(currentOrder);
  };

  // Handle keyboard reorder (Space to pick up, Up/Down to move, Space to drop, Esc to cancel)
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    key: string,
    slot: number
  ) => {
    const isCurrentActive =
      dragState !== null && dragState.activeKey === key && dragState.isKeyboard;

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!isCurrentActive) {
        // Pick up
        preDragOrderRef.current = currentOrder;
        setDragState({
          activeKey: key,
          initialSlot: slot,
          grabOffset: 0,
          currentY: slot * STEP,
          isKeyboard: true,
        });

        const song = getSongByIdOrSlug(currentOrder[slot]?.songId);
        const songName = song?.title ?? 'Song';
        setLiveAnnouncement(
          `Picked up ${songName}, position ${slot + 1} of ${
            currentOrder.length
          }. Use arrow keys to move, Space to drop, Escape to cancel.`
        );
      } else {
        // Drop
        const song = getSongByIdOrSlug(currentOrder[slot]?.songId);
        const songName = song?.title ?? 'Song';
        setLiveAnnouncement(
          `Dropped ${songName} at position ${slot + 1} of ${
            currentOrder.length
          }.`
        );
        setDragState(null);
        onReorder(currentOrder);
      }
      return;
    }

    if (isCurrentActive) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (slot > 0) {
          const targetSlot = slot - 1;
          const newOrder = [...currentOrder];
          const [moved] = newOrder.splice(slot, 1);
          newOrder.splice(targetSlot, 0, moved);

          setCurrentOrder(newOrder);
          setDragState((prev) =>
            prev ? { ...prev, currentY: targetSlot * STEP } : null
          );

          const song = getSongByIdOrSlug(moved.songId);
          const songName = song?.title ?? 'Song';
          setLiveAnnouncement(
            `${songName}, position ${targetSlot + 1} of ${newOrder.length}`
          );
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (slot < currentOrder.length - 1) {
          const targetSlot = slot + 1;
          const newOrder = [...currentOrder];
          const [moved] = newOrder.splice(slot, 1);
          newOrder.splice(targetSlot, 0, moved);

          setCurrentOrder(newOrder);
          setDragState((prev) =>
            prev ? { ...prev, currentY: targetSlot * STEP } : null
          );

          const song = getSongByIdOrSlug(moved.songId);
          const songName = song?.title ?? 'Song';
          setLiveAnnouncement(
            `${songName}, position ${targetSlot + 1} of ${newOrder.length}`
          );
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        // Cancel and revert to previous order
        const song = getSongByIdOrSlug(currentOrder[slot]?.songId);
        const songName = song?.title ?? 'Song';
        setLiveAnnouncement(
          `Reordering cancelled. ${songName} returned to position ${
            dragState.initialSlot + 1
          } of ${currentOrder.length}.`
        );
        setCurrentOrder(preDragOrderRef.current);
        setDragState(null);
        return;
      }
    }
  };

  const containerHeight =
    currentOrder.length > 0 ? currentOrder.length * STEP - ROW_GAP : 0;

  return (
    <div className="space-y-2">
      {/* Accessible live status for screen reader announcements */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>

      {/* Screen reader instructions */}
      <p id={`sr-instructions-${listId}`} className="sr-only">
        Setlist songs reorder list. Use the grab handle on each card to drag and
        drop, or press Space to pick up, Up and Down arrows to move, and Space to
        drop into position.
      </p>

      {/* Relative container with fixed row height positioning */}
      <ol
        ref={listRef}
        aria-describedby={`sr-instructions-${listId}`}
        aria-label={`${setlistName} songs list`}
        className="drag-reorder-container relative w-full"
        style={{ height: `${containerHeight}px` }}
      >
        {currentOrder.map((item, slot) => {
          const key = getItemKey(item, slot);
          const song = getSongByIdOrSlug(item.songId);
          const isDragging =
            dragState !== null &&
            dragState.activeKey === key &&
            !dragState.isKeyboard;
          const isKeyboardLifted =
            dragState !== null &&
            dragState.activeKey === key &&
            dragState.isKeyboard;
          const isLifted = isDragging || isKeyboardLifted;

          // Compute row translation: follow pointer when actively dragging, else slot * step
          const translateY = isDragging ? dragState.currentY : slot * STEP;

          if (!song) {
            return (
              <li
                key={key}
                ref={(el) => {
                  if (el) rowRefs.current.set(key, el);
                  else rowRefs.current.delete(key);
                }}
                data-dragging={isDragging ? 'true' : 'false'}
                data-keyboard-lifted={isKeyboardLifted ? 'true' : 'false'}
                className="drag-reorder-card absolute inset-x-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-2.5 flex items-center justify-between text-xs text-[var(--text-secondary)]"
                style={{
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${translateY}px) ${
                    isLifted ? 'scale(1.04)' : 'scale(1)'
                  }`,
                  zIndex: isLifted ? 40 : 1,
                }}
              >
                <span>Unavailable song record ({item.songId})</span>
                <button
                  type="button"
                  onClick={() => onRemove(slot)}
                  className="text-rose-500 underline cursor-pointer hover:text-rose-400"
                >
                  Remove
                </button>
              </li>
            );
          }

          const preferredSemis = item.preferredSemitones ?? 0;
          const preferredKey =
            preferredSemis !== 0
              ? transposeKey(song.originalKey, preferredSemis, 'auto')
              : null;
          const songHref =
            preferredSemis !== 0
              ? `/songs/${song.slug}?semitones=${preferredSemis}`
              : `/songs/${song.slug}`;

          return (
            <li
              key={key}
              ref={(el) => {
                if (el) rowRefs.current.set(key, el);
                else rowRefs.current.delete(key);
              }}
              data-dragging={isDragging ? 'true' : 'false'}
              data-keyboard-lifted={isKeyboardLifted ? 'true' : 'false'}
              className={`drag-reorder-card absolute inset-x-0 rounded-xl border transition-colors flex items-center justify-between gap-3 px-3.5 py-2.5 box-border select-none ${
                isLifted
                  ? 'border-[var(--brand-accent)]/55 bg-[#181822] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.65),0_8px_10px_-6px_rgba(0,0,0,0.65),0_0_0_1.5px_rgba(200,252,108,0.45)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
              }`}
              style={{
                height: `${ROW_HEIGHT}px`,
                transform: `translateY(${translateY}px) ${
                  isLifted ? 'scale(1.04)' : 'scale(1)'
                }`,
                zIndex: isLifted ? 40 : 1,
              }}
            >
              {/* Left Cluster: Drag Handle + Slot Number + Song Details */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                {/* Dedicated Drag & Keyboard Reorder Grip Handle */}
                <button
                  type="button"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isLifted}
                  aria-roledescription="sortable song item"
                  aria-label={`Reorder ${song.title}. Position ${
                    slot + 1
                  } of ${
                    currentOrder.length
                  }. Press Space to pick up, Up and Down arrow keys to move, Space to drop.`}
                  title="Drag or press Space to reorder"
                  onPointerDown={(e) => handlePointerDown(e, key, slot)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
                  onLostPointerCapture={handlePointerEnd}
                  onKeyDown={(e) => handleKeyDown(e, key, slot)}
                  className={`drag-handle group w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#14141a] ${
                    isLifted
                      ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--brand-accent)] hover:bg-[var(--brand-surface)]/70'
                  }`}
                  data-active={isLifted ? 'true' : 'false'}
                >
                  <GripVertical
                    className="w-4 h-4 pointer-events-none"
                    aria-hidden="true"
                  />
                </button>

                {/* Slot Number Badge */}
                <span
                  className={`w-6 h-6 rounded-full font-mono text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                    isLifted
                      ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/40'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                  }`}
                  aria-hidden="true"
                >
                  {slot + 1}
                </span>

                {/* Song Title & Musical Metadata */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={songHref}
                      className="font-semibold text-sm sm:text-base text-[var(--text-primary)] hover:text-[var(--brand-accent)] truncate block transition-colors"
                      tabIndex={0}
                    >
                      {song.title}
                    </Link>
                    {isSongSavedOffline(song.id) && (
                      <span
                        title="Saved for offline use"
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0"
                      >
                        <Check className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>Offline</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-2 truncate mt-0.5">
                    <span>Orig: {song.originalKey}</span>
                    {preferredKey && (
                      <span className="font-mono font-semibold px-1.5 py-0.2 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/25">
                        Setlist: {preferredKey} (
                        {formatSignedSemitones(preferredSemis)})
                      </span>
                    )}
                    <span>· {song.language.label}</span>
                    {song.tempoBpm && <span>· {song.tempoBpm} BPM</span>}
                  </div>
                </div>
              </div>

              {/* Right Cluster: Remove / Delete Button */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onRemove(slot)}
                  aria-label={`Remove ${song.title} from ${setlistName}`}
                  title={`Remove ${song.title} from setlist`}
                  className="w-9 h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 inline-flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14141a]"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
