'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X,
  User,
  Church,
  Music2,
  ShieldCheck,
  Cloud,
  RefreshCw,
  LogOut,
  FolderSync,
  ExternalLink,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { WorshipTeamSection } from '@/components/team/WorshipTeamSection';

interface UserProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileDrawer({ isOpen, onClose }: UserProfileDrawerProps) {
  const { user, isAdmin, logout, pendingApprovalsCount, syncStatus, lastSyncedAt, syncWithCloud, connectCloudStorage } =
    useAuth();
  const { customSongs, setlists, favorites, saveBatchSongsOffline } = useApp();

  const [gdriveInput, setGdriveInput] = useState(user?.cloudStorage?.folderUrl || '');
  const [isSavingGdrive, setIsSavingGdrive] = useState(false);
  const [gdriveSavedToast, setGdriveSavedToast] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleManualSync = async () => {
    setSyncFeedback(null);
    try {
      const res = await syncWithCloud({
        customSongs,
        setlists,
        favorites,
      });

      if (res?.downloadedSongs && res.downloadedSongs.length > 0) {
        // Also ensure downloaded songs are locally cached for offline
        await saveBatchSongsOffline(res.downloadedSongs);
        setSyncFeedback(`Successfully synchronized ${res.downloadedSongs.length} songs across devices!`);
      } else {
        setSyncFeedback('All songs and setlists are up to date on your cloud account.');
      }
    } catch {
      setSyncFeedback('Failed to sync. Please verify your connection.');
    }
  };

  const handleSaveGdrive = async () => {
    setIsSavingGdrive(true);
    try {
      await connectCloudStorage({
        provider: gdriveInput.trim() ? 'gdrive' : 'none',
        folderUrl: gdriveInput.trim() || undefined,
        connectedAt: new Date().toISOString(),
      });
      setGdriveSavedToast(true);
      setTimeout(() => setGdriveSavedToast(false), 2500);
    } catch (err) {
      console.error('Failed to save cloud storage config:', err);
    } finally {
      setIsSavingGdrive(false);
    }
  };

  const initials = user.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md h-full bg-[#101014] border-l border-[var(--border-subtle)] p-6 overflow-y-auto flex flex-col justify-between shadow-2xl">
        {/* Top Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--brand-accent)]/20 border border-[var(--brand-accent)]/40 text-[var(--brand-accent)] flex items-center justify-center font-bold text-base shadow-sm">
                {initials || <User className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span>{user.displayName}</span>
                  {isAdmin && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Admin
                    </span>
                  )}
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">{user.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Details Card */}
          <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2.5 mb-6 text-xs">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Church className="w-4 h-4 text-[var(--brand-accent)]" />
              <span className="font-medium text-[var(--text-primary)]">
                {user.churchName || 'Independent Worship Team'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Music2 className="w-4 h-4 text-[var(--brand-accent)]" />
              <span className="font-medium text-[var(--text-primary)]">
                {user.instrument || 'Worship Musician'}
              </span>
            </div>
          </div>

          {/* Worship Team Collaboration */}
          <div className="mb-6">
            <WorshipTeamSection />
          </div>

          {/* Admin Song Curation Link (If Admin) */}
          {isAdmin && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin Song Curation</span>
                </div>
                {pendingApprovalsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black animate-pulse">
                    {pendingApprovalsCount} Pending
                  </span>
                )}
              </div>
              <p className="text-amber-200/80 mb-3 text-[11px]">
                Review user song submissions and publish vetted chord charts to the global catalog.
              </p>
              <Link
                href="/admin"
                onClick={onClose}
                className="w-full py-2 px-3 rounded-xl bg-amber-400 text-black font-bold text-xs hover:brightness-110 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Open Song Curation Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* Cross-Device Sync Card */}
          <div className="mb-6 p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                <Cloud className="w-4 h-4 text-[var(--brand-accent)]" />
                <span>Cross-Device Cloud Sync</span>
              </div>
              <span className="text-[10px] text-[var(--text-secondary)]">
                {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Not synced yet'}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Synchronize your private custom songs, setlists, and favorites to access them on your phone, tablet, and
              laptop.
            </p>

            {syncFeedback && (
              <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--brand-accent)] shrink-0" />
                <span>{syncFeedback}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncStatus === 'syncing'}
              className="w-full py-2 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold text-xs hover:border-[var(--brand-accent)] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin text-[var(--brand-accent)]' : ''}`} />
              <span>{syncStatus === 'syncing' ? 'Syncing with Cloud...' : 'Sync Now with Cloud'}</span>
            </button>
          </div>

          {/* Connected Cloud Storage (Google Drive) */}
          <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                <FolderSync className="w-4 h-4 text-emerald-400" />
                <span>Personal Google Drive</span>
              </div>
              {user.cloudStorage?.folderUrl ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                  Connected
                </span>
              ) : (
                <span className="text-[10px] text-[var(--text-secondary)]">Optional</span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Connect your personal Google Drive rehearsal folder to link practice takes and vocal rehearsal stems at
              zero cost.
            </p>

            <div className="space-y-2">
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <input
                  type="url"
                  value={gdriveInput}
                  onChange={(e) => setGdriveInput(e.target.value)}
                  placeholder="Paste Google Drive folder or audio link"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveGdrive}
                disabled={isSavingGdrive}
                className="w-full py-1.5 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-emerald-300 font-semibold text-xs hover:border-emerald-400 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {gdriveSavedToast ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Drive Link Saved!</span>
                  </>
                ) : (
                  <span>Save Drive Link</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Logout Button */}
        <div className="pt-6 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => {
              logout();
              onClose();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
