'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Download,
  FolderHeart,
  Gauge,
  Heart,
  Home,
  ListMusic,
  MoreHorizontal,
  Music2,
  Radio,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { FloatingVoiceSearchButton } from '@/components/search/FloatingVoiceSearchButton';
import { ThemeCardTiltEffect } from '@/components/theme/ThemeCardTiltEffect';

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
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isMoreActive =
    isActive('/my-songs') ||
    isActive('/favorites') ||
    isActive('/settings') ||
    (pathname === '/songs' && typeof window !== 'undefined' && window.location.search.includes('offline=1'));

  const PRIMARY_NAV = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/songs', label: 'Songs', icon: BookOpen },
    { href: '/tuner', label: 'Tuner', icon: Gauge },
    { href: '/live', label: 'Live', icon: Radio },
    { href: '/setlists', label: 'Setlists', icon: ListMusic },
  ] as const;

  const MORE_ITEMS = [
    {
      href: '/my-songs',
      label: 'My Songs & Editor',
      sublabel: 'Custom charts & ChordPro',
      icon: FolderHeart,
      active: isActive('/my-songs'),
    },
    {
      href: '/favorites',
      label: 'Favorite Songs',
      sublabel: 'Quick access collection',
      icon: Heart,
      active: isActive('/favorites'),
    },
    {
      href: '/songs?offline=1',
      label: 'Offline Saved',
      sublabel: 'Available without internet',
      icon: Download,
      active: pathname === '/songs',
    },
    {
      href: '/settings',
      label: 'Settings & Themes',
      sublabel: 'Accent colors, fonts & storage',
      icon: Settings,
      active: isActive('/settings'),
    },
  ];

  return (
    <>
      {/* Dimmed backdrop when More popover is open */}
      {isMoreOpen && (
        <div
          role="presentation"
          onClick={() => setIsMoreOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        />
      )}

      {/* Floating "More" Quick Sheet */}
      {isMoreOpen && (
        <div
          role="dialog"
          aria-label="Additional Navigation Options"
          className="md:hidden fixed bottom-20 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-40 bg-[var(--bg-surface)]/95 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-3xl p-3 shadow-2xl space-y-1 animate-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Library & Settings
            </span>
            <button
              type="button"
              onClick={() => setIsMoreOpen(false)}
              className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            {MORE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMoreOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl transition-all cursor-pointer ${
                  item.active
                    ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] font-semibold ring-1 ring-[var(--brand-accent)]/30'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{item.label}</div>
                  <div className="text-xs text-[var(--text-secondary)] truncate">
                    {item.sublabel}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Floating Native-Feeling Bottom Nav Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-30 bg-[var(--bg-surface)]/85 dark:bg-[var(--bg-surface)]/90 backdrop-blur-2xl border border-white/25 dark:border-white/10 shadow-[0_12px_36px_-6px_rgba(0,0,0,0.3)] rounded-2xl p-1.5 flex items-center justify-around gap-1"
      >
        {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl transition-all duration-200 cursor-pointer min-w-[3.5rem] ${
                active
                  ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] font-bold ring-1 ring-[var(--brand-accent)]/25 shadow-xs scale-102'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]/50 active:scale-95'
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform duration-200 ${
                  active ? 'scale-110 text-[var(--brand-accent)]' : ''
                }`}
                aria-hidden="true"
              />
              <span className="text-[0.6875rem] leading-tight mt-0.5 font-medium tracking-tight">
                {label}
              </span>

              {/* Glowing active indicator dot */}
              {active && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--brand-accent)] shadow-[0_0_8px_var(--brand-accent)] mt-0.5 animate-pulse"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}

        {/* 6th "More" tab button */}
        <button
          type="button"
          onClick={() => setIsMoreOpen((prev) => !prev)}
          aria-expanded={isMoreOpen}
          aria-label="More navigation destinations"
          className={`relative flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl transition-all duration-200 cursor-pointer min-w-[3.5rem] ${
            isMoreActive || isMoreOpen
              ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] font-bold ring-1 ring-[var(--brand-accent)]/25 shadow-xs scale-102'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]/50 active:scale-95'
          }`}
        >
          <MoreHorizontal
            className={`w-5 h-5 transition-transform duration-200 ${
              isMoreActive || isMoreOpen ? 'scale-110 text-[var(--brand-accent)]' : ''
            }`}
            aria-hidden="true"
          />
          <span className="text-[0.6875rem] leading-tight mt-0.5 font-medium tracking-tight">
            More
          </span>

          {(isMoreActive || isMoreOpen) && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--brand-accent)] shadow-[0_0_8px_var(--brand-accent)] mt-0.5 animate-pulse"
              aria-hidden="true"
            />
          )}
        </button>
      </nav>
    </>
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
          <div className="w-9 h-9 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shrink-0 shadow-sm">
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
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shadow-sm">
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
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen pb-24 md:pb-8">
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

      {/* Global 3D Card Tilt & Interactive Mouse Glow Controller */}
      <ThemeCardTiltEffect />
    </div>
  );
}
