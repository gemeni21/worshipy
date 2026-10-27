'use client';

import React, { useState } from 'react';
import {
  X,
  Globe,
  Check,
  AlertCircle,
  Loader2,
  Send,
  HelpCircle,
} from 'lucide-react';
import type { SongRecord } from '@/types/song';
import { useAuth } from '@/context/AuthContext';

interface SubmitGlobalSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: SongRecord | null;
  onSubmitted?: () => void;
}

export function SubmitGlobalSongModal({
  isOpen,
  onClose,
  song,
  onSubmitted,
}: SubmitGlobalSongModalProps) {
  const { user, submitSongForGlobal } = useAuth();
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen || !song) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Please sign in or create a profile to submit songs.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await submitSongForGlobal(song, submissionNotes);
      setIsSuccess(true);
      if (onSubmitted) onSubmitted();
      setTimeout(() => {
        setIsSuccess(false);
        setSubmissionNotes('');
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[#101014] p-6 sm:p-8 shadow-2xl shadow-black/90">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center animate-bounce">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">Submitted for Admin Review!</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
              Your chord chart for <strong className="text-[var(--text-primary)]">&ldquo;{song.title}&rdquo;</strong> has been
              delivered to the curation team. You will be notified once reviewed.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--brand-accent)]/20 border border-[var(--brand-accent)]/40 text-[var(--brand-accent)] flex items-center justify-center">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Submit to Global Catalog</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Make your chart available to worship teams worldwide
                </p>
              </div>
            </div>

            {/* Song Preview Card */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] mb-5 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-[var(--text-primary)]">{song.title}</div>
                  <div className="text-[var(--text-secondary)]">{song.artist || 'Unknown Artist'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-bold text-[var(--brand-accent)]">
                    Key of {song.originalKey}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                    {song.sections?.length || 0} Sections
                  </span>
                </div>
              </div>
            </div>

            {/* Editorial Standard Guidance */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200/90 mb-5 flex items-start gap-2.5">
              <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>Quality & Reverence Standard:</strong> All global songs are vetted by our admin team for chord
                accuracy and clean section structure. You will always keep this song in your private library regardless
                of global review status.
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submission Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Contributor Credit & Affiliation
                </label>
                <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]">
                  {user?.displayName || 'Anonymous'} {user?.churchName ? `(${user.churchName})` : ''}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Notes for the Admin Reviewer (Optional)
                </label>
                <textarea
                  rows={3}
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  placeholder="e.g. Transcribed directly from the acoustic live album version. Capo 2 recommended for female lead."
                  className="w-full p-3 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[var(--brand-accent)] text-black text-xs font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit for Review</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
