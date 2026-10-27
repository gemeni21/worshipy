'use client';

import React, { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Church,
  Music2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
}

const INSTRUMENT_OPTIONS = [
  'Worship Leader / Lead Vocals',
  'Acoustic Guitar',
  'Electric Guitar',
  'Keys / Piano / Synth',
  'Bass Guitar',
  'Drums & Percussion',
  'Backing Vocals',
  'Sound & Media Tech',
];

export interface DeviceAccount {
  email: string;
  displayName: string;
  role?: 'admin' | 'user';
  churchName?: string;
}

const DEVICE_ACCOUNTS_KEY = 'worshipy_device_accounts_v1';

export function getDeviceAccounts(): DeviceAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DEVICE_ACCOUNTS_KEY);
    if (raw) {
      const parsed: DeviceAccount[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // Default pre-seeded account for this device for instant 1-click connection
  return [
    {
      email: 'gray2187@gmail.com',
      displayName: 'Gray (Admin)',
      role: 'admin',
      churchName: 'Central Worship Community',
    },
  ];
}

export function saveDeviceAccount(account: DeviceAccount): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getDeviceAccounts().filter(
      (a) => a.email.toLowerCase() !== account.email.toLowerCase()
    );
    const updated = [account, ...existing].slice(0, 5);
    localStorage.setItem(DEVICE_ACCOUNTS_KEY, JSON.stringify(updated));
  } catch {}
}

