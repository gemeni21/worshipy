'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, QrCode, X, ExternalLink, Smartphone } from 'lucide-react';

interface LiveSyncQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionCode: string;
  joinUrl: string;
  sessionTitle?: string;
}

export function LiveSyncQrModal({
  isOpen,
  onClose,
  sessionCode,
  joinUrl,
  sessionTitle = 'Live Worship Session',
}: LiveSyncQrModalProps) {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!isOpen || !joinUrl) return;

    let isCancelled = false;
    QRCode.toString(
      joinUrl,
      {
        type: 'svg',
        margin: 2,
        color: {
          dark: '#0c0c10',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      },
      (err, svg) => {
        if (!isCancelled && !err && svg) {
          setSvgMarkup(svg);
        }
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [isOpen, joinUrl]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyCode = async () => {
    try {
      const desktopBridge = (typeof window !== 'undefined'
        ? (window as unknown as { electronAPI?: { writeClipboardText?: (text: string) => boolean } })
        : undefined);
      if (desktopBridge?.electronAPI?.writeClipboardText) {
        desktopBridge.electronAPI.writeClipboardText(sessionCode);
      } else {
        await navigator.clipboard.writeText(sessionCode);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const copyLink = async () => {
    try {
      const desktopBridge = (typeof window !== 'undefined'
        ? (window as unknown as { electronAPI?: { writeClipboardText?: (text: string) => boolean } })
        : undefined);
      if (desktopBridge?.electronAPI?.writeClipboardText) {
        desktopBridge.electronAPI.writeClipboardText(joinUrl);
      } else {
        await navigator.clipboard.writeText(joinUrl);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 text-center">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 id="qr-modal-title" className="text-sm font-bold text-[var(--text-primary)]">
                Scan to Join Live Sync
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] truncate max-w-[180px]">
                {sessionTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR Code"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code Canvas / SVG Display */}
        <div className="flex flex-col items-center justify-center">
          <div className="p-4 bg-white rounded-2xl shadow-md border border-neutral-200 inline-block">
            {svgMarkup ? (
              <div
                className="w-52 h-52 sm:w-56 sm:h-56 [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <div className="w-52 h-52 flex items-center justify-center text-xs text-neutral-400 font-mono">
                Generating QR code...
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] mt-3">
            <Smartphone className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
            <span>Point iPhone or Android camera at the screen</span>
          </div>
        </div>

        {/* Session Code & Invite Link Actions */}
        <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
            <div className="text-left">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)] block">
                Session Code
              </span>
              <span className="font-mono text-base font-extrabold tracking-widest text-[var(--brand-accent)]">
                {sessionCode}
              </span>
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold transition-all cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={copyLink}
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--brand-surface)] transition-all cursor-pointer"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
            )}
            <span>{copiedLink ? 'Invite Link Copied!' : 'Copy Direct Invite Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
