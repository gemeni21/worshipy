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
  Mic,
  MoreHorizontal,
  Music2,
  Radio,
  Settings,
  ShieldCheck,
  Square,
  Users,
  LogIn,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { UserProfileDrawer } from '@/components/auth/UserProfileDrawer';
import { FloatingVoiceSearchButton } from '@/components/search/FloatingVoiceSearchButton';
import { ThemeCardTiltEffect } from '@/components/theme/ThemeCardTiltEffect';
import { apiUrl } from '@/lib/api/apiClient';
import { clearTeamActiveLiveSession, getSessionToken } from '@/lib/team/teamService';
import { SESSION_CREDENTIALS_STORAGE_KEY } from '@/types/live';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/songs', label: 'Songs', icon: BookOpen },
  { href: '/my-songs', label: 'My Songs', icon: FolderHeart },
  { href: '/team', label: 'Worship Team', icon: Users },
  { href: '/practice', label: 'Practice Takes', icon: Mic },
  { href: '/tuner', label: 'Tuner', icon: Gauge },
  { href: '/live', label: 'Live Sync', icon: Radio },
  { href: '/favorites', label: 'Favorites', icon: Heart },
  { href: '/setlists', label: 'My Setlists', icon: ListMusic },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

function DesktopNavLinksContent({ pathname }: { pathname: string | null }) {
  const { isAdmin, pendingApprovalsCount, activeGroup, onlineMembersCount } = useAuth();
  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        const displayLabel = href === '/team' && activeGroup?.name ? activeGroup.name : label;
        const isTeam = href === '/team';

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{displayLabel}</span>
            </div>

            {isTeam && activeGroup && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{onlineMembersCount > 0 ? `${onlineMembersCount} online` : 'Team'}</span>
              </span>
            )}

            {href === '/live' && activeGroup?.activeLiveSessionId && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-black shadow-xs shrink-0 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-black" />
                <span>LIVE</span>
              </span>
            )}
          </Link>
        );
      })}

      {isAdmin && (
        <Link
          href="/admin"
          aria-current={isActive('/admin') ? 'page' : undefined}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isActive('/admin')
              ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
              : 'text-amber-400 hover:bg-amber-500/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Admin Curation</span>
          </div>
          {pendingApprovalsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-400 text-black">
              {pendingApprovalsCount}
            </span>
          )}
        </Link>
      )}
    </nav>
  );
}

function DesktopNavLinksActive() {
  const pathname = usePathname();
  return <DesktopNavLinksContent pathname={pathname} />;
}

