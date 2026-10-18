'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  Check,
  HardDrive,
  Monitor,
  Moon,
  Sun,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type {
  ChartFontSize,
  EnharmonicPreference,
  ThemePreference,
} from '@/types/song';

function subscribeColorScheme(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getColorSchemeSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getColorSchemeServerSnapshot(): boolean {
  return false;
}

export default function SettingsPage() {
  const {
    settings,
    updateSettings,
    customSongs,
    favorites,
    recentlyViewed,
    setlists,
    offlineEntries,
    simulateOffline,
    setSimulateOffline,
    clearCustomSongs,
    clearFavorites,
    clearRecentlyViewed,
    clearSetlists,
    clearOfflineDownloads,
    clearAllLocalData,
  } = useApp();

  const systemDark = useSyncExternalStore(
    subscribeColorScheme,
    getColorSchemeSnapshot,
    getColorSchemeServerSnapshot
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const themeOptions: {
    id: ThemePreference;
    label: string;
    sublabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'system',
      label: `System (Currently ${systemDark ? 'dark' : 'light'})`,
      sublabel: 'Automatically matches your device appearance',
      icon: Monitor,
    },
    {
      id: 'light',
      label: 'Light',
      sublabel: 'High-contrast daylight chart surface',
      icon: Sun,
    },
    {
      id: 'dark',
      label: 'Dark',
      sublabel: 'Low-glare dark surface for dim stages',
      icon: Moon,
    },
  ];

  const fontSizeOptions: {
    id: ChartFontSize;
    label: string;
    desc: string;
  }[] = [
    { id: 'sm', label: 'Small', desc: 'Compact view for desktop screens' },
    { id: 'md', label: 'Medium (Default)', desc: 'Balanced everyday size' },
    { id: 'lg', label: 'Large', desc: 'Easier reading on music stands' },
    { id: 'xl', label: 'Extra Large', desc: 'Maximum legibility at a distance' },
  ];

  const spellingOptions: {
    id: EnharmonicPreference;
    label: string;
    desc: string;
  }[] = [
    {
      id: 'auto',
      label: 'Auto (Key-aware)',
      desc: 'Uses standard musical spelling for the target key (e.g., Bb in F, F# in G)',
    },
    {
      id: 'sharp',
      label: 'Prefer Sharps (♯)',
      desc: 'Spells accidentals with sharps (C#, D#, F#, G#, A#)',
    },
    {
      id: 'flat',
      label: 'Prefer Flats (♭)',
      desc: 'Spells accidentals with flats (Db, Eb, Gb, Ab, Bb)',
    },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Settings & Local Data
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Customize your chart appearance, chord spelling preferences, and
          manage data stored on this device.
        </p>
      </header>

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl bg-[var(--brand-surface)] border border-[var(--brand-accent)]/30 text-[var(--brand-accent)] px-4 py-3 text-sm font-medium flex items-center gap-2"
        >
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Theme Appearance */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Appearance Theme</h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Choose how Worship Music Companion looks across the app.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Theme preference"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          {themeOptions.map(({ id, label, sublabel, icon: Icon }) => {
            const active = settings.theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateSettings({ theme: id })}
                className={`text-left rounded-xl border p-4 transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                  active
                    ? 'border-[var(--brand-accent)] bg-[var(--brand-surface)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon
                    className={`w-5 h-5 ${
                      active
                        ? 'text-[var(--brand-accent)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  />
                  {active && (
                    <span className="text-xs font-semibold text-[var(--brand-accent)]">
                      Active
                    </span>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-sm">{label}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {sublabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Chart Text Size & Enharmonic Spelling */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-6">
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">Default Chart Text Size</h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Controls the base size of chords and lyrics on the song screen.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {fontSizeOptions.map((opt) => {
              const active = settings.chartFontSize === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateSettings({ chartFontSize: opt.id })}
                  className={`text-left rounded-xl border p-3.5 transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--brand-accent)] bg-[var(--brand-surface)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <div>
            <h2 className="text-lg font-bold">Default Chord Spelling</h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Choose how transposed accidentals (sharps vs. flats) are displayed
              by default.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {spellingOptions.map((opt) => {
              const active = settings.enharmonicPreference === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    updateSettings({ enharmonicPreference: opt.id })
                  }
                  className={`text-left rounded-xl border p-3.5 transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--brand-accent)] bg-[var(--brand-surface)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Offline Testing Simulator */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold inline-flex items-center gap-2">
              <WifiOff
                className="w-4 h-4 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>Test Offline Mode</span>
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Simulate a lost network connection to verify that songs you saved
              offline still open while unsaved songs show an offline notice.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSimulateOffline(!simulateOffline)}
            aria-pressed={simulateOffline}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm border transition-colors cursor-pointer ${
              simulateOffline
                ? 'bg-amber-600 text-white border-amber-600'
                : 'border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
            }`}
          >
            {simulateOffline
              ? 'Offline Simulation: ON'
              : 'Simulate Offline Mode'}
          </button>
        </div>
      </section>

      {/* Device Storage Explanation & Destructive Reset Controls */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-5">
        <div className="space-y-2">
          <h2 className="text-lg font-bold inline-flex items-center gap-2">
            <HardDrive
              className="w-5 h-5 text-[var(--brand-accent)]"
              aria-hidden="true"
            />
            <span>What Is Stored on This Device</span>
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            Worship Music Companion MVP runs without cloud accounts or external
            servers. Your <strong>Personal Songs ({customSongs.length})</strong>,{' '}
            <strong>Favorites ({favorites.length})</strong>,{' '}
            <strong>Recently Viewed history ({recentlyViewed.length})</strong>,{' '}
            <strong>Personal Setlists ({setlists.length})</strong>, and{' '}
            <strong>Appearance Settings</strong> are stored in this
            browser&apos;s <code>IndexedDB</code> and <code>localStorage</code>.
            Songs explicitly saved for{' '}
            <strong>Offline Use ({offlineEntries.length})</strong> are stored in
            this browser&apos;s <code>IndexedDB</code> and Cache Storage. None
            of this data syncs to other devices.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            disabled={customSongs.length === 0}
            onClick={async () => {
              if (
                window.confirm(
                  `Delete all ${customSongs.length} personal songs from My Songs on this device? Built-in catalog songs will not be affected.`
                )
              ) {
                await clearCustomSongs();
                setStatusMessage('Cleared all personal custom songs.');
              }
            }}
            className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium hover:border-rose-500/40 disabled:opacity-40 cursor-pointer"
          >
            <span>Clear Personal Songs ({customSongs.length})</span>
            <Trash2 className="w-4 h-4 text-rose-500" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={favorites.length === 0}
            onClick={() => {
              if (
                window.confirm(
                  `Clear all ${favorites.length} favorite songs from this device?`
                )
              ) {
                clearFavorites();
                setStatusMessage('Cleared local favorites.');
              }
            }}
            className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium hover:border-rose-500/40 disabled:opacity-40 cursor-pointer"
          >
            <span>Clear Favorites ({favorites.length})</span>
            <Trash2 className="w-4 h-4 text-rose-500" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={recentlyViewed.length === 0}
            onClick={() => {
              if (
                window.confirm(
                  'Clear your recently viewed song history on this device?'
                )
              ) {
                clearRecentlyViewed();
                setStatusMessage('Cleared recently viewed history.');
              }
            }}
            className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium hover:border-rose-500/40 disabled:opacity-40 cursor-pointer"
          >
            <span>Clear Recently Viewed ({recentlyViewed.length})</span>
            <Trash2 className="w-4 h-4 text-rose-500" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={setlists.length === 0}
            onClick={() => {
              if (
                window.confirm(
                  `Delete all ${setlists.length} personal setlists on this device?`
                )
              ) {
                clearSetlists();
                setStatusMessage('Cleared all personal setlists.');
              }
            }}
            className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium hover:border-rose-500/40 disabled:opacity-40 cursor-pointer"
          >
            <span>Clear Personal Setlists ({setlists.length})</span>
            <Trash2 className="w-4 h-4 text-rose-500" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={offlineEntries.length === 0}
            onClick={async () => {
              if (
                window.confirm(
                  `Remove all ${offlineEntries.length} offline-saved song copies from this device? (Favorites and setlists will not be removed.)`
                )
              ) {
                await clearOfflineDownloads();
                setStatusMessage('Removed all offline song downloads.');
              }
            }}
            className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium hover:border-rose-500/40 disabled:opacity-40 cursor-pointer sm:col-span-2"
          >
            <span>Clear Offline Downloads ({offlineEntries.length})</span>
            <Trash2 className="w-4 h-4 text-rose-500" aria-hidden="true" />
          </button>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <AlertTriangle
              className="w-4 h-4 text-amber-500 shrink-0"
              aria-hidden="true"
            />
            <span>
              Resetting all local data restores default settings and deletes all
              saved lists on this browser.
            </span>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (
                window.confirm(
                  'Reset ALL local favorites, history, personal setlists, offline songs, and settings on this device?'
                )
              ) {
                await clearAllLocalData();
                setStatusMessage(
                  'All local device data and settings have been reset.'
                );
              }
            }}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Reset All Local Device Data
          </button>
        </div>
      </section>
    </div>
  );
}
