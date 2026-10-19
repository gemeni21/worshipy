'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, GripVertical, Trash2 } from 'lucide-react';
import {
  formatSignedSemitones,
  transposeKey,
} from '@/lib/music/transposition';
import {
  getVisualSlot,
  reorderArray,
  ROW_HEIGHT,
  ROW_GAP,
  STEP,
} from '@/lib/setlists/slotMath';
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

interface ManagedItem {
  key: string;
  raw: SetlistItem;
}

interface DragState {
  sourceSlot: number;
  targetSlot: number;
  isKeyboard: boolean;
}

// Synchronizes managed items with immutable, permanent keys across renders
let keyCounter = 0;
function createManagedKey(item: SetlistItem, idx: number): string {
  const base = item.addedAt ? `${item.songId}_${item.addedAt}` : `${item.songId}_${idx}`;
  return `wmc_drag_${base}_${++keyCounter}`;
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

  // Store managed items with immutable keys so elements are never unmounted during drag
  const [managedItems, setManagedItems] = useState<ManagedItem[]>(() =>
    items.map((item, idx) => ({
      key: createManagedKey(item, idx),
      raw: item,
    }))
  );

  // Active drag state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  // Active pointer drag tracking ref
  const activeDragRef = useRef<{
    pointerId: number;
    handleEl: HTMLElement;
    sourceSlot: number;
    grabOffset: number;
    rowEl: HTMLElement;
    containerTop: number;
    currentY: number;
    latestTarget: number;
  } | null>(null);

  // Sync managed items with incoming items prop when not actively dragging
  useEffect(() => {
    if (dragState) return;
    setManagedItems((prev) => {
      // Re-use existing keys for matching items to prevent DOM re-creation
      const usedKeys = new Set<string>();
      return items.map((item, idx) => {
        const existing = prev.find(
          (p) =>
            p.raw.songId === item.songId &&
            p.raw.addedAt === item.addedAt &&
            !usedKeys.has(p.key)
        );
        if (existing) {
          usedKeys.add(existing.key);
          return { key: existing.key, raw: item };
        }
        const newKey = createManagedKey(item, idx);
        usedKeys.add(newKey);
        return { key: newKey, raw: item };
      });
    });
  }, [items, dragState]);

  // Finalize drop and commit order
  const finalizeDrop = useCallback(
    (sourceSlot: number, finalTarget: number) => {
      const activeManaged = managedItems[sourceSlot];
      const song = activeManaged ? getSongByIdOrSlug(activeManaged.raw.songId) : null;
      const songTitle = song?.title ?? 'Song';

      setLiveAnnouncement(
        `Dropped ${songTitle} at position ${finalTarget + 1} of ${managedItems.length}.`
      );

      // Reorder managed items synchronously so visual state never flickers or snaps back
      const reordered = reorderArray(managedItems, sourceSlot, finalTarget);
      setManagedItems(reordered);
      setDragState(null);

      // Restore transition and target position on the dropped row element
      if (activeManaged) {
        const rowEl = rowRefs.current.get(activeManaged.key);
        if (rowEl) {
          rowEl.dataset.dragging = 'false';
          rowEl.dataset.keyboardLifted = 'false';
          rowEl.style.zIndex = '';
          rowEl.style.transition = '';
          rowEl.style.transform = `translateY(${finalTarget * STEP}px) scale(1)`;
        }
      }

      if (sourceSlot !== finalTarget) {
        const newItems = reordered.map((m) => m.raw);
        onReorder(newItems);
      }
    },
    [getSongByIdOrSlug, managedItems, onReorder]
  );

  // Handle pointer down on drag handle: 120Hz smooth tracking across entire list
  const handlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    managedIndex: number
  ) => {
    // Only primary mouse button or touch/pen
    if (e.button !== 0) return;

    const managedItem = managedItems[managedIndex];
    if (!managedItem) return;

    const rowEl = rowRefs.current.get(managedItem.key);
    const containerEl = listRef.current;
    if (!rowEl || !containerEl) return;

    const handleEl = e.currentTarget;
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const rowRect = rowEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const grabOffset = e.clientY - rowRect.top;
    const initialTranslateY = managedIndex * STEP;

    activeDragRef.current = {
      pointerId: e.pointerId,
      handleEl,
      sourceSlot: managedIndex,
      grabOffset,
      rowEl,
      containerTop: containerRect.top,
      currentY: initialTranslateY,
      latestTarget: managedIndex,
    };

    // Remove transition on dragged row for instantaneous, zero-latency cursor tracking
    rowEl.style.transition = 'none';
    rowEl.style.zIndex = '50';
    rowEl.style.transform = `translateY(${initialTranslateY}px) scale(1.04)`;

    setDragState({
      sourceSlot: managedIndex,
      targetSlot: managedIndex,
      isKeyboard: false,
    });

    const song = getSongByIdOrSlug(managedItem.raw.songId);
    setLiveAnnouncement(
      `Picked up ${song?.title ?? 'Song'}, position ${managedIndex + 1} of ${
        managedItems.length
      }. Drag to any position.`
    );

    // Window level listeners: allows dragging anywhere from top to bottom across any number of levels
    const onWindowPointerMove = (ev: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;

      const containerTop = listRef.current
        ? listRef.current.getBoundingClientRect().top
        : drag.containerTop;

      const pointerYInContainer = ev.clientY - containerTop;
      const rawY = pointerYInContainer - drag.grabOffset;
      const maxY = Math.max(0, (managedItems.length - 1) * STEP);
      const clampedY = Math.max(0, Math.min(rawY, maxY));

      drag.currentY = clampedY;

      // Direct GPU transform update on the dragged row element (120 FPS buttery smooth)
      if (drag.rowEl) {
        drag.rowEl.style.transform = `translateY(${clampedY}px) scale(1.04)`;
      }

      // Compute new target slot using Math.round(y / step)
      const newTarget = Math.max(
        0,
        Math.min(managedItems.length - 1, Math.round(clampedY / STEP))
      );

      if (newTarget !== drag.latestTarget) {
        drag.latestTarget = newTarget;
        setDragState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            targetSlot: newTarget,
          };
        });

        const currentSong = getSongByIdOrSlug(managedItem.raw.songId);
        setLiveAnnouncement(
          `${currentSong?.title ?? 'Song'}, position ${newTarget + 1} of ${
            managedItems.length
          }`
        );
      }
    };

    const onWindowPointerUp = (ev: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;

      cleanup();

      const finalTarget = drag.latestTarget;
      finalizeDrop(drag.sourceSlot, finalTarget);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
      if (activeDragRef.current?.handleEl) {
        try {
          if (activeDragRef.current.handleEl.hasPointerCapture(e.pointerId)) {
            activeDragRef.current.handleEl.releasePointerCapture(e.pointerId);
          }
        } catch {
          // ignore
        }
      }
      activeDragRef.current = null;
    };

    window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
  };

  // Keyboard navigation (Space to pick up, Up/Down to move, Space to drop, Esc to cancel)
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    slot: number
  ) => {
    const isCurrentActive =
      dragState !== null &&
      dragState.sourceSlot === slot &&
      dragState.isKeyboard;

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!isCurrentActive) {
        // Pick up
        setDragState({
          sourceSlot: slot,
          targetSlot: slot,
          isKeyboard: true,
        });

        const song = getSongByIdOrSlug(managedItems[slot]?.raw.songId);
        const songName = song?.title ?? 'Song';
        setLiveAnnouncement(
          `Picked up ${songName}, position ${slot + 1} of ${
            managedItems.length
          }. Use arrow keys to move, Space to drop, Escape to cancel.`
        );
      } else {
        // Drop
        finalizeDrop(dragState.sourceSlot, dragState.targetSlot);
      }
      return;
    }

    if (isCurrentActive) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (dragState.targetSlot > 0) {
          const newTarget = dragState.targetSlot - 1;
          setDragState({ ...dragState, targetSlot: newTarget });

          const song = getSongByIdOrSlug(managedItems[dragState.sourceSlot]?.raw.songId);
          const songName = song?.title ?? 'Song';
          setLiveAnnouncement(
            `${songName}, position ${newTarget + 1} of ${managedItems.length}`
          );
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (dragState.targetSlot < managedItems.length - 1) {
          const newTarget = dragState.targetSlot + 1;
          setDragState({ ...dragState, targetSlot: newTarget });

          const song = getSongByIdOrSlug(managedItems[dragState.sourceSlot]?.raw.songId);
          const songName = song?.title ?? 'Song';
          setLiveAnnouncement(
            `${songName}, position ${newTarget + 1} of ${managedItems.length}`
          );
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        // Cancel and revert
        const song = getSongByIdOrSlug(managedItems[dragState.sourceSlot]?.raw.songId);
        const songName = song?.title ?? 'Song';
        setLiveAnnouncement(
          `Reordering cancelled. ${songName} returned to position ${
            dragState.sourceSlot + 1
          } of ${managedItems.length}.`
        );
        finalizeDrop(dragState.sourceSlot, dragState.sourceSlot);
        return;
      }
    }
  };

  const containerHeight =
    managedItems.length > 0 ? managedItems.length * STEP - ROW_GAP : 0;

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
        drop freely to any position from top to bottom, or press Space to pick up,
        Up and Down arrows to move, and Space to drop.
      </p>

      {/* Relative container with fixed row height positioning */}
      <ol
        ref={listRef}
        aria-describedby={`sr-instructions-${listId}`}
        aria-label={`${setlistName} songs list`}
        className="drag-reorder-container relative w-full"
        style={{ height: `${containerHeight}px` }}
      >
        {managedItems.map((managed, idx) => {
          const item = managed.raw;
          const song = getSongByIdOrSlug(item.songId);
          const isBeingDragged =
            dragState !== null &&
            dragState.sourceSlot === idx &&
            !dragState.isKeyboard;
          const isKeyboardLifted =
            dragState !== null &&
            dragState.sourceSlot === idx &&
            dragState.isKeyboard;
          const isLifted = isBeingDragged || isKeyboardLifted;

          // Compute visual slot based on current sourceSlot and targetSlot
          const visualSlot =
            dragState !== null
              ? getVisualSlot(idx, dragState.sourceSlot, dragState.targetSlot)
              : idx;

          // TranslateY calculation:
          // If actively dragged by pointer, the element's DOM style is updated directly by onWindowPointerMove.
          // In React render fallback or keyboard lift, position at visualSlot * STEP.
          const defaultTranslateY = visualSlot * STEP;

          if (!song) {
            return (
              <li
                key={managed.key}
                ref={(el) => {
                  if (el) rowRefs.current.set(managed.key, el);
                  else rowRefs.current.delete(managed.key);
                }}
                data-dragging={isBeingDragged ? 'true' : 'false'}
                data-keyboard-lifted={isKeyboardLifted ? 'true' : 'false'}
                className="drag-reorder-card absolute inset-x-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-2.5 flex items-center justify-between text-xs text-[var(--text-secondary)]"
                style={{
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${defaultTranslateY}px) ${
                    isLifted ? 'scale(1.04)' : 'scale(1)'
                  }`,
                  zIndex: isLifted ? 50 : 1,
                }}
              >
                <span>Unavailable song record ({item.songId})</span>
                <button
                  type="button"
                  onClick={() => onRemove(visualSlot)}
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
              key={managed.key}
              ref={(el) => {
                if (el) rowRefs.current.set(managed.key, el);
                else rowRefs.current.delete(managed.key);
              }}
              data-dragging={isBeingDragged ? 'true' : 'false'}
              data-keyboard-lifted={isKeyboardLifted ? 'true' : 'false'}
              className={`drag-reorder-card absolute inset-x-0 rounded-xl border flex items-center justify-between gap-3 px-3.5 py-2.5 box-border select-none ${
                isLifted
                  ? 'border-[var(--brand-accent)]/80 bg-[var(--bg-card)] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.7),0_10px_10px_-5px_rgba(0,0,0,0.5)] ring-2 ring-[var(--brand-accent)]/40'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
              }`}
              style={{
                height: `${ROW_HEIGHT}px`,
                // Don't overwrite active pointer drag transform during live pointer movements
                transform: isBeingDragged
                  ? undefined
                  : `translateY(${defaultTranslateY}px) ${
                      isLifted ? 'scale(1.04)' : 'scale(1)'
                    }`,
                zIndex: isLifted ? 50 : 1,
              }}
            >
              {/* Left Cluster: Dedicated Drag Handle + Dynamic Slot Badge + Song Details */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                {/* Dedicated Drag & Keyboard Grip Handle */}
                <button
                  type="button"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isLifted}
                  aria-roledescription="sortable song item"
                  aria-label={`Reorder ${song.title}. Position ${
                    visualSlot + 1
                  } of ${
                    managedItems.length
                  }. Press Space to pick up, Up and Down arrow keys to move, Space to drop.`}
                  title="Drag or press Space to reorder"
                  onPointerDown={(e) => handlePointerDown(e, idx)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  className={`drag-handle group w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)] ${
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

                {/* Slot Number Badge - dynamically reflects current visual position */}
                <span
                  className={`w-6 h-6 rounded-full font-mono text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                    isLifted
                      ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/40'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                  }`}
                  aria-hidden="true"
                >
                  {visualSlot + 1}
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
                  onClick={() => onRemove(idx)}
                  aria-label={`Remove ${song.title} from ${setlistName}`}
                  title={`Remove ${song.title} from setlist`}
                  className="w-9 h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 inline-flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]"
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
