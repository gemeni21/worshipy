import React from 'react';
import Link from 'next/link';
import { BookOpen, Compass, Gauge, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-5 my-8 max-w-xl mx-auto">
      <div className="w-12 h-12 rounded-2xl bg-[var(--brand-surface)] text-[var(--brand-accent)] flex items-center justify-center mx-auto">
        <Compass className="w-6 h-6" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Page Not Found</h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)]">
          The page or chord chart you requested could not be found. Choose a
          destination below to get back to your music.
        </p>
      </div>
      <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--brand-accent)] text-[var(--bg-surface)] font-semibold text-sm hover:opacity-95 transition-opacity"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          <span>Go Home</span>
        </Link>
        <Link
          href="/songs"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--text-primary)] font-semibold text-sm hover:border-[var(--brand-accent)] transition-colors"
        >
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          <span>Browse Songs</span>
        </Link>
        <Link
          href="/tuner"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--text-primary)] font-semibold text-sm hover:border-[var(--brand-accent)] transition-colors"
        >
          <Gauge className="w-4 h-4" aria-hidden="true" />
          <span>Open Tuner</span>
        </Link>
      </div>
    </div>
  );
}