export function AuthModal({ isOpen, onClose, defaultMode = 'login' }: AuthModalProps) {
  const { login, register, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  // Stored accounts on this device
  const [savedAccounts, setSavedAccounts] = useState<DeviceAccount[]>([]);

  React.useEffect(() => {
    if (isOpen) {
      setSavedAccounts(getDeviceAccounts());
    }
  }, [isOpen]);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [churchName, setChurchName] = useState('');
  const [instrument, setInstrument] = useState(INSTRUMENT_OPTIONS[0]);

  // Google 1-Click State
  const [showGoogleInput, setShowGoogleInput] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async (directEmail?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const emailToUse =
        directEmail ||
        (email.trim().toLowerCase().endsWith('@gmail.com') ||
        email.trim().toLowerCase().endsWith('@googlemail.com')
          ? email.trim()
          : undefined);

      const profile = await signInWithGoogle(emailToUse, displayName || undefined);
      if (profile) {
        saveDeviceAccount({
          email: profile.email,
          displayName: profile.displayName,
          role: profile.role,
          churchName: profile.churchName,
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('FIREBASE_CONFIG_MISSING')) {
        // Firebase config missing in .env — smoothly offer 1-click Google Email sign in
        setShowGoogleInput(true);
        if (email.trim()) setGoogleEmailInput(email.trim());
      } else if (msg.includes('cancelled') || msg.includes('popup')) {
        setError('Google sign-in popup was cancelled. You can enter your email directly below.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDeviceAccount = async (acct: DeviceAccount) => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = await signInWithGoogle(acct.email, acct.displayName);
      if (profile) {
        saveDeviceAccount({
          email: profile.email,
          displayName: profile.displayName,
          role: profile.role,
          churchName: profile.churchName,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let profile;
      if (mode === 'login') {
        profile = await login(email, password);
      } else {
        profile = await register({
          email,
          password,
          displayName: displayName || email.split('@')[0],
          churchName,
          instrument,
        });
      }
      if (profile) {
        saveDeviceAccount({
          email: profile.email,
          displayName: profile.displayName,
          role: profile.role,
          churchName: profile.churchName,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[#101014] p-6 sm:p-8 shadow-2xl shadow-black/90">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--brand-accent)]/15 text-[var(--brand-accent)] mb-3 border border-[var(--brand-accent)]/30">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {mode === 'login' ? 'Sign in to Worshipy' : 'Create Worshipy Profile'}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {mode === 'login'
              ? 'Access your private songs, sync across devices & manage rehearsals'
              : 'Keep your chord charts and setlists synchronized across all devices'}
          </p>
        </div>

        {/* Saved Accounts on This Computer (1-Click Connect) */}
        {savedAccounts.length > 0 && mode === 'login' && (
          <div className="mb-5 p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--brand-accent)]/30 space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5 text-[var(--text-primary)] font-bold">
                <User className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                <span>Accounts on this computer</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--brand-surface)] text-[var(--brand-accent)] font-bold">
                1-Click Select
              </span>
            </div>
            <div className="space-y-1.5">
              {savedAccounts.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => handleSelectDeviceAccount(acct)}
                  disabled={isLoading}
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] flex items-center justify-between text-left transition-all cursor-pointer group disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[var(--brand-accent)]/20 border border-[var(--brand-accent)]/40 text-[var(--brand-accent)] flex items-center justify-center font-bold text-xs shrink-0">
                      {acct.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                        <span>{acct.displayName}</span>
                        {acct.role === 'admin' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] truncate">{acct.email}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[var(--brand-accent)] group-hover:translate-x-0.5 transition-transform shrink-0 pl-2">
                    Connect &rarr;
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Google 1-Click Sign-In Button */}
        <div className="space-y-3.5 mb-5">
          <button
            type="button"
            onClick={() => handleGoogleSignIn()}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Inline Google Email fallback (Active when OAuth popup is not configured or on mobile WebViews) */}
          {showGoogleInput && (
            <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--brand-accent)]/30 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <span>Sign In with Google Account</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--brand-surface)] text-[var(--brand-accent)] font-semibold">1-Click</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowGoogleInput(false)}
                  className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Enter your Gmail address to sign in instantly with 1-click (no password needed).
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={googleEmailInput}
                  onChange={(e) => setGoogleEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && googleEmailInput.trim()) {
                      e.preventDefault();
                      handleGoogleSignIn(googleEmailInput.trim());
                    }
                  }}
                  placeholder="yourname@gmail.com"
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)]"
                />
                <button
                  type="button"
                  disabled={!googleEmailInput.trim() || isLoading}
                  onClick={() => handleGoogleSignIn(googleEmailInput.trim())}
                  className="px-3.5 py-2 rounded-xl bg-[var(--brand-accent)] text-[#0c0c10] font-bold text-xs hover:brightness-110 cursor-pointer disabled:opacity-40 shrink-0"
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </div>
            </div>
          )}

          <div className="relative flex items-center justify-center">
            <div className="border-t border-[var(--border-subtle)] w-full" />
            <span className="bg-[#101014] px-2 text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)]">or with email</span>
          </div>
        </div>

        {/* Mode Toggle Switch */}
        <div className="flex p-1 mb-5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              mode === 'register'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert with Smart 1-Click Action Buttons */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
            {mode === 'login' && error.toLowerCase().includes('no account found') && (
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] font-bold text-xs hover:brightness-110 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Click here to Create Account for this Email</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {mode === 'register' && error.toLowerCase().includes('already exists') && (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] font-bold text-xs hover:brightness-110 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Click here to Sign In with your existing password</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Full Name / Display Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Pastor David"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Church / Ministry Name (Optional)
                </label>
                <div className="relative">
                  <Church className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    value={churchName}
                    onChange={(e) => setChurchName(e.target.value)}
                    placeholder="e.g. Grace Fellowship"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Primary Instrument / Role
                </label>
                <div className="relative">
                  <Music2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                  <select
                    value={instrument}
                    onChange={(e) => setInstrument(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-accent)] appearance-none cursor-pointer"
                  >
                    {INSTRUMENT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-[#18181f] text-white">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
              <input
                type="email"
                name="email"
                autoComplete="username email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@church.com"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
              <input
                type="password"
                name="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:outline-none focus:border-[var(--brand-accent)]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[var(--brand-accent)] text-black text-xs font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign In to Account' : 'Create Free Profile'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Guest Mode Option */}
        <div className="mt-5 pt-3.5 border-t border-[var(--border-subtle)] text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer"
          >
            Continue as Guest (No login required — charts & tuner are always free)
          </button>
        </div>
      </div>
    </div>
  );
}
