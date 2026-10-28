'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Headphones,
  Link2,
  Check,
  Pencil,
  Trash2,
  AlertCircle,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { ReferenceAudioPlayer } from '@/components/audio/ReferenceAudioPlayer';
import { extractYouTubeVideoId, getAudioSourceLabel } from '@/lib/audio/referenceAudio';

interface SetlistReferenceAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  songTitle: string;
  songKey?: string;
  initialUrl?: string;
  onSaveUrl: (newUrl: string | undefined) => void;
}

export function SetlistReferenceAudioModal({
  isOpen,
  onClose,
  songTitle,
  songKey,
  initialUrl = '',
  onSaveUrl,
}: SetlistReferenceAudioModalProps) {
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [isEditing, setIsEditing] = useState(!initialUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    setCurrentUrl(initialUrl);
    setInputUrl(initialUrl);
    setIsEditing(!initialUrl);
    setUrlError(null);
  }, [initialUrl, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setUrlError(null);

    const trimmed = inputUrl.trim();
    if (!trimmed) {
      // Remove URL
      setCurrentUrl('');
      onSaveUrl(undefined);
      setIsEditing(true);
      return;
    }

    // Basic URL validation
    const isYt = extractYouTubeVideoId(trimmed) !== null;
    const isValidHttp = trimmed.startsWith('http://') || trimmed.startsWith('https://');

    if (!isYt && !isValidHttp) {
      setUrlError('Please enter a valid YouTube link or web audio URL (https://...).');
      return;
    }

    setCurrentUrl(trimmed);
    onSaveUrl(trimmed);
    setIsEditing(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleRemove = () => {
    if (window.confirm(`Remove reference audio link for "${songTitle}"?`)) {
      setCurrentUrl('');
      setInputUrl('');
      onSaveUrl(undefined);
      setIsEditing(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ref-audio-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 flex items-center justify-center shrink-0">
              <Headphones className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  id="ref-audio-modal-title"
                  className="font-bold text-base sm:text-lg text-[var(--text-primary)] truncate"
                >
                  {songTitle}
                </h3>
                {songKey && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--brand-accent)]/15 text-[var(--brand-accent)] border border-[var(--brand-accent)]/20">
                    Key of {songKey}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Reference Audio & Rehearsal Player (Audio-only • Zero Storage)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saved Toast */}
        {savedToast && (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Reference track link updated successfully.</span>
          </div>
        )}

        {/* Active Player View */}
        {currentUrl && !isEditing ? (
          <div className="space-y-4">
            <ReferenceAudioPlayer
              url={currentUrl}
              songTitle={songTitle}
            />

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Change Link</span>
              </button>

              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-medium text-rose-500 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Link</span>
              </button>
            </div>
          </div>
        ) : (
          /* Link Input Form View */
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="ref-audio-link-input"
                className="block text-xs font-bold text-[var(--text-primary)]"
              >
                Attach Reference Audio / YouTube Link:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-secondary)]">
                  <Link2 className="w-4 h-4" />
                </div>
                <input
                  id="ref-audio-link-input"
                  type="url"
                  value={inputUrl}
                  onChange={(e) => {
                    setInputUrl(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  placeholder="e.g. https://www.youtube.com/watch?v=... or Google Drive link"
                  className="w-full h-11 pl-9 pr-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]/20 transition-all"
                />
              </div>

              {urlError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-500 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{urlError}</span>
                </div>
              )}
            </div>

            {/* Helper Explanations */}
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)] space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                <Sparkles className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                <span>Audio-Only Playback • Zero Server Storage</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
                <li>
                  <strong className="text-[var(--text-primary)]">YouTube:</strong> Plays audio only with no video clutter. Fully scrubbable waveform.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Google Drive & Dropbox:</strong> Make sure sharing is set to &ldquo;Anyone with link can view&rdquo;.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Rehearsal & Sifra:</strong> Musicians can seek anywhere, slow down playback (0.75x), and loop measures to learn chords.
                </li>
              </ul>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              {currentUrl && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold hover:border-[var(--border-strong)] cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={!inputUrl.trim()}
                className="px-4 py-2 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 shadow-xs cursor-pointer transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Save to Setlist</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
