/**
 * Pure physics & geometry slot math for fluid drag-to-reorder lists.
 * Separated from React JSX for 100% portable node test execution.
 */

export const ROW_HEIGHT = 72; // px
export const ROW_GAP = 8; // px
export const STEP = ROW_HEIGHT + ROW_GAP; // 80px

/**
 * Computes visual slot of any item given the current source and target slots.
 * This guarantees zero DOM unmounts/remounts during multi-level continuous drags.
 */
export function getVisualSlot(
  originalIndex: number,
  sourceSlot: number,
  targetSlot: number
): number {
  if (originalIndex === sourceSlot) return targetSlot;
  if (sourceSlot < targetSlot) {
    if (originalIndex > sourceSlot && originalIndex <= targetSlot) {
      return originalIndex - 1;
    }
  } else if (sourceSlot > targetSlot) {
    if (originalIndex >= targetSlot && originalIndex < sourceSlot) {
      return originalIndex + 1;
    }
  }
  return originalIndex;
}

export function computeTargetSlot(
  translateY: number,
  totalItems: number,
  step = STEP
): number {
  if (totalItems <= 0) return 0;
  const maxSlot = totalItems - 1;
  const rawSlot = Math.round(translateY / step);
  return Math.max(0, Math.min(maxSlot, rawSlot));
}

export function clampTranslateY(
  rawY: number,
  totalItems: number,
  step = STEP
): number {
  if (totalItems <= 1) return 0;
  const maxY = (totalItems - 1) * step;
  return Math.max(0, Math.min(rawY, maxY));
}

export function reorderArray<T>(
  items: T[],
  fromIndex: number,
  toIndex: number
): T[] {
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