function MobileNavLinksContent({ pathname }: { pathname: string | null }) {
  const { activeGroup, onlineMembersCount } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMoreOpen(false);
  }

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isMoreActive =
    isActive('/team') ||
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
      href: '/team',
      label: activeGroup?.name || 'Worship Team',
      sublabel: onlineMembersCount > 0 ? `${onlineMembersCount} members online now` : 'Band roster & shared practice',
      icon: Users,
      active: isActive('/team'),
    },
    {
      href: '/practice',
      label: 'Practice Takes',
      sublabel: 'Audio recordings & review',
      icon: Mic,
      active: isActive('/practice'),
    },
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

              {/* If team leader is currently live on stage */}
              {href === '/live' && activeGroup?.activeLiveSessionId && !active && (
                <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}

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
  const { user, activeGroup, refreshActiveGroup } = useAuth();
  const pathname = usePathname();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [isEndingLiveSession, setIsEndingLiveSession] = useState(false);
  const [hasStoredLeaderCredentials, setHasStoredLeaderCredentials] = useState(false);

  // Check if current user or browser device holds leader credentials for the active live session
  useEffect(() => {
    if (!activeGroup?.activeLiveSessionId) {
      setHasStoredLeaderCredentials(false);
      return;
    }
    try {
      const raw =
        window.sessionStorage.getItem(SESSION_CREDENTIALS_STORAGE_KEY) ||
        window.localStorage.getItem(SESSION_CREDENTIALS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.sessionId === activeGroup.activeLiveSessionId && parsed.participantToken) {
          setHasStoredLeaderCredentials(true);
          return;
        }
      }
    } catch {}
    setHasStoredLeaderCredentials(false);
  }, [activeGroup?.activeLiveSessionId]);

  const isLeaderOfLiveSession = Boolean(
    activeGroup?.activeLiveSessionId &&
    (hasStoredLeaderCredentials ||
      (user &&
        (user.id === activeGroup.ownerId ||
          user.groupRole === 'leader' ||
          (activeGroup.activeLiveSessionLeaderName &&
            user.displayName &&
            activeGroup.activeLiveSessionLeaderName.toLowerCase() === user.displayName.toLowerCase()))))
  );

  const handleEndLiveSessionFromBanner = async () => {
    if (!activeGroup?.activeLiveSessionId) return;
    if (
      !window.confirm(
        'End this live worship session for all connected team members? Personal setlists and favorites will not be affected.'
      )
    ) {
      return;
    }

    setIsEndingLiveSession(true);
    const targetSessionId = activeGroup.activeLiveSessionId;
    const targetGroupId = activeGroup.id;

    try {
      let token = '';
      try {
        const raw =
          window.sessionStorage.getItem(SESSION_CREDENTIALS_STORAGE_KEY) ||
          window.localStorage.getItem(SESSION_CREDENTIALS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.sessionId === targetSessionId && parsed.participantToken) {
            token = parsed.participantToken;
          }
        }
      } catch {}

      const userToken = getSessionToken();
      const effectiveAuth = token ? `Bearer ${token}` : userToken ? `Bearer ${userToken}` : '';

      // 1. Terminate live session on server
      await fetch(apiUrl(`/api/live/sessions/${encodeURIComponent(targetSessionId)}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveAuth ? { Authorization: effectiveAuth } : {}),
        },
        body: JSON.stringify({ action: 'end-session' }),
      }).catch(() => {});

      // 2. Clear team active live session in Firestore and server database
      if (targetGroupId) {
        await clearTeamActiveLiveSession(targetGroupId).catch(() => {});
      }

      // 3. Clear local stored session credentials
      try {
        window.sessionStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
        window.localStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
      } catch {}

      // 4. Force real-time group state update
      await refreshActiveGroup().catch(() => {});
    } catch (err) {
      console.warn('Error ending live session from banner:', err);
    } finally {
      setIsEndingLiveSession(false);
    }
  };

  const brandingTitle =
    activeGroup?.customAppTitle ||
    activeGroup?.churchName ||
    activeGroup?.name ||
    'Worship Music';

  const brandingSubtitle = activeGroup?.customAppTitle
    ? (activeGroup.churchName || activeGroup.name || 'Worship Team')
    : activeGroup
    ? (activeGroup.churchName || 'Worship Team')
    : 'Companion · MVP';

  const brandingLogo = activeGroup?.customAppLogoUrl;

  const {
    effectiveOffline,
    simulateOffline,
    setSimulateOffline,
    offlineEntries,
  } = useApp();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Desktop Sidebar Navigation (hidden on mobile so destinations are not duplicated) */}
      <aside
        aria-label="Primary Sidebar Navigation"
        className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] z-30"
      >
        <Link
          href="/"
          className="px-4 py-4 border-b border-[var(--border-subtle)] flex items-center gap-3 hover:bg-[var(--bg-subtle)]/50 transition-colors group cursor-pointer"
        >
          {brandingLogo ? (
            <img
              src={brandingLogo}
              alt={brandingTitle}
              className="w-10 h-10 rounded-xl object-contain bg-white/5 border border-[var(--border-subtle)] p-1 shrink-0 shadow-sm"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shrink-0 shadow-sm">
              <Music2 className="w-5 h-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="font-bold tracking-tight text-base block leading-tight truncate group-hover:text-[var(--brand-accent)] transition-colors">
              {brandingTitle}
            </span>
            <span className="text-xs text-[var(--text-secondary)] block truncate">
              {brandingSubtitle}
            </span>
          </div>
        </Link>

        <Suspense fallback={<DesktopNavLinksContent pathname={null} />}>
          <DesktopNavLinksActive />
        </Suspense>

        {/* User Account / Profile Card */}
        <div className="p-3 m-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
          {user ? (
            <button
              type="button"
              onClick={() => setShowProfileDrawer(true)}
              className="w-full flex items-center justify-between text-left p-2 rounded-xl hover:bg-[var(--bg-hover)] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[var(--brand-accent)]/20 text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center font-bold text-xs shrink-0">
                  {user.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--brand-accent)] transition-colors">
                    {user.displayName}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] truncate">
                    {user.role === 'admin' ? 'Curator (Admin)' : user.instrument || 'Musician'}
                  </div>
                </div>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Connected to Cloud" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:border-[var(--brand-accent)] text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In / Profile</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Compact Header */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
        <Link href="/" className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
          {brandingLogo ? (
            <img
              src={brandingLogo}
              alt={brandingTitle}
              className="w-8 h-8 rounded-lg object-contain bg-white/5 border border-[var(--border-subtle)] p-0.5 shrink-0 shadow-sm"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shrink-0 shadow-sm">
              <Music2 className="w-4 h-4" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="font-bold text-sm tracking-tight block truncate">
              {brandingTitle}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)] block -mt-0.5 truncate">
              {brandingSubtitle}
            </span>
          </div>
        </Link>
        {user ? (
          <button
            type="button"
            onClick={() => setShowProfileDrawer(true)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
          >
            <div className="w-5 h-5 rounded-md bg-[var(--brand-accent)]/20 text-[var(--brand-accent)] font-bold text-[10px] flex items-center justify-center">
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            <span className="truncate max-w-[80px]">{user.displayName.split(' ')[0]}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="px-2.5 py-1 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 text-xs font-bold cursor-pointer"
          >
            Sign In
          </button>
        )}
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

        {activeGroup?.activeLiveSessionId && pathname !== '/live' && (
          <div
            role="status"
            className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2.5 text-sm flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shadow-xs animate-in fade-in"
          >
            <div className="flex items-center gap-2.5 text-emerald-400 font-semibold min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <Radio className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="truncate text-xs sm:text-sm">
                Live Sync Active: <strong>{activeGroup.activeLiveSessionLeaderName || 'Leader'}</strong> is live in {activeGroup.name}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/live"
                className="py-1 px-3 rounded-lg bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>Return to Stage</span>
                <span>→</span>
              </Link>

              {isLeaderOfLiveSession && (
                <button
                  type="button"
                  onClick={handleEndLiveSessionFromBanner}
                  disabled={isEndingLiveSession}
                  className="py-1 px-3 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500 hover:text-white transition-all font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                  <span>{isEndingLiveSession ? 'Ending...' : 'End Session'}</span>
                </button>
              )}
            </div>
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

      {/* Authentication and Profile Modals */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <UserProfileDrawer isOpen={showProfileDrawer} onClose={() => setShowProfileDrawer(false)} />
    </div>
  );
}
