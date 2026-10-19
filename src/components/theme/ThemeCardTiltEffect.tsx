'use client';

import { useEffect } from 'react';

/**
 * Global interactive 3D tilt, mouse-following gradient spotlight,
 * and bottom-right corner glow intensification controller for .theme-card elements.
 */
export function ThemeCardTiltEffect() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Skip on touch-only mobile screens or when reduced motion is preferred
    const isTouchOnly = window.matchMedia(
      '(pointer: coarse) and not (pointer: fine)'
    ).matches;
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (isTouchOnly || prefersReducedMotion) return;

    let currentCard: HTMLElement | null = null;
    let rafId: number | null = null;
    let pendingEvent: MouseEvent | PointerEvent | null = null;

    const resetCard = (card: HTMLElement) => {
      card.removeAttribute('data-card-hovered');
      card.style.removeProperty('--tilt-x');
      card.style.removeProperty('--tilt-y');
      card.style.removeProperty('--corner-proximity');
      card.style.removeProperty('--mouse-x');
      card.style.removeProperty('--mouse-y');
      card.style.removeProperty('--mouse-rx');
      card.style.removeProperty('--mouse-ry');
    };

    const updateCard = () => {
      if (!currentCard || !pendingEvent) {
        rafId = null;
        return;
      }

      const card = currentCard;
      const e = pendingEvent;
      const rect = card.getBoundingClientRect();

      // Clamp mouse coordinates inside card
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

      const rx = rect.width > 0 ? x / rect.width : 0.5;
      const ry = rect.height > 0 ? y / rect.height : 0.5;

      // Barely perceptible, micro-subtle 3D Tilt calculation (max ±0.8 degrees)
      const maxTilt = 0.8;
      const tiltX = (0.5 - ry) * (maxTilt * 2); // Tilt forward when near top, backward when near bottom
      const tiltY = (rx - 0.5) * (maxTilt * 2); // Tilt right when near right, left when near left

      // Proximity to bottom-right corner (1, 1)
      const distToBR = Math.hypot(1 - rx, 1 - ry);
      const normDist = Math.min(1, distToBR / Math.SQRT2);
      // Non-linear power curve: accelerates as cursor moves towards the very bottom-right
      const proximity = Math.max(0, Math.min(1, Math.pow(1 - normDist, 1.4)));

      card.style.setProperty('--mouse-x', `${x.toFixed(1)}px`);
      card.style.setProperty('--mouse-y', `${y.toFixed(1)}px`);
      card.style.setProperty('--mouse-rx', `${(rx * 100).toFixed(1)}%`);
      card.style.setProperty('--mouse-ry', `${(ry * 100).toFixed(1)}%`);
      card.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
      card.style.setProperty('--corner-proximity', proximity.toFixed(3));

      if (card.getAttribute('data-card-hovered') !== 'true') {
        card.setAttribute('data-card-hovered', 'true');
      }

      rafId = null;
    };

    const handlePointerMove = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const card = target?.closest<HTMLElement>('.theme-card');

      // If card is being dragged in setlist reorder, skip tilt
      if (card?.getAttribute('data-dragging') === 'true') {
        if (currentCard) {
          resetCard(currentCard);
          currentCard = null;
        }
        return;
      }

      if (card !== currentCard) {
        if (currentCard) {
          resetCard(currentCard);
        }
        currentCard = card || null;
      }

      if (currentCard) {
        pendingEvent = e;
        if (rafId === null) {
          rafId = requestAnimationFrame(updateCard);
        }
      }
    };

    const handlePointerLeave = () => {
      if (currentCard) {
        resetCard(currentCard);
        currentCard = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pendingEvent = null;
    };

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    window.addEventListener('mousemove', handlePointerMove, {
      passive: true,
    });
    document.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);

    return () => {
      if (currentCard) {
        resetCard(currentCard);
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
    };
  }, []);

  return null;
}
