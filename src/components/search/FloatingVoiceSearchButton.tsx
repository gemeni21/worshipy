'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Mic } from 'lucide-react';
import { useIsMounted } from '@/hooks/useIsMounted';
import { VoiceSearchModal } from './VoiceSearchModal';

export function FloatingVoiceSearchButton() {
  const [isOpen, setIsOpen] = useState(false);
  const mounted = useIsMounted();
  const [isPerformanceModeActive, setIsPerformanceModeActive] = useState(false);
  const pathname = usePathname();

  // Watch for performance mode class on document body/element to avoid obstructing chord charts
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const checkPerformanceMode = () => {
      const isPerf =
        document.body.classList.contains('performance-mode') ||
        document.documentElement.classList.contains('performance-mode') ||
        !!document.querySelector('[data-performance-mode="true"]');
      setIsPerformanceModeActive(isPerf);
    };

    checkPerformanceMode();
    const observer = new MutationObserver(checkPerformanceMode);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  // Only hide in full-screen performance mode view
  if (!mounted || isPerformanceModeActive) {
    return null;
  }

  return createPortal(
    <>
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 no-print pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Voice search songs by microphone"
          title="Search songs with voice (say title or artist)"
          className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-[#14141a]/95 backdrop-blur-md border border-[var(--brand-accent)]/45 text-[var(--brand-accent)] shadow-xl shadow-black/80 hover:border-[var(--brand-accent)] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-4 focus:ring-[var(--brand-accent)]/20"
        >
          {/* Subtle chartreuse neon aura on hover */}
          <span
            className="absolute -inset-1 rounded-full bg-[var(--brand-accent)]/20 opacity-0 group-hover:opacity-100 transition-opacity blur-md pointer-events-none"
            aria-hidden="true"
          />

          <Mic className="w-6 h-6 shrink-0 relative z-10 transition-transform group-hover:scale-110" aria-hidden="true" />

          {/* Floating Pill Tooltip on hover for desktop */}
          <span className="hidden md:inline-block pointer-events-none absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#14141a] border border-[#262533] text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg backdrop-blur-sm">
            Voice Search
          </span>
        </button>
      </div>

      <VoiceSearchModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>,
    document.body
  );
}

