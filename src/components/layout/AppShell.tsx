'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  FolderHeart,
  Gauge,
  Heart,
  Home,
  ListMusic,
  Music2,
  Radio,
  Settings,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { FloatingVoiceSearchButton } from '@/components/search/FloatingVoiceSearchButton';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/songs', label: 'Songs', icon: BookOpen },
  { href: '/my-songs', label: 'My Songs', icon: FolderHeart },
  { href: '/tuner', label: 'Tuner', icon: Gauge },
  { href: '/live', label: 'Live Sync', icon: Radio },
  { href: '/favorites', label: 'Favorites', icon: Heart },
  { href: '/setlists', label: 'My Setlists', icon: ListMusic },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

function DesktopNavLinksContent({ pathname }: { pathname: string | null }) {
  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function DesktopNavLinksActive() {
  const pathname = usePathname();
  return <DesktopNavLinksContent pathname={pathname} />;
}

function MobileNavLinksContent({ pathname }: { pathname: string | null }) {
  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] grid grid-cols-8 overflow-x-auto"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-2 px-0.5 text-[0.625rem] font-medium transition-colors min-h-[3.5rem] ${
              active
                ? 'text-[var(--brand-accent)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon className="w-4 h-4 mb-0.5" aria-hidden="true" />
            <span className="truncate max-w-full">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNavLinksActive() {
  const pathname = usePathname();
  return <MobileNavLinksContent pathname={pathname} />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    effectiveOffline,
    simulateOffline,
    setSimulateOffline,
    offlineEntries,
    customSongs,
  } = useApp();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Desktop Sidebar Navigation (hidden on mobile so destinations are not duplicated) */}
      <aside
        aria-label="Primary Sidebar Navigation"
        className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] z-30"
      >
        <div className="px-5 py-5 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--brand-accent)] text-[var(--bg-surface)] flex items-center justify-center shrink-0">
            <Music2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-base block leading-tight">
              Worship Music
            </span>
            <span className="text-xs text-[var(--text-secondary)] block">
              Companion · MVP
            </span>
          </div>
        </div>

        <Suspense fallback={<DesktopNavLinksContent pathname={null} />}>
          <DesktopNavLinksActive />
        </Suspense>

        <div className="p-4 m-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] space-y-1.5">
          <div className="font-semibold text-[var(--text-primary)] flex items-center justify-between gap-1">
            <span>Device-Local MVP</span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)] text-[0.6875rem] font-semibold">
              {customSongs.length} Custom · {offlineEntries.length} Offline
            </span>
          </div>
          <p className="leading-relaxed">
            My Songs, favorites, setlists, and saved charts are stored on this device only.
          </p>
        </div>
      </aside>

      {/* Mobile Compact Header */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-accent)] text-[var(--bg-surface)] flex items-center justify-center">
            <Music2 className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-bold text-sm tracking-tight">
            Worship Music Companion
          </span>
        </Link>
        <span className="text-[0.6875rem] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
          v1.0
        </span>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen pb-20 md:pb-8">
        {effectiveOffline && (
          <div
            role="status"
            aria-live="polite"
            className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-medium">
              <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {simulateOffline
                  ? 'Offline Simulation Active — Testing offline mode.'
                  : 'You are currently offline.'}{' '}
                Saved offline songs ({offlineEntries.length}) remain accessible.
              </span>
            </div>
            {simulateOffline && (
              <button
                type="button"
                onClick={() => setSimulateOffline(false)}
                className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer"
              >
                Exit Offline Simulation
              </button>
            )}
          </div>
        )}

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <Suspense fallback={<MobileNavLinksContent pathname={null} />}>
        <MobileNavLinksActive />
      </Suspense>

      {/* Global Floating Voice Search Button */}
      <FloatingVoiceSearchButton />
    </div>
  );
}
