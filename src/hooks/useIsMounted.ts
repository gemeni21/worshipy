'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns true if the component has mounted on the client, false during SSR / initial hydration.
 * Uses useSyncExternalStore to prevent cascading renders and hydration mismatches.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
