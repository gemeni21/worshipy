'use client';

import React, { useState, useEffect, useRef, useTransition, useMemo } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Users,
  Copy,
  Check,
  QrCode,
  LogOut,
  Crown,
  Church,
  Mic,
  Play,
  Pause,
  Download,
  Trash2,
  Share2,
  Lightbulb,
  Calendar,
  Music2,
  Loader2,
  AlertCircle,
  Info,
  Plus,
  Radio,
  Palette,
  Upload,
  Image as ImageIcon,
  Headphones,
  ListMusic,
  Edit3,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Send,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { transposeKey } from '@/lib/music/transposition';
import { SetlistReferenceAudioModal } from '@/components/setlists/SetlistReferenceAudioModal';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';
import {
  subscribeToSharedPracticeTakes,
  sharePracticeTakeToTeam,
  deleteSharedPracticeTake,
  getCachedTeam,
  clearTeamActiveSetlist,
  reviewTeamSetlistSuggestion,
  deleteTeamSetlistSuggestion,
} from '@/lib/team/teamService';
import type { TeamPracticeTake, GroupMember, TeamSetlistSuggestion } from '@/types/auth';
import { PracticeWaveformPlayer } from '@/components/practice/PracticeWaveformPlayer';
import type { PracticeTake } from '@/lib/audio/practiceStorage';

