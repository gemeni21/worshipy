'use client';

import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Copy,
  Check,
  LogOut,
  Shield,
  Church,
  AlertCircle,
  Loader2,
  Crown,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface WorshipTeamSectionProps {
  onRequireAuth?: () => void;
  initialInviteCode?: string;
}

export function WorshipTeamSection({ onRequireAuth, initialInviteCode }: WorshipTeamSectionProps) {
  const { user, activeGroup, createGroup, joinGroup, leaveGroup } = useAuth();

  const [mode, setMode] = useState<'create' | 'join'>(initialInviteCode ? 'join' : 'create');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [churchNameInput, setChurchNameInput] = useState(user?.churchName || '');
  const [inviteCodeInput, setInviteCodeInput] = useState(initialInviteCode || '');

  React.useEffect(() => {
    if (initialInviteCode) {
      setInviteCodeInput(initialInviteCode);
      setMode('join');
    }
  }, [initialInviteCode]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // If not logged in, prompt sign in
  if (!user) {
    return (
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs space-y-3">
        <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
          <Users className="w-4 h-4 text-[var(--brand-accent)]" />
          <span>Worship Team & Band Collaboration</span>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Sign in to create or join your church worship team. Band members collaborate on shared setlists, custom
          arrangements, and practice recordings.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="w-full py-2 px-3 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-xs transition-all cursor-pointer"
        >
          Sign In with Google or Email to Join Team
        </button>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await createGroup(teamNameInput, churchNameInput);
      setTeamNameInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await joinGroup(inviteCodeInput);
      setInviteCodeInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeave = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await leaveGroup();
      setShowLeaveConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave group');
    } finally {
      setIsLoading(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      const desktopBridge =
        typeof window !== 'undefined'
          ? (window as unknown as { electronAPI?: { writeClipboardText?: (text: string) => boolean } })
          : undefined;
      if (desktopBridge?.electronAPI?.writeClipboardText) {
        desktopBridge.electronAPI.writeClipboardText(code);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const copyLink = async (code: string) => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const link = `${origin}/settings?teamCode=${code}`;
      const desktopBridge =
        typeof window !== 'undefined'
          ? (window as unknown as { electronAPI?: { writeClipboardText?: (text: string) => boolean } })
          : undefined;
      if (desktopBridge?.electronAPI?.writeClipboardText) {
        desktopBridge.electronAPI.writeClipboardText(link);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  // State A: User is in an active group
  if (user.groupId && activeGroup) {
    const isOwner = activeGroup.ownerId === user.id;

    return (
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--brand-accent)]" />
              <h4 className="font-extrabold text-sm text-[var(--text-primary)]">{activeGroup.name}</h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
                {isOwner ? 'Team Leader' : 'Band Member'}
              </span>
            </div>
            {activeGroup.churchName && (
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-1">
                <Church className="w-3 h-3 text-neutral-400" />
                <span>{activeGroup.churchName}</span>
              </p>
            )}
          </div>

          <span className="text-[11px] text-[var(--text-secondary)] font-medium">
            {activeGroup.members.length} {activeGroup.members.length === 1 ? 'member' : 'members'}
          </span>
        </div>

        {/* Invite Code & Share Banner */}
        <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)]">
              Team Invite Code
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">Share with musicians</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-base font-extrabold tracking-widest text-[var(--brand-accent)]">
              {activeGroup.inviteCode}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => copyCode(activeGroup.inviteCode)}
                className="px-2.5 py-1 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer"
              >
                {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
              <button
                type="button"
                onClick={() => copyLink(activeGroup.inviteCode)}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--brand-surface)] inline-flex items-center gap-1 transition-all cursor-pointer"
              >
                {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <UserPlus className="w-3 h-3" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Members Roster */}
        <div className="space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block">
            Team Members
          </span>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {activeGroup.members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--bg-subtle)] text-[var(--text-primary)] font-bold text-[10px] flex items-center justify-center shrink-0">
                    {m.displayName[0]?.toUpperCase() || 'M'}
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--text-primary)] block truncate">
                      {m.displayName} {m.userId === user.id ? '(You)' : ''}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] truncate block">{m.email}</span>
                  </div>
                </div>

                {m.role === 'leader' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full shrink-0">
                    <Crown className="w-3 h-3" />
                    <span>Leader</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--text-secondary)] shrink-0">Musician</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 1-Group Policy Note */}
        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px] leading-relaxed">
          <p>
            You are locked into this worship team. To create or join a different group, you must leave this team first.
          </p>
        </div>

        {/* Leave Team Button */}
        {showLeaveConfirm ? (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 space-y-2">
            <p className="text-[11px] font-semibold">
              Are you sure you want to leave {activeGroup.name}? You will lose access to team setlists and rehearsal takes.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="px-2.5 py-1 rounded-lg text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLeave}
                disabled={isLoading}
                className="px-3 py-1 rounded-lg bg-rose-500 text-white font-bold text-[11px] hover:bg-rose-600 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                <span>Confirm Leave</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="w-full py-2 px-3 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave {activeGroup.name}</span>
          </button>
        )}
      </div>
    );
  }

  // State B: User is NOT in a group -> Show Create or Join
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--brand-accent)]" />
          <h4 className="font-extrabold text-sm text-[var(--text-primary)]">Worship Team Collaboration</h4>
        </div>
        <span className="text-[10px] text-[var(--text-secondary)]">Not in a team</span>
      </div>

      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
        Connect with your church band. Create a worship team for your musicians or enter an invite code from your leader.
      </p>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Toggle Create vs Join */}
      <div className="flex p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => {
            setMode('create');
            setError(null);
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'create'
              ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] shadow-xs font-bold'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Create New Team
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('join');
            setError(null);
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            mode === 'join'
              ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] shadow-xs font-bold'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Join with Code
        </button>
      </div>

      {mode === 'create' ? (
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[var(--text-primary)] block">
              Worship Team Name
            </label>
            <input
              type="text"
              required
              value={teamNameInput}
              onChange={(e) => setTeamNameInput(e.target.value)}
              placeholder="e.g. Grace Fellowship Praise Team"
              className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[var(--text-primary)] block">
              Church Name (Optional)
            </label>
            <input
              type="text"
              value={churchNameInput}
              onChange={(e) => setChurchNameInput(e.target.value)}
              placeholder="e.g. Grace Fellowship Church"
              className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !teamNameInput.trim()}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--brand-accent)] text-[#0c0c10] text-xs font-bold hover:opacity-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Create Worship Team</span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[var(--text-primary)] block">
              6-Character Invite Code
            </label>
            <input
              type="text"
              required
              maxLength={8}
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. D7FLWV"
              className="w-full text-sm font-mono tracking-widest uppercase p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--brand-accent)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !inviteCodeInput.trim()}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--brand-accent)] text-[#0c0c10] text-xs font-bold hover:opacity-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
            <span>Join Worship Team</span>
          </button>
        </form>
      )}
    </div>
  );
}
