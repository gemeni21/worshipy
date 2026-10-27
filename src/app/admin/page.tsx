'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Check,
  X,
  Eye,
  Clock,
  User,
  Church,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { playGuitarChord } from '@/lib/audio/soundEngine';
import type { SongSubmission, SubmissionStatus } from '@/types/auth';

export default function AdminPage() {
  const {
    user,
    isAdmin,
    isAuthLoading,
    submissions,
    reviewSubmission,
    removeSongGlobally,
    restoreSongGlobally,
    refreshSubmissions,
  } = useAuth();
  const { refreshGlobalSongs } = useApp();
  const [activeTab, setActiveTab] = useState<SubmissionStatus>('pending');
  const [selectedSubmission, setSelectedSubmission] = useState<SongSubmission | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Review action modal state
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Remove song modal state
  const [songToRemove, setSongToRemove] = useState<SongSubmission | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-[var(--brand-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-[var(--text-secondary)]">Loading administration portal...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Admin Access Required</h1>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          The Song Curation Portal is restricted to verified administrators to ensure reverence and chord accuracy across
          the global catalog.
        </p>
        <button
          type="button"
          onClick={() => setShowAuthModal(true)}
          className="w-full py-2.5 px-4 rounded-xl bg-[var(--brand-accent)] text-black text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
        >
          Sign in as Admin
        </button>

        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    );
  }

  const filteredSubmissions = submissions.filter((s) => s.status === activeTab);
  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const approvedCount = submissions.filter((s) => s.status === 'approved').length;
  const rejectedCount = submissions.filter((s) => s.status === 'rejected').length;
  const removedCount = submissions.filter((s) => s.status === 'removed').length;

  const handleOpenReviewAction = (submission: SongSubmission, action: 'approved' | 'rejected') => {
    setSelectedSubmission(submission);
    setReviewAction(action);
    setAdminNoteInput('');
  };

  const handleConfirmReview = async () => {
    if (!selectedSubmission || !reviewAction) return;
    setIsProcessing(true);
    try {
      await reviewSubmission(selectedSubmission.id, reviewAction, adminNoteInput);
      setReviewAction(null);
      setSelectedSubmission(null);
      await refreshSubmissions();
      await refreshGlobalSongs();
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!songToRemove) return;
    setIsRemoving(true);
    try {
      await removeSongGlobally(songToRemove.song.id, removeReason);
      setSongToRemove(null);
      setRemoveReason('');
      if (selectedSubmission?.id === songToRemove.id) {
        setSelectedSubmission(null);
      }
      await refreshSubmissions();
      await refreshGlobalSongs();
    } catch (err) {
      console.error('Failed to remove song globally:', err);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRestoreGlobal = async (sub: SongSubmission) => {
    setIsProcessing(true);
    try {
      await restoreSongGlobally(sub.song.id);
      await refreshSubmissions();
      await refreshGlobalSongs();
    } catch (err) {
      console.error('Failed to restore song globally:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Admin Portal
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              Alerts: gray2187@gmail.com
            </span>
            <span className="text-xs text-[var(--text-secondary)]">Worshipy Editorial Board</span>
          </div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">Global Song Curation</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Review user-submitted chord charts, verify chord voicing accuracy, and publish to the global catalog.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/my-songs"
            className="px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            My Custom Songs
          </Link>
          <Link
            href="/songs"
            className="px-3 py-2 rounded-xl bg-[var(--brand-accent)] text-black text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
          >
            View Public Catalog
          </Link>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-[var(--bg-surface)] text-amber-300 shadow-sm border border-amber-500/30'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>Pending Review</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/30 text-amber-200">
            {pendingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('approved')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'approved'
              ? 'bg-[var(--bg-surface)] text-emerald-300 shadow-sm border border-emerald-500/30'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>Approved Global</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/30 text-emerald-200">
            {approvedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rejected')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'rejected'
              ? 'bg-[var(--bg-surface)] text-rose-300 shadow-sm border border-rose-500/30'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>Revision Requests</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/30 text-rose-200">
            {rejectedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('removed')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'removed'
              ? 'bg-[var(--bg-surface)] text-slate-300 shadow-sm border border-slate-500/30'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>Removed Globally</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-500/30 text-slate-200">
            {removedCount}
          </span>
        </button>
      </div>

      {/* Submissions List */}
      {filteredSubmissions.length === 0 ? (
        <div className="py-16 text-center rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2">
          <CheckCircle2 className="w-10 h-10 text-[var(--brand-accent)] mx-auto opacity-70" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            No {activeTab} submissions at the moment.
          </h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            {activeTab === 'pending'
              ? 'All user-submitted songs have been reviewed. New submissions from worship leaders will appear here.'
              : activeTab === 'removed'
              ? 'No songs have been removed from the global catalog.'
              : `No songs currently in ${activeTab} status.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSubmissions.map((sub) => (
            <div
              key={sub.id}
              className="p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">{sub.song.title}</h3>
                    <p className="text-xs text-[var(--text-secondary)]">{sub.song.artist || 'Unknown Artist'}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--brand-accent)]">
                    Key of {sub.song.originalKey}
                  </span>
                </div>

                {/* Submitter Info */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)] py-2 border-y border-[var(--border-subtle)] my-3">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                    <span>{sub.submittedBy.displayName}</span>
                  </div>
                  {sub.submittedBy.churchName && (
                    <div className="flex items-center gap-1.5">
                      <Church className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{sub.submittedBy.churchName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto text-[11px]">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(sub.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Submitter Notes */}
                {sub.submissionNotes && (
                  <div className="p-2.5 rounded-xl bg-[var(--bg-subtle)] text-[11px] text-[var(--text-primary)] mb-3">
                    <strong className="text-[var(--text-secondary)] block text-[10px] uppercase tracking-wide">
                      Author&apos;s Notes:
                    </strong>
                    {sub.submissionNotes}
                  </div>
                )}

                {/* Admin Notes if any */}
                {sub.adminNotes && (
                  <div
                    className={`p-2.5 rounded-xl border text-[11px] mb-3 ${
                      sub.status === 'removed'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    }`}
                  >
                    <strong
                      className={`block text-[10px] uppercase tracking-wide ${
                        sub.status === 'removed' ? 'text-rose-400' : 'text-amber-400'
                      }`}
                    >
                      {sub.status === 'removed' ? 'Reason for Removal:' : 'Admin Review Note:'}
                    </strong>
                    {sub.adminNotes}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(sub)}
                  className="px-3 py-2 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                  <span>Preview Chart ({sub.song.sections?.length || 0} Sections)</span>
                </button>

                {sub.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenReviewAction(sub, 'rejected')}
                      className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Request Revision</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenReviewAction(sub, 'approved')}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm shadow-emerald-500/20"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve & Publish</span>
                    </button>
                  </div>
                )}

                {sub.status === 'approved' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSongToRemove(sub);
                      setRemoveReason('');
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Globally</span>
                  </button>
                )}

                {sub.status === 'removed' && (
                  <button
                    type="button"
                    onClick={() => handleRestoreGlobal(sub)}
                    disabled={isProcessing}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore to Global</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart Preview Modal */}
      {selectedSubmission && !reviewAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-[var(--border-subtle)] bg-[#101014] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">{selectedSubmission.song.title}</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  {selectedSubmission.song.artist} &bull; Key of {selectedSubmission.song.originalKey}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chart Body */}
            <div className="overflow-y-auto py-4 space-y-6 font-mono text-xs">
              {selectedSubmission.song.sections?.map((section) => (
                <div key={section.id} className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                  <div className="font-bold text-xs uppercase tracking-wider text-[var(--brand-accent)] mb-3 font-sans">
                    {section.label}
                  </div>
                  <div className="space-y-2">
                    {section.lines?.map((line, lIdx) => (
                      <div key={lIdx} className="space-y-1">
                        <div className="flex flex-wrap gap-x-4 text-emerald-400 font-bold">
                          {line.segments?.map((seg, sIdx) =>
                            seg.chord ? (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => playGuitarChord(seg.chord!)}
                                title="Click to hear chord voicing"
                                className="hover:underline flex items-center gap-1 cursor-pointer bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px]"
                              >
                                <span>{seg.chord}</span>
                                <Volume2 className="w-2.5 h-2.5 opacity-60" />
                              </button>
                            ) : null
                          )}
                        </div>
                        <div className="text-[var(--text-primary)]">
                          {line.segments?.map((seg) => seg.text).join('')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">
                Submitted by: {selectedSubmission.submittedBy.displayName}
              </span>
              <div className="flex items-center gap-2">
                {selectedSubmission.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setReviewAction('rejected')}
                      className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold"
                    >
                      Request Revision
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewAction('approved')}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold"
                    >
                      Approve & Publish
                    </button>
                  </>
                )}

                {selectedSubmission.status === 'approved' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSongToRemove(selectedSubmission);
                      setRemoveReason('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Globally</span>
                  </button>
                )}

                {selectedSubmission.status === 'removed' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleRestoreGlobal(selectedSubmission);
                      setSelectedSubmission(null);
                    }}
                    disabled={isProcessing}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore to Global</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Confirmation / Feedback Modal */}
      {selectedSubmission && reviewAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[#101014] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              {reviewAction === 'approved' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Confirm Global Publication</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                  <span>Request Revision / Deny Submission</span>
                </>
              )}
            </h3>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {reviewAction === 'approved'
                ? `This will publish "${selectedSubmission.song.title}" to the global catalog for all Worshipy users worldwide.`
                : `Please provide helpful feedback so the author can improve chords or lyrics before resubmitting.`}
            </p>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {reviewAction === 'approved' ? 'Optional Praise / Approval Note' : 'Feedback for the Author'}
              </label>
              <textarea
                rows={3}
                value={adminNoteInput}
                onChange={(e) => setAdminNoteInput(e.target.value)}
                placeholder={
                  reviewAction === 'approved'
                    ? 'e.g. Excellent arrangement! Verified chord accuracy.'
                    : 'e.g. Please check the bridge chords—the second line seems to resolve to D instead of Bm.'
                }
                className="w-full p-3 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setReviewAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmReview}
                disabled={isProcessing}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  reviewAction === 'approved'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                    : 'bg-rose-500 hover:bg-rose-400 text-white'
                }`}
              >
                {isProcessing
                  ? 'Processing...'
                  : reviewAction === 'approved'
                  ? 'Publish Globally'
                  : 'Send Revision Request'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Remove Song Globally Confirmation Modal */}
      {songToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-rose-500/30 bg-[#101014] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              <span>Remove Song Globally</span>
            </h3>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This will immediately remove <strong className="text-[var(--text-primary)]">&ldquo;{songToRemove.song.title}&rdquo;</strong> ({songToRemove.song.artist || 'Unknown Artist'}) from the global catalog for all Worshipy users worldwide.
            </p>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Author Local Copy Preserved</span>
              </div>
              <p className="opacity-90 leading-normal">
                The author ({songToRemove.submittedBy.displayName}) will retain their local draft on their device in &ldquo;My Songs&rdquo;, updated with your removal reason.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Reason for Removal (Required for audit log & author feedback)
              </label>
              <textarea
                rows={3}
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                placeholder="e.g. Inappropriate content, copyright concern, or chord inaccuracy."
                className="w-full p-3 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-rose-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setSongToRemove(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-rose-600/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isRemoving ? 'Removing...' : 'Confirm Global Removal'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
