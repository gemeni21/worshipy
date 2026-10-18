'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Mic } from 'lucide-react';
import { VoiceSearchModal } from './VoiceSearchModal';

export function FloatingVoiceSearchButton() {
  const [isOpen, setIsOpen] = useState(false);
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
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [pathname]);

  // If performance mode is active or on tuner page (which uses mic), hide floating mic
  if (isPerformanceModeActive || pathname === '/tuner') {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 no-print">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Voice search songs by microphone"
          title="Search songs with voice (say title or artist)"
          className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-[var(--brand-accent)] to-teal-500 text-white shadow-[0_10px_25px_-5px_rgba(15,118,110,0.5)] hover:shadow-[0_15px_30px_-5px_rgba(15,118,110,0.6)] hover:scale-108 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-4 focus:ring-[var(--brand-accent)]/30 border border-white/20"
        >
          {/* Subtle multi-color iridescent aura on hover */}
          <span
            className="absolute -inset-1 rounded-full bg-gradient-to-tr from-cyan-400 via-emerald-400 to-pink-400 opacity-0 group-hover:opacity-40 transition-opacity blur-md pointer-events-none"
            aria-hidden="true"
          />

          <Mic className="w-6 h-6 shrink-0 relative z-10 transition-transform group-hover:scale-110" aria-hidden="true" />

          {/* Floating Pill Tooltip on hover for desktop */}
          <span className="hidden sm:inline-block pointer-events-none absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-stone-900/90 text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg backdrop-blur-xs">
            Voice Search
          </span>
        </button>
      </div>

      <VoiceSearchModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
