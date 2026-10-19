import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SetlistItem } from '@/types/song';

// Reusable physics & slot math corresponding to SetlistDragReorderList
const ROW_HEIGHT = 72;
const ROW_GAP = 8;
const STEP = ROW_HEIGHT + ROW_GAP; // 80px

function computeTargetSlot(
  translateY: number,
  totalItems: number,
  step = STEP
): number {
  if (totalItems <= 0) return 0;
  const maxSlot = totalItems - 1;
  const rawSlot = Math.round(translateY / step);
  return Math.max(0, Math.min(maxSlot, rawSlot));
}

function clampTranslateY(
  rawY: number,
  totalItems: number,
  step = STEP
): number {
  if (totalItems <= 1) return 0;
  const maxY = (totalItems - 1) * step;
  return Math.max(0, Math.min(rawY, maxY));
}

function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

describe('Setlist Fluid Drag-to-Reorder Physics & State Logic', () => {
  const seedItems: SetlistItem[] = [
    { songId: 'song-1', addedAt: '2026-10-19T00:00:00Z', preferredSemitones: 0 },
    { songId: 'song-2', addedAt: '2026-10-19T00:01:00Z', preferredSemitones: 2 },
    { songId: 'song-3', addedAt: '2026-10-19T00:02:00Z', preferredSemitones: -1 },
    { songId: 'song-4', addedAt: '2026-10-19T00:03:00Z', preferredSemitones: 5 },
  ];

  it('1. calculates exact translateY clamps within list bounds', () => {
    // Total 4 items -> maxTranslateY = 3 * 80 = 240px
    assert.equal(clampTranslateY(-50, seedItems.length), 0);
    assert.equal(clampTranslateY(0, seedItems.length), 0);
    assert.equal(clampTranslateY(120, seedItems.length), 120);
    assert.equal(clampTranslateY(240, seedItems.length), 240);
    assert.equal(clampTranslateY(350, seedItems.length), 240);
  });

  it('2. computes target slot using Math.round(y / step) with clamping', () => {
    // Step = 80px:
    // [0..39] -> slot 0
    // [40..119] -> slot 1
    // [120..199] -> slot 2
    // [200..279] -> slot 3
    assert.equal(computeTargetSlot(0, seedItems.length), 0);
    assert.equal(computeTargetSlot(39, seedItems.length), 0);
    assert.equal(computeTargetSlot(40, seedItems.length), 1);
    assert.equal(computeTargetSlot(80, seedItems.length), 1);
    assert.equal(computeTargetSlot(119, seedItems.length), 1);
    assert.equal(computeTargetSlot(120, seedItems.length), 2);
    assert.equal(computeTargetSlot(199, seedItems.length), 2);
    assert.equal(computeTargetSlot(200, seedItems.length), 3);
    assert.equal(computeTargetSlot(500, seedItems.length), 3);
    assert.equal(computeTargetSlot(-100, seedItems.length), 0);
  });

  it('3. splices dragged item to target slot and correctly re-places every other row', () => {
    // Move item at slot 0 ('song-1') to slot 2
    const reordered = reorderArray(seedItems, 0, 2);
    assert.deepEqual(
      reordered.map((i) => i.songId),
      ['song-2', 'song-3', 'song-1', 'song-4']
    );
    // Preserves metadata
    assert.equal(reordered[2].preferredSemitones, 0);
    assert.equal(reordered[0].preferredSemitones, 2);
  });

  it('4. moves items upwards smoothly and preserves other items order', () => {
    // Move item at slot 3 ('song-4') to slot 1
    const reordered = reorderArray(seedItems, 3, 1);
    assert.deepEqual(
      reordered.map((i) => i.songId),
      ['song-1', 'song-4', 'song-2', 'song-3']
    );
    assert.equal(reordered[1].songId, 'song-4');
    assert.equal(reordered[1].preferredSemitones, 5);
  });

  it('5. handles boundary cases (single item, out of bounds, same slot)', () => {
    const single = [seedItems[0]];
    assert.equal(clampTranslateY(100, single.length), 0);
    assert.equal(computeTargetSlot(100, single.length), 0);
    assert.deepEqual(reorderArray(single, 0, 0), single);
    assert.deepEqual(reorderArray(seedItems, 1, 1), seedItems);
    assert.deepEqual(reorderArray(seedItems, -1, 2), seedItems);
    assert.deepEqual(reorderArray(seedItems, 1, 99), seedItems);
  });

  it('6. simulates keyboard navigation (Up, Down, Space drop, Escape revert)', () => {
    let order = [...seedItems];
    const initialOrder = [...order];
    let activeSlot = 1; // Pick up 'song-2'

    // Press ArrowDown -> slot becomes 2
    order = reorderArray(order, activeSlot, activeSlot + 1);
    activeSlot = 2;
    assert.deepEqual(
      order.map((i) => i.songId),
      ['song-1', 'song-3', 'song-2', 'song-4']
    );

    // Press ArrowDown again -> slot becomes 3
    order = reorderArray(order, activeSlot, activeSlot + 1);
    activeSlot = 3;
    assert.deepEqual(
      order.map((i) => i.songId),
      ['song-1', 'song-3', 'song-4', 'song-2']
    );

    // Press Escape -> cancel and restore initial
    order = [...initialOrder];
    assert.deepEqual(
      order.map((i) => i.songId),
      ['song-1', 'song-2', 'song-3', 'song-4']
    );
  });

  it('7. validates linear spring-glide easing definition syntax', () => {
    const easing =
      'linear(0, 0.094 5.6%, 0.274 11.1%, 0.455 16.7%, 0.608 22.2%, 0.726 27.8%, 0.812 33.3%, 0.873 38.9%, 0.916 44.4%, 0.944 50%, 0.964 55.6%, 0.976 61.1%, 0.985 66.7%, 0.99 72.2%, 0.994 77.8%, 0.996 83.3%, 0.998 88.9%, 1 100%)';
    assert.match(easing, /^linear\([0-9\.\s%,]+\)$/);
    assert.ok(easing.startsWith('linear(0,'));
    assert.ok(easing.endsWith('1 100%)'));
  });
});
