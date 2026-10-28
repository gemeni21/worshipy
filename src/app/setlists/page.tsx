'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Church,
  Clock,
  Download,
  Edit3,
  Headphones,
  Info,
  ListMusic,
  Loader2,
  Plus,
  Radio,
  Send,
  Lightbulb,
  Calendar,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { SetlistDragReorderList } from '@/components/setlists/SetlistDragReorderList';
import { transposeKey } from '@/lib/music/transposition';
import {
  proposeTeamSetlist,
  reviewTeamSetlistSuggestion,
  deleteTeamSetlistSuggestion,
} from '@/lib/team/teamService';
import type { SongRecord, PersonalSetlist, SetlistItem } from '@/types/song';

export default function SetlistsPage() {
  const {
    allAvailableSongs,
    getSongByIdOrSlug,
    setlists,
    createSetlist,
    deleteSetlist,
    renameSetlist,
    addSongToSetlist,
    removeSongFromSetlist,
    updateSetlistItems,
    updateSetlistItem,
    isSongSavedOffline,
    saveBatchSongsOffline,
  } = useApp();

  const {
    user,
    activeGroup,
    publishActiveSetlistToTeam,
    clearActiveTeamSetlist,
    refreshActiveGroup,
  } = useAuth();

  const memberRecord = activeGroup?.members?.find((m) => m.userId === user?.id);
  const isExplicitMember = user?.groupRole === 'member' || memberRecord?.role === 'member';

  const isTeamLeader = Boolean(
    user &&
      activeGroup &&
      !isExplicitMember &&
      (activeGroup.ownerId === user.id ||
        user.groupRole === 'leader' ||
        memberRecord?.role === 'leader' ||
        (user.role === 'admin' && !user.groupRole))
  );

  const pendingGroupSuggestions = useMemo(() => {
    return (activeGroup?.suggestedSetlists || []).filter((s) => s.status === 'pending');
  }, [activeGroup?.suggestedSetlists]);

  const userPendingSuggestion = useMemo(() => {
    if (!user?.id) return null;
    return (activeGroup?.suggestedSetlists || []).find(
      (s) => s.status === 'pending' && s.suggestedBy === user.id
    );
  }, [activeGroup?.suggestedSetlists, user?.id]);

  const userSuggestions = useMemo(() => {
    if (!user?.id) return [];
    return (activeGroup?.suggestedSetlists || []).filter(
      (s) => s.suggestedBy === user.id
    );
  }, [activeGroup?.suggestedSetlists, user?.id]);

  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);
  const [reviewingSuggestionId, setReviewingSuggestionId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');
  const [isReviewingAction, setIsReviewingAction] = useState(false);

  const handleReviewSuggestion = async (
    suggestionId: string,
    action: 'approve' | 'decline'
  ) => {
    if (!activeGroup?.id) return;
    setIsReviewingAction(true);
    try {
      const res = await reviewTeamSetlistSuggestion(
        activeGroup.id,
        suggestionId,
        action,
        action === 'decline' ? declineNote : undefined
      );
      if (res.ok) {
        await refreshActiveGroup();
        setStatusMessage(
          action === 'approve'
            ? 'Approved lineup suggestion! It is now published as the official team lineup in Worship Team Hub.'
            : 'Lineup suggestion declined with feedback.'
        );
        setReviewingSuggestionId(null);
        setDeclineNote('');
      } else {
        setStatusMessage(res.error || 'Failed to review suggestion.');
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Error reviewing suggestion');
    } finally {
      setIsReviewingAction(false);
    }
  };

  const allSongs = allAvailableSongs;

  const [newSetlistName, setNewSetlistName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedSongBySetlist, setSelectedSongBySetlist] = useState<
    Record<string, string>
  >({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingSetlistId, setSavingSetlistId] = useState<string | null>(null);
  const [proposeModalSetlist, setProposeModalSetlist] = useState<PersonalSetlist | null>(null);
  const [targetServiceDate, setTargetServiceDate] = useState('Sunday Morning Service');
  const [proposalNote, setProposalNote] = useState('');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const handleSaveSetlistOffline = async (
    setlistId: string,
    setlistName: string,
    songs: SongRecord[]
  ) => {
    if (songs.length === 0) return;
    setSavingSetlistId(setlistId);
    try {
      const res = await saveBatchSongsOffline(songs);
      if (res.ok) {
        setStatusMessage(
          `Saved all ${songs.length} song${songs.length === 1 ? '' : 's'} from "${setlistName}" for offline use.`
        );
      } else {
        setStatusMessage(res.error || 'Could not save songs offline.');
      }
    } finally {
      setSavingSetlistId(null);
    }
  };

  const handleCreateSetlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetlistName.trim()) return;
    const created = createSetlist(newSetlistName);
    setNewSetlistName('');
    if (created) {
      setStatusMessage(`Created setlist "${created.name}".`);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      renameSetlist(id, editingName);
      setStatusMessage(`Renamed setlist to "${editingName.trim()}".`);
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleAddSong = (setlistId: string, setlistName: string) => {
    const targetSetlist = setlists.find((s) => s.id === setlistId);
    const existingIds = new Set(
      (targetSetlist?.items ?? []).map((i) => i.songId)
    );
    const firstUnaddedSong =
      allSongs.find((s) => !existingIds.has(s.id)) ?? allSongs[0];
    const chosenId =
      selectedSongBySetlist[setlistId] || firstUnaddedSong?.id || '';
    if (!chosenId) return;

    const chosenSong = getSongByIdOrSlug(chosenId);
    const res = addSongToSetlist(setlistId, chosenId);
    if (res.alreadyInSetlist) {
      setStatusMessage(
        `"${chosenSong?.title ?? chosenId}" is already in "${setlistName}".`
      );
    } else {
      setStatusMessage(
        `Added "${chosenSong?.title ?? chosenId}" to "${setlistName}".`
      );
      // Advance picker to the next song not yet in the setlist
      const nextUnadded = allSongs.find(
        (s) => s.id !== chosenId && !existingIds.has(s.id)
      );
      if (nextUnadded) {
        setSelectedSongBySetlist((prev) => ({
          ...prev,
          [setlistId]: nextUnadded.id,
        }));
      }
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          My Personal Setlists
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Organize and reorder songs for personal practice or service
          preparation.
        </p>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-xs sm:text-sm text-[var(--text-secondary)] flex items-start gap-2.5">
          <Info
            className="w-4 h-4 text-[var(--brand-accent)] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>
            <strong className="text-[var(--text-primary)]">
              Personal & Device-Local:
            </strong>{' '}
            Setlists created here are stored locally on this device for your own
            practice and performance. Team sharing and cloud sync are not part
            of this MVP.
          </span>
        </div>
      </header>

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl bg-[var(--brand-surface)] border border-[var(--brand-accent)]/30 text-[var(--brand-accent)] px-4 py-3 text-sm font-medium flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Team Lineup Suggestions Section for Leader and Members */}
      {activeGroup && (
        isTeamLeader ? (
          pendingGroupSuggestions.length > 0 ? (
            <section
              aria-label="Pending lineup suggestions from team"
              className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-4 shadow-sm animate-in fade-in"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-[var(--text-primary)]">
                        Pending Lineup Suggestions from Team
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black shadow-xs">
                        {pendingGroupSuggestions.length} PENDING REVIEW
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Vocalists and worship leaders have proposed service lineups for your approval
                    </p>
                  </div>
                </div>
                <Link
                  href="/team"
                  className="text-xs font-semibold text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Worship Team Hub</span>
                  <Church className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="space-y-3.5">
                {pendingGroupSuggestions.map((sug) => {
                  const isExpanded = expandedSuggestionId === sug.id;
                  const isReviewingThis = reviewingSuggestionId === sug.id;
                  const isOwnSuggestion = sug.suggestedBy === user?.id;

                  return (
                    <div
                      key={sug.id}
                      className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-amber-500/25 space-y-3.5 shadow-xs"
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
                          className="py-1.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <span>{isExpanded ? 'Hide Songs' : 'Preview Songs'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Leaders approve/decline if NOT own suggestion */}
                          {!isOwnSuggestion && sug.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isReviewingAction}
                                onClick={() => handleReviewSuggestion(sug.id, 'approve')}
                                className="py-1.5 px-3.5 rounded-xl bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve & Set as Team Lineup</span>
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

                          {/* Submitter viewing own suggestion */}
                          {isOwnSuggestion && (
                            <>
                              {sug.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await deleteTeamSetlistSuggestion(activeGroup.id, sug.id);
                                    if (res.ok) {
                                      await refreshActiveGroup();
                                      setStatusMessage('Withdrew lineup proposal.');
                                    }
                                  }}
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
                            Reason or feedback for {sug.suggestedByName} (optional):
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={declineNote}
                              onChange={(e) => setDeclineNote(e.target.value)}
                              placeholder="e.g. Let's do this next week instead."
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

                      {/* Expanded Songs Preview */}
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
                                className="p-2.5 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span className="w-5 h-5 rounded-full font-mono text-[10px] font-bold bg-[var(--bg-surface)] text-[var(--brand-accent)] flex items-center justify-center shrink-0">
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
            </section>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-secondary)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong className="text-[var(--text-primary)]">Team Lineup Suggestions:</strong> 0 pending proposals. Band members can suggest lineups from their setlists for your review.
                </span>
              </div>
              <Link
                href="/team"
                className="text-[11px] font-bold text-amber-400 hover:underline shrink-0"
              >
                Team Hub →
              </Link>
            </div>
          )
        ) : (
          /* Member View: Shows their suggestions with status "For Approval" or "Approved" */
          userSuggestions.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Lightbulb className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm text-[var(--text-primary)]">
                      Your Lineup Suggestions ({userSuggestions.length})
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Track the approval status of setlists you proposed to {activeGroup.name}
                    </p>
                  </div>
                </div>
                <Link
                  href="/team"
                  className="text-xs font-semibold text-amber-300 hover:underline flex items-center gap-1"
                >
                  <span>Team Hub</span>
                  <Church className="w-3 h-3" />
                </Link>
              </div>

              <div className="space-y-2.5">
                {userSuggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-amber-500/25 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[var(--text-primary)] truncate">
                          {sug.setlist.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
                          {sug.setlist.items.length}{' '}
                          {sug.setlist.items.length === 1 ? 'song' : 'songs'}
                        </span>
                        {sug.targetServiceDate && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            {sug.targetServiceDate}
                          </span>
                        )}
                      </div>
                      {sug.note && (
                        <p className="text-[11px] text-[var(--text-secondary)] italic mt-1">
                          &ldquo;{sug.note}&rdquo;
                        </p>
                      )}
                      {sug.reviewNote && (
                        <p className="text-[11px] text-amber-300 mt-1">
                          Leader note: &ldquo;{sug.reviewNote}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {sug.status === 'pending' && (
                        <>
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                            <Lightbulb className="w-3 h-3 text-amber-400" />
                            <span>For Approval</span>
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await deleteTeamSetlistSuggestion(activeGroup.id, sug.id);
                              if (res.ok) {
                                await refreshActiveGroup();
                                setStatusMessage('Withdrew lineup proposal.');
                              }
                            }}
                            className="py-1 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-rose-400 text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                          >
                            Withdraw
                          </button>
                        </>
                      )}
                      {sug.status === 'approved' && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Approved</span>
                        </span>
                      )}
                      {sug.status === 'declined' && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                          <X className="w-3 h-3 text-rose-400" />
                          <span>Declined</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )
      )}

      {/* Create New Setlist Form */}
      <section
        aria-label="Create a new personal setlist"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3"
      >
        <h2 className="text-base font-bold">Create a New Setlist</h2>
        <form
          onSubmit={handleCreateSetlist}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <label htmlFor="new-setlist-input" className="sr-only">
            Setlist Name
          </label>
          <input
            id="new-setlist-input"
            type="text"
            value={newSetlistName}
            onChange={(e) => setNewSetlistName(e.target.value)}
            placeholder="e.g., Sunday Morning Service, Acoustic Practice..."
            className="flex-1 h-11 px-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm sm:text-base focus:bg-[var(--bg-surface)]"
          />
          <button
            type="submit"
            disabled={!newSetlistName.trim()}
            className="h-11 px-5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 shadow-sm transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Create Setlist</span>
          </button>
        </form>
      </section>

      {/* Setlists List or Empty State */}
      {setlists.length > 0 ? (
        <div className="space-y-6">
          {setlists.map((setlist) => {
            const isEditing = editingId === setlist.id;
            const existingIds = new Set(setlist.items.map((i) => i.songId));
            const firstUnaddedSong =
              allSongs.find((s) => !existingIds.has(s.id)) ?? allSongs[0];
            const currentPickerSongId =
              selectedSongBySetlist[setlist.id] ?? firstUnaddedSong?.id ?? '';

            const setlistSongs = setlist.items
              .map((i) => getSongByIdOrSlug(i.songId))
              .filter((s): s is SongRecord => s !== undefined);
            const offlineCount = setlistSongs.filter((s) =>
              isSongSavedOffline(s.id)
            ).length;
            const allSavedOffline =
              setlistSongs.length > 0 && offlineCount === setlistSongs.length;

            return (
              <section
                key={setlist.id}
                aria-label={`Setlist ${setlist.name}`}
                className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-xs"
              >
                {/* Setlist Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 min-w-[14rem]">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        aria-label="Edit setlist name"
                        className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRename(setlist.id)}
                        className="px-3 h-9 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold cursor-pointer transition-all"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel rename"
                        className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <ListMusic
                        className="w-5 h-5 text-[var(--brand-accent)]"
                        aria-hidden="true"
                      />
                      <div>
                        <h2 className="text-lg font-bold">{setlist.name}</h2>
                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <span>
                            {setlist.items.length}{' '}
                            {setlist.items.length === 1 ? 'song' : 'songs'}
                          </span>
                          {setlistSongs.length > 0 && (
                            <>
                              <span>·</span>
                              {allSavedOffline ? (
                                <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                  <Check className="w-3 h-3" aria-hidden="true" />
                                  <span>Ready Offline</span>
                                </span>
                              ) : (
                                <span>
                                  {offlineCount}/{setlistSongs.length} offline
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {setlistSongs.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSaveSetlistOffline(
                            setlist.id,
                            setlist.name,
                            setlistSongs
                          )
                        }
                        disabled={savingSetlistId === setlist.id}
                        title={
                          allSavedOffline
                            ? 'All songs in this setlist are cached for offline use.'
                            : 'Download all songs in this setlist for offline stage use'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          allSavedOffline
                            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)]'
                        }`}
                      >
                        {savingSetlistId === setlist.id ? (
                          <Loader2
                            className="w-3.5 h-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : allSavedOffline ? (
                          <Check
                            className="w-3.5 h-3.5 text-emerald-500"
                            aria-hidden="true"
                          />
                        ) : (
                          <Download
                            className="w-3.5 h-3.5 text-[var(--brand-accent)]"
                            aria-hidden="true"
                          />
                        )}
                        <span>
                          {savingSetlistId === setlist.id
                            ? 'Saving...'
                            : allSavedOffline
                            ? 'Saved Offline'
                            : 'Save Setlist Offline'}
                        </span>
                      </button>
                    )}

                    {activeGroup && (
                      isTeamLeader ? (
                        activeGroup?.activeSetlist?.id === setlist.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                              <Church className="w-3.5 h-3.5" />
                              <span>Team Lineup Active</span>
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                await clearActiveTeamSetlist();
                                setStatusMessage('Unpublished lineup from team.');
                              }}
                              title="Unpublish this lineup from your worship team"
                              className="px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-rose-400 text-xs font-medium cursor-pointer"
                            >
                              Unpublish
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await publishActiveSetlistToTeam(setlist);
                                  setStatusMessage(
                                    `Published "${setlist.name}" to ${activeGroup?.name || 'your team'}! All members can now view the lineup and practice tracks in the Team Hub.`
                                  );
                                } catch (err) {
                                  setStatusMessage(
                                    err instanceof Error
                                      ? err.message
                                      : 'Failed to publish setlist to team'
                                  );
                                }
                              }}
                              title={`Publish "${setlist.name}" to your worship team so all members can prepare`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--brand-accent)]/30 bg-[var(--brand-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold cursor-pointer transition-all shadow-xs"
                            >
                              <Church className="w-3.5 h-3.5" />
                              <span>Set as Team Lineup</span>
                            </button>

                            {/* Leaders can also suggest/propose for testing or co-leading */}
                            {activeGroup?.suggestedSetlists?.some(
                              (s) => s.setlist.id === setlist.id && s.status === 'pending'
                            ) ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-semibold">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                <span>For Approval</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setProposeModalSetlist(setlist);
                                  setTargetServiceDate('Sunday Morning Service');
                                  setProposalNote('');
                                }}
                                disabled={setlist.items.length === 0}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-black text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-50"
                                title="Suggest this setlist as a proposal (for testing or co-leading)"
                              >
                                <Lightbulb className="w-3.5 h-3.5" />
                                <span>Suggest Lineup</span>
                              </button>
                            )}
                          </div>
                        )
                      ) : (
                        // Regular worship team member (vocalist / singer / musician)
                        activeGroup?.activeSetlist?.id === setlist.id ||
                        activeGroup?.suggestedSetlists?.some(
                          (s) =>
                            s.setlist.id === setlist.id &&
                            s.suggestedBy === user?.id &&
                            s.status === 'approved'
                        ) ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Approved</span>
                          </span>
                        ) : activeGroup?.suggestedSetlists?.some(
                            (s) =>
                              s.setlist.id === setlist.id &&
                              s.suggestedBy === user?.id &&
                              s.status === 'pending'
                          ) ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-semibold">
                              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                              <span>For Approval</span>
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                const target = activeGroup?.suggestedSetlists?.find(
                                  (s) =>
                                    s.setlist.id === setlist.id &&
                                    s.suggestedBy === user?.id &&
                                    s.status === 'pending'
                                );
                                if (target) {
                                  const res = await deleteTeamSetlistSuggestion(activeGroup.id, target.id);
                                  if (res.ok) {
                                    await refreshActiveGroup();
                                    setStatusMessage('Withdrew lineup proposal.');
                                  }
                                }
                              }}
                              className="px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-rose-400 text-xs font-medium cursor-pointer"
                              title="Cancel this proposal"
                            >
                              Withdraw
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setProposeModalSetlist(setlist);
                              setTargetServiceDate('Sunday Morning Service');
                              setProposalNote('');
                            }}
                            disabled={setlist.items.length === 0}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-black text-xs font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
                            title="Suggest this setlist to your worship leader for upcoming services"
                          >
                            <Lightbulb className="w-3.5 h-3.5" />
                            <span>Suggest to Team</span>
                          </button>
                        )
                      )
                    )}

                    {setlist.items.length > 0 && (
                      <Link
                        href={`/live?startSetlist=${encodeURIComponent(
                          setlist.id
                        )}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 text-xs font-semibold hover:opacity-95"
                      >
                        <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Start Live Sync</span>
                      </Link>
                    )}

                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() =>
                          handleStartRename(setlist.id, setlist.name)
                        }
                        aria-label={`Rename ${setlist.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-medium hover:border-[var(--border-strong)] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Rename</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete setlist "${setlist.name}" from this device?`
                          )
                        ) {
                          deleteSetlist(setlist.id);
                        }
                      }}
                      aria-label={`Delete ${setlist.name}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Setlist Song Items with Drag-to-Reorder */}
                {setlist.items.length > 0 ? (
                  <SetlistDragReorderList
                    setlistId={setlist.id}
                    setlistName={setlist.name}
                    items={setlist.items}
                    onReorder={(newItems) =>
                      updateSetlistItems(setlist.id, newItems)
                    }
                    onRemove={(index) =>
                      removeSongFromSetlist(setlist.id, index)
                    }
                    onUpdateItem={(index, updates) =>
                      updateSetlistItem(setlist.id, index, updates)
                    }
                    getSongByIdOrSlug={getSongByIdOrSlug}
                    isSongSavedOffline={isSongSavedOffline}
                  />
                ) : (
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] italic py-2">
                    This setlist has no songs yet. Add a song below or from any
                    song&apos;s detail page.
                  </p>
                )}

                {/* Quick Add Song to this Setlist */}
                <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <label
                    htmlFor={`add-song-select-${setlist.id}`}
                    className="text-xs font-medium text-[var(--text-secondary)] shrink-0"
                  >
                    Add Song:
                  </label>
                  <select
                    id={`add-song-select-${setlist.id}`}
                    value={currentPickerSongId}
                    onChange={(e) =>
                      setSelectedSongBySetlist((prev) => ({
                        ...prev,
                        [setlist.id]: e.target.value,
                      }))
                    }
                    className="flex-1 h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 text-sm cursor-pointer"
                  >
                    {allSongs.map((song) => {
                      const inList = existingIds.has(song.id);
                      return (
                        <option key={song.id} value={song.id}>
                          {song.title} ({song.originalKey} ·{' '}
                          {song.language.label})
                          {inList ? ' ✓ In Setlist' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleAddSong(setlist.id, setlist.name)}
                    className="h-10 px-4 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 hover:opacity-90 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Add to Setlist</span>
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="theme-card rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center mx-auto">
            <ListMusic className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold">No Personal Setlists Yet</h2>
          <p className="text-sm text-[var(--text-secondary)] mx-auto max-w-md">
            Create a setlist above (such as &ldquo;Sunday Service&rdquo; or
            &ldquo;Practice List&rdquo;) to group and reorder songs for quick
            access.
          </p>
        </div>
      )}
      {/* Member Setlist Suggestion Modal */}
      {proposeModalSetlist && activeGroup && (
        <div
          role="dialog"
          aria-label="Suggest Lineup to Worship Team"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                    Suggest as Team Lineup
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Propose for {activeGroup.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProposeModalSetlist(null)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1.5">
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {proposeModalSetlist.name}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
                <span>
                  {proposeModalSetlist.items.length}{' '}
                  {proposeModalSetlist.items.length === 1 ? 'song' : 'songs'}
                </span>
                <span>•</span>
                <span>Preserves your transpositions & audio links</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Target Service or Event
                </label>
                <input
                  type="text"
                  value={targetServiceDate}
                  onChange={(e) => setTargetServiceDate(e.target.value)}
                  placeholder="e.g. Sunday Morning, Youth Fellowship, Midweek Prayer"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Note for Worship Leader (Optional)
                </label>
                <textarea
                  value={proposalNote}
                  onChange={(e) => setProposalNote(e.target.value)}
                  placeholder="e.g. I transposed Song 2 to D for my vocal range as song leader!"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)] resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProposeModalSetlist(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingProposal}
                onClick={async () => {
                  if (!activeGroup) return;
                  setIsSubmittingProposal(true);
                  try {
                    const cleanItems = proposeModalSetlist.items.map((i: SetlistItem) => ({
                      songId: i.songId,
                      addedAt: i.addedAt,
                      preferredSemitones: i.preferredSemitones,
                      notes: i.notes,
                      referenceAudioUrl: i.referenceAudioUrl,
                    }));
                    const setlistPayload = {
                      id: proposeModalSetlist.id,
                      name: proposeModalSetlist.name,
                      publishedAt: new Date().toISOString(),
                      publishedBy: user?.id || 'member',
                      publishedByName: user?.displayName || 'Musician',
                      items: cleanItems,
                    };
                    const res = await proposeTeamSetlist(
                      activeGroup.id,
                      setlistPayload,
                      proposalNote,
                      targetServiceDate
                    );
                    if (res.ok) {
                      await refreshActiveGroup();
                      setStatusMessage(
                        `Lineup proposal for "${proposeModalSetlist.name}" sent to your worship leader! It will appear in Team Hub once approved.`
                      );
                      setProposeModalSetlist(null);
                    } else {
                      setStatusMessage(res.error || 'Failed to submit proposal.');
                    }
                  } catch (err) {
                    setStatusMessage(
                      err instanceof Error ? err.message : 'Error submitting proposal'
                    );
                  } finally {
                    setIsSubmittingProposal(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmittingProposal ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send to Leader for Approval</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