export default function TeamHubPage() {
  const {
    user,
    isAuthLoading,
    activeGroup,
    teamPresence,
    onlineMembersCount,
    createGroup,
    joinGroup,
    leaveGroup,
    updateTeamBranding,
    refreshActiveGroup,
  } = useAuth();

  const { getSongByIdOrSlug } = useApp();
  const [activeRefAudio, setActiveRefAudio] = useState<{
    songTitle: string;
    songKey?: string;
    url: string;
  } | null>(null);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Create / Join State (when not in a team)
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [churchNameInput, setChurchNameInput] = useState(user?.churchName || '');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Shared Practice Takes State
  const [sharedTakes, setSharedTakes] = useState<TeamPracticeTake[]>([]);

  // Upload Rehearsal Take Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadSongTitle, setUploadSongTitle] = useState('');
  const [uploadTakeTitle, setUploadTakeTitle] = useState('');
  const [uploadAudioUrl, setUploadAudioUrl] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadInstrument, setUploadInstrument] = useState(user?.instrument || 'Band Take');
  const [isUploadingTake, setIsUploadingTake] = useState(false);
  const [takeUploadError, setTakeUploadError] = useState<string | null>(null);

  // Church Branding State (Leader Customization)
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [brandingTitleInput, setBrandingTitleInput] = useState('');
  const [brandingChurchInput, setBrandingChurchInput] = useState('');
  const [brandingLogoUrl, setBrandingLogoUrl] = useState('');
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [brandingSuccessMsg, setBrandingSuccessMsg] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [isClearingSetlist, setIsClearingSetlist] = useState(false);

  // Setlist Suggestions States
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);
  const [reviewingSuggestionId, setReviewingSuggestionId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');
  const [isReviewingAction, setIsReviewingAction] = useState(false);
  const [suggestionFeedbackMsg, setSuggestionFeedbackMsg] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  const currentTeam = activeGroup || getCachedTeam();

  const pendingSuggestions = useMemo(() => {
    return (currentTeam?.suggestedSetlists || []).filter((s) => s.status === 'pending');
  }, [currentTeam?.suggestedSetlists]);

  const userPendingSuggestion = useMemo(() => {
    if (!user?.id) return null;
    return (currentTeam?.suggestedSetlists || []).find(
      (s) => s.status === 'pending' && s.suggestedBy === user.id
    );
  }, [currentTeam?.suggestedSetlists, user?.id]);

  const userSuggestions = useMemo(() => {
    if (!user?.id) return [];
    return (currentTeam?.suggestedSetlists || []).filter((s) => s.suggestedBy === user.id);
  }, [currentTeam?.suggestedSetlists, user?.id]);

  useEffect(() => {
    if (!suggestionFeedbackMsg) return;
    const timer = window.setTimeout(() => setSuggestionFeedbackMsg(null), 4500);
    return () => window.clearTimeout(timer);
  }, [suggestionFeedbackMsg]);

  const handleReviewSuggestion = async (
    suggestionId: string,
    action: 'approve' | 'decline'
  ) => {
    if (!currentTeam?.id) return;
    setIsReviewingAction(true);
    try {
      const res = await reviewTeamSetlistSuggestion(
        currentTeam.id,
        suggestionId,
        action,
        action === 'decline' ? declineNote : undefined
      );
      if (res.ok) {
        await refreshActiveGroup();
        setReviewingSuggestionId(null);
        setDeclineNote('');
        setSuggestionFeedbackMsg(
          action === 'approve'
            ? 'Setlist approved! It is now the official Worship Team lineup.'
            : 'Setlist suggestion declined.'
        );
      } else {
        setSuggestionFeedbackMsg(res.error || 'Failed to update suggestion');
      }
    } catch (err) {
      setSuggestionFeedbackMsg(err instanceof Error ? err.message : 'Error processing review');
    } finally {
      setIsReviewingAction(false);
    }
  };

  const handleWithdrawSuggestion = async (suggestionId: string) => {
    if (!currentTeam?.id) return;
    if (!window.confirm('Withdraw your lineup suggestion for the team?')) return;
    try {
      const res = await deleteTeamSetlistSuggestion(currentTeam.id, suggestionId);
      if (res.ok) {
        await refreshActiveGroup();
        setSuggestionFeedbackMsg('Withdrew your lineup suggestion.');
      } else {
        setSuggestionFeedbackMsg(res.error || 'Failed to withdraw suggestion');
      }
    } catch (err) {
      setSuggestionFeedbackMsg(err instanceof Error ? err.message : 'Error withdrawing suggestion');
    }
  };

  const handleClearActiveSetlist = async () => {
    if (!currentTeam?.id || !currentTeam.activeSetlist) return;
    if (
      !window.confirm(
        `Remove "${currentTeam.activeSetlist.name}" from Worship Team? The setlist in your personal library will not be affected.`
      )
    ) {
      return;
    }
    setIsClearingSetlist(true);
    try {
      await clearTeamActiveSetlist(currentTeam.id);
      refreshActiveGroup();
    } catch (err) {
      console.warn('Error clearing active setlist:', err);
    } finally {
      setIsClearingSetlist(false);
    }
  };

  // Active member roster computed with presence fallback to guarantee no online musician is ever hidden
  const rosterMembers = useMemo(() => {
    const map = new Map<string, GroupMember>();
    for (const m of (currentTeam?.members || [])) {
      map.set(m.userId, m);
    }
    // Safeguard: Any active musician in teamPresence is guaranteed to be in the roster
    for (const [pUserId, pRecord] of Object.entries(teamPresence)) {
      if (!map.has(pUserId) && pRecord && pRecord.displayName) {
        map.set(pUserId, {
          userId: pUserId,
          email: '',
          displayName: pRecord.displayName,
          role: 'member',
          instrument: pRecord.instrument || 'Musician',
          joinedAt: pRecord.lastSeen,
        });
      }
    }
    return Array.from(map.values());
  }, [currentTeam?.members, teamPresence]);

  // Actively synchronize team state (lineup & live status) across devices and tabs
  useEffect(() => {
    refreshActiveGroup();
    const interval = setInterval(() => {
      refreshActiveGroup();
    }, 2500);

    const onFocus = () => refreshActiveGroup();
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshActiveGroup]);

  // Subscribe to shared practice takes
  useEffect(() => {
    if (!currentTeam?.id) {
      setSharedTakes([]);
      return;
    }

    const unsub = subscribeToSharedPracticeTakes(currentTeam.id, (takes) => {
      setSharedTakes(takes);
    });

    return () => unsub();
  }, [currentTeam?.id]);

  // Generate QR Code when QR modal opens
  useEffect(() => {
    if (showQrModal && currentTeam?.inviteCode) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const inviteUrl = `${origin}/team?joinCode=${currentTeam.inviteCode}`;
      QRCode.toDataURL(inviteUrl, { width: 300, margin: 2 })
        .then((url) => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [showQrModal, currentTeam?.inviteCode]);

  // Synchronize initial branding values with team
  useEffect(() => {
    if (currentTeam) {
      setBrandingTitleInput(currentTeam.customAppTitle || '');
      setBrandingChurchInput(currentTeam.churchName || '');
      setBrandingLogoUrl(currentTeam.customAppLogoUrl || '');
    }
  }, [currentTeam?.id, currentTeam?.customAppTitle, currentTeam?.customAppLogoUrl, currentTeam?.churchName]);

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, SVG, or WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const src = loadEvt.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 128;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/png');
          setBrandingLogoUrl(compressed);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam) return;

    setIsSavingBranding(true);
    setBrandingError(null);
    try {
      await updateTeamBranding({
        customAppTitle: brandingTitleInput.trim(),
        churchName: brandingChurchInput.trim(),
        customAppLogoUrl: brandingLogoUrl.trim(),
      });
      setBrandingSuccessMsg(true);
      setTimeout(() => {
        setBrandingSuccessMsg(false);
        setShowBrandingModal(false);
      }, 1000);
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : 'Failed to update church branding');
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleResetBranding = async () => {
    if (!currentTeam) return;
    if (!confirm('Reset app name and logo to default Worshipy branding?')) return;

    setIsSavingBranding(true);
    setBrandingError(null);
    try {
      await updateTeamBranding({
        customAppTitle: '',
        customAppLogoUrl: '',
      });
      setBrandingTitleInput('');
      setBrandingLogoUrl('');
      setShowBrandingModal(false);
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : 'Failed to reset branding');
    } finally {
      setIsSavingBranding(false);
    }
  };

  // Convert TeamPracticeTake to PracticeTake for the waveform player
  const teamTakeToPracticeTake = (take: TeamPracticeTake, church?: string): PracticeTake => {
    return {
      id: take.id,
      songSlug: take.songId || 'team-take',
      songTitle: take.songTitle,
      fileName: take.title,
      key: 'G',
      durationSeconds: take.durationSeconds || 180,
      createdAt: new Date(take.createdAt).getTime() || Date.now(),
      audioUrl: take.audioUrl,
      sourceType: 'link',
      mimeType: 'audio/mpeg',
      notes: take.notes,
      waveformPeaks: [],
      churchName: church,
      createdBy: take.authorName,
      isLeaderTake: take.isLeaderTake,
      instrumentTag: take.instrumentTag,
    };
  };

  const copyCode = async () => {
    if (!currentTeam?.inviteCode) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(currentTeam.inviteCode);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const copyLink = async () => {
    if (!currentTeam?.inviteCode) return;
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const link = `${origin}/team?joinCode=${currentTeam.inviteCode}`;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleCreateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamNameInput.trim()) return;
    setFormLoading(true);
    setFormError(null);
    try {
      await createGroup(teamNameInput, churchNameInput);
      setTeamNameInput('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setFormLoading(false);
    }
  };

  const handleJoinTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    setFormLoading(true);
    setFormError(null);
    try {
      await joinGroup(inviteCodeInput);
      setInviteCodeInput('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to join team');
    } finally {
      setFormLoading(false);
    }
  };

  const handleConfirmLeave = async () => {
    setFormLoading(true);
    try {
      await leaveGroup();
      setShowLeaveConfirm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to leave team');
    } finally {
      setFormLoading(false);
    }
  };

  const handleSaveSharedTake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam || !user || !uploadSongTitle.trim() || !uploadTakeTitle.trim()) return;

    setIsUploadingTake(true);
    setTakeUploadError(null);
    try {
      const newTake: TeamPracticeTake = {
        id: `take_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        songId: uploadSongTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        songTitle: uploadSongTitle.trim(),
        title: uploadTakeTitle.trim(),
        authorName: user.displayName || user.email.split('@')[0],
        authorId: user.id,
        createdAt: new Date().toISOString(),
        durationSeconds: 180,
        ...(uploadAudioUrl.trim() ? { audioUrl: uploadAudioUrl.trim() } : {}),
        ...(uploadNotes.trim() ? { notes: uploadNotes.trim() } : {}),
        ...(uploadInstrument.trim() ? { instrumentTag: uploadInstrument.trim() } : {}),
        isLeaderTake: currentTeam.ownerId === user.id,
      };

      await sharePracticeTakeToTeam(currentTeam.id, newTake);
      setShowUploadModal(false);
      setUploadSongTitle('');
      setUploadTakeTitle('');
      setUploadAudioUrl('');
      setUploadNotes('');
    } catch (err) {
      setTakeUploadError(err instanceof Error ? err.message : 'Failed to share take');
    } finally {
      setIsUploadingTake(false);
    }
  };

  const handleDeleteTake = async (takeId: string) => {
    if (!currentTeam) return;
    if (confirm('Delete this shared rehearsal take from the team?')) {
      await deleteSharedPracticeTake(currentTeam.id, takeId);
    }
  };

  // If still checking session and no local team yet
  if (isAuthLoading && !user && !currentTeam) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-accent)]" />
        <p className="text-xs text-[var(--text-secondary)] font-medium">Connecting to your worship team...</p>
      </div>
    );
  }

  // If not signed in at all
  if (!user && !currentTeam) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-[var(--brand-accent)]/15 border border-[var(--brand-accent)]/30 text-[var(--brand-accent)] flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-[var(--text-primary)]">Worship Team Hub</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
            Collaborate with your church musicians. Share chord arrangements, see who is practicing in real-time, and access shared rehearsal takes.
          </p>
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="py-3 px-6 rounded-xl bg-[var(--brand-accent)] text-black font-bold text-sm hover:brightness-110 active:scale-98 transition-all cursor-pointer shadow-lg"
          >
            Sign In with Google or Email
          </button>
        </div>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </div>
    );
  }

  // If resolving user's team in background
  if (user?.groupId && !currentTeam) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-accent)]" />
        <p className="text-xs text-[var(--text-secondary)] font-medium">Loading your team roster...</p>
      </div>
    );
  }

  // If signed in but NOT in a team
  if (!currentTeam) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--brand-accent)]/15 border border-[var(--brand-accent)]/30 text-[var(--brand-accent)] flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">Connect with Your Worship Team</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Create a team for your church or enter an invite code to join your band.
          </p>
        </div>

        {formError && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{formError}</span>
          </div>
        )}

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'create'
                  ? 'bg-[var(--brand-accent)] text-black shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Create New Team
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'join'
                  ? 'bg-[var(--brand-accent)] text-black shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Join with Invite Code
            </button>
          </div>

          {mode === 'create' ? (
            <form onSubmit={handleCreateTeamSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Worship Team / Band Name <span className="text-[var(--brand-accent)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={teamNameInput}
                  onChange={(e) => setTeamNameInput(e.target.value)}
                  placeholder="e.g. Grace Worship Band / Main Sunday Team"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Church / Ministry Name <span className="text-[var(--text-secondary)] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={churchNameInput}
                  onChange={(e) => setChurchNameInput(e.target.value)}
                  placeholder="e.g. Central Worship Community"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              <button
                type="submit"
                disabled={!teamNameInput.trim() || formLoading}
                className="w-full py-3 px-4 rounded-xl bg-[var(--brand-accent)] text-black text-xs sm:text-sm font-bold hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
              >
                {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Create Worship Team &amp; Get Invite Code</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinTeamSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  6-Letter Invite Code <span className="text-[var(--brand-accent)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. D7FLWV"
                  className="w-full font-mono text-center tracking-widest text-lg py-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--brand-accent)] placeholder-[var(--text-secondary)]/40 focus:outline-none focus:border-[var(--brand-accent)] uppercase"
                />
                <p className="text-[11px] text-[var(--text-secondary)] mt-1.5 text-center">
                  Ask your worship leader for the 6-character team code.
                </p>
              </div>

              <button
                type="submit"
                disabled={!inviteCodeInput.trim() || formLoading}
                className="w-full py-3 px-4 rounded-xl bg-[var(--brand-accent)] text-black text-xs sm:text-sm font-bold hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
              >
                {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Join Team</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Active Team Hub
  const memberRecord = currentTeam.members?.find((m) => m.userId === user?.id);
  const isExplicitMember = user?.groupRole === 'member' || memberRecord?.role === 'member';

  const isLeader = Boolean(
    user &&
      !isExplicitMember &&
      (currentTeam.ownerId === user.id ||
        user.groupRole === 'leader' ||
        memberRecord?.role === 'leader' ||
        (user.role === 'admin' && !user.groupRole))
  );

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-linear-to-b from-[#14141c] to-[#0c0c10] p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text-primary)]">
                {currentTeam.name}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center gap-1">
                {isLeader ? (
                  <>
                    <Crown className="w-3 h-3 text-amber-400" />
                    <span>Team Leader</span>
                  </>
                ) : (
                  <span>Band Member</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{onlineMembersCount > 0 ? `${onlineMembersCount} Online Now` : '1 Online'}</span>
              </span>
            </div>

            {currentTeam.churchName && (
              <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1.5">
                <Church className="w-3.5 h-3.5" />
                <span>{currentTeam.churchName}</span>
              </p>
            )}
          </div>

          {/* Quick Invite Actions */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">Code:</span>
              <span className="font-mono text-sm font-black text-[var(--brand-accent)]">
                {currentTeam.inviteCode}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Copy Code"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <button
              type="button"
              onClick={copyLink}
              className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--brand-surface)] flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Share2 className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
              <span>{copiedLink ? 'Link Copied!' : 'Invite Link'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="p-2 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] text-[var(--text-secondary)] hover:text-[var(--brand-accent)] cursor-pointer transition-all"
              title="Show QR Code"
            >
              <QrCode className="w-4 h-4" />
            </button>

            {isLeader && (
              <button
                type="button"
                onClick={() => setShowBrandingModal(true)}
                className="px-3 py-1.5 rounded-xl border border-[var(--brand-accent)]/30 hover:border-[var(--brand-accent)] text-xs font-semibold text-[var(--brand-accent)] hover:bg-[var(--brand-surface)] flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                title="Customize Church Name & Logo"
              >
                <Palette className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Church Branding</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Band Rehearsal Quick Action */}
      {(() => {
        const isTeamLive = Boolean(
          currentTeam.activeLiveSessionId &&
          (!currentTeam.activeLiveSessionExpiresAt ||
            new Date(currentTeam.activeLiveSessionExpiresAt).getTime() > Date.now())
        );

        return (
          <div
            className={`rounded-3xl border p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg transition-all ${
              isTeamLive
                ? 'border-emerald-500/50 bg-linear-to-r from-emerald-500/20 via-[var(--bg-surface)] to-[var(--bg-surface)] ring-2 ring-emerald-500/30'
                : 'border-[var(--brand-accent)]/30 bg-linear-to-r from-[var(--brand-accent)]/10 via-[var(--bg-surface)] to-[var(--bg-surface)]'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                  isTeamLive
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-[var(--brand-accent)]/20 border-[var(--brand-accent)]/40 text-[var(--brand-accent)]'
                }`}
              >
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  {isTeamLive && (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  )}
                  <span>
                    {isTeamLive
                      ? 'Live Band Rehearsal is ACTIVE NOW'
                      : 'Live Band Rehearsal & Stage Sync'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isTeamLive
                        ? 'bg-emerald-500 text-black shadow-sm'
                        : 'bg-[var(--brand-accent)] text-black'
                    }`}
                  >
                    {isTeamLive ? 'LIVE ON STAGE' : 'REAL-TIME'}
                  </span>
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {isTeamLive
                    ? `${currentTeam.activeLiveSessionLeaderName || 'Leader'} is live right now! Click below to auto-join the live stage charts with 0 codes.`
                    : isLeader
                    ? 'Broadcast keys, chords, capo, and live sections simultaneously to every musician on stage.'
                    : 'Connect to your worship leader’s live chord chart, auto-transposition, and section cues in real-time.'}
                </p>
              </div>
            </div>

            <Link
              href="/live"
              className={`shrink-0 w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer ${
                isTeamLive
                  ? 'bg-emerald-500 text-black hover:brightness-110 active:scale-98 ring-2 ring-emerald-400/50'
                  : 'bg-[var(--brand-accent)] text-black hover:brightness-110 active:scale-98'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>
                {isTeamLive
                  ? '⚡ Join Live Stage Instantly'
                  : isLeader
                  ? 'Start Live Rehearsal'
                  : 'Join Live Band Room'}
              </span>
            </Link>
          </div>
        );
      })()}

      {/* Main Grid: Roster on Left, Shared Practice Takes on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Live Member Roster */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--brand-accent)]" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">Band Roster</h3>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                {rosterMembers.length} {rosterMembers.length === 1 ? 'member' : 'members'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {rosterMembers.map((m) => {
                const presence = teamPresence[m.userId];
                const isOnline = presence?.online ?? Boolean(user && m.userId === user.id);
                const currentSong = presence?.currentSong;

                return (
                  <div
                    key={m.userId}
                    className="p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1.5 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full bg-[var(--bg-subtle)] text-[var(--text-primary)] font-bold text-xs flex items-center justify-center border border-[var(--border-subtle)]">
                            {m.displayName?.[0]?.toUpperCase() || 'M'}
                          </div>
                          <span
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#101014] ${
                              isOnline ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-neutral-600'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-xs text-[var(--text-primary)] block truncate">
                            {m.displayName} {user && m.userId === user.id ? '(You)' : ''}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)] truncate block">
                            {m.instrument || 'Musician'}
                          </span>
                        </div>
                      </div>

                      {m.role === 'leader' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 flex items-center gap-1 shrink-0">
                          <Crown className="w-2.5 h-2.5" />
                          <span>Leader</span>
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                            isOnline ? 'text-emerald-400 bg-emerald-500/10' : 'text-neutral-500 bg-neutral-800/40'
                          }`}
                        >
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      )}
                    </div>

                    {/* Active song status */}
                    {isOnline && currentSong && (
                      <div className="text-[10px] text-[var(--brand-accent)] bg-[var(--brand-surface)] px-2 py-0.5 rounded-md flex items-center gap-1 truncate">
                        <Music2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">Practicing: {currentSong}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Church Branding Card for Leader */}
            {isLeader && (
              <div className="p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                    <span className="font-bold text-xs text-[var(--text-primary)]">Church Branding</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBrandingModal(true)}
                    className="text-[11px] font-bold text-[var(--brand-accent)] hover:underline cursor-pointer"
                  >
                    Customize
                  </button>
                </div>
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  {currentTeam.customAppLogoUrl ? (
                    <img
                      src={currentTeam.customAppLogoUrl}
                      alt="Logo"
                      className="w-7 h-7 rounded-lg object-contain bg-white/5 border border-[var(--border-subtle)] p-0.5 shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shrink-0">
                      <Music2 className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs block text-[var(--text-primary)] truncate">
                      {currentTeam.customAppTitle || currentTeam.churchName || currentTeam.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] block truncate">
                      {currentTeam.customAppTitle ? 'Custom Church Name & Logo' : 'Default App Title'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Leave Team Button */}
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              {showLeaveConfirm ? (
                <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs space-y-2">
                  <p className="font-semibold text-[11px]">
                    Leave {currentTeam.name}? You will lose access to team takes.
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
                      onClick={handleConfirmLeave}
                      disabled={formLoading}
                      className="px-3 py-1 rounded-lg bg-rose-500 text-white font-bold text-[11px] hover:bg-rose-600 cursor-pointer disabled:opacity-50"
                    >
                      {formLoading ? 'Leaving...' : 'Confirm'}
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
                  <span>Leave Team</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Team Lineup + Shared Practice Takes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Toast / Status Notification for Suggestion Actions */}
          {suggestionFeedbackMsg && (
            <div
              role="status"
              className="px-4 py-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-between gap-2 animate-in fade-in"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 shrink-0" />
                <span>{suggestionFeedbackMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuggestionFeedbackMsg(null)}
                className="p-1 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Leader Review Section for Pending Lineup Suggestions */}
          {isLeader && (
            pendingSuggestions.length > 0 ? (
              <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5 sm:p-6 space-y-4 shadow-sm animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                          Lineup Suggestions from Team
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black shadow-xs">
                          {pendingSuggestions.length} PENDING REVIEW
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Singers and song leaders proposing service lineups for your approval
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {pendingSuggestions.map((sug) => {
                    const isExpanded = expandedSuggestionId === sug.id;
                    const isReviewingThis = reviewingSuggestionId === sug.id;
                    const isOwnSuggestion = sug.suggestedBy === user?.id;

                    return (
                      <div
                        key={sug.id}
                        className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-amber-500/25 hover:border-amber-500/40 transition-all space-y-3.5 shadow-xs"
                      >
                        {/* Top Row: Full-width Setlist Title + Metadata Badges + Status Badge */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[var(--border-subtle)]/70">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-bold text-base text-[var(--text-primary)]">
                              {sug.setlist.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 shrink-0 whitespace-nowrap">
                              {sug.setlist.items.length}{' '}
                              {sug.setlist.items.length === 1 ? 'song' : 'songs'}
                            </span>
                            {sug.targetServiceDate && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0 whitespace-nowrap flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-[var(--brand-accent)]" />
                                <span>{sug.targetServiceDate}</span>
                              </span>
                            )}
                          </div>

                          {/* Status Badge */}
                          <div className="shrink-0 self-start sm:self-center">
                            {sug.status === 'pending' && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 whitespace-nowrap flex items-center gap-1.5 shadow-xs">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                <span>For Approval</span>
                              </span>
                            )}
                            {sug.status === 'approved' && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 whitespace-nowrap flex items-center gap-1.5 shadow-xs">
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Approved</span>
                              </span>
                            )}
                            {sug.status === 'declined' && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 whitespace-nowrap flex items-center gap-1.5 shadow-xs">
                                <X className="w-3.5 h-3.5 text-rose-400" />
                                <span>Declined</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Submitter Info and Note Row (Full width) */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            <span className="font-semibold text-[var(--text-primary)]">
                              Suggested by {sug.suggestedByName}
                            </span>
                            {sug.suggestedByRole && (
                              <>
                                <span>•</span>
                                <span>{sug.suggestedByRole}</span>
                              </>
                            )}
                          </div>

                          {sug.note && (
                            <div className="p-2.5 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] italic">
                              &ldquo;{sug.note}&rdquo;
                            </div>
                          )}

                          {sug.reviewNote && (
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
                              <span className="font-semibold">Leader feedback:</span> &ldquo;{sug.reviewNote}&rdquo;
                            </div>
                          )}
                        </div>

                        {/* Dedicated Bottom Actions Row */}
                        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSuggestionId(isExpanded ? null : sug.id)
                            }
                            className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <span>{isExpanded ? 'Hide Songs' : 'Preview Songs'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Leaders can approve or decline if it is NOT their own proposal */}
                            {!isOwnSuggestion && sug.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={isReviewingAction}
                                  onClick={() => handleReviewSuggestion(sug.id, 'approve')}
                                  className="py-1.5 px-3.5 rounded-xl bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve & Set Lineup</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={isReviewingAction}
                                  onClick={() => {
                                    if (isReviewingThis) {
                                      setReviewingSuggestionId(null);
                                    } else {
                                      setReviewingSuggestionId(sug.id);
                                      setDeclineNote('');
                                    }
                                  }}
                                  className="py-1.5 px-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Decline</span>
                                </button>
                              </>
                            )}

                            {/* Submitter viewing their own suggestion */}
                            {isOwnSuggestion && (
                              <>
                                {sug.status === 'pending' && (
                                  <button
                                    type="button"
                                    onClick={() => handleWithdrawSuggestion(sug.id)}
                                    className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-rose-500/40 hover:text-rose-400 text-xs font-semibold text-[var(--text-secondary)] transition-colors cursor-pointer"
                                  >
                                    Withdraw Proposal
                                  </button>
                                )}
                                {sug.status === 'approved' && (
                                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approved as Official Lineup</span>
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Inline Decline Note Input */}
                        {isReviewingThis && (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2 animate-in fade-in">
                            <label className="block text-xs font-semibold text-rose-300">
                              Reason or note for {sug.suggestedByName} (optional):
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={declineNote}
                                onChange={(e) => setDeclineNote(e.target.value)}
                                placeholder="e.g. Let's do this next Sunday instead so the band has more rehearsal time."
                                className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-rose-400"
                              />
                              <button
                                type="button"
                                disabled={isReviewingAction}
                                onClick={() => handleReviewSuggestion(sug.id, 'decline')}
                                className="px-3 py-1.5 rounded-lg bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Confirm Decline
                              </button>
                              <button
                                type="button"
                                onClick={() => setReviewingSuggestionId(null)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Expanded Songs List Preview */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5 animate-in fade-in">
                            <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                              Proposed Songs & Keys ({sug.setlist.items.length})
                            </div>
                            {sug.setlist.items.map((item, idx) => {
                              const song = getSongByIdOrSlug(item.songId);
                              const targetKey = item.preferredSemitones
                                ? transposeKey(song?.originalKey || 'C', item.preferredSemitones, 'auto')
                                : song?.originalKey || 'C';

                              return (
                                <div
                                  key={`${item.songId}_${idx}`}
                                  className="p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <span className="w-5 h-5 rounded-full font-mono text-[10px] font-bold bg-[var(--bg-subtle)] text-[var(--brand-accent)] flex items-center justify-center shrink-0">
                                      {idx + 1}
                                    </span>
                                    <span className="font-semibold text-[var(--text-primary)] truncate">
                                      {song?.title || item.songId}
                                    </span>
                                    {song?.artist && (
                                      <span className="text-[11px] text-[var(--text-secondary)] truncate hidden sm:inline">
                                        by {song.artist}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
                                      Key: {targetKey}
                                    </span>
                                    {item.referenceAudioUrl && (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                                        <Headphones className="w-3 h-3" />
                                        <span>Audio</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center justify-center shrink-0">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                          Team Lineup Suggestions
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                          0 PENDING
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Singers and band members can propose service lineups for your approval
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/setlists"
                    className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:border-amber-500/40 text-xs font-semibold text-[var(--text-secondary)] hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ListMusic className="w-3.5 h-3.5 text-amber-400" />
                    <span>View / Manage Setlists</span>
                  </Link>
                </div>
                <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] flex items-start gap-3 text-xs text-[var(--text-secondary)]">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-[var(--text-primary)]">
                      How Lineup Suggestions Work:
                    </p>
                    <p>
                      Band members assigned to lead worship can select a setlist in <strong>My Setlists</strong> and click <strong>Suggest to Team</strong>. Once submitted, proposals appear right here with a 1-click <strong>Approve & Set Lineup</strong> button.
                    </p>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Member View: Shows their suggested lineups with status "For Approval" or "Approved" */}
          {!isLeader && (
            userSuggestions.length > 0 ? (
              <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5 sm:p-6 space-y-4 shadow-sm animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                          Your Lineup Suggestions
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black shadow-xs">
                          {userSuggestions.length} PROPOSAL{userSuggestions.length === 1 ? '' : 'S'}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Track the approval status of lineups you suggested for upcoming services
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/setlists"
                    className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:border-amber-500/40 text-xs font-semibold text-[var(--text-secondary)] hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    <span>Suggest Another Lineup</span>
                  </Link>
                </div>

                <div className="space-y-3.5">
                  {userSuggestions.map((sug) => {
                    const isExpanded = expandedSuggestionId === sug.id;

                    return (
                      <div
                        key={sug.id}
                        className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-amber-500/25 hover:border-amber-500/40 transition-all space-y-3.5 shadow-xs"
                      >
                        {/* Top Row: Full-width Setlist Title + Metadata Badges + Status Badge */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[var(--border-subtle)]/70">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-bold text-base text-[var(--text-primary)]">
                              {sug.setlist.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 shrink-0 whitespace-nowrap">
                              {sug.setlist.items.length}{' '}
                              {sug.setlist.items.length === 1 ? 'song' : 'songs'}
                            </span>
                            {sug.targetServiceDate && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0 whitespace-nowrap flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-[var(--brand-accent)]" />
                                <span>{sug.targetServiceDate}</span>
                              </span>
                            )}
                          </div>

                          {/* Member Status Badge: "For Approval" or "Approved" */}
                          <div className="shrink-0 self-start sm:self-center">
                            {sug.status === 'pending' && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 whitespace-nowrap flex items-center gap-1.5 shadow-xs">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                <span>For Approval</span>
                              </span>
                            )}
                            {sug.status === 'approved' && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 whitespace-nowrap flex items-center gap-1.5 shadow-xs">
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Approved</span>
                              </span>
                            )}
                            {sug.status === 'declined' && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 whitespace-nowrap flex items-center gap-1.5 shadow-xs">
                                <X className="w-3.5 h-3.5 text-rose-400" />
                                <span>Declined</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Note & Feedback Row */}
                        <div className="space-y-1.5">
                          {sug.note && (
                            <div className="p-2.5 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] italic">
                              &ldquo;{sug.note}&rdquo;
                            </div>
                          )}
                          {sug.reviewNote && (
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
                              <span className="font-semibold">Leader feedback:</span> &ldquo;{sug.reviewNote}&rdquo;
                            </div>
                          )}
                        </div>

                        {/* Dedicated Bottom Actions Row for Member */}
                        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSuggestionId(isExpanded ? null : sug.id)
                            }
                            className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <span>{isExpanded ? 'Hide Songs' : 'Preview Songs'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <div className="flex items-center gap-2 shrink-0">
                            {sug.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleWithdrawSuggestion(sug.id)}
                                className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-rose-500/40 hover:text-rose-400 text-xs font-semibold text-[var(--text-secondary)] transition-colors cursor-pointer"
                              >
                                Withdraw Proposal
                              </button>
                            )}
                            {sug.status === 'approved' && (
                              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" />
                                <span>Approved by Worship Leader</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expanded Songs Preview */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5 animate-in fade-in">
                            <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                              Songs & Keys in this Proposal ({sug.setlist.items.length})
                            </div>
                            {sug.setlist.items.map((item, idx) => {
                              const song = getSongByIdOrSlug(item.songId);
                              const targetKey = item.preferredSemitones
                                ? transposeKey(song?.originalKey || 'C', item.preferredSemitones, 'auto')
                                : song?.originalKey || 'C';

                              return (
                                <div
                                  key={`${item.songId}_${idx}`}
                                  className="p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <span className="w-5 h-5 rounded-full font-mono text-[10px] font-bold bg-[var(--bg-subtle)] text-[var(--brand-accent)] flex items-center justify-center shrink-0">
                                      {idx + 1}
                                    </span>
                                    <span className="font-semibold text-[var(--text-primary)] truncate">
                                      {song?.title || item.songId}
                                    </span>
                                    {song?.artist && (
                                      <span className="text-[11px] text-[var(--text-secondary)] truncate hidden sm:inline">
                                        by {song.artist}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
                                      Key: {targetKey}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm text-[var(--text-primary)]">
                      Leading Worship for an Upcoming Service?
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Pick your songs in <strong>My Setlists</strong> and click <strong>Suggest to Team</strong> to submit your service lineup for leader review.
                    </p>
                  </div>
                </div>
                <Link
                  href="/setlists"
                  className="py-1.5 px-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500 hover:text-black text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Propose a Lineup</span>
                </Link>
              </div>
            )
          )}

          {/* Section: Upcoming Service Lineup (Team Setlist) */}
          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shrink-0">
                  <ListMusic className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                      Upcoming Service Lineup
                    </h3>
                    {currentTeam.activeSetlist && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
                        ACTIVE LINEUP
                      </span>
                    )}
                  </div>
                  {currentTeam.activeSetlist ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      {currentTeam.activeSetlist.name} • {currentTeam.activeSetlist.items.length}{' '}
                      {currentTeam.activeSetlist.items.length === 1 ? 'song' : 'songs'}
                      {currentTeam.activeSetlist.publishedByName && (
                        <span> • Set by {currentTeam.activeSetlist.publishedByName}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)]">
                      Official songs and reference tracks for the band to rehearse
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {currentTeam.activeSetlist && (
                  <Link
                    href={`/live?startSetlist=${encodeURIComponent(currentTeam.activeSetlist.id)}`}
                    className="py-1.5 px-3 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 text-xs font-bold hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Open in Live Sync</span>
                  </Link>
                )}
                {isLeader && (
                  <Link
                    href="/setlists"
                    className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                    <span>{currentTeam.activeSetlist ? 'Change Lineup' : 'Set Lineup'}</span>
                  </Link>
                )}
                {isLeader && currentTeam.activeSetlist && (
                  <button
                    type="button"
                    onClick={handleClearActiveSetlist}
                    disabled={isClearingSetlist}
                    className="py-1.5 px-3 rounded-xl border border-red-500/30 hover:border-red-500/60 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    title="Remove this lineup from Worship Team"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isClearingSetlist ? 'Clearing...' : 'Clear Lineup'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Setlist Song Items */}
            {currentTeam.activeSetlist && currentTeam.activeSetlist.items.length > 0 ? (
              <div className="space-y-2">
                {currentTeam.activeSetlist.items.map((item, idx) => {
                  const song = getSongByIdOrSlug(item.songId);
                  const targetKey = item.preferredSemitones
                    ? transposeKey(song?.originalKey || 'C', item.preferredSemitones, 'auto')
                    : song?.originalKey || 'C';
                  const songHref = song
                    ? item.preferredSemitones
                      ? `/songs/${song.slug}?semitones=${item.preferredSemitones}`
                      : `/songs/${song.slug}`
                    : '#';

                  return (
                    <div
                      key={`${item.songId}_${idx}`}
                      className="p-3 sm:p-3.5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                    >
                      {/* Left: Slot Number + Title + Musical Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-full font-mono text-xs font-bold bg-[var(--bg-subtle)] text-[var(--brand-accent)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={songHref}
                              className="font-bold text-xs sm:text-sm text-[var(--text-primary)] hover:text-[var(--brand-accent)] truncate block transition-colors"
                            >
                              {song?.title || item.songId}
                            </Link>
                            {item.notes && (
                              <span className="text-[10px] text-[var(--text-secondary)] italic truncate max-w-[200px]">
                                &ldquo;{item.notes}&rdquo;
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="font-mono font-bold text-[var(--brand-accent)] bg-[var(--brand-surface)] px-1.5 py-0.5 rounded text-[11px] border border-[var(--brand-accent)]/20">
                              Key of {targetKey}
                            </span>
                            {song && (
                              <>
                                <span>• {song.language.label}</span>
                                {song.tempoBpm && <span>• {song.tempoBpm} BPM</span>}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Reference Track Audio Player Button + View Chord Chart */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {item.referenceAudioUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setActiveRefAudio({
                                songTitle: song?.title || item.songId,
                                songKey: targetKey,
                                url: item.referenceAudioUrl!,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                            title="Listen to reference track (Audio only • Sifra chords)"
                          >
                            <Headphones className="w-3.5 h-3.5" />
                            <span>Reference Track</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[var(--text-secondary)] italic px-2">
                            No audio link
                          </span>
                        )}

                        <Link
                          href={songHref}
                          className="px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1 transition-colors"
                        >
                          <Music2 className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                          <span>Chart</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center space-y-2.5 border border-dashed border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-canvas)] p-6">
                <div className="w-10 h-10 mx-auto rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center">
                  <ListMusic className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-[var(--text-primary)]">
                  No Service Lineup Posted Yet
                </h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  {isLeader
                    ? 'Set the lineup from your personal setlists so your worship band members can see the songs, keys, and practice the YouTube reference tracks at home.'
                    : 'Your worship leader hasn’t set the service lineup for this week yet. Check back soon!'}
                </p>
                {isLeader ? (
                  <Link
                    href="/setlists"
                    className="py-2 px-4 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Select Setlist to Publish</span>
                  </Link>
                ) : (
                  <Link
                    href="/setlists"
                    className="py-2 px-4 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500 hover:text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Suggest a Setlist from Your Library</span>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Shared Team Rehearsal Takes */}
          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-[var(--brand-accent)]" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">Shared Team Rehearsal Takes</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="py-1.5 px-3 rounded-xl bg-[var(--brand-accent)] text-black text-xs font-bold hover:brightness-110 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Share New Take</span>
              </button>
            </div>

            {/* Shared Takes List */}
            {sharedTakes.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center">
                  <Mic className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-[var(--text-primary)]">No Rehearsal Takes Shared Yet</h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  Leaders and musicians can upload practice recordings or stems so everyone in the team can rehearse their instruments with the exact take.
                </p>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="py-2 px-4 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--brand-surface)] inline-flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                  <span>Upload or Share First Take</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {sharedTakes.map((take) => {
                  const practiceTake = teamTakeToPracticeTake(take, currentTeam?.churchName);
                  const canDelete = isLeader || Boolean(user && take.authorId === user.id);

                  return (
                    <PracticeWaveformPlayer
                      key={take.id}
                      take={practiceTake}
                      onDelete={canDelete ? () => handleDeleteTake(take.id) : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QR Code Modal for In-Person Practice */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-3xl border border-[var(--border-subtle)] bg-[#101014] p-6 text-center space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Scan to Join {currentTeam.name}</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Ask musicians to open their phone camera and point at this screen.
            </p>
            {qrDataUrl && (
              <div className="p-4 bg-white rounded-2xl w-fit mx-auto shadow-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Team QR Code" className="w-48 h-48 mx-auto" />
              </div>
            )}
            <div className="font-mono text-sm font-black text-[var(--brand-accent)] tracking-widest">
              CODE: {currentTeam.inviteCode}
            </div>
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Share / Upload Take Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[#101014] p-6 sm:p-7 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Share Rehearsal Take with Team</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Add audio links (Google Drive, Dropbox, or public audio URLs) so your whole band can practice before Sunday.
            </p>

            <form onSubmit={handleSaveSharedTake} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Song Title <span className="text-[var(--brand-accent)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={uploadSongTitle}
                  onChange={(e) => setUploadSongTitle(e.target.value)}
                  placeholder="e.g. Goodness of God"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Take Description / Version <span className="text-[var(--brand-accent)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={uploadTakeTitle}
                  onChange={(e) => setUploadTakeTitle(e.target.value)}
                  placeholder="e.g. Full Band Rehearsal Run 1, Vocal Harmony Guide"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Audio URL (Google Drive, Dropbox, or Direct Link)
                </label>
                <input
                  type="url"
                  value={uploadAudioUrl}
                  onChange={(e) => setUploadAudioUrl(e.target.value)}
                  placeholder="e.g. https://drive.google.com/file/d/.../view"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Instrument / Stem Tag
                </label>
                <input
                  type="text"
                  value={uploadInstrument}
                  onChange={(e) => setUploadInstrument(e.target.value)}
                  placeholder="e.g. Full Band, Acoustic Guitar, Piano Only"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Notes for the Band
                </label>
                <textarea
                  rows={2}
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="e.g. Watch the transition between Bridge 2 and Chorus at 2:15"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)] resize-none"
                />
              </div>

              {takeUploadError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{takeUploadError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-2 rounded-xl text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingTake}
                  className="px-4 py-2 rounded-xl bg-[var(--brand-accent)] text-black text-xs font-bold hover:brightness-110 active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  {isUploadingTake ? 'Saving...' : 'Share with Band'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Church Branding Customization Modal (Leader Only) */}
      {showBrandingModal && currentTeam && isLeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[#101014] p-6 sm:p-7 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-[var(--brand-accent)]" />
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Church Branding &amp; Custom Logo</h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Personalize the app to represent your church or ministry. This title and logo will appear at the very top-left of Worshipy for all members of <span className="text-[var(--text-primary)] font-semibold">{currentTeam.name}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBrandingModal(false)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Live Top-Left Navbar Preview Mockup */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block">
                Live Navbar Preview (Top-Left Corner)
              </span>
              <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-3 shadow-inner">
                {brandingLogoUrl ? (
                  <img
                    src={brandingLogoUrl}
                    alt="Logo preview"
                    className="w-10 h-10 rounded-xl object-contain bg-white/5 border border-[var(--border-subtle)] p-1 shrink-0 shadow-sm"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shrink-0 shadow-sm">
                    <Music2 className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-sm sm:text-base text-[var(--text-primary)] block leading-tight truncate">
                    {brandingTitleInput.trim() || currentTeam.churchName || currentTeam.name || 'Worship Music'}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] block truncate">
                    {brandingChurchInput.trim() || currentTeam.churchName || 'Worship Team'}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveBranding} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Custom App Main Title
                </label>
                <input
                  type="text"
                  value={brandingTitleInput}
                  onChange={(e) => setBrandingTitleInput(e.target.value)}
                  placeholder="e.g. Grace City Worship, Elevate Music, Central Band"
                  maxLength={100}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                />
                <span className="text-[10px] text-[var(--text-secondary)] block mt-1">
                  Replaces the default &quot;Worship Music&quot; title on the top left.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Church / Ministry Name
                </label>
                <input
                  type="text"
                  value={brandingChurchInput}
                  onChange={(e) => setBrandingChurchInput(e.target.value)}
                  placeholder="e.g. Grace City Church"
                  maxLength={120}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              {/* Logo / Profile Image Upload & URL */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Church Logo or Ministry Profile Image
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="p-3 rounded-xl border border-dashed border-[var(--border-strong)] hover:border-[var(--brand-accent)] bg-[var(--bg-surface)] flex flex-col items-center justify-center text-center cursor-pointer transition-colors group">
                    <Upload className="w-5 h-5 text-[var(--text-secondary)] group-hover:text-[var(--brand-accent)] mb-1" />
                    <span className="text-xs font-semibold text-[var(--text-primary)]">Upload Image File</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">PNG, JPG, SVG, WebP (auto-scaled)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="space-y-1">
                    <input
                      type="url"
                      value={brandingLogoUrl.startsWith('data:') ? '' : brandingLogoUrl}
                      onChange={(e) => setBrandingLogoUrl(e.target.value)}
                      placeholder="Or paste image URL (https://...)"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                    />
                    {brandingLogoUrl && (
                      <button
                        type="button"
                        onClick={() => setBrandingLogoUrl('')}
                        className="text-[10px] text-rose-400 hover:underline cursor-pointer block"
                      >
                        Remove current logo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {brandingError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{brandingError}</span>
                  </div>
                  {brandingError.toLowerCase().includes('firebase security rules') && (
                    <div className="pt-1.5 border-t border-rose-500/20 text-[11px] text-rose-200 leading-relaxed">
                      Your logo is saved locally on this device. To allow all band members on other phones and computers to see your church logo, publish the updated security rules in your Firebase Console.
                    </div>
                  )}
                </div>
              )}

              {brandingSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Church branding updated successfully!</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={handleResetBranding}
                  disabled={isSavingBranding}
                  className="px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50"
                >
                  Reset to Default
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBrandingModal(false)}
                    className="px-3 py-2 rounded-xl text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBranding}
                    className="px-4 py-2 rounded-xl bg-[var(--brand-accent)] text-black text-xs font-bold hover:brightness-110 active:scale-98 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                  >
                    {isSavingBranding ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Branding</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Active Reference Audio Modal */}
      {activeRefAudio && (
        <SetlistReferenceAudioModal
          isOpen={true}
          onClose={() => setActiveRefAudio(null)}
          songTitle={activeRefAudio.songTitle}
          songKey={activeRefAudio.songKey}
          initialUrl={activeRefAudio.url}
          onSaveUrl={() => {
            setActiveRefAudio(null);
          }}
        />
      )}
    </div>
  );
}
